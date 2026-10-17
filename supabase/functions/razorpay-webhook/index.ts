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

    // Return 200 quickly for any other events (e.g., payment.authorized, refund.processed)
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
