// supabase/functions/icarry-webhook/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleCorsPreflight, corsHeaders } from "../_shared/cors.ts";
import {
  STATUS_MAP,
  getStatusRank,
  timingSafeEqualStr,
  parseCarrierDate,
  calculateOrderTransition,
} from "../_shared/icarryStatus.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Redacts any sensitive keys from log output.
 * NEVER logs tokens or authorization headers.
 */
function sanitizePayload(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizePayload);
  const copy: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (/token|auth|key|secret|password/i.test(key)) {
      copy[key] = "[REDACTED]";
    } else if (value && typeof value === "object") {
      copy[key] = sanitizePayload(value);
    } else {
      copy[key] = value;
    }
  }
  return copy;
}

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
    const rawText = await req.text();
    let body: any = {};
    let formatUsed = "json";

    try {
      body = JSON.parse(rawText);
    } catch {
      try {
        const params = new URLSearchParams(rawText);
        const formObj: Record<string, any> = {};
        for (const [key, value] of params.entries()) {
          formObj[key] = value;
        }
        body = formObj;
        formatUsed = "urlencoded";
      } catch (parseErr) {
        console.warn("[iCarry Webhook] Failed to parse request body as JSON or urlencoded:", parseErr);
        body = {};
      }
    }

    const callbackType = String(body.callback_type || "").trim();
    // Log sanitized payload without revealing secrets
    console.log(
      `[iCarry Webhook] Received event: "${callbackType || 'unknown'}" (format: ${formatUsed}). Payload:`,
      JSON.stringify(sanitizePayload(body))
    );

    // Extract token from body, query parameter, or headers
    const url = new URL(req.url);
    const queryToken = url.searchParams.get("token") || url.searchParams.get("api_token");
    const headerToken = req.headers.get("x-icarry-token") ||
      req.headers.get("x-api-key") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const bodyToken = typeof body.token === "string" ? body.token : null;

    const providedToken = String(bodyToken || queryToken || headerToken || "").trim();
    const expectedToken = String(Deno.env.get("ICARRY_WEBHOOK_TOKEN") || "").trim();

    // Verify token using constant-time check
    const isTokenValid = expectedToken.length > 0 && await timingSafeEqualStr(providedToken, expectedToken);
    if (!isTokenValid) {
      console.warn("[iCarry Webhook] 401 Unauthorized: token mismatch or ICARRY_WEBHOOK_TOKEN unset");
      return new Response(JSON.stringify({ error: "Unauthorized token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 2. CALLBACK: sync_status
    // ─────────────────────────────────────────────────────────────
    if (callbackType === "sync_status") {
      const cleanAwb = String(body.awb || "").trim();
      const cleanShipmentId = String(body.shipment_id || "").trim();
      const cleanOrderId = String(body.order_id || body.client_order_id || "").trim();

      if (!cleanAwb && !cleanShipmentId && !cleanOrderId) {
        console.warn("[iCarry Webhook] sync_status received without AWB, shipment_id, or order_id");
        return new Response(JSON.stringify({ ok: true, note: "missing identifier" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Order lookup: match on waybill (case-insensitive with wildcard escaping), or shipment_id, or order_id
      let matchedOrders: any[] = [];

      if (cleanAwb) {
        const escapedAwb = cleanAwb.replace(/[%_\\]/g, "\\$&");
        const { data, error } = await supabaseAdmin
          .from("orders")
          .select("id, status, delivery_status, waybill, shipment_id, shipped_at, delivered_at")
          .ilike("waybill", escapedAwb);

        if (error) {
          console.error(`[iCarry Webhook] DB error querying by waybill "${cleanAwb}":`, error);
        } else if (data && data.length > 0) {
          matchedOrders = data;
        }
      }

      if (matchedOrders.length === 0 && cleanShipmentId) {
        const { data, error } = await supabaseAdmin
          .from("orders")
          .select("id, status, delivery_status, waybill, shipment_id, shipped_at, delivered_at")
          .eq("shipment_id", cleanShipmentId);

        if (error) {
          console.error(`[iCarry Webhook] DB error querying by shipment_id "${cleanShipmentId}":`, error);
        } else if (data && data.length > 0) {
          matchedOrders = data;
        }
      }

      if (matchedOrders.length === 0 && cleanOrderId) {
        const { data, error } = await supabaseAdmin
          .from("orders")
          .select("id, status, delivery_status, waybill, shipment_id, shipped_at, delivered_at")
          .eq("id", cleanOrderId);

        if (error) {
          console.error(`[iCarry Webhook] DB error querying by order id "${cleanOrderId}":`, error);
        } else if (data && data.length > 0) {
          matchedOrders = data;
        }
      }

      // Require exactly one match. 0 or >1 matches: log + return 200 without updating.
      if (matchedOrders.length === 0) {
        console.warn(`[iCarry Webhook] 0 orders matched for lookup (awb="${cleanAwb}", shipment_id="${cleanShipmentId}"). Returning 200 without update.`);
        return new Response(JSON.stringify({ ok: true, matched: 0 }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (matchedOrders.length > 1) {
        console.warn(`[iCarry Webhook] Ambiguous match: ${matchedOrders.length} orders found for AWB="${cleanAwb}". Returning 200 without update.`);
        return new Response(JSON.stringify({ ok: true, matched: matchedOrders.length, warning: "Ambiguous match" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const order = matchedOrders[0];
      const carrierDatePicked = body.date_picked || body["date_picked "] || body.picked_datetime;
      const carrierDateDelivered = body.date_delivered || body.delivered_datetime;

      const transition = calculateOrderTransition(
        order,
        body.status,
        carrierDatePicked,
        carrierDateDelivered
      );

      if (transition.warning) {
        console.warn(`[iCarry Webhook] ${transition.warning}`);
      }

      if (!transition.shouldUpdate) {
        console.log(`[iCarry Webhook] ${transition.reason}`);
        return new Response(JSON.stringify({ ok: true, note: transition.reason }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update strictly by primary key `id`
      const { error: updateErr } = await supabaseAdmin
        .from("orders")
        .update(transition.updates)
        .eq("id", order.id);

      // Return HTTP 500 when DB update fails (keep 200 for 0/ambiguous/ignored)
      if (updateErr) {
        console.error(`[iCarry Webhook] DB update error for order ${order.id}:`, updateErr);
        return new Response(JSON.stringify({ ok: false, error: updateErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[iCarry Webhook] Order ${order.id} updated:`, JSON.stringify(transition.updates));
      return new Response(JSON.stringify({ ok: true, updated: order.id, updates: transition.updates }), {
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

      let updatedCount = 0;
      for (const item of ndrList) {
        const awb = item.awb ? String(item.awb).trim() : null;
        const shipmentId = item.shipment_id ? String(item.shipment_id).trim() : null;
        const ndrType = String(item.type || item.ndr_status || "issue").trim();
        const description = String(item.reason || item.description || item.comment || `NDR: ${ndrType}`).trim();

        let matchedOrders: any[] = [];

        if (awb) {
          const escapedAwb = awb.replace(/[%_\\]/g, "\\$&");
          const { data } = await supabaseAdmin
            .from("orders")
            .select("id, status, delivery_status")
            .ilike("waybill", escapedAwb);
          if (data && data.length > 0) matchedOrders = data;
        }

        if (matchedOrders.length === 0 && shipmentId) {
          const { data } = await supabaseAdmin
            .from("orders")
            .select("id, status, delivery_status")
            .eq("shipment_id", shipmentId);
          if (data && data.length > 0) matchedOrders = data;
        }

        if (matchedOrders.length === 1) {
          const order = matchedOrders[0];
          // Do not overwrite terminal orders with NDR
          const orderTerminal = ["delivered", "cancelled", "canceled", "returned", "rto", "lost", "damaged"].some((t) =>
            (order.status || "").toLowerCase().includes(t) ||
            (order.delivery_status || "").toLowerCase().includes(t)
          );

          if (!orderTerminal) {
            const newStatus = `ndr:${ndrType}`;
            const { error: ndrErr } = await supabaseAdmin
              .from("orders")
              .update({
                delivery_status: newStatus,
                shipment_error: description,
              })
              .eq("id", order.id);

            if (ndrErr) {
              console.error(`[iCarry Webhook] NDR update error for order ${order.id}:`, ndrErr);
            } else {
              updatedCount++;
              console.log(`[iCarry Webhook] NDR update on order ${order.id}: delivery_status="${newStatus}", shipment_error="${description}"`);
            }
          }
        }
      }

      return new Response(JSON.stringify({ ok: true, ndr_updated: updatedCount }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 4. CALLBACK: new_weight_discrepancy
    // ─────────────────────────────────────────────────────────────
    if (callbackType === "new_weight_discrepancy") {
      console.log("[iCarry Webhook] new_weight_discrepancy payload:", JSON.stringify(sanitizePayload(body)));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 5. Unrecognized callback_type
    // ─────────────────────────────────────────────────────────────
    console.log(`[iCarry Webhook] Unrecognized callback_type: "${callbackType}". Payload:`, JSON.stringify(sanitizePayload(body)));
    return new Response(JSON.stringify({ ok: true, message: "Ignored" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[iCarry Webhook] Unexpected error handling webhook:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
