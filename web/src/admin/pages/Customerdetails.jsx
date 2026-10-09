import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { orderService } from "../../services/orderService";
import { supabase } from "../../lib/supabase";
import { useStore } from "../../hooks/useStore";
import { isRevenueOrder } from "../../utils/orderUtils";
import "./Customerdetails.css";

const RingProductImage = () => (
  <div className="cd__product-img">
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="6" fill="#fff3e0" />
      <ellipse cx="18" cy="20" rx="8" ry="4" stroke="#b45309" strokeWidth="1.5" fill="none" />
      <ellipse cx="18" cy="16" rx="5" ry="3" fill="#fbbf24" opacity="0.7" />
      <circle cx="18" cy="13" r="4" fill="#fbbf24" />
      <circle cx="18" cy="13" r="2" fill="#f59e0b" />
      <circle cx="16.5" cy="12" r="0.7" fill="#fff" opacity="0.8" />
    </svg>
  </div>
);

const StatusBadge = ({ status }) => {
  const map = {
    Pending:   { bg: "#fff7ed", color: "#ea580c" },
    Delivered: { bg: "#f0fdf4", color: "#16a34a" },
    Cancelled: { bg: "#fef2f2", color: "#dc2626" },
    Blocked:   { bg: "#fef2f2", color: "#dc2626" },
    Confirmed: { bg: "#f5f3ff", color: "#7c3aed" },
    Shipped:   { bg: "#fef9c3", color: "#a16207" }
  };
  const s = map[status] || { bg: "#f5f5f5", color: "#666" };
  return (
    <span className="cd__status-badge" style={{ background: s.bg, color: s.color }}>
      {status}
    </span>
  );
};

const CustomerDetails = ({ customer, onBack }) => {
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm]   = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const setSelectedProduct = useStore(state => state.setSelectedProduct);
  const navigate = useNavigate();

  const handleItemClick = async (item) => {
    if (!item.product_id) return;
    const { data: product, error } = await supabase
      .from("products")
      .select("product_id, name, description, price, compare_price, image_url, images, sizes, stock, sku, categories(name)")
      .eq("product_id", item.product_id)
      .single();
    if (error || !product) return;

    setSelectedProduct({
      ...product,
      id: product.product_id,
      productId: product.product_id,
      img: product.image_url || product.images?.[0] || "/src/assets/cart/bangle1.webp",
      desc: product.description,
      originalPrice: product.compare_price || Math.round(product.price * 1.3),
      sizes: product.sizes || [],
      stock: product.stock > 0 ? "in-stock" : "out-of-stock",
      category: product.categories?.name || "Bangles",
    });
    navigate("/product");
  };

  const c = customer || {
    id: "UNKNOWN",
    name: "Unknown Customer",
    phone: "N/A",
    email: "N/A",
    created_at: new Date().toISOString(),
    orderCount: 0,
    totalSpent: 0
  };

  useEffect(() => {
    if (c.id && c.id !== "UNKNOWN") {
      const fetchAddresses = async () => {
        try {
          setAddressesLoading(true);
          const data = await orderService.getAddresses(c.id);
          setAddresses(data || []);
        } catch (err) {
          console.error("Error fetching customer addresses:", err);
        } finally {
          setAddressesLoading(false);
        }
      };

      const fetchOrders = async () => {
        try {
          setOrdersLoading(true);
          const data = await orderService.getOrders(c.id);
          setOrders(data || []);
        } catch (err) {
          console.error("Error fetching customer orders:", err);
        } finally {
          setOrdersLoading(false);
        }
      };

      fetchAddresses();
      fetchOrders();
    }
  }, [c.id]);

  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const totalSpent = orders
      .filter(isRevenueOrder)
      .reduce((sum, o) => sum + Number(o.total_price || 0), 0);
    const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;
    const lastOrder = orders[0]?.order_date 
      ? new Date(orders[0].order_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "N/A";

    return {
      totalOrders,
      totalSpent,
      avgOrderValue,
      lastOrder
    };
  }, [orders]);

  const recentActivity = useMemo(() => {
    const activities = [];
    if (c.created_at) {
      activities.push({
        color: "#10b981",
        text: `Account created on ${new Date(c.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
      });
    }
    [...orders].reverse().forEach(order => {
      activities.push({
        color: order.status === 'Cancelled' ? '#ef4444' : order.status === 'Delivered' ? '#10b981' : '#f59e0b',
        text: `Placed order #${order.id} — ${order.item_name} (Qty: ${order.quantity}, Total: ₹${Number(order.total_price).toLocaleString('en-IN')}) on ${new Date(order.order_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
      });
    });
    return activities.reverse(); // Newest first
  }, [c.created_at, orders]);

  const customerPhone = useMemo(() => {
    if (c.phone && c.phone !== "N/A" && String(c.phone).trim() !== "") return c.phone;
    if (c.phone_number && c.phone_number !== "N/A" && String(c.phone_number).trim() !== "") return c.phone_number;
    if (c.mobile && c.mobile !== "N/A" && String(c.mobile).trim() !== "") return c.mobile;
    if (c.phoneNumber && c.phoneNumber !== "N/A" && String(c.phoneNumber).trim() !== "") return c.phoneNumber;

    const defaultAddr = addresses.find(a => a.is_default) || addresses[0];
    if (defaultAddr && (defaultAddr.phone_number || defaultAddr.phone)) {
      return defaultAddr.phone_number || defaultAddr.phone;
    }

    if (orders && orders.length > 0) {
      for (const ord of orders) {
        if (ord.phone) return ord.phone;
        if (ord.phone_number) return ord.phone_number;
        if (ord.customer?.phone && ord.customer.phone !== "N/A") return ord.customer.phone;
        if (ord.shipping_address?.phone) return ord.shipping_address.phone;
        if (ord.shipping_address?.phone_number) return ord.shipping_address.phone_number;
      }
    }
    return "No phone set";
  }, [c, addresses, orders]);

  return (
    <div className="cd">

      {/* ── Header ── */}
      <div className="cd__header">
        <button className="cd__back-btn" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Customer Details
        </button>
        <div className="cd__header-meta">
          <span className="cd__header-date">
            Joined on {c.created_at ? new Date(c.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "N/A"}
          </span>
          <StatusBadge status="Active" />
        </div>
      </div>

      {/* ── Profile Info ── */}
      <div className="cd__section cd__profile-grid">
        <div className="cd__card">
          <div className="cd__card-title">Profile Info</div>
          <div className="cd__info-rows">
            <div className="cd__info-row"><span className="cd__info-label">Full name</span><span className="cd__info-value">{c.name}</span></div>
            <div className="cd__info-row"><span className="cd__info-label">Phone</span><span className="cd__info-value">{customerPhone}</span></div>
            <div className="cd__info-row"><span className="cd__info-label">Email</span><span className="cd__info-value cd__info-value--email">{c.email || "N/A"}</span></div>
            <div className="cd__info-row">
              <span className="cd__info-label">Account created</span>
              <span className="cd__info-value">
                {c.created_at ? new Date(c.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "N/A"}
              </span>
            </div>
          </div>
        </div>
        <div className="cd__card">
          <div className="cd__card-title">Order Summary</div>
          <div className="cd__info-rows">
            <div className="cd__info-row">
              <span className="cd__info-label">Total orders</span>
              <span className="cd__info-value">
                {ordersLoading ? (
                  <span className="skeleton-shimmer" style={{ display: 'inline-block', width: '40px', height: '14px', borderRadius: '4px' }} />
                ) : (
                  `${stats.totalOrders} orders`
                )}
              </span>
            </div>
            <div className="cd__info-row">
              <span className="cd__info-label">Total spent</span>
              <span className="cd__info-value">
                {ordersLoading ? (
                  <span className="skeleton-shimmer" style={{ display: 'inline-block', width: '60px', height: '14px', borderRadius: '4px' }} />
                ) : (
                  `₹${stats.totalSpent.toLocaleString("en-IN")}`
                )}
              </span>
            </div>
            <div className="cd__info-row">
              <span className="cd__info-label">Last order</span>
              <span className="cd__info-value">
                {ordersLoading ? (
                  <span className="skeleton-shimmer" style={{ display: 'inline-block', width: '80px', height: '14px', borderRadius: '4px' }} />
                ) : (
                  stats.lastOrder
                )}
              </span>
            </div>
            <div className="cd__info-row">
              <span className="cd__info-label">Avg. order value</span>
              <span className="cd__info-value">
                {ordersLoading ? (
                  <span className="skeleton-shimmer" style={{ display: 'inline-block', width: '60px', height: '14px', borderRadius: '4px' }} />
                ) : (
                  `₹${Math.round(stats.avgOrderValue).toLocaleString("en-IN")}`
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Saved Addresses ── */}
      <div className="cd__section">
        <div className="cd__section-title">Saved Addresses</div>
        {addressesLoading ? (
          <div className="cd__address-grid">
            <div className="cd__card skeleton-shimmer" style={{ height: '120px', opacity: 0.85 }} />
            <div className="cd__card skeleton-shimmer" style={{ height: '120px', opacity: 0.85 }} />
          </div>
        ) : addresses.length > 0 ? (
          <div className="cd__address-grid">
            {addresses.map((addr, i) => (
              <div key={i} className="cd__card">
                <div className="cd__address-label">{addr.address_type || "Address"}{addr.is_default && " (Default)"}</div>
                <div className="cd__address-name">{addr.full_name}</div>
                <div className="cd__address-lines">
                  <span>{addr.address_line1}</span>
                  {addr.address_line2 && <span>{addr.address_line2}</span>}
                  <span>{addr.city}, {addr.state} — {addr.postal_code}</span>
                  <span>{addr.country}</span>
                  <span>Phone: {addr.phone_number}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="cd__card" style={{ color: 'var(--cd-text-muted)', fontStyle: 'italic', fontSize: '13.5px' }}>
            No saved addresses found for this customer.
          </div>
        )}
      </div>

      {/* ── Order History ── */}
      <div className="cd__section">
        <div className="cd__section-title">Order History</div>
        <div className="cd__card cd__card--no-pad">
          {ordersLoading ? (
            <>
              <div className="cd__order-row skeleton-shimmer" style={{ height: '72px', opacity: 0.85 }} />
              <div className="cd__order-row skeleton-shimmer" style={{ height: '72px', opacity: 0.85 }} />
            </>
          ) : orders.length > 0 ? (
            orders.map((order, i) => {
              const orderItems = order.order_items && order.order_items.length > 0
                ? order.order_items
                : [{
                    product_id: order.product_id || null,
                    product_name: order.item_name,
                    quantity: order.quantity || 1,
                    price: order.total_price || 0,
                    size: null,
                    color: null,
                    image_url: null,
                    sku: order.sku || null
                  }];
              
              return (
                <div 
                  key={order.id} 
                  className="cd__order-block" 
                  style={{ 
                    borderBottom: i < orders.length - 1 ? '1px solid var(--cd-border)' : 'none', 
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  {/* Order header information */}
                  <div className="cd__order-header" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <span style={{ fontWeight: '600', color: 'var(--cd-text-primary)', fontSize: '13.5px' }}>Order Ref: #{order.id?.slice(-8) || order.id}</span>
                      <span style={{ color: '#aaa', margin: '0 8px' }}>·</span>
                      <span style={{ fontSize: '12px', color: 'var(--cd-text-muted)' }}>
                        {order.order_date ? new Date(order.order_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "N/A"}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: '600', color: 'var(--cd-text-primary)' }}>₹{Number(order.total_price).toLocaleString("en-IN")}</span>
                      <span style={{ fontSize: '11px', color: '#888', background: '#f5f5f5', padding: '2px 6px', borderRadius: '4px' }}>{order.payment}</span>
                      <StatusBadge status={order.status} />
                    </div>
                  </div>

                  {/* Items inside this order */}
                  <div className="cd__order-items" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {orderItems.map((item, idx) => {
                      const image = item.image_url || '/src/assets/cart/bangle1.webp';
                      const isClickable = !!item.product_id;
                      const resolvedSku =
                        item.sku && item.sku !== 'N/A' && item.sku !== 'undefined' ? item.sku : null;

                      return (
                        <div 
                          key={idx} 
                          className="cd__order-item-row" 
                          onClick={() => isClickable && handleItemClick(item)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '8px',
                            borderRadius: '8px',
                            cursor: isClickable ? 'pointer' : 'default',
                            background: '#fafafa',
                            border: '1px solid #f0f0f0',
                            transition: 'background-color 0.2s ease',
                          }}
                        >
                          <div className="cd__product-img" style={{ width: '40px', height: '40px', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #ebebeb' }}>
                            {image ? (
                              <img src={image} alt={item.product_name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px' }} />
                            ) : (
                              "✨"
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12.5px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product_name}</span>
                              {resolvedSku ? (
                                <span
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
                                <span style={{ fontSize: '10px', color: '#8b0030', fontWeight: 'normal', flexShrink: 0 }}>(View)</span>
                              )}
                            </div>
                            <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                              Qty: {item.quantity} 
                              {(item.size || item.color) && ` · Size: ${item.size || 'N/A'} · Color: ${item.color || 'N/A'}`}
                            </div>
                          </div>
                          <div style={{ fontSize: '12.5px', fontWeight: '600', color: 'var(--cd-text-primary)', textAlign: 'right' }}>
                            ₹{Number(item.price || 0).toLocaleString('en-IN')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--cd-text-muted)', fontStyle: 'italic', fontSize: '13.5px' }}>
              No order history found.
            </div>
          )}
        </div>
      </div>

      {/* ── Wishlist ── */}
      <div className="cd__section">
        <div className="cd__section-title-row">
          <div className="cd__section-title">Wishlist</div>
          <div className="cd__wishlist-count">0 Items Wishlisted</div>
        </div>
        <div className="cd__card" style={{ color: 'var(--cd-text-muted)', fontStyle: 'italic', fontSize: '13.5px' }}>
          No wishlisted items found (customer wishlists are kept private).
        </div>
      </div>

      {/* ── Recent Activity ── */}
      <div className="cd__section">
        <div className="cd__section-title">Recent activity</div>
        <div className="cd__card">
          {ordersLoading ? (
            <div className="skeleton-shimmer" style={{ height: '80px', borderRadius: '6px' }} />
          ) : recentActivity.length > 0 ? (
            recentActivity.map((act, i) => (
              <div key={i} className="cd__activity-row">
                <span className="cd__activity-dot" style={{ background: act.color }} />
                <span className="cd__activity-text">{act.text}</span>
              </div>
            ))
          ) : (
            <div style={{ color: 'var(--cd-text-muted)', fontStyle: 'italic', fontSize: '13.5px' }}>
              No recent activity recorded.
            </div>
          )}
        </div>
      </div>

      {/* ── Account Controls ── */}
      <div className="cd__section">
        <div className="cd__section-title">Account controls</div>
        <div className="cd__card cd__controls-card">
          <div className="cd__controls-warning">
            <span className="cd__warning-dot" />
            <div>
              <div className="cd__warning-title">Disabling this account will prevent the customer from logging in or placing new orders.</div>
              <div className="cd__warning-sub">Their catalog and history data will be preserved. You can re-enable at any time.</div>
            </div>
          </div>
          <div className="cd__controls-btns">
            <button className="cd__btn cd__btn--disable" onClick={() => setShowDisableConfirm(true)}>
              Disable Account
            </button>
            <button className="cd__btn cd__btn--delete" onClick={() => setShowDeleteConfirm(true)}>
              Delete Account Permanently
            </button>
          </div>
        </div>
      </div>

      {/* ── Disable Confirm Modal ── */}
      {showDisableConfirm && (
        <div className="cd__modal-overlay" onClick={() => setShowDisableConfirm(false)}>
          <div className="cd__modal" onClick={(e) => e.stopPropagation()}>
            <div className="cd__modal-title">Disable Account?</div>
            <div className="cd__modal-body">This will prevent the customer from logging in or placing orders. You can re-enable at any time.</div>
            <div className="cd__modal-btns">
              <button className="cd__btn cd__btn--cancel" onClick={() => setShowDisableConfirm(false)}>Cancel</button>
              <button className="cd__btn cd__btn--disable" onClick={() => setShowDisableConfirm(false)}>Disable</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {showDeleteConfirm && (
        <div className="cd__modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="cd__modal" onClick={(e) => e.stopPropagation()}>
            <div className="cd__modal-title">Delete Account Permanently?</div>
            <div className="cd__modal-body">This action cannot be undone. All customer data will be permanently removed.</div>
            <div className="cd__modal-btns">
              <button className="cd__btn cd__btn--cancel" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="cd__btn cd__btn--delete" onClick={() => setShowDeleteConfirm(false)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerDetails;