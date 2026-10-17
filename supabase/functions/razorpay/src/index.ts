import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { handleCorsPreflight, corsHeaders } from "../../_shared/cors.ts";
import { RazorpayService } from "./service.ts";

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    // 1. Handle CORS preflight request
    const corsResponse = handleCorsPreflight(req);
    if (corsResponse) return corsResponse;

    try {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "Missing Authorization header" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify user auth
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await ctx.supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized user" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Parse request body
      const body = await req.json();
      const { action } = body;

      const razorpayService = new RazorpayService(ctx.supabaseAdmin);

      if (action === "create_order") {
        const { items, addressId, discountCode, isBuyNow } = body;

        if (!items || !Array.isArray(items) || items.length === 0) {
          return new Response(
            JSON.stringify({ error: "Missing or empty items array" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const orderDetails = await razorpayService.createOrder({
          userId: user.id,
          items,
          addressId: addressId ? Number(addressId) : undefined,
          discountCode,
          isBuyNow: Boolean(isBuyNow),
        });
        return new Response(
          JSON.stringify({
            success: true,
            orderId: orderDetails.orderId,
            amount: orderDetails.amount,
            currency: orderDetails.currency,
            productName: orderDetails.productName,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action === "verify_payment") {
        const {
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          items,
          addressId,
          discountCode,
        } = body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !items || !Array.isArray(items) || items.length === 0) {
          return new Response(
            JSON.stringify({ error: "Missing required payment verification details" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const finalOrder = await razorpayService.verifyPayment({
          userId: user.id,
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          items,
          addressId: addressId ? Number(addressId) : undefined,
          discountCode,
        });

        return new Response(
          JSON.stringify({ success: true, order: finalOrder }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action === "deduct_stock") {
        const { orderId } = body;
        if (!orderId) {
          return new Response(
            JSON.stringify({ error: "Missing orderId" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Verify the order belongs to this user before deducting
        const { data: ownerCheck, error: ownerErr } = await ctx.supabaseAdmin
          .from("orders")
          .select("id")
          .eq("id", orderId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (ownerErr || !ownerCheck) {
          return new Response(
            JSON.stringify({ error: "Order not found or does not belong to this user" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Idempotent check: atomically claim stock_deducted flag
        const { data: claimedOrder } = await ctx.supabaseAdmin
          .from("orders")
          .update({ stock_deducted: true } as any)
          .eq("id", orderId)
          .eq("stock_deducted", false)
          .select("id")
          .maybeSingle();

        if (claimedOrder) {
          const { error: stockErr } = await ctx.supabaseAdmin.rpc(
            "deduct_order_stock",
            { p_order_id: orderId }
          );

          if (stockErr) {
            console.error(`[Stock] deduct_order_stock failed for COD order ${orderId}:`, stockErr.message);
            // Revert flag on failure
            await ctx.supabaseAdmin
              .from("orders")
              .update({ stock_deducted: false } as any)
              .eq("id", orderId);

            return new Response(
              JSON.stringify({ error: stockErr.message }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else {
          console.log(`[Stock] Stock already deducted for COD order ${orderId}, skipping duplicate deduction`);
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action === "reconcile_payments") {
        // Admin authorization check
        const { data: adminCheck, error: adminErr } = await ctx.supabaseAdmin
          .from("admin_users")
          .select("id")
          .eq("id", user.id)
          .eq("role", "admin")
          .maybeSingle();

        if (adminErr || !adminCheck) {
          return new Response(
            JSON.stringify({ error: "Forbidden: Admin access required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const days = Number(body.days) || 7;
        const missingPayments = await razorpayService.reconcilePayments(days);

        return new Response(
          JSON.stringify({ success: true, missingPayments }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Unknown action: ${action}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }),
};
