import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { orderService } from '../services/orderService';
import { resolveCustomerName, resolveCustomerPhone } from '../utils/customerName';
import { isCountableCustomerOrder, getOrderCustomerKey } from '../utils/orderUtils';
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

  // Precompute customer order counts and total spent in a single O(N) pass
  const { customerOrderCountMap, customerTotalSpentMap } = useMemo(() => {
    const countMap = new Map();
    const spentMap = new Map();

    for (const order of orders) {
      if (!isCountableCustomerOrder(order)) continue;
      const key = getOrderCustomerKey(order);
      if (key) {
        countMap.set(key, (countMap.get(key) || 0) + 1);
      }
      if (order.user_id) {
        spentMap.set(order.user_id, (spentMap.get(order.user_id) || 0) + Number(order.total_price || 0));
      }
    }
    return { customerOrderCountMap: countMap, customerTotalSpentMap: spentMap };
  }, [orders]);

  const aggregatedCustomers = useMemo(() => {
    // Collect sample address / phone per customer ID in a single O(N) pass
    const orderByUser = new Map();
    for (const o of orders) {
      if (o.user_id && !orderByUser.has(o.user_id)) {
        orderByUser.set(o.user_id, o);
      }
    }

    return customers.map((customer) => {
      const sampleOrder = orderByUser.get(customer.id);
      const phone = resolveCustomerPhone({
        phone: customer.phone || customer.phone_number || customer.mobile || customer.phoneNumber || sampleOrder?.phone || sampleOrder?.phone_number || sampleOrder?.customer?.phone,
        address: sampleOrder?.shipping_address || sampleOrder?.address,
        fallback: 'No phone set',
      });
      const name = resolveCustomerName({
        profileName: customer.name || customer.full_name || sampleOrder?.customer?.name,
        address: sampleOrder?.shipping_address || sampleOrder?.address,
        fallback: 'No name set',
      });
      const email = customer.email || sampleOrder?.customer?.email || '';

      // O(1) Map lookups for count and spent
      const orderCount = customerOrderCountMap.get(`user:${customer.id}`) || 0;
      const totalSpent = customerTotalSpentMap.get(customer.id) || 0;

      return {
        ...customer,
        name,
        email,
        phone,
        orderCount,
        totalSpent,
      };
    });
  }, [orders, customers, customerOrderCountMap, customerTotalSpentMap]);

  const aggregatedOrders = useMemo(() => {
    const customerById = new Map();
    aggregatedCustomers.forEach((c) => {
      if (c.id) customerById.set(c.id, c);
    });

    return orders.map((order) => {
      const matchedCustomer = order.user_id ? customerById.get(order.user_id) : null;
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

      // Fast O(1) map lookup using group-by user_id first, guest phone/email only for null user_id
      const key = getOrderCustomerKey(order);
      const orderCount = customerOrderCountMap.get(key) || 0;

      return {
        ...order,
        customer: {
          id: order.user_id,
          name,
          phone,
          email,
          ...matchedCustomer,
          orderCount,
        },
      };
    });
  }, [orders, aggregatedCustomers, customerOrderCountMap]);

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
