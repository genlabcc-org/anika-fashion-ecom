import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../lib/supabase";
import ThermalInvoice from "../components/ThermalInvoice";
import { orderService } from "../../services/orderService";
import "./Invoices.css";

const STATUS_COLORS = {
  "Order Placed": { bg: "#e0f2fe", color: "#0369a1" },
  Delivered: { bg: "#dcfce7", color: "#16a34a" },
  Shipped: { bg: "#fef9c3", color: "#a16207" },
  Pending: { bg: "#dbeafe", color: "#1d4ed8" },
  Cancelled: { bg: "#fee2e2", color: "#dc2626" },
  Confirmed: { bg: "#f3e8ff", color: "#7c3aed" },
  Returned: { bg: "#fee2e2", color: "#dc2626" },
};

// Play a crisp, gentle synthesizer chime on new order
const playOrderChime = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const audioCtx = new AudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.setValueAtTime(880.00, audioCtx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
  } catch (e) {
    // Audio context may be restricted before user gesture
    console.debug("Audio chime skipped:", e);
  }
};

const Invoices = ({ orders = [], loading = false }) => {
  const [localOrders, setLocalOrders] = useState(orders);
  const [filter, setFilter] = useState("all"); // all | unprinted | printed
  const [search, setSearch] = useState("");
  const [printBatch, setPrintBatch] = useState([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [toast, setToast] = useState(null);
  const [autoPrint, setAutoPrint] = useState(() => {
    return localStorage.getItem("anika_auto_print") !== "false";
  });
  const [previewOrder, setPreviewOrder] = useState(null);
  const [previewAddress, setPreviewAddress] = useState(null);
  const [previewLoadingAddress, setPreviewLoadingAddress] = useState(false);
  const [printAddresses, setPrintAddresses] = useState({});
  const [pendingConfirmBatch, setPendingConfirmBatch] = useState(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const toastTimerRef = useRef(null);

  const showToast = (message, type = "info") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Keep localOrders synced with incoming props
  useEffect(() => {
    setLocalOrders(orders);
  }, [orders]);

  // Open invoice preview and fetch customer address if available
  const handleOpenPreview = async (order) => {
    if (!order) return;
    const existingAddr = order.shipping_address || order.address || null;
    setPreviewOrder(order);
    setPreviewAddress(existingAddr);
    if (order.user_id) {
      try {
        setPreviewLoadingAddress(true);
        const addresses = await orderService.getAddresses(order.user_id);
        const defaultAddr = addresses.find((a) => a.is_default) || addresses[0];
        if (defaultAddr) {
          setPreviewAddress(defaultAddr);
        }
      } catch (e) {
        console.debug("Could not fetch address for preview:", e);
      } finally {
        setPreviewLoadingAddress(false);
      }
    }
  };

  // Toggle Auto-Print setting
  const handleToggleAutoPrint = () => {
    setAutoPrint((prev) => {
      const next = !prev;
      localStorage.setItem("anika_auto_print", String(next));
      showToast(
        next
          ? "🟢 Auto-Print turned ON — invoices will print immediately on new orders!"
          : "⚪ Auto-Print paused — use 'Print All Pending' to print manually.",
        next ? "success" : "info"
      );
      return next;
    });
  };

  // User confirmed that print succeeded in physical printer
  const handleConfirmPrinted = async () => {
    if (!pendingConfirmBatch) return;
    try {
      setIsUpdatingStatus(true);
      const ids = pendingConfirmBatch.ids;

      // Mark as printed in Supabase
      await orderService.markInvoicesBulkPrinted(ids);

      // Optimistically update local state so rows turn green / counted as printed
      setLocalOrders((prev) =>
        prev.map((o) => (ids.includes(o.id) ? { ...o, invoice_printed: true } : o))
      );

      // Update preview order state if currently open
      setPreviewOrder((prev) =>
        prev && ids.includes(prev.id) ? { ...prev, invoice_printed: true } : prev
      );

      showToast(
        `✅ Marked ${ids.length} invoice${ids.length > 1 ? "s" : ""} as printed!`,
        "success"
      );
    } catch (err) {
      console.error("Error marking as printed:", err);
      showToast("Error updating invoice status: " + err.message, "error");
    } finally {
      setIsUpdatingStatus(false);
      setPendingConfirmBatch(null);
    }
  };

  // User cancelled print or printing failed on printer
  const handleCancelPrinted = () => {
    showToast("ℹ️ Print cancelled — invoice status left as unprinted.", "info");
    setPendingConfirmBatch(null);
  };

  // Manually toggle an invoice's printed status (Printed <-> Unprinted)
  const handleTogglePrintedStatus = async (order) => {
    if (!order || !order.id) return;
    const newStatus = !order.invoice_printed;
    const orderShortId = String(order.id).slice(-8).toUpperCase();
    try {
      await orderService.updateInvoicePrintedStatus(order.id, newStatus);
      setLocalOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, invoice_printed: newStatus } : o))
      );
      setPreviewOrder((prev) =>
        prev && prev.id === order.id ? { ...prev, invoice_printed: newStatus } : prev
      );
      showToast(
        newStatus
          ? `✅ Order #${orderShortId} manually marked as Printed!`
          : `↩️ Order #${orderShortId} manually marked as Unprinted!`,
        "success"
      );
    } catch (e) {
      console.error("Failed to update printed status:", e);
      showToast("Error updating printed status: " + e.message, "error");
    }
  };

  // Reusable batch print trigger
  const triggerPrintBatch = async (ordersToPrint) => {
    if (!ordersToPrint || ordersToPrint.length === 0 || isPrinting) return;
    try {
      setIsPrinting(true);

      // Pre-fetch shipping addresses in parallel for orders missing them so receipt has full details
      const addrMap = { ...printAddresses };
      if (previewOrder && previewAddress) {
        addrMap[previewOrder.id] = previewAddress;
      }
      const missingAddrOrders = ordersToPrint.filter((ord) => !addrMap[ord.id] && ord.user_id);
      if (missingAddrOrders.length > 0) {
        await Promise.all(
          missingAddrOrders.map(async (ord) => {
            try {
              const addrs = await orderService.getAddresses(ord.user_id);
              addrMap[ord.id] = addrs.find((a) => a.is_default) || addrs[0] || null;
            } catch (e) {
              console.debug("Could not fetch address for print:", e);
            }
          })
        );
      }
      setPrintAddresses(addrMap);
      setPrintBatch(ordersToPrint);

      // Allow DOM to fully render all batch thermal invoices
      await new Promise((res) => setTimeout(res, 500));

      // Trigger browser print dialog
      window.print();

      // Automatically update printed status in Supabase & local state
      const ids = ordersToPrint.map((o) => o.id);
      try {
        await orderService.markInvoicesBulkPrinted(ids);
        setLocalOrders((prev) =>
          prev.map((o) => (ids.includes(o.id) ? { ...o, invoice_printed: true } : o))
        );
        setPreviewOrder((prev) =>
          prev && ids.includes(prev.id) ? { ...prev, invoice_printed: true } : prev
        );
        showToast(
          `🖨️ Sent ${ids.length} invoice${ids.length > 1 ? "s" : ""} to H30C Pro printer!`,
          "success"
        );
      } catch (err) {
        console.error("Failed to mark printed in DB:", err);
      }
    } catch (err) {
      console.error("Print batch error:", err);
      showToast("Print error: " + err.message, "error");
    } finally {
      setIsPrinting(false);
      // Keep thermal invoices mounted for at least 15s so print spooler never loses content
      setTimeout(() => {
        setPrintBatch([]);
      }, 15000);
    }
  };

  // Supabase Realtime: Auto-print on new order creation
  useEffect(() => {
    const channel = supabase
      .channel("invoices-realtime-listener")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        async (payload) => {
          const newOrder = payload.new;
          if (!newOrder) return;
          let enrichedOrder = {
            ...newOrder,
            customer: {
              name: newOrder.customer_name || "Customer",
              phone: newOrder.customer_phone || newOrder.phone || "",
            }
          };

          if (newOrder.user_id) {
            try {
              const { data: profile } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", newOrder.user_id)
                .single();
              if (profile) {
                enrichedOrder.customer = {
                  id: newOrder.user_id,
                  name: profile.name || profile.full_name || enrichedOrder.customer.name,
                  phone: profile.phone || profile.phone_number || profile.mobile || enrichedOrder.customer.phone,
                  email: profile.email || ""
                };
              }
            } catch (e) {
              console.debug("Could not enrich profile for new order:", e);
            }
          }

          // Prepend new order to list if not present
          setLocalOrders((prev) => {
            if (prev.some((o) => o.id === enrichedOrder.id)) return prev;
            return [enrichedOrder, ...prev];
          });

          // If auto-print is enabled and this order is not marked as printed yet
          if (autoPrint && !enrichedOrder.invoice_printed) {
            playOrderChime();
            const orderShortId = String(enrichedOrder.id).slice(-8).toUpperCase();
            showToast(`🔔 New Order #${orderShortId} generated! Printing invoice...`, "info");

            setTimeout(() => {
              triggerPrintBatch([enrichedOrder]);
            }, 300);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [autoPrint]);

  // Master Print All Pending
  const handlePrintAllPending = () => {
    const unprinted = localOrders.filter((o) => !o.invoice_printed);
    if (unprinted.length === 0) {
      showToast("No pending invoices to print! All orders are already printed.", "info");
      return;
    }
    triggerPrintBatch(unprinted);
  };

  // Filter and search
  const unprintedCount = localOrders.filter((o) => !o.invoice_printed).length;
  const printedCount = localOrders.filter((o) => o.invoice_printed).length;

  const filtered = localOrders.filter((order) => {
    const s = search.toLowerCase().trim();
    const orderIdStr = order.id ? String(order.id).toLowerCase() : "";
    const custName = order.customer?.name ? String(order.customer.name).toLowerCase() : "";
    const custPhone = order.customer?.phone ? String(order.customer.phone).toLowerCase() : "";
    const directPhone = order.phone ? String(order.phone).toLowerCase() : "";

    const matchesSearch =
      !s ||
      orderIdStr.includes(s) ||
      custName.includes(s) ||
      custPhone.includes(s) ||
      directPhone.includes(s);

    if (!matchesSearch) return false;

    if (filter === "unprinted") return !order.invoice_printed;
    if (filter === "printed") return Boolean(order.invoice_printed);
    return true;
  });

  const renderMobileCards = () => {
    if (loading) {
      return (
        <div className="inv__cards-list">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="inv__card inv__card--skeleton">
              <div className="inv__card-header">
                <div className="skeleton-shimmer" style={{ height: "16px", width: "90px", borderRadius: "4px" }} />
                <div className="skeleton-shimmer" style={{ height: "22px", width: "70px", borderRadius: "20px" }} />
              </div>
              <div className="inv__card-body" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="skeleton-shimmer" style={{ height: "14px", width: "140px", borderRadius: "4px" }} />
                <div className="skeleton-shimmer" style={{ height: "12px", width: "100px", borderRadius: "4px" }} />
              </div>
              <div className="inv__card-footer" style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between' }}>
                <div className="skeleton-shimmer" style={{ height: "20px", width: "60px", borderRadius: "6px" }} />
                <div className="skeleton-shimmer" style={{ height: "30px", width: "120px", borderRadius: "8px" }} />
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (filtered.length === 0) {
      return (
        <div className="inv__empty">
          <span>🧾</span>
          <p>No invoices found</p>
        </div>
      );
    }

    return (
      <div className="inv__cards-list">
        {filtered.map((order) => {
          const statusCfg = STATUS_COLORS[order.status] || STATUS_COLORS.Pending;
          const orderShortId = order.id
            ? "#" + String(order.id).slice(-8).toUpperCase()
            : "#UNKNOWN";
          const orderDate = order.order_date
            ? new Date(order.order_date).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
            : "N/A";

          const isPrinted = Boolean(order.invoice_printed);

          return (
            <div
              key={order.id}
              className={`inv__card ${isPrinted ? "inv__card--printed" : ""}`}
            >
              <div className="inv__card-header">
                <span
                  className="inv__order-id inv__order-id--clickable"
                  onClick={() => handleOpenPreview(order)}
                  title="Click to preview invoice"
                >
                  {orderShortId}
                </span>
                <div className="inv__card-badges">
                  <span
                    className="inv__status-badge"
                    style={{ background: statusCfg.bg, color: statusCfg.color }}
                  >
                    {order.status}
                  </span>
                  {isPrinted ? (
                    <button
                      className="inv__printed-tag inv__printed-tag--toggle"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePrintedStatus(order);
                      }}
                      title="Click to manually mark as Unprinted"
                    >
                      ✓ Printed ↩
                    </button>
                  ) : (
                    <button
                      className="inv__unprinted-tag"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePrintedStatus(order);
                      }}
                      title="Click to manually mark as Printed"
                    >
                      ○ Mark Printed
                    </button>
                  )}
                </div>
              </div>

              <div className="inv__card-body">
                <div className="inv__card-customer">
                  <span className="inv__customer-name">
                    {order.customer?.name || "N/A"}
                  </span>
                  {order.customer?.phone && (
                    <span className="inv__customer-phone">
                      {order.customer?.phone}
                    </span>
                  )}
                </div>
                {/* Product names under customer info */}
                {(() => {
                  const items = order.order_items || [];
                  const names = items.map(i => i.product_name || i.name || 'Product').filter(Boolean);
                  if (names.length === 0) return null;
                  const display = names.length > 2
                    ? names.slice(0, 2).join(', ') + ` +${names.length - 2} more`
                    : names.join(', ');
                  return (
                    <div className="inv__card-products" title={names.join('\n')}>
                      🛍️ {display}
                    </div>
                  );
                })()}
                <div className="inv__card-date">
                  <span className="inv__card-label">Date:</span> {orderDate}
                </div>
              </div>

              <div className="inv__card-footer">
                <div className="inv__card-footer-left">
                  <span className="inv__payment-badge">{order.payment || "COD"}</span>
                  <span className="inv__card-total">
                    ₹{Number(order.total_price || 0).toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="inv__action-group">
                  <button
                    className="inv__preview-btn"
                    onClick={() => handleOpenPreview(order)}
                    title="Preview invoice receipt"
                  >
                    <span>👁️</span>
                  </button>
                  <button
                    className={`inv__print-btn ${isPrinted ? "inv__print-btn--reprint" : ""}`}
                    onClick={() => triggerPrintBatch([order])}
                    disabled={isPrinting}
                    title={isPrinted ? "Print invoice again" : "Print invoice"}
                  >
                    <span>🖨️</span> {isPrinted ? "Reprint" : "Print"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="inv">
      {/* Toast Alert */}
      {toast && (
        <div className={`inv__toast inv__toast--${toast.type}`}>
          <span className="inv__toast-icon">
            {toast.type === "success" ? "✅" : toast.type === "error" ? "⚠️" : "🔔"}
          </span>
          <span className="inv__toast-msg">{toast.message}</span>
          <button className="inv__toast-close" onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {/* Header */}
      <div className="inv__header">
        <div>
          <h1 className="inv__title">Invoices & Printing</h1>
          <p className="inv__subtitle">
            Thermal 4x6 (100x150mm) receipts for orders. Printed invoices cannot be reprinted.
          </p>
        </div>

        {/* Master Print All Together & Auto-Print Toggle */}
        <div className="inv__header-actions">
          <button
            className={`inv__auto-toggle ${autoPrint ? "inv__auto-toggle--active" : ""}`}
            onClick={handleToggleAutoPrint}
            title={autoPrint ? "Click to pause auto-printing" : "Click to enable auto-printing"}
          >
            <span className={`inv__pulse-dot ${autoPrint ? "inv__pulse-dot--active" : ""}`} />
            Auto-Print: {autoPrint ? "ON" : "OFF"}
          </button>

          <button
            className="inv__master-print-btn"
            onClick={handlePrintAllPending}
            disabled={unprintedCount === 0 || isPrinting}
          >
            {isPrinting ? (
              <>
                <span className="inv__spin">⏳</span> Printing...
              </>
            ) : (
              <>
                <span>🖨️</span>
                <span>Print All Pending</span>
                {unprintedCount > 0 && (
                  <span className="inv__btn-badge">{unprintedCount}</span>
                )}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="inv__stats">
        <div className="inv__stat-card inv__stat-card--pending">
          <div className="inv__stat-num">{unprintedCount}</div>
          <div className="inv__stat-label">Pending to Print</div>
        </div>
        <div className="inv__stat-card inv__stat-card--done">
          <div className="inv__stat-num">{printedCount}</div>
          <div className="inv__stat-label">Already Printed</div>
        </div>
        <div className="inv__stat-card inv__stat-card--total">
          <div className="inv__stat-num">{localOrders.length}</div>
          <div className="inv__stat-label">Total Orders</div>
        </div>
      </div>

      {/* Status banner */}
      <div className="inv__status-banner">
        <div className="inv__status-banner-left">
          <span className="inv__status-banner-indicator">
            {autoPrint ? "🟢" : "⚪"}
          </span>
          <div>
            <strong>
              {autoPrint
                ? "Auto-Print Active"
                : "Auto-Print Paused"}
            </strong>
            <p>
              {autoPrint
                ? "As soon as any customer places an order, the thermal invoice will be generated and printed automatically."
                : "Auto-printing is paused. Use 'Print All Pending' to print waiting orders together in one go."}
            </p>
          </div>
        </div>
        {unprintedCount > 0 && (
          <button
            className="inv__status-banner-action"
            onClick={handlePrintAllPending}
            disabled={isPrinting}
          >
            Print {unprintedCount} Pending Invoice{unprintedCount > 1 ? "s" : ""}
          </button>
        )}
      </div>

      {/* Filters Toolbar */}
      <div className="inv__toolbar">
        <div className="inv__filter-tabs">
          <button
            className={`inv__tab ${filter === "all" ? "inv__tab--active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            className={`inv__tab ${filter === "unprinted" ? "inv__tab--active" : ""}`}
            onClick={() => setFilter("unprinted")}
          >
            Not Printed
            {unprintedCount > 0 && (
              <span className="inv__tab-badge">{unprintedCount}</span>
            )}
          </button>
          <button
            className={`inv__tab ${filter === "printed" ? "inv__tab--active" : ""}`}
            onClick={() => setFilter("printed")}
          >
            Printed
          </button>
        </div>

        <input
          className="inv__search"
          type="text"
          placeholder="Search by order ID, name, phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* ── Table (Desktop View >= 768px) ── */}
      <div className="inv__table-wrap inv__desktop-view">
        {/* Table Header */}
        <div className="inv__table-head">
          <div className="inv__col inv__col--id">Order ID</div>
          <div className="inv__col inv__col--customer">Customer</div>
          <div className="inv__col inv__col--products">Products</div>
          <div className="inv__col inv__col--date">Date</div>
          <div className="inv__col inv__col--total">Amount</div>
          <div className="inv__col inv__col--payment">Payment</div>
          <div className="inv__col inv__col--status">Status</div>
          <div className="inv__col inv__col--action">Action</div>
        </div>

        {/* Rows */}
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="inv__row inv__row--skeleton">
              <div
                className="skeleton-shimmer"
                style={{ height: "20px", width: "80%", borderRadius: "4px" }}
              />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="inv__empty">
            <span>🧾</span>
            <p>No invoices found</p>
          </div>
        ) : (
          filtered.map((order) => {
            const statusCfg = STATUS_COLORS[order.status] || STATUS_COLORS.Pending;
            const orderShortId = order.id
              ? "#" + String(order.id).slice(-8).toUpperCase()
              : "#UNKNOWN";
            const orderDate = order.order_date
              ? new Date(order.order_date).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
              : "N/A";

            const isPrinted = Boolean(order.invoice_printed);

            return (
              <div
                key={order.id}
                className={`inv__row ${isPrinted ? "inv__row--printed" : ""}`}
              >
                <div className="inv__col inv__col--id">
                  <span
                    className="inv__order-id inv__order-id--clickable"
                    onClick={() => handleOpenPreview(order)}
                    title="Click to preview invoice"
                  >
                    {orderShortId}
                  </span>
                </div>

                <div className="inv__col inv__col--customer">
                  <span className="inv__customer-name">
                    {order.customer?.name || "N/A"}
                  </span>
                  <span className="inv__customer-phone">
                    {order.customer?.phone || ""}
                  </span>
                </div>

                <div className="inv__col inv__col--products">
                  {(() => {
                    const items = order.order_items || [];
                    const names = items.map(i => i.product_name || i.name || 'Product').filter(Boolean);
                    if (names.length === 0) return <span className="inv__product-name-empty">—</span>;
                    const display = names.length > 2
                      ? names.slice(0, 2).join(', ') + ` +${names.length - 2} more`
                      : names.join(', ');
                    return (
                      <span className="inv__product-names" title={names.join('\n')}>
                        {display}
                      </span>
                    );
                  })()}
                </div>

                <div className="inv__col inv__col--date">{orderDate}</div>

                <div className="inv__col inv__col--total">
                  ₹{Number(order.total_price || 0).toLocaleString("en-IN")}
                </div>

                <div className="inv__col inv__col--payment">
                  <span className="inv__payment-badge">{order.payment || "COD"}</span>
                </div>

                <div className="inv__col inv__col--status">
                  <span
                    className="inv__status-badge"
                    style={{ background: statusCfg.bg, color: statusCfg.color }}
                  >
                    {order.status}
                  </span>
                  {isPrinted ? (
                    <button
                      className="inv__printed-tag inv__printed-tag--toggle"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePrintedStatus(order);
                      }}
                      title="Click to manually mark as Unprinted"
                    >
                      ✓ Printed ↩
                    </button>
                  ) : (
                    <button
                      className="inv__unprinted-tag"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePrintedStatus(order);
                      }}
                      title="Click to manually mark as Printed"
                    >
                      ○ Mark Printed
                    </button>
                  )}
                </div>

                <div className="inv__col inv__col--action">
                  <div className="inv__action-group">
                    <button
                      className="inv__preview-btn"
                      onClick={() => handleOpenPreview(order)}
                      title="Preview invoice receipt"
                    >
                      <span>👁️</span> Preview
                    </button>
                    <button
                      className={`inv__print-btn ${isPrinted ? "inv__print-btn--reprint" : ""}`}
                      onClick={() => triggerPrintBatch([order])}
                      disabled={isPrinting}
                      title={isPrinted ? "Print invoice again" : "Print invoice"}
                    >
                      <span>🖨️</span> {isPrinted ? "Print Again" : "Print"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Cards (Mobile View < 768px) ── */}
      <div className="inv__cards-wrap inv__mobile-view">
        {renderMobileCards()}
      </div>

      {/* Invoice Preview Modal */}
      {previewOrder && (
        <div className="inv__modal-overlay" onClick={() => setPreviewOrder(null)}>
          <div className="inv__modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="inv__modal-header">
              <div>
                <h3 className="inv__modal-title">Invoice Preview (4" × 6")</h3>
                <p className="inv__modal-subtitle">
                  Order #{String(previewOrder.id).slice(-8).toUpperCase()} · 100 × 150 mm
                </p>
              </div>
              <button
                className="inv__modal-close"
                onClick={() => setPreviewOrder(null)}
                aria-label="Close invoice preview"
              >
                ✕
              </button>
            </div>

            <div className="inv__modal-body">
              {previewLoadingAddress && (
                <div className="inv__preview-loading">
                  <span className="inv__spin">⏳</span> Fetching shipping details...
                </div>
              )}
              <ThermalInvoice
                order={previewOrder}
                address={previewAddress}
                isPreview={true}
              />
            </div>

            <div className="inv__modal-footer">
              <button
                className="inv__modal-close-btn"
                onClick={() => setPreviewOrder(null)}
              >
                Close
              </button>
              <button
                className={`inv__modal-status-btn ${previewOrder.invoice_printed ? "inv__modal-status-btn--unmark" : "inv__modal-status-btn--mark"}`}
                onClick={() => handleTogglePrintedStatus(previewOrder)}
                title="Manually change printed status"
              >
                {previewOrder.invoice_printed ? "↩️ Mark Unprinted" : "✓ Mark Printed"}
              </button>
              <button
                className="inv__modal-print-btn"
                onClick={() => triggerPrintBatch([previewOrder])}
                disabled={isPrinting}
              >
                {isPrinting ? (
                  <>
                    <span className="inv__spin">⏳</span> Printing...
                  </>
                ) : (
                  <>
                    <span>🖨️</span>{" "}
                    {previewOrder.invoice_printed ? "Print Again" : "Print Invoice"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden container used during printing — teleported to document.body to avoid dashboard overflow/clipping */}
      {printBatch && printBatch.length > 0 && typeof document !== "undefined" && createPortal(
        <div className="thermal-print-area">
          {printBatch.map((orderItem) => (
            <ThermalInvoice
              key={orderItem.id}
              order={orderItem}
              address={printAddresses[orderItem.id] || (previewOrder?.id === orderItem.id ? previewAddress : null)}
            />
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};

export default Invoices;
