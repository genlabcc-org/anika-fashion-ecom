// supabase/functions/initiate-refund/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleCorsPreflight, corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Checks if the user has an active 'admin' role in public.admin_users
 */
async function checkIsAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("admin_users")
    .select("id")
    .eq("id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

/**
 * Extracts and verifies the user from the Authorization header
 */
async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
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
    // 2. Authenticate admin user
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid or missing token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isAdmin = await checkIsAdmin(user.id);
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Parse and validate request body
    const body = await req.json().catch(() => ({}));
    const orderId = body.orderId || body.order_id;
    const amount = Number(body.amount);
    const reason = (body.reason || "Damaged").trim();
    const note = (body.note || "").trim();

    if (!orderId) {
      return new Response(
        JSON.stringify({ error: "Missing required parameter: orderId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (isNaN(amount) || amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Refund amount must be a positive number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Fetch order details from database using service role
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, status, total_price, shipping_fee, razorpay_payment_id, admin_notes")
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr || !order) {
      console.warn(`[initiate-refund] Order ${orderId} not found`);
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check payment method & ID
    const paymentId = order.razorpay_payment_id;
    if (!paymentId) {
      return new Response(
        JSON.stringify({ error: "Order has no Razorpay payment ID (cannot refund COD or unpaid orders)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Reject when status is 'Refund Initiated', 'Refunded', or 'Partially Refunded'
    // (Allows 'Refund Failed' to retry)
    const currentStatus = (order.status || "").toLowerCase().trim();
    if (["refund initiated", "refunded", "partially refunded", "refund completed"].includes(currentStatus)) {
      return new Response(
        JSON.stringify({ error: `Cannot initiate refund: order status is currently "${order.status}".` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check Razorpay credentials
    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!keyId || !keySecret) {
      console.error("[initiate-refund] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET missing");
      return new Response(
        JSON.stringify({ error: "Razorpay credentials not configured on server" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const basicAuth = btoa(`${keyId}:${keySecret}`);

    // Policy check: product price only, shipping fee is non-refundable
    const totalPrice = Number(order.total_price || 0);
    const shippingFee = Number(order.shipping_fee || 0);
    const maxRefundable = Math.max(0, totalPrice - shippingFee);

    // 5. Query Razorpay GET /v1/payments/{paymentId}/refunds to determine already refunded amount
    let alreadyRefundedPaise = 0;
    try {
      const rzListRes = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refunds`, {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/json",
        },
      });

      if (rzListRes.ok) {
        const rzListData = await rzListRes.json();
        const items = rzListData?.items || [];
        alreadyRefundedPaise = items
          .filter((r: any) => r.status !== "failed")
          .reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
      } else {
        console.warn(`[initiate-refund] Failed to list existing refunds from Razorpay (${rzListRes.status}). Checking payment endpoint.`);
        const pRes = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
          headers: {
            Authorization: `Basic ${basicAuth}`,
            "Content-Type": "application/json",
          },
        });
        if (pRes.ok) {
          const pData = await pRes.json();
          if (pData?.amount_refunded !== undefined) {
            alreadyRefundedPaise = Number(pData.amount_refunded);
          }
        }
      }
    } catch (fetchErr) {
      console.error(`[initiate-refund] Error fetching existing refunds from Razorpay:`, fetchErr);
    }

    const alreadyRefundedRupees = alreadyRefundedPaise / 100;
    const remainingRefundableRupees = Math.max(0, maxRefundable - alreadyRefundedRupees);

    if (remainingRefundableRupees <= 0) {
      return new Response(
        JSON.stringify({
          error: `Order has already been refunded up to the maximum eligible amount of ₹${maxRefundable}. (Already refunded: ₹${alreadyRefundedRupees}).`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (amount > remainingRefundableRupees) {
      return new Response(
        JSON.stringify({
          error: `Refund amount (₹${amount}) exceeds remaining eligible amount (₹${remainingRefundableRupees}). Max eligible product total: ₹${maxRefundable}, already refunded: ₹${alreadyRefundedRupees}. Shipping fee of ₹${shippingFee} is non-refundable per store policy.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Concurrency protection: deterministic idempotency key for Razorpay
    const amountPaise = Math.round(amount * 100);
    const idempotencyKey = `refund-${order.id}-${alreadyRefundedPaise}-${amountPaise}`;

    console.log(`[initiate-refund] Calling Razorpay refund for payment ${paymentId}, amount: ₹${amount} (${amountPaise} paise), idempotency: ${idempotencyKey}`);

    const rzpRes = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
        "X-Refund-Idempotency": idempotencyKey,
      },
      body: JSON.stringify({
        amount: amountPaise,
        speed: "normal",
        notes: {
          order_id: String(order.id),
          reason: reason,
          admin_id: String(user.id),
          admin_note: note,
        },
        receipt: String(order.id),
      }),
    });

    const rzpData = await rzpRes.json();

    if (!rzpRes.ok) {
      console.error(`[initiate-refund] Razorpay refund failed with status ${rzpRes.status}:`, rzpData);
      const errorMsg = rzpData?.error?.description || rzpData?.error?.message || "Razorpay refund initiation failed";
      return new Response(
        JSON.stringify({ error: errorMsg, rzpDetails: rzpData?.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const refundId = rzpData.id;
    const refundStatus = rzpData.status; // typically 'processed' or 'pending'
    const timestamp = new Date().toISOString();

    // 7. Post-Razorpay update with race-condition & concurrency safety
    // Fetch latest order state immediately before update in case the webhook fired and completed first!
    const { data: latestOrder } = await supabaseAdmin
      .from("orders")
      .select("id, status, admin_notes")
      .eq("id", order.id)
      .single();

    const currentLatestStatus = (latestOrder?.status || "").toLowerCase().trim();
    const isAlreadyCompletedByWebhook = ["refunded", "partially refunded"].includes(currentLatestStatus);

    const appendLog = `[REFUND] initiated ${timestamp} | ${refundId} | ₹${amount} | Reason: ${reason}${note ? ` | Note: ${note}` : ""}`;
    const currentLatestNotes = latestOrder?.admin_notes || order.admin_notes || "";

    // Append initiated note if not already present
    const updatedNotes = currentLatestNotes.includes(refundId)
      ? currentLatestNotes
      : currentLatestNotes
      ? `${currentLatestNotes}\n${appendLog}`
      : appendLog;

    const finalUpdate: Record<string, any> = {
      admin_notes: updatedNotes,
    };

    // Set status = 'Refund Initiated' ONLY if webhook has not already marked it 'Refunded' or 'Partially Refunded'!
    if (!isAlreadyCompletedByWebhook) {
      finalUpdate.status = "Refund Initiated";
    }

    // Conditional update: if not completed by webhook, update status and notes while ensuring we don't overwrite if webhook just completed
    if (isAlreadyCompletedByWebhook) {
      await supabaseAdmin
        .from("orders")
        .update({ admin_notes: updatedNotes })
        .eq("id", order.id);
    } else {
      await supabaseAdmin
        .from("orders")
        .update(finalUpdate)
        .eq("id", order.id)
        .not("status", "in", '("Refunded","Partially Refunded")');
    }

    console.log(`[initiate-refund] Refund ${refundId} initiated successfully for order ${order.id}. Current status: ${isAlreadyCompletedByWebhook ? latestOrder?.status : "Refund Initiated"}`);

    return new Response(
      JSON.stringify({
        success: true,
        refundId,
        refundStatus,
        amount,
        status: isAlreadyCompletedByWebhook ? latestOrder?.status : "Refund Initiated",
        message: "Refund initiated successfully via Razorpay.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[initiate-refund] Unexpected error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
