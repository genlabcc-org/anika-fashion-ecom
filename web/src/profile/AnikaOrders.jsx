import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { orderService } from "../services/orderService";
import { productService } from "../services/productService";
import { useStore } from "../hooks/useStore";
import { getUserInitials } from "../utils/avatarUtils";
import "./AnikaOrders.css";
import Navbar from "../components/SiteHeader";
import Footer from "../components/SiteFooter";
import ThermalInvoice from "../admin/components/ThermalInvoice";

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
  const fetchOrders = useStore((s) => s.fetchOrders);
  const setSelectedProduct = useStore((s) => s.setSelectedProduct);


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
      const formattedProduct = {
        ...product,
        id: product.product_id || product.id,
        productId: product.product_id || product.id,
        img: product.image_url || (product.images && product.images[0]) || '/src/assets/cart/bangle1.webp',
        name: product.name,
        desc: product.description,
        price: product.price,
        originalPrice: product.compare_price || Math.round(product.price * 1.3),
        sizes: product.sizes || [],
        stock: product.stock > 0 ? 'in-stock' : 'out-of-stock',
        category: product.categories?.name || product.category || 'Bangles'
      };
      setSelectedProduct(formattedProduct);
      navigate("/product");
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
      return
    }
    fetchOrders(user.id);
  }, [user, sessionLoading]);


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

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm("Are you sure you want to cancel this order?")) {
      return;
    }
    try {
      setCancellingOrderId(orderId);
      await orderService.cancelOrder(orderId);
      if (user) {
        await fetchOrders(user.id, { force: true });
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

        {/* ── ORDER HISTORY CARD ── */}
        <div className="ao-card">
          <div className="ao-card-header">
            <span className="ao-card-title">Order History</span>
            <span className="ao-order-count">{orders.length} Orders</span>
          </div>

          <div className="ao-order-list">
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

                  {/* Shipment Tracking Info (only shown if waybill is present) */}
                  {order.waybill && (() => {
                    const statusStr = (order.delivery_status || order.deliveryStatus || '').trim();
                    const isCancelled = statusStr.toLowerCase().includes('cancel');
                    const isNDR = statusStr.toUpperCase().startsWith('NDR');
                    const isDelivered = statusStr.toLowerCase() === 'delivered' || (order.status || '').toLowerCase() === 'delivered';

                    const boxBg = isCancelled ? '#fef2f2' : isNDR ? '#fffbeb' : isDelivered ? '#f0fdf4' : '#f8fafc';
                    const boxBorder = isCancelled ? '#fecaca' : isNDR ? '#fde68a' : isDelivered ? '#bbf7d0' : '#e2e8f0';
                    const textColor = isCancelled ? '#991b1b' : isNDR ? '#92400e' : isDelivered ? '#166534' : '#475569';
                    const badgeBg = isCancelled ? '#fee2e2' : isNDR ? '#fef3c7' : isDelivered ? '#dcfce7' : '#e2e8f0';
                    const badgeText = isCancelled ? '#b91c1c' : isNDR ? '#b45309' : isDelivered ? '#15803d' : '#334155';

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
                          <span><strong>Courier:</strong> {order.courier_name || order.courierName || order.deliveryProvider || 'iCarry'}</span>
                          <span style={{ color: boxBorder }}>·</span>
                          <span><strong>AWB:</strong> {order.waybill}</span>
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
                              {isDelivered ? 'Delivered' : (statusStr || 'Booked')}
                            </span>
                          </span>
                        </div>
                        {(order.tracking_url || order.trackingUrl) && (
                          <a
                            href={order.tracking_url || order.trackingUrl}
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
                    const isCancelled =
                      (order.delivery_status || order.deliveryStatus || "").toLowerCase().includes("cancel") ||
                      (order.status || "").toLowerCase().includes("cancel");

                    const displayStatus = isCancelled ? "Cancelled" : isDelivered ? "Delivered" : order.status;
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
                            <span>🧾</span> Invoice
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
                <h3 className="inv__modal-title">Order Receipt</h3>
                <p className="inv__modal-subtitle">
                  Order #{String(selectedInvoiceOrder.id).slice(-8).toUpperCase()}
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