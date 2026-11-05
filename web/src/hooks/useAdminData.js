import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { orderService } from '../services/orderService';
import { resolveCustomerName, resolveCustomerPhone } from '../utils/customerName';
import { isCountableCustomerOrder, getOrderCustomerKey } from '../utils/orderUtils';
import { useStore } from './useStore';

const INITIAL_ORDERS_LIMIT = 10;
const INITIAL_CUSTOMERS_LIMIT = 10;
const SCROLL_BATCH_SIZE = 20;

export function useAdminData() {
  const [orders, setOrders] = useState([]);
  const [summaryOrders, setSummaryOrders] = useState([]);
  const [searchedOrders, setSearchedOrders] = useState([]);
  const [searchingOrders, setSearchingOrders] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [pagedCustomers, setPagedCustomers] = useState([]);
  const [searchedCustomers, setSearchedCustomers] = useState([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMoreOrders, setLoadingMoreOrders] = useState(false);
  const [hasMoreOrders, setHasMoreOrders] = useState(false);
  const [totalOrdersCount, setTotalOrdersCount] = useState(0);
  const [loadingMoreCustomers, setLoadingMoreCustomers] = useState(false);
  const [hasMoreCustomers, setHasMoreCustomers] = useState(false);
  const [totalCustomersCount, setTotalCustomersCount] = useState(0);
  const [error, setError] = useState(null);
  const nextOffsetRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(false);
  const nextCustomerOffsetRef = useRef(0);
  const loadingMoreCustomersRef = useRef(false);
  const hasMoreCustomersRef = useRef(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [firstBatch, firstCustomerBatch, fetchedCustomers, allSummary] = await Promise.all([
        orderService.getOrdersBatch({ offset: 0, limit: INITIAL_ORDERS_LIMIT }),
        orderService.getCustomersBatch({ offset: 0, limit: INITIAL_CUSTOMERS_LIMIT }),
        orderService.getAllCustomers(),
        orderService.getOrdersSummary().catch((e) => {
          console.warn('Error fetching orders summary:', e);
          return [];
        }),
      ]);
      const fetchedOrders = firstBatch.orders || [];
      const total = firstBatch.totalCount ?? (allSummary?.length || fetchedOrders.length);

      nextOffsetRef.current = fetchedOrders.length;
      const more = fetchedOrders.length < total;
      hasMoreRef.current = more;

      const initialCustomers = firstCustomerBatch.customers || [];
      const totalCust = firstCustomerBatch.totalCount ?? (fetchedCustomers?.length || initialCustomers.length);
      nextCustomerOffsetRef.current = initialCustomers.length;
      const moreCust = initialCustomers.length < totalCust;
      hasMoreCustomersRef.current = moreCust;

      setOrders(fetchedOrders);
      setSummaryOrders(allSummary && allSummary.length > 0 ? allSummary : fetchedOrders);
      setTotalOrdersCount(total);
      setHasMoreOrders(more);
      setCustomers(fetchedCustomers);
      setPagedCustomers(initialCustomers);
      setTotalCustomersCount(totalCust);
      setHasMoreCustomers(moreCust);
    } catch (err) {
      console.error('Error fetching admin data:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreCustomers = useCallback(async (batchSize = SCROLL_BATCH_SIZE) => {
    if (loadingMoreCustomersRef.current || !hasMoreCustomersRef.current) return;
    loadingMoreCustomersRef.current = true;
    setLoadingMoreCustomers(true);
    try {
      const currentOffset = nextCustomerOffsetRef.current;
      const { customers: nextBatch, totalCount } = await orderService.getCustomersBatch({
        offset: currentOffset,
        limit: batchSize,
      });

      const newOffset = currentOffset + (nextBatch?.length || 0);
      nextCustomerOffsetRef.current = newOffset;
      const more = (nextBatch?.length || 0) === batchSize && newOffset < totalCount;
      hasMoreCustomersRef.current = more;

      setPagedCustomers((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const uniqueNew = (nextBatch || []).filter((c) => !existingIds.has(c.id));
        return [...prev, ...uniqueNew];
      });
      setTotalCustomersCount(totalCount);
      setHasMoreCustomers(more);
    } catch (err) {
      console.error('Error loading more customers:', err);
    } finally {
      loadingMoreCustomersRef.current = false;
      setLoadingMoreCustomers(false);
    }
  }, []);

  const loadMoreOrders = useCallback(async (batchSize = SCROLL_BATCH_SIZE) => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMoreOrders(true);
    try {
      const currentOffset = nextOffsetRef.current;
      const { orders: nextBatch, totalCount } = await orderService.getOrdersBatch({
        offset: currentOffset,
        limit: batchSize,
      });

      const newOffset = currentOffset + (nextBatch?.length || 0);
      nextOffsetRef.current = newOffset;
      const more = (nextBatch?.length || 0) === batchSize && newOffset < totalCount;
      hasMoreRef.current = more;

      setOrders((prev) => {
        const existingIds = new Set(prev.map((o) => o.id));
        const uniqueNew = (nextBatch || []).filter((o) => !existingIds.has(o.id));
        return [...prev, ...uniqueNew];
      });
      setTotalOrdersCount(totalCount);
      setHasMoreOrders(more);
    } catch (err) {
      console.error('Error loading more orders:', err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMoreOrders(false);
    }
  }, []);

  // Synchronize with optimistic in-app order updates from useStore (single source of truth)
  useEffect(() => {
    const unregister = useStore.getState().registerAdminOrderListener((orderId, patch) => {
      setOrders((currentOrders) =>
        currentOrders.map((o) => (o.id === orderId ? { ...o, ...patch } : o))
      );
      setSummaryOrders((currentOrders) =>
        currentOrders.map((o) => (o.id === orderId ? { ...o, ...patch } : o))
      );
      setSearchedOrders((currentOrders) =>
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
                nextOffsetRef.current += 1;
                setTotalOrdersCount((c) => c + 1);
                return [orderToInsert, ...currentOrders];
              });
              setSummaryOrders((currentOrders) => {
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
            setSummaryOrders((currentOrders) =>
              currentOrders.map((o) => (o.id === newRecord.id ? { ...o, ...newRecord } : o))
            );
            setSearchedOrders((currentOrders) =>
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
              setSummaryOrders((currentOrders) =>
                currentOrders.filter((o) => o.id !== deleteId)
              );
              setSearchedOrders((currentOrders) =>
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
          setPagedCustomers((currentCustomers) => {
            if (eventType === 'INSERT') {
              if (currentCustomers.some((c) => c.id === newRecord.id)) {
                return currentCustomers;
              }
              nextCustomerOffsetRef.current += 1;
              setTotalCustomersCount((c) => c + 1);
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
          setSearchedCustomers((currentCustomers) => {
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

  const fullOrderSource = summaryOrders.length > 0 ? summaryOrders : orders;

  // Precompute customer order counts and total spent in a single O(N) pass across all orders
  const { customerOrderCountMap, customerTotalSpentMap, orderByUserMap } = useMemo(() => {
    const countMap = new Map();
    const spentMap = new Map();
    const sampleMap = new Map();

    for (const order of fullOrderSource) {
      if (order.user_id && !sampleMap.has(order.user_id)) {
        sampleMap.set(order.user_id, order);
      }
      if (!isCountableCustomerOrder(order)) continue;
      const key = getOrderCustomerKey(order);
      if (key) {
        countMap.set(key, (countMap.get(key) || 0) + 1);
      }
      if (order.user_id) {
        spentMap.set(order.user_id, (spentMap.get(order.user_id) || 0) + Number(order.total_price || 0));
      }
    }
    return {
      customerOrderCountMap: countMap,
      customerTotalSpentMap: spentMap,
      orderByUserMap: sampleMap,
    };
  }, [fullOrderSource]);

  const enrichCustomerList = useCallback((customerList) => {
    return (customerList || []).map((customer) => {
      const sampleOrder = orderByUserMap.get(customer.id);
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
  }, [orderByUserMap, customerOrderCountMap, customerTotalSpentMap]);

  const aggregatedCustomers = useMemo(() => enrichCustomerList(customers), [customers, enrichCustomerList]);
  const aggregatedPagedCustomers = useMemo(() => enrichCustomerList(pagedCustomers), [pagedCustomers, enrichCustomerList]);
  const aggregatedSearchedCustomers = useMemo(() => enrichCustomerList(searchedCustomers), [searchedCustomers, enrichCustomerList]);

  const searchCustomersInDb = useCallback(async (query) => {
    const trimmed = (query || '').trim();
    if (!trimmed) {
      setSearchedCustomers([]);
      setSearchingCustomers(false);
      return;
    }

    setSearchingCustomers(true);
    try {
      const results = await orderService.searchCustomers(trimmed);
      setSearchedCustomers(results || []);
    } catch (err) {
      console.error('Error searching customers in DB:', err);
    } finally {
      setSearchingCustomers(false);
    }
  }, []);

  const enrichOrderList = useCallback((orderList) => {
    const customerById = new Map();
    aggregatedCustomers.forEach((c) => {
      if (c.id) customerById.set(c.id, c);
    });

    return orderList.map((order) => {
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

      const key = getOrderCustomerKey(order);
      const orderCount = customerOrderCountMap.get(key) || 1;

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
  }, [aggregatedCustomers, customerOrderCountMap]);

  const aggregatedOrders = useMemo(() => enrichOrderList(orders), [orders, enrichOrderList]);
  const aggregatedSummaryOrders = useMemo(() => enrichOrderList(fullOrderSource), [fullOrderSource, enrichOrderList]);
  const aggregatedSearchedOrders = useMemo(() => enrichOrderList(searchedOrders), [searchedOrders, enrichOrderList]);

  const searchOrdersInDb = useCallback(async (query) => {
    const trimmed = (query || '').trim();
    if (!trimmed) {
      setSearchedOrders([]);
      setSearchingOrders(false);
      return;
    }

    setSearchingOrders(true);
    try {
      const lower = trimmed.toLowerCase();
      const matchingUserIds = aggregatedCustomers
        .filter((c) =>
          (c.name || '').toLowerCase().includes(lower) ||
          (c.email || '').toLowerCase().includes(lower) ||
          (c.phone || '').toLowerCase().includes(lower)
        )
        .map((c) => c.id)
        .filter(Boolean);

      const results = await orderService.searchOrders({
        query: trimmed,
        matchingUserIds,
      });
      setSearchedOrders(results || []);
    } catch (err) {
      console.error('Error searching orders in DB:', err);
    } finally {
      setSearchingOrders(false);
    }
  }, [aggregatedCustomers]);

  return {
    orders: aggregatedOrders,
    allOrders: aggregatedSummaryOrders,
    searchedOrders: aggregatedSearchedOrders,
    searchingOrders,
    searchOrdersInDb,
    rawOrders: orders,
    customers: aggregatedCustomers,
    pagedCustomers: aggregatedPagedCustomers,
    searchedCustomers: aggregatedSearchedCustomers,
    searchingCustomers,
    searchCustomersInDb,
    loadingMoreCustomers,
    hasMoreCustomers,
    totalCustomersCount,
    loadMoreCustomers,
    rawCustomers: customers,
    loading,
    loadingMoreOrders,
    hasMoreOrders,
    totalOrdersCount,
    loadMoreOrders,
    error,
    refetch: fetchData,
    updateOrderStatus,
    updateOrderInList,
  };
}
