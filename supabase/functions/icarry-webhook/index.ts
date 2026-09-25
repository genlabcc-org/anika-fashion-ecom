// supabase/functions/icarry-webhook/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleCorsPreflight, corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

/**
 * iCarry Status Mapping (API documentation p. 34)
 */
const STATUS: Record<number, string> = {
  1: "Pending Pickup",
  2: "Processing",
  3: "Shipped",
  7: "Canceled",
  12: "Damaged",
  14: "Lost",
  16: "Voided",
  21: "Delivered",
  22: "In Transit",
  23: "Returned to Origin",
  24: "Manifested",
  25: "Pickup Scheduled",
  26: "Out For Delivery",
  27: "Pending Return",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCorsPreflight(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: true, message: "Method ignored" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const callbackType = String(body.callback_type || "").trim();

    console.log(`[iCarry Webhook] Received event: ${callbackType || "unknown"}`);

    const expectedToken = Deno.env.get("ICARRY_WEBHOOK_TOKEN");

    // ─────────────────────────────────────────────────────────────
    // 1. TOKEN VERIFICATION
    // - sync_status & new_weight_discrepancy: body.token must match ICARRY_WEBHOOK_TOKEN
    // - ndr_status: payload has no token field per doc, so skip token check
    // ─────────────────────────────────────────────────────────────
    if (callbackType === "sync_status" || callbackType === "new_weight_discrepancy") {
      if (!expectedToken || body.token !== expectedToken) {
        console.warn(`[iCarry Webhook] 401 Unauthorized: token mismatch for ${callbackType}`);
        return new Response(JSON.stringify({ error: "Unauthorized token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 2. CALLBACK: sync_status
    // ─────────────────────────────────────────────────────────────
    if (callbackType === "sync_status") {
      const awb = String(body.awb || "").trim();
      const statusCode = Number(body.status);

      if (!awb) {
        console.warn("[iCarry Webhook] sync_status received without AWB");
        return new Response(JSON.stringify({ ok: true, message: "Missing awb" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find the order by waybill
      const { data: order, error: orderErr } = await supabaseAdmin
        .from("orders")
        .select("id, waybill, delivery_status, shipped_at, delivered_at")
        .eq("waybill", awb)
        .maybeSingle();

      if (orderErr) {
        console.error(`[iCarry Webhook] Database error finding order for AWB ${awb}:`, orderErr);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!order) {
        console.log(`[iCarry Webhook] No matching order found for AWB: ${awb}. Ignoring silently.`);
        return new Response(JSON.stringify({ ok: true, message: "Order not found" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const statusName = STATUS[statusCode] || `Status ${statusCode}`;
      const updates: Record<string, any> = {
        delivery_status: statusName,
      };

      // If status === 3 (Shipped), set shipped_at = now() only if not already set
      if (statusCode === 3 && !order.shipped_at) {
        updates.shipped_at = new Date().toISOString();
      }

      // If status === 21 (Delivered), set delivered_at = now() only if not already set
      if (statusCode === 21 && !order.delivered_at) {
        updates.delivered_at = new Date().toISOString();
      }

      const { error: updateErr } = await supabaseAdmin
        .from("orders")
        .update(updates)
        .eq("id", order.id);

      if (updateErr) {
        console.error(`[iCarry Webhook] Failed to update status for order ${order.id}:`, updateErr);
      } else {
        console.log(`[iCarry Webhook] Updated order ${order.id} status to: "${statusName}"`);
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 3. CALLBACK: ndr_status
    // ─────────────────────────────────────────────────────────────
    if (callbackType === "ndr_status") {
      const ndrList = Array.isArray(body.ndr_data) ? body.ndr_data : [];

      for (const item of ndrList) {
        console.log("[iCarry Webhook] Processing NDR item:", JSON.stringify(item));
        const awb = item.awb ? String(item.awb).trim() : null;
        const shipmentId = item.shipment_id ? String(item.shipment_id).trim() : null;
        const ndrType = String(item.type || "").trim() || "UNKNOWN";

        let order = null;

        if (awb) {
          const { data } = await supabaseAdmin
            .from("orders")
            .select("id")
            .eq("waybill", awb)
            .maybeSingle();
          order = data;
        }

        if (!order && shipmentId) {
          const { data } = await supabaseAdmin
            .from("orders")
            .select("id")
            .eq("shipment_id", shipmentId)
            .maybeSingle();
          order = data;
        }

        if (order) {
          const newStatus = `NDR: ${ndrType}`;
          await supabaseAdmin
            .from("orders")
            .update({ delivery_status: newStatus })
            .eq("id", order.id);
          console.log(`[iCarry Webhook] Updated order ${order.id} delivery_status to: "${newStatus}"`);
        } else {
          console.log(`[iCarry Webhook] NDR item does not match any order in database (AWB: ${awb}, Shipment ID: ${shipmentId}). Skipping.`);
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 4. CALLBACK: new_weight_discrepancy
    // ─────────────────────────────────────────────────────────────
    if (callbackType === "new_weight_discrepancy") {
      console.log("[iCarry Webhook] new_weight_discrepancy payload:", JSON.stringify(body));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─────────────────────────────────────────────────────────────
    // Unrecognized callback_type
    // ─────────────────────────────────────────────────────────────
    console.log(`[iCarry Webhook] Unrecognized callback_type: "${callbackType}". Payload:`, JSON.stringify(body));
    return new Response(JSON.stringify({ ok: true, message: "Ignored" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    // Never allow an unexpected exception to trigger non-200 retries from iCarry
    console.error("[iCarry Webhook] Unexpected error handling webhook:", err);
    return new Response(JSON.stringify({ ok: true, error: String(err?.message || err) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
