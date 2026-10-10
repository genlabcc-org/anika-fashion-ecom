import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { orderService } from '../services/orderService';
import { resolveCustomerName, resolveCustomerPhone } from '../utils/customerName';
import { useStore } from './useStore';

export function useAdminData() {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [fetchedOrders, fetchedCustomers] = await Promise.all([
        orderService.getAllOrders(),
        orderService.getAllCustomers(),
      ]);
      setOrders(fetchedOrders);
      setCustomers(fetchedCustomers);
    } catch (err) {
      console.error('Error fetching admin data:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  // Synchronize with optimistic in-app order updates from useStore (single source of truth)
  useEffect(() => {
    const unregister = useStore.getState().registerAdminOrderListener((orderId, patch) => {
      setOrders((currentOrders) =>
        currentOrders.map((o) => (o.id === orderId ? { ...o, ...patch } : o))
      );
    });
    return () => {
      if (typeof unregister === 'function') unregister();
    };
  }, []);

  useEffect(() => {
    fetchData();

    // Subscribe to realtime database changes
    const channel = supabase
      .channel('admin-realtime-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;
          if (eventType === 'INSERT') {
            (async () => {
              let orderToInsert = newRecord;
              if (!newRecord.order_items) {
                try {
                  const fullOrder = await orderService.getOrderById(newRecord.id);
                  if (fullOrder) orderToInsert = fullOrder;
                } catch (err) {
                  console.warn('[useAdminData] Error fetching single order joins on INSERT:', err);
                }
              }
              setOrders((currentOrders) => {
                if (currentOrders.some((o) => o.id === orderToInsert.id)) {
                  return currentOrders;
                }
                return [orderToInsert, ...currentOrders];
              });
            })();
          } else if (eventType === 'UPDATE') {
            setOrders((currentOrders) =>
              currentOrders.map((o) => (o.id === newRecord.id ? { ...o, ...newRecord } : o))
            );
            // Sync with useStore (keeps selectedAdminOrder live)
            useStore.getState().updateOrderInList(newRecord.id, newRecord);
          } else if (eventType === 'DELETE') {
            const deleteId = oldRecord?.id;
            if (deleteId) {
              setOrders((currentOrders) =>
                currentOrders.filter((o) => o.id !== deleteId)
              );
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;
          setCustomers((currentCustomers) => {
            if (eventType === 'INSERT') {
              if (currentCustomers.some((c) => c.id === newRecord.id)) {
                return currentCustomers;
              }
              return [newRecord, ...currentCustomers];
            }
            if (eventType === 'UPDATE') {
              return currentCustomers.map((c) => (c.id === newRecord.id ? { ...c, ...newRecord } : c));
            }
            if (eventType === 'DELETE') {
              return currentCustomers.filter((c) => c.id !== oldRecord.id);
            }
            return currentCustomers;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const updateOrderInList = (orderId, patch) => {
    useStore.getState().updateOrderInList(orderId, patch);
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      if (newStatus === "Cancelled") {
        await orderService.cancelOrder(orderId);
      } else {
        await orderService.updateOrderStatus(orderId, newStatus);
      }
      // Optimistically update order status locally and across shared store
      updateOrderInList(orderId, { status: newStatus });
    } catch (err) {
      console.error('Error updating order status:', err);
      throw err;
    }
  };

  const aggregatedOrders = useMemo(() => {
    return orders.map((order) => {
      const matchedCustomer = customers.find((c) => c.id === order.user_id);
      const orderAddr = order.shipping_address || order.address;
      const phone = resolveCustomerPhone({
        phone: matchedCustomer?.phone || matchedCustomer?.phone_number || matchedCustomer?.mobile || order.phone || order.phone_number || order.customer?.phone,
        address: orderAddr,
        fallback: 'N/A',
      });
      const name = resolveCustomerName({
        profileName: matchedCustomer?.name || matchedCustomer?.full_name || order.customer?.name,
        address: orderAddr,
        fallback: 'No name set',
      });
      const email = matchedCustomer?.email || order.customer?.email || 'N/A';

      return {
        ...order,
        customer: {
          id: order.user_id,
          name,
          phone,
          email,
          ...matchedCustomer,
        },
      };
    });
  }, [orders, customers]);

  const aggregatedCustomers = useMemo(() => {
    return customers.map((customer) => {
      const customerOrders = orders.filter((o) => o.user_id === customer.id);
      const orderWithAddress = customerOrders.find((o) => o.shipping_address || o.address);
      const orderWithPhone = customerOrders.find((o) => o.phone || o.phone_number || o.customer?.phone || o.shipping_address?.phone);
      const orderPhone = orderWithPhone?.phone || orderWithPhone?.phone_number || orderWithPhone?.customer?.phone || orderWithPhone?.shipping_address?.phone;

      const phone = resolveCustomerPhone({
        phone: customer.phone || customer.phone_number || customer.mobile || customer.phoneNumber || orderPhone,
        address: orderWithAddress?.shipping_address || orderWithAddress?.address,
        fallback: 'No phone set',
      });
      const name = resolveCustomerName({
        profileName: customer.name || customer.full_name || customerOrders[0]?.customer?.name,
        address: orderWithAddress?.shipping_address || orderWithAddress?.address,
        fallback: 'No name set',
      });
      const email = customer.email || (customerOrders[0]?.customer?.email) || '';

      const totalSpent = customerOrders
        .filter((o) => {
          const s = o.status?.toLowerCase();
          return s !== 'cancelled' && s !== 'returned';
        })
        .reduce((sum, o) => sum + Number(o.total_price || 0), 0);

      return {
        ...customer,
        name,
        email,
        phone,
        orderCount: customerOrders.length,
        totalSpent,
      };
    });
  }, [orders, customers]);

  return {
    orders: aggregatedOrders,
    rawOrders: orders,
    customers: aggregatedCustomers,
    rawCustomers: customers,
    loading,
    error,
    refetch: fetchData,
    updateOrderStatus,
    updateOrderInList,
  };
}
