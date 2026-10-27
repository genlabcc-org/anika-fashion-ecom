import React, { useState, useEffect } from "react";
import { orderService } from "../../services/orderService";
import "./ManualShippingCard.css";

const formatDateTime = (dateStr) => {
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
    return `${day} ${month}, ${hours}:${minutes} ${ampm}`;
  } catch (_) {
    return dateStr;
  }
};

export default function ManualShippingCard({ order, onOrderUpdated, showToast }) {
  const [manualCourierName, setManualCourierName] = useState(
    order?.manual_courier_name || "Franch Express"
  );
  const [manualAwb, setManualAwb] = useState(order?.manual_awb || "");
  const [isEditingTracking, setIsEditingTracking] = useState(false);
  const [savingAction, setSavingAction] = useState(null); // 'pack' | 'ship' | 'edit' | 'deliver' | null
  const [awbError, setAwbError] = useState("");

  // Sync state when order prop changes
  useEffect(() => {
    if (order?.manual_courier_name !== undefined) {
      setManualCourierName(order.manual_courier_name || "Franch Express");
    }
    if (order?.manual_awb !== undefined) {
      setManualAwb(order.manual_awb || "");
    }
  }, [order?.manual_courier_name, order?.manual_awb]);

  const normStatus = (order?.status || "").toLowerCase();
  const isPaid = normStatus === "paid";
  const isShipped = normStatus === "shipped";
  const isDelivered = normStatus === "delivered";
  const isCancelled = ["cancelled", "canceled"].includes(normStatus);
  const isRefunded = ["refunded", "refund completed"].includes(normStatus);
  const isPacked = Boolean(order?.is_packed);
  const hasSavedTracking = Boolean(order?.manual_awb);

  // Barcode / Scanner input handler: strip spaces immediately
  const handleAwbChange = (e) => {
    const raw = e.target.value;
    const stripped = raw.replace(/\s+/g, "");
    setManualAwb(stripped);
    if (awbError) setAwbError("");
  };

  const validateAwb = (val) => {
    const clean = (val || "").replace(/\s+/g, "").trim();
    if (!clean) {
      return { valid: false, error: "Please enter a tracking ID." };
    }
    if (clean.length < 6 || clean.length > 30) {
      return { valid: false, error: "Tracking ID must be between 6 and 30 characters." };
    }
    if (!/^[a-zA-Z0-9-]+$/.test(clean)) {
      return { valid: false, error: "Tracking ID can only contain letters, numbers, and hyphens." };
    }
    return { valid: true, value: clean };
  };

  // ── Stage 1: Mark as Packed ──
  const handleMarkPacked = async () => {
    if (savingAction || !order?.id) return;
    setSavingAction("pack");
    try {
      const now = new Date().toISOString();
      const updates = {
        is_packed: true,
        packed_at: now,
      };

      await orderService.setOrderPacked(order.id, true);
      if (typeof onOrderUpdated === "function") {
        onOrderUpdated(updates);
      }
      if (typeof showToast === "function") {
        showToast("Order marked as packed!", "success");
      }
    } catch (err) {
      console.error("Failed to mark packed:", err);
      if (typeof showToast === "function") {
        showToast("Failed to mark order as packed: " + (err.message || err), "error");
      }
    } finally {
      setSavingAction(null);
    }
  };

  // ── Stage 2: Save & Mark as Shipped ──
  const handleSaveAndShip = async (e) => {
    e?.preventDefault();
    if (savingAction || !order?.id) return;

    if (!isPacked) {
      if (typeof showToast === "function") {
        showToast("Please mark the order as packed first.", "error");
      }
      return;
    }

    const validation = validateAwb(manualAwb);
    if (!validation.valid) {
      setAwbError(validation.error);
      if (typeof showToast === "function") {
        showToast(validation.error, "error");
      }
      return;
    }

    const trackingId = validation.value;
    const courier = (manualCourierName || "").trim() || "Franch Express";
    const trackingUrl = `https://t.17track.net/en#nums=${encodeURIComponent(trackingId)}`;

    const confirmed = window.confirm(`Save tracking ID ${trackingId}?`);
    if (!confirmed) return;

    setSavingAction("ship");
    try {
      const now = new Date().toISOString();
      const updates = {
        manual_awb: trackingId,
        manual_courier_name: courier,
        manual_tracking_url: trackingUrl,
        tracking_url: trackingUrl,
        status: "Shipped",
        shipped_at: now,
        waybill: trackingId,
        courier_name: courier,
        delivery_status: "Shipped",
        fulfillment_type: "manual",
        shipment_error: null,
      };

      await orderService.markManualOrderShipped(order.id, {
        manualAwb: trackingId,
        manualCourierName: courier,
        manualTrackingUrl: trackingUrl,
        shippedAt: now,
      });

      if (typeof onOrderUpdated === "function") {
        onOrderUpdated(updates);
      }
      setIsEditingTracking(false);
      if (typeof showToast === "function") {
        showToast(`Tracking ID saved! Order marked as Shipped (${courier}).`, "success");
      }
    } catch (err) {
      console.error("Failed to save tracking:", err);
      if (typeof showToast === "function") {
        showToast("Failed to save tracking: " + (err.message || err), "error");
      }
    } finally {
      setSavingAction(null);
    }
  };

  // ── Stage 2 (Edit): Update Tracking ID (without altering shipped_at) ──
  const handleUpdateTracking = async (e) => {
    e?.preventDefault();
    if (savingAction || !order?.id) return;

    const validation = validateAwb(manualAwb);
    if (!validation.valid) {
      setAwbError(validation.error);
      if (typeof showToast === "function") {
        showToast(validation.error, "error");
      }
      return;
    }

    const trackingId = validation.value;
    const courier = (manualCourierName || "").trim() || "Franch Express";
    const trackingUrl = `https://t.17track.net/en#nums=${encodeURIComponent(trackingId)}`;

    const confirmed = window.confirm(`Save tracking ID ${trackingId}?`);
    if (!confirmed) return;

    setSavingAction("edit");
    try {
      // NOTE: Editing must NOT change shipped_at!
      const updates = {
        manual_awb: trackingId,
        manual_courier_name: courier,
        manual_tracking_url: trackingUrl,
        tracking_url: trackingUrl,
        waybill: trackingId,
        courier_name: courier,
      };

      await orderService.updateManualTracking(order.id, {
        manualAwb: trackingId,
        manualCourierName: courier,
        manualTrackingUrl: trackingUrl,
      });

      if (typeof onOrderUpdated === "function") {
        onOrderUpdated(updates);
      }
      setIsEditingTracking(false);
      if (typeof showToast === "function") {
        showToast("Tracking ID updated successfully!", "success");
      }
    } catch (err) {
      console.error("Failed to update tracking:", err);
      if (typeof showToast === "function") {
        showToast("Failed to update tracking: " + (err.message || err), "error");
      }
    } finally {
      setSavingAction(null);
    }
  };

  // ── Stage 3: Mark as Delivered ──
  const handleMarkDelivered = async () => {
    if (savingAction || !order?.id) return;

    const confirmed = window.confirm("Mark this order as Delivered?");
    if (!confirmed) return;

    setSavingAction("deliver");
    try {
      const now = new Date().toISOString();
      const updates = {
        status: "Delivered",
        delivered_at: now,
        delivery_status: "Delivered",
      };

      await orderService.markOrderDelivered(order.id, now);
      if (typeof onOrderUpdated === "function") {
        onOrderUpdated(updates);
      }
      if (typeof showToast === "function") {
        showToast("Order marked as Delivered!", "success");
      }
    } catch (err) {
      console.error("Failed to mark delivered:", err);
      if (typeof showToast === "function") {
        showToast("Failed to mark order as delivered: " + (err.message || err), "error");
      }
    } finally {
      setSavingAction(null);
    }
  };

  const isSaving = Boolean(savingAction);

  return (
    <div className="msc" id="admin-manual-shipping-card">
      {/* Card Header */}
      <div className="msc__header">
        <h2 className="msc__title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b0030" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="3" width="15" height="13" />
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
          Shipping & Fulfillment
        </h2>
        <span className="msc__badge" id="msc-fulfillment-badge">
          <span className="msc__badge-dot" />
          Manual Courier
        </span>
      </div>

      {/* Overview Grid */}
      <div className="msc__info-grid">
        <span className="msc__info-label">Courier Partner:</span>
        <span className="msc__info-value" id="msc-info-courier">
          {order?.manual_courier_name || order?.courier_name || "Franch Express"}
        </span>

        <span className="msc__info-label">Packing Status:</span>
        <span className="msc__info-value" id="msc-info-packed">
          {isPacked ? (
            <span style={{ color: "#16a34a" }}>
              Packed ✓ {order?.packed_at && <span style={{ fontSize: "11.5px", color: "#64748b", fontWeight: 400 }}>({formatDateTime(order.packed_at)})</span>}
            </span>
          ) : (
            <span style={{ color: "#d97706" }}>Not packed</span>
          )}
        </span>

        <span className="msc__info-label">Shipping Status:</span>
        <span className="msc__info-value" id="msc-info-status">
          <span
            style={{
              padding: "2px 8px",
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: 600,
              backgroundColor: isDelivered ? "#dcfce7" : isShipped ? "#fef9c3" : isPaid ? "#e0f2fe" : "#f1f5f9",
              color: isDelivered ? "#16a34a" : isShipped ? "#a16207" : isPaid ? "#0369a1" : "#475569",
            }}
          >
            {order?.status || "Pending"}
          </span>
        </span>

        {hasSavedTracking && (
          <>
            <span className="msc__info-label">Tracking ID / AWB:</span>
            <span className="msc__info-value" id="msc-info-awb">
              <span className="msc__tracking-pill">{order.manual_awb}</span>
            </span>
          </>
        )}

        {order?.shipped_at && (
          <>
            <span className="msc__info-label">Shipped At:</span>
            <span className="msc__info-value" id="msc-info-shipped-at">
              {formatDateTime(order.shipped_at)}
            </span>
          </>
        )}

        {order?.delivered_at && (
          <>
            <span className="msc__info-label">Delivered At:</span>
            <span className="msc__info-value" id="msc-info-delivered-at">
              {formatDateTime(order.delivered_at)}
            </span>
          </>
        )}
      </div>

      {/* 3 Stages Container */}
      <div className="msc__stages">
        {/* ── STAGE 1: PACKED ── */}
        <div
          className={`msc__stage ${isPacked
            ? "msc__stage--completed"
            : isPaid
              ? "msc__stage--active"
              : "msc__stage--locked"
            }`}
          id="msc-stage-1"
        >
          <div className="msc__stage-header">
            <div className="msc__stage-meta">
              <div className="msc__stage-num">
                {isPacked ? "✓" : "1"}
              </div>
              <span className="msc__stage-name">Stage 1: Parcel Packing</span>
            </div>
            <span
              className={`msc__stage-badge ${isPacked
                ? "msc__stage-badge--done"
                : isPaid
                  ? "msc__stage-badge--active"
                  : "msc__stage-badge--pending"
                }`}
            >
              {isPacked ? "Packed" : isPaid ? "Action Required" : "Pending"}
            </span>
          </div>

          <div className="msc__stage-body">
            {isPaid && !isPacked && (
              <>
                <p className="msc__stage-desc">
                  Verify items and mark parcel as packed to unlock tracking entry.
                </p>
                <button
                  type="button"
                  id="msc-mark-packed-btn"
                  className="msc__btn msc__btn--pack"
                  onClick={handleMarkPacked}
                  disabled={isSaving}
                >
                  {savingAction === "pack" ? (
                    <>
                      <span className="msc__spinner" /> Marking as Packed...
                    </>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Mark as Packed
                    </>
                  )}
                </button>
              </>
            )}

            {isPacked && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#16a34a", fontWeight: "600" }}>
                <span>✓ Order is packed and ready for dispatch.</span>
                {order?.packed_at && (
                  <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "400" }}>
                    ({formatDateTime(order.packed_at)})
                  </span>
                )}
              </div>
            )}

            {!isPaid && !isPacked && (
              <p className="msc__stage-desc">
                Order status is <strong>{order?.status}</strong>. Mark as Packed is available when status is Paid.
              </p>
            )}
          </div>
        </div>

        {/* ── STAGE 2: TRACKING BOX ── */}
        <div
          className={`msc__stage ${hasSavedTracking && !isEditingTracking
            ? "msc__stage--completed"
            : isPacked
              ? "msc__stage--active"
              : "msc__stage--locked"
            }`}
          id="msc-stage-2"
        >
          <div className="msc__stage-header">
            <div className="msc__stage-meta">
              <div className="msc__stage-num">
                {hasSavedTracking ? "✓" : "2"}
              </div>
              <span className="msc__stage-name">Stage 2: Courier Tracking</span>
            </div>
            <span
              className={`msc__stage-badge ${hasSavedTracking
                ? "msc__stage-badge--done"
                : isPacked
                  ? "msc__stage-badge--active"
                  : "msc__stage-badge--pending"
                }`}
            >
              {hasSavedTracking ? (isEditingTracking ? "Editing" : "Shipped") : isPacked ? "Ready to Ship" : "Locked"}
            </span>
          </div>

          <div className="msc__stage-body">
            {/* When tracking is already saved and not editing: show read-only with Edit button */}
            {hasSavedTracking && !isEditingTracking ? (
              <div>
                <div className="msc__readonly-box">
                  <div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                      Carrier: <strong>{order.manual_courier_name || "Franch Express"}</strong>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span className="msc__tracking-pill" id="msc-readonly-awb">{order.manual_awb}</span>
                      {(order?.manual_tracking_url || order?.tracking_url || order?.manual_awb) && (
                        <a
                          href={order.manual_tracking_url || order.tracking_url || `https://t.17track.net/en#nums=${encodeURIComponent(order.manual_awb)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: "12px", color: "#8b0030", textDecoration: "underline" }}
                        >
                          Track on 17TRACK ↗
                        </a>
                      )}
                    </div>
                    {order?.shipped_at && (
                      <span className="msc__shipped-time">
                        Shipped on {formatDateTime(order.shipped_at)}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    id="msc-edit-tracking-btn"
                    className="msc__btn msc__btn--edit"
                    onClick={() => {
                      setIsEditingTracking(true);
                      setManualAwb(order.manual_awb || "");
                      setManualCourierName(order.manual_courier_name || "Franch Express");
                      setAwbError("");
                    }}
                    disabled={isSaving || isCancelled || isRefunded}
                    title="Edit tracking ID (preserves shipped timestamp)"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ) : (
              /* When tracking is NOT saved yet, or admin clicked Edit */
              <form onSubmit={hasSavedTracking ? handleUpdateTracking : handleSaveAndShip}>
                <p className="msc__stage-desc">
                  {hasSavedTracking
                    ? "Update tracking ID to correct any typos. Editing will preserve the original shipped timestamp."
                    : "Enter the courier tracking details. Barcode scanner input is accepted with spaces automatically trimmed."}
                </p>

                <div className="msc__form-grid">
                  <div className="msc__form-group">
                    <label className="msc__label" htmlFor="msc-courier-input">
                      Courier Name
                    </label>
                    <input
                      id="msc-courier-input"
                      type="text"
                      className="msc__input"
                      value={manualCourierName}
                      onChange={(e) => setManualCourierName(e.target.value)}
                      disabled={!isPacked || isSaving}
                      placeholder="e.g. Franch Express"
                    />
                  </div>

                  <div className="msc__form-group">
                    <label className="msc__label" htmlFor="msc-awb-input">
                      Tracking ID / AWB Number <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <input
                      id="msc-awb-input"
                      type="text"
                      className={`msc__input ${awbError ? "msc__input--error" : ""}`}
                      value={manualAwb}
                      onChange={handleAwbChange}
                      disabled={!isPacked || isSaving}
                      placeholder="e.g. 48066065272"
                      maxLength={30}
                      autoComplete="off"
                    />
                    {awbError ? (
                      <span className="msc__error-text">{awbError}</span>
                    ) : (
                      <span className="msc__hint">
                        6–30 characters (letters, numbers, hyphens). Spaces stripped automatically.
                      </span>
                    )}
                    {manualAwb.trim().length >= 4 && (
                      <div style={{ marginTop: "6px", fontSize: "12px", color: "#64748b", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: "600", color: "#0f172a" }}>Generated 17TRACK link:</span>
                        <a
                          href={`https://t.17track.net/en#nums=${encodeURIComponent(manualAwb.trim())}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#8b0030", textDecoration: "underline", wordBreak: "break-all" }}
                        >
                          https://t.17track.net/en#nums={manualAwb.trim()} ↗
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {!isPacked && !hasSavedTracking && (
                  <p style={{ fontSize: "12px", color: "#b45309", margin: "0 0 10px 0" }}>
                    ⚠️ Please mark the order as packed above to enable tracking entry.
                  </p>
                )}

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
                  <button
                    type="submit"
                    id="msc-submit-tracking-btn"
                    className="msc__btn msc__btn--primary"
                    disabled={!isPacked || isSaving}
                  >
                    {isSaving && (savingAction === "ship" || savingAction === "edit") ? (
                      <>
                        <span className="msc__spinner" /> Saving...
                      </>
                    ) : hasSavedTracking ? (
                      "Update Tracking ID"
                    ) : (
                      "Save & Mark as Shipped"
                    )}
                  </button>

                  {isEditingTracking && (
                    <button
                      type="button"
                      id="msc-cancel-edit-btn"
                      className="msc__btn msc__btn--secondary"
                      onClick={() => {
                        setIsEditingTracking(false);
                        setManualAwb(order.manual_awb || "");
                        setManualCourierName(order.manual_courier_name || "Franch Express");
                        setAwbError("");
                      }}
                      disabled={isSaving}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>

        {/* ── STAGE 3: DELIVERED ── */}
        <div
          className={`msc__stage ${isDelivered
            ? "msc__stage--completed"
            : isShipped
              ? "msc__stage--active"
              : "msc__stage--locked"
            }`}
          id="msc-stage-3"
        >
          <div className="msc__stage-header">
            <div className="msc__stage-meta">
              <div className="msc__stage-num">
                {isDelivered ? "✓" : "3"}
              </div>
              <span className="msc__stage-name">Stage 3: Order Delivery</span>
            </div>
            <span
              className={`msc__stage-badge ${isDelivered
                ? "msc__stage-badge--done"
                : isShipped
                  ? "msc__stage-badge--active"
                  : "msc__stage-badge--pending"
                }`}
            >
              {isDelivered ? "Delivered" : isShipped ? "In Transit" : "Pending"}
            </span>
          </div>

          <div className="msc__stage-body">
            {isShipped && (
              <>
                <p className="msc__stage-desc">
                  Once the external courier confirms package handover to the customer, mark the order as Delivered.
                </p>
                <button
                  type="button"
                  id="msc-mark-delivered-btn"
                  className="msc__btn msc__btn--deliver"
                  onClick={handleMarkDelivered}
                  disabled={isSaving}
                >
                  {savingAction === "deliver" ? (
                    <>
                      <span className="msc__spinner" /> Marking as Delivered...
                    </>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Mark as Delivered
                    </>
                  )}
                </button>
              </>
            )}

            {isDelivered && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#16a34a", fontWeight: "600" }}>
                <span>✓ Order has been safely delivered to customer.</span>
                {order?.delivered_at && (
                  <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "400" }}>
                    ({formatDateTime(order.delivered_at)})
                  </span>
                )}
              </div>
            )}

            {!isShipped && !isDelivered && (
              <p className="msc__stage-desc">
                Available after the order has been shipped with tracking details.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
