import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { orderService } from "../services/orderService";
import { productService } from "../services/productService";
import { useStore } from "../hooks/useStore";
import { getUserInitials } from "../utils/avatarUtils";
import "./AnikaOrders.css";
import Navbar from "../components/SiteHeader";
import Footer from "../components/SiteFooter";
import ThermalInvoice from "../admin/components/ThermalInvoice";

function formatHHMM(date = new Date()) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

const TABS = ["Profile", "Orders", "Addresses", "Wishlists", "Account"];
const PAGE_SIZE = 5;

export default function AnikaOrders() {
  const [activeTab, setActiveTab] = useState("Orders");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [productsMap, setProductsMap] = useState({});
  const [cancellingOrderId, setCancellingOrderId] = useState(null);
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState(null);
  const [invoiceAddress, setInvoiceAddress] = useState(null);
  const [printingInvoice, setPrintingInvoice] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const user = useStore((s) => s.user);
  const sessionLoading = useStore((s) => s.sessionLoading);
  const rawOrders = useStore((s) => s.orders);
  const loadingOrders = useStore((s) => s.loadingOrders);
  const fetchOrders = useStore((s) => s.fetchOrders);
  const setSelectedProduct = useStore((s) => s.setSelectedProduct);

  const [lastUpdated, setLastUpdated] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Banner status: 'confirming' | 'delayed' | null
  const [bannerStatus, setBannerStatus] = useState(() => {
    return location.state?.justPaid ? "confirming" : null;
  });

  // Track page open timestamp to detect newly created orders
  const pageOpenedAtRef = useRef(Date.now());
  // Snapshot initial order IDs present when component mounts
  const initialOrderIdsRef = useRef(new Set((rawOrders || []).map((o) => o.id)));

  // Tab visibility state
  const [isVisible, setIsVisible] = useState(() =>
    typeof document !== "undefined" ? document.visibilityState === "visible" : true
  );

  // Helper to determine if an order was created after page opened
  const isNewOrder = (order) => {
    if (!order) return false;
    const orderTime = new Date(order.created_at || order.order_date).getTime();
    const isRecent = !isNaN(orderTime) && orderTime >= pageOpenedAtRef.current - 10000;
    const isNewId = !initialOrderIdsRef.current.has(order.id);
    return isRecent || (isNewId && initialOrderIdsRef.current.size > 0);
  };

  // Clear justPaid from history state after banner is shown so reload doesn't show it again
  useEffect(() => {
    if (location.state?.justPaid) {
      try {
        navigate(location.pathname + location.search, { replace: true, state: {} });
      } catch (err) {
        console.warn("Could not clear justPaid from history state:", err);
      }
    }
  }, []);

  // Track document visibility: pause polling/realtime when hidden, refetch on visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === "visible";
      setIsVisible(visible);
      if (visible && user?.id) {
        fetchOrders(user.id, { force: true })
          .then(() => setLastUpdated(formatHHMM(new Date())))
          .catch((err) => console.error("Visibility refetch error:", err));
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user?.id, fetchOrders]);

  // Supabase Realtime subscription on orders filtered by user_id
  useEffect(() => {
    if (!user?.id || !isVisible) return;

    let debounceTimer = null;
    const handleOrderChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          await fetchOrders(user.id, { force: true });
          setLastUpdated(formatHHMM(new Date()));
        } catch (err) {
          console.error("Realtime fetchOrders error:", err);
        }
      }, 300);
    };

    const channelName = `customer-orders-${user.id}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `user_id=eq.${user.id}`,
        },
        handleOrderChange
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `user_id=eq.${user.id}`,
        },
        handleOrderChange
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [user?.id, isVisible, fetchOrders]);

  // Hide banner as soon as a new order appears in rawOrders
  useEffect(() => {
    if (bannerStatus && rawOrders.some(isNewOrder)) {
      setBannerStatus(null);
    }
  }, [rawOrders, bannerStatus]);

  // Poll fetchOrders (force) every 2s for up to 30s when justPaid is set
  useEffect(() => {
    if (bannerStatus !== "confirming" || !user?.id) return;

    if (rawOrders.some(isNewOrder)) {
      setBannerStatus(null);
      return;
    }

    const maxDuration = 30000;
    const pollIntervalMs = 2000;

    let pollTimer = null;
    let timeoutTimer = null;

    if (isVisible) {
      const elapsed = Date.now() - pageOpenedAtRef.current;
      const remaining = Math.max(0, maxDuration - elapsed);

      if (remaining <= 0) {
        setBannerStatus("delayed");
        return;
      }

      timeoutTimer = setTimeout(() => {
        setBannerStatus((curr) => (curr === "confirming" ? "delayed" : curr));
      }, remaining);

      pollTimer = setInterval(async () => {
        if (document.visibilityState !== "visible") return;
        try {
          const freshOrders = await fetchOrders(user.id, { force: true });
          setLastUpdated(formatHHMM(new Date()));
          if (freshOrders && freshOrders.some(isNewOrder)) {
            setBannerStatus(null);
          }
        } catch (err) {
          console.warn("Polling error in AnikaOrders:", err);
        }
      }, pollIntervalMs);
    }

    return () => {
      if (pollTimer) clearInterval(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
    };
  }, [bannerStatus, user?.id, isVisible, fetchOrders]);


  useEffect(() => {
    if (!rawOrders || rawOrders.length === 0) return;
    const productIds = new Set();
    rawOrders.forEach(o => (o.order_items || []).forEach(i => {
      if (i.product_id) productIds.add(i.product_id);
    }));
    if (productIds.size === 0) return;

    productService.getProductsByIds([...productIds]).then((data) => {
      const map = {};
      (data || []).forEach((p) => { map[p.name] = p; });
      setProductsMap(map);
    }).catch((err) => console.error("Error fetching Product:", err));
  }, [rawOrders]);

  const handleItemClick = (item) => {
    const product = productsMap[item.product_name];
    if (product) {
      const targetId = product.product_id || product.id;
      const formattedProduct = {
        ...product,
        id: targetId,
        productId: targetId,
        img: product.image_url || (product.images && product.images[0]) || '/src/assets/cart/bangle1.webp',
        name: product.name,
        desc: product.description,
        price: product.price,
        originalPrice: (product.compare_price && Number(product.compare_price) > Number(product.price)) ? Number(product.compare_price) : 0,
        compare_price: (product.compare_price && Number(product.compare_price) > Number(product.price)) ? Number(product.compare_price) : 0,
        sizes: product.sizes || [],
        stock: product.stock > 0 ? 'in-stock' : 'out-of-stock',
        category: product.categories?.name || product.category || 'Bangles'
      };
      setSelectedProduct(formattedProduct);
      navigate(`/product/${targetId}`);
    }
  };

  const handleTrackOrder = (order, item) => {
    const fullOrder = rawOrders.find((o) => o.id === order.id) || order;
    navigate(`/profile/orders/track/${order.id}`, {
      state: { order: fullOrder, item }
    });
  };

  const handleViewInvoice = async (orderSummary) => {
    const fullOrder = rawOrders.find((o) => o.id === orderSummary.id) || orderSummary;
    setSelectedInvoiceOrder(fullOrder);
    setInvoiceAddress(null);
    if (user?.id) {
      try {
        const addresses = await orderService.getAddresses(user.id);
        const defaultAddr = addresses.find((a) => a.is_default) || addresses[0];
        setInvoiceAddress(defaultAddr || null);
      } catch (err) {
        console.debug("Could not fetch address for invoice:", err);
      }
    }
  };

  const handlePrintUserInvoice = () => {
    setPrintingInvoice(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrintingInvoice(false), 1000);
    }, 250);
  };

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      navigate("/account/login");
    }
  }, [user, sessionLoading, navigate]);

  // On mount, call fetchOrders(user.id, { force: true }). Keep cached orders visible while fresh fetch runs.
  useEffect(() => {
    if (!user?.id) return;
    let isCurrent = true;
    fetchOrders(user.id, { force: true })
      .then(() => {
        if (isCurrent) setLastUpdated(formatHHMM(new Date()));
      })
      .catch((err) => console.error("Initial fetchOrders error:", err));

    return () => {
      isCurrent = false;
    };
  }, [user?.id, fetchOrders]);


  const orders = useMemo(() => {
    return rawOrders.map((item) => ({
      id: item.id,
      date: new Date(item.order_date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
      }),
      item: item.item_name,
      qty: item.quantity,
      price: "₹" + parseFloat(item.total_price).toLocaleString("en-IN"),
      status: item.status,
      order_items: item.order_items || [],
      deliveryProvider: item.delivery_provider,
      courierName: item.courier_name,
      courier_name: item.courier_name,
      waybill: item.waybill,
      shipmentId: item.shipment_id,
      shipment_id: item.shipment_id,
      deliveryStatus: item.delivery_status,
      delivery_status: item.delivery_status,
      trackingUrl: item.tracking_url,
      tracking_url: item.tracking_url,
      estimatedDeliveryDate: item.estimated_delivery_date
        ? new Date(item.estimated_delivery_date).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric"
        })
        : null
    }));
  }, [rawOrders]);

  const handleManualRefresh = async () => {
    if (!user?.id || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fetchOrders(user.id, { force: true });
      setLastUpdated(formatHHMM(new Date()));
    } catch (err) {
      console.error("Failed to refresh orders:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm("Are you sure you want to cancel this order?")) {
      return;
    }
    try {
      setCancellingOrderId(orderId);
      await orderService.cancelOrder(orderId);
      if (user) {
        await fetchOrders(user.id, { force: true });
        setLastUpdated(formatHHMM(new Date()));
      }
    } catch (err) {
      alert("Failed to cancel order: " + err.message);
    } finally {
      setCancellingOrderId(null);
    }
  };


  // ← handle tab navigation
  const handleTabClick = (tab) => {
    if (tab === "Profile") {
      navigate("/profile");
    } else if (tab === "Orders") {
      setActiveTab("Orders");
    } else if (tab === "Addresses") {
      navigate("/profile/addresses");
    } else if (tab === "Wishlists") {
      navigate("/profile/wishlists");
    } else if (tab === "Account") {
      navigate("/profile/account");
    }
  };

  const handleNavClick = (link) => {
    if (link === "Home") navigate("/");
    else navigate(`/${link.toLowerCase()}`);
  };

  const visibleOrders = orders.slice(0, visibleCount);
  const hasMore = visibleCount < orders.length;

  return (
    <>
      <Navbar onLinkClick={handleNavClick} />
      <div className="ao-root">
        <div className="ao-page-top">
          <h1 className="ao-profile-title">Profile</h1>
        </div>

        {/* ── USER INFO — real data ── */}
        <div className="ao-user-section">
          <div className="ao-avatar">
            {getUserInitials(user?.user_metadata?.name || user?.email)}
          </div>
          <div className="ao-user-text">
            <span className="ao-user-name">{user?.user_metadata?.name || "User"}</span>
            <span className="ao-user-meta">
              {user?.email} &nbsp;·&nbsp; Member since{" "}
              {user ? new Date(user.created_at).toLocaleDateString("en-IN", {
                month: "short", year: "numeric"
              }) : ""}
            </span>
            <span className="ao-vip-badge">{orders.length} orders</span>
          </div>
        </div>

        <hr className="ao-divider" />

        {/* ── TABS ── */}
        <div className="ao-tabs">
          {TABS.map((tab) => (
            <button
              key={tab}
              className={`ao-tab${activeTab === tab ? " ao-tab--active" : ""}`}
              onClick={() => handleTabClick(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Just-Paid Confirmation Banner */}
        {bannerStatus && (
          <div
            className={`ao-payment-banner ao-payment-banner--${bannerStatus}`}
            role="status"
          >
            {bannerStatus === "confirming" ? (
              <>
                <div>
                  Payment received ✓ We're confirming your order. This takes just a few seconds.
                </div>
              </>
            ) : (
              <>
                <div>
                  Your payment was received, but your order is taking longer than usual to appear. Please don't pay again. Contact us on WhatsApp at{" "}
                  <a
                    href="https://wa.me/919363631636"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ao-whatsapp-link"
                  >
                    +91 93636 31636
                  </a>{" "}
                  and we'll confirm it for you.
                </div>
              </>
            )}
          </div>
        )}

        {/* ── ORDER HISTORY CARD ── */}
        <div className="ao-card">
          <div className="ao-card-header">
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span className="ao-card-title">Order History</span>
              <span className="ao-order-count">{orders.length} Orders</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              {lastUpdated && (
                <span className="ao-last-updated">
                  Last updated {lastUpdated}
                </span>
              )}
              <button
                type="button"
                className="ao-refresh-btn"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                title="Refresh orders"
              >
                <span
                  style={{
                    display: "inline-block",
                    fontSize: "13px",
                    lineHeight: 1,
                    transformOrigin: "center"
                  }}
                  className={isRefreshing ? "ao-spin" : ""}
                >
                  ↻
                </span>
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <div className="ao-order-list">
            {orders.length === 0 && !loadingOrders && (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#888", fontSize: "13.5px" }}>
                No orders found.
              </div>
            )}
            {visibleOrders.map((order, idx) => {
              const orderItems = order.order_items && order.order_items.length > 0
                ? order.order_items
                : [{
                  product_name: order.item,
                  quantity: order.qty || 1,
                  price: order.price,
                  size: null,
                  color: null,
                  image_url: null
                }];

              const totalItemCount = orderItems.reduce((acc, i) => acc + Number(i.quantity || i.qty || 1), 0);
              const itemsSummary = orderItems.map(i => {
                const q = Number(i.quantity || i.qty || 1);
                return `${i.product_name}${q > 1 ? ` (×${q})` : ''}`;
              }).join(', ');

              return (
                <div
                  key={idx}
                  className="ao-order-block"
                  onClick={() => handleTrackOrder(order, orderItems[0])}
                  style={{
                    borderBottom: idx < visibleOrders.length - 1 ? '1px solid #ebebeb' : 'none',
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease'
                  }}
                >
                  {/* Top Line: Name & Order ID (left) + Price (right) */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: '700', color: '#111', fontSize: '13.5px' }}>Order: #{order.id?.slice(-8) || order.id}</span>
                      <span style={{ color: '#aaa' }}>·</span>
                      <span style={{ fontSize: '12px', color: '#666' }}>{order.date}</span>
                      <span style={{ color: '#aaa' }}>·</span>
                      <span style={{ fontSize: '12px', color: '#666' }}>{totalItemCount} item{totalItemCount > 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ fontWeight: '700', color: '#111', fontSize: '14.5px', flexShrink: 0 }}>
                      {order.price}
                    </div>
                  </div>

                  {/* Middle Line: Product Thumbnails & Product Names */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                    {/* Overlapping Product Thumbnails */}
                    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, position: 'relative' }}>
                      {orderItems.slice(0, 3).map((item, imgIdx) => {
                        const product = productsMap[item.product_name];
                        const image = item.image_url || product?.image_url || (product?.images && product.images[0]) || '/src/assets/cart/bangle1.webp';
                        return (
                          <div
                            key={imgIdx}
                            style={{
                              width: '44px',
                              height: '44px',
                              borderRadius: '8px',
                              overflow: 'hidden',
                              border: '2px solid #fff',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                              background: '#f4f4f5',
                              marginLeft: imgIdx > 0 ? '-14px' : '0',
                              zIndex: 3 - imgIdx,
                              flexShrink: 0
                            }}
                          >
                            <img src={image} alt={item.product_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        );
                      })}
                    </div>

                    {/* Product Names */}
                    <div style={{ flex: 1, minWidth: 0, fontSize: '13px', fontWeight: '500', color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {itemsSummary}
                    </div>
                  </div>

                  {/* Shipment Tracking Info (shown if waybill or manual courier present) */}
                  {(order.waybill || order.manual_awb || order.fulfillment_type === 'manual') && (() => {
                    const isManual = order.fulfillment_type === 'manual';
                    const activeCourier = isManual ? (order.manual_courier_name || order.courier_name || 'Manual') : (order.courier_name || order.courierName || order.deliveryProvider || 'iCarry');
                    const activeAwb = isManual ? (order.manual_awb || order.waybill) : order.waybill;
                    let activeTrackingUrl = isManual ? (order.manual_tracking_url || order.tracking_url) : (order.tracking_url || order.trackingUrl);

                    // Auto-generate 17TRACK link if tracking URL is missing or generic
                    if (activeAwb && (!activeTrackingUrl || activeTrackingUrl === 'https://stcourier.com')) {
                      activeTrackingUrl = `https://t.17track.net/en#nums=${encodeURIComponent(activeAwb)}`;
                    }

                    // If manual fulfillment has no AWB or tracking info yet, don't render an empty strip
                    if (isManual && !activeAwb && !activeTrackingUrl) {
                      return null;
                    }

                    const statusStr = (order.delivery_status || order.deliveryStatus || '').trim();
                    const isPickupCancelled = statusStr.toLowerCase().includes('pickup cancel');
                    const isCancelled = !isPickupCancelled && statusStr.toLowerCase().includes('cancel');
                    const isNDR = statusStr.toUpperCase().startsWith('NDR');
                    const isDelivered = statusStr.toLowerCase() === 'delivered' || (order.status || '').toLowerCase() === 'delivered';

                    const boxBg = isCancelled ? '#fef2f2' : isNDR ? '#fffbeb' : isDelivered ? '#f0fdf4' : '#f8fafc';
                    const boxBorder = isCancelled ? '#fecaca' : isNDR ? '#fde68a' : isDelivered ? '#bbf7d0' : '#e2e8f0';
                    const textColor = isCancelled ? '#991b1b' : isNDR ? '#92400e' : isDelivered ? '#166534' : '#475569';
                    const badgeBg = isCancelled ? '#fee2e2' : isNDR ? '#fef3c7' : isDelivered ? '#dcfce7' : isPickupCancelled ? '#fef3c7' : '#e2e8f0';
                    const badgeText = isCancelled ? '#b91c1c' : isNDR ? '#b45309' : isDelivered ? '#15803d' : isPickupCancelled ? '#b45309' : '#334155';

                    const displayStatus = isPickupCancelled ? 'Preparing your order' : isDelivered ? 'Delivered' : (statusStr || 'Booked');

                    return (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: boxBg,
                          border: `1px solid ${boxBorder}`,
                          borderRadius: '6px',
                          padding: '7px 12px',
                          fontSize: '12px',
                          flexWrap: 'wrap',
                          gap: '8px',
                          transition: 'all 0.15s ease'
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', color: textColor }}>
                          <span><strong>Courier:</strong> {activeCourier}</span>
                          {activeAwb && (
                            <>
                              <span style={{ color: boxBorder }}>·</span>
                              <span><strong>{isManual ? 'Tracking ID:' : 'AWB:'}</strong> {activeAwb}</span>
                            </>
                          )}
                          {!isManual && (
                            <>
                              <span style={{ color: boxBorder }}>·</span>
                              <span>
                                <strong>Status:</strong>{' '}
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  background: badgeBg,
                                  color: badgeText,
                                  border: isDelivered ? '1px solid #bbf7d0' : undefined
                                }}>
                                  {displayStatus}
                                </span>
                              </span>
                            </>
                          )}
                        </div>
                        {activeTrackingUrl && (
                          <a
                            href={activeTrackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: isCancelled ? '#dc2626' : isNDR ? '#b45309' : isDelivered ? '#15803d' : '#C42049',
                              fontWeight: '600',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              background: isCancelled ? '#fee2e2' : isNDR ? '#fef3c7' : isDelivered ? '#dcfce7' : '#fff',
                              border: `1px solid ${boxBorder}`
                            }}
                          >
                            Track Package ↗
                          </a>
                        )}
                      </div>
                    );
                  })()}

                  {/* Bottom Line: Status Badge & Actions */}
                  {(() => {
                    const isDelivered =
                      (order.delivery_status || order.deliveryStatus || "").toLowerCase() === "delivered" ||
                      (order.status || "").toLowerCase() === "delivered";
                    const isPickupCancelled =
                      (order.delivery_status || order.deliveryStatus || "").toLowerCase().includes("pickup cancel");
                    const isCancelled =
                      ((order.delivery_status || order.deliveryStatus || "").toLowerCase().includes("cancel") && !isPickupCancelled) ||
                      ((order.status || "").toLowerCase().includes("cancel") && !(order.status || "").toLowerCase().includes("pickup cancel"));

                    const displayStatus = isCancelled ? "Cancelled" : isDelivered ? "Delivered" : isPickupCancelled ? "Preparing your order" : order.status;
                    const statusClass = displayStatus.toLowerCase().replace(/\s+/g, '-');

                    return (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', width: '100%', paddingTop: '2px' }}>
                        <span
                          className={`ao-order-status ao-status--${statusClass}`}
                          style={{
                            fontSize: '11px',
                            padding: '4px 9px',
                            borderRadius: '12px',
                            fontWeight: '600',
                            ...(isDelivered
                              ? {
                                background: '#dcfce7',
                                color: '#15803d',
                                border: '1px solid #bbf7d0'
                              }
                              : {})
                          }}
                        >
                          {displayStatus}
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleViewInvoice(order)}
                            title="View and print invoice"
                            style={{
                              background: '#fff',
                              border: '1px solid #d4d4d8',
                              borderRadius: '6px',
                              padding: '4px 10px',
                              fontSize: '11.5px',
                              fontWeight: '500',
                              color: '#333',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              height: '28px',
                              boxSizing: 'border-box'
                            }}
                          >
                            Invoice
                          </button>

                          {(order.status === "Pending" || order.status === "Confirmed") &&
                            !isDelivered &&
                            !isCancelled && (
                              <button
                                className="ao-cancel-order-btn"
                                onClick={() => handleCancelOrder(order.id)}
                                disabled={cancellingOrderId === order.id}
                                style={{ height: '28px', padding: '4px 10px', fontSize: '11.5px' }}
                              >
                                {cancellingOrderId === order.id ? 'Cancelling...' : 'Cancel'}
                              </button>
                            )}

                          <span
                            onClick={() => handleTrackOrder(order, orderItems[0])}
                            style={{
                              fontSize: '12px',
                              color: '#C42049',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                              marginLeft: '4px'
                            }}
                          >
                            Track →
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div className="ao-show-more-wrap">
              <button
                className="ao-show-more-btn"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              >
                Show More
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Invoice Modal for Customer */}
      {selectedInvoiceOrder && (
        <div className="inv__modal-overlay" onClick={() => setSelectedInvoiceOrder(null)}>
          <div className="inv__modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="inv__modal-header">
              <div>
                <h3 className="inv__modal-title">Order Receipt (4" × 6")</h3>
                <p className="inv__modal-subtitle">
                  Order #{String(selectedInvoiceOrder.id).slice(-8).toUpperCase()} · 100 × 150 mm
                </p>
              </div>
              <button
                className="inv__modal-close"
                onClick={() => setSelectedInvoiceOrder(null)}
                aria-label="Close invoice"
              >
                ✕
              </button>
            </div>

            <div className="inv__modal-body">
              <ThermalInvoice
                order={selectedInvoiceOrder}
                address={invoiceAddress}
                isPreview={true}
              />
            </div>

            <div className="inv__modal-footer">
              <button
                className="inv__modal-close-btn"
                onClick={() => setSelectedInvoiceOrder(null)}
              >
                Close
              </button>
              <button
                className="inv__modal-print-btn"
                onClick={handlePrintUserInvoice}
                disabled={printingInvoice}
              >
                {printingInvoice ? (
                  <>
                    <span className="inv__spin">⏳</span> Printing...
                  </>
                ) : (
                  <>
                    <span>🖨️</span> Print / Save Receipt
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden print container for customer */}
      {selectedInvoiceOrder && (
        <div className="thermal-print-area">
          <ThermalInvoice order={selectedInvoiceOrder} address={invoiceAddress} />
        </div>
      )}

      <Footer />
    </>
  );
}