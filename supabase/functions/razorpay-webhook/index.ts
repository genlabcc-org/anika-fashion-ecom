// supabase/functions/razorpay-webhook/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import crypto from "node:crypto";
import { handleCorsPreflight, corsHeaders } from "../_shared/cors.ts";
import { finalizeOrder } from "../_shared/finalizeOrder.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Constant-time HMAC SHA256 signature verification over raw request body.
 */
function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  try {
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    const encoder = new TextEncoder();
    const a = encoder.encode(signature);
    const b = encoder.encode(expectedSignature);

    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (err) {
    console.error("[razorpay-webhook] Signature comparison error:", err);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  // 1. Handle CORS preflight
  const corsResponse = handleCorsPreflight(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 2. Read RAW body text for exact HMAC verification
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");

    if (!signature) {
      console.warn("[razorpay-webhook] Missing X-Razorpay-Signature header");
      return new Response(
        JSON.stringify({ error: "Missing X-Razorpay-Signature header" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET is not configured");
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured on server" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Verify signature
    const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      console.warn("[razorpay-webhook] Signature verification failed");
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Parse JSON payload
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseErr) {
      console.error("[razorpay-webhook] Failed to parse JSON body:", parseErr);
      return new Response(
        JSON.stringify({ error: "Malformed JSON payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const event = payload.event;
    console.log(`[razorpay-webhook] Received event: ${event}`);

    // Handle payment.captured and order.paid
    if (event === "payment.captured" || event === "order.paid") {
      const paymentObj = payload.payload?.payment?.entity;
      const orderObj = payload.payload?.order?.entity;

      const razorpay_order_id = orderObj?.id || paymentObj?.order_id;
      const razorpay_payment_id = paymentObj?.id || null;

      if (!razorpay_order_id) {
        console.warn(`[razorpay-webhook] Event ${event} has no order_id in payload`);
        return new Response(
          JSON.stringify({ received: true, warning: "No razorpay_order_id found in event" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if order was already finalized
      const { data: existingOrder } = await supabaseAdmin
        .from("orders")
        .select("id")
        .eq("razorpay_order_id", razorpay_order_id)
        .maybeSingle();

      if (existingOrder) {
        console.log(`[razorpay-webhook] Order ${existingOrder.id} already exists for ${razorpay_order_id}.`);
        if (razorpay_payment_id) {
          await supabaseAdmin
            .from("orders")
            .update({ razorpay_payment_id })
            .eq("id", existingOrder.id);
        }
        return new Response(
          JSON.stringify({ received: true, alreadyExisted: true, orderId: existingOrder.id }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if pending_orders row exists
      const { data: pending } = await supabaseAdmin
        .from("pending_orders")
        .select("id")
        .eq("razorpay_order_id", razorpay_order_id)
        .maybeSingle();

      if (!pending) {
        console.error(
          `[razorpay-webhook] No pending_orders row found for razorpay_order_id: ${razorpay_order_id}, payment_id: ${razorpay_payment_id || "N/A"}. Returning 200 to prevent retry loop. Reconciliation tool will catch this.`
        );
        return new Response(
          JSON.stringify({
            received: true,
            warning: "No pending order found for razorpay_order_id",
            payment_id: razorpay_payment_id,
            razorpay_order_id,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[razorpay-webhook] Processing finalizeOrder for order: ${razorpay_order_id}, payment: ${razorpay_payment_id}`);

      const result = await finalizeOrder({
        razorpay_order_id,
        razorpay_payment_id,
        supabaseAdmin,
      });

      if (!result.success && result.missingPending) {
        console.error(
          `[razorpay-webhook] Pending order missing for ${razorpay_order_id}, payment_id: ${razorpay_payment_id || "N/A"}. Returning 200 to prevent retry loop.`
        );
        return new Response(
          JSON.stringify({
            received: true,
            warning: "No pending order found for razorpay_order_id",
            razorpay_order_id,
            razorpay_payment_id,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          received: true,
          success: true,
          alreadyExisted: result.alreadyExisted,
          orderId: result.order?.id,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle refund.processed and refund.failed
    if (event === "refund.processed" || event === "refund.failed") {
      const refundEntity = payload.payload?.refund?.entity || payload.payload?.refund;
      const refundId = refundEntity?.id;
      const paymentId = refundEntity?.payment_id;
      const refundAmountPaise = Number(refundEntity?.amount || 0);
      const refundAmountRupees = Math.round(refundAmountPaise / 100);

      if (!paymentId) {
        console.warn(`[razorpay-webhook] Event ${event} missing payment_id in refund entity`);
        return new Response(
          JSON.stringify({ received: true, warning: "Missing payment_id in refund entity", event }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Find order by razorpay_payment_id
      let { data: order } = await supabaseAdmin
        .from("orders")
        .select("id, status, admin_notes, total_price, shipping_fee, razorpay_payment_id")
        .eq("razorpay_payment_id", paymentId)
        .maybeSingle();

      // Fallback: check notes.order_id if present
      if (!order && refundEntity?.notes?.order_id) {
        const { data: orderById } = await supabaseAdmin
          .from("orders")
          .select("id, status, admin_notes, total_price, shipping_fee, razorpay_payment_id")
          .eq("id", refundEntity.notes.order_id)
          .maybeSingle();
        if (orderById) {
          order = orderById;
        }
      }

      if (!order) {
        console.warn(`[razorpay-webhook] No order found for payment_id: ${paymentId}, refund_id: ${refundId || "N/A"}. Returning 200.`);
        return new Response(
          JSON.stringify({ received: true, warning: "No matching order found", payment_id: paymentId, refund_id: refundId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const currentNotes = order.admin_notes || "";

      // Idempotency check:
      // Skip ONLY when admin_notes already contains a finalized line ("[REFUND] processed" or "[REFUND] failed")
      // for this same refund ID. Must NOT skip on "[REFUND] initiated".
      const hasFinalizedLine = refundId && currentNotes.split("\n").some((line) => {
        const trimmed = line.trim();
        if (event === "refund.processed") {
          return trimmed.startsWith("[REFUND] processed") && trimmed.includes(refundId);
        }
        if (event === "refund.failed") {
          return trimmed.startsWith("[REFUND] failed") && trimmed.includes(refundId);
        }
        return false;
      });

      if (hasFinalizedLine) {
        console.log(`[razorpay-webhook] Event ${event} for refund ${refundId} already finalized in admin_notes on order ${order.id}. Returning 200.`);
        return new Response(
          JSON.stringify({ received: true, alreadyProcessed: true, orderId: order.id, refundId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const timestamp = new Date().toISOString();

      if (event === "refund.processed") {
        // Fetch payment details from Razorpay to get accurate total amount_refunded
        const keyId = Deno.env.get("RAZORPAY_KEY_ID") || "";
        const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET") || "";
        let totalRefundedPaise = refundAmountPaise;

        if (keyId && keySecret) {
          try {
            const basicAuth = btoa(`${keyId}:${keySecret}`);
            const pRes = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
              headers: {
                Authorization: `Basic ${basicAuth}`,
                "Content-Type": "application/json",
              },
            });
            if (pRes.ok) {
              const pData = await pRes.json();
              if (pData?.amount_refunded !== undefined) {
                totalRefundedPaise = Number(pData.amount_refunded);
              }
            } else {
              console.warn(`[razorpay-webhook] Razorpay payment fetch returned status ${pRes.status} for ${paymentId}`);
            }
          } catch (fetchErr) {
            console.error(`[razorpay-webhook] Failed to fetch payment details from Razorpay:`, fetchErr);
          }
        }

        const totalPriceRupees = Number(order.total_price || 0);
        const shippingFeeRupees = Number(order.shipping_fee || 0);
        const maxRefundableRupees = Math.max(0, totalPriceRupees - shippingFeeRupees);
        const totalRefundedRupees = totalRefundedPaise / 100;

        // If amount refunded covers the eligible product price (or total), status is 'Refunded'
        const nextStatus = totalRefundedRupees >= maxRefundableRupees ? "Refunded" : "Partially Refunded";

        const appendLog = `[REFUND] processed ${timestamp} | ${refundId || "unknown_refund"} | ₹${refundAmountRupees}`;
        const newNotes = currentNotes ? `${currentNotes}\n${appendLog}` : appendLog;

        const { error: updateErr } = await supabaseAdmin
          .from("orders")
          .update({
            status: nextStatus,
            admin_notes: newNotes,
          })
          .eq("id", order.id);

        if (updateErr) {
          console.error(`[razorpay-webhook] Failed to update order ${order.id} on refund.processed:`, updateErr);
          throw updateErr;
        }

        console.log(`[razorpay-webhook] Order ${order.id} updated to status "${nextStatus}" for refund ${refundId}`);
        return new Response(
          JSON.stringify({ received: true, success: true, orderId: order.id, status: nextStatus, refundId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (event === "refund.failed") {
        const appendLog = `[REFUND] failed ${timestamp} | ${refundId || "unknown_refund"}`;
        const newNotes = currentNotes ? `${currentNotes}\n${appendLog}` : appendLog;

        const { error: updateErr } = await supabaseAdmin
          .from("orders")
          .update({
            status: "Refund Failed",
            admin_notes: newNotes,
          })
          .eq("id", order.id);

        if (updateErr) {
          console.error(`[razorpay-webhook] Failed to update order ${order.id} on refund.failed:`, updateErr);
          throw updateErr;
        }

        console.log(`[razorpay-webhook] Order ${order.id} marked as "Refund Failed" for refund ${refundId}`);
        return new Response(
          JSON.stringify({ received: true, success: true, orderId: order.id, status: "Refund Failed", refundId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Return 200 quickly for any other events (e.g., payment.authorized)
    return new Response(
      JSON.stringify({ received: true, ignored: true, event }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[razorpay-webhook] Unhandled webhook processing error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
