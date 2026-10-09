import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useStore } from "../../hooks/useStore";
import { orderService } from "../../services/orderService";
import { isRevenueOrder } from "../../utils/orderUtils";
import Toast from "../../components/Toast";
import "./Allorders.css";

const STATUS_STYLE = {
  "Order Placed": { bg: "#E0F2FE", color: "#0369A1" },
  Pending: { bg: "#FFF4E5", color: "#D97706" },
  Shipped: { bg: "#EFF6FF", color: "#2563EB" },
  Delivered: { bg: "#F0FDF4", color: "#16A34A" },
  Confirmed: { bg: "#F5F3FF", color: "#7C3AED" },
  Return: { bg: "#FEF2F2", color: "#DC2626" },
  Returned: { bg: "#FEF2F2", color: "#DC2626" },
  Cancelled: { bg: "#FEF2F2", color: "#DC2626" },
};

const PAYMENT_STYLE = {
  Paid: { bg: "#F0FDF4", color: "#16A34A" },
  COD: { bg: "#FFF4E5", color: "#D97706" },
};

const CATEGORIES = ["All Category", "Necklaces", "Earrings", "Rings", "Bracelets"];
const STATUSES = ["All Status", "To Pack / Needs Action", "Paid", "Order Placed", "Confirmed", "Shipped", "Delivered", "Cancelled", "Returned"];
const PER_PAGE = 6;

/* ── Icons ── */
const ChevronDownIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const FilterIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="8" y1="12" x2="16" y2="12" />
    <line x1="11" y1="18" x2="13" y2="18" />
  </svg>
);

const EnvelopeClosedIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const EnvelopeOpenIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z" />
    <path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10" />
  </svg>
);

const SearchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const EmptyBoxIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const SpinnerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2.5" strokeLinecap="round">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">
      <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
    </path>
  </svg>
);

/* ── Skeleton row ── */
const SkeletonRow = () => (
  <tr className="ao__skeleton-row">
    <td><div className="ao__skeleton" style={{ width: 14, height: 14, borderRadius: 3 }} /></td>
    <td><div className="ao__skeleton" style={{ width: 90 }} /></td>
    <td><div className="ao__skeleton" style={{ width: 110 }} /></td>
    <td className="ao__col-items"><div className="ao__skeleton" style={{ width: 24 }} /></td>
    <td><div className="ao__skeleton" style={{ width: 60 }} /></td>
    <td className="ao__col-payment"><div className="ao__skeleton" style={{ width: 48, borderRadius: 20 }} /></td>
    <td><div className="ao__skeleton" style={{ width: 70, borderRadius: 20 }} /></td>
    <td><div className="ao__skeleton" style={{ width: 48, borderRadius: 6 }} /></td>
  </tr>
);

/* ── Dropdown ── */
const FilterDropdown = ({ value, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [open]);

  return (
    <div className="ao__dd" ref={dropdownRef}>
      <button className="ao__dd-btn" onClick={() => setOpen((o) => !o)}>
        <span>{value}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="ao__dd-menu">
          {options.map((opt) => (
            <div
              key={opt}
              className={`ao__dd-item${value === opt ? " ao__dd-item--active" : ""}`}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ── Main Component ── */
const AllOrders = ({ orders = [], products = [], loading, error = null, onViewDetail }) => {
  const [category, setCategory] = useState("All Category");
  const [status, setStatus] = useState("All Status");
  const [paymentFilter, setPaymentFilter] = useState("All Payment");
  const [readFilter, setReadFilter] = useState("all"); // "all" | "unread"
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState("all");

  const markOrdersRead = useStore((state) => state.markOrdersRead);
  const fetchNewOrdersCount = useStore((state) => state.fetchNewOrdersCount);
  const newOrdersCount = useStore((state) => state.newOrdersCount);

  const toPackCount = useMemo(() => {
    return orders.filter((o) => {
      const s = (o.status || "").toLowerCase().trim();
      return !o.is_packed && !["cancelled", "canceled", "delivered", "refund completed"].includes(s);
    }).length;
  }, [orders]);

  const [toast, setToast] = useState({ message: "", type: "" });
  const showToast = (message, type = "info") => {
    setToast({ message: "", type: "" });
    setTimeout(() => setToast({ message, type }), 10);
  };

  const categoryOptions = useMemo(() => {
    const staticCats = ["All Category", "Necklaces", "Earrings", "Rings", "Bracelets", "Bangles"];
    const unique = new Set([
      ...staticCats,
      ...products
        .map((p) => p.category)
        .filter((c) => c && typeof c === "string" && c.trim() !== "")
    ]);
    return Array.from(unique);
  }, [products]);

  const PAYMENT_OPTIONS = ["All Payment", "Paid", "COD"];

  /* ── Derived lists ── */
  const displayOrders = activeTab === "return"
    ? orders.filter((o) => o.type?.toLowerCase() === "return")
    : orders;

  const filtered = displayOrders.filter((o) => {
    const matchCategory = (() => {
      if (category === "All Category") return true;
      const baseItemName = o.item_name?.split(" + ")[0] || "";
      const product = products.find((p) => p.name?.toLowerCase() === baseItemName.toLowerCase());
      const categoryName = product?.category || "Uncategorized";
      return categoryName.toLowerCase() === category.toLowerCase();
    })();

    const matchStatus = (() => {
      if (status === "All Status") return true;
      if (status === "To Pack / Needs Action") {
        const s = (o.status || "").toLowerCase().trim();
        return !["shipped", "delivered", "cancelled", "canceled", "returned", "return", "refund completed"].includes(s);
      }
      if (status.toLowerCase() === "returned") {
        return o.status?.toLowerCase() === "return" || o.status?.toLowerCase() === "returned";
      }
      return o.status?.toLowerCase() === status.toLowerCase();
    })();

    const matchPayment = (() => {
      if (paymentFilter === "All Payment") return true;
      return o.payment?.toUpperCase() === paymentFilter.toUpperCase();
    })();

    const matchSearch =
      !search ||
      (o.id || "").toLowerCase().includes(search.toLowerCase()) ||
      (o.customer?.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (o.customer?.email || "").toLowerCase().includes(search.toLowerCase()) ||
      (o.item_name || "").toLowerCase().includes(search.toLowerCase());

    const matchRead = (() => {
      if (readFilter === "unread") return o.admin_read === false;
      if (readFilter === "to_pack") {
        const s = (o.status || "").toLowerCase().trim();
        return !o.is_packed && !["cancelled", "canceled", "delivered", "refund completed"].includes(s);
      }
      return true;
    })();

    return matchCategory && matchStatus && matchPayment && matchSearch && matchRead;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const count = (s) => {
    if (s.toLowerCase() === "return" || s.toLowerCase() === "returned") {
      return orders.filter((o) => o.status?.toLowerCase() === "return" || o.status?.toLowerCase() === "returned").length;
    }
    return orders.filter((o) => o.status?.toLowerCase() === s.toLowerCase()).length;
  };

  /* ── Selection ── */
  const toggleRow = (id) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const allChecked = paginated.length > 0 && paginated.every((o) => selected.includes(o.id));

  const toggleAll = () =>
    setSelected(allChecked
      ? selected.filter((id) => !paginated.find((o) => o.id === id))
      : [...new Set([...selected, ...paginated.map((o) => o.id)])]);

  /* ── Pagination numbers ── */
  const pageNums = () => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const p = safePage;
    if (p <= 3) return [1, 2, 3, "…", totalPages];
    if (p >= totalPages - 2) return [1, "…", totalPages - 2, totalPages - 1, totalPages];
    return [1, "…", p, "…", totalPages];
  };

  /* ── Stats helpers ── */
  const revenue = orders
    .filter(isRevenueOrder)
    .reduce((s, o) => s + Number(o.total_price || 0), 0);

  const fmtRevenue = (v) => {
    if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
    if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
    return `₹${v.toLocaleString('en-IN')}`;
  };

  const fulfillmentRate = orders.length > 0
    ? Math.round((count('Delivered') / orders.length) * 100)
    : 0;

  const codCount = orders.filter(o => o.payment?.toUpperCase() === 'COD').length;
  const paidCount = orders.filter(o => o.payment?.toUpperCase() === 'PAID').length;

  // Unfulfilled orders that need packing/shipping (Pending, Confirmed, Order Placed, Paid, or Pickup Cancelled)
  const actionNeeded = orders.filter(o => {
    const s = (o.status || '').toLowerCase().trim();
    if (['shipped', 'delivered', 'cancelled', 'canceled', 'returned', 'return', 'refund completed'].includes(s)) {
      return false;
    }
    return true;
  }).length;
  const inTransit = count('Shipped');
  const problems = count('Cancelled') + count('Returned');

  const hasActiveFilters = category !== "All Category" || status !== "All Status" || paymentFilter !== "All Payment" || readFilter !== "all" || search !== "";

  const handleResetFilters = () => {
    setCategory("All Category");
    setStatus("All Status");
    setPaymentFilter("All Payment");
    setReadFilter("all");
    setSearch("");
    setPage(1);
  };

  const handleBulkMarkRead = async (read) => {
    if (selected.length === 0 || bulkLoading) return;
    const count = selected.length;
    try {
      setBulkLoading(true);
      if (typeof markOrdersRead === "function") {
        await markOrdersRead(selected, read);
      } else {
        await orderService.setOrdersRead(selected, read);
      }
      setSelected([]);
      if (typeof fetchNewOrdersCount === "function") fetchNewOrdersCount();
      showToast(read ? `${count} ${count === 1 ? 'order' : 'orders'} marked as read` : `${count} ${count === 1 ? 'order' : 'orders'} marked as unread`, "success");
    } catch (err) {
      console.error("Bulk mark read failed:", err);
      showToast("Failed to update orders: " + (err?.message || "Unknown error"), "error");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleToggleSingleRead = async (orderId, read) => {
    try {
      if (typeof markOrdersRead === "function") {
        await markOrdersRead([orderId], read);
      } else {
        await orderService.setOrdersRead([orderId], read);
      }
      if (typeof fetchNewOrdersCount === "function") fetchNewOrdersCount();
      showToast(read ? "Order marked as read" : "Order marked as unread", "success");
    } catch (err) {
      console.error("Toggle read failed:", err);
      showToast("Failed to update order: " + (err?.message || "Unknown error"), "error");
    }
  };


  const renderBody = () => {
    if (loading) {
      return Array.from({ length: PER_PAGE }).map((_, i) => <SkeletonRow key={i} />);
    }

    if (error) {
      return (
        <tr>
          <td colSpan={8} className="ao__empty">
            <div className="ao__empty-state">
              <div className="ao__empty-icon ao__empty-icon--error">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <p className="ao__empty-title">Something went wrong</p>
              <p className="ao__empty-desc">{error}</p>
            </div>
          </td>
        </tr>
      );
    }

    if (orders.length === 0) {
      return (
        <tr>
          <td colSpan={8} className="ao__empty">
            <div className="ao__empty-state">
              <div className="ao__empty-icon">
                <EmptyBoxIcon />
              </div>
              <p className="ao__empty-title">No orders yet</p>
              <p className="ao__empty-desc">
                Orders from your customers will appear here once they start coming in.
              </p>
            </div>
          </td>
        </tr>
      );
    }

    if (paginated.length === 0) {
      return (
        <tr>
          <td colSpan={8} className="ao__empty">
            <div className="ao__empty-state ao__empty-state--sm">
              <p className="ao__empty-title">No orders match your filters</p>
              <p className="ao__empty-desc">Try adjusting your search or filter criteria.</p>
            </div>
          </td>
        </tr>
      );
    }

    return paginated.map((order) => {
      const ss = STATUS_STYLE[order.status] || { bg: "#FFF4E5", color: "#D97706" };
      const ps = PAYMENT_STYLE[order.payment] || { bg: "#FFF4E5", color: "#D97706" };
      const sel = selected.includes(order.id);
      const isUnread = order.admin_read === false;

      return (
        <tr
          key={order.id}
          className={`ao__row${sel ? " ao__row--selected" : ""}${isUnread ? " ao__row--unread" : " ao__row--read"}`}
        >
          <td className="ao__td-check">
            <input
              type="checkbox"
              className="ao__checkbox"
              checked={sel}
              onChange={() => toggleRow(order.id)}
            />
          </td>
          <td className="ao__cell-id">
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              {isUnread && <span className="ao__unread-dot" title="Unread order" />}
              <span style={{ fontWeight: isUnread ? "700" : "500" }}>
                #{order.id?.slice(-6) || order.id}
              </span>
            </div>
          </td>
          <td className="ao__cell-customer">
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span className="ao__cell-customer-name" style={{ fontWeight: isUnread ? "700" : "500", color: isUnread ? "#000" : "inherit" }}>
                {order.customer?.name || "Unknown"}
              </span>
              <span style={{ fontSize: "11px", color: "#888" }}>{order.customer?.email || ""}</span>
            </div>
          </td>
          <td className="ao__cell-items ao__col-items">{order.item_name} {order.quantity > 1 ? `x${order.quantity}` : ""}</td>
          <td className="ao__cell-total">₹{Number(order.total_price || 0).toLocaleString("en-IN")}</td>
          <td className="ao__col-payment">
            <span className="ao__badge" style={{ background: ps.bg, color: ps.color }}>
              {order.payment}
            </span>
          </td>
          <td>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <span className="ao__badge" style={{ background: ss.bg, color: ss.color }}>
                {order.status}
              </span>
              {!["cancelled", "canceled", "delivered"].includes((order.status || "").toLowerCase()) && (
                <span className={`ao__pack-chip ${order.is_packed ? "ao__pack-chip--packed" : "ao__pack-chip--topack"}`}>
                  {order.is_packed ? "Packed" : "To pack"}
                </span>
              )}
            </div>
          </td>
          <td>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <button
                type="button"
                className="ao__read-icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleSingleRead(order.id, !isUnread);
                }}
                title={isUnread ? "Mark as read" : "Mark as unread"}
                aria-label={isUnread ? "Mark as read" : "Mark as unread"}
              >
                {isUnread ? <EnvelopeOpenIcon /> : <EnvelopeClosedIcon />}
              </button>
              <button
                className="ao__view-btn"
                onClick={() => {
                  try {
                    sessionStorage.setItem(`anika_opened_from_list_${order.id}`, "true");
                  } catch (_) {}
                  onViewDetail?.(order);
                }}
              >
                View
              </button>
            </div>
          </td>
        </tr>
      );
    });
  };

  const renderMobileCards = () => {
    if (loading) {
      return (
        <div className="ao__cards-list">
          {Array.from({ length: PER_PAGE }).map((_, i) => (
            <div key={i} className="ao__card ao__card--skeleton">
              <div className="ao__card-header">
                <div className="ao__skeleton" style={{ width: 90, height: 16 }} />
                <div className="ao__skeleton" style={{ width: 70, height: 22, borderRadius: 20 }} />
              </div>
              <div className="ao__card-body">
                <div className="ao__skeleton" style={{ width: 140, height: 14 }} />
                <div className="ao__skeleton" style={{ width: 200, height: 12 }} />
              </div>
              <div className="ao__card-footer">
                <div className="ao__skeleton" style={{ width: 50, height: 20, borderRadius: 20 }} />
                <div className="ao__skeleton" style={{ width: 70, height: 28, borderRadius: 6 }} />
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div className="ao__empty-state">
          <div className="ao__empty-icon ao__empty-icon--error">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className="ao__empty-title">Something went wrong</p>
          <p className="ao__empty-desc">{error}</p>
        </div>
      );
    }

    if (orders.length === 0) {
      return (
        <div className="ao__empty-state">
          <div className="ao__empty-icon">
            <EmptyBoxIcon />
          </div>
          <p className="ao__empty-title">No orders yet</p>
          <p className="ao__empty-desc">
            Orders from your customers will appear here once they start coming in.
          </p>
        </div>
      );
    }

    if (paginated.length === 0) {
      return (
        <div className="ao__empty-state ao__empty-state--sm">
          <p className="ao__empty-title">No orders match your filters</p>
          <p className="ao__empty-desc">Try adjusting your search or filter criteria.</p>
        </div>
      );
    }

    return (
      <>
        <div className="ao__mobile-select-bar">
          <label className="ao__mobile-select-label">
            <input
              type="checkbox"
              className="ao__checkbox"
              checked={allChecked}
              onChange={toggleAll}
              disabled={loading || paginated.length === 0}
            />
            <span>Select Page ({paginated.length})</span>
          </label>
          {selected.length > 0 && (
            <span className="ao__mobile-selected-badge">{selected.length} selected</span>
          )}
        </div>
        <div className="ao__cards-list">
          {paginated.map((order) => {
            const ss = STATUS_STYLE[order.status] || { bg: "#FFF4E5", color: "#D97706" };
            const ps = PAYMENT_STYLE[order.payment] || { bg: "#FFF4E5", color: "#D97706" };
            const sel = selected.includes(order.id);
            const isUnread = order.admin_read === false;
            return (
              <div key={order.id} className={`ao__card${sel ? " ao__card--selected" : ""}${isUnread ? " ao__card--unread" : ""}`}>
                <div className="ao__card-header">
                  <div className="ao__card-header-left">
                    <input
                      type="checkbox"
                      className="ao__checkbox"
                      checked={sel}
                      onChange={() => toggleRow(order.id)}
                    />
                    {isUnread && <span className="ao__unread-dot" title="Unread" />}
                    <span className="ao__card-id" style={{ fontWeight: isUnread ? "700" : "600", color: isUnread ? "#000" : "inherit" }}>
                      #{order.id?.slice(-6) || order.id}
                    </span>
                  </div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <button
                      type="button"
                      className="ao__read-icon-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSingleRead(order.id, !isUnread);
                      }}
                      title={isUnread ? "Mark as read" : "Mark as unread"}
                      aria-label={isUnread ? "Mark as read" : "Mark as unread"}
                    >
                      {isUnread ? <EnvelopeOpenIcon /> : <EnvelopeClosedIcon />}
                    </button>
                    <span className="ao__badge" style={{ background: ss.bg, color: ss.color }}>
                      {order.status}
                    </span>
                    {!["cancelled", "canceled", "delivered"].includes((order.status || "").toLowerCase()) && (
                      <span className={`ao__pack-chip ${order.is_packed ? "ao__pack-chip--packed" : "ao__pack-chip--topack"}`}>
                        {order.is_packed ? "Packed" : "To pack"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="ao__card-body">
                  <div className="ao__card-customer">
                    <span className="ao__card-customer-name" style={{ fontWeight: isUnread ? "700" : "600", color: isUnread ? "#000" : "inherit" }}>
                      {order.customer?.name || "Unknown"}
                    </span>
                    {order.customer?.email && (
                      <span className="ao__card-customer-email">{order.customer?.email}</span>
                    )}
                  </div>
                  <div className="ao__card-items">
                    <span className="ao__card-items-text">
                      {order.item_name} {order.quantity > 1 ? `x${order.quantity}` : ''}
                    </span>
                  </div>
                </div>
                <div className="ao__card-footer">
                  <div className="ao__card-footer-left">
                    <span className="ao__badge" style={{ background: ps.bg, color: ps.color }}>
                      {order.payment}
                    </span>
                    <span className="ao__card-total">₹{Number(order.total_price || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <button
                    className="ao__view-btn"
                    onClick={() => {
                      try {
                        sessionStorage.setItem(`anika_opened_from_list_${order.id}`, "true");
                      } catch (_) {}
                      onViewDetail?.(order);
                    }}
                  >
                    View Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <div className="ao">

      {/* ── Page header ── */}
      <div className="ao__page-header">
        <div className="ao__page-title-block">
          <h1 className="ao__title">All Orders</h1>
          <p className="ao__subtitle">
            {loading ? "Loading…" : `${filtered.length} Orders`}
          </p>
        </div>
      </div>

      {/* ── Stats grid ── */}
      <div className="ao__stats-grid">

        {/* KPI row */}
        <div className="ao__kpi-row">

          {/* Total Orders + Revenue */}
          <div className="ao__kpi-card ao__kpi-card--orders">
            <div className="ao__kpi-top">
              <span className="ao__kpi-icon">📦</span>
              <span className="ao__kpi-label">Total Orders</span>
            </div>
            <div className={`ao__kpi-value${loading ? ' ao__kpi-value--loading' : ''}`}>
              {loading ? '—' : orders.length.toLocaleString()}
            </div>
            <div className="ao__kpi-sub">
              Revenue: <strong>{loading ? '—' : fmtRevenue(revenue)}</strong>
            </div>
            <div className="ao__kpi-bar">
              <div className="ao__kpi-bar-fill" style={{ width: '100%', background: '#6366f1' }} />
            </div>
          </div>

          {/* Action needed */}
          <div
            className="ao__kpi-card ao__kpi-card--action"
            style={{ cursor: "pointer" }}
            onClick={() => { setStatus("To Pack / Needs Action"); setPage(1); }}
            title="Click to view all unfulfilled orders needing action"
          >
            <div className="ao__kpi-top">
              <span className="ao__kpi-icon">⏳</span>
              <span className="ao__kpi-label">To Pack / Needs Action</span>
            </div>
            <div className={`ao__kpi-value${loading ? ' ao__kpi-value--loading' : ''}`}>
              {loading ? '—' : actionNeeded}
            </div>
            <div className="ao__kpi-sub" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {count('Paid') > 0 && <span className="ao__kpi-chip ao__kpi-chip--confirmed">{count('Paid')} Paid</span>}
              {count('Order Placed') > 0 && <span className="ao__kpi-chip ao__kpi-chip--pending">{count('Order Placed')} Placed</span>}
              {count('Pending') > 0 && <span className="ao__kpi-chip ao__kpi-chip--pending">{count('Pending')} Pending</span>}
              {count('Confirmed') > 0 && <span className="ao__kpi-chip ao__kpi-chip--confirmed">{count('Confirmed')} Confirmed</span>}
            </div>
            <div className="ao__kpi-bar">
              <div className="ao__kpi-bar-fill" style={{
                width: orders.length ? `${(actionNeeded / orders.length) * 100}%` : '0%',
                background: '#f59e0b'
              }} />
            </div>
          </div>

          {/* In Transit */}
          <div className="ao__kpi-card ao__kpi-card--transit">
            <div className="ao__kpi-top">
              <span className="ao__kpi-icon">🚚</span>
              <span className="ao__kpi-label">In Transit</span>
            </div>
            <div className={`ao__kpi-value${loading ? ' ao__kpi-value--loading' : ''}`}>
              {loading ? '—' : inTransit}
            </div>
            <div className="ao__kpi-sub">
              Delivered: <strong>{loading ? '—' : count('Delivered')}</strong>
              &nbsp;·&nbsp; Rate: <strong>{loading ? '—' : `${fulfillmentRate}%`}</strong>
            </div>
            <div className="ao__kpi-bar">
              <div className="ao__kpi-bar-fill" style={{
                width: `${fulfillmentRate}%`,
                background: '#10b981'
              }} />
            </div>
          </div>

          {/* Payment split */}
          <div className="ao__kpi-card ao__kpi-card--payment">
            <div className="ao__kpi-top">
              <span className="ao__kpi-icon">💳</span>
              <span className="ao__kpi-label">Payment Split</span>
            </div>
            <div className={`ao__kpi-value${loading ? ' ao__kpi-value--loading' : ''}`}>
              {loading ? '—' : `${paidCount} / ${codCount}`}
            </div>
            <div className="ao__kpi-sub">
              <span className="ao__kpi-chip ao__kpi-chip--paid">{loading ? '—' : paidCount} Paid</span>
              <span className="ao__kpi-chip ao__kpi-chip--cod">{loading ? '—' : codCount} COD</span>
            </div>
            <div className="ao__kpi-bar">
              <div className="ao__kpi-bar-split">
                <div style={{ flex: paidCount || 0, background: '#10b981' }} />
                <div style={{ flex: codCount || 0, background: '#f59e0b' }} />
              </div>
            </div>
          </div>

        </div>

        {/* Status pill row */}
        <div className="ao__pill-row">
          {[
            { label: 'Pending', val: count('Pending'), color: '#f59e0b', bg: '#fffbeb' },
            { label: 'Confirmed', val: count('Confirmed'), color: '#7c3aed', bg: '#f5f3ff' },
            { label: 'Shipped', val: count('Shipped'), color: '#2563eb', bg: '#eff6ff' },
            { label: 'Delivered', val: count('Delivered'), color: '#16a34a', bg: '#f0fdf4' },
            { label: 'Cancelled', val: count('Cancelled'), color: '#dc2626', bg: '#fef2f2' },
            { label: 'Returned', val: count('Returned'), color: '#dc2626', bg: '#fef2f2' },
          ].map(({ label, val, color, bg }) => {
            const isActive = status.toLowerCase() === label.toLowerCase();
            return (
              <div
                key={label}
                className={`ao__pill${isActive ? ' ao__pill--active' : ''}`}
                style={{
                  '--pill-color': color,
                  '--pill-bg': bg,
                  cursor: 'pointer',
                  outline: isActive ? `2px solid ${color}` : 'none',
                  outlineOffset: '-1px'
                }}
                onClick={() => {
                  setStatus(isActive ? "All Status" : label);
                  setPage(1);
                }}
                title={`Filter by ${label}`}
              >
                <span className="ao__pill-dot" />
                <span className="ao__pill-label">{label}</span>
                <span className={`ao__pill-val${loading ? ' ao__pill-val--loading' : ''}`}>
                  {loading ? '—' : val}
                </span>
              </div>
            );
          })}
        </div>

      </div>


      {/* ── Toolbar ── */}
      <div className="ao__toolbar">
        {/* Read / Unread / To Pack Tabs */}
        <div className="ao__read-tabs">
          <button
            type="button"
            className={`ao__read-tab${readFilter === "all" ? " ao__read-tab--active" : ""}`}
            onClick={() => { setReadFilter("all"); setPage(1); }}
          >
            All
          </button>
          <button
            type="button"
            className={`ao__read-tab${readFilter === "unread" ? " ao__read-tab--active" : ""}`}
            onClick={() => { setReadFilter("unread"); setPage(1); }}
          >
            <span className="ao__unread-tab-dot" />
            Unread ({newOrdersCount})
          </button>
          <button
            type="button"
            className={`ao__read-tab${readFilter === "to_pack" ? " ao__read-tab--active" : ""}`}
            onClick={() => { setReadFilter("to_pack"); setPage(1); }}
          >
            <span className="ao__topack-tab-dot" />
            To Pack ({toPackCount})
          </button>
        </div>

        <FilterDropdown value={category} options={categoryOptions} onChange={(v) => { setCategory(v); setPage(1); }} />
        <FilterDropdown value={status} options={STATUSES} onChange={(v) => { setStatus(v); setPage(1); }} />
        <FilterDropdown value={paymentFilter} options={PAYMENT_OPTIONS} onChange={(v) => { setPaymentFilter(v); setPage(1); }} />

        <button
          className={`ao__filter-btn${filterPanelOpen || hasActiveFilters ? ' ao__filter-btn--active' : ''}`}
          onClick={() => setFilterPanelOpen(o => !o)}
          style={hasActiveFilters ? { background: '#f5f3ff', color: '#4f46e5', borderColor: '#c7d2fe' } : {}}
        >
          <FilterIcon />
          <span>Filter{hasActiveFilters ? ` (Active)` : ''}</span>
          <ChevronDownIcon />
        </button>

        {hasActiveFilters && (
          <button className="ao__filter-btn" onClick={handleResetFilters} style={{ background: '#fef2f2', color: '#ef4444', borderColor: '#fca5a5' }}>
            Clear Filters
          </button>
        )}

        <div className="ao__search">
          <SearchIcon />
          <input
            className="ao__search-input"
            placeholder="Search orders (ID, Customer, Item)"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {/* Expanded Filter Panel */}
      {filterPanelOpen && (
        <div className="ao__filter-panel" style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
          background: '#fff',
          padding: '12px 16px',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          marginBottom: '16px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#666' }}>Category</span>
            <FilterDropdown value={category} options={categoryOptions} onChange={(v) => { setCategory(v); setPage(1); }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#666' }}>Status</span>
            <FilterDropdown value={status} options={STATUSES} onChange={(v) => { setStatus(v); setPage(1); }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#666' }}>Payment Method</span>
            <FilterDropdown value={paymentFilter} options={PAYMENT_OPTIONS} onChange={(v) => { setPaymentFilter(v); setPage(1); }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', marginLeft: 'auto', gap: '8px', paddingTop: '16px' }}>
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                style={{
                  padding: '6px 12px',
                  fontSize: '12.5px',
                  background: '#fef2f2',
                  color: '#ef4444',
                  border: '1px solid #fca5a5',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                Reset All Filters
              </button>
            )}
            <button
              onClick={() => setFilterPanelOpen(false)}
              style={{
                padding: '6px 12px',
                fontSize: '12.5px',
                background: '#111',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              Close Panel
            </button>
          </div>
        </div>
      )}

      {/* ── Bulk Actions Bar (Gmail style) ── */}
      {selected.length > 0 && (
        <div className="ao__bulk-bar">
          <span className="ao__bulk-count"><strong>{selected.length}</strong> selected</span>
          <button
            type="button"
            className="ao__bulk-btn"
            onClick={() => handleBulkMarkRead(true)}
            disabled={bulkLoading}
          >
            <EnvelopeOpenIcon />
            <span>Mark as read</span>
          </button>
          <button
            type="button"
            className="ao__bulk-btn"
            onClick={() => handleBulkMarkRead(false)}
            disabled={bulkLoading}
          >
            <EnvelopeClosedIcon />
            <span>Mark as unread</span>
          </button>
          <button
            type="button"
            className="ao__bulk-btn ao__bulk-btn--clear"
            onClick={() => setSelected([])}
          >
            Deselect all
          </button>
        </div>
      )}

      {/* ── Table (Desktop View >= 768px) ── */}
      <div className="ao__table-wrap ao__desktop-view">
        <table className="ao__table">
          <thead>
            <tr>
              <th className="ao__th-check">
                <input
                  type="checkbox"
                  className="ao__checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  disabled={loading || paginated.length === 0}
                />
              </th>
              <th>Order ID</th>
              <th>Customer</th>
              <th className="ao__col-items">Items</th>
              <th>Total</th>
              <th className="ao__col-payment">Payment</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>{renderBody()}</tbody>
        </table>
      </div>

      {/* ── Cards (Mobile View < 768px) ── */}
      <div className="ao__cards-wrap ao__mobile-view">
        {renderMobileCards()}
      </div>

      {/* ── Footer ── */}
      <div className="ao__footer">
        <span className="ao__showing">
          {loading
            ? <span className="ao__loading-text"><SpinnerIcon /> Loading orders…</span>
            : filtered.length === 0
              ? "No orders to show"
              : `Showing ${(safePage - 1) * PER_PAGE + 1}–${Math.min(safePage * PER_PAGE, filtered.length)} of ${filtered.length} orders`
          }
        </span>
        {!loading && filtered.length > 0 && (
          <div className="ao__pagination">
            <button
              className="ao__pg-arrow"
              disabled={safePage === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeftIcon />
            </button>
            {pageNums().map((n, i) =>
              n === "…" ? (
                <span key={`e${i}`} className="ao__pg-ellipsis">…</span>
              ) : (
                <button
                  key={n}
                  className={`ao__pg-num${safePage === n ? " ao__pg-num--active" : ""}`}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              )
            )}
            <button
              className="ao__pg-arrow"
              disabled={safePage === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRightIcon />
            </button>
          </div>
        )}
      </div>

      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: "", type: "" })}
      />
    </div>
  );
};

export default AllOrders;