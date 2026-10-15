import React, { useState, useEffect, useMemo } from "react";
import {
  shippingService,
  INDIAN_STATES,
  DEFAULT_STATE_KEY,
} from "../../services/shippingService";
import Toast from "../../components/Toast";
import "./Shipping.css";

const Toggle = ({ checked, onChange, disabled = false }) => (
  <label className={`sh__toggle ${disabled ? "sh__toggle--disabled" : ""}`}>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => !disabled && onChange(e.target.checked)}
      disabled={disabled}
    />
    <span className="sh__toggle-track">
      <span className="sh__toggle-thumb" />
    </span>
  </label>
);

const Shipping = () => {
  // Database rates state
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'active' | 'inactive' | 'default'

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState(null); // null = Add, object = Edit
  const [formData, setFormData] = useState({
    state: "",
    isCustom: false,
    customState: "",
    fee: "60",
    isActive: true,
  });
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Toast feedback
  const [toast, setToast] = useState({ message: "", type: "info" });
  const showToast = (message, type = "info") => {
    setToast({ message: "", type });
    setTimeout(() => setToast({ message, type }), 10);
  };

  // ── Load rates from Supabase ──────────────────────────────────────────────
  const loadRates = async () => {
    try {
      const data = await shippingService.getAllAdminRates();
      setRates(data);
    } catch (err) {
      console.error("Failed to load shipping rates:", err);
      showToast("Failed to load shipping rates: " + (err.message || "Database error"), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRates();
  }, []);

  // Set of already configured states (for dropdown hints)
  const configuredStatesSet = useMemo(() => {
    return new Set(rates.map((r) => r.state.trim().toLowerCase()));
  }, [rates]);

  const hasDefaultRate = useMemo(() => {
    return rates.some((r) => r.state === DEFAULT_STATE_KEY);
  }, [rates]);

  // Filtered rates list
  const filteredRates = useMemo(() => {
    return rates.filter((r) => {
      const isDefault = r.state === DEFAULT_STATE_KEY;
      const stateName = isDefault ? "default rest of india fallback" : r.state.toLowerCase();
      const query = searchQuery.trim().toLowerCase();

      if (query && !stateName.includes(query)) {
        return false;
      }

      if (statusFilter === "active") return r.is_active;
      if (statusFilter === "inactive") return !r.is_active;

      return true;
    });
  }, [rates, searchQuery, statusFilter]);

  // ── Open Add Modal ────────────────────────────────────────────────────────
  const openAddModal = () => {
    setEditingRate(null);
    setFormErrors({});

    const firstState = !hasDefaultRate
      ? DEFAULT_STATE_KEY
      : INDIAN_STATES.find((s) => !configuredStatesSet.has(s.toLowerCase())) || "";

    setFormData({
      state: firstState,
      isCustom: false,
      customState: "",
      fee: "60",
      isActive: true,
    });
    setIsModalOpen(true);
  };

  // ── Open Edit Modal ───────────────────────────────────────────────────────
  const openEditModal = (rate) => {
    setEditingRate(rate);
    setFormErrors({});

    const isKnown = rate.state === DEFAULT_STATE_KEY || INDIAN_STATES.includes(rate.state);

    setFormData({
      state: isKnown ? rate.state : "__custom__",
      isCustom: !isKnown,
      customState: !isKnown ? rate.state : "",
      fee: String(rate.fee ?? 0),
      isActive: Boolean(rate.is_active),
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingRate(null);
    setFormErrors({});
  };

  // ── Form Validation ───────────────────────────────────────────────────────
  const validateForm = () => {
    const errs = {};
    const resolvedState = (formData.isCustom ? formData.customState : formData.state).trim();

    if (!resolvedState) {
      errs.state = "Please select or enter a state.";
    } else {
      // Check for duplicates
      const isDuplicate = rates.some(
        (r) =>
          r.state.trim().toLowerCase() === resolvedState.toLowerCase() &&
          (!editingRate || editingRate.state.toLowerCase() !== resolvedState.toLowerCase())
      );
      if (isDuplicate) {
        errs.state = `A rate for "${
          resolvedState === DEFAULT_STATE_KEY ? "Default (Rest of India)" : resolvedState
        }" is already configured.`;
      }
    }

    const feeNum = Number(formData.fee);
    if (formData.fee === "" || isNaN(feeNum) || feeNum < 0) {
      errs.fee = "Please enter a valid shipping fee (0 or greater).";
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Handle Save (Insert or Update) ────────────────────────────────────────
  const handleSaveRate = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    const targetState = (formData.isCustom ? formData.customState : formData.state).trim();

    const payload = {
      state: targetState,
      fee: Number(formData.fee) || 0,
      is_active: formData.isActive,
    };

    setSaving(true);
    try {
      if (editingRate) {
        await shippingService.updateRate(editingRate.state, payload);
        showToast(
          `Shipping rate for "${
            targetState === DEFAULT_STATE_KEY ? "Default Rate" : targetState
          }" updated successfully!`,
          "success"
        );
      } else {
        await shippingService.addRate(payload);
        showToast(
          `Shipping rate for "${
            targetState === DEFAULT_STATE_KEY ? "Default Rate" : targetState
          }" created successfully!`,
          "success"
        );
      }
      closeModal();
      await loadRates();
    } catch (err) {
      console.error("Error saving rate:", err);
      showToast("Failed to save rate: " + (err.message || "Unknown error"), "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Quick Toggle Status ───────────────────────────────────────────────────
  const handleToggleStatus = async (rate) => {
    const nextState = !rate.is_active;
    // Optimistic UI update
    setRates((prev) =>
      prev.map((r) => (r.state === rate.state ? { ...r, is_active: nextState } : r))
    );

    try {
      await shippingService.toggleRateStatus(rate.state, nextState);
      const name = rate.state === DEFAULT_STATE_KEY ? "Default Rate" : rate.state;
      showToast(`"${name}" is now ${nextState ? "Active" : "Inactive"}.`, "success");
    } catch (err) {
      console.error("Error toggling rate status:", err);
      // Revert optimistic update
      setRates((prev) =>
        prev.map((r) => (r.state === rate.state ? { ...r, is_active: rate.is_active } : r))
      );
      showToast("Failed to update status: " + (err.message || "Unknown error"), "error");
    }
  };

  // ── Delete Rate ───────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await shippingService.deleteRate(deleteTarget.state);
      const name =
        deleteTarget.state === DEFAULT_STATE_KEY ? "Default Rate" : deleteTarget.state;
      showToast(`Shipping rate for "${name}" deleted.`, "success");
      setDeleteTarget(null);
      await loadRates();
    } catch (err) {
      console.error("Error deleting rate:", err);
      showToast("Failed to delete rate: " + (err.message || "Unknown error"), "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="sh">
      {/* ── Page Header ── */}
      <div className="sh__page-header">
        <div className="sh__page-header-text">
          <div className="sh__breadcrumbs">
            <span>Settings</span>
            <span className="sh__breadcrumb-sep">/</span>
            <span className="sh__breadcrumb-active">Shipping Rates</span>
          </div>
          <h1 className="sh__page-title">Shipping Rates</h1>
          <p className="sh__page-subtitle">
            Manage state-wise delivery charges and fallback rates.
          </p>
        </div>

        <div className="sh__header-actions">
          <button
            type="button"
            className="sh__btn sh__btn--primary"
            onClick={() => openAddModal()}
          >
            <svg
              className="sh__btn-icon"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Shipping Rate
          </button>
        </div>
      </div>

      {/* ── Table Card ── */}
      <div className="sh__card sh__table-card">
        {/* Table Toolbar */}
        <div className="sh__toolbar">
          <div className="sh__search-box">
            <svg
              className="sh__search-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="sh__search-input"
              placeholder="Search by state name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="sh__search-clear"
                onClick={() => setSearchQuery("")}
              >
                ✕
              </button>
            )}
          </div>

          <div className="sh__filter-group">
            <button
              type="button"
              className={`sh__filter-pill ${statusFilter === "all" ? "sh__filter-pill--active" : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              All ({rates.length})
            </button>
            <button
              type="button"
              className={`sh__filter-pill ${statusFilter === "active" ? "sh__filter-pill--active" : ""}`}
              onClick={() => setStatusFilter("active")}
            >
              Active ({rates.filter((r) => r.is_active).length})
            </button>
            <button
              type="button"
              className={`sh__filter-pill ${statusFilter === "inactive" ? "sh__filter-pill--active" : ""}`}
              onClick={() => setStatusFilter("inactive")}
            >
              Inactive ({rates.filter((r) => !r.is_active).length})
            </button>
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="sh__loading-state">
            <div className="sh__spinner" />
            <p>Loading shipping rates from database...</p>
          </div>
        ) : filteredRates.length === 0 ? (
          <div className="sh__empty-state">
            <div className="sh__empty-icon">📦</div>
            <h3 className="sh__empty-title">
              {searchQuery || statusFilter !== "all"
                ? "No matching shipping rates found"
                : "No shipping rates configured yet"}
            </h3>
            <p className="sh__empty-desc">
              {searchQuery || statusFilter !== "all"
                ? "Try clearing your search query or switching filters to see existing rates."
                : "Add your default fallback shipping rate or specific rates for Indian states."}
            </p>
            <div className="sh__empty-actions">
              {searchQuery || statusFilter !== "all" ? (
                <button
                  type="button"
                  className="sh__btn sh__btn--secondary"
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("all");
                  }}
                >
                  Clear Filters
                </button>
              ) : (
                <button
                  type="button"
                  className="sh__btn sh__btn--primary"
                  onClick={() => openAddModal()}
                >
                  + Add First Shipping Rate
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="sh__table-wrap">
            <table className="sh__table">
              <thead>
                <tr>
                  <th style={{ width: "45%" }}>State / Region</th>
                  <th style={{ width: "25%" }}>Delivery Fee</th>
                  <th style={{ width: "15%" }}>Status</th>
                  <th style={{ width: "15%" }} className="sh__text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRates.map((rate) => {
                  const isDefault = rate.state === DEFAULT_STATE_KEY;
                  return (
                    <tr
                      key={rate.state}
                      className={isDefault ? "sh__tr--default" : ""}
                    >
                      {/* State / Region */}
                      <td>
                        <div className="sh__state-cell">
                          {isDefault ? (
                            <div className="sh__state-default-badge-wrap">
                              <span className="sh__default-badge">
                                🌟 Default (Rest of India)
                              </span>
                            </div>
                          ) : (
                            <div className="sh__state-name-wrap">
                              <span className="sh__state-title">{rate.state}</span>
                              <span className="sh__state-sub">State-specific rate</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Delivery Fee */}
                      <td>
                        <div className="sh__fee-cell">
                          {Number(rate.fee) === 0 ? (
                            <span className="sh__badge-free">FREE</span>
                          ) : (
                            <span className="sh__fee-amount">
                              ₹{Number(rate.fee).toLocaleString("en-IN")}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status Toggle */}
                      <td>
                        <div className="sh__status-cell">
                          <Toggle
                            checked={rate.is_active}
                            onChange={() => handleToggleStatus(rate)}
                          />
                          <span
                            className={`sh__status-label ${
                              rate.is_active
                                ? "sh__status-label--on"
                                : "sh__status-label--off"
                            }`}
                          >
                            {rate.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="sh__text-right">
                        <div className="sh__actions-wrap">
                          <button
                            type="button"
                            className="sh__action-btn sh__action-btn--edit"
                            title="Edit shipping rate"
                            onClick={() => openEditModal(rate)}
                          >
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>

                          <button
                            type="button"
                            className="sh__action-btn sh__action-btn--delete"
                            title="Delete shipping rate"
                            onClick={() => setDeleteTarget(rate)}
                          >
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add / Edit Rate Modal (Minimal) ── */}
      {isModalOpen && (
        <div className="sh__modal-overlay" onClick={closeModal}>
          <div
            className="sh__modal sh__modal--minimal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="sh__modal-header">
              <h2 className="sh__modal-title">
                {editingRate ? "Edit Shipping Rate" : "Add Shipping Rate"}
              </h2>
              <button
                type="button"
                className="sh__modal-close"
                onClick={closeModal}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRate} className="sh__modal-form">
              {/* Region / State Selection */}
              <div className="sh__form-group">
                <label className="sh__form-label">
                  State / Region <span className="sh__required">*</span>
                </label>

                {editingRate ? (
                  <input
                    type="text"
                    className="sh__input-field"
                    value={
                      editingRate.state === DEFAULT_STATE_KEY
                        ? "Default (Rest of India)"
                        : editingRate.state
                    }
                    disabled
                  />
                ) : (
                  <>
                    <select
                      className={`sh__select ${formErrors.state ? "sh__input--error" : ""}`}
                      value={formData.isCustom ? "__custom__" : formData.state}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "__custom__") {
                          setFormData((prev) => ({ ...prev, isCustom: true, state: "" }));
                        } else {
                          setFormData((prev) => ({ ...prev, isCustom: false, state: val }));
                        }
                      }}
                    >
                      <option value="">— Select Region or State —</option>
                      <option value={DEFAULT_STATE_KEY} disabled={hasDefaultRate}>
                        🌟 Default (Rest of India) {hasDefaultRate ? "(Already added)" : ""}
                      </option>
                      <optgroup label="Indian States & UTs">
                        {INDIAN_STATES.map((st) => {
                          const isConfigured = configuredStatesSet.has(st.toLowerCase());
                          return (
                            <option key={st} value={st} disabled={isConfigured}>
                              {st} {isConfigured ? "(Already added)" : ""}
                            </option>
                          );
                        })}
                      </optgroup>
                      <option value="__custom__">Custom State / Region...</option>
                    </select>

                    {formData.isCustom && (
                      <input
                        type="text"
                        className={`sh__input-field ${formErrors.state ? "sh__input--error" : ""}`}
                        placeholder="Enter state or region name..."
                        value={formData.customState}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, customState: e.target.value }))
                        }
                        style={{ marginTop: 8 }}
                        autoFocus
                      />
                    )}
                  </>
                )}
                {formErrors.state && (
                  <span className="sh__error-msg">{formErrors.state}</span>
                )}
              </div>

              {/* Delivery Fee Input */}
              <div className="sh__form-group">
                <label className="sh__form-label">
                  Delivery Fee (₹) <span className="sh__required">*</span>
                </label>
                <div className="sh__input-with-prefix">
                  <span className="sh__currency-prefix">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className={`sh__input-field ${
                      formErrors.fee ? "sh__input--error" : ""
                    }`}
                    placeholder="0"
                    value={formData.fee}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, fee: e.target.value }))
                    }
                  />
                </div>
                {formErrors.fee && (
                  <span className="sh__error-msg">{formErrors.fee}</span>
                )}
              </div>

              {/* Active Toggle */}
              <div className="sh__form-group sh__form-group--inline">
                <span className="sh__form-label">Active</span>
                <Toggle
                  checked={formData.isActive}
                  onChange={(val) =>
                    setFormData((prev) => ({ ...prev, isActive: val }))
                  }
                />
              </div>

              {/* Modal Actions */}
              <div className="sh__modal-footer">
                <button
                  type="button"
                  className="sh__btn sh__btn--secondary"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sh__btn sh__btn--primary"
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <span className="sh__spinner sh__spinner--small" />
                      Saving...
                    </>
                  ) : editingRate ? (
                    "Update Rate"
                  ) : (
                    "Add Rate"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Dialog ── */}
      {deleteTarget && (
        <div
          className="sh__modal-overlay"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="sh__modal sh__modal--danger"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="sh__modal-header">
              <h2 className="sh__modal-title">Delete Shipping Rate?</h2>
              <button
                type="button"
                className="sh__modal-close"
                onClick={() => !deleting && setDeleteTarget(null)}
              >
                ✕
              </button>
            </div>

            <div className="sh__delete-body">
              <p>
                Are you sure you want to delete the rate for{" "}
                <strong>
                  {deleteTarget.state === DEFAULT_STATE_KEY
                    ? "Default Rate"
                    : deleteTarget.state}
                </strong>
                ?
              </p>
              {deleteTarget.state === DEFAULT_STATE_KEY ? (
                <div className="sh__delete-warning">
                  ⚠️ <strong>Warning:</strong> Deleting the default fallback rate will cause
                  orders from any unlisted state to fail at checkout!
                </div>
              ) : (
                <p className="sh__delete-note">
                  Orders from this state will fall back to your Default Rate.
                </p>
              )}
            </div>

            <div className="sh__modal-footer">
              <button
                type="button"
                className="sh__btn sh__btn--secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sh__btn sh__btn--danger"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Yes, Delete Rate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast Notification ── */}
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: "", type: "info" })}
      />
    </div>
  );
};

export default Shipping;