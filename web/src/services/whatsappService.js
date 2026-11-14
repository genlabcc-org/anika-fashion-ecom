import { supabase } from "../lib/supabase";

export const whatsappService = {
  /**
   * Invokes the secure Supabase Edge Function 'send-whatsapp-tracking' to send
   * order tracking notifications via Meta WhatsApp Cloud API.
   *
   * @param {Object} options
   * @param {string} [options.orderId]
   * @param {Object} [options.order]
   * @param {string} [options.courierName]
   * @param {string} [options.trackingId]
   * @param {string} [options.trackingUrl]
   * @param {boolean} [options.force=false] Set true to bypass duplicate guard
   * @returns {Promise<{success: boolean, messageId?: string, skipped?: boolean, reason?: string, error?: string, code?: number}>}
   */
  async sendManualOrderShippingNotification({
    orderId,
    order,
    courierName,
    trackingId,
    trackingUrl,
    force = false,
  }) {
    const targetOrderId = orderId || order?.id;
    const targetTrackingId = trackingId || order?.manual_awb || order?.waybill;
    const targetCourier = courierName || order?.manual_courier_name || order?.courier_name;
    const targetUrl = trackingUrl || order?.manual_tracking_url || order?.tracking_url;

    if (!targetOrderId || !targetTrackingId) {
      return {
        success: false,
        error: "Order ID and Tracking ID are required to send WhatsApp notification.",
      };
    }

    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp-tracking", {
        body: {
          orderId: targetOrderId,
          courierName: targetCourier,
          trackingId: targetTrackingId,
          trackingUrl: targetUrl,
          force: !!force,
        },
      });

      if (error) {
        return {
          success: false,
          error: error.message || "Failed to invoke WhatsApp edge function",
        };
      }

      if (!data?.success) {
        return {
          success: false,
          error: data?.error || "WhatsApp send failed",
          code: data?.code,
          skipped: data?.skipped,
          reason: data?.reason,
        };
      }

      return {
        success: true,
        messageId: data.messageId,
        skipped: data.skipped,
        reason: data.reason,
      };
    } catch (err) {
      return {
        success: false,
        error: err?.message || String(err),
      };
    }
  },
};
