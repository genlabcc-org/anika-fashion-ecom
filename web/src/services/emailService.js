import { supabase } from '../lib/supabase';

const ADMIN_EMAIL = 'anikafashionstorengl@gmail.com';

export const emailService = {
  /**
   * Sends a minimal, professional order notification email in ONE single container box to jeyareshd@gmail.com.
   * @param {Object} orderData
   * @returns {Promise<boolean>}
   */
  async sendOrderNotificationEmail(orderData = {}) {
    try {
      const {
        orderId = 'N/A',
        customerName,
        customerEmail,
        customerPhone,
        paymentMethod = 'COD',
        address = {},
        items = [],
        totalPrice = 0,
        subtotal = 0,
        discount = 0,
        shippingFee = 0,
      } = orderData || {};

      // 1. Resolve customer name:
      // Priority: customerName -> address.name / address.full_name -> user metadata -> 'Customer'
      let resolvedCustomerName = (
        (typeof customerName === 'string' && customerName.trim()) ||
        (typeof address?.name === 'string' && address.name.trim()) ||
        (typeof address?.full_name === 'string' && address.full_name.trim()) ||
        ''
      );

      if (!resolvedCustomerName) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const meta = session?.user?.user_metadata || {};
          resolvedCustomerName = (
            meta.name ||
            meta.full_name ||
            meta.user_name ||
            ''
          ).trim();
        } catch (_) {}
      }

      if (!resolvedCustomerName) {
        resolvedCustomerName = 'Customer';
      }

      // Temporary diagnostic log as requested
      console.log('[emailService] Resolved customer name for order notification:', resolvedCustomerName);

      // 2. Resolve customer email
      let resolvedCustomerEmail = (
        (typeof customerEmail === 'string' && customerEmail.trim()) ||
        ''
      );
      if (!resolvedCustomerEmail || resolvedCustomerEmail === 'N/A') {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          resolvedCustomerEmail = (session?.user?.email || '').trim();
        } catch (_) {}
      }
      if (!resolvedCustomerEmail) {
        resolvedCustomerEmail = 'N/A';
      }

      // 3. Resolve customer phone
      let resolvedCustomerPhone = (
        (typeof customerPhone === 'string' && customerPhone.trim()) ||
        (typeof address?.mobile === 'string' && address.mobile.trim()) ||
        (typeof address?.phone === 'string' && address.phone.trim()) ||
        (typeof address?.phone_number === 'string' && address.phone_number.trim()) ||
        ''
      );
      if (!resolvedCustomerPhone) {
        resolvedCustomerPhone = 'N/A';
      }

      // 4. Format shipping address line
      const addressName = (
        (typeof address?.name === 'string' && address.name.trim()) ||
        (typeof address?.full_name === 'string' && address.full_name.trim()) ||
        resolvedCustomerName
      );

      const formattedAddress = typeof address === 'string'
        ? (address.trim() || 'N/A')
        : [
          addressName,
          address.mobile || address.phone || address.phone_number ? `Phone: ${address.mobile || address.phone || address.phone_number}` : null,
          address.flat || address.address_line1 ? `Address: ${address.flat || address.address_line1}` : null,
          address.area || address.address_line2 ? (address.area || address.address_line2) : null,
          address.landmark ? `Landmark: ${address.landmark}` : null,
          (address.city || address.state || address.pincode || address.postal_code)
            ? `${address.city || ''}, ${address.state || ''} - ${address.pincode || address.postal_code || ''}`.trim()
            : null,
        ].filter(Boolean).join(', ') || 'N/A';

      // 5. Extract SKU IDs and Categories for separate rows
      const skuList = (
        items
          .map(item => item.sku || item.sku_id || 'N/A')
          .filter((val, i, self) => self.indexOf(val) === i)
          .join(', ')
      ) || 'N/A';

      const categoryList = (
        items
          .map(item => item.category || item.category_name || item.categories?.name || 'N/A')
          .filter((val, i, self) => self.indexOf(val) === i)
          .join(', ')
      ) || 'N/A';

      // 6. Format item breakdown
      const itemsListFormatted = (
        items.map((item, idx) => {
          const name = item.product_name || item.name || 'Product';
          const qty = item.quantity || item.qty || 1;
          const price = item.price || 0;
          const specs = [
            item.size ? `Size: ${item.size}` : null,
            item.color ? `Color: ${item.color}` : null
          ].filter(Boolean).join(' | ');

          return `[${idx + 1}] ${name}${specs ? ` (${specs})` : ''}\n    • Quantity: ${qty}\n    • Unit Price: ₹${Number(price).toLocaleString('en-IN')}`;
        }).join('\n\n')
      ) || 'N/A';

      const subject = `[Anika Fashion] Order Notification #${orderId || 'N/A'}`;

      // 7. Try sending via Supabase Edge Function if available
      try {
        const { data, error: fnError } = await supabase.functions.invoke('send-order-email', {
          body: {
            adminEmail: ADMIN_EMAIL,
            orderId: orderId || 'N/A',
            customerName: resolvedCustomerName,
            customerEmail: resolvedCustomerEmail,
            customerPhone: resolvedCustomerPhone,
            paymentMethod: paymentMethod || 'N/A',
            address: formattedAddress,
            skuId: skuList,
            category: categoryList,
            items,
            itemsListFormatted,
            totalPrice: Number(totalPrice) || 0,
            subtotal: Number(subtotal) || 0,
            discount: Number(discount) || 0,
            shippingFee: Number(shippingFee) || 0,
          },
        });
        if (!fnError && (data?.success === true || data?.success === 'true') && data?.result?.success !== 'false') {
          console.log('[emailService] Order notification email sent via Supabase Edge Function.');
          return true;
        } else {
          console.warn('[emailService] Edge function failed or unconfirmed, falling back to direct FormSubmit fetch:', fnError || data);
        }
      } catch (e) {
        console.warn('[emailService] Edge function invoke error, falling back to direct FormSubmit fetch:', e);
      }

      // 8. Minimal, professional email template dispatch via FormSubmit (Single Unified Box Table)
      // FormSubmit drops blank/empty fields, so guarantee every field has a non-empty string fallback.
      const formSubmitPayload = {
        _subject: subject,
        _template: 'table',
        _captcha: 'false',
        'Order Number': orderId ? `#${orderId}` : 'N/A',
        'Payment Method': String(paymentMethod || 'N/A'),
        'Customer Name': String(resolvedCustomerName || 'Customer'),
        'Customer Email': String(resolvedCustomerEmail || 'N/A'),
        'Customer Phone': String(resolvedCustomerPhone || 'N/A'),
        'Shipping Address': String(formattedAddress || 'N/A'),
        'SKU': String(skuList || 'N/A'),
        'Category': String(categoryList || 'N/A'),
        'Order Breakdown': String(itemsListFormatted || 'N/A'),
        'Subtotal': subtotal != null ? `₹${Number(subtotal).toLocaleString('en-IN')}` : '₹0',
        'Discount': discount > 0 ? `-₹${Number(discount).toLocaleString('en-IN')}` : '₹0',
        'Shipping': shippingFee > 0 ? `₹${Number(shippingFee).toLocaleString('en-IN')}` : 'Free',
        'Total Amount': totalPrice != null ? `₹${Number(totalPrice).toLocaleString('en-IN')}` : '₹0',
      };

      const response = await fetch(`https://formsubmit.co/ajax/${ADMIN_EMAIL}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(formSubmitPayload),
      });

      const resJson = await response.json().catch(() => ({}));
      if (response.ok && (resJson.success === 'true' || resJson.success === true)) {
        console.log('[emailService] Minimal order notification email dispatched successfully to', ADMIN_EMAIL);
        return true;
      } else {
        console.warn('[emailService] FormSubmit response error:', resJson?.message || resJson);
      }
    } catch (err) {
      console.error('[emailService] Failed to send order notification email:', err);
    }
    return false;
  },
};
