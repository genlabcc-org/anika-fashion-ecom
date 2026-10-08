import React from "react";
import "./ThermalInvoice.css";

const formatInvoiceDate = (dateVal) => {
  if (!dateVal) {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];
    const month = months[now.getMonth()] || "Sept";
    const year = now.getFullYear();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hourStr = String(hours).padStart(2, "0");
    return `${day} ${month} ${year}, ${hourStr}:${minutes} ${ampm}`;
  }

  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);

  const day = String(d.getDate()).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];
  const month = months[d.getMonth()] || "Sept";
  const year = d.getFullYear();

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hourStr = String(hours).padStart(2, "0");

  return `${day} ${month} ${year}, ${hourStr}:${minutes} ${ampm}`;
};

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

  const total = Number(o.total_price || o.total || 0);
  const invoiceDate = formatInvoiceDate(o.order_date || o.created_at);

  const rawId = o.invoice_no || o.invoice_number || o.order_number || (o.id ? String(o.id).slice(-8).toUpperCase() : "00000001");
  const invoiceNo = String(rawId).startsWith("#") ? String(rawId) : `#${rawId}`;

  const paymentMode = (() => {
    if (o.payment_mode) return String(o.payment_mode).toUpperCase();
    if (o.payment_method) return String(o.payment_method).toUpperCase();
    if (o.razorpay_payment_id || o.payment_id) return "RAZORPAY";
    if (o.payment) {
      const p = String(o.payment).toUpperCase();
      if (p === "PAID" || p === "ONLINE" || p === "RAZORPAY") return "RAZORPAY";
      return p;
    }
    return "RAZORPAY";
  })();

  // Total quantity of items bought
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

  const recipientName =
    parsedAddress?.full_name ||
    parsedAddress?.name ||
    o.customer?.name ||
    o.customer_name ||
    "Customer";

  const line1 = parsedAddress?.address_line1 || parsedAddress?.line1 || parsedAddress?.flat || parsedAddress?.address || "";
  const line2 = parsedAddress?.address_line2 || parsedAddress?.line2 || parsedAddress?.area || parsedAddress?.street || "";

  const city = parsedAddress?.city || "";
  const state = parsedAddress?.state || "";
  const pincode = parsedAddress?.postal_code || parsedAddress?.pincode || parsedAddress?.zip || "";

  const cityStatePin = (() => {
    const parts = [city, state].filter(Boolean).join(", ");
    if (parts && pincode) return `${parts} - ${pincode}`;
    if (parts) return parts;
    if (pincode) return `Pincode: ${pincode}`;
    return "";
  })();

  const country = parsedAddress?.country || "India";
  const phone =
    parsedAddress?.phone_number ||
    parsedAddress?.phone ||
    parsedAddress?.mobile ||
    o.customer?.phone ||
    o.phone ||
    "N/A";

  return (
    <div className={`thermal-invoice ${isPreview ? "thermal-invoice--preview" : ""}`} ref={ref}>
      {/* ── Box 1: Store Brand Header ── */}
      <div className="ti-box ti-box--header">
        <div className="ti-store-title">ANIKA FASHION STORE</div>
      </div>

      {/* ── Box 2: Invoice Metadata (2 Columns) ── */}
      <div className="ti-box ti-box--meta">
        <div className="ti-meta-left">
          <div className="ti-label">INVOICE NO:</div>
          <div className="ti-val ti-val--invoiceno">{invoiceNo}</div>
          <div className="ti-label ti-label--date">DATE:</div>
          <div className="ti-val ti-val--date">{invoiceDate}</div>
        </div>
        <div className="ti-divider-v" />
        <div className="ti-meta-right">
          <div className="ti-label">PAYMENT MODE:</div>
          <div className="ti-val ti-val--payment">{paymentMode}</div>
        </div>
      </div>

      {/* ── Box 3: Ship To Details ── */}
      <div className="ti-box ti-box--shipto">
        <div className="ti-shipto-heading">SHIP TO</div>
        <div className="ti-shipto-divider" />
        <div className="ti-shipto-body">
          <div className="ti-recipient-name">{recipientName}</div>
          {line1 && <div className="ti-addr-line">{line1}</div>}
          {line2 && <div className="ti-addr-line">{line2}</div>}
          {cityStatePin && <div className="ti-addr-line">{cityStatePin}</div>}
          <div className="ti-addr-line">{country}</div>
          <div className="ti-addr-phone">Phone: {phone}</div>
        </div>
      </div>

      {/* ── Box 4: Total Items & Total Amount (2 Columns) ── */}
      <div className="ti-box ti-box--totals">
        <div className="ti-total-left">
          <div className="ti-label">TOTAL ITEMS:</div>
          <div className="ti-val ti-val--items">
            {totalJewelleryQty} {totalJewelleryQty === 1 ? "Piece" : "Pieces"}
          </div>
        </div>
        <div className="ti-divider-v" />
        <div className="ti-total-right">
          <div className="ti-label">TOTAL AMOUNT:</div>
          <div className="ti-val ti-val--amount">₹{total.toLocaleString("en-IN")}</div>
        </div>
      </div>

      {/* ── Box 5: Footer (Dashed Box) ── */}
      <div className="ti-box ti-box--footer">
        <div className="ti-footer-text">Thank you for shopping with</div>
        <div className="ti-footer-brand">www.AnikaFashion.in</div>
      </div>
    </div>
  );
});

ThermalInvoice.displayName = "ThermalInvoice";
export default ThermalInvoice;
