import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const API_VERSION = Deno.env.get("WHATSAPP_API_VERSION") ?? "v22.0";

function formatPhone(phone?: string | null): string | null {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) digits = `91${digits}`;
  else if (digits.length === 11 && digits.startsWith("0")) digits = `91${digits.slice(1)}`;
  return digits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // 1. Identify caller from JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    // 2. Admin verification (matching public.admin_users schema where column is 'id')
    const { data: adminRow } = await admin
      .from("admin_users")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (adminRow?.role !== "admin") return json({ error: "Forbidden" }, 403);

    // 3. Input payload
    const { orderId, courierName, trackingId, trackingUrl, force = false } = await req.json();
    if (!orderId || !trackingId) return json({ error: "orderId and trackingId are required" }, 400);

    // 4. Load order from DB
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();
    if (orderErr || !order) return json({ error: "Order not found" }, 404);

    // 5. Duplicate guard
    if (order.whatsapp_tracking_sent_at && !force) {
      return json({ success: true, skipped: true, reason: "Already sent" });
    }

    let customerName = "";
    let customerPhone = "";
    if (order.address_id) {
      const { data: addr } = await admin
        .from("addresses")
        .select("full_name, phone_number")
        .eq("address_id", order.address_id)
        .maybeSingle();
      customerName = addr?.full_name ?? "";
      customerPhone = addr?.phone_number ?? "";
    }
    customerName = (customerName || order.shipping_name || "Valued Customer").trim();
    customerPhone = customerPhone || order.phone || order.shipping_phone || "";

    const to = formatPhone(customerPhone);
    if (!to) return json({ success: false, error: "No valid customer phone number found" }, 422);

    // 6. Template parameters:
    // {{1}} Customer Name, {{2}} Order ID, {{3}} Courier, {{4}} Tracking No, {{5}} Link
    const params = [
      customerName,
      String(order.id ?? orderId),
      (courierName || order.manual_courier_name || "Franch Express").trim(),
      String(trackingId).trim(),
      (trackingUrl || order.manual_tracking_url || "https://anikaa.in").trim(),
    ].map((v) => ({ type: "text", text: v || "N/A" }));

    // 7. Dispatch via Meta Graph API
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;
    const templateName = Deno.env.get("WHATSAPP_TEMPLATE_NAME") ?? "order_confirmation_msg";
    const primaryLang = Deno.env.get("WHATSAPP_TEMPLATE_LANG") ?? "en_US";

    const callMeta = async (lang: string) => {
      const resp = await fetch(`https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: lang },
            components: [{ type: "body", parameters: params }],
          },
        }),
      });
      return { ok: resp.ok, status: resp.status, data: await resp.json() };
    };

    let metaResult = await callMeta(primaryLang);

    // Fallback if template is 'en' instead of 'en_US'
    if (!metaResult.ok && metaResult.data?.error?.code === 132001) {
      const altLang = primaryLang === "en_US" ? "en" : "en_US";
      console.warn(`Template not found for ${primaryLang}, retrying with ${altLang}...`);
      const retryResult = await callMeta(altLang);
      if (retryResult.ok) {
        metaResult = retryResult;
      }
    }

    if (!metaResult.ok) {
      console.error("WhatsApp API error:", JSON.stringify(metaResult.data));
      return json(
        {
          success: false,
          error: metaResult.data?.error?.message ?? "WhatsApp send failed",
          code: metaResult.data?.error?.code,
        },
        502,
      );
    }

    // 8. Mark as sent in orders table
    const { error: markErr } = await admin
      .from("orders")
      .update({ whatsapp_tracking_sent_at: new Date().toISOString() })
      .eq("id", orderId);

    if (markErr) console.error("Failed to mark WhatsApp as sent:", markErr);

    return json({ success: true, messageId: metaResult.data?.messages?.[0]?.id ?? null });
  } catch (err: any) {
    console.error("send-whatsapp-tracking failed:", err);
    return json({ success: false, error: String(err?.message ?? err) }, 500);
  }
});

