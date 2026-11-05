import { supabase } from '../lib/supabase';
import { resolveCustomerName } from '../utils/customerName';
import { formatISTDateTime } from '../utils/exportUtils';

export const orderService = {
  /**
   * Retrieves all orders for a specific user.
   * @param {string} userId 
   * @returns {Promise<any[]>}
   */
  async getOrders(userId) {
    const { data, error } = await supabase
      .from('orders')
      .select(
        'id, user_id, order_date, item_name, quantity, total_price, status, payment, type, ' +
        'shipping_fee, address_id, razorpay_order_id, razorpay_payment_id, ' +
        'delivery_provider, courier_name, waybill, shipment_id, delivery_status, tracking_url, ' +
        'estimated_delivery_date, shipped_at, delivered_at, ' +
        'fulfillment_type, manual_courier_name, manual_awb, manual_tracking_url'
      )
      .eq('user_id', userId)
      .order('order_date', { ascending: false })
      .limit(50);
    if (error) throw error;
    if (data && data.length > 0) {
      try {
        const orderIds = data.map((o) => o.id);
        const { data: allItems } = await supabase
          .from('order_items')
          .select('id, order_id, product_id, product_name, quantity, price, size, color, image_url')
          .in('order_id', orderIds);
        if (allItems && allItems.length > 0) {
          const itemsByOrderId = {};
          allItems.forEach((item) => {
            if (!itemsByOrderId[item.order_id]) itemsByOrderId[item.order_id] = [];
            itemsByOrderId[item.order_id].push(item);
          });
          data.forEach((o) => {
            if (itemsByOrderId[o.id]) {
              o.order_items = itemsByOrderId[o.id];
            }
          });
        }
      } catch (e) {
        console.warn('Error joining order_items in getOrders:', e);
      }
    }
    return data || [];
  },

  /**
   * Retrieves all addresses for a specific user.
   * @param {string} userId 
   * @returns {Promise<any[]>}
   */
  async getAddresses(userId) {
    const { data, error } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  /**
   * Creates a new address for a user.
   * @param {object} addressData 
   * @returns {Promise<any>}
   */
  async createAddress(addressData) {
    const { data, error } = await supabase
      .from('addresses')
      .insert(addressData)
      .select();
    if (error) throw error;
    return data;
  },

  /**
   * Updates an existing address.
   * @param {string|number} addressId 
   * @param {object} addressData 
   * @returns {Promise<any>}
   */
  async updateAddress(addressId, addressData) {
    const { data, error } = await supabase
      .from('addresses')
      .update(addressData)
      .eq('address_id', addressId)
      .select();
    if (error) throw error;
    return data;
  },

  /**
   * Deletes a specific address.
   * @param {string|number} addressId 
   * @param {string} userId 
   * @returns {Promise<void>}
   */
  async deleteAddress(addressId, userId) {
    const { error } = await supabase
      .from('addresses')
      .delete()
      .eq('address_id', addressId)
      .eq('user_id', userId);
    if (error) throw error;
  },

  /**
   * Resets default status for all user addresses to false.
   * @param {string} userId 
   * @returns {Promise<void>}
   */
  async resetAddressDefaults(userId) {
    const { error } = await supabase
      .from('addresses')
      .update({ is_default: false })
      .eq('user_id', userId);
    if (error) throw error;
  },

  /**
   * Sets a specific address as the user's default address.
   * @param {string|number} addressId 
   * @param {string} userId 
   * @returns {Promise<void>}
   */
  async setAddressDefault(addressId, userId) {
    // 1. Reset all addresses to is_default = false
    await this.resetAddressDefaults(userId);

    // 2. Set this address to is_default = true
    const { error } = await supabase
      .from('addresses')
      .update({ is_default: true })
      .eq('address_id', addressId)
      .eq('user_id', userId);
    if (error) throw error;
  },

  /**
   * Retrieves a batch of orders for scroll-based loading in the admin view.
   * @param {{ offset?: number, limit?: number }} options
   * @returns {Promise<{ orders: any[], totalCount: number }>}
   */
  async getOrdersBatch({ offset = 0, limit = 10 } = {}) {
    const from = Math.max(0, offset);
    const to = from + limit - 1;
    const { data, error, count } = await supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .order('order_date', { ascending: false })
      .range(from, to);

    if (error) throw error;
    const ordersBatch = data || [];

    if (ordersBatch.length > 0) {
      try {
        const orderIds = ordersBatch.map((o) => o.id);
        const { data: allItems } = await supabase
          .from('order_items')
          .select('*')
          .in('order_id', orderIds);

        if (allItems && allItems.length > 0) {
          const itemsByOrderId = {};
          allItems.forEach((item) => {
            if (!itemsByOrderId[item.order_id]) itemsByOrderId[item.order_id] = [];
            itemsByOrderId[item.order_id].push(item);
          });
          ordersBatch.forEach((o) => {
            if (itemsByOrderId[o.id]) {
              o.order_items = itemsByOrderId[o.id];
            }
          });
        }
      } catch (e) {
        console.warn('Error joining order_items in getOrdersBatch:', e);
      }
    }

    return {
      orders: ordersBatch,
      totalCount: typeof count === 'number' ? count : ordersBatch.length,
    };
  },

  /**
   * Retrieves lightweight order rows (without order_items joins) for accurate
   * global KPI stats, customer order counts, and full-dataset filtering/search.
   * @returns {Promise<any[]>}
   */
  async getOrdersSummary() {
    const PAGE_SIZE = 1000;
    let allOrders = [];
    let pageIndex = 0;
    while (true) {
      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('order_date', { ascending: false })
        .range(from, to);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allOrders.push(...data);
      if (data.length < PAGE_SIZE) break;
      pageIndex++;
    }
    return allOrders;
  },

  /**
   * Searches orders across the entire database by Order ID, item name, waybill,
   * Razorpay IDs, or matching customer user_ids.
   * @param {{ query: string, matchingUserIds?: string[] }} options
   * @returns {Promise<any[]>}
   */
  async searchOrders({ query = '', matchingUserIds = [] } = {}) {
    const raw = (query || '').trim().replace(/^#/, '');
    const safeTerm = raw.replace(/[,()]/g, ' ').trim();
    if (!safeTerm && (!matchingUserIds || matchingUserIds.length === 0)) {
      return [];
    }

    const orClauses = [];
    if (safeTerm) {
      orClauses.push(`id.ilike.%${safeTerm}%`);
      orClauses.push(`item_name.ilike.%${safeTerm}%`);
      orClauses.push(`waybill.ilike.%${safeTerm}%`);
      orClauses.push(`razorpay_order_id.ilike.%${safeTerm}%`);
      orClauses.push(`razorpay_payment_id.ilike.%${safeTerm}%`);
    }
    if (Array.isArray(matchingUserIds) && matchingUserIds.length > 0) {
      const validIds = matchingUserIds.slice(0, 100).filter(Boolean);
      if (validIds.length > 0) {
        orClauses.push(`user_id.in.(${validIds.join(',')})`);
      }
    }

    if (orClauses.length === 0) return [];

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .or(orClauses.join(','))
      .order('order_date', { ascending: false })
      .limit(200);

    if (error) throw error;
    const matchedOrders = data || [];

    if (matchedOrders.length > 0) {
      try {
        const orderIds = matchedOrders.map((o) => o.id);
        const { data: allItems } = await supabase
          .from('order_items')
          .select('*')
          .in('order_id', orderIds);

        if (allItems && allItems.length > 0) {
          const itemsByOrderId = {};
          allItems.forEach((item) => {
            if (!itemsByOrderId[item.order_id]) itemsByOrderId[item.order_id] = [];
            itemsByOrderId[item.order_id].push(item);
          });
          matchedOrders.forEach((o) => {
            if (itemsByOrderId[o.id]) {
              o.order_items = itemsByOrderId[o.id];
            }
          });
        }
      } catch (e) {
        console.warn('Error joining order_items in searchOrders:', e);
      }
    }

    return matchedOrders;
  },

  /**
   * Retrieves all orders in the system (admin view).
   * @returns {Promise<any[]>}
   */
  async getAllOrders() {
    const PAGE_SIZE = 1000;
    let allOrders = [];
    let pageIndex = 0;
    while (true) {
      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('order_date', { ascending: false })
        .range(from, to);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allOrders.push(...data);
      if (data.length < PAGE_SIZE) break;
      pageIndex++;
    }

    if (allOrders.length > 0) {
      try {
        const orderIds = allOrders.map((o) => o.id);
        const BATCH_SIZE = 200;
        const itemsByOrderId = {};
        for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
          const chunkIds = orderIds.slice(i, i + BATCH_SIZE);
          const { data: allItems } = await supabase
            .from('order_items')
            .select('*')
            .in('order_id', chunkIds);
          if (allItems && allItems.length > 0) {
            allItems.forEach((item) => {
              if (!itemsByOrderId[item.order_id]) itemsByOrderId[item.order_id] = [];
              itemsByOrderId[item.order_id].push(item);
            });
          }
        }
        allOrders.forEach((o) => {
          if (itemsByOrderId[o.id]) {
            o.order_items = itemsByOrderId[o.id];
          }
        });
      } catch (e) {
        console.warn('Error joining order_items in getAllOrders:', e);
      }
    }
    return allOrders || [];
  },

  /**
   * Retrieves the count of unread orders for admin badge (admin_read = false).
   * @returns {Promise<number>}
   */
  async getNewOrdersCount() {
    const { count, error } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('admin_read', false);
    if (error) throw error;
    return count || 0;
  },

  /**
   * Marks one or multiple orders as read or unread.
   * @param {string[]} ids 
   * @param {boolean} read 
   * @returns {Promise<any>}
   */
  async setOrdersRead(ids, read = true) {
    if (!ids || ids.length === 0) return [];
    const { data, error } = await supabase
      .from('orders')
      .update({ admin_read: Boolean(read) })
      .in('id', ids)
      .select();
    if (error) throw error;
    return data;
  },

  /**
   * Sets the packing status of an order.
   * @param {string} orderId 
   * @param {boolean} packed 
   * @returns {Promise<any>}
   */
  async setOrderPacked(orderId, packed = true) {
    if (!orderId) throw new Error('Order ID is required');
    const { data, error } = await supabase
      .from('orders')
      .update({
        is_packed: Boolean(packed),
        packed_at: packed ? new Date().toISOString() : null
      })
      .eq('id', orderId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Retrieves a paginated batch of customer profiles for incremental scroll loading.
   * @param {{ offset?: number, limit?: number }} params
   * @returns {Promise<{ customers: any[], totalCount: number }>}
   */
  async getCustomersBatch({ offset = 0, limit = 10 } = {}) {
    const from = Math.max(0, Number(offset) || 0);
    const to = from + Math.max(1, Number(limit) || 10) - 1;
    const { data, error, count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(from, to);
    if (error) throw error;
    return {
      customers: data || [],
      totalCount: count ?? (data ? data.length : 0),
    };
  },

  /**
   * Searches customer profiles across the entire database by name, email, or phone.
   * @param {string} query
   * @returns {Promise<any[]>}
   */
  async searchCustomers(query) {
    const trimmed = (query || '').trim();
    if (!trimmed) return [];
    const safeTerm = trimmed.replace(/[%_(),]/g, '').trim();
    if (!safeTerm) return [];

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .or(`name.ilike.%${safeTerm}%,email.ilike.%${safeTerm}%,phone.ilike.%${safeTerm}%`)
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return data || [];
  },

  /**
   * Retrieves all customer profiles in the system (admin view).
   * Paginates in 1000-row chunks with .range() so lists stay complete beyond 1000 customers.
   * @returns {Promise<any[]>}
   */
  async getAllCustomers() {
    const PAGE_SIZE = 1000;
    let allCustomers = [];
    let pageIndex = 0;
    while (true) {
      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('updated_at', { ascending: false })
        .range(from, to);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allCustomers.push(...data);
      if (data.length < PAGE_SIZE) break;
      pageIndex++;
    }
    return allCustomers || [];
  },

  /**
   * Updates the status of a specific order.
   * @param {string} orderId 
   * @param {string} status 
   * @returns {Promise<any>}
   */
  async updateOrderStatus(orderId, status) {
    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .select();
    if (error) throw error;
    return data;
  },

  /**
   * Updates manual shipping details and marks order as Shipped.
   * Sets manual_awb, manual_courier_name, status = 'Shipped', and shipped_at.
   * @param {string} orderId 
   * @param {object} params - { manualAwb, manualCourierName, shippedAt }
   * @returns {Promise<any>}
   */
  async markManualOrderShipped(orderId, { manualAwb, manualCourierName, manualTrackingUrl, shippedAt = new Date().toISOString() }) {
    if (!orderId) throw new Error('Order ID is required');
    const cleanAwb = (manualAwb || '').trim();
    const trackingUrl = manualTrackingUrl || (cleanAwb ? `https://t.17track.net/en#nums=${encodeURIComponent(cleanAwb)}` : null);
    const updates = {
      manual_awb: cleanAwb,
      manual_courier_name: manualCourierName,
      manual_tracking_url: trackingUrl,
      tracking_url: trackingUrl,
      status: 'Shipped',
      shipped_at: shippedAt,
      delivery_status: 'Shipped',
      courier_name: manualCourierName,
      waybill: cleanAwb,
      fulfillment_type: 'manual',
      shipment_error: null,
    };
    const { data, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', orderId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Updates manual tracking details without changing shipped_at (for typo fixes).
   * @param {string} orderId 
   * @param {object} params - { manualAwb, manualCourierName, manualTrackingUrl }
   * @returns {Promise<any>}
   */
  async updateManualTracking(orderId, { manualAwb, manualCourierName, manualTrackingUrl }) {
    if (!orderId) throw new Error('Order ID is required');
    const cleanAwb = (manualAwb || '').trim();
    const trackingUrl = manualTrackingUrl || (cleanAwb ? `https://t.17track.net/en#nums=${encodeURIComponent(cleanAwb)}` : null);
    const updates = {
      manual_awb: cleanAwb,
      manual_courier_name: manualCourierName,
      manual_tracking_url: trackingUrl,
      tracking_url: trackingUrl,
      waybill: cleanAwb,
      courier_name: manualCourierName,
    };
    const { data, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', orderId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Marks an order as Delivered.
   * Sets status = 'Delivered' and delivered_at.
   * @param {string} orderId 
   * @param {string} [deliveredAt]
   * @returns {Promise<any>}
   */
  async markOrderDelivered(orderId, deliveredAt = new Date().toISOString()) {
    if (!orderId) throw new Error('Order ID is required');
    const updates = {
      status: 'Delivered',
      delivered_at: deliveredAt,
      delivery_status: 'Delivered',
    };
    const { data, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', orderId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Updates the admin note for a specific order.
   * @param {string} orderId 
   * @param {string} note 
   * @returns {Promise<any>}
   */
  async updateOrderNote(orderId, note) {
    const { data, error } = await supabase
      .from('orders')
      .update({ admin_notes: note })
      .eq('id', orderId)
      .select();
    if (error) throw error;
    return data;
  },

  /**
   * Cancels a specific order.
   * @param {string} orderId 
   * @returns {Promise<any>}
   */
  async cancelOrder(orderId) {
    const { data, error } = await supabase
      .from('orders')
      .update({ status: 'Cancelled', delivery_status: 'Cancelled' })
      .eq('id', orderId)
      .select();
    if (error) throw error;
    return data;
  },

  /**
   * Marks an order's invoice as printed so it cannot be printed again.
   * @param {string} orderId
   * @returns {Promise<any>}
   */
  async markInvoicePrinted(orderId) {
    const { data, error } = await supabase
      .from('orders')
      .update({ invoice_printed: true })
      .eq('id', orderId)
      .select();
    if (error) throw error;
    return data;
  },

  /**
   * Marks multiple orders as printed in a single batch query.
   * @param {string[]} orderIds
   * @returns {Promise<any>}
   */
  async markInvoicesBulkPrinted(orderIds) {
    if (!orderIds || orderIds.length === 0) return [];
    const { data, error } = await supabase
      .from('orders')
      .update({ invoice_printed: true })
      .in('id', orderIds)
      .select();
    if (error) throw error;
    return data;
  },

  /**
   * Updates the printed status of an order manually (Printed vs Unprinted).
   * @param {string} orderId
   * @param {boolean} printedStatus
   * @returns {Promise<any>}
   */
  async updateInvoicePrintedStatus(orderId, printedStatus) {
    const { data, error } = await supabase
      .from('orders')
      .update({ invoice_printed: Boolean(printedStatus) })
      .eq('id', orderId)
      .select();
    if (error) throw error;
    return data;
  },

  /**
   * Retrieves a single order by ID with details.
   * @param {string} orderId 
   * @returns {Promise<any>}
   */
  async getOrderById(orderId) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      try {
        const { data: items } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', orderId);
        if (items && items.length > 0) {
          data.order_items = items;
        }
      } catch (err) {
        console.warn('Error fetching order_items for getOrderById:', err);
      }
    }
    return data;
  },

  /**
   * Initiates a refund for an order via the initiate-refund edge function.
   * @param {object} params - { orderId, amount, reason, note }
   * @returns {Promise<any>}
   */
  async initiateRefund({ orderId, amount, reason, note }) {
    const { data, error } = await supabase.functions.invoke('initiate-refund', {
      body: { orderId, amount, reason, note },
    });
    if (error) {
      let errorMsg = error.message;
      if (data && data.error) {
        errorMsg = data.error;
      }
      throw new Error(errorMsg);
    }
    if (data?.error) {
      throw new Error(data.error);
    }
    return data;
  },

  /**
   * Retrieves the count of orders matching export filters.
   * Uses head: true to retrieve exact count efficiently without transferring data payload.
   * 
   * @param {object} params
   * @param {string} [params.from] - YYYY-MM-DD
   * @param {string} [params.to] - YYYY-MM-DD
   * @param {boolean} [params.includeRefunded=false]
   * @param {string} [params.status='all_paid']
   * @returns {Promise<number>}
   */
  async getOrderExportCount({ from, to, includeRefunded = false, status = 'all_paid' } = {}) {
    let query = supabase
      .from('orders')
      .select('id', { count: 'exact', head: true });

    if (from) {
      query = query.gte('order_date', `${from}T00:00:00+05:30`);
    }
    if (to) {
      query = query.lte('order_date', `${to}T23:59:59.999+05:30`);
    }

    if (status && status !== 'all_paid' && status !== 'All Status' && status !== 'All Orders') {
      query = query.eq('status', status);
    } else if (!includeRefunded) {
      query = query.not('status', 'in', '("Cancelled","cancelled","Refunded","refunded","Refund Completed","Partially Refunded","Returned","returned","return","Return")');
    }

    const { count, error } = await query;
    if (error) throw error;
    return count || 0;
  },

  /**
   * Fetches orders, profiles, and addresses with pagination in 1000-row chunks for CSV export.
   * Admin-only: Verifies caller has role === 'admin' before querying.
   * 
   * @param {object} params
   * @param {string} [params.from] - YYYY-MM-DD
   * @param {string} [params.to] - YYYY-MM-DD
   * @param {boolean} [params.includeRefunded=false]
   * @param {string} [params.status='all_paid']
   * @param {string[]} [params.orderIds] - Optional explicit list of order IDs to export
   * @returns {Promise<Array<{ orderId: string, customerName: string, email: string, price: number, dateTime: string }>>}
   */
  async exportOrdersData({ from, to, includeRefunded = false, status = 'all_paid', orderIds = null } = {}) {
    // 1. Admin authentication & authorization check
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized: Please sign in as an admin to export data.");
    }

    const { data: adminRecord, error: adminError } = await supabase
      .from('admin_users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (adminError || adminRecord?.role !== 'admin') {
      throw new Error("Forbidden: Admin access is required to export data.");
    }

    // 2. Fetch matching orders (either specific selected orderIds or date/status filter)
    // ONLY select columns that exist in public.orders: id, user_id, order_date, total_price, status, address_id
    const PAGE_SIZE = 1000;
    let allOrders = [];

    if (Array.isArray(orderIds) && orderIds.length > 0) {
      const ID_CHUNK = 200;
      for (let i = 0; i < orderIds.length; i += ID_CHUNK) {
        const chunk = orderIds.slice(i, i + ID_CHUNK);
        const { data, error } = await supabase
          .from('orders')
          .select('id, user_id, order_date, total_price, status, address_id, waybill, manual_awb')
          .in('id', chunk)
          .order('order_date', { ascending: false });
        if (error) throw error;
        if (data && data.length > 0) {
          allOrders.push(...data);
        }
      }
      allOrders.sort((a, b) => new Date(b.order_date || 0).getTime() - new Date(a.order_date || 0).getTime());
    } else {
      let pageIndex = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('orders')
          .select('id, user_id, order_date, total_price, status, address_id, waybill, manual_awb')
          .order('order_date', { ascending: false })
          .range(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE - 1);

        if (from) {
          query = query.gte('order_date', `${from}T00:00:00+05:30`);
        }
        if (to) {
          query = query.lte('order_date', `${to}T23:59:59.999+05:30`);
        }

        if (status && status !== 'all_paid' && status !== 'All Status' && status !== 'All Orders') {
          query = query.eq('status', status);
        } else if (!includeRefunded) {
          query = query.not('status', 'in', '("Cancelled","cancelled","Refunded","refunded","Refund Completed","Partially Refunded","Returned","returned","return","Return")');
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data && data.length > 0) {
          allOrders.push(...data);
          if (data.length < PAGE_SIZE) {
            hasMore = false;
          } else {
            pageIndex++;
          }
        } else {
          hasMore = false;
        }
      }
    }

    if (allOrders.length === 0) {
      return [];
    }

    // 3. Batch fetch customer profiles (id -> public.profiles in chunks of 200)
    const uniqueUserIds = Array.from(new Set(allOrders.map((o) => o.user_id).filter(Boolean)));
    const profilesMap = new Map();
    const PROFILE_CHUNK = 200;
    for (let i = 0; i < uniqueUserIds.length; i += PROFILE_CHUNK) {
      const chunk = uniqueUserIds.slice(i, i + PROFILE_CHUNK);
      const { data: profs, error: profError } = await supabase
        .from('profiles')
        .select('id, name, email, phone')
        .in('id', chunk);
      if (profError) throw profError;
      profs?.forEach((p) => profilesMap.set(p.id, p));
    }

    // 4. Batch fetch customer addresses (address_id -> public.addresses in chunks of 200)
    const uniqueAddressIds = Array.from(new Set(allOrders.map((o) => o.address_id).filter(Boolean)));
    const addressesMap = new Map();
    const ADDR_CHUNK = 200;
    for (let i = 0; i < uniqueAddressIds.length; i += ADDR_CHUNK) {
      const chunk = uniqueAddressIds.slice(i, i + ADDR_CHUNK);
      const { data: addrs, error: addrError } = await supabase
        .from('addresses')
        .select('address_id, full_name, phone_number, address_line1, address_line2, city, state, postal_code, country')
        .in('address_id', chunk);
      if (addrError) throw addrError;
      addrs?.forEach((a) => addressesMap.set(a.address_id, a));
    }

    // 5. Build export records with clean formatting
    return allOrders.map((order) => {
      const profile = profilesMap.get(order.user_id);
      const address = addressesMap.get(order.address_id);

      // Customer Name fallback order: profiles.name -> addresses recipient name (full_name) -> ""
      const profileName = (profile?.name || '').trim();
      const addressRecipientName = (address?.full_name || '').trim();
      const customerName = profileName || addressRecipientName || '';

      // Email ID: profiles.email. If empty, leave blank
      const email = (profile?.email || '').trim();

      // Contact Phone: addresses.phone_number -> profiles.phone -> ""
      const phone = (address?.phone_number || profile?.phone || '').trim();

      // Street Address (Line 1 & Line 2)
      const line1 = (address?.address_line1 || '').trim();
      const line2 = (address?.address_line2 || '').trim();
      const streetAddress = [line1, line2].filter(Boolean).join(', ');

      const city = (address?.city || '').trim();
      const state = (address?.state || '').trim();
      const pincode = (address?.postal_code || '').trim();

      // Full Formatted Address for one-click shipping label / dispatch
      const statePin = state && pincode ? `${state} - ${pincode}` : (state || pincode);
      const fullAddressParts = [streetAddress, city, statePin].filter(Boolean);
      const fullAddress = fullAddressParts.join(', ');

      // Price: orders.total_price as plain number so Excel can sum it
      const price = isNaN(Number(order.total_price)) ? 0 : Number(order.total_price);

      // Tracking Number: waybill or manual_awb
      const trackingNumber = (order.waybill || order.manual_awb || '').trim();

      // Date & Time: formatted in IST (DD-MM-YYYY HH:mm)
      const dateTime = formatISTDateTime(order.order_date);

      return {
        orderId: order.id,
        customerName: customerName,
        email: email,
        phone: phone,
        address: streetAddress,
        city: city,
        state: state,
        pincode: pincode,
        fullAddress: fullAddress,
        price: price,
        trackingNumber: trackingNumber,
        dateTime: dateTime,
      };
    });
  }
};

