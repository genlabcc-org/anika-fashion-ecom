import React, { useState } from "react";
import Toast from "../../components/Toast";
import ExportOrdersModal from "../components/ExportOrdersModal";
import { useAdmin } from "../../hooks/useAdmin";
import { useStore } from "../../hooks/useStore";
import "./Allcustomers.css";

const ROWS_PER_PAGE = 10;

const ChevronDown = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

/* ── Skeleton row ── */
const SkeletonCustomerRow = () => (
  <tr className="ac__tr">
    <td className="ac__td ac__td--check"><div className="skeleton-shimmer" style={{ width: 14, height: 14, borderRadius: 3 }} /></td>
    <td className="ac__td ac__td--name">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div className="skeleton-shimmer" style={{ width: 120, height: 14, borderRadius: '4px' }} />
        <div className="skeleton-shimmer" style={{ width: 80, height: 10, borderRadius: '4px' }} />
      </div>
    </td>
    <td className="ac__td ac__td--contact ac__td--hide-sm">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div className="skeleton-shimmer" style={{ width: 140, height: 12, borderRadius: '4px' }} />
        <div className="skeleton-shimmer" style={{ width: 90, height: 12, borderRadius: '4px' }} />
      </div>
    </td>
    <td className="ac__td ac__td--center ac__td--hide-md"><div className="skeleton-shimmer" style={{ width: 24, height: 12, margin: 'auto', borderRadius: '4px' }} /></td>
    <td className="ac__td ac__td--center ac__td--hide-md"><div className="skeleton-shimmer" style={{ width: 60, height: 12, margin: 'auto', borderRadius: '4px' }} /></td>
    <td className="ac__td ac__td--center ac__td--hide-lg"><div className="skeleton-shimmer" style={{ width: 80, height: 12, margin: 'auto', borderRadius: '4px' }} /></td>
    <td className="ac__td ac__td--center"><div className="skeleton-shimmer" style={{ width: 70, height: 16, borderRadius: '12px', margin: 'auto' }} /></td>
    <td className="ac__td ac__td--center"><div className="skeleton-shimmer" style={{ width: 48, height: 24, borderRadius: '4px', margin: 'auto' }} /></td>
  </tr>
);

/* ── Mobile Card ───────────────────────────────────────────────── */
const CustomerCard = ({ customer, selected, onToggle, onViewDetail, loading }) => {
  if (loading) {
    return (
      <div className="ac__card skeleton-shimmer" style={{ minHeight: '180px', opacity: 0.85, borderRadius: '8px', marginBottom: '12px' }} />
    );
  }

  const getJoinedDate = (c) => {
    if (c.joined) return c.joined;
    if (c.created_at) {
      return new Date(c.created_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
    return "N/A";
  };

  return (
    <div className={`ac__card ${selected ? "ac__card--selected" : ""}`}>
      <div className="ac__card-top">
        <input
          type="checkbox"
          className="ac__checkbox"
          checked={selected}
          onChange={() => onToggle(customer.id)}
        />
        <div className="ac__card-name">{customer.name || "No name set"}</div>
        <span className={`ac__badge ac__badge--${(customer.status || "Confirmed") === "Confirmed" ? "confirmed" : "disabled"}`}>
          {customer.status || "Confirmed"}
        </span>
      </div>

      <div className="ac__card-body">
        <div className="ac__card-row">
          <span className="ac__card-lbl">Email</span>
          <span className="ac__card-val">{customer.email || "N/A"}</span>
        </div>
        <div className="ac__card-row">
          <span className="ac__card-lbl">Phone</span>
          <span className="ac__card-val">{customer.phone || customer.phone_number || customer.mobile || customer.phoneNumber || "No phone set"}</span>
        </div>
        <div className="ac__card-row">
          <span className="ac__card-lbl">Orders</span>
          <span className="ac__card-val">{customer.orderCount || 0}</span>
        </div>
        <div className="ac__card-row">
          <span className="ac__card-lbl">Total Spent</span>
          <span className="ac__card-val">₹{Number(customer.totalSpent || 0).toLocaleString("en-IN")}</span>
        </div>
        <div className="ac__card-row">
          <span className="ac__card-lbl">Joined</span>
          <span className="ac__card-val">{getJoinedDate(customer)}</span>
        </div>
      </div>

      <div className="ac__card-footer">
        <button className="ac__view-btn" onClick={() => onViewDetail && onViewDetail(customer)}>
          View Details
        </button>
      </div>
    </div>
  );
};

/* ── Add Customer Modal ─────────────────────────────────────────── */
const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  orders: "",
  totalSpent: "",
  joined: "",
  status: "Confirmed",
};

const AddCustomerModal = ({ onClose, onAdd }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.email.trim()) e.email = "Email is required";
    if (!form.phone.trim()) e.phone = "Phone is required";
    if (!form.joined.trim()) e.joined = "Joined date is required";
    return e;
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onAdd({
      id: Date.now(),
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      orders: parseInt(form.orders, 10) || 0,
      totalSpent: parseFloat(form.totalSpent) || 0,
      joined: form.joined.trim(),
      status: form.status,
    });
    onClose();
  };

  return (
    <div className="ac__modal-overlay" onClick={onClose}>
      <div className="ac__modal" onClick={(e) => e.stopPropagation()}>
        <div className="ac__modal-header">
          <h2 className="ac__modal-title">Add Customer</h2>
          <button className="ac__modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="ac__modal-body">
          {/* Row 1: Name + Email */}
          <div className="ac__modal-row">
            <div className="ac__field">
              <label className="ac__field-label">Full Name <span className="ac__required">*</span></label>
              <input
                className={`ac__field-input${errors.name ? " ac__field-input--error" : ""}`}
                placeholder="e.g. Ranganath"
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
              />
              {errors.name && <span className="ac__field-error">{errors.name}</span>}
            </div>
            <div className="ac__field">
              <label className="ac__field-label">Email <span className="ac__required">*</span></label>
              <input
                className={`ac__field-input${errors.email ? " ac__field-input--error" : ""}`}
                placeholder="e.g. user@gmail.com"
                value={form.email}
                onChange={(e) => handleChange("email", e.target.value)}
              />
              {errors.email && <span className="ac__field-error">{errors.email}</span>}
            </div>
          </div>

          {/* Row 2: Phone + Joined */}
          <div className="ac__modal-row">
            <div className="ac__field">
              <label className="ac__field-label">Phone <span className="ac__required">*</span></label>
              <input
                className={`ac__field-input${errors.phone ? " ac__field-input--error" : ""}`}
                placeholder="e.g. +91 98400 11111"
                value={form.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
              />
              {errors.phone && <span className="ac__field-error">{errors.phone}</span>}
            </div>
            <div className="ac__field">
              <label className="ac__field-label">Joined Date <span className="ac__required">*</span></label>
              <input
                className={`ac__field-input${errors.joined ? " ac__field-input--error" : ""}`}
                placeholder="e.g. 12th May,2026"
                value={form.joined}
                onChange={(e) => handleChange("joined", e.target.value)}
              />
              {errors.joined && <span className="ac__field-error">{errors.joined}</span>}
            </div>
          </div>

          {/* Row 3: Orders + Total Spent */}
          <div className="ac__modal-row">
            <div className="ac__field">
              <label className="ac__field-label">Orders</label>
              <input
                className="ac__field-input"
                type="number"
                min="0"
                placeholder="e.g. 87"
                value={form.orders}
                onChange={(e) => handleChange("orders", e.target.value)}
              />
            </div>
            <div className="ac__field">
              <label className="ac__field-label">Total Spent (₹)</label>
              <input
                className="ac__field-input"
                type="number"
                min="0"
                placeholder="e.g. 5000"
                value={form.totalSpent}
                onChange={(e) => handleChange("totalSpent", e.target.value)}
              />
            </div>
          </div>

          {/* Row 4: Status */}
          <div className="ac__modal-row">
            <div className="ac__field">
              <label className="ac__field-label">Status</label>
              <div className="ac__select-wrapper">
                <select
                  className="ac__select ac__field-input"
                  value={form.status}
                  onChange={(e) => handleChange("status", e.target.value)}
                >
                  <option value="Confirmed">Confirmed</option>
                  <option value="Disabled">Disabled</option>
                </select>
                <ChevronDown />
              </div>
            </div>
          </div>
        </div>

        <div className="ac__modal-footer">
          <button className="ac__cancel-btn" onClick={onClose}>Cancel</button>
          <button className="ac__submit-btn" onClick={handleSubmit}>Add Customer</button>
        </div>
      </div>
    </div>
  );
};

/* ── Main Component ────────────────────────────────────────────── */
const AllCustomers = ({ customers = [], loading, onViewDetail }) => {
  const [selectedIds, setSelectedIds] = useState([]);
  const [customerFilter, setCustomerFilter] = useState("All Customers");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [localCustomers, setLocalCustomers] = useState([]);

  const { isAdmin: adminHookStatus } = useAdmin();
  const storeIsAdmin = useStore((state) => state.isAdmin);
  const isAdmin = storeIsAdmin || adminHookStatus;

  const [toast, setToast] = useState({ message: "", type: "" });
  const showToast = (message, type = "info") => {
    setToast({ message: "", type: "" });
    setTimeout(() => setToast({ message, type }), 10);
  };

  // Merge local added customers (if any) with database customers
  const allCustomers = [...customers, ...localCustomers];

  const handleAddCustomer = (newCustomer) => {
    setLocalCustomers((prev) => [...prev, newCustomer]);
  };

  /* Filtering */
  const filtered = allCustomers.filter((c) => {
    const matchSearch = !searchQuery ||
      (c.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.phone || "").includes(searchQuery);

    if (!matchSearch) return false;

    if (customerFilter === "New this month") {
      const now = new Date();
      if (c.created_at) {
        const d = new Date(c.created_at);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }
      return c.joined?.includes("2026");
    }

    if (customerFilter === "Active Accounts") {
      return (c.status || "Confirmed") === "Confirmed";
    }

    if (customerFilter === "Disabled Accounts") {
      return c.status === "Disabled";
    }

    return true; // "All Customers"
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE);

  /* Select logic */
  const allChecked = paginated.length > 0 && paginated.every((c) => selectedIds.includes(c.id));
  const toggleAll = () => setSelectedIds(allChecked
    ? selectedIds.filter((id) => !paginated.find((c) => c.id === id))
    : [...new Set([...selectedIds, ...paginated.map((c) => c.id)])]);
  const toggleOne = (id) => setSelectedIds((prev) =>
    prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);

  /* Stats */
  const totalCustomers = allCustomers.length;
  const now = new Date();
  const newThisMonth = allCustomers.filter((c) => {
    if (c.created_at) {
      const d = new Date(c.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    return c.joined?.includes("2026");
  }).length;
  const activeAccounts = allCustomers.filter((c) => (c.status || "Confirmed") === "Confirmed").length;
  const disabledAccounts = allCustomers.filter((c) => c.status === "Disabled").length;
  const avgOrderValue = totalCustomers > 0
    ? Math.round(allCustomers.reduce((s, c) => s + (c.totalSpent || 0), 0) / totalCustomers)
    : 0;

  /* Pagination */
  const getPageNumbers = () => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (safePage <= 3) return [1, 2, 3, "...", totalPages];
    if (safePage >= totalPages - 2) return [1, "...", totalPages - 2, totalPages - 1, totalPages];
    return [1, "...", safePage, "...", totalPages];
  };

  const getJoinedDate = (c) => {
    if (c.joined) return c.joined;
    if (c.created_at) {
      return new Date(c.created_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
    return "N/A";
  };

  const renderTableBody = () => {
    if (loading) {
      return Array.from({ length: ROWS_PER_PAGE }).map((_, i) => <SkeletonCustomerRow key={i} />);
    }

    if (allCustomers.length === 0) {
      return (
        <tr>
          <td colSpan={8} className="ac__empty">
            <div className="ac__empty-state">
              <p className="ac__empty-title">No customers yet</p>
              <p className="ac__empty-sub">Database customer list is empty.</p>
            </div>
          </td>
        </tr>
      );
    }

    if (paginated.length === 0) {
      return (
        <tr>
          <td colSpan={8} className="ac__empty">
            <div className="ac__empty-state">
              <p className="ac__empty-title">No customers match filters</p>
              <p className="ac__empty-sub">Try adjusting filters or search query.</p>
            </div>
          </td>
        </tr>
      );
    }

    return paginated.map((customer) => (
      <tr key={customer.id} className="ac__tr">
        <td className="ac__td ac__td--check">
          <input type="checkbox" className="ac__checkbox"
            checked={selectedIds.includes(customer.id)}
            onChange={() => toggleOne(customer.id)} />
        </td>
        <td className="ac__td ac__td--name">
          <span className="ac__name-text">{customer.name || "No name set"}</span>
          <span className="ac__name-email-sm">{customer.email || ""}</span>
        </td>
        <td className="ac__td ac__td--contact ac__td--hide-sm">
          <span>{customer.email || "N/A"}</span>
          <span>{customer.phone || customer.phone_number || customer.mobile || customer.phoneNumber || "No phone set"}</span>
        </td>
        <td className="ac__td ac__td--center ac__td--hide-md">{customer.orderCount || 0}</td>
        <td className="ac__td ac__td--center ac__td--hide-md">₹{Number(customer.totalSpent || 0).toLocaleString("en-IN")}</td>
        <td className="ac__td ac__td--center ac__td--hide-lg">{getJoinedDate(customer)}</td>
        <td className="ac__td ac__td--center">
          <span className={`ac__badge ac__badge--${(customer.status || "Confirmed") === "Confirmed" ? "confirmed" : "disabled"}`}>
            {customer.status || "Confirmed"}
          </span>
        </td>
        <td className="ac__td ac__td--center">
          <button className="ac__view-btn" onClick={() => onViewDetail && onViewDetail(customer)}>
            View
          </button>
        </td>
      </tr>
    ));
  };

  return (
    <div className="ac">
      {/* ── Header ── */}
      <div className="ac__header">
        <div className="ac__header-left">
          <h1 className="ac__title">All Customers</h1>
          <span className="ac__subtitle">{loading ? "Loading…" : `${filtered.length} customers`}</span>
        </div>
        <div className="ac__header-actions">
          {isAdmin && (
            <button
              type="button"
              className="ac__export-btn"
              onClick={() => setShowExportModal(true)}
              title="Download order data (CSV export)"
            >
              <span className="ac__export-icon">📥</span>
              <span>Download Data</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="ac__stats-row">
        <div className="ac__stat-card">
          <div className="ac__stat-label">Total Customers</div>
          <div className="ac__stat-value">{loading ? "—" : totalCustomers}</div>
          <div className="ac__stat-sub">All Time</div>
        </div>
        <div className="ac__stat-card">
          <div className="ac__stat-label">New this month</div>
          <div className="ac__stat-value">{loading ? "—" : newThisMonth}</div>
          <div className="ac__stat-sub">Current Month</div>
        </div>
        <div className="ac__stat-card">
          <div className="ac__stat-label">Active Accounts</div>
          <div className="ac__stat-value">{loading ? "—" : activeAccounts}</div>
          <div className="ac__stat-sub">Enabled</div>
        </div>
        <div className="ac__stat-card">
          <div className="ac__stat-label">Disabled Accounts</div>
          <div className="ac__stat-value">{loading ? "—" : disabledAccounts}</div>
          <div className="ac__stat-sub">Restricted</div>
        </div>
        <div className="ac__stat-card">
          <div className="ac__stat-label">Avg. order value</div>
          <div className="ac__stat-value">₹{loading ? "—" : avgOrderValue.toLocaleString("en-IN")}</div>
          <div className="ac__stat-sub">Per customer</div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="ac__toolbar">
        <div className="ac__search-wrapper">
          <SearchIcon />
          <input
            type="text"
            className="ac__search-input"
            placeholder="Search name, email, contact..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          />
        </div>

        <button
          className="ac__filter-toggle"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="11" y1="18" x2="13" y2="18" />
          </svg>
          Filters
          {customerFilter !== "All Customers" && <span className="ac__filter-dot" />}
        </button>

        <div className={`ac__filters${showFilters ? " ac__filters--open" : ""}`}>
          <div className="ac__select-wrapper">
            <select className="ac__select" value={customerFilter}
              onChange={(e) => { setCustomerFilter(e.target.value); setCurrentPage(1); }}>
              <option>All Customers</option>
              <option>New this month</option>
              <option>Active Accounts</option>
              <option>Disabled Accounts</option>
            </select>
            <ChevronDown />
          </div>
        </div>
      </div>

      {/* ── Table (tablet +) ── */}
      {(loading || allCustomers.length > 0) && (
        <div className="ac__table-wrapper">
          <table className="ac__table">
            <thead>
              <tr>
                <th className="ac__th ac__th--check">
                  <input type="checkbox" className="ac__checkbox" checked={allChecked} onChange={toggleAll} disabled={loading} />
                </th>
                <th className="ac__th">Customer</th>
                <th className="ac__th ac__th--hide-sm">Contact</th>
                <th className="ac__th ac__th--center ac__th--hide-md">Orders</th>
                <th className="ac__th ac__th--center ac__th--hide-md">Total Spent</th>
                <th className="ac__th ac__th--center ac__th--hide-lg">Joined</th>
                <th className="ac__th ac__th--center">Status</th>
                <th className="ac__th ac__th--center">Action</th>
              </tr>
            </thead>
            <tbody>
              {renderTableBody()}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Mobile Cards ── */}
      {allCustomers.length > 0 && (
        <div className="ac__cards-wrapper">
          {loading ? (
            Array.from({ length: ROWS_PER_PAGE }).map((_, i) => <CustomerCard key={i} loading={true} />)
          ) : (
            paginated.map((customer) => (
              <CustomerCard
                key={customer.id}
                customer={customer}
                selected={selectedIds.includes(customer.id)}
                onToggle={toggleOne}
                onViewDetail={onViewDetail}
              />
            ))
          )}
        </div>
      )}

      {/* ── Footer ── */}
      {!loading && allCustomers.length > 0 && (
        <div className="ac__footer">
          <span className="ac__showing">
            Showing {(safePage - 1) * ROWS_PER_PAGE + 1}–{Math.min(safePage * ROWS_PER_PAGE, filtered.length)} of {filtered.length}
            <span className="ac__showing-full"> Customers</span>
          </span>
          <div className="ac__pagination">
            <button className="ac__page-btn ac__page-btn--arrow" disabled={safePage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}>‹</button>
            {getPageNumbers().map((p, i) =>
              p === "..." ? (
                <span key={`e-${i}`} className="ac__page-ellipsis">…</span>
              ) : (
                <button key={p}
                  className={`ac__page-btn${safePage === p ? " ac__page-btn--active" : ""}`}
                  onClick={() => setCurrentPage(p)}>{p}</button>
              )
            )}
            <button className="ac__page-btn ac__page-btn--arrow" disabled={safePage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}>›</button>
          </div>
        </div>
      )}

      {/* ── Add Customer Modal ── */}
      {showModal && (
        <AddCustomerModal
          onClose={() => setShowModal(false)}
          onAdd={handleAddCustomer}
        />
      )}

      {/* ── CSV Export Modal ── */}
      <ExportOrdersModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onToast={showToast}
      />

      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: "", type: "" })}
      />
    </div>
  );
};

export default AllCustomers;
