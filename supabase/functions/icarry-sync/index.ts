// supabase/functions/icarry-sync/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleCorsPreflight, corsHeaders } from "../_shared/cors.ts";
import { icarryCall, ENDPOINTS } from "../_shared/icarry.ts";
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

const TIME_BUDGET_MS = 100_000; // ~100s time budget
const FALLBACK_CONCURRENCY = 5; // Concurrency limit for track fallback

Deno.serve(async (req: Request) => {
  const startTime = Date.now();
  const corsResponse = handleCorsPreflight(req);
  if (corsResponse) return corsResponse;

  // Header-only authentication on POST (no GET, no query params)
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Only POST is accepted." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const headerSecret = req.headers.get("x-cron-secret") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    const providedSecret = String(headerSecret || "").trim();
    const expectedSecret = String(
      Deno.env.get("CRON_SECRET") ||
      Deno.env.get("ICARRY_WEBHOOK_TOKEN") ||
      ""
    ).trim();

    // Verify secret with constant-time equality
    const isAuthorized = expectedSecret.length > 0 && await timingSafeEqualStr(providedSecret, expectedSecret);
    if (!isAuthorized) {
      console.warn("[iCarry Sync] 401 Unauthorized: header secret mismatch or CRON_SECRET unset");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[iCarry Sync] Starting batch status sync (max 50 active orders, 100s budget)...");

    // Query up to 50 active, non-terminal orders with a waybill
    const { data: activeOrders, error: fetchErr } = await supabaseAdmin
      .from("orders")
      .select("id, status, delivery_status, waybill, shipment_id, courier_name, shipped_at, delivered_at")
      .not("waybill", "is", null)
      .not("delivery_status", "in", '("Delivered","Cancelled","Canceled","Returned","Returned to Origin","Lost","Damaged","Voided")')
      .not("status", "in", '("Delivered","Cancelled","Refund Completed")')
      .order("order_date", { ascending: false })
      .limit(50);

    if (fetchErr) {
      console.error("[iCarry Sync] Error querying active orders:", fetchErr);
      return new Response(JSON.stringify({ ok: false, error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!activeOrders || activeOrders.length === 0) {
      console.log("[iCarry Sync] No active orders to sync.");
      return new Response(JSON.stringify({
        ok: true,
        scanned: 0,
        updated_count: 0,
        skipped_count: 0,
        failed_count: 0,
        time_ms: Date.now() - startTime,
        message: "No active orders",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[iCarry Sync] Found ${activeOrders.length} active orders to check.`);

    const orderMapByShipmentId = new Map<string, any>();
    const shipmentIdsToSync: (string | number)[] = [];

    for (const order of activeOrders) {
      if (order.shipment_id && String(order.shipment_id).trim()) {
        const sid = String(order.shipment_id).trim();
        orderMapByShipmentId.set(sid, order);
        shipmentIdsToSync.push(sid);
      }
    }

    const updatedOrders: any[] = [];
    const processedOrderIds = new Set<string>();
    let skippedCount = 0;
    let failedCount = 0;

    const isTimeExhausted = () => (Date.now() - startTime) >= TIME_BUDGET_MS;

    // 1. Try batch sync via api_shipment_status_sync
    if (shipmentIdsToSync.length > 0 && !isTimeExhausted()) {
      try {
        console.log(`[iCarry Sync] Calling api_shipment_status_sync with ${shipmentIdsToSync.length} shipment IDs...`);
        const syncRes = await icarryCall(ENDPOINTS.sync, {
          shipment_ids: shipmentIdsToSync,
        });

        const syncItems = Array.isArray(syncRes?.msg) ? syncRes.msg : [];
        console.log(`[iCarry Sync] Received ${syncItems.length} status updates from iCarry.`);

        for (const item of syncItems) {
          if (isTimeExhausted()) {
            console.warn("[iCarry Sync] Time budget reached (~100s) during batch processing. Halting loop.");
            break;
          }

          const sid = String(item.shipment_id || "").trim();
          const order = orderMapByShipmentId.get(sid);
          if (!order) continue;

          processedOrderIds.add(order.id);

          const carrierDatePicked = item.date_picked || item["date_picked "];
          const carrierDateDelivered = item.date_delivered;

          const transition = calculateOrderTransition(
            order,
            item.status,
            carrierDatePicked,
            carrierDateDelivered
          );

          if (transition.warning) {
            console.warn(`[iCarry Sync] ${transition.warning}`);
          }

          if (!transition.shouldUpdate) {
            skippedCount++;
            continue;
          }

          const { error: updErr } = await supabaseAdmin
            .from("orders")
            .update(transition.updates)
            .eq("id", order.id);

          if (updErr) {
            failedCount++;
            console.error(`[iCarry Sync] Failed to update order ${order.id}:`, updErr);
          } else {
            updatedOrders.push({
              id: order.id,
              waybill: order.waybill,
              updates: transition.updates,
            });
            console.log(`[iCarry Sync] Order ${order.id} updated:`, JSON.stringify(transition.updates));
          }
        }
      } catch (syncErr: any) {
        console.warn("[iCarry Sync] Batch sync error, falling back to individual track calls:", syncErr?.message || syncErr);
      }
    }

    // 2. Fallback for orders not processed by batch sync (run with concurrency of 5)
    const remainingOrders = activeOrders.filter(o => !processedOrderIds.has(o.id));
    if (remainingOrders.length > 0 && !isTimeExhausted()) {
      console.log(`[iCarry Sync] Processing ${remainingOrders.length} remaining orders with concurrency ${FALLBACK_CONCURRENCY}...`);

      for (let i = 0; i < remainingOrders.length; i += FALLBACK_CONCURRENCY) {
        if (isTimeExhausted()) {
          console.warn("[iCarry Sync] Time budget reached (~100s) during fallback tracking. Halting loop.");
          break;
        }

        const chunk = remainingOrders.slice(i, i + FALLBACK_CONCURRENCY);
        await Promise.all(chunk.map(async (order) => {
          if (!order.waybill && !order.shipment_id) {
            skippedCount++;
            return;
          }

          try {
            const trackPayload: Record<string, any> = {};
            if (order.shipment_id) trackPayload.shipment_id = order.shipment_id;
            else if (order.waybill) trackPayload.awb = order.waybill;

            const trackRes = await icarryCall(ENDPOINTS.track, trackPayload);
            const statusText = String(trackRes?.status || "").trim();
            if (!statusText) {
              skippedCount++;
              return;
            }

            const carrierDatePicked = trackRes?.picked_datetime;
            const carrierDateDelivered = trackRes?.delivered_datetime;

            const transition = calculateOrderTransition(
              order,
              statusText,
              carrierDatePicked,
              carrierDateDelivered
            );

            if (transition.warning) {
              console.warn(`[iCarry Sync Fallback] ${transition.warning}`);
            }

            if (!transition.shouldUpdate) {
              skippedCount++;
              return;
            }

            const { error: updErr } = await supabaseAdmin
              .from("orders")
              .update(transition.updates)
              .eq("id", order.id);

            if (updErr) {
              failedCount++;
              console.error(`[iCarry Sync Fallback] Failed to update order ${order.id}:`, updErr);
            } else {
              updatedOrders.push({
                id: order.id,
                waybill: order.waybill,
                updates: transition.updates,
              });
              console.log(`[iCarry Sync Fallback] Order ${order.id} updated:`, JSON.stringify(transition.updates));
            }
          } catch (err: any) {
            failedCount++;
            console.warn(`[iCarry Sync Fallback] Error tracking order ${order.id}:`, err?.message || err);
          }
        }));
      }
    }

    const elapsedMs = Date.now() - startTime;
    return new Response(JSON.stringify({
      ok: true,
      scanned: activeOrders.length,
      updated_count: updatedOrders.length,
      skipped_count: skippedCount,
      failed_count: failedCount,
      time_ms: elapsedMs,
      budget_exhausted: isTimeExhausted(),
      updated: updatedOrders,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[iCarry Sync] Unexpected error:", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
