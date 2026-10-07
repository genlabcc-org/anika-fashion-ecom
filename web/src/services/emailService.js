import { supabase } from '../lib/supabase';

const ADMIN_EMAIL = 'anikafashionstorengl@gmail.com';

export const emailService = {
  /**
   * Sends a minimal, professional order notification email in ONE single container box to jeyareshd@gmail.com.
   * @param {Object} orderData
   * @returns {Promise<boolean>}
   */
  async sendOrderNotificationEmail(orderData) {
    try {
      const {
        orderId = 'N/A',
        customerName = 'Customer',
        customerEmail = 'N/A',
        customerPhone = 'N/A',
        paymentMethod = 'COD',
        address = {},
        items = [],
        totalPrice = 0,
        subtotal = 0,
        discount = 0,
        shippingFee = 0,
      } = orderData;

      // Format shipping address line
      const formattedAddress = typeof address === 'string'
        ? address
        : [
          address.name || customerName,
          address.mobile ? `Phone: ${address.mobile}` : null,
          address.flat ? `Address: ${address.flat}` : null,
          address.area ? address.area : null,
          address.landmark ? `Landmark: ${address.landmark}` : null,
          address.city ? `${address.city}, ${address.state || ''} - ${address.pincode || ''}` : null,
        ].filter(Boolean).join(', ');

      // Extract SKU IDs and Categories for separate rows
      const skuList = items
        .map(item => item.sku || item.sku_id || 'N/A')
        .filter((val, i, self) => self.indexOf(val) === i)
        .join(', ');

      const categoryList = items
        .map(item => item.category || item.category_name || item.categories?.name || 'N/A')
        .filter((val, i, self) => self.indexOf(val) === i)
        .join(', ');

      // Format minimal item breakdown without SKU and line total (since SKU and Grand Total have dedicated rows)
      const itemsListFormatted = items.map((item, idx) => {
        const name = item.product_name || item.name || 'Product';
        const qty = item.quantity || item.qty || 1;
        const price = item.price || 0;
        const specs = [
          item.size ? `Size: ${item.size}` : null,
          item.color ? `Color: ${item.color}` : null
        ].filter(Boolean).join(' | ');

        return `[${idx + 1}] ${name}${specs ? ` (${specs})` : ''}\n    • Quantity: ${qty}\n    • Unit Price: ₹${price.toLocaleString('en-IN')}`;
      }).join('\n\n');

      const subject = `[Anika Fashion] Order Notification #${orderId}`;

      // 1. Try sending via Supabase Edge Function if available
      try {
        const { error: fnError } = await supabase.functions.invoke('send-order-email', {
          body: {
            adminEmail: ADMIN_EMAIL,
            orderId,
            customerName,
            customerEmail,
            customerPhone,
            paymentMethod,
            address: formattedAddress,
            skuId: skuList,
            category: categoryList,
            items,
            itemsListFormatted,
            totalPrice,
            subtotal,
            discount,
            shippingFee,
          },
        });
        if (!fnError) {
          console.log('Order notification email sent via Supabase Edge Function.');
          return true;
        }
      } catch (e) {
        // Fall through to HTTP dispatch fallback
      }

      // 2. Minimal, professional email template dispatch via FormSubmit (Single Unified Box Table)
      const formSubmitPayload = {
        _subject: subject,
        _template: 'table',
        _captcha: 'false',
        'Order Number': `#${orderId}`,
        'Payment Method': paymentMethod,
        'Customer Name': customerName,
        'Customer Email': customerEmail,
        'Customer Phone': customerPhone,
        'Shipping Address': formattedAddress || 'N/A',
        'SKU': skuList || 'N/A',
        'Category': categoryList || 'N/A',
        'Order Breakdown': itemsListFormatted || 'N/A',
        'Subtotal': `₹${subtotal.toLocaleString('en-IN')}`,
        'Discount': discount > 0 ? `-₹${discount.toLocaleString('en-IN')}` : '₹0',
        'Shipping': shippingFee > 0 ? `₹${shippingFee.toLocaleString('en-IN')}` : 'Free',
        'Total Amount': `₹${totalPrice.toLocaleString('en-IN')}`,
      };

      const response = await fetch(`https://formsubmit.co/ajax/${ADMIN_EMAIL}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(formSubmitPayload),
      });

      if (response.ok) {
        console.log('Minimal order notification email dispatched to', ADMIN_EMAIL);
        return true;
      } else {
        const errText = await response.text();
        console.warn('FormSubmit email response not OK:', errText);
      }
    } catch (err) {
      console.error('Failed to send order notification email:', err);
    }
    return false;
  },
};
