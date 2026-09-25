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
    // 1. Parse body as JSON; fallback to urlencoded if JSON parsing fails
    const rawText = await req.text();
    let body: any = {};
    let formatUsed = "json";

    try {
      body = JSON.parse(rawText);
      console.log("[iCarry Webhook] Parsed JSON payload");
    } catch {
      try {
        const params = new URLSearchParams(rawText);
        const formObj: Record<string, any> = {};
        for (const [key, value] of params.entries()) {
          formObj[key] = value;
        }
        body = formObj;
        formatUsed = "urlencoded";
        console.log("[iCarry Webhook] Parsed application/x-www-form-urlencoded payload as fallback");
      } catch (parseErr) {
        console.warn("[iCarry Webhook] Failed to parse request body as JSON or urlencoded:", parseErr);
        body = {};
      }
    }

    const callbackType = String(body.callback_type || "").trim();
    console.log(`[iCarry Webhook] Event: "${callbackType || 'unknown'}" (format: ${formatUsed})`);

    const expectedToken = Deno.env.get("ICARRY_WEBHOOK_TOKEN");

    // ─────────────────────────────────────────────────────────────
    // 2. CALLBACK: sync_status
    // ─────────────────────────────────────────────────────────────
    if (callbackType === "sync_status") {
      // Require body.token === ICARRY_WEBHOOK_TOKEN, else return 401
      if (!expectedToken || body.token !== expectedToken) {
        console.warn("[iCarry Webhook] 401 Unauthorized: token mismatch for sync_status");
        return new Response(JSON.stringify({ error: "Unauthorized token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const awb = String(body.awb || "").trim();
      const statusCode = Number(body.status);

      if (!awb) {
        console.warn("[iCarry Webhook] sync_status received without AWB");
        return new Response(JSON.stringify({ ok: true, note: "missing awb" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find the order by waybill
      const { data: order, error: orderErr } = await supabaseAdmin
        .from("orders")
        .select("id, delivery_status, shipped_at, delivered_at")
        .eq("waybill", awb)
        .maybeSingle();

      if (orderErr) {
        console.error(`[iCarry Webhook] Database error finding order for AWB ${awb}:`, orderErr);
        return new Response(JSON.stringify({ ok: true, error: orderErr.message }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!order) {
        console.log(`[iCarry Webhook] Unknown AWB: ${awb}. Returning 200 to prevent retry storm.`);
        return new Response(JSON.stringify({ ok: true, note: "unknown awb" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newDeliveryStatus = STATUS[statusCode] ?? String(body.status);
      const updates: Record<string, any> = {
        delivery_status: newDeliveryStatus,
      };

      // If status === 3 (Shipped), set shipped_at = now() only if currently null
      if (statusCode === 3 && !order.shipped_at) {
        updates.shipped_at = new Date().toISOString();
      }

      // If status === 21 (Delivered), set delivered_at = now() only if currently null
      if (statusCode === 21 && !order.delivered_at) {
        updates.delivered_at = new Date().toISOString();
      }

      // If status === 7 (Canceled) or 16 (Voided), mark order status as Cancelled
      if (statusCode === 7 || statusCode === 16) {
        updates.status = "Cancelled";
      }

      const { error: updateErr } = await supabaseAdmin
        .from("orders")
        .update(updates)
        .eq("id", order.id);

      if (updateErr) {
        console.error(`[iCarry Webhook] Failed to update order ${order.id}:`, updateErr);
      } else {
        console.log(`[iCarry Webhook] Order ${order.id} status updated to: "${newDeliveryStatus}"`);
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
      let ndrList = body.ndr_data;
      if (typeof ndrList === "string") {
        try {
          ndrList = JSON.parse(ndrList);
        } catch {
          ndrList = [];
        }
      }
      if (!Array.isArray(ndrList)) {
        ndrList = [];
      }

      for (const item of ndrList) {
        const awb = item.awb ? String(item.awb).trim() : null;
        const shipmentId = item.shipment_id ? String(item.shipment_id).trim() : null;
        const ndrType = String(item.type || item.ndr_status || "issue").trim();
        const description = String(item.reason || item.description || item.comment || `NDR: ${ndrType}`).trim();

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
          const newStatus = `ndr:${ndrType}`;
          await supabaseAdmin
            .from("orders")
            .update({
              delivery_status: newStatus,
              shipment_error: description,
            })
            .eq("id", order.id);
          console.log(`[iCarry Webhook] NDR update on order ${order.id}: delivery_status="${newStatus}", shipment_error="${description}"`);
        } else {
          console.log(`[iCarry Webhook] NDR item (AWB: ${awb}, Shipment ID: ${shipmentId}) does not match any order. Skipped.`);
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
    // 5. Unrecognized callback_type
    // ─────────────────────────────────────────────────────────────
    console.log(`[iCarry Webhook] Unrecognized callback_type: "${callbackType}". Payload:`, JSON.stringify(body));
    return new Response(JSON.stringify({ ok: true, message: "Ignored" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    // Never allow an unexpected exception to trigger a 500 retry storm from iCarry
    console.error("[iCarry Webhook] Unexpected error handling webhook:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
