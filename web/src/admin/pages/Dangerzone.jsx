import React, { useState } from "react";
import { supabase } from "../../lib/supabase";
import Toast from "../../components/Toast";
import "./Dangerzone.css";

const downloadCSV = (filename, headers, rows) => {
  const escapeCell = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    return `"${str.replace(/"/g, '""')}"`;
  };

  const csvContent = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map(escapeCell).join(","))
  ].join("\r\n");

  // UTF-8 BOM ensures Excel / Sheets parse non-ASCII characters and currencies without garbled text
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const DangerZone = () => {
  const [confirmModal, setConfirmModal] = useState(null);
  const [exporting, setExporting] = useState(null);
  const [toast, setToast] = useState({ message: "", type: "info" });

  const showToast = (message, type = "info") => {
    setToast({ message: "", type });
    setTimeout(() => setToast({ message, type }), 10);
  };

  // Export all products with full catalog details in CSV
  const handleExportProducts = async () => {
    try {
      setExporting("products");
      const { data: products, error } = await supabase
        .from("products")
        .select("*, categories!category_id(name), subcategories(name), product_variants(*)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!products || products.length === 0) {
        showToast("No products found in database to export.", "warning");
        return;
      }

      const headers = [
        "Product ID",
        "Product Name",
        "Category",
        "Subcategory",
        "SKU",
        "Price (₹)",
        "Compare Price (₹)",
        "Stock Quantity",
        "Stock Status",
        "Status",
        "Has Variants",
        "Variant Count",
        "Variant Details",
        "Available Sizes",
        "Available Colors",
        "Primary Image URL",
        "Gallery Images",
        "Description",
        "Date Added"
      ];

      const rows = products.map((p) => {
        const variants = Array.isArray(p.product_variants) ? p.product_variants : [];
        const variantSummary = variants
          .map(
            (v, i) =>
              `[#${i + 1} SKU: ${v.sku || "N/A"} | Color: ${v.color || "N/A"} | Size: ${v.size || "N/A"} | Stock: ${v.stock ?? "N/A"} | Price: ₹${v.price ?? "N/A"}]`
          )
          .join(" ; ");

        const sizes = Array.isArray(p.sizes) ? p.sizes.join(", ") : (p.sizes || "");
        const colors = Array.isArray(p.colors) ? p.colors.join(", ") : (p.colors || "");
        const allImages = Array.isArray(p.images) ? p.images.join(" | ") : (p.images || "");
        const cleanDesc = (p.description || "").replace(/[\r\n]+/g, " ").trim();
        const dateAdded = p.created_at
          ? new Date(p.created_at).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            })
          : "";

        return [
          p.product_id || p.id || "",
          p.name || "",
          p.categories?.name || p.category || "",
          p.subcategories?.name || p.subcategory || "",
          p.sku || "",
          p.price ?? "",
          p.compare_price ?? "",
          p.stock ?? 0,
          p.stock > 0 ? "In Stock" : "Out of Stock",
          p.is_active !== false ? "Active" : "Inactive",
          p.has_variants ? "Yes" : "No",
          variants.length,
          variantSummary,
          sizes,
          colors,
          p.image_url || "",
          allImages,
          cleanDesc,
          dateAdded
        ];
      });

      const today = new Date().toISOString().slice(0, 10);
      downloadCSV(`anika_all_products_${today}.csv`, headers, rows);
      showToast(`Exported ${products.length} products successfully!`, "success");
    } catch (err) {
      console.error("Failed to export products CSV:", err);
      showToast("Export failed: " + (err.message || "Unknown error"), "error");
    } finally {
      setExporting(null);
    }
  };

  // Export all orders with item details in CSV
  const handleExportOrders = async () => {
    try {
      setExporting("orders");
      const { data: orders, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .order("order_date", { ascending: false });

      if (error) throw error;
      if (!orders || orders.length === 0) {
        showToast("No orders found in database to export.", "warning");
        return;
      }

      const headers = [
        "Order ID",
        "Order Date",
        "Customer Name",
        "Customer Email",
        "Customer Phone",
        "Total Price (₹)",
        "Order Status",
        "Payment Method",
        "Delivery Provider",
        "Waybill",
        "Items Count",
        "Items Summary"
      ];

      const rows = orders.map((o) => {
        const items = Array.isArray(o.order_items) ? o.order_items : [];
        const itemsSummary = items
          .map((item) => `${item.product_name || "Item"} (Qty: ${item.quantity || 1}, ₹${item.price || 0})`)
          .join(" ; ");

        const placedDate = o.order_date
          ? new Date(o.order_date).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            })
          : "";

        return [
          o.id || "",
          placedDate,
          o.customer_name || o.shipping_address?.full_name || "",
          o.customer_email || "",
          o.customer_phone || o.shipping_address?.phone_number || "",
          o.total_price || o.price || 0,
          o.status || "",
          o.payment || o.payment_method || "COD",
          o.delivery_provider || "",
          o.waybill || "",
          items.length || o.quantity || 1,
          itemsSummary || o.item_name || ""
        ];
      });

      const today = new Date().toISOString().slice(0, 10);
      downloadCSV(`anika_all_orders_${today}.csv`, headers, rows);
      showToast(`Exported ${orders.length} orders successfully!`, "success");
    } catch (err) {
      console.error("Failed to export orders CSV:", err);
      showToast("Export failed: " + (err.message || "Unknown error"), "error");
    } finally {
      setExporting(null);
    }
  };

  // Export all customers in CSV
  const handleExportCustomers = async () => {
    try {
      setExporting("customers");
      const { data: customers, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!customers || customers.length === 0) {
        showToast("No customers found to export.", "warning");
        return;
      }

      const headers = [
        "Customer ID",
        "Full Name",
        "Email",
        "Phone Number",
        "Role",
        "Joined Date"
      ];

      const rows = customers.map((c) => {
        const joinedDate = c.created_at
          ? new Date(c.created_at).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric"
            })
          : "";

        return [
          c.id || "",
          c.name || c.full_name || "",
          c.email || "",
          c.phone || c.phone_number || "",
          c.role || "customer",
          joinedDate
        ];
      });

      const today = new Date().toISOString().slice(0, 10);
      downloadCSV(`anika_all_customers_${today}.csv`, headers, rows);
      showToast(`Exported ${customers.length} customers successfully!`, "success");
    } catch (err) {
      console.error("Failed to export customers CSV:", err);
      showToast("Export failed: " + (err.message || "Unknown error"), "error");
    } finally {
      setExporting(null);
    }
  };

  const handleAction = (action) => {
    setConfirmModal(action);
  };

  const handleConfirm = () => {
    // Handle confirmed irreversible action
    showToast("This action requires master key confirmation.", "warning");
    setConfirmModal(null);
  };

  return (
    <div className="dz">
      {toast.message && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ message: "", type: "info" })}
        />
      )}

      <div className="dz__header">
        <h1 className="dz__title">Settings</h1>
        <p className="dz__subtitle">Danger Zone</p>
      </div>

      {/* Export & Backup Section */}
      <div className="dz__section">
        <div className="dz__row">
          <span className="dz__row-label">Export All Orders</span>
          <button
            className="dz__csv-btn"
            onClick={handleExportOrders}
            disabled={exporting !== null}
          >
            {exporting === "orders" ? "Generating CSV..." : "Download CSV"}
          </button>
        </div>
        <div className="dz__row">
          <span className="dz__row-label">Export all customers</span>
          <button
            className="dz__csv-btn"
            onClick={handleExportCustomers}
            disabled={exporting !== null}
          >
            {exporting === "customers" ? "Generating CSV..." : "Download CSV"}
          </button>
        </div>
        <div className="dz__row">
          <span className="dz__row-label">Export all products</span>
          <button
            className="dz__csv-btn"
            onClick={handleExportProducts}
            disabled={exporting !== null}
          >
            {exporting === "products" ? "Generating CSV..." : "Download CSV"}
          </button>
        </div>
        <div className="dz__row dz__row--last">
          <span className="dz__row-label">Last full backup</span>
          <span className="dz__backup-date">Live Database Synchronized</span>
        </div>
      </div>

      {/* Irreversible Actions */}
      <div className="dz__danger-section">
        <p className="dz__danger-heading">Irreversible actions</p>

        <div className="dz__danger-grid">
          {/* Clear all orders */}
          <div className="dz__danger-card">
            <p className="dz__danger-card-title">Clear all orders</p>
            <p className="dz__danger-card-desc">
              Permanently delete all order records. Customer accounts and products are not affected.
            </p>
            <button
              className="dz__danger-btn"
              onClick={() => handleAction("clear_orders")}
            >
              Save Preferences
            </button>
          </div>

          {/* Reset store to default */}
          <div className="dz__danger-card">
            <p className="dz__danger-card-title">Reset store to default</p>
            <p className="dz__danger-card-desc">
              Removes all products, categories, banners, and orders. Admin account is preserved. This cannot be undone.
            </p>
            <button
              className="dz__danger-btn"
              onClick={() => handleAction("reset_store")}
            >
              Save Preferences
            </button>
          </div>

          {/* Delete store permanently */}
          <div className="dz__danger-card dz__danger-card--full">
            <p className="dz__danger-card-title">Delete store permanently</p>
            <p className="dz__danger-card-desc">
              Closes your Anika Jewels store completely. All data including products, orders, customers, and admin accounts will be permanently erased. This action cannot be reversed.
            </p>
            <button
              className="dz__danger-btn"
              onClick={() => handleAction("delete_store")}
            >
              Save Preferences
            </button>
          </div>
        </div>
      </div>

      {/* Confirm Modal */}
      {confirmModal && (
        <div className="dz__modal-overlay" onClick={() => setConfirmModal(null)}>
          <div className="dz__modal" onClick={(e) => e.stopPropagation()}>
            <p className="dz__modal-title">Are you sure?</p>
            <p className="dz__modal-desc">This action is irreversible. Please confirm to proceed.</p>
            <div className="dz__modal-actions">
              <button className="dz__modal-cancel" onClick={() => setConfirmModal(null)}>
                Cancel
              </button>
              <button className="dz__modal-confirm" onClick={handleConfirm}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DangerZone;