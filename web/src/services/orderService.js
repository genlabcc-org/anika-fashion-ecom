import { supabase } from '../lib/supabase';

export const orderService = {
  /**
   * Retrieves all orders for a specific user.
   * @param {string} userId 
   * @returns {Promise<any[]>}
   */
  async getOrders(userId) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('order_date', { ascending: false });
    if (error) throw error;
    if (data && data.length > 0) {
      try {
        const orderIds = data.map((o) => o.id);
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
   * Retrieves all orders in the system (admin view).
   * @returns {Promise<any[]>}
   */
  async getAllOrders() {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('order_date', { ascending: false });
    if (error) throw error;
    if (data && data.length > 0) {
      try {
        const orderIds = data.map((o) => o.id);
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
          data.forEach((o) => {
            if (itemsByOrderId[o.id]) {
              o.order_items = itemsByOrderId[o.id];
            }
          });
        }
      } catch (e) {
        console.warn('Error joining order_items in getAllOrders:', e);
      }
    }
    return data || [];
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
   * Retrieves all customer profiles in the system (admin view).
   * @returns {Promise<any[]>}
   */
  async getAllCustomers() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
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
  }
};

