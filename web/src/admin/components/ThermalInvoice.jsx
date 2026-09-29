import React from "react";
import "./ThermalInvoice.css";

const ThermalInvoice = React.forwardRef(({ order, address, isPreview = false }, ref) => {
  if (!order) return null;
  const o = order;
  const orderItems =
    o.order_items && o.order_items.length > 0
      ? o.order_items
      : [{
        product_name: o.item_name || o.product_name || o.name || "Item",
        quantity: o.quantity || o.qty || 1,
        price: o.unit_price || o.price || (o.quantity && Number(o.quantity) > 0 ? Number(o.total_price || 0) / Number(o.quantity) : Number(o.total_price || 0)) || 0,
        size: o.size || o.selected_size || o.sizeDimension || null,
        color: o.color || o.selected_color || null,
        variant: o.variant || o.variant_name || null,
      }];

  const total = Number(o.total_price || 0);
  const invoiceDate = o.order_date
    ? new Date(o.order_date).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "N/A";
  const orderId = o.id ? "#" + String(o.id).slice(-8).toUpperCase() : "#UNKNOWN";

  return (
    <div className={`thermal-invoice ${isPreview ? "thermal-invoice--preview" : ""}`} ref={ref}>
      <div className="ti__header">
        <div className="ti__store-name">ANIKA FASHION</div>
        <div className="ti__tagline">Handcrafted Jewellery</div>
        <div className="ti__divider">========================================</div>
      </div>
      <div className="ti__meta">
        <div className="ti__meta-row"><span>Invoice:</span><span>{orderId}</span></div>
        <div className="ti__meta-row"><span>Date:</span><span>{invoiceDate}</span></div>
        <div className="ti__meta-row"><span>Payment:</span><span>{o.payment || "COD"}</span></div>
      </div>
      <div className="ti__divider">----------------------------------------</div>
      <div className="ti__section-title">CUSTOMER</div>
      <div className="ti__customer">
        <div>{o.customer?.name || "N/A"}</div>
        <div>{o.customer?.phone || o.phone || "N/A"}</div>
      </div>
      {address && (
        <>
          <div className="ti__divider">----------------------------------------</div>
          <div className="ti__section-title">SHIP TO</div>
          <div className="ti__address">
            <div>{address.full_name || o.customer?.name}</div>
            <div>{address.address_line1}</div>
            {address.address_line2 && <div>{address.address_line2}</div>}
            <div>{address.city}, {address.state} - {address.postal_code}</div>
            <div>{address.country || "India"}</div>
            {address.phone_number && <div>Ph: {address.phone_number}</div>}
          </div>
        </>
      )}
      <div className="ti__divider">----------------------------------------</div>
      <div className="ti__section-title">ITEMS</div>
      <div className="ti__items">
        {orderItems.map((item, idx) => {
          const rawSize = item.size || item.selected_size || item.sizeDimension || (!o.order_items ? o.size : null);
          const rawVariant = item.variant || item.variant_name || (!o.order_items ? o.variant : null);
          const rawColor = item.color || item.selected_color || (!o.order_items ? o.color : null);

          const sizeStr = rawSize ? String(rawSize).replace(/^size[:\s-]+/i, "").trim() : null;
          const variantStr = rawVariant
            ? String(rawVariant).replace(/^(variant|color)[:\s-]+/i, "").trim()
            : null;
          const colorStr = rawColor
            ? String(rawColor).replace(/^(variant|color)[:\s-]+/i, "").trim()
            : null;

          // Avoid showing color again if it matches variant
          const showColor = colorStr && (!variantStr || colorStr.toLowerCase() !== variantStr.toLowerCase());
          const showVariant = variantStr && (!colorStr || variantStr.toLowerCase() !== colorStr.toLowerCase());

          const qty = Number(item.quantity || item.qty || 1);
          const unitPrice = Number(item.price || item.unit_price || 0);
          const lineTotal = unitPrice * qty;
          const productName = item.product_name || item.name || item.item_name || "Item";

          return (
            <div key={idx} className="ti__item">
              {/* Header: Item # + Product Name + Line Total */}
              <div className="ti__item-header-row">
                <span className="ti__item-num">{idx + 1}.</span>
                <span className="ti__item-name">{productName}</span>
                <span className="ti__item-price">₹{lineTotal.toLocaleString("en-IN")}</span>
              </div>
              {/* Indented Item Details */}
              <div className="ti__item-details">
                <div className="ti__item-detail-row">
                  <span className="ti__item-detail-label">Qty:</span>
                  <span className="ti__item-detail-val">
                    {qty}{qty > 1 && unitPrice > 0 ? ` × ₹${unitPrice.toLocaleString("en-IN")}` : ""}
                  </span>
                </div>
                {showColor && (
                  <div className="ti__item-detail-row">
                    <span className="ti__item-detail-label">Color:</span>
                    <span className="ti__item-detail-val">{colorStr}</span>
                  </div>
                )}
                {sizeStr && (
                  <div className="ti__item-detail-row">
                    <span className="ti__item-detail-label">Size:</span>
                    <span className="ti__item-detail-val">{sizeStr}</span>
                  </div>
                )}
                {showVariant && (
                  <div className="ti__item-detail-row">
                    <span className="ti__item-detail-label">Variant:</span>
                    <span className="ti__item-detail-val">{variantStr}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="ti__divider">========================================</div>

      {/* Price summary breakdown — only shown when delivery or discount exists */}
      {(() => {
        const deliveryCharge = Number(
          o.shipping_fee ?? o.shippingFee ?? o.delivery_charge ?? o.delivery_fee ?? o.shipping ?? NaN
        );
        const discount = Number(o.discount ?? o.discount_amount ?? o.coupon_discount ?? 0);
        const itemsSubtotal = orderItems.reduce((sum, item) => {
          const qty = Number(item.quantity || item.qty || 1);
          const price = Number(item.price || item.unit_price || 0);
          return sum + (qty * price);
        }, 0);
        const hasDelivery = !isNaN(deliveryCharge) && deliveryCharge > 0;
        const hasDiscount = discount > 0;
        if (!hasDelivery && !hasDiscount) return null;
        return (
          <>
            {itemsSubtotal > 0 && (
              <div className="ti__summary-row">
                <span className="ti__summary-label">Subtotal</span>
                <span className="ti__summary-val">₹{itemsSubtotal.toLocaleString("en-IN")}</span>
              </div>
            )}
            {hasDelivery && (
              <div className="ti__summary-row">
                <span className="ti__summary-label">Delivery</span>
                <span className="ti__summary-val">₹{deliveryCharge.toLocaleString("en-IN")}</span>
              </div>
            )}
            {hasDiscount && (
              <div className="ti__summary-row ti__summary-row--discount">
                <span className="ti__summary-label">Discount</span>
                <span className="ti__summary-val">-₹{discount.toLocaleString("en-IN")}</span>
              </div>
            )}
            <div className="ti__divider">----------------------------------------</div>
          </>
        );
      })()}

      <div className="ti__total-row">
        <span className="ti__total-label">TOTAL</span>
        <span className="ti__total-amount">₹{total.toLocaleString("en-IN")}</span>
      </div>
      <div className="ti__divider">========================================</div>
      <div className="ti__footer">
        <div>Thank you for your order!</div>
        <div>www.anikafashion.in</div>
      </div>
      <div className="ti__cut">- - - - - - - - - - - - - - - - - - - - - - - -</div>
    </div>
  );
});

ThermalInvoice.displayName = "ThermalInvoice";
export default ThermalInvoice;
