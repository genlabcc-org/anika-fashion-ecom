import React, { useState, useRef, useEffect } from "react";
import { productService } from "../../services/productService";
import back from "../../assets/admin/back.png";
import "./addproduct.css";

const COLOR_SWATCHES = [
  "#EF4444", // red
  "#9B111E", // ruby red
  "#E75480", //Pink
  "#FFC0CB", //bady pink
  "#734F96", //lavender
  "#8B2FC9", // purple
  "#87CEEB", // sky blue
  "#4169E1", // royal blue
  "#040273", // deep blue
  "#429E9D", // mint blue
  "#05C3DD", // aqua blue
  "#008000", // green
  "#50C878", //emerald green
  "#98FF98", // mint green
  "#FFFF00", // yellow
  "#FFA500", // orange
  "#111827", // black
  "#FFFFFF", // white
  "#9CA3AF", // gray
  "#2DD4BF", // teal
];

const EMPTY_FORM = {
  name: "",
  description: "",
  sku: "",
  category_id: "",
  subcategory_id: "",
  price: "",
  compare_price: "",
  // discount_price: "",
  stock: "",
  stock_alert: "",
  material: "",
  weight: "",
  sizes: "",
  colors: [],
  care: "",
};

// ── Image Upload to Supabase Storage ──────────────────────────
const uploadProductImage = async (file, productName) => {
  const fileExt = file.name.split(".").pop();
  const fileName = `${productName.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.${fileExt}`;
  const filePath = `products/${fileName}`;

  try {
    await productService.uploadProductImage(filePath, file);
    const publicUrl = productService.getProductImagePublicUrl(filePath);
    return { url: publicUrl, path: filePath };
  } catch (error) {
    console.error("Upload error:", error);
    return { error };
  }
};

// ── Compress Image Before Upload ──────────────────────────────
const compressImage = async (file, maxWidth = 1200, quality = 0.8) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = maxWidth;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          resolve(
            new File([blob], file.name.replace(/\.[^/.]+$/, ".webp"), {
              type: "image/webp",
            })
          );
        },
        "image/webp",
        quality
      );
    };
    img.src = URL.createObjectURL(file);
  });
};

export const generateSKU = (categoryName, sequenceNum = 1) => {
  const catCode = (categoryName || "PRD")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 3)
    .toUpperCase();
  return `AF${catCode}${String(sequenceNum).padStart(4, "0")}`;
};

export default function AddProduct({ onBack, onPublish, onSaveDraft, onAddVariant, initialData }) {
  const isEditing = !!initialData;

  const [form, setForm] = useState(() =>
    initialData
      ? {
        name: initialData.name || "",
        description: initialData.description || "",
        sku: initialData.sku || "",
        category_id: initialData.category_id || "",
        subcategory_id: initialData.subcategory_id || "",
        price: initialData.price || "",
        compare_price: initialData.compare_price || "",
        // discount_price: initialData.discount_price || "",
        stock: initialData.stock || "",
        stock_alert: initialData.stock_alert || "",
        material: initialData.material || "",
        weight: initialData.weight || "",
        sizes: initialData.sizes?.join(", ") || "",
        colors: Array.isArray(initialData.colors)
          ? initialData.colors
          : (typeof initialData.colors === "string"
            ? initialData.colors.split(",").map((s) => s.trim()).filter(Boolean)
            : []),
        care: initialData.care || "",
      }
      : {
        ...EMPTY_FORM,
        sku: "",
      }
  );

  const [imageList, setImageList] = useState(() =>
    initialData?.images?.map((url, i) => ({
      id: `img-old-${i}-${url}`,
      url,
      file: null,
    })) || []
  );
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingAction, setSavingAction] = useState(null);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [loadingSubcategories, setLoadingSubcategories] = useState(false);
  const [errors, setErrors] = useState({});
  const sanitizeInteger = (value) => value.replace(/[^0-9]/g, "");
  const [visibility, setVisibility] = useState([
    initialData?.is_active ?? false,
    initialData?.is_featured ?? false,
  ]);

  const fileRef = useRef();

  // Fetch categories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await productService.getCategories();
        setCategories(data || []);
      } catch (err) {
        console.error("Failed to load categories:", err);
      }
    };
    fetchCategories();
  }, []);

  // Fetch subcategories when category changes
  useEffect(() => {
    const fetchSubcategories = async () => {
      if (!form.category_id) {
        setSubcategories([]);
        return;
      }
      setLoadingSubcategories(true);
      try {
        const data = await productService.getSubCategories(parseInt(form.category_id));
        setSubcategories(data || []);
      } catch (err) {
        console.error("Failed to load subcategories:", err);
      } finally {
        setLoadingSubcategories(false);
      }
    };
    fetchSubcategories();
  }, [form.category_id]);

  const validatePricing = (priceVal, comparePriceVal) => {
    const price = parseFloat(priceVal);
    const comparePrice = parseFloat(comparePriceVal);

    if (!isNaN(price) && !isNaN(comparePrice) && comparePrice > 0 && price >= comparePrice) {
      return "Price must be lower than MRP (Compare-at Price)";
    }
    return null;
  };

  // Reset form when initialData changes
  useEffect(() => {
    if (initialData) {
      setForm({
        name: initialData.name || "",
        description: initialData.description || "",
        sku: initialData.sku || "",
        category_id: initialData.category_id || "",
        subcategory_id: initialData.subcategory_id || "",
        price: initialData.price || "",
        compare_price: initialData.compare_price || "",
        // discount_price: initialData.discount_price || "",
        stock: initialData.stock || "",
        stock_alert: initialData.stock_alert || "",
        material: initialData.material || "",
        weight: initialData.weight || "",
        sizes: initialData.sizes?.join(", ") || "",
        colors: Array.isArray(initialData.colors)
          ? initialData.colors
          : (typeof initialData.colors === "string"
            ? initialData.colors.split(",").map((s) => s.trim()).filter(Boolean)
            : []),
        care: initialData.care || "",
      });
      setImageList(
        initialData.images?.map((url, i) => ({
          id: `img-old-${i}-${url}`,
          url,
          file: null,
        })) || []
      );
      setVisibility([initialData.is_active ?? false, initialData.is_featured ?? false]);
    } else {
      setForm({ ...EMPTY_FORM, sku: "" });
      setImageList([]);
      setVisibility([false, false]);
    }
  }, [initialData]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleDrop = (e) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  };

  const addFiles = (newFiles) => {
    const remaining = 6 - imageList.length;
    if (remaining <= 0) return;
    const filesArray = Array.from(newFiles).slice(0, remaining);
    const newItems = filesArray.map((f, i) => ({
      id: `img-new-${Date.now()}-${i}`,
      url: URL.createObjectURL(f),
      file: f,
    }));
    setImageList((prev) => [...prev, ...newItems].slice(0, 6));
  };

  const removeImage = (idx) => {
    setImageList((prev) => {
      const item = prev[idx];
      if (item?.url?.startsWith("blob:")) URL.revokeObjectURL(item.url);
      return prev.filter((_, i) => i !== idx);
    });
  };

  // ── Drag & Drop to Reorder Thumbnails ─────────────────────────
  const handleDragStart = (e, index) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index);
    setDraggedIndex(index);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDropThumb = (e, targetIndex) => {
    e.preventDefault();
    const sourceIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (isNaN(sourceIndex) || sourceIndex === targetIndex) {
      setDraggedIndex(null);
      return;
    }
    setImageList((prev) => {
      const next = [...prev];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const toggleVis = (i) =>
    setVisibility((v) => v.map((val, idx) => (idx === i ? !val : val)));

  const toggleColor = (hex) => {
    setForm((f) => {
      const currentColors = Array.isArray(f.colors) ? f.colors : [];
      const exists = currentColors.includes(hex);
      return {
        ...f,
        colors: exists ? currentColors.filter((c) => c !== hex) : [...currentColors, hex],
      };
    });
  };

  const clearColors = () => {
    setForm((f) => ({
      ...f,
      colors: [],
    }));
  };

  // ── Upload All Images to Supabase ────────────────────────────
  const uploadAllImages = async () => {
    if (imageList.length === 0) return { urls: [], error: null };

    setUploading(true);
    const finalUrls = [];

    for (const item of imageList) {
      if (item.file) {
        const { url, error } = await uploadProductImage(
          item.file,
          form.name || "product"
        );

        if (error) {
          setUploading(false);
          return { urls: [], error };
        }

        finalUrls.push(url);
      } else {
        finalUrls.push(item.url);
      }
    }

    setUploading(false);
    return { urls: finalUrls, error: null };
  };

  // ── Save Product to Database ─────────────────────────────────
  const saveProduct = async (status) => {
    setSubmitting(true);
    try {
      console.log("category_id:", form.category_id, "subcategory_id:", form.subcategory_id);
      const { urls, error: uploadError } = await uploadAllImages();
      if (uploadError) {
        alert("Failed to upload images: " + uploadError.message);
        return { error: uploadError };
      }

      const productData = {
        name: form.name,
        description: form.description,
        sku: form.sku || null,
        category_id: parseInt(form.category_id) || null,
        subcategory_id: form.subcategory_id || null,
        price: parseFloat(form.price) || 0,
        compare_price: parseFloat(form.compare_price) || null,
        // discount_price: parseFloat(form.discount_price) || null,
        stock: parseInt(form.stock) || 0,
        stock_alert: parseInt(form.stock_alert) || null,
        material: form.material,
        weight: parseFloat(form.weight) || null,
        sizes: form.sizes ? form.sizes.split(",").map((s) => s.trim()) : null,
        colors: form.colors || [],
        care: form.care,
        image_url: urls[0] || null,
        images: urls,
        is_active: visibility[0],
        is_featured: visibility[1],
      };

      if (isEditing) {
        // Update existing product
        const productId = initialData?.product_id || initialData?.id;
        const data = await productService.updateProduct(productId, productData);
        return { data: data[0], error: null };
      } else {
        // Insert new product
        const data = await productService.insertProduct(productData);
        return { data: data[0], error: null };
      }
    } catch (error) {
      alert((isEditing ? "Update failed: " : "Insert failed: ") + error.message);
      return { error };
    } finally {
      setSubmitting(false);
      setSavingAction(null);
    }
  };

  const handlePublish = async () => {
    if (submitting || uploading) return;
    if (!form.name.trim()) { alert("Product name is required."); return; }
    if (!form.category_id) { alert("Please select a category."); return; }
    if (!form.price) { alert("Price is required."); return; }
    if (errors.price) { alert(errors.price); return; }
    setSavingAction("publish");
    const result = await saveProduct("Visible");
    if (!result.error && onPublish) onPublish(result.data);
  };

  const handleDraft = async () => {
    if (submitting || uploading) return;
    if (!form.name.trim()) { alert("Product name is required."); return; }
    if (errors.price) { alert(errors.price); return; }
    setSavingAction("draft");
    const result = await saveProduct("Draft");
    if (!result.error && onSaveDraft) onSaveDraft(result.data);
  };

  const handleCategoryChange = async (e) => {
    const newCategoryId = e.target.value;
    if (!newCategoryId) {
      setForm((f) => ({
        ...f,
        category_id: "",
        subcategory_id: "",
        sku: "",
      }));
      return;
    }

    const selectedCategory = categories.find(
      (c) => String(c.category_id) === String(newCategoryId)
    );
    const categoryName = selectedCategory?.name || "";

    // Generate immediate SKU with category code while loading next sequence from DB
    const initialSku = generateSKU(categoryName, 1);
    setForm((f) => ({
      ...f,
      category_id: newCategoryId,
      subcategory_id: "",
      sku: initialSku,
    }));

    try {
      const nextSku = await productService.getNextSku(categoryName);
      if (nextSku) {
        setForm((f) => (f.category_id === newCategoryId ? { ...f, sku: nextSku } : f));
      }
    } catch (err) {
      console.warn("Failed to fetch next sequential SKU, keeping fallback:", err);
    }
  };

  const handlePriceChange = (e) => {
    const value = sanitizeInteger(e.target.value);
    setForm((f) => {
      const updated = { ...f, price: value };
      const error = validatePricing(value, updated.compare_price);
      setErrors((prev) => ({ ...prev, price: error }));
      return updated;
    });
  };

  const handleComparePriceChange = (e) => {
    const value = sanitizeInteger(e.target.value);
    setForm((f) => {
      const updated = { ...f, compare_price: value };
      const error = validatePricing(updated.price, value);
      setErrors((prev) => ({ ...prev, price: error }));
      return updated;
    });
  };

  const handleAddVariant = () => {
    onAddVariant?.();
  };

  return (
    <div className="ap-page">
      {/* ── Header ── */}
      <div className="ap-header">
        <button className="back-btn" onClick={onBack}>
          <img src={back} alt="Back" />
        </button>
        <h1>{isEditing ? "Edit Product" : "Add Product"}</h1>
        {!isEditing && (
          <button
            type="button"
            className="btn-draft ap-header-variant-btn"
            onClick={handleAddVariant}
          >
            + Add Multiple Product
          </button>
        )}
      </div>

      {/* ── Name & Description ── */}
      <div className="card">
        <div className="card-title">Name &amp; description</div>
        <div className="field">
          <label>Product Name</label>
          <input
            placeholder="Input your text"
            value={form.name}
            onChange={set("name")}
          />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea
            placeholder=""
            value={form.description}
            onChange={set("description")}
          />
        </div>
        <div className="grid3-wrap">
          <div className="field">
            <label>SKU</label>
            <input
              placeholder={form.category_id ? "Auto Generated" : "Select category to generate"}
              value={form.sku}
              readOnly
            />
            <div className="auto-hint">
              {form.sku ? "Auto Generated" : "Generated after selecting category"}
            </div>
          </div>
          <div className="field">
            <label>Category</label>
            <select
              value={form.category_id}
              onChange={handleCategoryChange}
            >
              <option value="">Select Category</option>
              {categories.map((cat) => (
                <option key={cat.category_id} value={cat.category_id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Subcategory <span className="scc-optional-tag">optional</span></label>
            {!form.category_id ? (
              <select disabled>
                <option>Select a category first</option>
              </select>
            ) : loadingSubcategories ? (
              <div className="auto-hint">Loading subcategories…</div>
            ) : subcategories.length > 0 ? (
              <select value={form.subcategory_id} onChange={set("subcategory_id")}>
                <option value="">No subcategory</option>
                {subcategories.map((sub) => (
                  <option key={sub.subcategory_id} value={sub.subcategory_id}>
                    {sub.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="auto-hint">No subcategories — listed under category directly.</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Product Images ── */}
      <div className="card">
        <div className="card-title">Product Images</div>
        <div
          className={`drop-zone ${uploading ? "uploading" : ""}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <div className="drop-btn">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {uploading ? "Uploading..." : "Click or drop image"}
          </div>
          <div className="drop-hint">
            SVG or WEBP • Max 2 MB each • Up to 5 Images
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => addFiles(e.target.files)}
        />
        <div className="thumbs">
          {imageList.map((item, i) => (
            <div
              key={item.id || i}
              className={`thumb-wrapper ${draggedIndex === i ? "thumb-wrapper--dragging" : ""}`}
              draggable
              onDragStart={(e) => handleDragStart(e, i)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDropThumb(e, i)}
              onDragEnd={handleDragEnd}
              title="Drag to reorder"
            >
              <img src={item.url} className="thumb" alt="" />
              {i === 0 && <span className="thumb-cover-badge">Cover</span>}
              <button
                type="button"
                className="thumb-del"
                onClick={(e) => {
                  e.stopPropagation();
                  removeImage(i);
                }}
                title="Remove image"
              >
                ×
              </button>
            </div>
          ))}
          {imageList.length === 0 && <div className="thumb-placeholder" />}
          {imageList.length < 6 && !uploading && (
            <div
              className="add-thumb"
              onClick={(e) => {
                e.stopPropagation();
                fileRef.current?.click();
              }}
              title="Add image"
            >
              +
            </div>
          )}
        </div>
        <div className="thumb-hint">
          First image will be used as cover thumbnail. Drag and drop any image to reorder.
        </div>
      </div>



      {/* ── Price & Stock ── */}
      <div className="card">
        <div className="card-title">Price &amp; Stock</div>

        <div className="row-2">
          <div className="field">
            <label>Price (₹)</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Eg: 2000"
              value={form.price}
              onChange={handlePriceChange}
              className={errors.price ? "input-error" : ""}
            />
            {errors.price && <div className="field-warning">{errors.price}</div>}
          </div>
          <div className="field">
            <label>MRP Price (₹)</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Eg: 2000"
              value={form.compare_price}
              onChange={handleComparePriceChange}
            />
          </div>
          {/* <div className="field">
            <label>Discount Price (₹)</label>
            <input
              placeholder="Eg: 2000"
              value={form.discount_price}
              onChange={set("discount_price")}
            />
          </div> */}
        </div>

        <div className="row-2">
          <div className="field">
            <label>Stock Quantity</label>
            <input
              placeholder="Eg: 3"
              value={form.stock}
              onChange={set("stock")}
            />
          </div>
          <div className="field">
            <label>Minimum Stock Alert</label>
            <input
              placeholder="Eg: 3"
              value={form.stock_alert}
              onChange={set("stock_alert")}
            />
          </div>
          <div />
        </div>
      </div>

      {/* ── Product Details ── */}
      <div className="card">
        <div className="card-title">Product Details</div>

        <div className="grid3-wrap">
          <div className="field">
            <label>Material</label>
            <input
              placeholder="Eg: Cotton"
              value={form.material}
              onChange={set("material")}
            />
          </div>
          <div className="field">
            <label>Weight</label>
            <input
              placeholder="Eg: 200g"
              value={form.weight}
              onChange={set("weight")}
            />
          </div>
          <div className="field">
            <label>Size / Dimensions</label>
            <input
              placeholder="Eg: 30x20cm"
              value={form.sizes}
              onChange={set("sizes")}
            />
          </div>
        </div>

        <div className="grid3-wrap">
          <div className="field">
            <label>Colors</label>
            <div className="ap-color-grid">
              <button
                type="button"
                className={`ap-color-swatch ap-color-swatch--none${!(form.colors && form.colors.length) ? " ap-color-swatch--selected" : ""
                  }`}
                onClick={clearColors}
                aria-label="No color (None)"
                title="No color (None)"
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke="#9CA3AF" strokeWidth="1.5" strokeDasharray="2 2" />
                  <line x1="4.5" y1="15.5" x2="15.5" y2="4.5" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`ap-color-swatch${(form.colors || []).includes(c) ? " ap-color-swatch--selected" : ""
                    }${c === "#FFFFFF" ? " ap-color-swatch--white" : ""}`}
                  style={{ backgroundColor: c }}
                  onClick={() => toggleColor(c)}
                  aria-label={`Toggle color ${c}`}
                >
                  {(form.colors || []).includes(c) && (
                    <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                      <path
                        d="M1 5L4.2 8.2L11 1"
                        stroke={c === "#FFFFFF" ? "#111827" : "#fff"}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Care Instructions</label>
            <input
              placeholder="Eg: Avoid water"
              value={form.care}
              onChange={set("care")}
            />
          </div>
          <div />
        </div>
      </div>


      {/* ── Visibility Options ── */}
      <div className="card">
        <div className="card-title">Visibility Options</div>
        <div className="toggle-row">
          <div>
            <div className="toggle-label">Show On Store</div>
            <div className="toggle-sub">
              Product will be visible to customers
            </div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={visibility[0]}
              onChange={() => toggleVis(0)}
            />
            <span className="slider" />
          </label>
        </div>
        <div className="toggle-row">
          <div>
            <div className="toggle-label">Featured Product</div>
            <div className="toggle-sub">
              Show in featured collections on home page
            </div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={visibility[1]}
              onChange={() => toggleVis(1)}
            />
            <span className="slider" />
          </label>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="ap-footer">
        <button
          type="button"
          className="btn-draft"
          onClick={isEditing ? handleDraft : onBack}
          disabled={submitting || uploading}
        >
          {savingAction === "draft" ? (
            <span className="ap-btn-loading">
              <span className="ap-spinner" /> Saving Draft...
            </span>
          ) : isEditing ? (
            "Save as Draft"
          ) : (
            "Cancel"
          )}
        </button>
        <button
          type="button"
          className="btn-publish"
          onClick={handlePublish}
          disabled={submitting || uploading}
        >
          {savingAction === "publish" ? (
            <span className="ap-btn-loading">
              <span className="ap-spinner" /> {uploading ? "Uploading..." : isEditing ? "Updating..." : "Saving..."}
            </span>
          ) : uploading ? (
            "Uploading..."
          ) : isEditing ? (
            "Update Product"
          ) : (
            "Save"
          )}
        </button>
      </div>
    </div>
  );
}