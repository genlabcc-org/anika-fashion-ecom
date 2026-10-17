import { SupabaseClient } from "@supabase/supabase-js";
import { RazorpayClient } from "./client.ts";
import { Product, Order } from "../../_shared/types.ts";
import { finalizeOrder } from "../../_shared/finalizeOrder.ts";

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
const DISCOUNT_CODES: Record<string, number> = {};
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
  isBuyNow?: boolean;
  attemptId?: string | null;
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
    // 0. Idempotency check: Reuse existing pending Razorpay order if same attemptId is open
    if (input.attemptId) {
      const { data: existingPending, error: pendingLookupErr } = await this.supabaseAdmin
        .from("pending_orders")
        .select("*")
        .eq("attempt_id", input.attemptId)
        .eq("user_id", input.userId)
        .maybeSingle();

      if (!pendingLookupErr && existingPending) {
        if (existingPending.status === "pending" && existingPending.razorpay_order_id) {
          console.log(`[RazorpayService] Reusing existing pending Razorpay order ${existingPending.razorpay_order_id} for attempt ${input.attemptId}`);
          const pItems = Array.isArray(existingPending.items) ? existingPending.items : [];
          const mainP = pItems[0];
          const pName = pItems.length > 1
            ? `${mainP?.name || 'Product'} + ${pItems.length - 1} other(s)`
            : mainP?.name || "Anika Order";

          return {
            orderId: existingPending.razorpay_order_id,
            amount: Math.round(Number(existingPending.amount) * 100),
            currency: "INR",
            productName: pName,
          };
        }
      }
    }

    const items = input.items;
    // 1. Query product details and variants from database for all items
    const productIds = items.map(item => item.productId).filter(Boolean);
    const { data: rawProducts, error: dbError } = await this.supabaseAdmin
      .from("products")
      .select("product_id, name, price, discount_price, stock, image_url, images, sku, product_variants(*)")
      .in("product_id", productIds);
    const products = (rawProducts || []) as unknown as any[];

    if (dbError || !products || products.length === 0) {
      throw new Error(`Products not found or database query failed: ${dbError?.message || "Unknown error"}`);
    }

    // 2. Calculate subtotal matching variant price or base product price and build resolved items
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

    for (const item of items) {
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

      // Stock check — fail fast before creating the Razorpay order
      const requestedQty = Number(item.quantity || 1);
      const availableStock = matchedVariant
        ? Number(matchedVariant.stock ?? Infinity)
        : Number(product.stock ?? Infinity);
      if (availableStock < requestedQty) {
        throw new Error(`"${product.name}" doesn't have enough stock`);
      }

      subtotal += itemPrice * requestedQty;

      resolvedItemDetails.push({
        productId: product.product_id,
        name: product.name || "Unknown Product",
        price: itemPrice,
        quantity: requestedQty,
        size: matchedVariant ? (matchedVariant.size ?? null) : (item.size || null),
        color: matchedVariant ? (matchedVariant.color ?? null) : (item.color || null),
        image: itemImage,
        sku: itemSku,
      });
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

    // 4. Safely verify address ownership and record pending_orders in DB
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
        console.warn("[RazorpayService] Address lookup warning for pending order:", err);
      }
    }

    try {
      const pendingItems = resolvedItemDetails.map(it => ({
        productId: it.productId,
        product_id: it.productId,
        name: it.name,
        qty: it.quantity,
        quantity: it.quantity,
        price: it.price,
        size: it.size,
        color: it.color,
        image: it.image,
        image_url: it.image,
        sku: it.sku,
      }));

      const { error: insertErr } = await this.supabaseAdmin
        .from("pending_orders")
        .insert({
          razorpay_order_id: rzOrder.id,
          user_id: input.userId,
          address_id: safeAddressId,
          items: pendingItems,
          amount: grandTotal,
          shipping: shipping,
          discount_code: input.discountCode || null,
          is_buy_now: Boolean(input.isBuyNow),
          status: "pending",
          attempt_id: input.attemptId || null,
        } as any);

      if (insertErr) {
        if (
          insertErr.code === "23505" ||
          insertErr.message?.toLowerCase().includes("unique") ||
          insertErr.message?.toLowerCase().includes("duplicate")
        ) {
          if (input.attemptId) {
            const { data: winningPending } = await this.supabaseAdmin
              .from("pending_orders")
              .select("*")
              .eq("attempt_id", input.attemptId)
              .maybeSingle();

            if (winningPending && winningPending.razorpay_order_id) {
              console.log(`[RazorpayService] Concurrent pending order won for attempt ${input.attemptId}: ${winningPending.razorpay_order_id}`);
              const winningItems = Array.isArray(winningPending.items) ? winningPending.items : [];
              const mainIt = winningItems[0];
              const pName = winningItems.length > 1
                ? `${mainIt?.name || 'Product'} + ${winningItems.length - 1} other(s)`
                : mainIt?.name || "Anika Order";
              return {
                orderId: winningPending.razorpay_order_id,
                amount: Math.round(Number(winningPending.amount) * 100),
                currency: "INR",
                productName: pName,
              };
            }
          }
        }
        console.error("[RazorpayService] Failed to insert pending_orders row:", insertErr);
      } else {
        console.log(`[RazorpayService] Inserted pending order for ${rzOrder.id} with attempt_id: ${input.attemptId || 'none'}`);
      }
    } catch (pendingErr) {
      console.error("[RazorpayService] Failed to insert pending_orders row:", pendingErr);
    }

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

    // 2. Finalize order idempotently using shared finalizeOrder
    const result = await finalizeOrder({
      razorpay_order_id: input.razorpay_order_id,
      razorpay_payment_id: input.razorpay_payment_id,
      razorpay_signature: input.razorpay_signature,
      supabaseAdmin: this.supabaseAdmin,
    });

    if (!result.success) {
      if (result.missingPending) {
        throw new Error(
          `Order creation details not found for ${input.razorpay_order_id}. Payment ID: ${input.razorpay_payment_id}. Please contact support.`
        );
      }
      throw new Error(result.error || "Failed to finalize order.");
    }

    return result.order;
  }

  /**
   * Helper to ensure pending_orders exists if createOrder didn't persist it.
   */
  private async createPendingOrderFallback(input: VerifyPaymentInput): Promise<void> {
    try {
      const productIds = input.items.map(item => item.productId).filter(Boolean);
      const { data: rawProducts } = await this.supabaseAdmin
        .from("products")
        .select("product_id, name, price, discount_price, image_url, images, sku, product_variants(*)")
        .in("product_id", productIds);
      const products = (rawProducts || []) as unknown as any[];

      let subtotal = 0;
      const resolvedItemDetails: any[] = [];

      for (const item of input.items) {
        const product = products.find(p => String(p.product_id) === String(item.productId));
        if (!product) continue;

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

        const qty = Number(item.quantity || 1);
        subtotal += itemPrice * qty;

        resolvedItemDetails.push({
          productId: product.product_id,
          product_id: product.product_id,
          name: product.name || "Product",
          price: itemPrice,
          quantity: qty,
          qty: qty,
          size: matchedVariant ? (matchedVariant.size ?? null) : (item.size || null),
          color: matchedVariant ? (matchedVariant.color ?? null) : (item.color || null),
          image: itemImage,
          image_url: itemImage,
          sku: itemSku,
        });
      }

      const discountAmount = Math.round((subtotal * discountPctFor(input.discountCode)) / 100);
      let shipping = 0;
      try {
        shipping = await this.computeShippingFee(input.userId, input.addressId, subtotal - discountAmount);
      } catch (_) {
        shipping = 0;
      }
      const grandTotal = Math.max(0, subtotal - discountAmount) + shipping;

      await this.supabaseAdmin
        .from("pending_orders")
        .insert({
          razorpay_order_id: input.razorpay_order_id,
          user_id: input.userId,
          address_id: input.addressId ? Number(input.addressId) : null,
          items: resolvedItemDetails,
          amount: grandTotal,
          shipping: shipping,
          discount_code: input.discountCode || null,
          is_buy_now: false,
          status: "pending",
        } as any);
    } catch (err) {
      console.error("[createPendingOrderFallback] Failed to create pending order fallback:", err);
    }
  }

  /**
   * Reconciles payments from Razorpay against public.orders.
   * Lists captured payments from the last N days (default: 7) with no matching orders.razorpay_payment_id.
   */
  async reconcilePayments(days: number = 7): Promise<any[]> {
    const now = Math.floor(Date.now() / 1000);
    const fromTimestamp = now - (days * 24 * 60 * 60);

    const payments = await this.client.listPayments(fromTimestamp, 100);
    const captured = payments.filter((p: any) => p.status === "captured");

    if (captured.length === 0) return [];

    const paymentIds = captured.map((p: any) => p.id);
    const { data: matchedOrders, error } = await this.supabaseAdmin
      .from("orders")
      .select("razorpay_payment_id")
      .in("razorpay_payment_id", paymentIds);

    if (error) {
      throw new Error(`Failed to query orders for payment reconciliation: ${error.message}`);
    }

    const foundPaymentIds = new Set((matchedOrders || []).map((o: any) => o.razorpay_payment_id));

    const missing = captured
      .filter((p: any) => !foundPaymentIds.has(p.id))
      .map((p: any) => ({
        payment_id: p.id,
        order_id: p.order_id,
        amount: (Number(p.amount) || 0) / 100,
        email: p.email || "N/A",
        phone: p.contact || "N/A",
        created_at: new Date(p.created_at * 1000).toISOString(),
      }));

    return missing;
  }
}
