import { supabase } from '../lib/supabase';

export const emailService = {
  /**
   * Sends an order notification email to the admin via Supabase Edge Function.
   * The server loads order details, handles Brevo dispatch, and ensures idempotency.
   * @param {Object|string} params - { orderId } or orderId string
   * @returns {Promise<boolean>}
   */
  async sendOrderNotificationEmail(params = {}) {
    try {
      const orderId = typeof params === 'string' ? params.trim() : params?.orderId?.trim();
      if (!orderId || orderId === 'N/A') {
        console.warn('[emailService] No valid orderId provided to sendOrderNotificationEmail');
        return false;
      }

      const { data, error: fnError } = await supabase.functions.invoke('send-order-email', {
        body: { orderId },
      });

      if (!fnError && (data?.success === true || data?.success === 'true')) {
        return true;
      }

      console.warn('[emailService] Failed to send order notification email:', fnError || data?.error || 'Unknown error');
      return false;
    } catch (err) {
      console.warn('[emailService] Failed to send order notification email:', err?.message || err);
      return false;
    }
  },
};
