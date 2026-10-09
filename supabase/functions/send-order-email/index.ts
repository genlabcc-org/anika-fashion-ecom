// supabase/functions/send-order-email/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleCorsPreflight, corsHeaders } from "../_shared/cors.ts";

const localCorsHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

/**
 * Constant-time string comparison using SHA-256 digests.
 * Prevents timing attacks on the internal shared secret.
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const hashA = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(a)));
  const hashB = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(b)));
  let mismatch = 0;
  for (let i = 0; i < hashA.byteLength; i++) {
    mismatch |= hashA[i] ^ hashB[i];
  }
  return mismatch === 0;
}

/**
 * Escapes customer-provided strings for safe insertion into HTML email templates.
 */
function escapeHtml(str: unknown): string {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeMarkdown(str: unknown): string {
  if (str == null) return "";
  return String(str).replace(/([_*\[\]()~`>#+=|{}.!-])/g, "\\$1");
}

function formatCurrency(amount: number): string {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

Deno.serve(async (req: Request) => {
  // 1. CORS Preflight
  const corsResponse = handleCorsPreflight(req);
  if (corsResponse) {
    const preflightHeaders = new Headers(corsResponse.headers);
    preflightHeaders.set(
      "Access-Control-Allow-Headers",
      "authorization, x-client-info, apikey, content-type, x-internal-secret"
    );
    return new Response(corsResponse.body, {
      status: corsResponse.status,
      headers: preflightHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...localCorsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Supabase Service Role client for trusted DB operations
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[send-order-email] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return new Response(
      JSON.stringify({ success: false, error: "Server configuration error" }),
      { status: 500, headers: { ...localCorsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 2. Parse request input: Only orderId is accepted
    const body = await req.json().catch(() => ({}));
    const rawOrderId = body?.orderId;
    if (!rawOrderId || typeof rawOrderId !== "string" || !rawOrderId.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing or invalid orderId" }),
        { status: 400, headers: { ...localCorsHeaders, "Content-Type": "application/json" } }
      );
    }
    const orderId = rawOrderId.trim();

    // 3. Authorization check
    // Accept either:
    //  (a) Server-to-server internal secret (x-internal-secret)
    //  (b) Authenticated user JWT where order.user_id === user.id
    const internalSecretEnv = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    const reqInternalSecret = req.headers.get("x-internal-secret");
    let isInternalAuthorized = false;

    if (internalSecretEnv && reqInternalSecret) {
      isInternalAuthorized = await timingSafeEqual(reqInternalSecret, internalSecretEnv);
    }

    let callerUserId: string | null = null;
    if (!isInternalAuthorized) {
      const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
      const token = authHeader?.replace(/^Bearer\s+/i, "")?.trim();

      if (!token) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized: Missing authentication credentials" }),
          { status: 401, headers: { ...localCorsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !authData?.user) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized: Invalid or expired token" }),
          { status: 401, headers: { ...localCorsHeaders, "Content-Type": "application/json" } }
        );
      }
      callerUserId = authData.user.id;
    }

    // 4. Load order from DB with service role
    const { data: order, error: orderFetchErr } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();

    if (orderFetchErr || !order) {
      return new Response(
        JSON.stringify({ success: false, error: `Order not found: ${orderId}` }),
        { status: 404, headers: { ...localCorsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If calling as a logged-in user, ensure ownership
    if (!isInternalAuthorized) {
      if (!callerUserId || order.user_id !== callerUserId) {
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden: You do not have permission to access this order" }),
          { status: 403, headers: { ...localCorsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 5. Idempotent claim: Atomically lock the send
    // update orders set admin_email_sent_at = now() where id = :id and admin_email_sent_at is null returning id
    const { data: claimData, error: claimErr } = await supabaseAdmin
      .from("orders")
      .update({ admin_email_sent_at: new Date().toISOString() })
      .eq("id", orderId)
      .is("admin_email_sent_at", null)
      .select("id");

    if (claimErr) {
      console.error(`[send-order-email] Failed to atomically claim send lock for order ${orderId}:`, claimErr);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to claim email notification lock" }),
        { status: 500, headers: { ...localCorsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!claimData || claimData.length === 0) {
      console.log(`[send-order-email] Email for order ${orderId} already sent previously. Skipping.`);
      return new Response(
        JSON.stringify({ success: true, skipped: true }),
        { status: 200, headers: { ...localCorsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Fetch related data (order_items, address, customer profile / auth metadata)
    const { data: rawOrderItems } = await supabaseAdmin
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);
    const orderItems = rawOrderItems || [];

    // Fetch products catalog details if SKU or category is missing on order_items
    const productIdsToFetch = orderItems
      .filter((item: any) => (!item.sku || !item.category) && item.product_id)
      .map((item: any) => item.product_id);

    const productMap = new Map<number | string, any>();
    if (productIdsToFetch.length > 0) {
      try {
        const { data: prods } = await supabaseAdmin
          .from("products")
          .select("product_id, sku, category_id, categories(name)")
          .in("product_id", productIdsToFetch);
        if (prods) {
          prods.forEach((p: any) => productMap.set(p.product_id, p));
        }
      } catch (err) {
        console.warn("[send-order-email] Failed to fetch additional product metadata:", err);
      }
    }

    let addressData: any = null;
    if (order.address_id) {
      const { data: addr } = await supabaseAdmin
        .from("addresses")
        .select("*")
        .eq("address_id", order.address_id)
        .maybeSingle();
      addressData = addr;
    }

    let profileName = "";
    let profilePhone = "";
    let authUserMetaName = "";
    let authUserEmail = "";
    let authUserPhone = "";

    if (order.user_id) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("name, phone")
        .eq("id", order.user_id)
        .maybeSingle();
      if (profile?.name && profile.name.trim()) profileName = profile.name.trim();
      if (profile?.phone && profile.phone.trim()) profilePhone = profile.phone.trim();

      try {
        const { data: authUserData } = await supabaseAdmin.auth.admin.getUserById(order.user_id);
        if (authUserData?.user) {
          const meta = authUserData.user.user_metadata || {};
          const metaName = meta.name || meta.full_name || meta.user_name || "";
          if (metaName && metaName.trim()) authUserMetaName = metaName.trim();
          if (authUserData.user.email) authUserEmail = authUserData.user.email.trim();
          if (authUserData.user.phone) authUserPhone = authUserData.user.phone.trim();
        }
      } catch (err) {
        console.warn("[send-order-email] Error fetching auth user metadata:", err);
      }
    }

    // Resolve customer name priority:
    // profile name -> auth metadata -> delivery address name -> "Customer"
    const resolvedCustomerName =
      profileName ||
      authUserMetaName ||
      (addressData?.full_name && addressData.full_name.trim()) ||
      "Customer";

    const resolvedCustomerPhone =
      profilePhone ||
      authUserPhone ||
      (addressData?.phone_number && addressData.phone_number.trim()) ||
      "N/A";

    const resolvedCustomerEmail = authUserEmail || "N/A";

    // Format shipping address
    const formattedAddressLines = addressData
      ? [
          addressData.full_name ? `Recipient: ${addressData.full_name}` : null,
          addressData.phone_number ? `Phone: ${addressData.phone_number}` : null,
          addressData.address_line1,
          addressData.address_line2,
          [addressData.city, addressData.state].filter(Boolean).join(", ") +
            (addressData.postal_code ? ` - ${addressData.postal_code}` : ""),
          addressData.country || "India",
        ].filter(Boolean)
      : ["Address not linked / not specified"];
    const formattedAddress = formattedAddressLines.join(", ");

    // Financial calculations
    const itemsDetailed = orderItems.map((item: any, idx: number) => {
      const pMeta = productMap.get(item.product_id);
      const name = item.product_name || `Item #${idx + 1}`;
      const qty = Number(item.quantity) || 1;
      const price = Number(item.price) || 0;
      const size = item.size ? String(item.size).trim() : null;
      const color = item.color ? String(item.color).trim() : null;
      const sku = item.sku || pMeta?.sku || "N/A";
      const category = item.category || pMeta?.categories?.name || "N/A";
      const lineTotal = qty * price;
      return { name, qty, price, size, color, sku, category, lineTotal };
    });

    const subtotal = itemsDetailed.length > 0
      ? itemsDetailed.reduce((sum: number, it: any) => sum + it.lineTotal, 0)
      : Number(order.total_price || 0);

    const shippingFee = Number(order.shipping_fee || 0);
    const grandTotal = Number(order.total_price || 0);
    const discount = (subtotal + shippingFee > grandTotal) ? (subtotal + shippingFee - grandTotal) : 0;
    const paymentMethod = order.payment || "COD";

    // 7. Compose Email Content (HTML & Text)
    const itemsHtml = itemsDetailed.map((it: any, idx: number) => {
      const specs = [
        it.size ? `Size: ${escapeHtml(it.size)}` : null,
        it.color ? `Color: ${escapeHtml(it.color)}` : null,
        it.sku !== "N/A" ? `SKU: ${escapeHtml(it.sku)}` : null,
        it.category !== "N/A" ? `Cat: ${escapeHtml(it.category)}` : null,
      ].filter(Boolean).join(" &nbsp;|&nbsp; ");

      return `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 8px; vertical-align: top;">
            <div style="font-weight: 600; color: #111827; font-size: 14px;">${escapeHtml(it.name)}</div>
            ${specs ? `<div style="font-size: 12px; color: #6b7280; margin-top: 4px;">${specs}</div>` : ""}
          </td>
          <td style="padding: 12px 8px; text-align: center; vertical-align: top; font-size: 14px; color: #374151;">
            ${it.qty}
          </td>
          <td style="padding: 12px 8px; text-align: right; vertical-align: top; font-size: 14px; color: #374151; white-space: nowrap;">
            ${formatCurrency(it.price)}
          </td>
          <td style="padding: 12px 8px; text-align: right; vertical-align: top; font-weight: 600; font-size: 14px; color: #111827; white-space: nowrap;">
            ${formatCurrency(it.lineTotal)}
          </td>
        </tr>
      `;
    }).join("");

    const itemsText = itemsDetailed.map((it: any, idx: number) => {
      const specs = [
        it.size ? `Size: ${it.size}` : null,
        it.color ? `Color: ${it.color}` : null,
        it.sku !== "N/A" ? `SKU: ${it.sku}` : null,
        it.category !== "N/A" ? `Category: ${it.category}` : null,
      ].filter(Boolean).join(" | ");

      return `[${idx + 1}] ${it.name}${specs ? ` (${specs})` : ""}\n    Qty: ${it.qty} x ${formatCurrency(it.price)} = ${formatCurrency(it.lineTotal)}`;
    }).join("\n\n");

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Order #${escapeHtml(order.id)}</title>
</head>
<body style="margin: 0; padding: 20px; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border: 1px solid #e5e7eb;">
    
    <!-- Header -->
    <div style="background-color: #832729; padding: 24px; text-align: center; color: #ffffff;">
      <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">ANIKA FASHION</h1>
      <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9;">New Order Notification</p>
    </div>

    <!-- Order Header Info -->
    <div style="padding: 20px 24px; border-bottom: 1px solid #e5e7eb; background-color: #fafaf9;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="vertical-align: top;">
            <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Order ID</div>
            <div style="font-size: 18px; font-weight: 700; color: #832729; margin-top: 2px;">#${escapeHtml(order.id)}</div>
          </td>
          <td style="text-align: right; vertical-align: top;">
            <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Payment Method</div>
            <div style="font-size: 15px; font-weight: 600; color: #111827; margin-top: 2px;">${escapeHtml(paymentMethod)}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Customer & Shipping Details -->
    <div style="padding: 20px 24px; border-bottom: 1px solid #e5e7eb;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="width: 50%; vertical-align: top; padding-right: 12px;">
            <h3 style="margin: 0 0 10px; font-size: 13px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px;">Customer Details</h3>
            <div style="font-size: 14px; line-height: 1.6; color: #374151;">
              <strong style="color: #111827;">${escapeHtml(resolvedCustomerName)}</strong><br>
              Phone: ${escapeHtml(resolvedCustomerPhone)}<br>
              Email: ${escapeHtml(resolvedCustomerEmail)}
            </div>
          </td>
          <td style="width: 50%; vertical-align: top; padding-left: 12px;">
            <h3 style="margin: 0 0 10px; font-size: 13px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px;">Shipping Address</h3>
            <div style="font-size: 14px; line-height: 1.6; color: #374151;">
              ${escapeHtml(formattedAddress)}
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Items Breakdown -->
    <div style="padding: 20px 24px;">
      <h3 style="margin: 0 0 12px; font-size: 13px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px;">Items Breakdown</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 2px solid #e5e7eb; background-color: #f9fafb;">
            <th style="padding: 8px; text-align: left; font-size: 12px; color: #4b5563; text-transform: uppercase;">Product</th>
            <th style="padding: 8px; text-align: center; font-size: 12px; color: #4b5563; text-transform: uppercase;">Qty</th>
            <th style="padding: 8px; text-align: right; font-size: 12px; color: #4b5563; text-transform: uppercase;">Price</th>
            <th style="padding: 8px; text-align: right; font-size: 12px; color: #4b5563; text-transform: uppercase;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <!-- Financial Totals -->
      <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
        <tr>
          <td style="text-align: right; padding: 6px 8px; font-size: 14px; color: #6b7280;">Subtotal:</td>
          <td style="text-align: right; padding: 6px 8px; font-size: 14px; font-weight: 500; width: 120px;">${formatCurrency(subtotal)}</td>
        </tr>
        ${discount > 0 ? `
        <tr>
          <td style="text-align: right; padding: 6px 8px; font-size: 14px; color: #059669;">Discount:</td>
          <td style="text-align: right; padding: 6px 8px; font-size: 14px; font-weight: 500; color: #059669;">-${formatCurrency(discount)}</td>
        </tr>
        ` : ""}
        <tr>
          <td style="text-align: right; padding: 6px 8px; font-size: 14px; color: #6b7280;">Shipping:</td>
          <td style="text-align: right; padding: 6px 8px; font-size: 14px; font-weight: 500;">${shippingFee > 0 ? formatCurrency(shippingFee) : "Free"}</td>
        </tr>
        <tr style="border-top: 2px solid #e5e7eb;">
          <td style="text-align: right; padding: 12px 8px; font-size: 16px; font-weight: 700; color: #111827;">Grand Total:</td>
          <td style="text-align: right; padding: 12px 8px; font-size: 18px; font-weight: 700; color: #832729;">${formatCurrency(grandTotal)}</td>
        </tr>
      </table>
    </div>

    <!-- Footer -->
    <div style="background-color: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af;">
      This is an automated administrative notification sent from Anika Fashion Store.
    </div>

  </div>
</body>
</html>
    `.trim();

    const textContent = `
[ANIKA FASHION] NEW ORDER NOTIFICATION
======================================
Order ID: #${order.id}
Payment Method: ${paymentMethod}

CUSTOMER DETAILS
----------------
Name: ${resolvedCustomerName}
Phone: ${resolvedCustomerPhone}
Email: ${resolvedCustomerEmail}

SHIPPING ADDRESS
----------------
${formattedAddress}

ITEMS BREAKDOWN
---------------
${itemsText}

FINANCIALS
----------
Subtotal: ${formatCurrency(subtotal)}
Discount: ${discount > 0 ? `-${formatCurrency(discount)}` : "₹0"}
Shipping: ${shippingFee > 0 ? formatCurrency(shippingFee) : "Free"}
Total Amount: ${formatCurrency(grandTotal)}
======================================
    `.trim();

    // 8. Send transactional email via Brevo API
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const brevoSenderEmail = Deno.env.get("BREVO_SENDER_EMAIL") || "no-reply@anikafashion.in";
    const brevoSenderName = Deno.env.get("BREVO_SENDER_NAME") || "Anika Fashion";
    const adminNotifyEmail = Deno.env.get("ADMIN_NOTIFY_EMAIL") || "anikafashionstorengl@gmail.com";

    if (!brevoApiKey) {
      console.error("[send-order-email] Missing BREVO_API_KEY secret.");
      // Rollback claim lock so it can be retried once secret is configured
      await supabaseAdmin
        .from("orders")
        .update({ admin_email_sent_at: null })
        .eq("id", orderId);

      return new Response(
        JSON.stringify({ success: false, error: "Brevo API key is not configured on server" }),
        { status: 500, headers: { ...localCorsHeaders, "Content-Type": "application/json" } }
      );
    }

    const brevoPayload = {
      sender: {
        name: brevoSenderName,
        email: brevoSenderEmail,
      },
      to: [
        {
          email: adminNotifyEmail,
        },
      ],
      subject: `[Anika Fashion] New Order #${order.id}`,
      htmlContent,
      textContent,
    };

    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "api-key": brevoApiKey,
      },
      body: JSON.stringify(brevoPayload),
    });

    if (!brevoRes.ok) {
      const errStatus = brevoRes.status;
      const errBody = await brevoRes.text().catch(() => "");
      console.error(`[send-order-email] Brevo API rejected call (Status ${errStatus}):`, errBody);

      // Rollback send timestamp so the order can be retried later
      await supabaseAdmin
        .from("orders")
        .update({ admin_email_sent_at: null })
        .eq("id", orderId);

      return new Response(
        JSON.stringify({
          success: false,
          error: `Brevo email dispatch failed with status ${errStatus}`,
        }),
        { status: 502, headers: { ...localCorsHeaders, "Content-Type": "application/json" } }
      );
    }

    const brevoResult = await brevoRes.json().catch(() => ({}));
    console.log(`[send-order-email] Notification sent successfully for #${orderId}. Message ID:`, brevoResult?.messageId || "N/A");

    // 9. Optional Telegram alert (wrapped in its own isolated try/catch)
    const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const telegramChatId = Deno.env.get("TELEGRAM_CHAT_ID");

    if (telegramBotToken && telegramChatId) {
      try {
        const tgMessage =
          `🛍️ *New Order #${escapeMarkdown(order.id)}*\n` +
          `👤 *Customer:* ${escapeMarkdown(resolvedCustomerName)}\n` +
          `💳 *Payment:* ${escapeMarkdown(paymentMethod)}\n` +
          `💰 *Total:* ₹${Number(grandTotal).toLocaleString("en-IN")}\n` +
          `📦 *Items:* ${itemsDetailed.length} item(s)`;

        const tgRes = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: tgMessage,
            parse_mode: "Markdown",
          }),
        });

        if (!tgRes.ok) {
          const tgErr = await tgRes.text().catch(() => "");
          console.warn("[send-order-email] Telegram alert failed:", tgRes.status, tgErr);
        } else {
          console.log("[send-order-email] Telegram alert sent successfully.");
        }
      } catch (tgEx) {
        console.warn("[send-order-email] Unexpected error during Telegram alert:", tgEx);
      }
    }

    // 10. Success response
    return new Response(
      JSON.stringify({
        success: true,
        orderId: order.id,
        messageId: brevoResult?.messageId,
      }),
      { status: 200, headers: { ...localCorsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[send-order-email] Unhandled error in function execution:", errMsg);
    return new Response(
      JSON.stringify({ success: false, error: errMsg }),
      { status: 500, headers: { ...localCorsHeaders, "Content-Type": "application/json" } }
    );
  }
});
