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
        const { items, addressId, discountCode, discountPct, shippingFee } = body;

        if (!items || !Array.isArray(items) || items.length === 0) {
          return new Response(
            JSON.stringify({ error: "Missing or empty items array" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const orderDetails = await razorpayService.createOrder({
          items,
          addressId: addressId ? Number(addressId) : undefined,
          discountCode,
          discountPct,
          shippingFee,
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
          discountPct,
          shippingFee,
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
          discountPct,
          shippingFee,
        });

        return new Response(
          JSON.stringify({ success: true, order: finalOrder }),
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
