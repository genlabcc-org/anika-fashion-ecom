import { SupabaseClient } from "@supabase/supabase-js";
import { RazorpayClient } from "./client.ts";
import { Product, Order } from "../../_shared/types.ts";
import { bookShipmentForOrder } from "../../_shared/bookShipment.ts";

/** Normalise a state name for comparison (same logic as the frontend). */
function normState(s: string | null | undefined): string {
  return String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");
}

/** Pick the matching shipping-rate row and return the fee. */
function calcFee(
  rates: Array<{ state: string; fee: number; free_above: number | null }>,
  state: string,
  amountAfterDiscount: number,
): number {
  const row =
    rates.find((r) => normState(r.state) === normState(state)) ||
    rates.find((r) => r.state === "__default__");
  if (!row) return 0;
  if (row.free_above != null && amountAfterDiscount >= Number(row.free_above)) return 0;
  return Number(row.fee) || 0;
}

/** Server-side discount code → percentage map. The client cannot choose the %. */
const DISCOUNT_CODES: Record<string, number> = { WELCOME10: 10, FESTIVE20: 20 };
const discountPctFor = (code?: string | null) =>
  DISCOUNT_CODES[String(code || "").trim().toUpperCase()] ?? 0;

export interface CreateOrderInput {
  userId: string;
  items: Array<{
    productId: string | number;
    quantity?: number;
    price?: number;
    size?: string | null;
    color?: string | null;
  }>;
  addressId?: number | string;
  discountCode?: string | null;
}

export interface CreateOrderResult {
  orderId: string;
  amount: number;
  currency: string;
  productName: string;
}

export interface VerifyPaymentInput {
  userId: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  items: Array<{
    productId: string | number;
    quantity?: number;
    price?: number;
    size?: string | null;
    color?: string | null;
  }>;
  addressId?: number | string;
  discountCode?: string | null;
}

export class RazorpayService {
  private client: RazorpayClient;
  private supabaseAdmin: SupabaseClient;

  constructor(supabaseAdmin: SupabaseClient) {
    this.client = new RazorpayClient();
    this.supabaseAdmin = supabaseAdmin;
  }

  /**
   * Compute shipping fee server-side (fail-closed):
   *   1. Verify the address belongs to the user and get its state
   *   2. Read active shipping_rates from the DB
   *   3. Run calcFee (same logic as the frontend)
   *   Throws on any failure — never silently grants free shipping.
   */
  private async computeShippingFee(
    userId: string,
    addressId: number | string | undefined,
    amountAfterDiscount: number,
  ): Promise<number> {
    if (!addressId) throw new Error("Delivery address is required");

    const { data: addr, error: addrErr } = await this.supabaseAdmin
      .from("addresses")
      .select("state")
      .eq("address_id", Number(addressId))
      .eq("user_id", userId)
      .maybeSingle();
    if (addrErr || !addr?.state) throw new Error("Invalid delivery address");

    const { data: rates, error: rateErr } = await this.supabaseAdmin
      .from("shipping_rates")
      .select("state, fee, free_above")
      .eq("is_active", true);
    if (rateErr || !rates?.length) throw new Error("Shipping rates unavailable");

    return calcFee(rates as any, addr.state, amountAfterDiscount);
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const items = input.items;
    // 1. Query product details and variants from database for all items
    const productIds = items.map(item => item.productId).filter(Boolean);
    const { data: rawProducts, error: dbError } = await this.supabaseAdmin
      .from("products")
      .select("product_id, name, price, discount_price, stock, product_variants(*)")
      .in("product_id", productIds);
    const products = (rawProducts || []) as unknown as any[];

    if (dbError || !products || products.length === 0) {
      throw new Error(`Products not found or database query failed: ${dbError?.message || "Unknown error"}`);
    }

    // 2. Calculate subtotal matching variant price or base product price
    let subtotal = 0;
    for (const item of items) {
      const product = products.find(p => String(p.product_id) === String(item.productId));
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      const variants = product.product_variants || [];
      let itemPrice = 0;
      let matchedVariant: any = null;

      if (variants.length > 0) {
        matchedVariant = variants.find((v: any) => {
          const matchSize = item.size ? String(v.size || '').trim().toLowerCase() === String(item.size).trim().toLowerCase() : true;
          const matchColor = item.color ? String(v.color || '').trim().toLowerCase() === String(item.color).trim().toLowerCase() : true;
          return matchSize && matchColor;
        }) || variants.find((v: any) => {
          return item.size ? String(v.size || '').trim().toLowerCase() === String(item.size).trim().toLowerCase() : true;
        }) || variants[0];

        itemPrice = Number(matchedVariant?.price || 0);
      }

      if (itemPrice === 0) {
        const rawPrice = Number(product.price || 0);
        const rawDiscount = Number(product.discount_price || 0);
        itemPrice = rawDiscount > 0 ? rawPrice - rawDiscount : rawPrice;
      }

      if (itemPrice === 0) {
        throw new Error(`Product ${item.productId} has no valid price in the database`);
      }

      // Stock check — fail fast before creating the Razorpay order
      const requestedQty = Number(item.quantity || 1);
      const availableStock = matchedVariant
        ? Number(matchedVariant.stock ?? Infinity)
        : Number(product.stock ?? Infinity);
      if (availableStock < requestedQty) {
        throw new Error(`"${product.name}" doesn't have enough stock`);
      }

      subtotal += itemPrice * requestedQty;
    }

    // Apply discount (server-side code lookup) and shipping fee
    const discountAmount = Math.round((subtotal * discountPctFor(input.discountCode)) / 100);

    const shipping = await this.computeShippingFee(input.userId, input.addressId, subtotal - discountAmount);
    // GST is already included in product price — do not add extra
    const grandTotal = Math.max(0, subtotal - discountAmount) + shipping;
    const amountInPaise = Math.round(grandTotal * 100);

    // 3. Create order on Razorpay
    const receiptId = `receipt_order_${Date.now()}`;
    const notes: Record<string, string> = {};
    if (input.addressId) {
      notes.address_id = String(input.addressId);
    }
    const rzOrder = await this.client.createOrder(amountInPaise, receiptId, notes);

    const mainItem = items[0];
    const mainProduct = products.find(p => String(p.product_id) === String(mainItem.productId));
    const productName = items.length > 1
      ? `${mainProduct?.name || 'Product'} + ${items.length - 1} other(s)`
      : mainProduct?.name || "Anika Order";

    return {
      orderId: rzOrder.id,
      amount: amountInPaise,
      currency: "INR",
      productName,
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<Order> {
    // 1. Verify Razorpay HMAC signature
    const isSignatureValid = this.client.verifySignature(
      input.razorpay_order_id,
      input.razorpay_payment_id,
      input.razorpay_signature
    );

    if (!isSignatureValid) {
      throw new Error("Invalid signature verification failed");
    }

    // 2. Fetch authentic product details to record final order amount
    const productIds = input.items.map(item => item.productId).filter(Boolean);
    const { data: rawProducts, error: dbError } = await this.supabaseAdmin
      .from("products")
      .select("product_id, name, price, discount_price, image_url, images, sku, product_variants(*)")
      .in("product_id", productIds);
    const products = (rawProducts || []) as unknown as any[];

    if (dbError || !products || products.length === 0) {
      throw new Error(`Products not found or database query failed: ${dbError?.message || "Unknown error"}`);
    }

    let subtotal = 0;
    const resolvedItemDetails: Array<{
      productId: any;
      name: string;
      price: number;
      quantity: number;
      size: string | null;
      color: string | null;
      image: string | null;
      sku: string | null;
    }> = [];

    for (const item of input.items) {
      const product = products.find(p => String(p.product_id) === String(item.productId));
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      const variants = product.product_variants || [];
      let itemPrice = 0;
      let matchedVariant: any = null;
      let itemImage = product.image_url || (product.images && product.images[0]) || null;
      let itemSku: string | null = product.sku || null;

      if (variants.length > 0) {
        matchedVariant = variants.find((v: any) => {
          const matchSize = item.size ? String(v.size || '').trim().toLowerCase() === String(item.size).trim().toLowerCase() : true;
          const matchColor = item.color ? String(v.color || '').trim().toLowerCase() === String(item.color).trim().toLowerCase() : true;
          return matchSize && matchColor;
        }) || variants.find((v: any) => {
          return item.size ? String(v.size || '').trim().toLowerCase() === String(item.size).trim().toLowerCase() : true;
        }) || variants[0];

        itemPrice = Number(matchedVariant?.price || 0);
        itemSku = matchedVariant?.sku || itemSku;
        if (matchedVariant?.images && matchedVariant.images.length > 0) {
          itemImage = matchedVariant.images[0];
        }
      }

      if (itemPrice === 0) {
        const rawPrice = Number(product.price || 0);
        const rawDiscount = Number(product.discount_price || 0);
        itemPrice = rawDiscount > 0 ? rawPrice - rawDiscount : rawPrice;
      }

      if (itemPrice === 0) {
        throw new Error(`Product ${item.productId} has no valid price in the database`);
      }

      const qty = Number(item.quantity || 1);
      subtotal += itemPrice * qty;

      resolvedItemDetails.push({
        productId: product.product_id,
        name: product.name || "Unknown Product",
        price: itemPrice,
        quantity: qty,
        size:  matchedVariant ? (matchedVariant.size ?? null)  : (item.size  || null),
        color: matchedVariant ? (matchedVariant.color ?? null) : (item.color || null),
        image: itemImage,
        sku: itemSku,
      });
    }

    const discountAmount = Math.round((subtotal * discountPctFor(input.discountCode)) / 100);

    const shipping = await this.computeShippingFee(input.userId, input.addressId, subtotal - discountAmount);
    // GST is already included in product price — do not add extra
    const grandTotal = Math.max(0, subtotal - discountAmount) + shipping;
  
    const mainItem = resolvedItemDetails[0];
    const itemName = resolvedItemDetails.length > 1
      ? `${mainItem?.name} + ${resolvedItemDetails.length - 1} other(s)`
      : mainItem?.name || "Anika Order";

    // 3. Verify address ownership if addressId was provided (falls back to null without throwing)
    let safeAddressId: number | null = null;
    if (input.addressId) {
      try {
        const { data: addr } = await this.supabaseAdmin
          .from("addresses")
          .select("address_id")
          .eq("address_id", Number(input.addressId))
          .eq("user_id", input.userId)
          .maybeSingle();
        safeAddressId = addr?.address_id ?? null;
      } catch (err) {
        console.warn("Failed to verify address ownership, falling back to null:", err);
        safeAddressId = null;
      }
    }

    // 4. Insert order record using admin client (bypasses RLS limits if any)
    const { data: rawOrder, error: insertError } = await this.supabaseAdmin
      .from("orders")
      .insert({
        user_id: input.userId,
        address_id: safeAddressId,
        item_name: itemName,
        quantity: resolvedItemDetails.reduce((sum, item) => sum + item.quantity, 0),
        total_price: grandTotal,
        shipping_fee: shipping,
        payment: "Razorpay",
        type: "Regular",
        status: "Paid",
        razorpay_order_id: input.razorpay_order_id,
        razorpay_payment_id: input.razorpay_payment_id,
        razorpay_signature: input.razorpay_signature,
      } as unknown as never)
      .select()
      .single();
    const order = rawOrder as unknown as Order | null;

    if (insertError || !order) {
      throw new Error(`Failed to insert order: ${insertError?.message || "Unknown error"}`);
    }

    // 4. Insert child order items for each item in order
    const orderItemsToInsert = resolvedItemDetails.map(item => ({
      order_id: order.id,
      product_id: item.productId,
      product_name: item.name,
      quantity: item.quantity,
      price: item.price,
      size: item.size,
      color: item.color,
      image_url: item.image,
      sku: item.sku,
    }));

    const { error: itemsInsertError } = await this.supabaseAdmin
      .from("order_items")
      .insert(orderItemsToInsert as unknown as never[]);

    if (itemsInsertError) {
      throw new Error(`Failed to insert order items: ${itemsInsertError.message}`);
    }

    // 5. Deduct stock (idempotent Postgres function, service-role only)
    try {
      const { error: stockErr } = await this.supabaseAdmin.rpc(
        "deduct_order_stock",
        { p_order_id: order.id }
      );
      if (stockErr) {
        console.error(`[Stock] deduct_order_stock failed for order ${order.id}:`, stockErr.message);
        await this.supabaseAdmin.from("orders")
          .update({ admin_notes: `STOCK NOT DEDUCTED: ${stockErr.message}` } as any)
          .eq("id", order.id);
      }
    } catch (stockEx) {
      const msg = stockEx instanceof Error ? stockEx.message : String(stockEx);
      console.error(`[Stock] Unexpected error deducting stock for order ${order.id}:`, stockEx);
      try {
        await this.supabaseAdmin.from("orders")
          .update({ admin_notes: `STOCK NOT DEDUCTED: ${msg}` } as any)
          .eq("id", order.id);
      } catch (_) { /* best-effort; never throw after payment */ }
    }

    // 6. Automatically book shipment with iCarry after order and payment are confirmed
    try {
      const bookingResult = await bookShipmentForOrder(this.supabaseAdmin, order.id);
      if (bookingResult.ok) {
        order.waybill = bookingResult.waybill;
        order.shipment_id = bookingResult.shipment_id;
        order.courier_name = bookingResult.courier_name;
        order.tracking_url = bookingResult.tracking_url;
        order.delivery_status = "Booked";
      } else {
        console.warn(`[iCarry] Auto-booking after payment failed for order ${order.id}:`, bookingResult.error);
        order.delivery_status = "Booking Failed";
        order.shipment_error = bookingResult.error;
      }
    } catch (bookingErr) {
      console.error(`[iCarry] Unexpected error during auto-booking for order ${order.id}:`, bookingErr);
      // Never throw — the customer's payment succeeded and order is saved
    }

    return order;
  }
}
