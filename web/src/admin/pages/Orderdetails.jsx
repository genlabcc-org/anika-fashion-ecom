import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { orderService } from "../../services/orderService";

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

  const [invoicePrinted, setInvoicePrinted] = useState(order?.invoice_printed || false);
  const [printing, setPrinting] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [retryingBooking, setRetryingBooking] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState(false);
  const [cancellingShipment, setCancellingShipment] = useState(false);
  const [togglingRead, setTogglingRead] = useState(false);
  const [togglingPacked, setTogglingPacked] = useState(false);
  const [syncingTracking, setSyncingTracking] = useState(false);
  const [showCourierModal, setShowCourierModal] = useState(false);
  const [updatingCourier, setUpdatingCourier] = useState(false);
  const [courierForm, setCourierForm] = useState({
    courier_name: "ST Courier",
    waybill: "",
    status: "Shipped",
    tracking_url: "https://stcourier.com",
  });
  const invoiceRef = useRef(null);
  const autoMarkedOrderIdRef = useRef(null);

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

  const setSelectedProduct = useStore(state => state.setSelectedProduct);
  const setSelectedAdminOrder = useStore(state => state.setSelectedAdminOrder);
  const markOrdersRead = useStore(state => state.markOrdersRead);
  const fetchNewOrdersCount = useStore(state => state.fetchNewOrdersCount);
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

  // Auto-mark order as read ONLY when opened from the list (guarded with sessionStorage).
  // Must NOT re-fire when the details page is refreshed (selectedAdminOrder restored from localStorage).
  useEffect(() => {
    const orderId = order?.id;
    if (!orderId) return;

    let openedFromList = false;
    try {
      openedFromList = sessionStorage.getItem(`anika_opened_from_list_${orderId}`) === "true";
      if (openedFromList) {
        // Immediately remove flag so any page refresh will not re-trigger auto-mark
        sessionStorage.removeItem(`anika_opened_from_list_${orderId}`);
      }
    } catch (_) { }

    if (openedFromList && autoMarkedOrderIdRef.current !== orderId) {
      autoMarkedOrderIdRef.current = orderId;
      if (order.admin_read === false) {
        setCurrentOrder((prev) => (prev ? { ...prev, admin_read: true } : prev));
        if (typeof markOrdersRead === "function") {
          markOrdersRead([orderId], true).catch((err) => {
            console.error("Auto mark read failed:", err);
            showToast("Failed to mark order as read: " + (err?.message || "Unknown error"), "error");
          });
        } else {
          orderService.setOrdersRead([orderId], true).catch((err) => {
            console.error("Auto mark read failed:", err);
            showToast("Failed to mark order as read: " + (err?.message || "Unknown error"), "error");
          });
        }
      }
    }
  }, [order?.id, order?.admin_read, markOrdersRead]);

  const handleToggleRead = async () => {
    if (!o?.id || togglingRead) return;
    const currentRead = Boolean(o.admin_read);
    const nextRead = !currentRead;
    setTogglingRead(true);

    // Ensure session flag is cleared so refresh never re-marks if marked unread
    try {
      sessionStorage.removeItem(`anika_opened_from_list_${o.id}`);
    } catch (_) { }

    try {
      setCurrentOrder((prev) => (prev ? { ...prev, admin_read: nextRead } : prev));
      if (typeof markOrdersRead === "function") {
        await markOrdersRead([o.id], nextRead);
      } else {
        await orderService.setOrdersRead([o.id], nextRead);
      }
      if (typeof fetchNewOrdersCount === "function") fetchNewOrdersCount();
      showToast(nextRead ? "Order marked as read" : "Order marked as unread", "success");
    } catch (err) {
      console.error("Toggle read failed:", err);
      setCurrentOrder((prev) => (prev ? { ...prev, admin_read: currentRead } : prev));
      showToast("Failed to update read status: " + (err?.message || "Unknown error"), "error");
    } finally {
      setTogglingRead(false);
    }
  };

  const formatPackedAt = (dateStr) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      const day = d.getDate();
      const month = d.toLocaleString("en-GB", { month: "short" });
      let hours = d.getHours();
      const minutes = d.getMinutes().toString().padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12;
      hours = hours ? hours : 12;
      return `Packed on ${day} ${month}, ${hours}:${minutes} ${ampm}`;
    } catch (_) {
      return "";
    }
  };

  const handleTogglePacked = async () => {
    if (!o?.id || togglingPacked) return;
    const currentPacked = Boolean(o.is_packed);
    const nextPacked = !currentPacked;
    const currentPackedAt = o.packed_at;

    // If order is already Shipped and unpacking, confirm first
    const isShipped = (o.status || "").toLowerCase() === "shipped" || (o.delivery_status || "").toLowerCase().includes("shipped");
    if (isShipped && currentPacked) {
      const confirmed = window.confirm("This order is already marked as Shipped. Are you sure you want to unpack it?");
      if (!confirmed) return;
    }

    setTogglingPacked(true);
    const nextPackedAt = nextPacked ? new Date().toISOString() : null;

    try {
      setCurrentOrder((prev) => (prev ? { ...prev, is_packed: nextPacked, packed_at: nextPackedAt } : prev));
      await orderService.setOrderPacked(o.id, nextPacked);
      showToast(nextPacked ? "Order marked as packed" : "Order marked as unpacked", "success");
    } catch (err) {
      console.error("Toggle packed failed:", err);
      setCurrentOrder((prev) => (prev ? { ...prev, is_packed: currentPacked, packed_at: currentPackedAt } : prev));
      showToast("Failed to update packed status: " + (err?.message || "Unknown error"), "error");
    } finally {
      setTogglingPacked(false);
    }
  };

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



  const handleItemClick = async (item) => {
    if (!item.product_id) return;
    const { data: product, error } = await supabase
      .from("products")
      .select("product_id, name, description, price, compare_price, image_url, images, sizes, stock, sku, categories(name)")
      .eq("product_id", item.product_id)
      .single();
    if (error || !product) return;

    setSelectedProduct({
      ...product,
      id: product.product_id,
      productId: product.product_id,
      img: product.image_url || product.images?.[0] || "/src/assets/cart/bangle1.webp",
      desc: product.description,
      originalPrice: product.compare_price || Math.round(product.price * 1.3),
      sizes: product.sizes || [],
      stock: product.stock > 0 ? "in-stock" : "out-of-stock",
      category: product.categories?.name || "Bangles",
    });
    navigate("/product");
  };

  const showToast = (message, type = "info") => {
    setToast({ message: "", type: "" });
    setTimeout(() => setToast({ message, type }), 10);
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

  const handleSyncTracking = async () => {
    if (!o?.id) return;
    const isExternalCourier = /st courier|manual|dtdc|local|porter/i.test(o?.courier_name || "");
    if (isExternalCourier) {
      showToast(`Order fulfilled via ${o.courier_name || "external courier"}. Live tracking is managed externally.`, "info");
      return;
    }
    try {
      setSyncingTracking(true);
      const res = await icarryService.track(o.id);
      if (res && res.error) {
        showToast("Tracking sync failed: " + res.error, "error");
      } else {
        const fresh = await fetchFreshOrder();
        const displayStatus = fresh?.delivery_status || res?.delivery_status || res?.status || "Updated";
        showToast(`Live status synced: ${displayStatus}`, "success");
      }
    } catch (err) {
      showToast("Failed to sync tracking: " + (err.message || err), "error");
    } finally {
      setSyncingTracking(false);
    }
  };

  // Auto-sync live shipment tracking from iCarry in the background on load
  useEffect(() => {
    if (!o?.id || (!o?.waybill && !o?.shipment_id)) return;
    const isExternalCourier = /st courier|manual|dtdc|local|porter/i.test(o?.courier_name || "");
    if (isExternalCourier) return;

    const s = (o.status || "").toLowerCase();
    const d = (o.delivery_status || "").toLowerCase();
    const isTerminal =
      ["delivered", "cancelled", "canceled", "refund completed"].some((t) => s.includes(t)) &&
      ["delivered", "cancelled", "canceled"].some((t) => d.includes(t));
    if (isTerminal) return;

    icarryService
      .track(o.id)
      .then((res) => {
        if (res?.updates && Object.keys(res.updates).length > 0) {
          fetchFreshOrder();
        }
      })
      .catch((err) => {
        console.warn("[Orderdetails] Background tracking sync error:", err);
      });
  }, [o?.id, o?.waybill, o?.shipment_id, o?.courier_name]);

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

  const [showCancelModal, setShowCancelModal] = useState(false);

  const handleCancelAction = async (cancelType) => {
    if (!o?.id || cancellingShipment) return;

    if (cancelType === "whole_order") {
      const confirmed = window.confirm(
        "Are you sure you want to cancel the entire order?\n\nThis will mark the order as Cancelled in the database.\n\nNote: This will NOT automatically refund the customer or restore inventory. Any refund must be processed manually in Razorpay, and product stock must be adjusted manually."
      );
      if (!confirmed) return;
    }

    try {
      setCancellingShipment(true);
      const res = await icarryService.cancel(o.id, { cancelType });
      if (res && res.error) {
        showToast("Carrier cancellation note: " + res.error, "info");
      }

      if (cancelType === "shipment_only") {
        showToast("Carrier pickup cancelled. Order preserved for rebooking or manual shipping.", "success");
      } else {
        showToast("Entire order and shipment cancelled.", "success");
      }
      setShowCancelModal(false);
    } catch (err) {
      showToast("Cancellation failed: " + err.message, "error");
    } finally {
      await fetchFreshOrder();
      setCancellingShipment(false);
    }
  };

  const handleSaveCourierDetails = async (e) => {
    if (e) e.preventDefault();
    if (!o?.id || updatingCourier) return;

    const courierName = (courierForm.courier_name || "").trim();
    if (!courierName) {
      showToast("Courier name is required.", "error");
      return;
    }

    const awb = courierForm.waybill.trim();
    const statusVal = courierForm.status || "Shipped";

    if (statusVal === "Delivered" && !awb) {
      showToast("AWB / Docket number is required when marking an order as Delivered.", "error");
      return;
    }

    // Confirmation dialog if marking Delivered
    if (statusVal === "Delivered" && o.status !== "Delivered" && o.delivery_status !== "Delivered") {
      const confirmDelivered = window.confirm(
        "Are you sure you want to mark this order as Delivered?\n\nThis will complete the order fulfillment and record delivery."
      );
      if (!confirmDelivered) return;
    }

    // Confirmation dialog if reverting a mistaken Delivered back to Shipped
    const isCurrentlyDelivered = (o.status === "Delivered" || o.delivery_status === "Delivered");
    if (isCurrentlyDelivered && statusVal !== "Delivered") {
      const confirmRevert = window.confirm(
        `This order is currently marked as Delivered.\n\nAre you sure you want to change its status back to ${statusVal}?`
      );
      if (!confirmRevert) return;
    }

    setUpdatingCourier(true);
    try {
      // Auto-construct tracking URL if not provided
      let trackingUrl = courierForm.tracking_url.trim();
      if (!trackingUrl) {
        const lowerCourier = courierName.toLowerCase();
        if (lowerCourier.includes("st")) {
          trackingUrl = "https://stcourier.com";
        } else if (lowerCourier.includes("professional")) {
          trackingUrl = "https://www.tpcindia.com";
        } else if (lowerCourier.includes("dtdc")) {
          trackingUrl = "https://www.dtdc.in";
        }
      }

      const updates = {
        fulfillment_type: "manual",
        manual_courier_name: courierName,
        manual_awb: awb || null,
        manual_tracking_url: trackingUrl || null,
        courier_name: courierName,
        waybill: awb || null,
        tracking_url: trackingUrl || null,
        status: statusVal,
        delivery_status: statusVal,
        shipped_at: o.shipped_at || new Date().toISOString(),
        delivered_at: statusVal === "Delivered" ? (o.delivered_at || new Date().toISOString()) : null,
      };

      const res = await icarryService.updateCourierStatus(o.id, updates);
      if (res && res.error) throw new Error(res.error);

      setCurrentOrder((prev) => (prev ? { ...prev, ...updates } : prev));
      setShowCourierModal(false);
      showToast(`Order updated to manual fulfillment (${courierName}) and marked as ${statusVal}!`, "success");
      await fetchFreshOrder();
    } catch (err) {
      console.error("Failed to update courier details:", err);
      showToast("Failed to update courier: " + (err.message || err), "error");
    } finally {
      setUpdatingCourier(false);
    }
  };

  const orderItems = (o.order_items && o.order_items.length > 0) ? o.order_items : [{
    product_name: o.item_name,
    quantity: o.quantity || 1,
    price: o.total_price || 0,
    size: null,
    color: null,
    image_url: null,
    sku: o.sku || null
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

    const isShippedOrDelivered = ["shipped", "delivered"].includes(s) || ["shipped", "delivered"].includes(d);
    const isCancelled =
      !isShippedOrDelivered &&
      (((s.includes("cancel") && !s.includes("pickup cancel")) || (d.includes("cancel") && !d.includes("pickup cancel")) || d === "voided"));

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
      "confirmed", "processing", "packed", "shipped", "delivered", "returned", "rto"
    ].includes(s) || !!o.waybill || [
      "booked", "pending pickup", "pickup scheduled", "manifested", "picked up", "shipped", "in transit", "out for delivery", "delivered", "rto", "returned"
    ].some(x => d.includes(x));

    const isShippedDone = [
      "shipped", "delivered", "returned", "rto"
    ].includes(s) || [
      "picked up", "shipped", "in transit", "out for delivery", "delivered", "rto", "returned"
    ].some(x => d.includes(x));

    const isOutForDeliveryDone = d.includes("out for delivery") || d.includes("delivered") || s === "delivered";
    const isNdr = d.startsWith("ndr");
    const isDeliveredDone = ["delivered", "returned", "rto"].includes(s) || d.includes("delivered") || d.includes("returned") || d.includes("rto");

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
          : (o.is_packed
            ? `Packed for ${carrierInfo}`
            : "Awaiting packing"),
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

  const isShippedOrDelivered =
    ["shipped", "delivered"].includes((o?.status || "").toLowerCase()) ||
    ["shipped", "delivered"].includes((o?.delivery_status || "").toLowerCase());

  const isOrderCancelled =
    !isShippedOrDelivered &&
    (((o?.status || "").toLowerCase().includes("cancel") && !(o?.status || "").toLowerCase().includes("pickup cancel")) ||
      ((o?.delivery_status || "").toLowerCase().includes("cancel") && !(o?.delivery_status || "").toLowerCase().includes("pickup cancel")) ||
      (o?.delivery_status || "").toLowerCase() === "voided");

  const isDelivered =
    (o?.status || "").toLowerCase() === "delivered" ||
    (o?.delivery_status || "").toLowerCase() === "delivered";

  const isCancelledOrDelivered = isOrderCancelled || isDelivered;

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
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <h1 className="od__title">Order Details</h1>
            <StatusBadge status={isOrderCancelled ? "Cancelled" : o.status} />
          </div>
          <div className="od__header-actions">
            <div className="od__pack-action-group">
              <button
                type="button"
                className={`od__pack-toggle-btn${o.is_packed ? " od__pack-toggle-btn--packed" : " od__pack-toggle-btn--unpacked"}`}
                onClick={handleTogglePacked}
                disabled={togglingPacked || isCancelledOrDelivered}
                title={isCancelledOrDelivered ? `Cannot change packing status for ${isOrderCancelled ? 'cancelled' : 'delivered'} orders` : (o.is_packed ? "Click to unpack" : "Mark order as packed")}
              >
                {o.is_packed ? (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>{isCancelledOrDelivered ? "Packed ✓" : "Packed ✓ · Unpack"}</span>
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                      <line x1="12" y1="22.08" x2="12" y2="12" />
                    </svg>
                    <span>{isCancelledOrDelivered ? "Not packed" : "Mark as Packed"}</span>
                  </>
                )}
              </button>
              {o.is_packed && o.packed_at && (
                <span className="od__pack-caption">{formatPackedAt(o.packed_at)}</span>
              )}
            </div>

            <button
              type="button"
              className={`od__read-toggle-btn${o.admin_read ? " od__read-toggle-btn--read" : " od__read-toggle-btn--unread"}`}
              onClick={handleToggleRead}
              disabled={togglingRead}
              title={o.admin_read ? "Mark order as unread" : "Mark order as read"}
            >
              {o.admin_read ? (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <span>Mark as unread</span>
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6z" />
                    <path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10" />
                  </svg>
                  <span>Mark as read</span>
                </>
              )}
            </button>
          </div>
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
            const image = item.image_url || '/src/assets/cart/bangle1.webp';
            const isClickable = !!item.product_id;
            const resolvedSku =
              item.sku && item.sku !== 'N/A' && item.sku !== 'undefined' ? item.sku : null;

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
                  <div className="od__item-name" style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span>{item.product_name}</span>
                    {resolvedSku ? (
                      <span
                        className="od__item-sku-tag"
                        style={{
                          fontSize: '11px',
                          fontWeight: '600',
                          color: '#475569',
                          backgroundColor: '#f1f5f9',
                          padding: '1px 7px',
                          borderRadius: '4px',
                          border: '1px solid #e2e8f0',
                          letterSpacing: '0.3px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          lineHeight: '1.4',
                          flexShrink: 0
                        }}
                      >
                        SKU: {resolvedSku}
                      </span>
                    ) : (
                      <span
                        className="od__item-sku-tag"
                        style={{
                          fontSize: '11px',
                          fontWeight: '500',
                          color: '#94a3b8',
                          backgroundColor: '#f8fafc',
                          padding: '1px 7px',
                          borderRadius: '4px',
                          border: '1px solid #e2e8f0',
                          letterSpacing: '0.3px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          lineHeight: '1.4',
                          flexShrink: 0
                        }}
                      >
                        SKU: N/A
                      </span>
                    )}
                    {isClickable && (
                      <span className="od__view-link" style={{ fontSize: '11px', color: '#8b0030', fontWeight: 'normal', flexShrink: 0 }}>
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
            {o.fulfillment_type === 'manual' && (
              <>
                <span className="od__info-label">Fulfillment</span>
                <span className="od__info-value">
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11.5px', fontWeight: '600', background: '#e0e7ff', color: '#3730a3' }}>
                    📦 Manual Courier
                  </span>
                </span>
              </>
            )}
            <span className="od__info-label">Carrier</span>
            <span className="od__info-value">{o.manual_courier_name || o.courier_name || o.delivery_provider || "iCarry"}</span>
            <span className="od__info-label">Parcel</span>
            <span className="od__info-value">
              <span className={`od__pack-chip ${o.is_packed ? "od__pack-chip--packed" : "od__pack-chip--unpacked"}`}>
                {o.is_packed ? "Packed ✓" : "Not packed"}
              </span>
            </span>
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
                      : o.delivery_status === 'Pickup Cancelled'
                        ? '#d97706'
                        : o.delivery_status?.toUpperCase()?.startsWith('NDR')
                          ? '#ea580c'
                          : '#d97706'
              }}
            >
              {o.delivery_status || "Pending Booking"}
            </span>
            {(o.manual_awb || o.waybill) && (
              <>
                <span className="od__info-label">AWB / Waybill</span>
                <span className="od__info-value">
                  {(o.manual_tracking_url || o.tracking_url) ? (
                    <a
                      href={o.manual_tracking_url || o.tracking_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#8b0030', textDecoration: 'underline', fontWeight: '600' }}
                    >
                      {o.manual_awb || o.waybill} ↗
                    </a>
                  ) : (
                    <span>{o.manual_awb || o.waybill}</span>
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
            {o.fulfillment_type !== 'manual' && (o.waybill || o.shipment_id) && (
              <>
                <span className="od__info-label">Live Sync</span>
                <span className="od__info-value">
                  <button
                    type="button"
                    onClick={handleSyncTracking}
                    disabled={syncingTracking}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '5px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#f8fafc',
                      color: '#0f172a',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: syncingTracking ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    {syncingTracking ? (
                      <>
                        <span className="od__spinner" style={{ width: '12px', height: '12px' }} />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="23 4 23 10 17 10" />
                          <polyline points="1 20 1 14 7 14" />
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                        Sync Status from iCarry
                      </>
                    )}
                  </button>
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

          {o.delivery_status === 'Pickup Cancelled' && (
            <div style={{ marginTop: '12px', padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', color: '#92400e', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚠️</span>
              <span><strong>Courier Pickup Cancelled:</strong> The carrier pickup was cancelled. You can retry booking with iCarry or fulfill manually with an external courier.</span>
            </div>
          )}

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
            {(o.delivery_status === 'Booking Failed' || o.delivery_status === 'Pickup Cancelled') && (
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

            {o.waybill && o.delivery_status !== 'Cancelled' && o.fulfillment_type !== 'manual' && (
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
                    onClick={() => setShowCancelModal(true)}
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

            <button
              type="button"
              onClick={() => {
                setCourierForm({
                  courier_name: o.manual_courier_name || o.courier_name || "ST Courier",
                  waybill: o.manual_awb || (o.waybill && o.waybill !== o.courier_name ? o.waybill : ""),
                  status: o.status === "Cancelled" ? "Shipped" : (o.status || "Shipped"),
                  tracking_url: o.manual_tracking_url || o.tracking_url || (o.courier_name?.toLowerCase()?.includes("st") ? "https://stcourier.com" : "")
                });
                setShowCourierModal(true);
              }}
              style={{
                backgroundColor: '#1e293b',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '7px 14px',
                fontSize: '12.5px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              📦 Edit Courier / Ship Manually
            </button>
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
                <h3 className="inv__modal-title">Invoice Preview (4" × 6")</h3>
                <p className="inv__modal-subtitle">
                  Order #{String(o.id).slice(-8).toUpperCase()} · 100 × 150 mm
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

      {/* Thermal Invoice container for print — teleported to document.body */}
      {typeof document !== "undefined" && createPortal(
        <div className="thermal-print-area">
          <ThermalInvoice ref={invoiceRef} order={o} address={address} />
        </div>,
        document.body
      )}
      {/* Courier / Manual Shipping Modal */}
      {showCourierModal && (
        <div
          className="od__modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={() => setShowCourierModal(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '460px',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>
                📦 Update Courier & Status
              </h3>
              <button
                type="button"
                onClick={() => setShowCourierModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCourierDetails}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                  Courier Partner
                </label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                  {['ST Courier', 'Ekart Logistics', 'DTDC', 'Delhivery'].map(name => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setCourierForm(f => ({
                        ...f,
                        courier_name: name,
                        tracking_url: name.toLowerCase().includes('st') ? 'https://stcourier.com' : f.tracking_url
                      }))}
                      style={{
                        padding: '4px 8px',
                        fontSize: '11.5px',
                        borderRadius: '4px',
                        border: courierForm.courier_name === name ? '1.5px solid #8b0030' : '1px solid #cbd5e1',
                        backgroundColor: courierForm.courier_name === name ? '#fdf2f4' : '#f8fafc',
                        color: courierForm.courier_name === name ? '#8b0030' : '#475569',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={courierForm.courier_name}
                  onChange={(e) => setCourierForm(f => ({ ...f, courier_name: e.target.value }))}
                  placeholder="e.g. ST Courier, DTDC, Porter"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                  required
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                  AWB / Tracking Number (Optional)
                </label>
                <input
                  type="text"
                  value={courierForm.waybill}
                  onChange={(e) => setCourierForm(f => ({ ...f, waybill: e.target.value }))}
                  placeholder="e.g. Consignment / Docket Number"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                  Tracking URL (Optional)
                </label>
                <input
                  type="url"
                  value={courierForm.tracking_url}
                  onChange={(e) => setCourierForm(f => ({ ...f, tracking_url: e.target.value }))}
                  placeholder="https://stcourier.com"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                  Order Status
                </label>
                <select
                  value={courierForm.status}
                  onChange={(e) => setCourierForm(f => ({ ...f, status: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    backgroundColor: '#fff'
                  }}
                >
                  <option value="Shipped">Shipped (Dispatched)</option>
                  <option value="Delivered">Delivered</option>
                  <option value="Order Placed">Order Placed / Confirmed</option>
                </select>
                <p style={{ margin: '6px 0 0', fontSize: '11.5px', color: '#64748b' }}>
                  Setting to &quot;Shipped&quot; will preserve the order price and count in total revenue and orders.
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowCourierModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#475569',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingCourier}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#8b0030',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: updatingCourier ? 'not-allowed' : 'pointer'
                  }}
                >
                  {updatingCourier ? 'Saving...' : 'Save & Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Shipment Scope Modal */}
      {showCancelModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            maxWidth: '520px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>
              Cancel Shipment: {o.id}
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '13.5px', color: '#475569', lineHeight: '1.5' }}>
              How would you like to handle this cancellation?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              {/* Option 1: Cancel Pickup Only */}
              <div style={{
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid #fed7aa',
                backgroundColor: '#fffbeb'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '14px', color: '#9a3412' }}>Option A: Cancel Pickup Only (Recommended)</strong>
                </div>
                <p style={{ margin: '0 0 10px', fontSize: '12.5px', color: '#7c2d12', lineHeight: '1.4' }}>
                  Cancels the carrier pickup in iCarry. Keeps the customer order active (status stays &quot;{o.status}&quot;, delivery becomes &quot;Pickup Cancelled&quot;). You can retry booking or ship manually with another courier (e.g., ST Courier).
                </p>
                <button
                  type="button"
                  disabled={cancellingShipment}
                  onClick={() => handleCancelAction("shipment_only")}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#d97706',
                    color: '#fff',
                    fontSize: '12.5px',
                    fontWeight: '600',
                    cursor: cancellingShipment ? 'not-allowed' : 'pointer'
                  }}
                >
                  {cancellingShipment ? 'Processing...' : 'Cancel Pickup Only'}
                </button>
              </div>

              {/* Option 2: Cancel Whole Order */}
              <div style={{
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid #fecaca',
                backgroundColor: '#fef2f2'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '14px', color: '#991b1b' }}>Option B: Cancel Entire Order</strong>
                </div>
                <p style={{ margin: '0 0 10px', fontSize: '12.5px', color: '#7f1d1d', lineHeight: '1.4' }}>
                  Cancels the shipment with iCarry AND marks the entire order as &quot;Cancelled&quot;.
                  <br />
                  <strong style={{ color: '#b91c1c' }}>⚠️ Note:</strong> This will <u>NOT</u> automatically refund the customer or restore inventory. Any refund must be processed manually in Razorpay, and product inventory must be adjusted manually.
                </p>
                <button
                  type="button"
                  disabled={cancellingShipment}
                  onClick={() => handleCancelAction("whole_order")}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#dc2626',
                    color: '#fff',
                    fontSize: '12.5px',
                    fontWeight: '600',
                    cursor: cancellingShipment ? 'not-allowed' : 'pointer'
                  }}
                >
                  {cancellingShipment ? 'Processing...' : 'Cancel Entire Order'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={cancellingShipment}
                onClick={() => setShowCancelModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: "", type: "" })}
      />
    </div>
  );
};

export default OrderDetails;