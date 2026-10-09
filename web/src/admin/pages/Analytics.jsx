import React, { useState, useMemo } from "react";
import { isRevenueOrder } from "../../utils/orderUtils";
import "./Analytics.css";

// ── Icons ──────────────────────────────────────────────────────────────────
const ArrowUp = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
  </svg>
);
const ArrowDown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
  </svg>
);
const CalendarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

// Helper to format currency accurately without rounding up to K/L
const fmtVal = (val) => {
  const num = Number(val);
  if (isNaN(num)) return "₹0";
  return `₹${Number.isInteger(num) ? num.toLocaleString("en-IN") : num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// ── Donut Chart ────────────────────────────────────────────────────────────
const DonutChart = ({ data }) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  let cumulative = 0;
  const cx = 80, cy = 80, r = 60;
  const circumference = 2 * Math.PI * r;

  const slices = data.map((d) => {
    const pct = total > 0 ? d.value / total : 0;
    const offset = circumference * (1 - pct);
    const rotation = cumulative * 360;
    cumulative += pct;
    return { ...d, offset, rotation };
  });

  const centerTotal = fmtVal(total);

  return (
    <svg width="160" height="160" viewBox="0 0 160 160">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0f0f0" strokeWidth="22" />
      {slices.map((s, i) => (
        <circle
          key={i} cx={cx} cy={cy} r={r}
          fill="none" stroke={s.color} strokeWidth="22"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={s.offset}
          transform={`rotate(${s.rotation - 90} ${cx} ${cy})`}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      ))}
      <circle cx={cx} cy={cy} r={40} fill="white" />
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize="9" fill="#888" fontFamily="Inter, sans-serif" fontWeight="500">Total Revenue</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize={centerTotal.length > 9 ? "11" : "13"} fill="#1c1c1e" fontFamily="Inter, sans-serif" fontWeight="700">{centerTotal}</text>
    </svg>
  );
};

// ── Horizontal Bar Chart (Overview) ───────────────────────────────────────
const HorizontalBarChart = ({ data }) => {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="an__bar-chart">
      {data.map((d, i) => (
        <div key={i} className="an__bar-row">
          <span className="an__bar-label">{d.label}</span>
          <div className="an__bar-track">
            <div className="an__bar-fill" style={{ width: `${(d.value / max) * 100}%`, background: d.color }} />
          </div>
          <span className="an__bar-value">{d.value}</span>
        </div>
      ))}
    </div>
  );
};

// ── Orders Bar Chart ───────────────────────────────────────────────────────
const OrdersBarChart = ({ data }) => {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="an__bar-chart">
      {data.map((d, i) => (
        <div key={i} className="an__bar-row">
          <span className="an__bar-label an__bar-label--wide">{d.label}</span>
          <div className="an__bar-track">
            <div className="an__bar-fill" style={{ width: `${(d.value / max) * 100}%`, background: d.color }} />
          </div>
          <span className="an__bar-value">{d.value.toLocaleString()}</span>
          {d.pct !== undefined && <span className="an__bar-pct">{d.pct}%</span>}
        </div>
      ))}
    </div>
  );
};

// ── Stat Card ──────────────────────────────────────────────────────────────
const StatCard = ({ label, value, change, changeType, subtext }) => (
  <div className="an__stat-card">
    <div className="an__stat-label">{label}</div>
    <div className="an__stat-value">{typeof value === "number" ? value.toLocaleString("en-IN") : value}</div>
    <div className="an__stat-footer">
      {change && (
        <span className={`an__badge an__badge--${changeType}`}>
          {changeType === "up" ? <ArrowUp /> : null}
          {changeType === "down" ? <ArrowDown /> : null}
          {changeType === "warn" ? "↑" : null}
          {change}
        </span>
      )}
      {subtext && <span className="an__stat-subtext">{subtext}</span>}
    </div>
  </div>
);

// ── Date Input ─────────────────────────────────────────────────────────────
const DateInput = ({ label, value, onChange }) => {
  return (
    <div className="an__date-field">
      <label className="an__date-label">{label}</label>
      <div className="an__date-input" style={{ cursor: "default" }}>
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="an__date-native"
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            fontSize: "13.5px",
            color: value ? "#333" : "#bbb",
            background: "transparent",
            fontFamily: "inherit",
            cursor: "pointer",
            minWidth: 0,
          }}
        />
        <CalendarIcon />
      </div>
    </div>
  );
};

// ── Sparkline Chart ────────────────────────────────────────────────────────
const Sparkline = ({ labels = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"], revenueData = [0, 0, 0, 0, 0, 0, 0], customerData = [0, 0, 0, 0, 0, 0, 0] }) => {
  const W = 420, H = 210;
  const padL = 44, padR = 38, padT = 12, padB = 32;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const revMax = Math.max(...revenueData, 1000);
  const revMin = 0;
  const cusMax = Math.max(...customerData, 10);
  const cusMin = 0;

  const xOf = (i) => padL + (i / Math.max(labels.length - 1, 1)) * chartW;
  const yRev = (v) => padT + chartH - ((v - revMin) / (revMax - revMin)) * chartH;
  const yCus = (v) => padT + chartH - ((v - cusMin) / (cusMax - cusMin)) * chartH;

  const smoothPath = (pts) => {
    if (!pts.length) return "";
    let d = `M ${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const cpX = (pts[i][0] + pts[i + 1][0]) / 2;
      d += ` C ${cpX},${pts[i][1]} ${cpX},${pts[i + 1][1]} ${pts[i + 1][0]},${pts[i + 1][1]}`;
    }
    return d;
  };

  const revPts = revenueData.map((v, i) => [xOf(i), yRev(v)]);
  const cusPts = customerData.map((v, i) => [xOf(i), yCus(v)]);

  const revLine = smoothPath(revPts);
  const cusLine = smoothPath(cusPts);
  const revArea = revPts.length > 0 ? `${revLine} L ${revPts[revPts.length - 1][0]},${padT + chartH} L ${revPts[0][0]},${padT + chartH} Z` : "";

  const revTicks = [0, Math.round(revMax * 0.25), Math.round(revMax * 0.5), Math.round(revMax * 0.75), Math.round(revMax)];
  const cusTicks = [0, Math.round(cusMax * 0.33), Math.round(cusMax * 0.66), Math.round(cusMax)];

  const peakIdx = revenueData.indexOf(Math.max(...revenueData));

  return (
    <div className="an__sparkline-wrapper">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.01" />
          </linearGradient>
          <clipPath id="chartClip">
            <rect x={padL} y={padT} width={chartW} height={chartH} />
          </clipPath>
        </defs>
        {revTicks.map((v) => (
          <line key={v} x1={padL} y1={yRev(v)} x2={padL + chartW} y2={yRev(v)} stroke="#e8e8e8" strokeWidth="0.5" />
        ))}
        {revArea && <path d={revArea} fill="url(#revGrad)" clipPath="url(#chartClip)" />}
        {cusLine && <path d={cusLine} fill="none" stroke="#c9a800" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" clipPath="url(#chartClip)" />}
        {revLine && <path d={revLine} fill="none" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" clipPath="url(#chartClip)" />}
        {revPts[peakIdx] && <circle cx={revPts[peakIdx][0]} cy={revPts[peakIdx][1]} r="4" fill="#06b6d4" />}
        {revTicks.map((v, idx) => (
          <text key={idx} x={padL - 5} y={yRev(v) + 4} textAnchor="end" fontSize="9.5" fill="#aaa" fontFamily="Inter, sans-serif">
            {v === 0 ? "₹0" : v >= 1000 ? `₹${(v / 1000).toFixed(0)}K` : `₹${v}`}
          </text>
        ))}
        {cusTicks.map((v, idx) => (
          <text key={idx} x={padL + chartW + 5} y={yCus(v) + 4} textAnchor="start" fontSize="9.5" fill="#aaa" fontFamily="Inter, sans-serif">
            {v}
          </text>
        ))}
        {labels.map((lbl, i) => (
          <text key={i} x={xOf(i)} y={padT + chartH + 18} textAnchor="middle" fontSize="10.5" fill="#aaa" fontFamily="Inter, sans-serif">
            {lbl}
          </text>
        ))}
      </svg>
      <div className="an__sparkline-legend" style={{ justifyContent: "flex-end" }}>
        <span className="an__sparkline-legend-item">
          <svg width="22" height="8" style={{ display: "inline-block", verticalAlign: "middle" }}>
            <line x1="0" y1="4" x2="22" y2="4" stroke="#06b6d4" strokeWidth="2.5" />
          </svg>
          <span style={{ marginLeft: 4 }}>Revenue</span>
        </span>
        <span className="an__sparkline-legend-item">
          <svg width="22" height="8" style={{ display: "inline-block", verticalAlign: "middle" }}>
            <line x1="0" y1="4" x2="22" y2="4" stroke="#c9a800" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" />
          </svg>
          <span style={{ marginLeft: 4 }}>Customers</span>
        </span>
      </div>
    </div>
  );
};

const TABS = ["Overview", "Orders", "Customers", "Products"];
const PERIODS = ["Today", "7 Days", "This Month", "Last Month", "Custom"];

// ── Main Analytics Component ───────────────────────────────────────────────
const Analytics = ({ orders = [], customers = [], products = [], loading = false }) => {
  const [activeTab, setActiveTab] = useState("Overview");
  const [activePeriod, setActivePeriod] = useState("This Month");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const currentMonth = new Date().toLocaleString("default", { month: "long", year: "numeric" });

  // Date handlers that auto-switch to Custom period
  const handleStartDateChange = (val) => {
    setStartDate(val);
    if (val) setActivePeriod("Custom");
  };

  const handleEndDateChange = (val) => {
    setEndDate(val);
    if (val) setActivePeriod("Custom");
  };

  // Filter orders by active date period
  const filteredOrders = useMemo(() => {
    const now = new Date();
    return orders.filter((o) => {
      const dateStr = o.created_at || o.createdAt || o.order_date || o.date;
      if (!dateStr) return true;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return true;

      if (activePeriod === "Today") {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        return d >= start;
      }
      if (activePeriod === "7 Days") {
        const start = new Date();
        start.setDate(now.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        return d >= start;
      }
      if (activePeriod === "This Month") {
        const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        return d >= start;
      }
      if (activePeriod === "Last Month") {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        return d >= start && d <= end;
      }
      if (activePeriod === "Custom") {
        if (!startDate && !endDate) return true;
        const s = startDate ? new Date(startDate) : new Date(0);
        s.setHours(0, 0, 0, 0);
        const e = endDate ? new Date(endDate) : new Date();
        e.setHours(23, 59, 59, 999);
        return d >= s && d <= e;
      }
      return true;
    });
  }, [orders, activePeriod, startDate, endDate]);

  // Helper to extract net revenue excluding shipping charges
  const getOrderRevenue = (o) => {
    if (o.subtotal !== undefined && o.subtotal !== null && Number(o.subtotal) > 0) {
      return Number(o.subtotal);
    }
    if (o.order_items && o.order_items.length > 0) {
      const itemsTotal = o.order_items.reduce((sum, item) => {
        const price = Number(item.price || item.unit_price || 0);
        const qty = Number(item.quantity || item.qty || 1);
        return sum + price * qty;
      }, 0);
      if (itemsTotal > 0) return itemsTotal;
    }
    const gross = Number(o.total_price || o.grandTotal || o.amount || 0);
    const shipping = Number(o.shipping_fee || o.shippingFee || o.shipping_charge || o.shipping || o.delivery_charge || 0);
    return Math.max(0, gross - shipping);
  };

  // Derived Overview metrics
  const totalRevenue = useMemo(() => {
    return filteredOrders
      .filter(isRevenueOrder)
      .reduce((sum, o) => sum + getOrderRevenue(o), 0);
  }, [filteredOrders]);

  const grossRevenue = useMemo(() => {
    return filteredOrders
      .filter(isRevenueOrder)
      .reduce((sum, o) => sum + Number(o.total_price || o.grandTotal || o.amount || 0), 0);
  }, [filteredOrders]);

  const totalOrdersCount = filteredOrders.length;

  const totalInventoryValue = useMemo(() => {
    return products.reduce((sum, p) => {
      const price = Number(p.price || p.selling_price || p.unit_price || p.mrp || 0);
      const stock = p.variants && p.variants.length > 0
        ? p.variants.reduce((vs, v) => vs + (Number(v.stock) || 0), 0)
        : Number(p.stock ?? p.stockQuantity ?? 0);
      return sum + (price * stock);
    }, 0);
  }, [products]);

  const cancelledCount = useMemo(() => {
    return filteredOrders.filter((o) => o.status?.toLowerCase() === "cancelled").length;
  }, [filteredOrders]);

  const returnsCount = useMemo(() => {
    return filteredOrders.filter((o) => ["return", "returned"].includes(o.status?.toLowerCase())).length;
  }, [filteredOrders]);

  const completedCount = useMemo(() => {
    return filteredOrders.filter((o) => o.status?.toLowerCase() === "delivered").length;
  }, [filteredOrders]);

  const pendingCount = useMemo(() => {
    return filteredOrders.filter((o) => ["pending", "confirmed"].includes(o.status?.toLowerCase())).length;
  }, [filteredOrders]);

  const returnRate = totalOrdersCount > 0 ? ((returnsCount / totalOrdersCount) * 100).toFixed(1) : "0.0";
  const conversionRate = totalOrdersCount > 0 ? ((completedCount / totalOrdersCount) * 100).toFixed(1) : "0.0";

  // Customer metrics
  const activeCustomerIds = useMemo(() => {
    return new Set(filteredOrders.map((o) => o.user_id).filter(Boolean));
  }, [filteredOrders]);

  const newCustomersCount = useMemo(() => {
    return customers.length > 0 ? Math.min(customers.length, activeCustomerIds.size || customers.length) : activeCustomerIds.size;
  }, [customers, activeCustomerIds]);

  // Bar Data - Order Status distribution
  const statusBarData = useMemo(() => {
    const countStatus = (st) => filteredOrders.filter((o) => o.status?.toLowerCase() === st.toLowerCase()).length;
    return [
      { label: "Delivered", value: countStatus("Delivered"), color: "#22c55e" },
      { label: "Shipped", value: countStatus("Shipped"), color: "#3b82f6" },
      { label: "Confirmed", value: countStatus("Confirmed"), color: "#06b6d4" },
      { label: "Pending", value: countStatus("Pending"), color: "#f59e0b" },
      { label: "Cancelled", value: cancelledCount + returnsCount, color: "#ef4444" },
    ];
  }, [filteredOrders, cancelledCount, returnsCount]);

  // Donut Data - Category Revenue split
  const categoryDonutData = useMemo(() => {
    const catMap = {};
    filteredOrders.forEach((o) => {
      if (!isRevenueOrder(o)) return;
      const baseItemName = o.item_name?.split(" + ")[0] || "";
      const matchedProd = products.find((p) => p.name?.toLowerCase() === baseItemName.toLowerCase());
      const cat = matchedProd?.category || o.category || "General";
      catMap[cat] = (catMap[cat] || 0) + getOrderRevenue(o);
    });

    const colors = ["#f87171", "#fb923c", "#3b82f6", "#facc15", "#a855f7", "#10b981"];
    const entries = Object.entries(catMap);
    if (entries.length === 0) {
      return [{ label: "All Items", value: totalRevenue || 1, color: "#3b82f6" }];
    }
    return entries.map(([label, value], i) => ({
      label,
      value: value / 100000 || value / 1000 || value || 1,
      color: colors[i % colors.length]
    }));
  }, [filteredOrders, products, totalRevenue]);

  const donutTotalVal = categoryDonutData.reduce((s, x) => s + x.value, 0);

  // Sparkline data for week/month
  const sparklineData = useMemo(() => {
    const days = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
    const revs = [0, 0, 0, 0, 0, 0, 0];
    const custs = [0, 0, 0, 0, 0, 0, 0];

    filteredOrders.forEach((o) => {
      const dateStr = o.created_at || o.createdAt || o.order_date || o.date;
      if (!dateStr) return;
      const d = new Date(dateStr);
      let dayIdx = d.getDay() - 1;
      if (dayIdx < 0) dayIdx = 6;
      revs[dayIdx] += getOrderRevenue(o);
      custs[dayIdx] += 1;
    });

    return { labels: days, revenueData: revs, customerData: custs };
  }, [filteredOrders]);

  // Orders Tab - Day & Time breakdowns
  const dayOfWeekData = useMemo(() => {
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const colors = ["#22c55e", "#06b6d4", "#a855f7", "#eab308", "#ef4444", "#6366f1", "#f97316"];
    const counts = [0, 0, 0, 0, 0, 0, 0];

    filteredOrders.forEach((o) => {
      const dateStr = o.created_at || o.createdAt || o.order_date || o.date;
      const d = new Date(dateStr || Date.now());
      let idx = d.getDay() - 1;
      if (idx < 0) idx = 6;
      counts[idx]++;
    });

    return days.map((label, i) => ({ label, value: counts[i], color: colors[i] }));
  }, [filteredOrders]);

  const timeOfDayData = useMemo(() => {
    const times = [
      { label: "6am - 9am", color: "#22c55e" },
      { label: "9am - 12pm", color: "#06b6d4" },
      { label: "12pm - 3pm", color: "#a855f7" },
      { label: "3pm - 6pm", color: "#eab308" },
      { label: "6pm - 9pm", color: "#ef4444" },
      { label: "9pm - 12am", color: "#6366f1" },
      { label: "12am - 6am", color: "#f97316" },
    ];
    const counts = [0, 0, 0, 0, 0, 0, 0];

    filteredOrders.forEach((o) => {
      const dateStr = o.created_at || o.createdAt || o.order_date || o.date;
      const d = new Date(dateStr || Date.now());
      const h = d.getHours();
      if (h >= 6 && h < 9) counts[0]++;
      else if (h >= 9 && h < 12) counts[1]++;
      else if (h >= 12 && h < 15) counts[2]++;
      else if (h >= 15 && h < 18) counts[3]++;
      else if (h >= 18 && h < 21) counts[4]++;
      else if (h >= 21 && h < 24) counts[5]++;
      else counts[6]++;
    });

    return times.map((t, i) => ({ ...t, value: counts[i] }));
  }, [filteredOrders]);

  // Customers Tab - Top spenders & segments
  const topCustomersList = useMemo(() => {
    const custMap = {};
    filteredOrders.forEach((o) => {
      const name = o.customer?.name || "Customer #" + (o.user_id?.slice(0, 6) || "N/A");
      if (!custMap[name]) {
        custMap[name] = { name, orders: 0, amount: 0, city: o.customer?.city || "India" };
      }
      custMap[name].orders += 1;
      if (isRevenueOrder(o)) {
        custMap[name].amount += getOrderRevenue(o);
      }
    });

    return Object.values(custMap)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((c) => ({ ...c, amount: fmtVal(c.amount) }));
  }, [filteredOrders]);

  const customerSegments = useMemo(() => {
    const userCounts = {};
    filteredOrders.forEach((o) => {
      if (o.user_id) userCounts[o.user_id] = (userCounts[o.user_id] || 0) + 1;
    });
    const values = Object.values(userCounts);
    const vip = values.filter((v) => v >= 5).length;
    const regular = values.filter((v) => v >= 2 && v < 5).length;
    const oneTime = values.filter((v) => v === 1).length;
    const noOrders = Math.max(0, customers.length - values.length);

    return [
      { label: "VIP (5+ orders)", value: vip, color: "#22c55e" },
      { label: "Regular (2–4)", value: regular, color: "#06b6d4" },
      { label: "One-time (1)", value: oneTime, color: "#a855f7" },
      { label: "No orders yet", value: noOrders, color: "#eab308" },
    ];
  }, [filteredOrders, customers]);

  // Products Tab Data
  const productsSoldUnits = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + Number(o.quantity || 1), 0);
  }, [filteredOrders]);

  const bestSellerProduct = useMemo(() => {
    const itemMap = {};
    filteredOrders.forEach((o) => {
      const name = o.item_name?.split(" + ")[0] || "Jewelry Item";
      itemMap[name] = (itemMap[name] || 0) + Number(o.quantity || 1);
    });
    let bestName = "None";
    let maxUnits = 0;
    Object.entries(itemMap).forEach(([name, units]) => {
      if (units > maxUnits) {
        maxUnits = units;
        bestName = name;
      }
    });
    return { name: bestName, units: maxUnits };
  }, [filteredOrders]);

  const lowStockItems = useMemo(() => {
    return products
      .filter((p) => p.stock !== undefined && p.stock <= 5)
      .map((p) => ({
        name: p.name,
        sku: p.sku || p.code || (p.id || p.product_id ? `SKU-${String(p.id || p.product_id).slice(-6).toUpperCase()}` : "N/A"),
        category: p.category || "Jewelry",
        stock: p.stock,
        status: p.stock === 0 ? "out" : "low",
      }));
  }, [products]);

  const salesByCategoryList = useMemo(() => {
    const catMap = {};
    filteredOrders.forEach((o) => {
      const baseItemName = o.item_name?.split(" + ")[0] || "";
      const matchedProd = products.find((p) => p.name?.toLowerCase() === baseItemName.toLowerCase());
      const cat = matchedProd?.category || o.category || "Jewelry";
      if (!catMap[cat]) catMap[cat] = { units: 0, revenue: 0 };
      catMap[cat].units += Number(o.quantity || 1);
      if (isRevenueOrder(o)) {
        catMap[cat].revenue += getOrderRevenue(o);
      }
    });

    const colors = ["#6366f1", "#22c55e", "#06b6d4", "#ef4444", "#eab308"];
    const entries = Object.entries(catMap);
    const maxRev = Math.max(...entries.map(([, v]) => v.revenue), 1);

    return entries.map(([name, v], i) => ({
      name,
      sku: `${name} Category`,
      units: v.units,
      revenue: fmtVal(v.revenue),
      color: colors[i % colors.length],
      width: Math.max(15, Math.round((v.revenue / maxRev) * 100)),
    }));
  }, [filteredOrders, products]);

  return (
    <div className="an">
      <div className="an__header">
        <h1 className="an__title">Analytics</h1>
        <p className="an__subtitle">{activeTab} — {currentMonth}</p>
      </div>

      <div className="an__tabs">
        {TABS.map((tab) => (
          <button key={tab} className={`an__tab${activeTab === tab ? " an__tab--active" : ""}`} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      <div className="an__periods">
        {PERIODS.map((p) => (
          <button key={p} className={`an__period${activePeriod === p ? " an__period--active" : ""}`} onClick={() => setActivePeriod(p)}>
            {p}
          </button>
        ))}
      </div>

      <div className="an__date-row">
        <DateInput label="Start Date" value={startDate} onChange={handleStartDateChange} />
        <DateInput label="End Date" value={endDate} onChange={handleEndDateChange} />
      </div>

      {activeTab === "Overview" && (
        <>
          <div className="an__stats-container">
            <div className="an__stats-grid">
              <StatCard label="Total Revenue" value={fmtVal(totalRevenue)} change={`${totalOrdersCount} orders`} changeType="up" subtext={`(${fmtVal(grossRevenue)} incl. shipping)`} />
              <StatCard label="Total Order" value={totalOrdersCount} change={`${completedCount} delivered`} changeType="up" subtext="in period" />
              <StatCard label="Total Inventory Value" value={fmtVal(totalInventoryValue)} change={`${products.length} products`} changeType="up" subtext="catalog worth" />
              <StatCard label="New Customers" value={newCustomersCount} change="Live" changeType="up" subtext="in period" />
            </div>
            <div className="an__stats-divider" />
            <div className="an__stats-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
              <StatCard label="Cancelled Orders" value={cancelledCount} changeType="warn" subtext="cancelled" />
              <StatCard label="Returns" value={returnsCount} subtext={`${returnRate}% return rate`} />
            </div>
          </div>

          <div className="an__charts-row">
            <div className="an__chart-card">
              <div className="an__chart-card-title">Order Status Distribution</div>
              <HorizontalBarChart data={statusBarData} />
            </div>
            <div className="an__chart-card">
              <div className="an__chart-card-title">Revenue Share by Category</div>
              <div className="an__donut-wrapper">
                <DonutChart data={categoryDonutData} />
                <div className="an__donut-legend">
                  {categoryDonutData.map((d, i) => (
                    <div key={i} className="an__legend-item">
                      <span className="an__legend-dot" style={{ background: d.color }} />
                      <span className="an__legend-text">
                        {d.label} - {donutTotalVal ? Math.round((d.value / donutTotalVal) * 100) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === "Orders" && (
        <div className="an__orders">
          <div className="an__orders-stats">
            <div className="an__orders-stat-card">
              <div className="an__orders-stat-label">Total Orders</div>
              <div className="an__orders-stat-value">{totalOrdersCount}</div>
              <div className="an__orders-stat-footer">
                <span className="an__badge an__badge--up"><ArrowUp />{completedCount} Delivered</span>
              </div>
            </div>
            <div className="an__orders-stat-card">
              <div className="an__orders-stat-label">Completed</div>
              <div className="an__orders-stat-value">{completedCount}</div>
              <div className="an__orders-stat-footer">
                <span className="an__stat-subtext">Successfully delivered</span>
              </div>
            </div>
            <div className="an__orders-stat-card">
              <div className="an__orders-stat-label">Pending / Confirmed</div>
              <div className="an__orders-stat-value">{pendingCount}</div>
              <div className="an__orders-stat-footer">
                <span className="an__badge an__badge--action">Needs Action</span>
              </div>
            </div>
            <div className="an__orders-stat-card">
              <div className="an__orders-stat-label">Cancelled</div>
              <div className="an__orders-stat-value">{cancelledCount}</div>
              <div className="an__orders-stat-footer">
                <span className="an__badge an__badge--action">{totalOrdersCount ? ((cancelledCount / totalOrdersCount) * 100).toFixed(1) : 0}% Cancel Rate</span>
              </div>
            </div>
          </div>

          <div className="an__orders-charts-row">
            <div className="an__chart-card an__chart-card--review">
              <div className="an__review-header">
                <div>
                  <div className="an__review-title" style={{ fontSize: "20px", fontWeight: "700", color: "#1c1c1e", marginBottom: "10px" }}>Revenue &amp; Orders Trend</div>
                  <div className="an__review-value" style={{ fontSize: "34px", fontWeight: "700", letterSpacing: "-0.02em", color: "#1c1c1e", margin: "0 0 6px" }}>{fmtVal(totalRevenue)}</div>
                </div>
              </div>
              <Sparkline labels={sparklineData.labels} revenueData={sparklineData.revenueData} customerData={sparklineData.customerData} />
            </div>

            <div className="an__chart-card">
              <div className="an__chart-card-title">Orders by Status</div>
              <OrdersBarChart data={statusBarData} />
            </div>
          </div>

          <div className="an__chart-card an__chart-card--bottom">
            <div className="an__bottom-section-title">Top Order Days &amp; Peak Hours</div>
            <div className="an__bottom-charts-row">
              <div className="an__bottom-chart">
                <div className="an__bottom-chart-label">Orders by Day of Week</div>
                <OrdersBarChart data={dayOfWeekData} />
              </div>
              <div className="an__bottom-chart-divider" />
              <div className="an__bottom-chart">
                <div className="an__bottom-chart-label">Orders by Time of Day</div>
                <OrdersBarChart data={timeOfDayData} />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "Customers" && (
        <div className="an__customers">
          <div className="an__stats-grid an__stats-grid--3">
            <div className="an__stat-card">
              <div className="an__stat-label">Total Customers</div>
              <div className="an__stat-value">{(customers.length || activeCustomerIds.size).toLocaleString("en-IN")}</div>
              <div className="an__stat-footer">
                <span className="an__badge an__badge--up"><ArrowUp />{newCustomersCount} active in period</span>
              </div>
            </div>
            <div className="an__stat-card">
              <div className="an__stat-label">New Customers</div>
              <div className="an__stat-value">{Number(newCustomersCount).toLocaleString("en-IN")}</div>
              <div className="an__stat-footer">
                <span className="an__badge an__badge--up">New registrations</span>
              </div>
            </div>
            <div className="an__stat-card">
              <div className="an__stat-label">VIP Customers</div>
              <div className="an__stat-value">{Number(customerSegments[0]?.value || 0).toLocaleString("en-IN")}</div>
              <div className="an__stat-footer">
                <span className="an__stat-subtext">5+ Orders Each</span>
              </div>
            </div>
          </div>

          <div className="an__charts-row">
            <div className="an__chart-card">
              <div className="an__chart-card-title">Customer Segmentation</div>
              <OrdersBarChart data={customerSegments} />
            </div>
            <div className="an__chart-card">
              <div className="an__customers-list-title">Top Customers by Spend</div>
              {topCustomersList.length === 0 ? (
                <p style={{ color: '#888', fontSize: '13px' }}>No customer purchase history yet.</p>
              ) : (
                topCustomersList.map((c, i) => (
                  <div key={i} className="an__customer-row">
                    <span className="an__customer-num">{i + 1}</span>
                    <div className="an__customer-info">
                      <div className="an__customer-name">{c.name}</div>
                      <div className="an__customer-sub">{c.orders} orders · {c.city}</div>
                    </div>
                    <span className="an__customer-amount">{c.amount}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "Products" && (
        <div className="an__products">
          <div className="an__stats-grid">
            <div className="an__stat-card">
              <div className="an__stat-label">Total Products</div>
              <div className="an__stat-value">{Number(products.length).toLocaleString("en-IN")}</div>
              <div className="an__stat-footer">
                <span className="an__stat-subtext">In store catalog</span>
              </div>
            </div>
            <div className="an__stat-card">
              <div className="an__stat-label">Products Sold</div>
              <div className="an__stat-value">{Number(productsSoldUnits).toLocaleString("en-IN")}</div>
              <div className="an__stat-footer">
                <span className="an__stat-subtext">Units sold in period</span>
              </div>
            </div>
            <div className="an__stat-card">
              <div className="an__stat-label">Best Seller</div>
              <div className="an__stat-value an__stat-value--md">{bestSellerProduct.name}</div>
              <div className="an__stat-footer">
                <span className="an__stat-subtext">{bestSellerProduct.units} units sold</span>
              </div>
            </div>
            <div className="an__stat-card">
              <div className="an__stat-label">Low / Out of Stock</div>
              <div className="an__stat-value an__stat-value--red">{Number(lowStockItems.length).toLocaleString("en-IN")}</div>
              <div className="an__stat-footer">
                <span className="an__badge an__badge--action">Restock Needed</span>
              </div>
            </div>
          </div>

          <div className="an__chart-card">
            <div className="an__products-section-title">Sales by Category</div>
            {salesByCategoryList.length === 0 ? (
              <p style={{ color: '#888', fontSize: '13px' }}>No category sales data yet.</p>
            ) : (
              <div className="an__products-category-list">
                {salesByCategoryList.map((item, i) => (
                  <div key={i} className="an__products-category-row">
                    <div className="an__products-category-info">
                      <div className="an__products-category-name">{item.name}</div>
                      <div className="an__products-category-sku">{item.sku}</div>
                      <div className="an__products-category-bar-track">
                        <div className="an__products-category-bar-fill" style={{ width: `${item.width}%`, background: item.color }} />
                      </div>
                    </div>
                    <div className="an__products-category-stats">
                      <div className="an__products-category-units">{item.units} units</div>
                      <div className="an__products-category-revenue">{item.revenue}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="an__chart-card">
            <div className="an__products-section-title">Low And Out of Stock Items</div>
            {lowStockItems.length === 0 ? (
              <p style={{ color: '#16a34a', fontSize: '13px', margin: '8px 0' }}>All products are well stocked!</p>
            ) : (
              <div className="an__products-stock-list">
                {lowStockItems.map((item, i) => (
                  <div key={i} className="an__products-stock-row">
                    <div className="an__products-stock-info">
                      <div className="an__products-stock-name">{item.name}</div>
                      <div className="an__products-stock-sub">
                        <span className="an__products-stock-sku">SKU: {item.sku}</span>
                        <span className="an__products-stock-sep">•</span>
                        <span className="an__products-stock-category">{item.category}</span>
                      </div>
                    </div>
                    {item.status === "out" ? (
                      <span className="an__products-stock-badge an__products-stock-badge--out">Out Of Stock</span>
                    ) : (
                      <span className="an__products-stock-badge an__products-stock-badge--low">{item.stock} left</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Analytics;