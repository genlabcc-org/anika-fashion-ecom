import React from "react";
import "./ThermalInvoice.css";

const ThermalInvoice = React.forwardRef(({ order, address, isPreview = false }, ref) => {
  if (!order) return null;
  const o = order;
  const orderItems =
    o.order_items && o.order_items.length > 0
      ? o.order_items
      : [{
        quantity: o.quantity || o.qty || 1,
        price: o.unit_price || o.price || (o.quantity && Number(o.quantity) > 0 ? Number(o.total_price || 0) / Number(o.quantity) : Number(o.total_price || 0)) || 0,
      }];

  const total = Number(o.total_price || 0);
  const invoiceDate = o.order_date
    ? new Date(o.order_date).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
    : "N/A";
  const rawId = o.id ? String(o.id).slice(-8).toUpperCase() : "UNKNOWN";
  const orderId = "#" + rawId;
  const trackingNumber = o.tracking_number || o.awb_number || o.icarry_awb || o.waybill || null;

  // Total quantity of jewellery pieces bought
  const totalJewelleryQty = orderItems.reduce((sum, item) => {
    return sum + Number(item.quantity || item.qty || 1);
  }, 0);

  // Address resolution
  const effectiveAddress = address || o.shipping_address || o.address || null;
  const parsedAddress =
    typeof effectiveAddress === "string"
      ? (() => {
        try {
          return JSON.parse(effectiveAddress);
        } catch {
          return { address_line1: effectiveAddress };
        }
      })()
      : effectiveAddress;

  return (
    <div className={`thermal-invoice ${isPreview ? "thermal-invoice--preview" : ""}`} ref={ref}>
      {/* ── Brand Header ── */}
      <div className="ti-card ti-header-card">
        <div className="ti-brand-title">ANIKA FASHION</div>
        <div className="ti-brand-sub">HANDCRAFTED JEWELLERY · INVOICE & PACKING SLIP</div>
        <div className="ti-brand-web">www.anikafashion.in</div>
      </div>

      {/* ── Order Information ── */}
      <div className="ti-card ti-meta-card">
        <div className="ti-meta-grid">
          <div className="ti-meta-col">
            <div className="ti-meta-item">
              <span className="ti-lbl">ORDER ID:</span>
              <span className="ti-val ti-val--bold">{orderId}</span>
            </div>
            <div className="ti-meta-item">
              <span className="ti-lbl">DATE:</span>
              <span className="ti-val">{invoiceDate}</span>
            </div>
          </div>
          <div className="ti-meta-col">
            <div className="ti-meta-item">
              <span className="ti-lbl">PAYMENT MODE:</span>
              <span className="ti-val ti-val--badge">{o.payment || "COD"}</span>
            </div>
            {trackingNumber && (
              <div className="ti-meta-item">
                <span className="ti-lbl">AWB / TRACKING:</span>
                <span className="ti-val">{trackingNumber}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Shipping & Customer Details ── */}
      <div className="ti-card ti-address-card">
        <div className="ti-card-heading">SHIP TO</div>
        <div className="ti-address-block">
          <div className="ti-addr-recipient">{parsedAddress?.full_name || o.customer?.name || "Customer"}</div>
          {parsedAddress ? (
            <div className="ti-addr-lines">
              {parsedAddress.address_line1 && <div>{parsedAddress.address_line1}</div>}
              {parsedAddress.address_line2 && <div>{parsedAddress.address_line2}</div>}
              <div>
                {[parsedAddress.city, parsedAddress.state].filter(Boolean).join(", ")}
                {parsedAddress.postal_code ? ` - ${parsedAddress.postal_code}` : ""}
              </div>
              <div>{parsedAddress.country || "India"}</div>
            </div>
          ) : (
            <div className="ti-addr-lines">
              <div>Customer Address on file</div>
            </div>
          )}
          <div className="ti-addr-phone">
            <strong>Phone:</strong> {parsedAddress?.phone_number || parsedAddress?.phone || o.customer?.phone || o.phone || "N/A"}
          </div>
        </div>
      </div>

      {/* ── Jewellery & Quantity Table ── */}
      <div className="ti-card ti-items-card">
        <table className="ti-table">
          <thead>
            <tr>
              <th className="ti-th ti-th-num">#</th>
              <th className="ti-th ti-th-desc">Category</th>
              <th className="ti-th ti-th-qty">Quantity (Qty)</th>
              <th className="ti-th ti-th-total">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="ti-tr">
              <td className="ti-td ti-td-num">1</td>
              <td className="ti-td ti-td-desc">
                <div className="ti-prod-name">Handcrafted Jewellery</div>
              </td>
              <td className="ti-td ti-td-qty">
                <span className="ti-qty-pill">{totalJewelleryQty} {totalJewelleryQty === 1 ? "Piece" : "Pieces"}</span>
              </td>
              <td className="ti-td ti-td-total">₹{total.toLocaleString("en-IN")}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Total Jewellery Summary Box ── */}
      <div className="ti-card ti-summary-card">
        <div className="ti-total-box">
          <div className="ti-total-left">
            <span className="ti-total-qty-label">TOTAL JEWELLERY BOUGHT:</span>
            <span className="ti-total-qty-val">{totalJewelleryQty} {totalJewelleryQty === 1 ? "Piece" : "Pieces"}</span>
          </div>
          <div className="ti-total-right">
            <span className="ti-total-label">TOTAL AMOUNT:</span>
            <span className="ti-total-val">₹{total.toLocaleString("en-IN")}</span>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="ti-card ti-footer-card">
        <div className="ti-footer-msg">Thank you for shopping with Anika Fashion!</div>
        <div className="ti-footer-sub">100% Certified Handcrafted Jewellery · www.anikafashion.in</div>
      </div>
    </div>
  );
});

ThermalInvoice.displayName = "ThermalInvoice";
export default ThermalInvoice;
