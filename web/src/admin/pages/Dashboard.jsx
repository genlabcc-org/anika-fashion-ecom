import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { productService } from "../../services/productService";
import { useAdminData } from "../../hooks/useAdminData";
import { Routes, Route, Link, useNavigate, useLocation, Navigate, useSearchParams } from "react-router-dom";
import { useStore } from "../../hooks/useStore";
import { getUserInitials } from "../../utils/avatarUtils";
import { isRevenueOrder } from "../../utils/orderUtils";
import "./Dashboard.css";


import logo from "../../assets/admin/AnikaLogo.png";
import dashboardIcon from "../../assets/admin/Home.png";
import productIcon from "../../assets/admin/product.png";
import categoryIcon from "../../assets/admin/category.png";
import orderIcon from "../../assets/admin/order.png";
import customerIcon from "../../assets/admin/customer.png";
import bannerIcon from "../../assets/admin/banner.png";
import analyticsIcon from "../../assets/admin/analytics.png";
import settingsIcon from "../../assets/admin/settings.png";
import searchIcon from "../../assets/admin/search.png";
import dropdownIcon from "../../assets/admin/dropdown.png";

import AddProduct from "./addproduct";
import ProductList from "./productlist";

import AddCategory from "./addcategory";
import SubCategoryForm from "./cat/FormCategory";
import SubCategory from "./cat/SubCategory";

import ProductVariant from "./variant/ProductVariant";

import CategoryList from "./categorylist";
import AllOrders from "./Allorders";
import OrderDetails from "./Orderdetails";
import AllCustomers from "./Allcustomers";
import CustomerDetails from "./Customerdetails";
import AddBanner from "./Addbanner";
import BannerList from "./Bannerlist";
import SocialMedia from "./social/socialMedia";
import Analytics from "./Analytics";
import StoreInfo from "./Storeinfo";
import Policies from "./Policies";
import Contact from "./Contact";
import Shipping from "./Shipping";
import Payment from "./Payment";
import AdminAccount from "./Adminaccount";
import DangerZone from "./Dangerzone";
import Notification from "./Notification";
import Invoices from "./Invoices";

// ── Icons ───────────────────────────────────────────────────────
const StatIcon = ({ type }) => {
  const icons = {
    orders: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
    ),
    revenue: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
    customers: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    pending: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  };
  return icons[type] || null;
};

const ArrowUp = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>;
const ArrowDown = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>;
const ChevronDown = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>;
const ChevronUp = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>;

const HamburgerIcon = ({ open }) =>
  open ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );

// ── Menu Config ─────────────────────────────────────────────────
const menuItems = [
  { id: "dashboard", label: "Dashboard", path: "/admin" },
  {
    id: "category", label: "Category", path: "/admin/categories", children: [
      { label: "All Categories", path: "/admin/categories" },
      { label: "Add Category", path: "/admin/categories/add" },
    ]
  },
  {
    id: "product", label: "Product", path: "/admin/products", children: [
      { label: "All Products", path: "/admin/products" },
      { label: "Add Product", path: "/admin/products/add" },
    ]
  },
  { id: "order", label: "Orders", path: "/admin/orders" },
  { id: "invoice", label: "Invoices", path: "/admin/invoices" },
  { id: "customer", label: "Customers", path: "/admin/customers" },
  {
    id: "banner", label: "Banner & Content", path: "/admin/banners", children: [
      { label: "All Banners", path: "/admin/banners" },
      { label: "Add Banner", path: "/admin/banners/add" },
    ]
  },
  { id: "social", label: "Social Media", path: "/admin/social" },
  { id: "analytics", label: "Analytics", path: "/admin/analytics" },
  {
    id: "settings", label: "Settings", path: "/admin/account", children: [
      { label: "Store Info", path: "/admin/store" },
      { label: "Contact", path: "/admin/contact" },
      { label: "Shipping", path: "/admin/shipping" },
      { label: "Payment", path: "/admin/payment" },
      { label: "Admin Account", path: "/admin/account" },
      { label: "Notification", path: "/admin/notification" },
      { label: "Policies", path: "/admin/policies" },
      { label: "Danger Zone", path: "/admin/danger" },
    ]
  },
];

const sidebarIcons = {
  dashboard: <img src={dashboardIcon} alt="dashboard" className="db__menu-icon-img" />,
  product: <img src={productIcon} alt="product" className="db__menu-icon-img" />,
  category: <img src={categoryIcon} alt="category" className="db__menu-icon-img" />,
  order: <img src={orderIcon} alt="order" className="db__menu-icon-img" />,
  invoice: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  customer: <img src={customerIcon} alt="customer" className="db__menu-icon-img" />,
  banner: <img src={bannerIcon} alt="banner" className="db__menu-icon-img" />,
  social: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  ),
  analytics: <img src={analyticsIcon} alt="analytics" className="db__menu-icon-img" />,
  settings: <img src={settingsIcon} alt="settings" className="db__menu-icon-img" />,
};

const HIDE_ADD_PRODUCT_PATHS = [
  "/admin/categories", "/admin/categories/add", "/admin/products/add",
  "/admin/orders", "/admin/orders/detail", "/admin/invoices",
  "/admin/customers", "/admin/customers/detail",
  "/admin/banners", "/admin/banners/add", "/admin/social", "/admin/banners/social", "/admin/analytics",
  "/admin/store", "/admin/contact", "/admin/shipping", "/admin/payment",
  "/admin/account", "/admin/notification", "/admin/policies", "/admin/danger"
];

// ── Sub-Components ──────────────────────────────────────────────
const StatCard = ({ icon, label, value, change, changeType, subtext, color, loading }) => {
  if (loading) {
    return (
      <div className="dc__stat-card skeleton-shimmer" style={{ minHeight: '138px', opacity: 0.85 }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(255,255,255,0.4)', marginBottom: '12px' }} />
        <div style={{ width: '60%', height: '14px', background: 'rgba(255,255,255,0.4)', marginBottom: '8px', borderRadius: '4px' }} />
        <div style={{ width: '40%', height: '24px', background: 'rgba(255,255,255,0.4)', borderRadius: '4px' }} />
      </div>
    );
  }

  return (
    <div className="dc__stat-card">
      <div className="dc__stat-icon" style={{ backgroundColor: color + "15", color: color }}>
        <StatIcon type={icon} />
      </div>
      <div className="dc__stat-label">{label}</div>
      <div className="dc__stat-value">{value}</div>
      <div className="dc__stat-change">
        {change ? (
          <span className={`dc__change-badge dc__change-badge--${changeType}`}>
            {changeType === "up" ? <ArrowUp /> : changeType === "down" ? <ArrowDown /> : null}
            {change}
          </span>
        ) : null}
        <span className="dc__change-text">{subtext}</span>
      </div>
    </div>
  );
};

const RevenueChart = ({ orders, loading }) => {
  const chartData = useMemo(() => {
    const data = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      d.setHours(0, 0, 0, 0);

      const dayOrders = orders.filter(o => {
        const oDate = new Date(o.order_date);
        oDate.setHours(0, 0, 0, 0);
        return oDate.getTime() === d.getTime() && isRevenueOrder(o);
      });

      const dailyRevenue = dayOrders.reduce((sum, o) => sum + Number(o.total_price || 0), 0);
      const dailyCustomers = new Set(dayOrders.map(o => o.user_id)).size;

      data.push({
        day: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2).toUpperCase(),
        rev: dailyRevenue,
        cust: dailyCustomers
      });
    }
    return data;
  }, [orders]);

  if (loading) {
    return (
      <div className="dc__chart-container skeleton-shimmer" style={{ height: '254px', opacity: 0.85, borderRadius: '12px' }} />
    );
  }

  const maxRev = Math.max(...chartData.map(d => d.rev), 100);
  const maxScaleVal = Math.ceil(maxRev / 100) * 100;

  const W = 520, H = 180;
  const pad = { t: 20, r: 30, b: 30, l: 50 };
  const cw = W - pad.l - pad.r;
  const ch = H - pad.t - pad.b;

  const gx = (i) => pad.l + (i / (chartData.length - 1)) * cw;
  const gy = (v) => pad.t + ch - (v / maxScaleVal) * ch;

  const revPath = chartData.map((p, i) => `${i === 0 ? "M" : "L"} ${gx(i)} ${gy(p.rev)}`).join(" ");

  const maxCust = Math.max(...chartData.map(d => d.cust), 5);
  const scaleCust = (c) => pad.t + ch - (c / maxCust) * ch;
  const custPath = chartData.map((p, i) => `${i === 0 ? "M" : "L"} ${gx(i)} ${scaleCust(p.cust)}`).join(" ");

  const totalWeekRevenue = chartData.reduce((sum, d) => sum + d.rev, 0);

  return (
    <div className="dc__chart-container">
      <div className="dc__chart-header">
        <div>
          <div className="dc__chart-title">Weekly revenue</div>
          <div className="dc__chart-value">₹{totalWeekRevenue.toLocaleString('en-IN')}</div>
          <div className="dc__chart-sub">
            <span className="dc__change-text">Last 7 days total</span>
          </div>
        </div>
      </div>
      <svg width="100%" height="200" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
          const val = Math.round(maxScaleVal * ratio);
          return (
            <g key={i}>
              <line x1={pad.l} y1={gy(val)} x2={W - pad.r} y2={gy(val)} stroke="#e5e5e5" strokeDasharray="4 4" />
              <text x={pad.l - 10} y={gy(val) + 4} textAnchor="end" fontSize="11" fill="#999">
                ₹{val >= 1000 ? `${(val / 1000).toFixed(1)}K` : val}
              </text>
            </g>
          );
        })}
        <path d={revPath} fill="none" stroke="#0ea5e9" strokeWidth="2.5" />
        <path d={custPath} fill="none" stroke="#d4d4d8" strokeWidth="2" strokeDasharray="4 4" />
        {chartData.map((p, i) => <circle key={i} cx={gx(i)} cy={gy(p.rev)} r="4" fill="#0ea5e9" />)}
        {chartData.map((p, i) => <text key={i} x={gx(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#999">{p.day}</text>)}
      </svg>
      <div className="dc__chart-legend">
        <span className="dc__legend-item"><span className="dc__legend-line" style={{ backgroundColor: "#0ea5e9" }}></span>Revenue</span>
        <span className="dc__legend-item"><span className="dc__legend-line dc__legend-line--dashed" style={{ backgroundColor: "#d4d4d8" }}></span>Customers</span>
      </div>
    </div>
  );
};

const SalesByCategory = ({ orders, products, loading }) => {
  const categorySales = useMemo(() => {
    const sales = {};
    orders.forEach(order => {
      if (!isRevenueOrder(order)) return;
      const product = products.find(p => p.name === order.item_name);
      const categoryName = product?.category || 'Uncategorized';
      sales[categoryName] = (sales[categoryName] || 0) + Number(order.total_price || 0);
    });

    return Object.entries(sales).map(([name, total]) => ({
      name,
      value: total,
      color: getRandomColor(name)
    })).sort((a, b) => b.value - a.value);
  }, [orders, products]);

  function getRandomColor(name) {
    const colors = ["#8b5cf6", "#65a30d", "#0ea5e9", "#ef4444", "#f59e0b", "#ec4899", "#14b8a6"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  }

  if (loading) {
    return (
      <div className="dc__category-card skeleton-shimmer" style={{ minHeight: '254px', opacity: 0.85, borderRadius: '12px' }} />
    );
  }

  const maxValue = Math.max(...categorySales.map(c => c.value), 1);

  return (
    <div className="dc__category-card">
      <div className="dc__card-title">Sales by category</div>
      <div className="dc__category-list">
        {categorySales.length === 0 ? (
          <div style={{ color: '#888', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>No sales recorded.</div>
        ) : (
          categorySales.slice(0, 5).map((c, i) => (
            <div key={i} className="dc__category-item">
              <div className="dc__category-info">
                <span className="dc__category-name">{c.name}</span>
                <span className="dc__category-value">₹{Number(c.value).toLocaleString('en-IN')}</span>
              </div>
              <div className="dc__category-bar-bg">
                <div className="dc__category-bar-fill" style={{ width: `${(c.value / maxValue) * 100}%`, backgroundColor: c.color }} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const RecentOrders = ({ orders, loading, searchIcon }) => {
  if (loading) {
    return (
      <div className="dc__table-card">
        <div className="dc__card-title">Recent orders</div>
        <div className="dc__order-list">
          {[1, 2, 3].map((i) => (
            <div key={i} className="dc__order-item skeleton-shimmer" style={{ height: '52px', background: '#f5f5f5', borderRadius: '6px', marginBottom: '8px', opacity: 0.85 }} />
          ))}
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="dc__table-card dc__empty-card">
        <div className="dc__empty-state">
          <div className="dc__empty-icon-wrapper">
            <img src={searchIcon} alt="Search" className="dc__empty-icon" />
          </div>
          <div className="dc__empty-title">No orders found</div>
          <div className="dc__empty-subtitle">When orders are placed, they will appear here.</div>
        </div>
      </div>
    );
  }

  const getStatusStyle = (status) => {
    const s = status?.toLowerCase();
    if (s === 'delivered') return { backgroundColor: '#10b98115', color: '#10b981' };
    if (s === 'shipped') return { backgroundColor: '#3b82f615', color: '#3b82f6' };
    if (s === 'cancelled' || s === 'returned') return { backgroundColor: '#ef444415', color: '#ef4444' };
    return { backgroundColor: '#f59e0b15', color: '#f59e0b' };
  };

  const recent = orders.slice(0, 5);

  return (
    <div className="dc__table-card">
      <div className="dc__card-title">Recent orders</div>
      <div className="dc__order-list">
        {recent.map((order) => {
          const statusClass = `dc__order-status-${order.status?.toLowerCase() || 'pending'}`;
          return (
            <div key={order.id} className="dc__order-item">
              <div className="dc__order-main">
                <span className="dc__order-id">#{order.id?.slice(-6) || order.id}</span>
                <span className={`dc__order-status ${statusClass}`} style={getStatusStyle(order.status)}>
                  {order.status}
                </span>
                <span className="dc__order-price">₹{Number(order.total_price || 0).toLocaleString('en-IN')}</span>
              </div>
              <div className="dc__order-details">
                <span className="dc__order-name">{order.customer?.name || 'Unknown'}</span>
                <span className="dc__order-product">{order.item_name} {order.quantity > 1 ? `x${order.quantity}` : ''}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const LowStockAlerts = ({ products, loading }) => {
  if (loading) {
    return (
      <div className="dc__table-card">
        <div className="dc__card-title">Low stock alerts</div>
        <div className="dc__stock-list">
          {[1, 2, 3].map((i) => (
            <div key={i} className="dc__stock-item skeleton-shimmer" style={{ height: '48px', background: '#f5f5f5', borderRadius: '6px', marginBottom: '8px', opacity: 0.85 }} />
          ))}
        </div>
      </div>
    );
  }

  const lowStock = products
    .filter(p => p.stock <= (p.stock_alert || 5))
    .slice(0, 5);

  if (lowStock.length === 0) {
    return (
      <div className="dc__table-card">
        <div className="dc__card-title">Low stock alerts</div>
        <div style={{ color: '#10b981', fontSize: '13px', textAlign: 'center', padding: '24px 0', fontWeight: '500' }}>All products are well stocked!</div>
      </div>
    );
  }

  return (
    <div className="dc__table-card">
      <div className="dc__card-title">Low stock alerts</div>
      <div className="dc__stock-list">
        {lowStock.map((it, i) => (
          <div key={it.id || i} className="dc__stock-item">
            <div className="dc__stock-info">
              <span className="dc__stock-name">{it.name}</span>
              <span className="dc__stock-type">{it.category || 'Product'}</span>
            </div>
            <span className="dc__stock-left" style={{ color: it.stock === 0 ? '#ef4444' : '#f59e0b' }}>
              {it.stock === 0 ? 'Out of stock' : `${it.stock} left`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const TopCustomers = ({ customers, loading }) => {
  if (loading) {
    return (
      <div className="dc__table-card">
        <div className="dc__card-title">Top customers</div>
        <div className="dc__customer-list">
          {[1, 2, 3].map((i) => (
            <div key={i} className="dc__customer-item skeleton-shimmer" style={{ height: '52px', background: '#f5f5f5', borderRadius: '6px', marginBottom: '8px', opacity: 0.85 }} />
          ))}
        </div>
      </div>
    );
  }

  const top = [...customers]
    .filter(c => c.orderCount > 0)
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 5);

  if (top.length === 0) {
    return (
      <div className="dc__table-card">
        <div className="dc__card-title">Top customers</div>
        <div style={{ color: '#888', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>No customers yet.</div>
      </div>
    );
  }

  const colors = ["#f59e0b", "#0ea5e9", "#65a30d", "#ef4444", "#8b5cf6"];

  return (
    <div className="dc__table-card">
      <div className="dc__card-title">Top customers</div>
      <div className="dc__customer-list">
        {top.map((c, i) => {
          const initials = getUserInitials(c.name, 'CU');
          const avatarColor = colors[i % colors.length];
          return (
            <div key={c.id} className="dc__customer-item">
              <div className="dc__customer-avatar" style={{ backgroundColor: avatarColor + "15", color: avatarColor }}>{initials}</div>
              <div className="dc__customer-info">
                <span className="dc__customer-name">{c.name}</span>
                <span className="dc__customer-meta">{c.orderCount} {c.orderCount === 1 ? 'order' : 'orders'}</span>
              </div>
              <span className="dc__customer-amount">₹{Number(c.totalSpent).toLocaleString('en-IN')}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const DashboardHome = ({ orders, customers, products, loading }) => {
  const stats = useMemo(() => {
    const totalOrders = orders.length;

    const now = new Date();
    const thisMonthOrders = orders.filter(o => {
      const oDate = new Date(o.order_date);
      return oDate.getMonth() === now.getMonth() && oDate.getFullYear() === now.getFullYear() && isRevenueOrder(o);
    });
    const revenue = thisMonthOrders.reduce((sum, o) => sum + Number(o.total_price || 0), 0);
    const formatRevenue = (value) => {
      if (value >= 100000) {
        return `₹${(value / 100000).toFixed(1)}L`;
      }
      return `₹${Number(value).toLocaleString('en-IN')}`;
    };

    const totalCustomers = customers.length;
    const pendingOrders = orders.filter(o => o.status?.toLowerCase() === 'pending').length;

    return {
      totalOrders,
      revenue: formatRevenue(revenue),
      totalCustomers,
      pendingOrders
    };
  }, [orders, customers]);


  return (
    <div className="dc">
      <div className="dc__page-title-wrapper">
        <h1 className="dc__page-title">Dashboard</h1>
      </div>
      <div className="dc__content">
        <div className="dc__stats-row">
          <StatCard icon="orders" label="Total orders" value={stats.totalOrders} change="" changeType="up" subtext="Live count" color="#10b981" loading={loading} />
          <StatCard icon="revenue" label="Revenue (this month)" value={stats.revenue} change="" changeType="down" subtext="Month total" color="#0ea5e9" loading={loading} />
          <StatCard icon="customers" label="Total customers" value={stats.totalCustomers} change="" changeType="up" subtext="Active directory" color="#f59e0b" loading={loading} />
          <StatCard icon="pending" label="Pending orders" value={stats.pendingOrders} change="" changeType="up" subtext="Needs attention" color="#ef4444" loading={loading} />
        </div>
        <div className="dc__charts-row">
          <div className="dc__chart-wrapper"><RevenueChart orders={orders} loading={loading} /></div>
          <div className="dc__category-wrapper"><SalesByCategory orders={orders} products={products} loading={loading} /></div>
        </div>
        <div className="dc__tables-row">
          <RecentOrders orders={orders} loading={loading} searchIcon={searchIcon} />
          <LowStockAlerts products={products} loading={loading} />
          <TopCustomers customers={customers} loading={loading} />
        </div>
      </div>
    </div>
  );
};


// Sub category Setup
function SubcategoryByParent({ onSave, navigate, categories }) {
  const [searchParams] = useSearchParams();
  const parentId = searchParams.get("parentId");
  const parentCategory = categories.find(
    (c) => String(c.category_id ?? c_id) === String(parentId)
  );
  return (
    <SubCategoryForm
      parentId={parentId}
      categories={categories}
      onBack={() => navigate("/admin/categories")}
      onDiscard={() => navigate("/admin/categories")}
      onSave={onSave}
    />
  );
}

// ── Main Dashboard Layout ───────────────────────────────────────
const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [openMenus, setOpenMenus] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [notifications, setNotifications] = useState([]);
  const [notificationOpen, setNotificationOpen] = useState(false);

  const [products, setProducts] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);

  const [categories, setCategories] = useState([]);
  const [subcategoriesCache, setSubcategoriesCache] = useState({});

  const [editingCategory, setEditingCategory] = useState(null);
  const selectedOrder = useStore((state) => state.selectedAdminOrder);
  const setSelectedOrder = useStore((state) => state.setSelectedAdminOrder);
  const selectedCustomer = useStore((state) => state.selectedAdminCustomer);
  const setSelectedCustomer = useStore((state) => state.setSelectedAdminCustomer);
  const currentUser = useStore((state) => state.user);
  const newOrdersCount = useStore((state) => state.newOrdersCount);
  const subscribeToOrders = useStore((state) => state.subscribeToOrders);
  const [banners, setBanners] = useState([]);
  const [editingBanner, setEditingBanner] = useState(null);

  const {
    orders,
    customers,
    loading: adminDataLoading,
    error: adminDataError,
    updateOrderStatus: updateOrderStatusRaw
  } = useAdminData();

  const currentAdminProfile = useMemo(() => {
    if (!currentUser || !customers) return null;
    return customers.find((c) => c.id === currentUser.id);
  }, [currentUser, customers]);

  const adminName = currentAdminProfile?.name || currentUser?.user_metadata?.name || "Admin";

  const updateOrderStatus = useCallback(async (orderId, newStatus) => {
    try {
      await updateOrderStatusRaw(orderId, newStatus);
      setSelectedOrder((current) => {
        if (current && current.id === orderId) {
          return { ...current, status: newStatus };
        }
        return current;
      });
    } catch (error) {
      console.error("Error updating order status:", error);
      throw error;
    }
  }, [updateOrderStatusRaw]);

  const selectedOrderObj = useMemo(() => {
    if (!selectedOrder) return null;
    return orders.find((o) => o.id === selectedOrder.id) || selectedOrder;
  }, [selectedOrder, orders]);

  // Realtime subscription for admin new orders badge
  useEffect(() => {
    const cleanup = subscribeToOrders();
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [subscribeToOrders]);

  const selectedCustomerObj = useMemo(() => {
    if (!selectedCustomer) return null;
    return customers.find((c) => c.id === selectedCustomer.id) || selectedCustomer;
  }, [selectedCustomer, customers]);

  const currentPath = location.pathname;

  useEffect(() => {
    const channel = supabase
      .channel("admin-new-orders")
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          console.log('🔔 NEW ORDER:', payload.new);

          const newOrder = payload.new;
          setNotifications((prev) => [
            {
              id: newOrder.id,
              type: "new_order",
              title: "New Order Received",
              message: `Order #${String(newOrder.id).slice(-6)} has been placed`,
              order: newOrder,
              read: false,
              createdAt: new Date().toISOString(),
            },
            ...prev,
          ]);

          if ('Notification' in window && window.Notification.permission === 'granted') {
            new window.Notification('New Order Recieved!', {
              body: `Order #${String(newOrder.id).slice(-6)} has been placed.`,
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('Order notification subscription:', status);
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if ('Notification' in window && window.Notification.permission === 'default') {
      window.Notification.requestPermission();
    }
  }, [])

  // Auto-expand menu based on current path
  useEffect(() => {
    const expanded = {};
    menuItems.forEach(item => {
      if (item.children && (currentPath.startsWith(item.path) || item.children.some(child => currentPath === child.path || currentPath.startsWith(child.path)))) {
        expanded[item.id] = true;
      }
    });
    setOpenMenus(expanded);
  }, [currentPath]);

  // ── Fetch categories on mount ─────────────────────
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await productService.getCategories();
        if (data) {
          setCategories(
            data.map((row) => ({
              ...row,
              id: row.category_id,
              categoryImage: row.image_url || null,
              status: row.is_active ? "Active" : "Draft",
            }))
          );
        }
      } catch (error) {
        console.error("Error fetching categories:", error);
      }
    };
    fetchCategories();
  }, []);

  // Normalize a raw Supabase product row into the shape productlist.jsx expects
  const normalizeProductRow = (row) => {
    const variants = row.product_variants || [];
    const prices = variants.map(v => Number(v.price)).filter(n => !isNaN(n));
    const totalStock = variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

    const variantImages = variants.flatMap(v => v.images || []).filter(Boolean);
    const images = Array.isArray(row.images) && row.images.length > 0
      ? row.images
      : (row.image_url ? [row.image_url] : (variantImages.length > 0 ? variantImages : []));

    const priceDisplay = row.has_variants
      ? (prices.length
        ? (Math.min(...prices) === Math.max(...prices)
          ? `₹${Math.min(...prices).toLocaleString('en-IN')}`
          : `₹${Math.min(...prices).toLocaleString('en-IN')} – ₹${Math.max(...prices).toLocaleString('en-IN')}`)
        : "No variants")
      : `₹${Number(row.price || 0).toLocaleString('en-IN')}`;

    return {
      ...row,
      id: row.product_id ?? row.id,
      images,
      image: row.image_url || images[0] || null,
      category: row.categories?.name || row.category || "",
      subcategory: row.subcategories?.name || row.subcategory || null,
      status: row.is_active ? "Visible" : "Draft",
      price: row.has_variants ? (prices.length ? Math.min(...prices) : 0) : row.price,
      priceDisplay,
      stock: row.has_variants ? totalStock : row.stock,
      variants,
      variantCount: variants.length,
    };
  };

  // ── Fetch products on mount ─────────────────────
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const data = await productService.getProducts();
        if (data) {
          setProducts(data.map(normalizeProductRow));
        }
      } catch (error) {
        console.error("Error fetching products:", error);
      }
    };
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleResize = () => { if (window.innerWidth > 768) setSidebarOpen(false); };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggle = (id) => setOpenMenus((prev) => ({ ...prev, [id]: !prev[id] }));

  const isActive = (path) => currentPath === path || currentPath.startsWith(path + "/");

  const showSearchNavbar = ["/admin/categories", "/admin/categories/add", "/admin/products/add", "/admin/orders", "/admin/orders/detail", "/admin/customers", "/admin/customers/detail", "/admin/banners", "/admin/social"].some(p => currentPath.startsWith(p));
  const hideAddProduct = HIDE_ADD_PRODUCT_PATHS.includes(currentPath);

  const fetchSubcategoriesForParent = useCallback(async (parentId, force = false) => {
    if (!force && subcategoriesCache[parentId]) {
      return subcategoriesCache[parentId];
    }
    const data = await productService.getSubCategories(parentId);
    setSubcategoriesCache((prev) => ({ ...prev, [parentId]: data }));
    return data;
  }, [subcategoriesCache]);

  function SubcategoryCard({ navigate, categories, products }) {
    const [searchParams] = useSearchParams();
    const parentId = searchParams.get("parentId");
    const parentCategory = categories.find(
      (c) => String(c.category_id ?? c.id) === String(parentId)
    );
    return (
      <SubCategory
        parentCategory={parentCategory}
        subcategories={subcategoriesCache[parentId]}
        products={products}
        onFetchSubcategories={fetchSubcategoriesForParent}
        onBack={() => navigate("/admin/categories")}
        onAddSubcategory={() => navigate(`/admin/subcategories/new?parentId=${parentId}`)}
      />
    );
  }

  function EditMultipleProductWrapper({ categories, subcategoriesCache, fetchSubcategoriesForParent, onSave, navigate }) {
    const location = useLocation();
    const editingProductId = location.state?.editingProductId;

    if (!editingProductId) {
      return <Navigate to="/admin/products" replace />;
    }
    return (
      <ProductVariant
        editingProductId={editingProductId}
        categories={categories}
        onGoToRoot={() => navigate("/admin/categories")}
        onBack={() => navigate("/admin/products")}
        onSave={onSave}
        subcategoriesCache={subcategoriesCache}
        onFetchSubcategories={fetchSubcategoriesForParent}
      />
    );
  }

  // ── Handlers ──────────────────────────────────────────────────
  const goToAddProduct = () => {
    setEditingProduct(null);
    navigate("/admin/products/add");
  };

  const goToAddMultipleProduct = () => {
    navigate("/admin/products/add-multiple");
  }

  const goToOrder = () => {
    setSelectedOrder(null);
    navigate("/admin/orders");
  };

  const handleEditProduct = (product) => {
    if (product.has_variants) {
      navigate("/admin/products/edit-multiple", { state: { editingProductId: product.id } });
    } else {
      setEditingProduct(product);
      navigate("/admin/products/add");
    }
  };

  const handleDeleteProduct = async (id) => {
    try {
      await productService.deleteProduct(id);
      setProducts((p) => p.filter((x) => x.id !== id));
    } catch (error) {
      console.error("Error deleting product:", error);
      alert("Failed to delete product: " + error.message);
    }
  };

  const handlePublish = (data) => {
    const normalized = normalizeProductRow(data);
    setProducts((p) =>
      editingProduct
        ? p.map((x) => x.id === editingProduct.id ? normalized : x)
        : [normalized, ...p]
    );
    setEditingProduct(null);
    navigate("/admin/products");
  };

  const handleSaveDraft = (data) => {
    const normalized = normalizeProductRow(data);
    setProducts((p) =>
      editingProduct
        ? p.map((x) => x.id === editingProduct.id ? normalized : x)
        : [normalized, ...p]
    );
    setEditingProduct(null);
    navigate("/admin/products");
  };

  const goToAddCategory = () => {
    setEditingCategory(null);
    navigate("/admin/categories/add");
  };

  const handleOpenSubcategory = (cat) => {
    const parentId = cat.category_id || cat.id;

    if (!parentId) {
      console.error("Category ID missing:", cat);
      return;
    }
    navigate(`/admin/subcategories?parentId=${parentId}`);
    // navigate(`/admin/subcategories/new?parentId=${parentId}`);
  };

  const handleSubCategorySave = (data) => {
    setSubcategoriesCache((prev) => {
      const existingList = prev[data.parent_id] || [];
      const alreadyExists = existingList.some((s) => s.subcategory_id === data.subcategory_id);
      const updatedList = alreadyExists
        ? existingList.map((s) => (s.subcategory_id === data.subcategory_id ? data : s))
        : [data, ...existingList];

      return { ...prev, [data.parent_id]: updatedList };
    });
    navigate(`/admin/subcategories?parentId=${data.parent_id}`);
  };

  const handleSubCategoryUpdate = (data) => {
    setSubcategoriesCache((prev) => ({
      ...prev,
      [data.parent_id]: (prev[data.parent_id] || []).map((s) =>
        s.subcategory_id === data.subcategory_id ? data : s
      ),
    }));
    navigate(`/admin/subcategories?parentId=${data.parent_id}`);
  };

  const handleSaveMultipleProduct = ({ product, variants }) => {
    const matchedCategory = categories.find(c => String(c.id || c.category_id) === String(product.category_id));
    const firstWithImages = variants?.find(v => v.images?.length > 0);
    const normalized = normalizeProductRow({
      ...product,
      category: matchedCategory?.name || product.category || "",
      images: (product.images && product.images.length > 0) ? product.images : (firstWithImages?.images || []),
      image_url: product.image_url || firstWithImages?.images?.[0] || null,
      product_variants: variants || [],
    });
    setProducts((p) => [normalized, ...p]);
    navigate("/admin/products");
  };

  const handleUpdateMultipleProduct = ({ product, variants }) => {
    const matchedCategory = categories.find(c => String(c.id || c.category_id) === String(product.category_id));
    const firstWithImages = variants?.find(v => v.images?.length > 0);
    const normalized = normalizeProductRow({
      ...product,
      category: matchedCategory?.name || product.category || "",
      images: (product.images && product.images.length > 0) ? product.images : (firstWithImages?.images || []),
      image_url: product.image_url || firstWithImages?.images?.[0] || null,
      product_variants: variants || [],
    });
    setProducts((p) => p.map((x) => (x.id === normalized.id ? normalized : x)));
    navigate("/admin/products");
  };

  const handleEditCategory = (cat) => {
    setEditingCategory(cat);
    navigate("/admin/categories/add");
  };

  const handleDeleteCategory = async (id) => {
    const row = categories.find((x) => x.id === id);
    if (row) {
      try {
        await productService.deleteCategory(id);
        setCategories((p) => p.filter((x) => x.id !== id));
      } catch (error) {
        console.error("Error deleting category:", error);
        if (error.code === 'CATEGORY_HAS_SUBCATEGORIES') {
          alert("This category has subcategories inside it. Please delete or move the subcategories first.");
        } else {
          alert("Failed to delete category: " + error.message);
        }
      }
    }
  };

  const normalizeCategoryRow = (data) => ({
    ...data,
    id: data.category_id ?? data.id,
    categoryImage: data.image_url || null,
    status: data.is_active ? "Active" : "Draft",
  });

  const handlePublishCategory = (data) => {
    const normalized = normalizeCategoryRow(data);
    setCategories((p) =>
      editingCategory
        ? p.map((x) => x.id === editingCategory.id ? normalized : x)
        : [normalized, ...p]
    );
    setEditingCategory(null);
    navigate("/admin/categories");
  };

  const handleSaveDraftCategory = (data) => {
    const normalized = normalizeCategoryRow(data);
    setCategories((p) =>
      editingCategory
        ? p.map((x) => x.id === editingCategory.id ? normalized : x)
        : [normalized, ...p]
    );
    setEditingCategory(null);
    navigate("/admin/categories");
  };

  const handleViewOrderDetail = (order) => {
    if (order?.id) {
      try {
        sessionStorage.setItem(`anika_opened_from_list_${order.id}`, "true");
      } catch (_) {}
    }
    setSelectedOrder(order);
    navigate("/admin/orders/detail");
  };

  const handleViewCustomerDetail = (customer) => {
    setSelectedCustomer(customer);
    navigate("/admin/customers/detail");
  };

  const goToAddBanner = () => {
    setEditingBanner(null);
    navigate("/admin/banners/add", { state: { banner: null } });
  };

  const handleEditBanner = (banner) => {
    setEditingBanner(banner);
    navigate("/admin/banners/add", { state: { banner } });
  };

  const handleDeleteBanner = (id) => setBanners((p) => p.filter((x) => x.id !== id));

  const handlePublishBanner = (data) => {
    setEditingBanner(null);
    navigate("/admin/banners");
  };

  return (
    <div className="db">
      {/* Navbar */}
      <nav className="db__navbar">
        <button className="db__hamburger" aria-label={sidebarOpen ? "Close menu" : "Open menu"} onClick={() => setSidebarOpen((v) => !v)}>
          <HamburgerIcon open={sidebarOpen} />
        </button>
        <div className="db__navbar-logo">
          <img src={logo} alt="Anika" className="db__logo-img" />
        </div>

        <div className="db__navbar-actions">
          <div className="notification-wrapper">
            <button
              className="db__add-btn notification-btn"
              onClick={() => setNotificationOpen((prev) => !prev)}
              aria-label={`Notifications${notifications.filter((n) => !n.read).length
                ? `, ${notifications.filter((n) => !n.read).length} unread`
                : ""
                }`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>

              <span className="notification-label">Notification</span>

              {notifications.filter((n) => !n.read).length > 0 && (
                <span className="notification-badge">
                  {notifications.filter((n) => !n.read).length}
                </span>
              )}
            </button>

            {notificationOpen && (
              <div className="notification-dropdown">
                <div className="notification-header">
                  <strong>Notifications</strong>

                  {notifications.length > 0 && (
                    <button
                      onClick={() => {
                        setNotifications([]);
                      }}
                    >
                      Clear all
                    </button>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <div className="notification-empty">
                    <span>🔔</span>
                    <p>No new notifications</p>
                  </div>
                ) : (
                  <div className="notification-list">
                    {notifications.map((notification) =>
                      <button
                        key={notification.id}
                        className={`notification-item ${notification.read ? "notification-item--read" : ""
                          }`}
                        onClick={() => {
                          setNotifications((prev) =>
                            prev.map((item) =>
                              item.id === notification.id
                                ? { ...item, read: true }
                                : item
                            )
                          );
                          setNotificationOpen(false);
                          if (notification.order?.id) {
                            try {
                              sessionStorage.setItem(`anika_opened_from_list_${notification.order.id}`, "true");
                            } catch (_) {}
                          }
                          setSelectedOrder(notification.order);

                          navigate("/admin/orders/detail");
                        }}
                      >
                        <div className="notification-icon">
                          🛍️
                        </div>
                        <div className="notification-content">
                          <strong>{notification.title}</strong>
                          <span>{notification.message}</span>
                          <small>
                            ₹{Number(notification.order.total_price || 0).toLocaleString("en-IN")}
                            {" • "}
                            {notification.order.payment || "Payment"}
                          </small>
                        </div>
                        {!notification.read && (
                          <span className="notification-dot" />
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <Link to="/" style={{ textDecoration: 'none' }}>
            <button className="db__profile-btn" aria-label="Admin Profile" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div className="db__profile-avatar-img" style={{
                backgroundColor: '#8b0030',
                color: '#fff',
                borderRadius: '50%',
                width: '22px',
                height: '22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '600',
                fontSize: '11px'
              }}>
                {getUserInitials(adminName, 'A')}
              </div>
              <span>{adminName}</span>
            </button>
          </Link>
        </div>
      </nav>

      <div className="db__body">
        <div className={`db__sidebar-overlay${sidebarOpen ? " db__sidebar-overlay--visible" : ""}`} onClick={() => setSidebarOpen(false)} aria-hidden="true" />

        {/* Sidebar */}
        <aside className={`db__sidebar${sidebarOpen ? " db__sidebar--open" : ""}`}>
          <nav className="db__sidenav">
            {menuItems.map((item) => {
              const hasChildren = item.children && item.children.length > 0;
              const isOpen = openMenus[item.id];
              const active = isActive(item.path);

              return (
                <div key={item.id} className="db__menu-group">
                  <button
                    className={`db__menu-item${active ? " db__menu-item--active" : ""}`}
                    onClick={() => {
                      if (hasChildren) {
                        toggle(item.id);
                        if (item.id !== "settings") {
                          navigate(item.children[0].path);
                        }
                      } else {
                        navigate(item.path);
                      }
                    }}
                  >
                    <span className="db__menu-icon">{sidebarIcons[item.id]}</span>
                    <span className="db__menu-label">
                      {item.label}
                      {item.id === "settings" && <span className="db__menu-pro-badge">PRO</span>}
                    </span>
                    {item.id === "order" && newOrdersCount > 0 && (
                      <span className="admin-badge">
                        {newOrdersCount > 99 ? "99+" : newOrdersCount}
                      </span>
                    )}
                    {hasChildren && <span className="db__chevron">{isOpen ? <ChevronUp /> : <ChevronDown />}</span>}
                  </button>

                  {hasChildren && isOpen && (
                    <div className="db__submenu">
                      {item.id === "settings" && (
                        <div className="db__pro-hint">
                          <span className="db__pro-badge">PRO</span>
                          <span>Pro to Enable Advance Settings</span>
                        </div>
                      )}
                      {item.children.map((child) => {
                        const isChildDisabled = item.id === "settings" && child.path !== "/admin/account";
                        return isChildDisabled ? (
                          <div
                            key={child.path}
                            className="db__sub-item db__sub-item--disabled"
                            title="Pro to Enable Advance Settings"
                          >
                            <img src={dropdownIcon} alt="" className="db__sub-item-icon" />
                            <span style={{ flex: 1 }}>{child.label}</span>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, flexShrink: 0 }}>
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                          </div>
                        ) : (
                          <Link
                            key={child.path}
                            to={child.path}
                            className={`db__sub-item${currentPath === child.path ? " db__sub-item--active" : ""}`}
                            onClick={() => setSidebarOpen(false)}
                          >
                            <img src={dropdownIcon} alt="" className="db__sub-item-icon" />
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="db__sidebar-socials">
            <a href="https://www.instagram.com/anikafashionstore.jewellery/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="db__social-btn db__social-btn--ig">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
            </a>
            <a href="https://wa.me/919363631636" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="db__social-btn db__social-btn--wa">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984 0 1.764.459 3.487 1.334 5.005l-1.416 5.174 5.297-1.389c1.464.798 3.118 1.218 4.772 1.219h.004c5.505 0 9.988-4.478 9.989-9.985 0-2.668-1.038-5.176-2.925-7.062a9.927 9.927 0 0 0-7.065-2.946zm5.642 14.341c-.244.688-1.417 1.315-1.96 1.369-.51.051-1.157.078-3.418-.853-2.888-1.19-4.747-4.135-4.891-4.327-.143-.191-1.171-1.558-1.171-2.97 0-1.412.738-2.106 1.002-2.394.263-.287.574-.359.765-.359.191 0 .383.002.55.011.177.009.414-.067.647.493.243.585.829 2.022.901 2.169.072.146.12.316.024.507-.096.191-.144.311-.287.478-.144.168-.302.375-.431.504-.144.143-.294.301-.126.589.168.287.747 1.233 1.603 1.996 1.101.98 2.031 1.285 2.318 1.428.287.143.454.12.622-.072.168-.191.718-.838.909-1.125.191-.287.383-.239.646-.144.263.096 1.674.79 1.961.933.287.143.479.215.55.335.072.12.072.694-.172 1.382z" />
              </svg>
            </a>
            <a href="https://www.facebook.com/people/anikafashionstore/100090910872220/?ref=1" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="db__social-btn db__social-btn--fb">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.891h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
              </svg>
            </a>
          </div>
        </aside>

        {/* Main Content - React Router Routes */}
        <main className="db__main">
          <Routes>
            <Route path="/" element={<DashboardHome orders={orders} customers={customers} products={products} loading={adminDataLoading} />} />
            <Route path="/analytics" element={<Analytics orders={orders} customers={customers} products={products} loading={adminDataLoading} />} />

            {/* Products */}
            <Route path="/products" element={
              <ProductList
                products={products}
                categories={categories}
                onAddProduct={goToAddProduct}
                onEditProduct={handleEditProduct}
                onDeleteProduct={handleDeleteProduct}
              />} />
            <Route path="/products/add" element={
              <AddProduct
                initialData={editingProduct}
                onBack={() => { setEditingProduct(null); navigate("/admin/products"); }}
                onPublish={handlePublish}
                onSaveDraft={handleSaveDraft}
                onAddVariant={goToAddMultipleProduct}
              />} />

            <Route path="/products/add-multiple" element={
              <ProductVariant
                categories={categories}
                onGoToRoot={() => navigate("/admin/categories")}
                onBack={() => navigate("/admin/products/add")}
                onSave={handleSaveMultipleProduct}
                subcategoriesCache={subcategoriesCache}
                onFetchSubcategories={fetchSubcategoriesForParent}
              />} />

            <Route path="/products/edit-multiple" element={
              <EditMultipleProductWrapper
                categories={categories}
                subcategoriesCache={subcategoriesCache}
                fetchSubcategoriesForParent={fetchSubcategoriesForParent}
                onSave={handleUpdateMultipleProduct}
                navigate={navigate}
              />
            } />

            {/* Categories */}
            <Route path="/categories" element={
              <CategoryList
                categories={categories}
                setCategories={setCategories}
                onAddCategory={goToAddCategory}
                // onAddSubcategory={handleAddSubcategory} 
                onOpenSubcategory={handleOpenSubcategory}
                onEditCategory={handleEditCategory}
                onDeleteCategory={handleDeleteCategory}
              />
            }
            />

            <Route
              path="/subcategories/new"
              element={
                <SubcategoryByParent
                  navigate={navigate}
                  categories={categories}
                  onSave={handleSubCategorySave}
                />
              }
            />

            <Route
              path="/subcategories"
              element={
                <SubcategoryCard
                  navigate={navigate}
                  categories={categories}
                  products={products}
                  subcategoriesCache={subcategoriesCache}
                  fetchSubcategoriesForParent={fetchSubcategoriesForParent}
                />
              }
            />

            <Route path="/categories/add" element={<AddCategory initialData={editingCategory} onBack={() => { setEditingCategory(null); navigate("/admin/categories"); }} onPublish={handlePublishCategory} onSaveDraft={handleSaveDraftCategory} />} />

            {/* Orders */}
            <Route path="/orders" element={<AllOrders orders={orders} products={products} loading={adminDataLoading} onViewDetail={handleViewOrderDetail} />} />
            <Route path="/orders/detail" element={<OrderDetails order={selectedOrderObj} onStatusChange={updateOrderStatus} onBack={() => navigate("/admin/orders")} />} />

            {/* Invoices */}
            <Route path="/invoices" element={<Invoices orders={orders} loading={adminDataLoading} />} />

            {/* Customers */}
            <Route path="/customers" element={<AllCustomers customers={customers} loading={adminDataLoading} onViewDetail={handleViewCustomerDetail} />} />
            <Route path="/customers/detail" element={<CustomerDetails customer={selectedCustomerObj} onBack={() => navigate("/admin/customers")} />} />

            {/* Banners */}
            <Route path="/banners" element={<BannerList banners={banners} onAddBanner={goToAddBanner} onEditBanner={handleEditBanner} onDeleteBanner={handleDeleteBanner} />} />
            <Route path="/banners/add" element={<AddBanner initialData={editingBanner} onBack={() => navigate("/admin/banners")} onPublish={handlePublishBanner} />} />

            {/* Social Media */}
            <Route path="/social" element={<SocialMedia />} />
            <Route path="/banners/social" element={<SocialMedia />} />

            {/* Settings */}
            <Route path="/store" element={<StoreInfo />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/shipping" element={<Shipping />} />
            <Route path="/payment" element={<Payment />} />
            <Route path="/account" element={<AdminAccount />} />
            <Route path="/notification" element={<Notification />} />
            <Route path="/policies" element={<Policies />} />
            <Route path="/danger" element={<DangerZone />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;