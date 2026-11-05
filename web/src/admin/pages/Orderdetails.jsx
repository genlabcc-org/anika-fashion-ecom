import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { orderService } from "../../services/orderService";
import { formatCustomerOrderCount } from "../../utils/orderUtils";
import { getColorName } from "../../utils/colorUtils";

import { useStore } from "../../hooks/useStore";
import Toast from "../../components/Toast";
import ThermalInvoice from "../components/ThermalInvoice";
import ManualShippingCard from "../components/ManualShippingCard";
import { whatsappService } from "../../services/whatsappService";
import "./Orderdetails.css";

const STATUS_CONFIG = {
  "Order Placed": { bg: "#e0f2fe", color: "#0369a1", dot: "#0284c7" },
  Delivered: { bg: "#dcfce7", color: "#16a34a", dot: "#22c55e" },
  Shipped: { bg: "#fef9c3", color: "#a16207", dot: "#eab308" },
  Pending: { bg: "#dbeafe", color: "#1d4ed8", dot: "#3b82f6" },
  Cancelled: { bg: "#fee2e2", color: "#dc2626", dot: "#ef4444" },
  Returned: { bg: "#fee2e2", color: "#dc2626", dot: "#ef4444" },
  Confirmed: { bg: "#f3e8ff", color: "#7c3aed", dot: "#8b5cf6" },
  "Refund Completed": { bg: "#ecfdf5", color: "#047857", dot: "#10b981" },
  Refunded: { bg: "#ecfdf5", color: "#047857", dot: "#10b981" },
  "Partially Refunded": { bg: "#fef3c7", color: "#b45309", dot: "#f59e0b" },
  "Refund Failed": { bg: "#fee2e2", color: "#b91c1c", dot: "#ef4444" },
  "Out for Delivery": { bg: "#ffedd5", color: "#c2410c", dot: "#f97316" },
  "Out of Delivery": { bg: "#ffedd5", color: "#c2410c", dot: "#f97316" }
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
  const [customerOrderCount, setCustomerOrderCount] = useState(
    order?.customer?.orderCount ?? null
  );

  const [invoicePrinted, setInvoicePrinted] = useState(order?.invoice_printed || false);
  const [printing, setPrinting] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [togglingRead, setTogglingRead] = useState(false);
  const [togglingPacked, setTogglingPacked] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [submittingRefund, setSubmittingRefund] = useState(false);
  const [refundForm, setRefundForm] = useState({
    reason: "Damaged",
    isVerified: false,
    amount: "",
    note: "",
  });
  const [refundError, setRefundError] = useState("");
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
  const updateOrderInList = useStore(state => state.updateOrderInList);
  const isAdmin = useStore(state => state.isAdmin);
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
      if (order.customer?.orderCount !== undefined && order.customer?.orderCount !== null) {
        setCustomerOrderCount(order.customer.orderCount);
      }
    }
  }, [order]);

  // Refetch fresh order from DB on mount so stale localStorage doesn't hide updated refund status
  useEffect(() => {
    const orderId = order?.id;
    if (!orderId) return;

    orderService.getOrderById(orderId).then((fresh) => {
      if (fresh) {
        setCurrentOrder((prev) => ({ ...(prev || order || {}), ...fresh }));
        if (fresh.admin_notes !== undefined) {
          setAdminNote(fresh.admin_notes || "");
        }
      }
    }).catch((err) => {
      console.warn("Could not refetch fresh order details:", err);
    });
  }, [order?.id]);

  // Auto-sync order status in DB if order has tracking/AWB but status is still "Paid" or unfulfilled
  useEffect(() => {
    const orderId = o?.id;
    if (!orderId) return;

    const s = (o.status || "").toLowerCase().trim();
    const d = (o.delivery_status || "").toLowerCase().trim();
    const activeAwb = o.manual_awb || o.waybill || "";
    const hasTracking = Boolean(activeAwb || o.shipped_at || d === "shipped");
    const isTerminal = ["shipped", "delivered", "cancelled", "canceled", "refund completed", "refunded"].includes(s);

    if (hasTracking && !isTerminal) {
      console.log(`[OrderDetails] Order ${orderId} has tracking (${activeAwb}) but status is "${o.status}". Syncing to "Shipped"...`);
      const now = o.shipped_at || new Date().toISOString();
      const patch = {
        status: "Shipped",
        delivery_status: o.delivery_status || "Shipped",
        shipped_at: now,
      };

      orderService.updateOrderStatus(orderId, "Shipped").then(() => {
        setCurrentOrder((prev) => (prev ? { ...prev, ...patch } : prev));
        if (typeof updateOrderInList === "function") {
          updateOrderInList(orderId, patch);
        }
        if (typeof setSelectedAdminOrder === "function") {
          setSelectedAdminOrder((prev) => (prev ? { ...prev, ...patch } : prev));
        }
      }).catch((err) => {
        console.warn("[OrderDetails] Failed to auto-sync status to Shipped:", err);
      });
    }
  }, [o?.id, o?.status, o?.delivery_status, o?.manual_awb, o?.waybill, o?.shipped_at, updateOrderInList, setSelectedAdminOrder]);

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
    const patch = { is_packed: nextPacked, packed_at: nextPackedAt };
    const rollbackPatch = { is_packed: currentPacked, packed_at: currentPackedAt };

    try {
      setCurrentOrder((prev) => (prev ? { ...prev, ...patch } : prev));
      if (typeof updateOrderInList === "function") {
        updateOrderInList(o.id, patch);
      }

      await orderService.setOrderPacked(o.id, nextPacked);
      if (typeof setSelectedAdminOrder === "function") {
        setSelectedAdminOrder((prev) => (prev ? { ...prev, ...patch } : prev));
      }
      showToast(nextPacked ? "Order marked as packed" : "Order marked as unpacked", "success");
    } catch (err) {
      console.error("Toggle packed failed:", err);
      setCurrentOrder((prev) => (prev ? { ...prev, ...rollbackPatch } : prev));
      if (typeof updateOrderInList === "function") {
        updateOrderInList(o.id, rollbackPatch);
      }
      if (typeof setSelectedAdminOrder === "function") {
        setSelectedAdminOrder((prev) => (prev ? { ...prev, ...rollbackPatch } : prev));
      }
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
            if (payload.new.admin_notes !== undefined) {
              setAdminNote(payload.new.admin_notes || "");
            }
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
      .select("product_id, name, description, price, compare_price, image_url, images, sizes, stock, sku, categories!category_id(name)")
      .eq("product_id", item.product_id)
      .single();
    if (error || !product) return;

    setSelectedProduct({
      ...product,
      id: product.product_id,
      productId: product.product_id,
      img: product.image_url || product.images?.[0] || "/src/assets/cart/bangle1.webp",
      desc: product.description,
      originalPrice: (product.compare_price && Number(product.compare_price) > Number(product.price)) ? Number(product.compare_price) : 0,
      compare_price: (product.compare_price && Number(product.compare_price) > Number(product.price)) ? Number(product.compare_price) : 0,
      sizes: product.sizes || [],
      stock: product.stock > 0 ? "in-stock" : "out-of-stock",
      category: product.categories?.name || "Bangles",
    });
    navigate(`/product/${product.product_id}`);
  };

  const showToast = (message, type = "info") => {
    setToast({ message: "", type: "" });
    setTimeout(() => setToast({ message, type }), 10);
  };


  useEffect(() => {
    setAdminNote(o.admin_notes || "");
  }, [o.admin_notes]);

  const targetUserId = o?.user_id || o?.customer?.id || order?.user_id || order?.customer?.id;

  // 1. Fetch Shipping Address
  useEffect(() => {
    if (!targetUserId) return;
    let isCurrent = true;
    setAddressLoading(true);
    orderService.getAddresses(targetUserId)
      .then((data) => {
        const defaultAddr = data.find((a) => a.is_default) || data[0];
        if (isCurrent) setAddress(defaultAddr || null);
      })
      .catch((err) => {
        console.error("Error fetching shipping address:", err);
      })
      .finally(() => {
        if (isCurrent) setAddressLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [targetUserId]);

  // 2. Resolve Customer's Total Order Count: use precomputed count, only query Supabase (head: true) as fallback
  useEffect(() => {
    const precomputed = o?.customer?.orderCount ?? order?.customer?.orderCount;
    if (typeof precomputed === "number") {
      setCustomerOrderCount(precomputed);
      return;
    }

    if (!targetUserId) return;

    let isCurrent = true;
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", targetUserId)
      .not("status", "in", '("Cancelled","cancelled","canceled","Pending","pending","Refunded","refunded","Refund Completed","Partially Refunded","Returned","returned","return","Return","Failed","failed","Payment Failed","payment failed")')
      .then(({ count, error }) => {
        if (!error && typeof count === "number" && isCurrent) {
          setCustomerOrderCount(count);
        }
      })
      .catch((e) => {
        console.warn("Fallback order count query error:", e);
      });

    return () => {
      isCurrent = false;
    };
  }, [o?.customer?.orderCount, order?.customer?.orderCount, targetUserId]);

  const handleSaveNote = async () => {
    if (!o?.id) return;
    try {
      setSavingNote(true);
      await orderService.updateOrderNote(o.id, adminNote);
      if (typeof updateOrderInList === "function") updateOrderInList(o.id, { admin_notes: adminNote });
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
      if (typeof updateOrderInList === "function") updateOrderInList(o.id, { invoice_printed: true });
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
        if (typeof updateOrderInList === "function") updateOrderInList(o.id, fullOrder);
        return fullOrder;
      }
    } catch (err) {
      console.error("Error refetching order:", err);
    }
  };

  const handleCancelOrder = async () => {
    if (!o?.id || cancellingOrder) return;
    const confirmed = window.confirm(
      `Are you sure you want to cancel order ${o.id}?\n\nThis will mark the order as Cancelled in the database.`
    );
    if (!confirmed) return;

    setCancellingOrder(true);
    try {
      await orderService.cancelOrder(o.id);
      showToast("Order cancelled successfully.", "success");
      await fetchFreshOrder();
    } catch (err) {
      console.error("Failed to cancel order:", err);
      showToast("Failed to cancel order: " + (err.message || err), "error");
    } finally {
      setCancellingOrder(false);
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

  // Refund calculations & status determinations
  const totalPrice = Number(o.total_price || 0);
  const shippingFee = Number(o.shipping_fee || 0);
  const maxRefundable = Math.max(0, totalPrice - shippingFee);
  const isFullyRefunded = ["refunded", "refund completed"].includes((o.status || "").toLowerCase());
  const isPartiallyRefunded = (o.status || "").toLowerCase() === "partially refunded";
  const isRefundFailed = (o.status || "").toLowerCase() === "refund failed";
  const hasRefundInitiated = (o.admin_notes || "").includes("[REFUND] initiated") && !isFullyRefunded && !isRefundFailed;

  let refundBadgeText = "None";
  let refundBadgeBg = "#f1f5f9";
  let refundBadgeColor = "#475569";
  let refundBadgeDot = "#94a3b8";

  if (isFullyRefunded) {
    refundBadgeText = "Refunded";
    refundBadgeBg = "#ecfdf5";
    refundBadgeColor = "#047857";
    refundBadgeDot = "#10b981";
  } else if (isPartiallyRefunded) {
    refundBadgeText = "Partially Refunded";
    refundBadgeBg = "#fef3c7";
    refundBadgeColor = "#b45309";
    refundBadgeDot = "#f59e0b";
  } else if (isRefundFailed) {
    refundBadgeText = "Refund Failed";
    refundBadgeBg = "#fee2e2";
    refundBadgeColor = "#b91c1c";
    refundBadgeDot = "#ef4444";
  } else if (hasRefundInitiated) {
    refundBadgeText = "Refund Initiated";
    refundBadgeBg = "#e0f2fe";
    refundBadgeColor = "#0369a1";
    refundBadgeDot = "#0284c7";
  }

  let isRefundDisabled = false;
  let refundDisabledReason = "";

  if (submittingRefund) {
    isRefundDisabled = true;
    refundDisabledReason = "Submitting refund...";
  } else if (hasRefundInitiated) {
    isRefundDisabled = true;
    refundDisabledReason = "Refund already initiated. Awaiting Razorpay confirmation.";
  } else if (isFullyRefunded) {
    isRefundDisabled = true;
    refundDisabledReason = "This order is already fully refunded.";
  } else if (!o.razorpay_payment_id) {
    isRefundDisabled = true;
    refundDisabledReason = "Cannot refund via Razorpay: No Razorpay payment ID on record (unpaid or COD).";
  }

  const refundLogs = (o.admin_notes || "")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.startsWith("[REFUND]"));

  const handleOpenRefundModal = () => {
    setRefundError("");
    const isCancelledOrder = (o.status || "").toLowerCase().includes("cancel");
    setRefundForm({
      reason: isCancelledOrder ? "Order Cancelled" : "Damaged",
      isVerified: false,
      amount: maxRefundable > 0 ? String(maxRefundable) : "0",
      note: isCancelledOrder ? "Order cancelled" : ""
    });
    setShowRefundModal(true);
  };

  const handleInitiateRefundSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!refundForm.isVerified) {
      setRefundError("You must verify and confirm the refund authorization before proceeding.");
      return;
    }

    const amt = Number(refundForm.amount);
    if (isNaN(amt) || amt <= 0) {
      setRefundError("Please enter a valid refund amount greater than 0.");
      return;
    }

    if (amt > maxRefundable) {
      setRefundError(`Refund amount cannot exceed eligible product price of ₹${maxRefundable}. Shipping fee of ₹${shippingFee} is non-refundable.`);
      return;
    }

    setSubmittingRefund(true);
    setRefundError("");

    try {
      const res = await orderService.initiateRefund({
        orderId: o.id,
        amount: amt,
        reason: refundForm.reason,
        note: refundForm.note
      });

      showToast(`Refund of ₹${amt} initiated successfully via Razorpay!`, "success");
      setShowRefundModal(false);

      // Immediately refetch updated order
      const fresh = await orderService.getOrderById(o.id);
      if (fresh) {
        setCurrentOrder(prev => ({ ...(prev || {}), ...fresh }));
        if (fresh.admin_notes !== undefined) setAdminNote(fresh.admin_notes || "");
        if (typeof updateOrderInList === "function") updateOrderInList(fresh.id, fresh);
      }
    } catch (err) {
      console.error("Failed to initiate refund:", err);
      setRefundError(err.message || "Failed to initiate refund with Razorpay");
    } finally {
      setSubmittingRefund(false);
    }
  };

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

    if (s === "refund completed" || s === "refunded") {
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

    if (s === "partially refunded") {
      return [
        {
          label: "Order placed",
          date: orderPlacedDate,
          done: true,
          isCancelled: false
        },
        {
          label: "Partially Refunded",
          date: "Partial Refund Processed",
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
    const activeAwb = o.manual_awb || o.waybill || "";
    const activeCarrier = o.manual_courier_name || o.courier_name || "";

    const isConfirmedDone = [
      "confirmed", "processing", "packed", "shipped", "delivered", "returned", "rto"
    ].includes(s) || !!activeAwb || [
      "booked", "pending pickup", "pickup scheduled", "manifested", "picked up", "shipped", "in transit", "out for delivery", "delivered", "rto", "returned"
    ].some(x => d.includes(x));

    const isShippedDone = [
      "shipped", "delivered", "returned", "rto"
    ].includes(s) || !!activeAwb || Boolean(o.shipped_at) || [
      "picked up", "shipped", "in transit", "out for delivery", "delivered", "rto", "returned"
    ].some(x => d.includes(x));

    const isOutForDeliveryDone = d.includes("out for delivery") || d.includes("delivered") || s === "delivered";
    const isNdr = d.startsWith("ndr");
    const isDeliveredDone = ["delivered", "returned", "rto"].includes(s) || d.includes("delivered") || d.includes("returned") || d.includes("rto");

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
          ? (activeAwb ? `AWB: ${activeAwb}` : "Confirmed")
          : "Pending confirmation",
        done: isConfirmedDone,
        isCancelled: false
      },
      {
        label: "Shipped",
        date: isShippedDone
          ? `${activeCarrier || "Dispatched"}${activeAwb ? ` (${activeAwb})` : ""}`
          : (o.is_packed
            ? (activeCarrier ? `Packed for ${activeCarrier}` : "Packed & ready")
            : "Awaiting packing"),
        done: isShippedDone,
        isCancelled: false
      },
      {
        label: "Out for delivery",
        date: isOutForDeliveryDone
          ? "Out for Delivery"
          : (isShippedDone ? (activeCarrier ? `In transit with ${activeCarrier}` : "In transit") : ""),
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
    ["shipped", "delivered"].includes((o?.delivery_status || "").toLowerCase()) ||
    Boolean(o?.manual_awb || o?.waybill || o?.shipped_at);

  const isOrderCancelled =
    !isShippedOrDelivered &&
    (((o?.status || "").toLowerCase().includes("cancel") && !(o?.status || "").toLowerCase().includes("pickup cancel")) ||
      ((o?.delivery_status || "").toLowerCase().includes("cancel") && !(o?.delivery_status || "").toLowerCase().includes("pickup cancel")) ||
      (o?.delivery_status || "").toLowerCase() === "voided");

  const isDelivered =
    (o?.status || "").toLowerCase() === "delivered" ||
    (o?.delivery_status || "").toLowerCase() === "delivered";

  const isShipped = isShippedOrDelivered && !isDelivered;

  const isCancelledOrDelivered = isOrderCancelled || isDelivered;

  const timelineSteps = getTimelineSteps();

  const displayOrderCount =
    customerOrderCount ??
    o?.customer?.orderCount ??
    order?.customer?.orderCount ??
    1;

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
            <StatusBadge status={isOrderCancelled ? "Cancelled" : (isDelivered ? "Delivered" : isShipped ? "Shipped" : o.status)} />
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

            {!isCancelledOrDelivered && (
              <button
                type="button"
                onClick={handleCancelOrder}
                disabled={cancellingOrder}
                style={{
                  padding: "7px 12px",
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "#dc2626",
                  backgroundColor: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: "6px",
                  cursor: cancellingOrder ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <span>✕</span>
                <span>{cancellingOrder ? "Cancelling..." : "Cancel Order"}</span>
              </button>
            )}
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
            <span className="od__info-value od__info-value--customer-name">
              <span>{o.customer?.name || address?.full_name || "Unknown"}</span>
              <span
                className={`od__customer-order-count ${displayOrderCount === 1 ? 'od__customer-order-count--first' : 'od__customer-order-count--repeat'}`}
                title={displayOrderCount === 1 ? 'New customer (1st order)' : `Repeat customer (${displayOrderCount} orders)`}
              >
                {formatCustomerOrderCount(displayOrderCount)}
              </span>
            </span>
            <span className="od__info-label">Phone</span>
            <span className="od__info-value">
              {o.customer?.phone && o.customer.phone !== "N/A"
                ? o.customer.phone
                : address?.phone_number || o.customer?.phone || "N/A"}
            </span>
            <span className="od__info-label">Email</span>
            <span className="od__info-value od__info-value--wrap">{o.customer?.email || "N/A"}</span>
            <span className="od__info-label">Joined</span>
            <span className="od__info-value">
              {o.customer?.created_at ? new Date(o.customer.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "N/A"}
            </span>
            <span className="od__info-label">Orders</span>
            <span className="od__info-value">
              <span
                className={`od__customer-order-count ${displayOrderCount === 1 ? 'od__customer-order-count--first' : 'od__customer-order-count--repeat'}`}
                style={{ marginLeft: 0 }}
                title={displayOrderCount === 1 ? 'New customer (1st order)' : `Repeat customer (${displayOrderCount} orders)`}
              >
                {formatCustomerOrderCount(displayOrderCount)}
              </span>
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
                  <div
                    className="od__item-sku"
                    style={{
                      color: '#888',
                      fontSize: '12.5px',
                      marginTop: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '6px'
                    }}
                  >
                    <span>Order Ref: #{o.id?.slice(-6) || o.id}</span>
                    <span>·</span>
                    <span>Qty: {item.quantity || 1}</span>
                    {item.size && item.size !== 'N/A' && (
                      <>
                        <span>·</span>
                        <span>Size: <strong style={{ color: '#475569', fontWeight: '500' }}>{item.size}</strong></span>
                      </>
                    )}
                    {item.color && item.color !== 'N/A' && (
                      <>
                        <span>·</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <span>Color:</span>
                          <span
                            style={{
                              display: 'inline-block',
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              backgroundColor: item.color,
                              border: '1px solid #cbd5e1',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                              flexShrink: 0
                            }}
                            title={item.color}
                          />
                          <strong style={{ color: '#475569', fontWeight: '500' }} title={item.color}>
                            {getColorName(item.color)}
                          </strong>
                        </span>
                      </>
                    )}
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
        <ManualShippingCard
          order={o}
          address={address}
          onOrderUpdated={(updates) => {
            setCurrentOrder((prev) => ({ ...(prev || {}), ...updates }));
            if (typeof updateOrderInList === "function") {
              updateOrderInList(o.id, updates);
            }
            if (typeof setSelectedAdminOrder === "function") {
              setSelectedAdminOrder((prev) => ({ ...(prev || {}), ...updates }));
            }
          }}
          showToast={showToast}
        />
      </div>

      {/* Refund Management */}
      <div className="od__card od__card--section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div className="od__card-title" style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Refund Management
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '3px 10px',
                  borderRadius: '9999px',
                  fontSize: '12px',
                  fontWeight: '600',
                  backgroundColor: refundBadgeBg,
                  color: refundBadgeColor,
                }}
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: refundBadgeDot }} />
                {refundBadgeText}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              {(o.status || "").toLowerCase().includes("cancel")
                ? "Order is cancelled. Product price can be refunded to the customer via Razorpay. Shipping fee is non-refundable."
                : "Refunds are strictly for damaged/broken items (customer unboxing video verification required). Product price only; shipping fee is non-refundable."}
            </div>
          </div>

          {isAdmin && (
            <button
              type="button"
              className="od__refund-btn"
              onClick={handleOpenRefundModal}
              disabled={isRefundDisabled}
              title={refundDisabledReason || "Initiate refund via Razorpay"}
            >
              Update Refund
            </button>
          )}
        </div>

        <div className="od__info-grid" style={{ marginTop: '12px' }}>
          <span className="od__info-label">Max Eligible Refund</span>
          <span className="od__info-value" style={{ fontWeight: '600', color: '#047857' }}>
            ₹{maxRefundable.toLocaleString('en-IN')} (Product Price)
          </span>

          <span className="od__info-label">Shipping Fee</span>
          <span className="od__info-value" style={{ color: '#64748b' }}>
            ₹{shippingFee.toLocaleString('en-IN')} (Non-refundable)
          </span>

          <span className="od__info-label">Payment ID</span>
          <span className="od__info-value" style={{ fontFamily: 'monospace' }}>
            {o.razorpay_payment_id || <span style={{ color: '#94a3b8' }}>None (COD / Unpaid)</span>}
          </span>
        </div>

        {refundDisabledReason && !isFullyRefunded && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
            ℹ️ {refundDisabledReason}
          </div>
        )}

        {refundLogs.length > 0 && (
          <div style={{ marginTop: '14px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
              Refund Audit Trail
            </div>
            <div className="od__refund-audit-box">
              {refundLogs.map((log, idx) => (
                <div key={idx}>{log}</div>
              ))}
            </div>
          </div>
        )}
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
          Preview Invoice
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

      {/* Refund Modal */}
      {showRefundModal && (
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
          onClick={() => !submittingRefund && setShowRefundModal(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '520px',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>
                  Update Refund (Razorpay)
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                  Order: #{o.id} • Razorpay Payment: {o.razorpay_payment_id || "N/A"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !submittingRefund && setShowRefundModal(false)}
                disabled={submittingRefund}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: submittingRefund ? 'not-allowed' : 'pointer',
                  color: '#94a3b8',
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}
              >
                ✕
              </button>
            </div>

            {/* Warning Prompt */}
            <div
              style={{
                backgroundColor: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '8px',
                padding: '12px 14px',
                marginBottom: '16px',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start'
              }}
            >
              <span style={{ fontSize: '18px' }}>⚠️</span>
              <div style={{ fontSize: '12.5px', color: '#92400e', lineHeight: '1.4' }}>
                <strong>Important:</strong> This will send the refund directly to the customer's original payment source via Razorpay. Once initiated, this action <u>cannot be undone</u>.
              </div>
            </div>

            {refundError && (
              <div
                style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  color: '#b91c1c',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span>✕</span> {refundError}
              </div>
            )}

            <form onSubmit={handleInitiateRefundSubmit}>
              {/* Reason Dropdown */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                  Refund Reason <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={refundForm.reason}
                  onChange={(e) => setRefundForm(prev => ({ ...prev, reason: e.target.value }))}
                  disabled={submittingRefund}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13.5px',
                    backgroundColor: '#fff',
                    color: '#0f172a'
                  }}
                >
                  <option value="Order Cancelled">Order Cancelled</option>
                  <option value="Damaged">Damaged Item</option>
                  <option value="Broken">Broken Item</option>
                  <option value="Missing item">Missing item</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Amount Input */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: '#334155' }}>
                    Refund Amount (₹) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <span style={{ fontSize: '12px', color: '#047857', fontWeight: '600' }}>
                    Max eligible: ₹{maxRefundable.toLocaleString('en-IN')}
                  </span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  max={maxRefundable}
                  value={refundForm.amount}
                  onChange={(e) => setRefundForm(prev => ({ ...prev, amount: e.target.value }))}
                  disabled={submittingRefund}
                  placeholder={`e.g. ${maxRefundable}`}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    backgroundColor: '#fff',
                    color: '#0f172a',
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                  Store policy: Product price only (₹{maxRefundable}). Shipping fee of ₹{shippingFee} is non-refundable.
                </div>
              </div>

              {/* Note / Comments */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                  Admin Notes (Optional)
                </label>
                <input
                  type="text"
                  value={refundForm.note}
                  onChange={(e) => setRefundForm(prev => ({ ...prev, note: e.target.value }))}
                  disabled={submittingRefund}
                  placeholder="e.g. Unboxing video verified by admin; ear hook broken"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    backgroundColor: '#fff',
                    color: '#0f172a',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Mandatory Verification Checkbox */}
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px'
                }}
              >
                <input
                  type="checkbox"
                  id="refund-verification-check"
                  checked={refundForm.isVerified}
                  onChange={(e) => setRefundForm(prev => ({ ...prev, isVerified: e.target.checked }))}
                  disabled={submittingRefund}
                  style={{ marginTop: '3px', cursor: 'pointer', width: '16px', height: '16px' }}
                />
                <label
                  htmlFor="refund-verification-check"
                  style={{ fontSize: '12.5px', color: '#1e293b', lineHeight: '1.4', cursor: 'pointer', fontWeight: '500' }}
                >
                  <strong style={{ color: '#0f172a' }}>Verification Confirmation (Required):</strong> I have verified this refund is authorized (e.g., order cancelled or unboxing video verified for damage) per store policy.
                </label>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowRefundModal(false)}
                  disabled={submittingRefund}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#fff',
                    color: '#475569',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: submittingRefund ? 'not-allowed' : 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRefund || !refundForm.isVerified}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: submittingRefund || !refundForm.isVerified ? '#cbd5e1' : '#8b0030',
                    color: submittingRefund || !refundForm.isVerified ? '#94a3b8' : '#fff',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: submittingRefund || !refundForm.isVerified ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {submittingRefund ? (
                    <>
                      <span className="od__spinner" style={{ width: '13px', height: '13px', borderTopColor: '#fff' }} />
                      Initiating Refund...
                    </>
                  ) : (
                    "Confirm & Initiate Refund"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Preview Modal */}
      {showInvoiceModal && (
        <div className="inv__modal-overlay" onClick={() => setShowInvoiceModal(false)}>
          <div className="inv__modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="inv__modal-header">
              <div>
                <h3 className="inv__modal-title">Invoice Preview (4" × 6")</h3>
                <p className="inv__modal-subtitle">
                  Order #{String(o.id).slice(-6).toUpperCase()} · 100 × 150 mm
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



      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: "", type: "" })}
      />
    </div>
  );
};

export default OrderDetails;