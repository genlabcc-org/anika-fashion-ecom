import { createClient } from "npm:@supabase/supabase-js@2";
import { handleCorsPreflight, corsHeaders } from "../_shared/cors.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const API_VERSION = Deno.env.get("WHATSAPP_API_VERSION") ?? "v21.0";

function formatPhone(phone?: string | null): string | null {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) digits = `91${digits}`;
  else if (digits.length === 11 && digits.startsWith("0")) digits = `91${digits.slice(1)}`;
  return digits;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

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
    if (userErr || !userData?.user) {
      return json({ success: false, error: "Unauthorized caller. Please log in again." }, 200);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // 2. Admin verification (matching public.admin_users schema where column is 'id')
    const { data: adminRow } = await admin
      .from("admin_users")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (adminRow?.role !== "admin") {
      return json({ success: false, error: "Forbidden: Admin privileges required." }, 200);
    }

    // 3. Input payload
    const { orderId, courierName, trackingId, trackingUrl, force = false } = await req.json();
    if (!orderId || !trackingId) {
      return json({ success: false, error: "orderId and trackingId are required" }, 200);
    }

    // 4. Load order from DB
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return json({ success: false, error: `Order not found for ID: ${orderId}` }, 200);
    }

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
    if (!to) {
      return json({ success: false, error: "No valid customer phone number found on order or address." }, 200);
    }

    // 6. Template parameters:
    // {{1}} Customer Name, {{2}} Order ID, {{3}} Courier, {{4}} Tracking No, {{5}} Link
    const params = [
      customerName,
      String(order.id ?? orderId),
      (courierName || order.manual_courier_name || "Franch Express").trim(),
      String(trackingId).trim(),
      (trackingUrl || order.manual_tracking_url || "https://anikaa.in").trim(),
    ].map((v) => ({ type: "text", text: v || "N/A" }));

    // 7. Check and sanitize credentials
    const rawPhoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
    const phoneNumberId = rawPhoneId.replace(/['"\s]/g, "").trim();

    const rawToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
    const accessToken = rawToken.replace(/['"\r\n\s]/g, "").trim().replace(/^Bearer/i, "").trim();

    const rawTmplName = Deno.env.get("WHATSAPP_TEMPLATE_NAME") ?? "order_confirmation_msg";
    const templateName = rawTmplName.replace(/['"\s]/g, "").trim();

    const rawLang = Deno.env.get("WHATSAPP_TEMPLATE_LANG") ?? "en_US";
    const primaryLang = rawLang.replace(/['"\s]/g, "").trim();

    const rawTestPhone = Deno.env.get("WHATSAPP_TEST_PHONE") ?? "";
    const testPhone = rawTestPhone.replace(/['"\s]/g, "").trim();

    if (!phoneNumberId || !accessToken) {
      console.error("Missing WhatsApp credentials in Supabase secrets");
      return json({
        success: false,
        error: "Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID in Supabase Secrets.",
      }, 200);
    }

    const callMeta = async (recipient: string, lang: string) => {
      const resp = await fetch(`https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipient,
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

    let metaResult = await callMeta(to, primaryLang);

    // Handle template language mismatch (Meta error 132001)
    if (!metaResult.ok && metaResult.data?.error?.code === 132001) {
      const candidates = [primaryLang, "en_US", "en", "en_GB"].filter(
        (l, i, arr) => l && arr.indexOf(l) === i && l !== primaryLang
      );

      for (const altLang of candidates) {
        console.warn(`Template ${templateName} not found for ${primaryLang}, retrying with ${altLang}...`);
        const retryResult = await callMeta(to, altLang);
        if (retryResult.ok) {
          metaResult = retryResult;
          break;
        }
      }

      // If still failing with 132001, inspect the template directly from Meta Graph API
      if (!metaResult.ok) {
        try {
          const tmplRes = await fetch(
            `https://graph.facebook.com/${API_VERSION}/2388436058637084?fields=id,name,status,language,category,components&access_token=${accessToken}`
          );
          const tmplData = await tmplRes.json();
          console.warn("[send-whatsapp-tracking] Meta Template Inspection:", tmplData);

          if (tmplData?.language && tmplData?.language !== primaryLang) {
            console.log(`[send-whatsapp-tracking] Exact template language is ${tmplData.language}. Retrying...`);
            const exactRetry = await callMeta(to, tmplData.language);
            if (exactRetry.ok) {
              metaResult = exactRetry;
            }
          } else if (tmplData?.error) {
            console.error("[send-whatsapp-tracking] Meta Template Inspection error:", tmplData.error);
            return json({
              success: false,
              error: `Meta Template Error: ${tmplData.error.message} (Template ID 2388436058637084 might belong to a different WABA than Phone Number ${phoneNumberId})`,
              code: tmplData.error.code,
            }, 200);
          }
        } catch (diagErr) {
          console.warn("[send-whatsapp-tracking] Diagnostic fetch failed:", diagErr);
        }
      }
    }

    // Handle Meta Sandbox recipient restriction (Meta error 131030)
    if (!metaResult.ok && metaResult.data?.error?.code === 131030 && testPhone && to !== testPhone) {
      console.warn(`Recipient ${to} not in Meta sandbox allowed list. Retrying with test phone ${testPhone}...`);
      const sandboxRetry = await callMeta(testPhone, primaryLang);
      if (sandboxRetry.ok) {
        metaResult = sandboxRetry;
      }
    }

    // Handle Meta errors (including Code 100 Authorization Error)
    if (!metaResult.ok) {
      console.error("WhatsApp API error:", JSON.stringify(metaResult.data));
      const metaErr = metaResult.data?.error;
      let errorMsg = metaErr?.message ?? "WhatsApp send failed";

      // If Code 100 ("Authorization Error" / Invalid Parameter / Permissions), probe Phone Number ID
      if (metaErr?.code === 100) {
        try {
          const probePhoneRes = await fetch(
            `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}?fields=id,display_phone_number,verified_name&access_token=${accessToken}`
          );
          const probePhoneData = await probePhoneRes.json();
          console.warn("[send-whatsapp-tracking] Phone Number probe:", probePhoneData);

          if (probePhoneData?.error) {
            errorMsg = `Meta Authorization Error: ${probePhoneData.error.message} (Phone Number ID: ${phoneNumberId}). Check that your access token has 'whatsapp_business_messaging' and is associated with this Phone Number.`;
          } else if (probePhoneData?.id) {
            errorMsg = `Meta Authorization Error on ${probePhoneData.display_phone_number || phoneNumberId}: Token can read phone number, but cannot send messages. Ensure 'whatsapp_business_messaging' permission is granted to the token in Meta Business Settings.`;
          }
        } catch (probeErr) {
          console.warn("[send-whatsapp-tracking] Phone probe failed:", probeErr);
        }
      }

      if (metaErr?.error_user_msg) {
        errorMsg += ` - ${metaErr.error_user_msg}`;
      } else if (metaErr?.error_data?.details) {
        errorMsg += ` - ${metaErr.error_data.details}`;
      }

      return json(
        {
          success: false,
          error: errorMsg,
          code: metaErr?.code ?? 100,
          details: metaErr,
        },
        200,
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
    console.error("send-whatsapp-tracking uncaught exception:", err);
    return json({ success: false, error: String(err?.message ?? err) }, 200);
  }
});
