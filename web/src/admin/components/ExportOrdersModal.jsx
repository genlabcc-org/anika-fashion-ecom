import React, { useState, useEffect, useCallback, useRef } from "react";
import { orderService } from "../../services/orderService";
import {
  generateOrdersCsv,
  downloadCsvFile,
  getExportFilename,
  getPresetDates,
} from "../../utils/exportUtils";
import "./ExportOrdersModal.css";

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "last_7_days", label: "Last 7 days" },
  { key: "last_30_days", label: "Last 30 days" },
  { key: "this_month", label: "This month" },
  { key: "all_time", label: "All time" },
];

const STATUS_OPTIONS = [
  { value: "all_paid", label: "All Paid Orders (Default)" },
  { value: "All Orders", label: "All Orders (Any Status)" },
  { value: "Order Placed", label: "Order Placed" },
  { value: "Confirmed", label: "Confirmed" },
  { value: "Shipped", label: "Shipped" },
  { value: "Delivered", label: "Delivered" },
  { value: "Cancelled", label: "Cancelled" },
  { value: "Refunded", label: "Refunded" },
];

export default function ExportOrdersModal({ isOpen, onClose, onToast }) {
  const [activePreset, setActivePreset] = useState("all_time");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all_paid");
  const [includeRefunded, setIncludeRefunded] = useState(false);
  const [exportFormat, setExportFormat] = useState("csv");

  const [orderCount, setOrderCount] = useState(null);
  const [counting, setCounting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const debounceTimerRef = useRef(null);

  // Initialize or reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setActivePreset("all_time");
      setFromDate("");
      setToDate("");
      setStatusFilter("all_paid");
      setIncludeRefunded(false);
      setErrorMsg("");
      setDownloading(false);
    }
  }, [isOpen]);

  // Fetch count whenever filters change
  const fetchCount = useCallback(async (from, to, incRefunded, status) => {
    try {
      setCounting(true);
      setErrorMsg("");
      const count = await orderService.getOrderExportCount({
        from,
        to,
        includeRefunded: incRefunded,
        status,
      });
      setOrderCount(count);
    } catch (err) {
      console.error("Count fetch failed:", err?.message || err);
      setErrorMsg("Failed to check matching orders count.");
    } finally {
      setCounting(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchCount(fromDate, toDate, includeRefunded, statusFilter);
    }, 250);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isOpen, fromDate, toDate, includeRefunded, statusFilter, fetchCount]);

  if (!isOpen) return null;

  const handleSelectPreset = (presetKey) => {
    setActivePreset(presetKey);
    const { from, to } = getPresetDates(presetKey);
    setFromDate(from);
    setToDate(to);
  };

  const handleCustomDateChange = (type, val) => {
    setActivePreset("custom");
    if (type === "from") {
      setFromDate(val);
    } else {
      setToDate(val);
    }
  };

  const handleDownload = async () => {
    if (downloading) return;
    if (orderCount === 0) {
      const msg = "No orders found for this range";
      setErrorMsg(msg);
      if (onToast) onToast(msg, "warning");
      return;
    }

    try {
      setDownloading(true);
      setErrorMsg("");

      const rows = await orderService.exportOrdersData({
        from: fromDate,
        to: toDate,
        includeRefunded,
        status: statusFilter,
      });

      if (!rows || rows.length === 0) {
        const msg = "No orders found for this range";
        setErrorMsg(msg);
        if (onToast) onToast(msg, "warning");
        return;
      }

      const csvContent = generateOrdersCsv(rows);
      const filename = getExportFilename({ from: fromDate, to: toDate });

      downloadCsvFile(csvContent, filename);

      if (onToast) {
        onToast(`Successfully exported ${rows.length} ${rows.length === 1 ? "order" : "orders"} to CSV!`, "success");
      }
      onClose();
    } catch (err) {
      console.error("Export error:", err?.message || err);
      const msg = err?.message || "Failed to export order data. Please try again.";
      setErrorMsg(msg);
      if (onToast) onToast(msg, "error");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="eom__overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="eom-title">
      <div className="eom__content" onClick={(e) => e.stopPropagation()}>
        {/* ── Modal Header ── */}
        <div className="eom__header">
          <div className="eom__header-text">
            <h3 id="eom-title" className="eom__title">Download Order Data</h3>
            <p className="eom__subtitle">
              Export customer names, emails, prices, and timestamps to an Excel-friendly CSV.
            </p>
          </div>
          <button
            type="button"
            className="eom__close-btn"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* ── Modal Body ── */}
        <div className="eom__body">
          {/* Section: Date Range */}
          <div className="eom__field-group">
            <label className="eom__label">Date Range</label>
            <div className="eom__presets-row">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`eom__preset-btn${activePreset === p.key ? " eom__preset-btn--active" : ""}`}
                  onClick={() => handleSelectPreset(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="eom__dates-grid">
              <div className="eom__date-input-wrap">
                <span className="eom__input-sublabel">From (Start of day)</span>
                <input
                  type="date"
                  className="eom__date-input"
                  value={fromDate}
                  onChange={(e) => handleCustomDateChange("from", e.target.value)}
                  placeholder="From date"
                />
              </div>
              <div className="eom__date-input-wrap">
                <span className="eom__input-sublabel">To (End of day)</span>
                <input
                  type="date"
                  className="eom__date-input"
                  value={toDate}
                  min={fromDate || undefined}
                  onChange={(e) => handleCustomDateChange("to", e.target.value)}
                  placeholder="To date"
                />
              </div>
            </div>
          </div>

          {/* Section: Status Filter & Options */}
          <div className="eom__field-group">
            <label className="eom__label">Order Status</label>
            <select
              className="eom__select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <label className="eom__checkbox-row">
              <input
                type="checkbox"
                className="eom__checkbox"
                checked={includeRefunded}
                onChange={(e) => setIncludeRefunded(e.target.checked)}
              />
              <span className="eom__checkbox-label">
                Include refunded / cancelled orders
              </span>
            </label>
          </div>

          {/* Section: File Format */}
          <div className="eom__field-group">
            <label className="eom__label">Export Format</label>
            <div className="eom__format-box">
              <div className="eom__format-radio-wrap">
                <input
                  type="radio"
                  id="fmt-csv"
                  name="exportFormat"
                  value="csv"
                  checked={exportFormat === "csv"}
                  onChange={() => setExportFormat("csv")}
                />
                <label htmlFor="fmt-csv" className="eom__format-title">
                  CSV (.csv)
                </label>
                <span className="eom__format-badge">UTF-8 with BOM</span>
              </div>
              <p className="eom__format-desc">
                Columns: <strong>Order ID, Customer Name, Email ID, Price, Date &amp; Time (IST)</strong>.
                Formula-injection safe and formatted for Excel / Google Sheets calculation.
              </p>
            </div>
          </div>

          {/* Section: Count Preview / Status Indicator */}
          <div className={`eom__preview-card${orderCount === 0 && !counting ? " eom__preview-card--empty" : ""}`}>
            <span className="eom__preview-icon">
              {counting ? "⏳" : orderCount === 0 ? "⚠️" : "📊"}
            </span>
            <div className="eom__preview-text">
              {counting ? (
                <span>Calculating matching orders…</span>
              ) : orderCount === 0 ? (
                <span className="eom__preview-empty">No orders found for this range</span>
              ) : (
                <span>
                  <strong>{orderCount?.toLocaleString("en-IN")}</strong>{" "}
                  {orderCount === 1 ? "order" : "orders"} will be exported
                </span>
              )}
            </div>
          </div>

          {/* Error notice if present */}
          {errorMsg && (
            <div className="eom__error-banner" role="alert">
              <span>⚠️ {errorMsg}</span>
            </div>
          )}
        </div>

        {/* ── Modal Footer ── */}
        <div className="eom__footer">
          <button
            type="button"
            className="eom__btn eom__btn--cancel"
            onClick={onClose}
            disabled={downloading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="eom__btn eom__btn--download"
            onClick={handleDownload}
            disabled={downloading || counting || orderCount === 0}
            title={orderCount === 0 ? "No orders to export" : "Download CSV file"}
          >
            {downloading ? (
              <>
                <span className="eom__spinner" />
                <span>Exporting Orders…</span>
              </>
            ) : (
              <>
                <span>📥</span>
                <span>Download CSV</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
