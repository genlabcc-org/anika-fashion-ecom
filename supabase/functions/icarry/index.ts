// supabase/functions/icarry/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleCorsPreflight, corsHeaders } from "../_shared/cors.ts";
import { icarryCall, ENDPOINTS } from "../_shared/icarry.ts";
import { bookShipmentForOrder } from "../_shared/bookShipment.ts";

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

    // Authenticate user for all remaining actions
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid or missing token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isAdmin = await checkIsAdmin(user.id);

    // ─────────────────────────────────────────────────────────────
    // 2. TRACK SHIPMENT (Logged-in user: own order only; Admin: any order)
    // ─────────────────────────────────────────────────────────────
    if (action === "track") {
      const orderId = String(payload.orderId ?? "").trim();
      if (!orderId) {
        return new Response(JSON.stringify({ error: "orderId is required to track shipment" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let query = supabaseAdmin
        .from("orders")
        .select("id, user_id, waybill, shipment_id, courier_name, tracking_url, delivery_status")
        .eq("id", orderId);

      // Non-admin users can only track their own orders
      if (!isAdmin) {
        query = query.eq("user_id", user.id);
      }

      const { data: order, error: orderErr } = await query.maybeSingle();

      if (orderErr || !order) {
        return new Response(JSON.stringify({ error: "Order not found or access denied" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!order.waybill && !order.shipment_id) {
        return new Response(JSON.stringify({
          error: "Shipment has not been booked or assigned a waybill yet",
          delivery_status: order.delivery_status,
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const trackPayload: Record<string, any> = {};
      if (order.waybill) trackPayload.awb = order.waybill;
      if (order.shipment_id) trackPayload.shipment_id = order.shipment_id;

      const data = await icarryCall(ENDPOINTS.track, trackPayload);
      return new Response(JSON.stringify({
        ...data,
        orderId: order.id,
        courier_name: order.courier_name,
        tracking_url: order.tracking_url,
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

      if (!shipmentId && orderId) {
        const { data: order } = await supabaseAdmin
          .from("orders")
          .select("id, shipment_id")
          .eq("id", orderId)
          .maybeSingle();
        shipmentId = order?.shipment_id;
      }

      if (!shipmentId) {
        return new Response(JSON.stringify({ error: "Missing shipment_id for cancellation" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await icarryCall(ENDPOINTS.cancel, { shipment_id: shipmentId });

      // On successful cancellation from iCarry, mark delivery_status = 'Cancelled'
      if (!data?.error) {
        const updateQuery = orderId
          ? supabaseAdmin.from("orders").update({ delivery_status: "Cancelled" }).eq("id", orderId)
          : supabaseAdmin.from("orders").update({ delivery_status: "Cancelled" }).eq("shipment_id", shipmentId);
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

      const result = await bookShipmentForOrder(supabaseAdmin, orderId);
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 400,
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
