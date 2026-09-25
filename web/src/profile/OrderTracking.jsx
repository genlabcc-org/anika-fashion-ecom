import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { orderService } from "../services/orderService";
import { productService } from "../services/productService";
import { useStore } from "../hooks/useStore";
import Navbar from "../components/SiteHeader";
import Footer from "../components/SiteFooter";
import "./OrderTracking.css";

export default function OrderTracking() {
  const { orderId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const user = useStore((s) => s.user);
  const rawOrders = useStore((s) => s.orders);
  const fetchOrders = useStore((s) => s.fetchOrders);

  const [order, setOrder] = useState(location.state?.order || null);
  const [loading, setLoading] = useState(!order);
  const [shippingAddr, setShippingAddr] = useState(
    location.state?.order?.shipping_address || location.state?.order?.address || null
  );
  const [addressLoading, setAddressLoading] = useState(false);
  const [productsMap, setProductsMap] = useState({});

  // Fetch real products from DB so product images and details are always 100% accurate
  useEffect(() => {
    let isMounted = true;
    const fetchDbProducts = async () => {
      try {
        const data = await productService.getProducts();
        if (!isMounted) return;
        const map = {};
        if (data && Array.isArray(data)) {
          data.forEach((p) => {
            if (p.product_id) map[String(p.product_id)] = p;
            if (p.id) map[String(p.id)] = p;
            if (p.name) {
              map[p.name] = p;
              map[p.name.toLowerCase().trim()] = p;
            }
          });
        }
        setProductsMap(map);
      } catch (err) {
        console.error("Error fetching products in OrderTracking:", err);
      }
    };
    fetchDbProducts();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!orderId) return;

    // 1. Initial fetch from DB to ensure freshest data
    const fetchLatestOrder = async () => {
      try {
        setLoading(true);
        const data = await orderService.getOrderById(orderId);
        if (data) {
          // If order_items not attached, query directly from order_items table in DB
          if (!data.order_items || data.order_items.length === 0) {
            try {
              const { data: items } = await supabase
                .from("order_items")
                .select("*")
                .eq("order_id", orderId);
              if (items && items.length > 0) {
                data.order_items = items;
              }
            } catch (err) {
              console.warn("Could not query order_items directly:", err);
            }
          }

          setOrder((prev) => ({
            ...prev,
            ...data,
            order_items: (data.order_items && data.order_items.length > 0)
              ? data.order_items
              : (prev?.order_items || location.state?.order?.order_items || [])
          }));

          // Fetch delivery address from DB
          const targetUserId = data.user_id || user?.id;
          if (targetUserId) {
            try {
              const addrList = await orderService.getAddresses(targetUserId);
              if (addrList && addrList.length > 0) {
                const matched =
                  (data.address_id
                    ? addrList.find((a) => String(a.address_id) === String(data.address_id))
                    : null) ||
                  addrList.find((a) => a.is_default) ||
                  addrList[0];
                if (matched) {
                  setShippingAddr(matched);
                }
              }
            } catch (err) {
              console.error("Error fetching address for order:", err);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load order tracking details:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLatestOrder();

    // 2. Real-time subscription to database changes for this order
    const channel = supabase
      .channel(`order-realtime-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderId}`
        },
        (payload) => {
          console.log("Realtime order status change received:", payload);
          if (payload?.new) {
            setOrder((prev) => {
              if (!prev) return payload.new;
              return {
                ...prev,
                ...payload.new,
                order_items: (payload.new.order_items && payload.new.order_items.length > 0)
                  ? payload.new.order_items
                  : prev.order_items
              };
            });

            // Keep user order history synced
            if (user?.id) {
              fetchOrders(user.id, { force: true });
            }
          }
        }
      )
      .subscribe((status) => {
        console.log(`Order tracking realtime status for #${orderId}:`, status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, user?.id, fetchOrders]);

  useEffect(() => {
    if (user?.id && (!rawOrders || rawOrders.length === 0)) {
      fetchOrders(user.id);
    }
  }, [user, rawOrders, fetchOrders]);

  // Ensure shipping address is fetched from DB for the order owner
  useEffect(() => {
    const targetUserId = order?.user_id || user?.id;
    if (!targetUserId) return;

    const fetchDbAddress = async () => {
      try {
        setAddressLoading(true);
        const addrList = await orderService.getAddresses(targetUserId);
        if (addrList && addrList.length > 0) {
          const matched =
            (order?.address_id
              ? addrList.find((a) => String(a.address_id) === String(order.address_id))
              : null) ||
            addrList.find((a) => a.is_default) ||
            addrList[0];
          if (matched) {
            setShippingAddr(matched);
          }
        }
      } catch (err) {
        console.error("Error fetching shipping address from DB:", err);
      } finally {
        setAddressLoading(false);
      }
    };

    fetchDbAddress();
  }, [order?.user_id, order?.address_id, user?.id]);

  const isCancelled = (order?.status || "").toLowerCase() === "cancelled" ||
    (order?.status || "").toLowerCase() === "refund completed";
  const isRefundCompleted = (order?.status || "").toLowerCase() === "refund completed";

  const rawItems = (order?.order_items && order.order_items.length > 0)
    ? order.order_items
    : [{
      product_id: order?.product_id || null,
      product_name: order?.item_name || order?.item || "Jewelry Item",
      quantity: order?.quantity || order?.qty || 1,
      price: order?.total_price || order?.price || 0,
      image_url: order?.image_url || location.state?.item?.image_url || location.state?.item?.img || null,
      size: order?.size || null,
      color: order?.color || null
    }];

  const orderItems = rawItems.map((item) => {
    const matchedProduct =
      (item.product_id ? (productsMap[String(item.product_id)] || productsMap[item.product_id]) : null) ||
      (item.productId ? (productsMap[String(item.productId)] || productsMap[item.productId]) : null) ||
      (item.product_name ? (productsMap[item.product_name] || productsMap[item.product_name.toLowerCase()?.trim()]) : null) ||
      (order?.item_name ? (productsMap[order.item_name] || productsMap[order.item_name.toLowerCase()?.trim()]) : null);

    const imageUrl =
      item.image_url ||
      item.img ||
      matchedProduct?.image_url ||
      (matchedProduct?.images && matchedProduct.images[0]) ||
      order?.image_url ||
      location.state?.item?.image_url ||
      location.state?.item?.img ||
      null;

    return {
      ...item,
      image_url: imageUrl,
      product_name: item.product_name || matchedProduct?.name || order?.item_name || "Jewelry Item",
      matchedProduct
    };
  });

  const orderDate = order?.order_date || order?.date
    ? new Date(order?.order_date || order?.date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
    : "Recently placed";

  const estimatedDate = order?.estimated_delivery_date || order?.estimatedDeliveryDate
    ? new Date(order?.estimated_delivery_date || order?.estimatedDeliveryDate).toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric"
    })
    : null;

  const deliveryCarrier = order?.delivery_provider || order?.deliveryProvider || "Delhivery Express";

  const paymentMethodStr = (
    order?.payment ||
    order?.payment_method ||
    order?.payment_type ||
    order?.payment_mode ||
    ""
  ).toString().toUpperCase();

  const isCod = paymentMethodStr === "COD" ||
    paymentMethodStr.includes("CASH") ||
    paymentMethodStr.includes("DELIVERY") ||
    (!order?.payment_id && !order?.razorpay_payment_id && paymentMethodStr !== "PAID" && paymentMethodStr !== "PREPAID" && paymentMethodStr !== "ONLINE");


  // Dynamic order timeline steps based strictly on database status (no static dummy statuses or tags)
  const getDynamicTimelineSteps = () => {
    const rawStatus = (order?.status || "Pending").trim();
    const s = rawStatus.toLowerCase();
    const d = (order?.delivery_status || order?.deliveryStatus || "").trim().toLowerCase();

    if (s === "refund completed") {
      return [
        {
          key: "placed",
          title: "Order Placed",
          desc: `Placed on ${orderDate}`,
          isDone: true,
          isCurrent: false,
          isCancelled: false,
        },
        {
          key: "cancelled",
          title: "Order Cancelled",
          desc: "This order was cancelled upon request.",
          isDone: true,
          isCurrent: false,
          isCancelled: false,
        },
        {
          key: "refund",
          title: "Refund Completed",
          desc: "Refund has been successfully processed and credited to your payment source.",
          isDone: true,
          isCurrent: true,
          isCancelled: false,
        }
      ];
    }

    if (s === "cancelled") {
      const steps = [
        {
          key: "placed",
          title: "Order Placed",
          desc: `Placed on ${orderDate}`,
          isDone: true,
          isCurrent: false,
          isCancelled: false,
        },
        {
          key: "cancelled",
          title: "Order Cancelled",
          desc: isCod
            ? "Order was cancelled. No payment was collected (Cash on Delivery)."
            : "This order has been cancelled upon request.",
          isDone: false,
          isCurrent: isCod,
          isCancelled: true,
        },
      ];

      // Prepaid cancelled orders show refund step; COD orders omit refund step completely
      if (!isCod) {
        steps.push({
          key: "refund",
          title: "Refund Processing",
          desc: "Refund initiated to original payment source (3-5 business days).",
          isDone: false,
          isCurrent: true,
          isCancelled: false,
        });
      }

      return steps;
    }

    // Active order progression: all 4 timeline steps are displayed
    const isPlacedDone = true; // Order has been placed

    const isConfirmedDone = [
      "confirmed", "processing", "packed", "shipped", "delivered", "returned"
    ].includes(s);

    const isShippedDone = [
      "shipped", "delivered", "returned"
    ].includes(s) || d.includes("shipped") || d.includes("transit") || d === "delivered";

    const isDeliveredDone = ["delivered", "returned"].includes(s) || d === "delivered";

    const steps = [
      {
        key: "placed",
        title: "Order Placed",
        desc: `Placed on ${orderDate}`,
        isDone: isPlacedDone,
      },
      {
        key: "confirmed",
        title: "Order Confirmed",
        desc: isConfirmedDone
          ? "Order confirmed & verified by seller"
          : "",
        isDone: isConfirmedDone,
      },
      {
        key: "shipped",
        title: "Shipped",
        desc: isShippedDone
          ? (deliveryCarrier ? `Shipped via ${deliveryCarrier}${order?.waybill ? ` (AWB: ${order.waybill})` : ""}` : "Dispatched with logistics partner")
          : "",
        isDone: isShippedDone,
      },
      {
        key: "delivered",
        title: "Delivered",
        desc: isDeliveredDone
          ? (s === "returned" ? "Package delivered to customer" : "Package delivered safely")
          : (estimatedDate ? `Expected delivery: ${estimatedDate}` : ""),
        isDone: isDeliveredDone,
      },
    ];

    if (s === "returned") {
      steps.push({
        key: "returned",
        title: "Returned",
        desc: "Package returned to seller",
        isDone: true,
      });
    }

    return steps;
  };

  const timelineSteps = getDynamicTimelineSteps();

  return (
    <>
      <Navbar />
      <div className="track-page-root">
        <div className="track-container">
          {/* Breadcrumb / Back button */}
          <div className="track-top-bar">
            <button className="track-back-btn" onClick={() => navigate("/profile/orders")}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>Back to My Orders</span>
            </button>
          </div>

          {loading ? (
            <div className="track-loading-card">
              <div className="track-spinner"></div>
              <p>Fetching latest tracking updates...</p>
            </div>
          ) : !order ? (
            <div className="track-not-found-card">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#C42049" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <h2>Order Not Found</h2>
              <p>We couldn't retrieve tracking information for this order.</p>
              <button className="track-primary-btn" onClick={() => navigate("/profile/orders")}>
                View All Orders
              </button>
            </div>
          ) : (
            <div className="track-content-grid">
              {/* LEFT / MAIN COLUMN */}
              <div className="track-main-col">
                {/* Header Card */}
                <div className="track-card track-header-card">
                  <div className="track-header-meta">
                    <div>
                      <span className="track-order-id-label">ORDER ID</span>
                      <h1 className="track-order-id-val">#{order.id?.slice(-8) || order.id}</h1>
                      <div className="track-order-date">Placed on {orderDate}</div>
                    </div>
                    <div className="track-header-status">
                      <span className={`track-status-pill track-status--${(order.status || "").toLowerCase()}`}>
                        {order.status || "Processing"}
                      </span>
                    </div>
                  </div>

                  {estimatedDate && !isCancelled && (
                    <div className="track-est-banner">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="1" y="3" width="15" height="13" rx="1" />
                        <path d="M16 8h4l3 5v3h-7V8z" />
                        <circle cx="5.5" cy="18.5" r="2.5" />
                        <circle cx="18.5" cy="18.5" r="2.5" />
                      </svg>
                      <div>
                        <span className="track-est-label">Estimated Delivery: </span>
                        <strong>{estimatedDate}</strong>
                      </div>
                    </div>
                  )}

                  {/* Shipment Tracking Info (only shown if waybill is present) */}
                  {order.waybill && (
                    <div
                      style={{
                        marginTop: "16px",
                        padding: "14px 18px",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "12px",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ fontSize: "13.5px", color: "#334155" }}>
                          <span style={{ color: "#64748b" }}>Courier: </span>
                          <strong>{order.courier_name || order.delivery_provider || "iCarry"}</strong>
                        </div>
                        <div style={{ fontSize: "13.5px", color: "#334155" }}>
                          <span style={{ color: "#64748b" }}>Waybill (AWB): </span>
                          <strong style={{ letterSpacing: "0.5px" }}>{order.waybill}</strong>
                        </div>
                        <div style={{ fontSize: "13.5px", color: "#334155" }}>
                          <span style={{ color: "#64748b" }}>Delivery Status: </span>
                          <strong style={{ color: "#0f766e" }}>{order.delivery_status || "Booked"}</strong>
                        </div>
                      </div>
                      {order.tracking_url && (
                        <a
                          href={order.tracking_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="track-primary-btn"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            textDecoration: "none",
                            padding: "9px 18px",
                            fontSize: "13px",
                            fontWeight: "600",
                          }}
                        >
                          <span>Track Package</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* Tracking Stepper / Timeline */}
                <div className="track-card track-stepper-card">
                  <h2 className="track-section-title">Delivery Progress</h2>

                  {isCancelled && (
                    <div
                      className="track-cancelled-box"
                      style={{
                        marginBottom: "20px",
                        borderColor: isRefundCompleted ? "#bbf7d0" : "#ffd2d2",
                        background: isRefundCompleted ? "#f0fdf4" : "#fff8f8"
                      }}
                    >
                      <div
                        className="track-cancelled-icon"
                        style={{
                          background: isRefundCompleted ? "#16a34a" : "#dc2626",
                          color: "#fff"
                        }}
                      >
                        {isRefundCompleted ? "✓" : "✕"}
                      </div>
                      <div>
                        <h3 style={{ color: isRefundCompleted ? "#166534" : "#991b1b" }}>
                          {isRefundCompleted ? "Refund Completed" : "Order Cancelled"}
                        </h3>
                        <p>
                          {isRefundCompleted
                            ? "Your refund has been successfully processed and returned to your original payment source."
                            : isCod
                              ? "This order was cancelled. Since this was a Cash on Delivery (COD) order, no payment was charged and no refund is required."
                              : "This order was cancelled. Any amount paid will be refunded to your original payment source within 3-5 business days."}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="track-timeline">
                    {timelineSteps.map((step, idx) => {
                      const isDone = step.isDone;
                      const isCancelledStep = step.isCancelled;
                      const nextStep = timelineSteps[idx + 1];
                      const isConnectorDone = isDone && nextStep?.isDone;

                      return (
                        <div
                          key={step.key}
                          className={`track-timeline-item ${isDone ? "is-done" : "is-pending"} ${isCancelledStep ? "is-cancelled-step" : ""}`}
                        >
                          <div className="track-node-col">
                            <div className="track-node">
                              {isCancelledStep ? (
                                <span>✕</span>
                              ) : isDone ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              ) : (
                                <span>{idx + 1}</span>
                              )}
                            </div>
                            {idx < timelineSteps.length - 1 && (
                              <div className={`track-connector ${isConnectorDone ? "is-done" : ""}`}></div>
                            )}
                          </div>
                          <div className="track-step-info">
                            <div className="track-step-title">{step.title}</div>
                            <div className="track-step-desc">{step.desc}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Products in this order */}
                <div className="track-card track-items-card">
                  <h2 className="track-section-title">Package Items ({orderItems.length})</h2>
                  <div className="track-items-list">
                    {orderItems.map((item, i) => {
                      const qty = Number(item.quantity || item.qty || 1);
                      const rawPrice = item.price;
                      let unitPrice = 0;
                      if (typeof rawPrice === "number") {
                        unitPrice = rawPrice;
                      } else if (typeof rawPrice === "string") {
                        unitPrice = parseFloat(rawPrice.replace(/[^0-9.]/g, "")) || 0;
                      }
                      const lineTotal = unitPrice * qty;

                      return (
                        <div key={i} className="track-product-row">
                          <div className="track-product-img">
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt={item.product_name}
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                  const placeholder = e.currentTarget.parentElement?.querySelector(".track-img-placeholder");
                                  if (placeholder) placeholder.style.display = "flex";
                                }}
                              />
                            ) : null}
                            <div
                              className="track-img-placeholder"
                              style={{ display: item.image_url ? "none" : "flex" }}
                            >
                              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C42049" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6 3h12l4 6-10 13L2 9z" />
                                <path d="M11 3 8 9l4 13 4-13-3-6" />
                                <path d="M2 9h20" />
                              </svg>
                            </div>
                          </div>
                          <div className="track-product-details">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                              <div className="track-product-name">{item.product_name}</div>
                              <div className="track-product-price">
                                {qty > 1
                                  ? `${qty} × ₹${unitPrice.toLocaleString("en-IN")}`
                                  : `₹${unitPrice.toLocaleString("en-IN")}`}
                              </div>
                            </div>
                            <div className="track-product-meta">
                              <span>Qty: {qty}</span>
                              {(item.size || item.color) && (
                                <span>
                                  {item.size && ` · Size: ${item.size}`}
                                  {item.color && ` · Color: ${item.color}`}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* RIGHT / SIDEBAR COLUMN */}
              <div className="track-side-col">
                {/* Delivery Address */}
                <div className="track-card">
                  <div className="track-card-head">
                    <span className="track-card-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                    </span>
                    <h3 className="track-card-title">Delivery Address</h3>
                  </div>
                  <div className="track-address-content">
                    {addressLoading ? (
                      <p className="track-addr-muted">Loading delivery address...</p>
                    ) : shippingAddr ? (
                      <>
                        <div className="track-addr-name">
                          <strong>{shippingAddr.full_name || shippingAddr.name || user?.name || "Recipient"}</strong>
                        </div>
                        <div className="track-addr-lines">
                          <div>{shippingAddr.address_line1 || shippingAddr.address || shippingAddr.line1}</div>
                          {shippingAddr.address_line2 && <div>{shippingAddr.address_line2}</div>}
                          <div>
                            {[shippingAddr.city, shippingAddr.state, shippingAddr.postal_code || shippingAddr.pincode]
                              .filter(Boolean)
                              .join(", ")}
                          </div>
                          {shippingAddr.country && <div>{shippingAddr.country}</div>}
                        </div>
                        {(shippingAddr.phone_number || shippingAddr.phone || user?.phone) && (
                          <div className="track-addr-phone" style={{ marginTop: "8px" }}>
                            <span>Phone: </span>
                            <strong>{shippingAddr.phone_number || shippingAddr.phone || user?.phone}</strong>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="track-addr-muted">No delivery address found for this order.</p>
                    )}
                  </div>
                </div>

                {/* Payment Summary */}
                <div className="track-card">
                  <div className="track-card-head">
                    <span className="track-card-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                        <line x1="1" y1="10" x2="23" y2="10" />
                      </svg>
                    </span>
                    <h3 className="track-card-title">Payment Summary</h3>
                  </div>
                  <div className="track-summary-rows">
                    <div className="track-sum-row">
                      <span>Payment Method</span>
                      <span style={{ fontWeight: "600", color: isCod ? "#856404" : "#1e824c" }}>
                        {isCod ? "Cash on Delivery (COD)" : "Paid Online"}
                      </span>
                    </div>
                    <div className="track-sum-row">
                      <span>Total Price</span>
                      <span>{order.price || `₹${parseFloat(order.total_price || 0).toLocaleString("en-IN")}`}</span>
                    </div>
                    <div className="track-sum-row">
                      <span>Shipping / Delivery</span>
                      <span className="track-free-text">₹70</span>
                    </div>
                    <div className="track-sum-divider"></div>
                    <div className="track-sum-row track-sum-total">
                      <span>Grand Total</span>
                      <span>{order.price || `₹${parseFloat(order.total_price || 0).toLocaleString("en-IN")}`}</span>
                    </div>
                  </div>
                </div>

                {/* Need Help Card */}
                <div className="track-card track-help-card">
                  <div className="track-card-head">
                    <span className="track-card-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                    </span>
                    <h3 className="track-card-title">Need Help?</h3>
                  </div>
                  <p className="track-help-text">
                    Have any questions regarding this delivery? Our customer support team is happy to help you.
                  </p>
                  <div className="track-help-actions">
                    <a
                      href={`https://wa.me/919363631636?text=Hi%20Anika,%20I%20need%20help%20with%20my%20Order%20%23${order.id?.slice(-8) || order.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="track-help-btn track-whatsapp-btn"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                      <span>WhatsApp Support</span>
                    </a>
                    <a href="tel:+919363631636" className="track-help-btn track-call-btn">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                      <span>Call +91 93636 31636</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}
