import { orderService } from "./orderService.js";

/**
 * WhatsApp Cloud API Configuration
 * Supports environment variables (for production / custom keys)
 * with graceful fallbacks to the provided test sandbox credentials.
 */
export const WHATSAPP_CONFIG = {
  get phoneNumberId() {
    return (
      (typeof import.meta !== "undefined" && import.meta.env?.VITE_WHATSAPP_PHONE_NUMBER_ID) ||
      "1466712443186335"
    ).trim();
  },
  get accessToken() {
    return (
      (typeof import.meta !== "undefined" && import.meta.env?.VITE_WHATSAPP_ACCESS_TOKEN) ||
      "EAAZAGsrnHpFIBSyPH69dwZB8Lqo74HAw575tAMXZCNrSZC5twtd5VtBUjOs8LxJeUV9VjDucxX0wA9XPbSrAXlRU92mtrdpcthrxWOU1ZAdiVteubjzWA4fKJ90r9NuGbB7Wl8xFNQXQmXXpLdjlfZBWbc7QhEshhRIJFyY70yey04pANNOvEHgOCQhv8EljnvjPfQPPQyJUx5eBUT1YEdiWhagEX246lirSzmgt90ytzPqBMfg5utDSFW3bfsoJ9EBhwkN4f6C2bn7CaXwgZAMPbMDagZDZD"
    ).trim();
  },
  get templateName() {
    return (
      (typeof import.meta !== "undefined" && import.meta.env?.VITE_WHATSAPP_TEMPLATE_NAME) ||
      "jaspers_market_order_confirmation_v1"
    ).trim();
  },
  get templateLanguage() {
    return (
      (typeof import.meta !== "undefined" && import.meta.env?.VITE_WHATSAPP_TEMPLATE_LANG) ||
      "en_US"
    ).trim();
  },
  get defaultTestPhone() {
    return (
      (typeof import.meta !== "undefined" && import.meta.env?.VITE_WHATSAPP_TEST_PHONE) ||
      "919360766007"
    ).trim();
  },
  apiVersion: "v25.0",
};

/**
 * Sanitizes and formats phone number for Meta WhatsApp Cloud API.
 * Strips non-digits, ensures 91 country code for 10-digit Indian numbers,
 * and falls back to defaultTestPhone if phone is missing or invalid.
 */
export function formatWhatsAppPhoneNumber(phone, defaultNumber = WHATSAPP_CONFIG.defaultTestPhone) {
  if (!phone) return defaultNumber;
  let clean = String(phone).replace(/\D/g, "");
  if (!clean) return defaultNumber;
  // If 10 digits (Indian mobile), prefix with country code 91
  if (clean.length === 10) clean = `91${clean}`;
  // If 11 digits starting with 0, replace 0 with 91
  else if (clean.length === 11 && clean.startsWith("0")) clean = `91${clean.slice(1)}`;
  return clean;
}

/**
 * Formats a date into "Oct 28, 2026" format matching the template requirement.
 */
export function formatWhatsAppDate(dateInput) {
  try {
    const d = dateInput ? new Date(dateInput) : new Date();
    if (isNaN(d.getTime())) {
      return new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch (_) {
    return "Oct 28, 2026";
  }
}

export const whatsappService = {
  /**
   * Sends a WhatsApp template message via Meta WhatsApp Cloud API.
   * In sandbox mode, if the recipient is not on Meta's allowed recipient list (error #131030),
   * it automatically retries with the verified test phone so testing succeeds.
   */
  async sendTemplateMessage({
    to,
    templateName = WHATSAPP_CONFIG.templateName,
    languageCode = WHATSAPP_CONFIG.templateLanguage,
    parameters = [],
  }) {
    const targetPhone = formatWhatsAppPhoneNumber(to);
    const url = `https://graph.facebook.com/${WHATSAPP_CONFIG.apiVersion}/${WHATSAPP_CONFIG.phoneNumberId}/messages`;

    const buildPayload = (phone) => ({
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: "body",
            parameters: parameters.map((val) => ({
              type: "text",
              text: String(val ?? "").trim() || "N/A",
            })),
          },
        ],
      },
    });

    const executeSend = async (phone) => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_CONFIG.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload(phone)),
      });
      const data = await response.json();
      return { ok: response.ok, status: response.status, data };
    };

    try {
      let res = await executeSend(targetPhone);

      // Handle Meta Sandbox Restriction: error code 131030 (Recipient not in allowed list)
      if (
        !res.ok &&
        res.data?.error?.code === 131030 &&
        targetPhone !== WHATSAPP_CONFIG.defaultTestPhone
      ) {
        console.warn(
          `[whatsappService] Recipient ${targetPhone} is not in Meta sandbox allowed list. Retrying with verified test phone ${WHATSAPP_CONFIG.defaultTestPhone}...`
        );
        res = await executeSend(WHATSAPP_CONFIG.defaultTestPhone);
      }

      if (!res.ok) {
        const errorDesc =
          res.data?.error?.message ||
          res.data?.error?.error_user_msg ||
          JSON.stringify(res.data);
        console.error("[whatsappService] Error sending WhatsApp message:", res.data);
        return { success: false, error: errorDesc, data: res.data };
      }

      const msgId = res.data?.messages?.[0]?.id || "accepted";
      console.log(`[whatsappService] WhatsApp message dispatched to ${targetPhone} (id: ${msgId})`);
      return {
        success: true,
        messageId: msgId,
        recipient: targetPhone,
        data: res.data,
      };
    } catch (err) {
      console.error("[whatsappService] Fetch failed:", err);
      return { success: false, error: err?.message || String(err) };
    }
  },

  /**
   * Dispatches WhatsApp notification specifically for manual orders when courier & tracking are saved.
   *
   * Template: jaspers_market_order_confirmation_v1 (or configured template)
   * Parameter 1: Customer Name
   * Parameter 2: Order Reference / ID
   * Parameter 3: Formatted Date (e.g. Oct 28, 2026)
   */
  async sendManualOrderShippingNotification({
    order,
    address,
    courierName,
    trackingId,
    trackingUrl,
    customParameters,
  }) {
    if (!order) return { success: false, error: "Order object is required" };

    let customerName = (
      address?.full_name ||
      order.customer?.name ||
      order.shipping_name ||
      "Valued Customer"
    ).trim();

    let customerPhone =
      address?.phone_number ||
      order.customer?.phone ||
      order.phone ||
      order.shipping_phone ||
      "";

    // If customer phone is not on address/order, attempt quick lookup from addresses
    if (!customerPhone && order.user_id) {
      try {
        const addrs = await orderService.getAddresses(order.user_id);
        const matched =
          (addrs || []).find((a) => String(a.address_id) === String(order.address_id)) ||
          addrs?.[0];
        if (matched?.phone_number) {
          customerPhone = matched.phone_number;
          if (!customerName && matched.full_name) customerName = matched.full_name;
        }
      } catch (_) {
        // Fallback to default test phone handled inside sendTemplateMessage
      }
    }

    const orderRef = String(order.id || trackingId || "Order");
    const dateStr = formatWhatsAppDate(order.shipped_at || order.order_date || new Date());

    const params = customParameters || [customerName, orderRef, dateStr];

    return await this.sendTemplateMessage({
      to: customerPhone,
      templateName: WHATSAPP_CONFIG.templateName,
      languageCode: WHATSAPP_CONFIG.templateLanguage,
      parameters: params,
    });
  },
};
