// supabase/functions/_shared/finalizeOrder.ts
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { bookShipmentForOrder } from "./bookShipment.ts";

export interface FinalizeOrderInput {
  razorpay_order_id: string;
  razorpay_payment_id?: string | null;
  razorpay_signature?: string | null;
  supabaseAdmin: SupabaseClient | any;
}

export interface FinalizeOrderResult {
  success: boolean;
  order: any;
  alreadyExisted?: boolean;
  missingPending?: boolean;
  error?: string;
}

/**
 * Invokes send-order-email edge function server-side.
 * Awaited; internal try-catch ensures failures will never disrupt order completion.
 */
async function triggerOrderEmail(orderId: string): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl) {
      console.warn("[send-order-email] SUPABASE_URL not configured, skipping order email trigger");
      return;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (internalSecret) {
      headers["x-internal-secret"] = internalSecret;
    }
    if (serviceRoleKey) {
      headers["Authorization"] = `Bearer ${serviceRoleKey}`;
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/send-order-email`, {
      method: "POST",
      headers,
      body: JSON.stringify({ orderId }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[send-order-email] Trigger returned status ${res.status} for order ${orderId}:`, errText);
    } else {
      console.log(`[send-order-email] Server-side notification email triggered for order ${orderId}`);
    }
  } catch (err) {
    console.warn(`[send-order-email] Failed to invoke send-order-email for order ${orderId}:`, err);
  }
}

/**
 * Idempotently finalizes an order for a given razorpay_order_id and razorpay_payment_id:
 * 1. Checks if the order already exists in public.orders. If so, returns it immediately.
 * 2. Loads the pending_orders record. If missing, logs error and returns { success: false, missingPending: true } without throwing.
 * 3. Inserts public.orders with UNIQUE constraint on razorpay_order_id.
 *    - Uses exact status ("Paid") and payment ("Razorpay") from the previous flow.
 *    - On 23505 conflict, fetches existing order and returns immediately with alreadyExisted: true.
 *    - All side effects (items, stock deduction, iCarry, email, cart clearing) are SKIPPED for the non-winning call.
 * 4. Inserts public.order_items. If it fails, persists admin_notes 'ORDER ITEMS MISSING'.
 * 5. Triggers admin order notification email (awaited).
 * 6. Decrements stock via deduct_order_stock RPC idempotently using atomic stock_deducted flag.
 * 7. Clears user's purchased items from public.cart_items (matching .eq("size", it.size || "").eq("color", it.color || ""); skips Buy Now).
 * 8. Automatically books shipment via iCarry (failures and exceptions persist delivery_status 'Booking Failed' + shipment_error).
 * 9. Updates pending_orders.status = 'completed'.
 */
export async function finalizeOrder(input: FinalizeOrderInput): Promise<FinalizeOrderResult> {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, supabaseAdmin } = input;

  if (!razorpay_order_id) {
    throw new Error("Missing razorpay_order_id in finalizeOrder");
  }

  // 1. Initial Idempotency Check: if order already exists, return it immediately
  const { data: existingOrder, error: checkErr } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("razorpay_order_id", razorpay_order_id)
    .maybeSingle();

  if (checkErr) {
    console.error(`[finalize_order] Error checking existing order for ${razorpay_order_id}:`, checkErr);
  }

  if (existingOrder) {
    console.log(`[finalize_order] Order ${existingOrder.id} already exists for razorpay_order_id ${razorpay_order_id}`);
    if (razorpay_payment_id && !existingOrder.razorpay_payment_id) {
      await supabaseAdmin
        .from("orders")
        .update({ razorpay_payment_id })
        .eq("id", existingOrder.id);
      existingOrder.razorpay_payment_id = razorpay_payment_id;
    }
    return { success: true, order: existingOrder, alreadyExisted: true };
  }

  // 2. Load pending_orders row. If missing, log error and return missingPending without throwing.
  const { data: pending, error: pendingErr } = await supabaseAdmin
    .from("pending_orders")
    .select("*")
    .eq("razorpay_order_id", razorpay_order_id)
    .maybeSingle();

  if (pendingErr || !pending) {
    console.error(
      `[finalize_order] No pending_orders row found for razorpay_order_id: ${razorpay_order_id}, payment_id: ${razorpay_payment_id || "N/A"}`
    );
    return {
      success: false,
      missingPending: true,
      order: null,
      error: `Pending order not found for ${razorpay_order_id}`,
    };
  }

  const items: any[] = Array.isArray(pending.items) ? pending.items : [];
  if (items.length === 0) {
    console.error(
      `[finalize_order] Pending order ${razorpay_order_id} contains no items, payment_id: ${razorpay_payment_id || "N/A"}`
    );
    return {
      success: false,
      missingPending: true,
      order: null,
      error: `Pending order ${razorpay_order_id} has no items`,
    };
  }

  const mainItem = items[0];
  const itemName = items.length > 1
    ? `${mainItem.name || "Product"} + ${items.length - 1} other(s)`
    : mainItem.name || "Anika Order";

  const totalQuantity = items.reduce(
    (sum: number, it: any) => sum + (Number(it.qty ?? it.quantity) || 1),
    0
  );

  // 3. Insert into public.orders (enforcing UNIQUE constraint on razorpay_order_id)
  // Uses exact status: "Paid" and payment: "Razorpay" matching previous verify_payment flow
  const { data: rawOrder, error: insertError } = await supabaseAdmin
    .from("orders")
    .insert({
      user_id: pending.user_id,
      address_id: pending.address_id || null,
      item_name: itemName,
      quantity: totalQuantity,
      total_price: Number(pending.amount),
      shipping_fee: Number(pending.shipping || 0),
      payment: "Razorpay",
      type: "Regular",
      status: "Paid",
      razorpay_order_id,
      razorpay_payment_id: razorpay_payment_id || null,
      razorpay_signature: razorpay_signature || null,
      stock_deducted: false,
    } as any)
    .select()
    .single();

  if (insertError) {
    // If concurrent insert occurred (error 23505), fetch and return the winning order immediately.
    // Skip all side effects (items, stock deduction, iCarry, email, cart clearing).
    if (
      insertError.code === "23505" ||
      insertError.message?.toLowerCase().includes("unique") ||
      insertError.message?.toLowerCase().includes("duplicate")
    ) {
      console.log(`[finalize_order] Unique constraint conflict (23505) for ${razorpay_order_id}. Fetching existing order.`);
      let { data: concurrentOrder } = await supabaseAdmin
        .from("orders")
        .select("*")
        .eq("razorpay_order_id", razorpay_order_id)
        .maybeSingle();

      if (!concurrentOrder) {
        // Small delay if winning transaction is in-flight
        await new Promise((r) => setTimeout(r, 150));
        const res = await supabaseAdmin
          .from("orders")
          .select("*")
          .eq("razorpay_order_id", razorpay_order_id)
          .maybeSingle();
        concurrentOrder = res.data;
      }

      if (concurrentOrder) {
        if (razorpay_payment_id && !concurrentOrder.razorpay_payment_id) {
          await supabaseAdmin
            .from("orders")
            .update({ razorpay_payment_id })
            .eq("id", concurrentOrder.id);
          concurrentOrder.razorpay_payment_id = razorpay_payment_id;
        }
        return { success: true, order: concurrentOrder, alreadyExisted: true };
      }
    }
    throw new Error(`Failed to insert order: ${insertError.message}`);
  }

  const order = rawOrder;

  // 4. Insert child items into public.order_items (only executed by the winning caller)
  const orderItemsToInsert = items.map((it: any) => ({
    order_id: order.id,
    product_id: it.productId || it.product_id || null,
    product_name: it.name || "Product",
    quantity: Number(it.qty ?? it.quantity) || 1,
    price: Number(it.price) || 0,
    size: it.size || null,
    color: it.color || null,
    image_url: it.image || it.image_url || null,
    sku: it.sku || null,
  }));

  const { error: itemsInsertError } = await supabaseAdmin
    .from("order_items")
    .insert(orderItemsToInsert as any[]);

  if (itemsInsertError) {
    console.error(`[finalize_order] Failed to insert order items for order ${order.id}:`, itemsInsertError);
    await supabaseAdmin
      .from("orders")
      .update({
        admin_notes: `ORDER ITEMS MISSING: ${itemsInsertError.message}`,
      } as any)
      .eq("id", order.id);
  }

  // 5. Trigger admin notification email (awaited; internal try-catch protects order flow)
  await triggerOrderEmail(order.id);

  // 6. Deduct stock server-side via RPC (idempotent per order using atomic flag claim)
  try {
    const { data: claimedOrder } = await supabaseAdmin
      .from("orders")
      .update({ stock_deducted: true } as any)
      .eq("id", order.id)
      .eq("stock_deducted", false)
      .select("id")
      .maybeSingle();

    if (claimedOrder) {
      const { error: stockErr } = await supabaseAdmin.rpc("deduct_order_stock", {
        p_order_id: order.id,
      });
      if (stockErr) {
        console.error(`[finalize_order] deduct_order_stock failed for ${order.id}:`, stockErr.message);
        await supabaseAdmin
          .from("orders")
          .update({
            stock_deducted: false,
            admin_notes: `STOCK NOT DEDUCTED: ${stockErr.message}`,
          } as any)
          .eq("id", order.id);
      } else {
        order.stock_deducted = true;
      }
    } else {
      console.log(`[finalize_order] Stock was already deducted for order ${order.id}, skipping duplicate deduction`);
    }
  } catch (stockEx) {
    console.error(`[finalize_order] Unexpected error deducting stock for ${order.id}:`, stockEx);
  }

  // 7. Clear user's purchased items from public.cart_items
  // Delete only cart_items matching purchased product_id + size + color for that user.
  // Do nothing for Buy Now orders.
  try {
    const isBuyNow = Boolean(pending.is_buy_now);
    if (!isBuyNow && pending.user_id) {
      for (const it of items) {
        const prodId = it.productId || it.product_id;
        if (!prodId) continue;

        const { error: cartDelErr } = await supabaseAdmin
          .from("cart_items")
          .delete()
          .eq("user_id", pending.user_id)
          .eq("product_id", prodId)
          .eq("size", it.size || "")
          .eq("color", it.color || "");

        if (cartDelErr) {
          console.warn(`[finalize_order] Failed to delete cart item for product ${prodId}:`, cartDelErr);
        }
      }
      console.log(`[finalize_order] Cleared matching cart items for user ${pending.user_id}`);
    } else if (isBuyNow) {
      console.log(`[finalize_order] Buy Now order detected (${pending.razorpay_order_id}); skipping cart clearing`);
    }
  } catch (cartErr) {
    console.warn(`[finalize_order] Failed to clear cart items for user ${pending.user_id}:`, cartErr);
  }

  // 8. Book shipment with iCarry (persist failure and shipment_error to DB on failure or exception)
  try {
    const bookingResult = await bookShipmentForOrder(supabaseAdmin, order.id);
    if (bookingResult.ok) {
      order.waybill = bookingResult.waybill;
      order.shipment_id = bookingResult.shipment_id;
      order.courier_name = bookingResult.courier_name;
      order.tracking_url = bookingResult.tracking_url;
      order.delivery_status = "Booked";
    } else {
      console.warn(`[finalize_order] iCarry booking failed for order ${order.id}:`, bookingResult.error);
      order.delivery_status = "Booking Failed";
      order.shipment_error = bookingResult.error;
      await supabaseAdmin
        .from("orders")
        .update({
          delivery_status: "Booking Failed",
          shipment_error: bookingResult.error,
        } as any)
        .eq("id", order.id);
    }
  } catch (bookingErr) {
    const errMessage = bookingErr instanceof Error ? bookingErr.message : String(bookingErr);
    console.error(`[finalize_order] Unexpected error during auto-booking for order ${order.id}:`, bookingErr);
    order.delivery_status = "Booking Failed";
    order.shipment_error = errMessage;
    await supabaseAdmin
      .from("orders")
      .update({
        delivery_status: "Booking Failed",
        shipment_error: errMessage,
      } as any)
      .eq("id", order.id);
  }

  // 9. Mark pending_orders as completed
  try {
    await supabaseAdmin
      .from("pending_orders")
      .update({
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", pending.id);
  } catch (updErr) {
    console.warn(`[finalize_order] Failed to mark pending order ${pending.id} completed:`, updErr);
  }

  return { success: true, order, alreadyExisted: false };
}
