// supabase/functions/icarry/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleCorsPreflight, corsHeaders } from "../_shared/cors.ts";
import { icarryCall, ENDPOINTS } from "../_shared/icarry.ts";
import { bookShipmentForOrder } from "../_shared/bookShipment.ts";
import {
  extractStatusFromTrackResponse,
  calculateOrderTransition,
} from "../_shared/icarryStatus.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Global admin client with service_role privileges
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Checks if the given user ID belongs to public.admin_users with role = 'admin'.
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
 * Extracts and verifies the user from the Authorization header.
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
    const body = await req.json().catch(() => ({}));
    const { action, payload = {} } = body;

    if (!action) {
      return new Response(JSON.stringify({ error: "Missing action in request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 1. PINCODE CHECK (Public, no authentication required)
    // ─────────────────────────────────────────────────────────────
    if (action === "pincode") {
      const pincode = String(payload.pincode ?? payload ?? "").trim();
      if (!pincode) {
        return new Response(JSON.stringify({ error: "Pincode is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const data = await icarryCall(ENDPOINTS.pincode, { pincode });
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user = await getAuthenticatedUser(req);
    const isAdmin = user ? await checkIsAdmin(user.id) : false;

    // PINCODE is public, but TRACK and all admin actions require an authenticated user
    if (!user && action !== "pincode") {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid or missing token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 2. TRACK SHIPMENT (Requires auth; non-admins restricted to own order + 5-min cooldown)
    // ─────────────────────────────────────────────────────────────
    if (action === "track") {
      const orderId = String(payload.orderId ?? "").trim();
      if (!orderId) {
        return new Response(JSON.stringify({ error: "orderId is required to track shipment" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: order, error: orderErr } = await supabaseAdmin
        .from("orders")
        .select("id, user_id, waybill, shipment_id, courier_name, tracking_url, delivery_status, status, shipped_at, delivered_at, fulfillment_type, manual_courier_name, manual_awb, manual_tracking_url, last_tracking_sync_at")
        .eq("id", orderId)
        .maybeSingle();

      if (orderErr || !order) {
        return new Response(JSON.stringify({ error: "Order not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Ownership check: Non-admins can only track their own orders (403 on mismatch)
      if (!isAdmin && order.user_id !== user.id) {
        return new Response(JSON.stringify({ error: "Forbidden: You do not have permission to view tracking for this order" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Manual orders: return DB data only without calling iCarry API
      if (order.fulfillment_type === "manual" || (order.courier_name && /st courier|manual|dtdc|local|porter/i.test(order.courier_name))) {
        return new Response(JSON.stringify({
          orderId: order.id,
          courier_name: order.manual_courier_name || order.courier_name,
          tracking_url: order.manual_tracking_url || order.tracking_url,
          status: order.status,
          delivery_status: order.delivery_status,
          waybill: order.manual_awb || order.waybill,
          fulfillment_type: "manual",
          message: "Shipment fulfilled via external courier.",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!order.waybill && !order.shipment_id) {
        return new Response(JSON.stringify({
          error: "Shipment has not been booked or assigned a waybill yet",
          delivery_status: order.delivery_status,
          status: order.status,
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Cooldown check: 5-minute cooldown for regular users (Admins bypass cooldown)
      const COOLDOWN_MS = 5 * 60 * 1000;
      const lastSyncTime = order.last_tracking_sync_at ? new Date(order.last_tracking_sync_at).getTime() : 0;
      const isCooldownActive = !isAdmin && (Date.now() - lastSyncTime < COOLDOWN_MS);

      if (isCooldownActive) {
        return new Response(JSON.stringify({
          orderId: order.id,
          courier_name: order.courier_name,
          tracking_url: order.tracking_url,
          status: order.status,
          delivery_status: order.delivery_status,
          waybill: order.waybill,
          cached: true,
          last_tracking_sync_at: order.last_tracking_sync_at,
          message: "Tracking served from cache (sync cooldown active).",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update last_tracking_sync_at BEFORE calling iCarry so parallel requests cannot bypass the cooldown
      await supabaseAdmin
        .from("orders")
        .update({ last_tracking_sync_at: new Date().toISOString() })
        .eq("id", order.id);

      const trackPayload: Record<string, any> = {};
      if (order.waybill) trackPayload.awb = order.waybill;
      if (order.shipment_id) trackPayload.shipment_id = order.shipment_id;

      let data: any = {};
      try {
        data = await icarryCall(ENDPOINTS.track, trackPayload);
      } catch (err: any) {
        console.warn(`[iCarry track] Track call error for order ${order.id}:`, err?.message || err);
      }

      // Also check api_shipment_status_sync if shipment_id is available
      let syncStatusData: any = null;
      if (order.shipment_id) {
        try {
          const syncRes = await icarryCall(ENDPOINTS.sync, {
            shipment_ids: [order.shipment_id],
          });
          if (Array.isArray(syncRes?.msg) && syncRes.msg.length > 0) {
            syncStatusData = syncRes.msg[0];
          }
        } catch (err: any) {
          console.warn(`[iCarry track] Sync call error for order ${order.id}:`, err?.message || err);
        }
      }

      // Extract accurate carrier status (inspects details history for cancellation too)
      const extraction = extractStatusFromTrackResponse(data, syncStatusData);
      const transition = calculateOrderTransition(
        order,
        extraction.effectiveStatus,
        extraction.carrierDatePicked,
        extraction.carrierDateDelivered
      );

      let finalStatus = order.status;
      let finalDeliveryStatus = order.delivery_status;

      if (transition.shouldUpdate && transition.updates && Object.keys(transition.updates).length > 0) {
        const { error: updErr } = await supabaseAdmin
          .from("orders")
          .update(transition.updates)
          .eq("id", order.id);

        if (updErr) {
          console.error(`[iCarry track] DB update failed for order ${order.id}:`, updErr);
        } else {
          console.log(`[iCarry track] Successfully updated order ${order.id}:`, transition.updates);
          if (transition.updates.status) finalStatus = transition.updates.status;
          if (transition.updates.delivery_status) finalDeliveryStatus = transition.updates.delivery_status;
        }
      }

      return new Response(JSON.stringify({
        ...data,
        orderId: order.id,
        courier_name: order.courier_name,
        tracking_url: order.tracking_url,
        status: finalStatus,
        delivery_status: finalDeliveryStatus,
        updates: transition.updates || {},
        isCancelled: extraction.isCancelled,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─────────────────────────────────────────────────────────────
    // ADMIN-ONLY ACTIONS: label, cancel, retryBooking
    // ─────────────────────────────────────────────────────────────
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: Admin privileges required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. PRINT LABEL (Admin only)
    if (action === "label") {
      let shipmentId = payload.shipment_id;
      if (!shipmentId && payload.orderId) {
        const { data: order } = await supabaseAdmin
          .from("orders")
          .select("shipment_id")
          .eq("id", payload.orderId)
          .maybeSingle();
        shipmentId = order?.shipment_id;
      }

      if (!shipmentId) {
        return new Response(JSON.stringify({ error: "Missing shipment_id for label printing" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await icarryCall(ENDPOINTS.label, { shipment_id: shipmentId });
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. CANCEL SHIPMENT (Admin only)
    if (action === "cancel") {
      let shipmentId = payload.shipment_id;
      let orderId = payload.orderId;
      const cancelType = payload.cancelType || "shipment_only"; // "shipment_only" | "whole_order"

      if (!shipmentId && orderId) {
        const { data: order } = await supabaseAdmin
          .from("orders")
          .select("id, shipment_id")
          .eq("id", orderId)
          .maybeSingle();
        shipmentId = order?.shipment_id;
      }

      let data: any = { ok: true };
      if (shipmentId) {
        try {
          data = await icarryCall(ENDPOINTS.cancel, { shipment_id: shipmentId });
        } catch (err: any) {
          console.warn("[iCarry cancel] Error calling carrier cancel endpoint:", err?.message || err);
          data = { error: err?.message || "Failed to cancel with carrier" };
        }
      }

      // Update database based on cancellation scope
      if (cancelType === "shipment_only") {
        // "Cancel Pickup Only": Carrier pickup cancelled. Never touches orders.status!
        const updateQuery = orderId
          ? supabaseAdmin.from("orders").update({ delivery_status: "Pickup Cancelled" }).eq("id", orderId)
          : supabaseAdmin.from("orders").update({ delivery_status: "Pickup Cancelled" }).eq("shipment_id", shipmentId);
        await updateQuery;
      } else {
        // "whole_order": Cancels entire order in system
        const updateQuery = orderId
          ? supabaseAdmin.from("orders").update({ delivery_status: "Cancelled", status: "Cancelled" }).eq("id", orderId)
          : supabaseAdmin.from("orders").update({ delivery_status: "Cancelled", status: "Cancelled" }).eq("shipment_id", shipmentId);
        await updateQuery;
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. RETRY BOOKING (Admin only)
    if (action === "retryBooking") {
      const orderId = String(payload.orderId ?? "").trim();
      if (!orderId) {
        return new Response(JSON.stringify({ error: "Missing orderId for retryBooking" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await bookShipmentForOrder(supabaseAdmin, orderId, { forceRebook: true });
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. UPDATE COURIER STATUS MANUALLY (Admin only)
    if (action === "updateCourierStatus") {
      const orderId = String(payload.orderId ?? "").trim();
      if (!orderId) {
        return new Response(JSON.stringify({ error: "Missing orderId for updateCourierStatus" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updates: Record<string, any> = {};
      if (payload.status !== undefined) updates.status = payload.status;
      if (payload.delivery_status !== undefined) updates.delivery_status = payload.delivery_status;
      if (payload.courier_name !== undefined) updates.courier_name = payload.courier_name;
      if (payload.waybill !== undefined) updates.waybill = payload.waybill;
      if (payload.tracking_url !== undefined) updates.tracking_url = payload.tracking_url;
      if (payload.shipped_at !== undefined) updates.shipped_at = payload.shipped_at;
      if (payload.delivered_at !== undefined) updates.delivered_at = payload.delivered_at;
      if (payload.shipment_id !== undefined) updates.shipment_id = payload.shipment_id;
      if (payload.fulfillment_type !== undefined) updates.fulfillment_type = payload.fulfillment_type;
      if (payload.manual_courier_name !== undefined) updates.manual_courier_name = payload.manual_courier_name;
      if (payload.manual_awb !== undefined) updates.manual_awb = payload.manual_awb;
      if (payload.manual_tracking_url !== undefined) updates.manual_tracking_url = payload.manual_tracking_url;

      const { data: updatedOrder, error: updateErr } = await supabaseAdmin
        .from("orders")
        .update(updates)
        .eq("id", orderId)
        .select()
        .single();

      if (updateErr) {
        return new Response(JSON.stringify({ error: updateErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true, order: updatedOrder }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: "${action}"` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.error("iCarry router error:", errMsg);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
