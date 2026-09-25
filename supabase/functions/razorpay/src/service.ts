import { SupabaseClient } from "@supabase/supabase-js";
import { RazorpayClient } from "./client.ts";
import { Product, Order } from "../../_shared/types.ts";
import { bookShipmentForOrder } from "../../_shared/bookShipment.ts";

export interface CreateOrderInput {
  items: Array<{
    productId: string | number;
    quantity?: number;
    size?: string | null;
    color?: string | null;
  }>;
  addressId?: number | string;
  discountCode?: string | null;
  discountPct?: number;
  shippingFee?: number;
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
    size?: string | null;
    color?: string | null;
  }>;
  addressId?: number | string;
  discountCode?: string | null;
  discountPct?: number;
  shippingFee?: number;
}

export class RazorpayService {
  private client: RazorpayClient;
  private supabaseAdmin: SupabaseClient;

  constructor(supabaseAdmin: SupabaseClient) {
    this.client = new RazorpayClient();
    this.supabaseAdmin = supabaseAdmin;
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const items = input.items;
    // 1. Query product details and variants from database for all items
    const productIds = items.map(item => item.productId).filter(Boolean);
    const { data: rawProducts, error: dbError } = await this.supabaseAdmin
      .from("products")
      .select("product_id, name, price, discount_price, product_variants(*)")
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

      if (variants.length > 0) {
        const matchedVariant = variants.find((v: any) => {
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

      if (itemPrice === 0 && item.price && Number(item.price) > 0) {
        itemPrice = Number(item.price);
      }

      subtotal += itemPrice * Number(item.quantity || 1);
    }

    // Apply discount and shipping fee (no hardcoded +800)
    let discountAmount = 0;
    if (input.discountCode === "FESTIVE20" || (input.discountPct && input.discountPct > 0)) {
      const pct = input.discountPct || 20;
      discountAmount = Math.round((subtotal * pct) / 100);
    }

    const shipping = Number(input.shippingFee || 0);
    const gstAmount = Math.round(Math.max(0, subtotal - discountAmount) * 0.03);
    const grandTotal = Math.max(0, subtotal - discountAmount) + gstAmount + shipping;
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
      .select("product_id, name, price, discount_price, image_url, images, product_variants(*)")
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
    }> = [];

    for (const item of input.items) {
      const product = products.find(p => String(p.product_id) === String(item.productId));
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      const variants = product.product_variants || [];
      let itemPrice = 0;
      let itemImage = product.image_url || (product.images && product.images[0]) || null;

      if (variants.length > 0) {
        const matchedVariant = variants.find((v: any) => {
          const matchSize = item.size ? String(v.size || '').trim().toLowerCase() === String(item.size).trim().toLowerCase() : true;
          const matchColor = item.color ? String(v.color || '').trim().toLowerCase() === String(item.color).trim().toLowerCase() : true;
          return matchSize && matchColor;
        }) || variants.find((v: any) => {
          return item.size ? String(v.size || '').trim().toLowerCase() === String(item.size).trim().toLowerCase() : true;
        }) || variants[0];

        itemPrice = Number(matchedVariant?.price || 0);
        if (matchedVariant?.images && matchedVariant.images.length > 0) {
          itemImage = matchedVariant.images[0];
        }
      }

      if (itemPrice === 0) {
        const rawPrice = Number(product.price || 0);
        const rawDiscount = Number(product.discount_price || 0);
        itemPrice = rawDiscount > 0 ? rawPrice - rawDiscount : rawPrice;
      }

      if (itemPrice === 0 && item.price && Number(item.price) > 0) {
        itemPrice = Number(item.price);
      }

      const qty = Number(item.quantity || 1);
      subtotal += itemPrice * qty;

      resolvedItemDetails.push({
        productId: product.product_id,
        name: product.name || "Unknown Product",
        price: itemPrice,
        quantity: qty,
        size: item.size || null,
        color: item.color || null,
        image: itemImage,
      });
    }

    let discountAmount = 0;
    if (input.discountCode === "FESTIVE20" || (input.discountPct && input.discountPct > 0)) {
      const pct = input.discountPct || 20;
      discountAmount = Math.round((subtotal * pct) / 100);
    }

    const shipping = Number(input.shippingFee || 0);
    const gstAmount = Math.round(Math.max(0, subtotal - discountAmount) * 0.03);
    const grandTotal = Math.max(0, subtotal - discountAmount) + gstAmount + shipping;
  
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
    }));

    const { error: itemsInsertError } = await this.supabaseAdmin
      .from("order_items")
      .insert(orderItemsToInsert as unknown as never[]);

    if (itemsInsertError) {
      throw new Error(`Failed to insert order items: ${itemsInsertError.message}`);
    }

    // 5. Automatically book shipment with iCarry after order and payment are confirmed
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
