import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { orderService } from "../../services/orderService";
import { productService } from "../../services/productService";
import { icarryService } from "../../services/icarryService";
import { useStore } from "../../hooks/useStore";
import Toast from "../../components/Toast";
import ThermalInvoice from "../components/ThermalInvoice";
import "./Orderdetails.css";

const STATUS_CONFIG = {
  "Order Placed": { bg: "#e0f2fe", color: "#0369a1", dot: "#0284c7" },
  Delivered: { bg: "#dcfce7", color: "#16a34a", dot: "#22c55e" },
  Shipped: { bg: "#fef9c3", color: "#a16207", dot: "#eab308" },
  Pending: { bg: "#dbeafe", color: "#1d4ed8", dot: "#3b82f6" },
  Cancelled: { bg: "#fee2e2", color: "#dc2626", dot: "#ef4444" },
  Returned: { bg: "#fee2e2", color: "#dc2626", dot: "#ef4444" },
  Confirmed: { bg: "#f3e8ff", color: "#7c3aed", dot: "#8b5cf6" },
  "Refund Completed": { bg: "#ecfdf5", color: "#047857", dot: "#10b981" }
};

const StatusBadge = ({ status }) => {
  const normStatus = Object.keys(STATUS_CONFIG).find(
    k => k.toLowerCase() === (status || "").toLowerCase()
  );
  const cfg = STATUS_CONFIG[normStatus] || STATUS_CONFIG[status] || STATUS_CONFIG.Pending;
  return (
    <span className="od__status-badge" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
      <span className="od__status-dot" style={{ backgroundColor: cfg.dot }} />
      {status}
    </span>
  );
};

const OrderDetails = ({ order, onBack }) => {
  const [currentOrder, setCurrentOrder] = useState(order || null);
  const [adminNote, setAdminNote] = useState(order?.admin_notes || "");
  const [address, setAddress] = useState(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [toast, setToast] = useState({ message: "", type: "" });
  const [productsMap, setProductsMap] = useState({});
  const [invoicePrinted, setInvoicePrinted] = useState(order?.invoice_printed || false);
  const [printing, setPrinting] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [retryingBooking, setRetryingBooking] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState(false);
  const [cancellingShipment, setCancellingShipment] = useState(false);
  const invoiceRef = useRef(null);

  const setSelectedProduct = useStore(state => state.setSelectedProduct);
  const setSelectedAdminOrder = useStore(state => state.setSelectedAdminOrder);
  const navigate = useNavigate();

  useEffect(() => {
    if (order) {
      setCurrentOrder(order);
      if (order.admin_notes !== undefined) {
        setAdminNote(order.admin_notes || "");
      }
      if (order.invoice_printed !== undefined) {
        setInvoicePrinted(order.invoice_printed);
      }
    }
  }, [order]);

  // Realtime subscription for this order in admin
  useEffect(() => {
    const orderId = order?.id;
    if (!orderId) return;

    const channel = supabase
      .channel(`admin-order-detail-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderId}`
        },
        (payload) => {
          if (payload?.new) {
            setCurrentOrder((prev) => ({
              ...(prev || {}),
              ...payload.new
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [order?.id]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const data = await productService.getProducts();
        const map = {};
        if (data) {
          data.forEach(p => {
            map[p.name] = p;
          });
        }
        setProductsMap(map);
      } catch (err) {
        console.error("Error fetching products:", err);
      }
    };
    fetchProducts();
  }, []);

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

  const showToast = (message, type = "info") => {
    setToast({ message: "", type: "" });
    setTimeout(() => setToast({ message, type }), 10);
  };

  const o = currentOrder || order || {
    id: "ORD-UNKNOWN",
    customer: { name: "Unknown Customer", email: "N/A", phone: "N/A" },
    order_date: new Date().toISOString(),
    item_name: "N/A",
    quantity: 1,
    total_price: 0,
    status: "Order Placed",
    payment: "COD"
  };

  useEffect(() => {
    setAdminNote(o.admin_notes || "");
  }, [o.admin_notes]);

  useEffect(() => {
    if (o.user_id) {
      const fetchAddress = async () => {
        try {
          setAddressLoading(true);
          const data = await orderService.getAddresses(o.user_id);
          const defaultAddr = data.find(a => a.is_default) || data[0];
          setAddress(defaultAddr || null);
        } catch (err) {
          console.error("Error fetching shipping address:", err);
        } finally {
          setAddressLoading(false);
        }
      };
      fetchAddress();
    }
  }, [o.user_id]);

  const handleSaveNote = async () => {
    if (!o?.id) return;
    try {
      setSavingNote(true);
      await orderService.updateOrderNote(o.id, adminNote);
      showToast("Note saved successfully!", "success");
    } catch (err) {
      showToast("Failed to save note: " + err.message, "error");
    } finally {
      setSavingNote(false);
    }
  };

  const handlePrintInvoice = async () => {
    if (printing) return;
    try {
      setPrinting(true);
      await new Promise((res) => setTimeout(res, 250));
      window.print();
      // Mark as printed in Supabase
      await orderService.markInvoicePrinted(o.id);
      setInvoicePrinted(true);
      showToast("Invoice printed successfully!", "success");
    } catch (err) {
      showToast("Failed to mark invoice: " + err.message, "error");
    } finally {
      setTimeout(() => setPrinting(false), 1000);
    }
  };

  const fetchFreshOrder = async () => {
    if (!o?.id) return;
    try {
      const { data: refreshedOrder, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", o.id)
        .single();
      if (!error && refreshedOrder) {
        const { data: items } = await supabase
          .from("order_items")
          .select("*")
          .eq("order_id", o.id);
        const fullOrder = { ...refreshedOrder, order_items: items || [] };
        setCurrentOrder(fullOrder);
        if (setSelectedAdminOrder) setSelectedAdminOrder(fullOrder);
        return fullOrder;
      }
    } catch (err) {
      console.error("Error refetching order:", err);
    }
  };

  const handleRetryBooking = async () => {
    if (!o?.id) return;
    try {
      setRetryingBooking(true);
      const res = await icarryService.retryBooking(o.id);
      if (res && res.error) {
        showToast("Retry booking failed: " + res.error, "error");
      } else {
        showToast("Shipment booking retried successfully!", "success");
        await fetchFreshOrder();
      }
    } catch (err) {
      showToast("Failed to retry booking: " + err.message, "error");
    } finally {
      setRetryingBooking(false);
    }
  };

  const handlePrintLabel = async () => {
    if (!o?.id) return;
    // Open blank tab synchronously within user click event context to avoid browser popup blockers
    const win = window.open("", "_blank");
    try {
      setLoadingLabel(true);
      const res = await icarryService.label(o.id);
      const labelUrl =
        res?.shipment_label?.[0]?.url ||
        res?.shipment_label?.url ||
        res?.url;
      if (labelUrl) {
        if (win) {
          win.location.href = labelUrl;
        } else {
          window.location.href = labelUrl;
        }
      } else {
        if (win) win.close();
        showToast("No shipping label URL returned from carrier.", "warning");
      }
    } catch (err) {
      if (win) win.close();
      showToast("Failed to fetch shipping label: " + err.message, "error");
    } finally {
      setLoadingLabel(false);
    }
  };

  const handleCancelShipment = async () => {
    if (!o?.id) return;
    const confirmed = window.confirm(
      "Are you sure you want to cancel this shipment with iCarry?\n\nWarning: Cancelling this shipment after courier assignment or pickup may incur Return to Origin (RTO) charges from the courier. Are you sure you want to proceed?"
    );
    if (!confirmed) return;

    try {
      setCancellingShipment(true);
      const res = await icarryService.cancel(o.id);
      if (res && res.error) {
        showToast("Failed to cancel shipment: " + res.error, "error");
      } else {
        try {
          await supabase
            .from("orders")
            .update({ status: "Cancelled", delivery_status: "Cancelled" })
            .eq("id", o.id);
        } catch (dbErr) {
          console.warn("Could not update order status in DB:", dbErr);
        }
        showToast("Shipment and order cancelled successfully.", "success");
      }
    } catch (err) {
      showToast("Failed to cancel shipment: " + err.message, "error");
    } finally {
      // Refetch the order row on success/failure either way, so the panel always reflects true DB state
      await fetchFreshOrder();
      setCancellingShipment(false);
    }
  };

  const orderItems = (o.order_items && o.order_items.length > 0) ? o.order_items : [{
    product_name: o.item_name,
    quantity: o.quantity || 1,
    price: o.total_price || 0,
    size: null,
    color: null,
    image_url: null
  }];

  const uniqueProducts = orderItems.length;
  const totalCount = orderItems.reduce((sum, item) => sum + (item.quantity || 1), 0);

  // Dynamic order timeline based strictly on database status (only completed in green, real-time sync)
  const getTimelineSteps = () => {
    const rawStatus = (o?.status || "Pending").trim();
    const s = rawStatus.toLowerCase();
    const d = (o?.delivery_status || "").trim().toLowerCase();

    const orderPlacedDate = o.order_date
      ? new Date(o.order_date).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
      : "Recently placed";

    const isCod = (o.payment || "").toString().toUpperCase() !== "PAID" &&
      !o.payment_id &&
      !o.razorpay_payment_id;

    const isCancelled =
      s.includes("cancel") ||
      d.includes("cancel") ||
      d === "voided";

    if (s === "refund completed") {
      return [
        {
          label: "Order placed",
          date: orderPlacedDate,
          done: true,
          isCancelled: false
        },
        {
          label: "Order cancelled",
          date: "Order Cancelled",
          done: true,
          isCancelled: true
        },
        {
          label: "Refund completed",
          date: "Refund Processed to Source",
          done: true,
          isCancelled: false
        }
      ];
    }

    if (isCancelled) {
      const steps = [
        {
          label: "Order placed",
          date: orderPlacedDate,
          done: true,
          isCancelled: false
        },
        {
          label: "Order cancelled",
          date: "Order Cancelled",
          done: true,
          isCancelled: true
        }
      ];

      if (!isCod) {
        steps.push({
          label: "Refund",
          date: "3-5 business days",
          done: false,
          isCancelled: false
        });
      }

      return steps;
    }

    const isPlacedDone = true;
    const isConfirmedDone = [
      "confirmed", "processing", "packed", "shipped", "delivered", "returned"
    ].includes(s) || !!o.waybill || ["booked", "pending pickup", "shipped", "in transit", "out for delivery", "delivered"].some(x => d.includes(x));

    const isShippedDone = [
      "shipped", "delivered", "returned"
    ].includes(s) || ["shipped", "in transit", "out for delivery", "delivered"].some(x => d.includes(x));

    const isOutForDeliveryDone = d.includes("out for delivery") || d === "delivered" || s === "delivered";
    const isNdr = d.startsWith("ndr");
    const isDeliveredDone = ["delivered", "returned"].includes(s) || d === "delivered";

    const carrierInfo = o.courier_name || o.delivery_provider || "iCarry";

    const steps = [
      {
        label: "Order placed",
        date: orderPlacedDate,
        done: isPlacedDone,
        isCancelled: false
      },
      {
        label: "Order confirmed",
        date: isConfirmedDone
          ? (o.waybill ? `AWB: ${o.waybill}` : "Confirmed")
          : "Pending confirmation",
        done: isConfirmedDone,
        isCancelled: false
      },
      {
        label: "Shipped",
        date: isShippedDone
          ? `${carrierInfo}${o.waybill ? ` (${o.waybill})` : ""}`
          : (o.waybill || d === "booked" || d === "pending pickup"
            ? `Packed for ${carrierInfo}`
            : ""),
        done: isShippedDone,
        isCancelled: false
      },
      {
        label: "Out for delivery",
        date: isOutForDeliveryDone
          ? "Out for Delivery"
          : (isShippedDone ? `In transit with ${carrierInfo}` : ""),
        done: isOutForDeliveryDone,
        isCancelled: false
      }
    ];

    if (isNdr) {
      steps.push({
        label: "Delivery exception",
        date: o.delivery_status || "NDR",
        done: false,
        isWarning: true,
        isCancelled: false
      });
    }

    steps.push({
      label: "Delivered",
      date: isDeliveredDone
        ? (s === "returned" ? "Delivered to Customer" : "Delivered safely")
        : (o.estimated_delivery_date
          ? `Est: ${new Date(o.estimated_delivery_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
          : ""),
      done: isDeliveredDone,
      isCancelled: false
    });

    if (s === "returned" || d.includes("rto") || d === "returned") {
      steps.push({
        label: "Returned",
        date: "Returned to Origin",
        done: true,
        isCancelled: false
      });
    }

    return steps;
  };

  const isOrderCancelled =
    (o?.status || "").toLowerCase().includes("cancel") ||
    (o?.delivery_status || "").toLowerCase().includes("cancel") ||
    (o?.delivery_status || "").toLowerCase() === "voided";

  const isDelivered =
    (o?.status || "").toLowerCase() === "delivered" ||
    (o?.delivery_status || "").toLowerCase() === "delivered";

  const timelineSteps = getTimelineSteps();

  return (
    <div className="od">
      {/* Header */}
      <div className="od__header">
        <button className="od__back-btn" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Order Details
        </button>
        <div className="od__header-row">
          <h1 className="od__title">Order Details</h1>
          <StatusBadge status={isOrderCancelled ? "Cancelled" : o.status} />
        </div>
        <p className="od__date-placed">Placed on {o.order_date ? new Date(o.order_date).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "N/A"}</p>
      </div>

      {/* Top two-column: Customer + Shipping */}
      <div className="od__top-grid">
        {/* Customer Details */}
        <div className="od__card">
          <div className="od__card-title">Customer details</div>
          <div className="od__info-grid">
            <span className="od__info-label">Name</span>
            <span className="od__info-value">{o.customer?.name || "Unknown"}</span>
            <span className="od__info-label">Phone</span>
            <span className="od__info-value">{o.customer?.phone || "N/A"}</span>
            <span className="od__info-label">Email</span>
            <span className="od__info-value od__info-value--wrap">{o.customer?.email || "N/A"}</span>
            <span className="od__info-label">Joined</span>
            <span className="od__info-value">
              {o.customer?.created_at ? new Date(o.customer.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "N/A"}
            </span>
            <span className="od__info-label">Total products</span>
            <span className="od__info-value">{uniqueProducts} ({totalCount} {totalCount === 1 ? "item" : "items"})</span>
          </div>
        </div>

        {/* Shipping Address */}
        <div className="od__card">
          <div className="od__card-title">Shipping Address</div>
          {addressLoading ? (
            <div className="skeleton-shimmer" style={{ width: '100%', height: '80px', borderRadius: '6px' }} />
          ) : address ? (
            <>
              <div className="od__address-name" style={{ fontWeight: '600', marginBottom: '8px' }}>{address.full_name}</div>
              <div className="od__address-lines" style={{ color: '#555', fontSize: '13.5px', lineHeight: '1.5' }}>
                <div>{address.address_line1}</div>
                {address.address_line2 && <div>{address.address_line2}</div>}
                <div>{address.city}, {address.state} — {address.postal_code}</div>
                <div>{address.country}</div>
                <div style={{ marginTop: '8px', fontWeight: '500' }}>Phone: {address.phone_number}</div>
              </div>
            </>
          ) : (
            <div style={{ color: '#888', fontSize: '13.5px', fontStyle: 'italic' }}>No shipping address provided or found.</div>
          )}
        </div>
      </div>

      {/* Order Details */}
      <div className="od__card od__card--section">
        <div className="od__card-title">Order Details</div>
        <div className="od__items-list">
          {orderItems.map((item, idx) => {
            const product = productsMap[item.product_name];
            const image = item.image_url || product?.image_url || (product?.images && product.images[0]) || '/src/assets/cart/bangle1.webp';
            const isClickable = !!product;

            return (
              <div
                key={idx}
                className={`od__item-row ${isClickable ? 'od__item-row--clickable' : ''}`}
                onClick={() => isClickable && handleItemClick(item)}
              >
                <div className="od__item-img">
                  {image ? (
                    <img
                      src={image}
                      alt={item.product_name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }}
                    />
                  ) : (
                    "✨"
                  )}
                </div>
                <div className="od__item-info">
                  <div className="od__item-name" style={{ fontWeight: '500' }}>
                    {item.product_name}
                    {isClickable && (
                      <span className="od__view-link" style={{ fontSize: '11px', color: '#8b0030', marginLeft: '8px', fontWeight: 'normal' }}>
                        (View Product)
                      </span>
                    )}
                  </div>
                  <div className="od__item-sku" style={{ color: '#888', fontSize: '12.5px', marginTop: '4px' }}>
                    Order Ref: #{o.id?.slice(-8) || o.id} &nbsp;·&nbsp; Qty: {item.quantity || 1}
                    {(item.size || item.color) && ` · Size: ${item.size || 'N/A'} · Color: ${item.color || 'N/A'}`}
                  </div>
                </div>
                <div className="od__item-price" style={{ fontWeight: '600' }}>
                  ₹{Number(item.price || 0).toLocaleString('en-IN')}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment + Update Status */}
      <div className="od__mid-grid">
        {/* Payment Details */}
        <div className="od__card">
          <div className="od__card-title">Payment Details</div>
          <div className="od__info-grid">
            <span className="od__info-label">Method</span>
            <span className="od__info-value">{o.payment}</span>
            <span className="od__info-label">Total Amount</span>
            <span className="od__info-value" style={{ fontWeight: '600' }}>₹{Number(o.total_price || 0).toLocaleString('en-IN')}</span>
          </div>
        </div>

        {/* Logistics & Delivery */}
        <div className="od__card">
          <div className="od__card-title">Logistics & Delivery</div>
          <div className="od__info-grid">
            <span className="od__info-label">Carrier</span>
            <span className="od__info-value">{o.courier_name || o.delivery_provider || "iCarry"}</span>
            <span className="od__info-label">Status</span>
            <span
              className="od__info-value"
              style={{
                fontWeight: '600',
                color:
                  o.delivery_status === 'Booked' || o.delivery_status === 'Delivered'
                    ? '#16a34a'
                    : o.delivery_status === 'Booking Failed' || o.delivery_status === 'Cancelled'
                      ? '#dc2626'
                      : o.delivery_status?.toUpperCase()?.startsWith('NDR')
                        ? '#ea580c'
                        : '#d97706'
              }}
            >
              {o.delivery_status || "Pending Booking"}
            </span>
            {o.waybill && (
              <>
                <span className="od__info-label">AWB / Waybill</span>
                <span className="od__info-value">
                  {o.tracking_url ? (
                    <a
                      href={o.tracking_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#8b0030', textDecoration: 'underline', fontWeight: '600' }}
                    >
                      {o.waybill} ↗
                    </a>
                  ) : (
                    <span>{o.waybill}</span>
                  )}
                </span>
              </>
            )}
            {o.tracking_url && (
              <>
                <span className="od__info-label">Tracking</span>
                <span className="od__info-value">
                  <a
                    href={o.tracking_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#C42049', textDecoration: 'none', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    Track Package ↗
                  </a>
                </span>
              </>
            )}
            {o.shipment_id && (
              <>
                <span className="od__info-label">Shipment ID</span>
                <span className="od__info-value">{o.shipment_id}</span>
              </>
            )}
            {(o.delivery_status === 'Booking Failed' || o.shipment_error) && (
              <>
                <span className="od__info-label" style={{ color: '#dc2626', fontWeight: '600' }}>Shipment Error</span>
                <span className="od__info-value" style={{ color: '#dc2626', wordBreak: 'break-word', fontSize: '12.5px', background: '#fef2f2', padding: '6px 10px', borderRadius: '4px', border: '1px solid #fecaca' }}>
                  {o.shipment_error || "Carrier booking failed. Please check address details and retry booking."}
                </span>
              </>
            )}
            {o.estimated_delivery_date && (
              <>
                <span className="od__info-label">Est. Delivery</span>
                <span className="od__info-value">
                  {new Date(o.estimated_delivery_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </>
            )}
          </div>

          {o.delivery_status?.toUpperCase()?.startsWith('NDR') && (
            <div style={{ marginTop: '12px', padding: '9px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', color: '#92400e', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚠️</span>
              <span><strong>Delivery Exception (NDR):</strong> The carrier reported: <em>{o.delivery_status}</em>. Please review or coordinate with the customer.</span>
            </div>
          )}

          {o.delivery_status === 'Cancelled' && (
            <div style={{ marginTop: '12px', padding: '9px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#b91c1c', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>✕</span>
              <span><strong>Shipment Cancelled:</strong> The shipping order has been cancelled with the carrier.</span>
            </div>
          )}

          {/* Shipment Actions */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
            {o.delivery_status === 'Booking Failed' && (
              <button
                onClick={handleRetryBooking}
                disabled={retryingBooking}
                style={{
                  backgroundColor: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '7px 14px',
                  fontSize: '12.5px',
                  fontWeight: '600',
                  cursor: retryingBooking ? 'not-allowed' : 'pointer'
                }}
              >
                {retryingBooking ? 'Retrying Booking...' : '🔄 Retry Booking'}
              </button>
            )}

            {o.waybill && o.delivery_status !== 'Cancelled' && (
              <>
                <button
                  onClick={handlePrintLabel}
                  disabled={loadingLabel}
                  style={{
                    backgroundColor: '#fff',
                    color: '#1c1c1e',
                    border: '1px solid #d4d4d8',
                    borderRadius: '6px',
                    padding: '7px 14px',
                    fontSize: '12.5px',
                    fontWeight: '600',
                    cursor: loadingLabel ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  {loadingLabel ? 'Loading Label...' : '🏷️ Print Label'}
                </button>

                {!isDelivered && !isOrderCancelled && (
                  <button
                    onClick={handleCancelShipment}
                    disabled={cancellingShipment}
                    style={{
                      backgroundColor: '#fff',
                      color: '#dc2626',
                      border: '1px solid #fca5a5',
                      borderRadius: '6px',
                      padding: '7px 14px',
                      fontSize: '12.5px',
                      fontWeight: '600',
                      cursor: cancellingShipment ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {cancellingShipment ? 'Cancelling...' : 'Cancel Shipment'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Order Timeline */}
      <div className="od__card od__card--section">
        <div className="od__card-title">Order Timeline</div>
        <div className="od__timeline">
          {timelineSteps.map((step, i) => {
            const isDone = step.done;
            const isCancelled = step.isCancelled;
            const isWarning = step.isWarning;
            const nextStep = timelineSteps[i + 1];
            const isConnectorDone = isDone && nextStep?.done && !nextStep?.isCancelled;
            const isConnectorCancelled = isDone && nextStep?.isCancelled;

            return (
              <div key={i} className={`od__tl-step ${isCancelled ? "od__tl-step--cancelled" : ""}`}>
                {i < timelineSteps.length - 1 && (
                  <div
                    className={`od__tl-line ${isConnectorDone ? "od__tl-line--done" : ""} ${isConnectorCancelled ? "od__tl-line--cancelled" : ""}`}
                  />
                )}
                <div
                  className={`od__tl-circle ${isCancelled ? "od__tl-circle--cancelled" : isDone ? "od__tl-circle--done" : ""} ${isWarning ? "od__tl-circle--warning" : ""}`}
                >
                  {isCancelled ? (
                    <span style={{ fontSize: "14px", fontWeight: "900", color: "#ffffff" }}>✕</span>
                  ) : isWarning ? (
                    <span style={{ fontSize: "14px" }}>⚠️</span>
                  ) : isDone ? (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="od__tl-num">{String(i + 1).padStart(2, "0")}</span>
                  )}
                </div>
                <div
                  className="od__tl-label"
                  style={{
                    color: isCancelled ? "#dc2626" : isWarning ? "#b45309" : undefined,
                    fontWeight: isCancelled ? "700" : undefined
                  }}
                >
                  {step.label}
                </div>
                <div
                  className="od__tl-date"
                  style={{
                    color: isCancelled ? "#ef4444" : isWarning ? "#b45309" : undefined,
                    fontWeight: isCancelled ? "600" : undefined
                  }}
                >
                  {step.date}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Admin Notes */}
      <div className="od__card od__card--section">
        <div className="od__card-title">Admin Notes</div>
        <textarea
          className="od__admin-notes"
          placeholder="Add a private note about this order (not visible to customer)..."
          value={adminNote}
          onChange={e => setAdminNote(e.target.value)}
          rows={5}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
          <button
            onClick={handleSaveNote}
            disabled={savingNote}
            style={{
              backgroundColor: '#1c1c1e',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 18px',
              cursor: savingNote ? 'not-allowed' : 'pointer',
              fontWeight: '500',
              fontSize: '13px',
              opacity: savingNote ? 0.7 : 1,
              transition: 'opacity 0.2s'
            }}
          >
            {savingNote ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="od__footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
        <button className="od__cancel-btn" onClick={onBack} style={{ background: '#f5f5f7', border: '1px solid #e5e5e5', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer' }}>Close</button>
        <button
          onClick={() => setShowInvoiceModal(true)}
          style={{
            backgroundColor: '#fff',
            color: '#1c1c1e',
            border: '1px solid #d4d4d8',
            borderRadius: '8px',
            padding: '10px 18px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>👁️</span> Preview Invoice
        </button>
        <button
          onClick={handlePrintInvoice}
          disabled={printing}
          style={{
            backgroundColor: invoicePrinted ? '#f4f4f5' : '#1c1c1e',
            color: invoicePrinted ? '#18181b' : '#fff',
            border: invoicePrinted ? '1px solid #d4d4d8' : 'none',
            borderRadius: '8px',
            padding: '10px 20px',
            cursor: printing ? 'not-allowed' : 'pointer',
            fontWeight: '600',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            opacity: printing ? 0.7 : 1,
            transition: 'all 0.2s'
          }}
        >
          {printing ? (
            <><span>⏳</span> Printing...</>
          ) : invoicePrinted ? (
            <><span>🖨️</span> Print Again (Printed ✓)</>
          ) : (
            <><span>🖨️</span> Print Invoice</>
          )}
        </button>
      </div>

      {/* Invoice Preview Modal */}
      {showInvoiceModal && (
        <div className="inv__modal-overlay" onClick={() => setShowInvoiceModal(false)}>
          <div className="inv__modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="inv__modal-header">
              <div>
                <h3 className="inv__modal-title">Invoice Preview</h3>
                <p className="inv__modal-subtitle">
                  Order #{String(o.id).slice(-8).toUpperCase()}
                </p>
              </div>
              <button
                className="inv__modal-close"
                onClick={() => setShowInvoiceModal(false)}
                aria-label="Close invoice preview"
              >
                ✕
              </button>
            </div>

            <div className="inv__modal-body">
              <ThermalInvoice order={o} address={address} isPreview={true} />
            </div>

            <div className="inv__modal-footer">
              <button
                className="inv__modal-close-btn"
                onClick={() => setShowInvoiceModal(false)}
              >
                Close
              </button>
              <button
                className="inv__modal-print-btn"
                onClick={() => {
                  handlePrintInvoice();
                }}
                disabled={printing}
              >
                {printing ? (
                  <>
                    <span className="inv__spin">⏳</span> Printing...
                  </>
                ) : (
                  <>
                    <span>🖨️</span> {invoicePrinted ? "Print Again" : "Print Invoice"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thermal Invoice container for print */}
      <div className="thermal-print-area">
        <ThermalInvoice ref={invoiceRef} order={o} address={address} />
      </div>
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: "", type: "" })}
      />
    </div>
  );
};

export default OrderDetails;