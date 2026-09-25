// supabase/functions/_shared/bookShipment.ts
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { icarryCall, ENDPOINTS } from "./icarry.ts";
import { cleanMobile, toStateCode, PARCEL_DEFAULTS } from "./icarryHelpers.ts";

export interface BookShipmentOptions {
  saveOnly?: boolean;
}

export interface BookShipmentResult {
  ok: boolean;
  waybill?: string | null;
  shipment_id?: string | null;
  courier_name?: string | null;
  tracking_url?: string | null;
  skipped?: boolean;
  save_only?: boolean;
  error?: string;
  rawResponse?: any;
}

/**
 * Books an iCarry shipment for an order.
 * - Idempotent: Skips if order.waybill is already present.
 * - Non-throwing: Always catches errors, updates delivery_status and shipment_error,
 *   and returns { ok: false, error } so callers (like payment verification) never fail.
 * - Supports options.saveOnly: true for safe test bookings (save_only: 1).
 */
export async function bookShipmentForOrder(
  supabaseAdmin: SupabaseClient | any,
  orderId: string,
  options?: BookShipmentOptions
): Promise<BookShipmentResult> {
  try {
    // 1. Fetch order details
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, total_price, payment, quantity, address_id, waybill, shipment_id")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !order) {
      const errMsg = orderError?.message || `Order ${orderId} not found`;
      console.error(`[iCarry] Failed to fetch order ${orderId}:`, errMsg);
      return { ok: false, error: errMsg };
    }

    // 2. Idempotency check: Skip if waybill is already assigned
    if (order.waybill) {
      console.log(`[iCarry] Order ${orderId} already booked with waybill: ${order.waybill}`);
      return {
        ok: true,
        waybill: order.waybill,
        shipment_id: order.shipment_id,
        skipped: true,
      };
    }

    const isSaveOnly = !!options?.saveOnly;

    // 3. Ensure order has a linked shipping address
    if (!order.address_id) {
      const errMsg = "Order has no linked shipping address (address_id is null)";
      console.error(`[iCarry] Order ${orderId}: ${errMsg}`);
      if (!isSaveOnly) {
        await supabaseAdmin
          .from("orders")
          .update({ delivery_status: "Booking Failed", shipment_error: errMsg })
          .eq("id", orderId);
      }
      return { ok: false, error: errMsg };
    }

    // 4. Fetch the linked shipping address
    const { data: addr, error: addrError } = await supabaseAdmin
      .from("addresses")
      .select("full_name, phone_number, address_line1, address_line2, city, state, postal_code, country")
      .eq("address_id", order.address_id)
      .maybeSingle();

    if (addrError || !addr) {
      const errMsg = addrError?.message || `Linked address (ID: ${order.address_id}) not found`;
      console.error(`[iCarry] Order ${orderId}: ${errMsg}`);
      if (!isSaveOnly) {
        await supabaseAdmin
          .from("orders")
          .update({ delivery_status: "Booking Failed", shipment_error: errMsg })
          .eq("id", orderId);
      }
      return { ok: false, error: errMsg };
    }

    // 5. Pre-validate address fields before calling iCarry API
    const stateCode = toStateCode(addr.state);
    if (!stateCode) {
      const errMsg = `Unmapped state: "${addr.state || ''}" (no matching iCarry 2-letter state code)`;
      console.error(`[iCarry] Order ${orderId}: ${errMsg}`);
      if (!isSaveOnly) {
        await supabaseAdmin
          .from("orders")
          .update({ delivery_status: "Booking Failed", shipment_error: errMsg })
          .eq("id", orderId);
      }
      return { ok: false, error: errMsg };
    }

    const mobile = cleanMobile(addr.phone_number);
    if (mobile.length !== 10) {
      const errMsg = `Invalid mobile number: "${addr.phone_number || ''}" (must be exactly 10 digits)`;
      console.error(`[iCarry] Order ${orderId}: ${errMsg}`);
      if (!isSaveOnly) {
        await supabaseAdmin
          .from("orders")
          .update({ delivery_status: "Booking Failed", shipment_error: errMsg })
          .eq("id", orderId);
      }
      return { ok: false, error: errMsg };
    }

    const pincode = (addr.postal_code || '').trim();
    if (!pincode) {
      const errMsg = "Consignee postal code is missing";
      console.error(`[iCarry] Order ${orderId}: ${errMsg}`);
      if (!isSaveOnly) {
        await supabaseAdmin
          .from("orders")
          .update({ delivery_status: "Booking Failed", shipment_error: errMsg })
          .eq("id", orderId);
      }
      return { ok: false, error: errMsg };
    }

    const pickupAddressId = Deno.env.get("ICARRY_PICKUP_ADDRESS_ID");
    if (!pickupAddressId) {
      const errMsg = "Missing ICARRY_PICKUP_ADDRESS_ID environment secret";
      console.error(`[iCarry] Order ${orderId}: ${errMsg}`);
      if (!isSaveOnly) {
        await supabaseAdmin
          .from("orders")
          .update({ delivery_status: "Booking Failed", shipment_error: errMsg })
          .eq("id", orderId);
      }
      return { ok: false, error: errMsg };
    }

    // 6. Build the consignee address string
    const fullAddress = addr.address_line2
      ? `${addr.address_line1}, ${addr.address_line2}`.trim()
      : (addr.address_line1 || '').trim();

    // 7. Calculate parcel weight & dimensions for v1
    // (using PARCEL_DEFAULTS.default: weight * quantity, fixed dimensions)
    const qty = Math.max(1, Number(order.quantity || 1));
    const totalWeightGm = PARCEL_DEFAULTS.default.weight * qty;
    const { l, b, h } = PARCEL_DEFAULTS.default;

    // 8. Payment mapping (Razorpay -> 'Prepaid', COD -> 'COD')
    const isCod = String(order.payment || '').toUpperCase() === 'COD';
    const parcelType = isCod ? 'COD' : 'Prepaid';

    // 9. Build iCarry booking payload
    const payload: Record<string, any> = {
      pickup_address_id: pickupAddressId,
      client_order_id: String(order.id),
      ...(isSaveOnly ? { save_only: 1 } : {}),
      consignee: {
        name: (addr.full_name || '').trim(),
        mobile: mobile,
        address: fullAddress,
        city: (addr.city || '').trim(),
        pincode: pincode,
        state: stateCode,
        country_code: 'IN',
      },
      parcel: {
        type: parcelType,
        value: Number(order.total_price || 0),
        currency: 'INR',
        contents: 'Fashion Jewellery',
        weight: {
          weight: totalWeightGm,
          unit: 'gm',
        },
        dimensions: {
          length: l,
          breadth: b,
          height: h,
          unit: 'cm',
        },
      },
    };

    if (isSaveOnly) {
      console.log(`[iCarry] Dry-run booking with save_only: 1 for order ${orderId}`);
    }

    // 10. Call iCarry booking endpoint
    const res = await icarryCall(ENDPOINTS.book, payload);

    if (res?.error || !res?.shipment_id) {
      const errMsg = typeof res?.error === 'string'
        ? res.error.trim()
        : JSON.stringify(res?.error ?? res ?? 'Booking request failed');
      console.error(`[iCarry] Booking failed for order ${orderId}:`, errMsg);

      if (!isSaveOnly) {
        await supabaseAdmin
          .from("orders")
          .update({
            delivery_status: "Booking Failed",
            shipment_error: errMsg,
          })
          .eq("id", orderId);
      }

      return { ok: false, error: errMsg, rawResponse: res };
    }

    // 11. Success: persist shipment details on the order (skipped for dry-run saveOnly)
    const waybill = res.awb ? String(res.awb) : null;
    const shipmentId = res.shipment_id ? String(res.shipment_id) : null;
    const courierName = res.courier_name ? String(res.courier_name) : null;
    const trackingUrl = res.tracking_url ? String(res.tracking_url) : null;

    if (!isSaveOnly) {
      await supabaseAdmin
        .from("orders")
        .update({
          waybill,
          shipment_id: shipmentId,
          courier_name: courierName,
          tracking_url: trackingUrl,
          delivery_status: "Booked",
          shipment_error: null,
        })
        .eq("id", orderId);
      console.log(`[iCarry] Order ${orderId} successfully booked. Waybill: ${waybill}, Shipment ID: ${shipmentId}`);
    } else {
      console.log(`[iCarry] Order ${orderId} dry-run accepted by iCarry (save_only: 1). Database order record left untouched.`);
    }

    return {
      ok: true,
      waybill,
      shipment_id: shipmentId,
      courier_name: courierName,
      tracking_url: trackingUrl,
      save_only: isSaveOnly,
      rawResponse: res,
    };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.error(`[iCarry] Unexpected booking error for order ${orderId}:`, errMsg);

    // Save failure status locally only if not saveOnly dry-run
    if (!options?.saveOnly) {
      try {
        await supabaseAdmin
          .from("orders")
          .update({
            delivery_status: "Booking Failed",
            shipment_error: errMsg,
          })
          .eq("id", orderId);
      } catch (dbErr) {
        console.error(`[iCarry] Failed to record booking error in DB:`, dbErr);
      }
    }

    // Never throw — ensure callers proceed smoothly
    return { ok: false, error: errMsg };
  }
}
