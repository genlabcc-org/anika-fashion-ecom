import React, { useState, useRef, useEffect } from "react";
import { variantService } from "../../../services/variantService";
import ConfirmDialog from "../dialogs/confirmdialogs";
import "./ProductVariant.css";

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

const FieldError = ({ children }) => (
  <div className="cmp-error">
    <svg className="cmp-error-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6" stroke="#DC2626" strokeWidth="1.3" />
      <line x1="7" y1="4" x2="7" y2="7.8" stroke="#DC2626" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="7" cy="10" r="0.75" fill="#DC2626" />
    </svg>
    <span>{children}</span>
  </div>
);

const InfoHint = ({ children }) => (
  <div className="cmp-info-hint">
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6" stroke="#9CA3AF" strokeWidth="1.3" />
      <line x1="7" y1="6.2" x2="7" y2="10" stroke="#9CA3AF" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="7" cy="4" r="0.75" fill="#9CA3AF" />
    </svg>
    <span>{children}</span>
  </div>
);

const Toggle = ({ checked, onChange }) => (
  <button
    type="button"
    className={`cmp-toggle ${checked ? "cmp-toggle--on" : ""}`}
    onClick={() => onChange(!checked)}
    role="switch"
    aria-checked={checked}
  >
    <span className="cmp-toggle-knob" />
  </button>
);

let variantSeq = 0;
const makeVariant = () => ({
  id: `v-${Date.now()}-${variantSeq++}`,
  sizeDimension: "",
  stockQuantity: "",
  minStockAlert: "",
  price: "",
  sellingPrice: "",
  color: null,
  sku: "",
  media: [],
});

const CreateMultipleProduct = ({
  categories = [],
  categoryPath = [],
  onGoToRoot,
  onBreadcrumbClick,
  onBack,
  onSave,
  subcategoriesCache = {},
  onFetchSubcategories,
  editingProductId = null,
}) => {
  const isEditing = !!editingProductId;
  const [loading, setLoading] = useState(isEditing);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [loadingSubcategories, setLoadingSubcategories] = useState(false);
  const subcategories = subcategoriesCache[category] || [];

  const [variants, setVariants] = useState([makeVariant()]);
  const [showOnStore, setShowOnStore] = useState(false);
  const [featuredProduct, setFeaturedProduct] = useState(true);

  const [errors, setErrors] = useState({});
  const mediaInputRefs = useRef({});

  const [saving, setSaving] = useState(false);
  const [deletedVariantIds, setDeletedVariantIds] = useState([]);
  const [variantToDelete, setVariantToDelete] = useState(null);

  // ── Load existing product + variants when editing ──
  useEffect(() => {
    if (!editingProductId) return;
    const load = async () => {
      setLoading(true);
      try {
        const { product, variants: existingVariants } = await variantService.getProductWithVariants(editingProductId);
        setTitle(product.name || "");
        setDescription(product.description || "");
        setCategory(product.category_id != null ? String(product.category_id) : "");
        setSubCategory(product.subcategory_id != null ? String(product.subcategory_id) : "");
        setShowOnStore(!!product.is_active);
        setFeaturedProduct(!!product.is_featured);
        setVariants(
          existingVariants.length > 0
            ? existingVariants.map(v => ({
              id: v.variant_id,
              variant_id: v.variant_id,
              sizeDimension: v.size || "",
              stockQuantity: String(v.stock ?? ""),
              minStockAlert: String(v.stock_alert ?? ""),
              price: String(v.compare_price ?? ""),
              sellingPrice: String(v.price ?? ""),
              color: v.color || null,
              sku: v.sku || "",
              images: v.images || [],
              media: [],
            }))
            : [makeVariant()]
        );
      } catch (err) {
        console.error("Failed to load product for editing:", err);
        alert("Failed to load product: " + err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [editingProductId]);

  useEffect(() => {
    if (!category) return;
    if (subcategoriesCache[category]) return;

    const fetchSubcategories = async () => {
      setLoadingSubcategories(true);
      try {
        await onFetchSubcategories?.(category);
      } catch (err) {
        console.error("Failed to load subcategories:", err);
      } finally {
        setLoadingSubcategories(false);
      }
    };
    fetchSubcategories();
  }, [category, subcategoriesCache, onFetchSubcategories]);

  const clearFieldError = (variantId, field) => {
    setErrors((prev) => {
      const variantErrors = prev[variantId];
      if (!variantErrors || !variantErrors[field]) return prev;
      const nextVariantErrors = { ...variantErrors };
      delete nextVariantErrors[field];
      return { ...prev, [variantId]: nextVariantErrors };
    });
  };

  const clearTopError = (field) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const updateVariant = (id, field, value) => {
    setVariants((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: value } : v))
    );
    clearFieldError(id, field);
  };

  const handleAddVariant = () => {
    setVariants((prev) => [...prev, makeVariant()]);
  };

  const requestRemoveVariant = (id) => {
    setVariantToDelete(id);
  };

  const confirmRemoveVariant = () => {
    if (!variantToDelete) return;
    const id = variantToDelete;
    setVariants((prev) => {
      if (prev.length <= 1) return prev;
      const removed = prev.find((v) => v.id === id);
      if (removed?.variant_id) {
        setDeletedVariantIds((ids) => [...ids, removed.variant_id]);
      }
      return prev.filter((v) => v.id !== id);
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setVariantToDelete(null);
  };

  const handleMediaSelect = (variantId, e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const next = files.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: URL.createObjectURL(file),
      file,
    }));

    setVariants((prev) =>
      prev.map((v) => (v.id === variantId ? { ...v, media: [...v.media, ...next] } : v))
    );
    e.target.value = "";
  };

  const handleRemoveMedia = (variantId, mediaId) => {
    setVariants((prev) =>
      prev.map((v) =>
        v.id === variantId
          ? { ...v, media: v.media.filter((m) => m.id !== mediaId) }
          : v
      )
    );
  };

  const handleRemoveExistingImage = (variantId, index) => {
    setVariants((prev) =>
      prev.map((v) =>
        v.id === variantId
          ? { ...v, images: (v.images || []).filter((_, i) => i !== index) }
          : v
      )
    );
  };

  const handleReorderExistingImages = (variantId, sourceIdx, targetIdx) => {
    if (sourceIdx === targetIdx) return;
    setVariants((prev) =>
      prev.map((v) => {
        if (v.id !== variantId) return v;
        const next = [...(v.images || [])];
        const [moved] = next.splice(sourceIdx, 1);
        next.splice(targetIdx, 0, moved);
        return { ...v, images: next };
      })
    );
  };

  const handleReorderMedia = (variantId, sourceIdx, targetIdx) => {
    if (sourceIdx === targetIdx) return;
    setVariants((prev) =>
      prev.map((v) => {
        if (v.id !== variantId) return v;
        const next = [...v.media];
        const [moved] = next.splice(sourceIdx, 1);
        next.splice(targetIdx, 0, moved);
        return { ...v, media: next };
      })
    );
  };

  const validate = () => {
    const topErrors = {};
    if (!title.trim()) topErrors.title = ["Title Cannot Be Empty"];
    if (!description.trim()) topErrors.description = ["Description Cannot Be Empty"];

    const variantErrors = {};
    variants.forEach((v) => {
      const fieldErrors = {};

      if (v.sizeDimension === "" || v.sizeDimension === null) {
        fieldErrors.sizeDimension = ["Cant Be Empty"];
      }
      if (v.stockQuantity === "" || v.stockQuantity === null) {
        fieldErrors.stockQuantity = ["Cant Be Empty"];
      }
      if (v.minStockAlert === "" || v.minStockAlert === null) {
        fieldErrors.minStockAlert = ["Cant Be Empty"];
      }
      if (v.price === "" || v.price === null) {
        fieldErrors.price = ["Cant Be Empty"];
      }

      const sellingPriceInvalid =
        v.sellingPrice === "" ||
        v.sellingPrice === null ||
        (v.price !== "" && Number(v.sellingPrice) > Number(v.price));
      if (sellingPriceInvalid) {
        fieldErrors.sellingPrice = ["Cant Be Higher Than Price", "Cant Be Empty"];
      }

      if (Object.keys(fieldErrors).length) {
        variantErrors[v.id] = fieldErrors;
      }
    });

    setErrors({ ...topErrors, ...variantErrors });
    return Object.keys(topErrors).length === 0 && Object.keys(variantErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    const productData = {
      name: title,
      description,
      category_id: parseInt(category) || null,
      subcategory_id: subCategory || null,
      is_active: showOnStore,
      is_featured: featuredProduct,
    };

    setSaving(true);
    try {
      const result = isEditing
        ? await variantService.updateProductWithVariants(editingProductId, productData, variants, deletedVariantIds)
        : await variantService.createProductWithVariants({ ...productData, has_variants: true }, variants);
      onSave?.(result);
    } catch (err) {
      console.error("Failed to save variant product:", err);
      alert("Failed to save product: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <main className="dashboard-content cmp-page"><p style={{ padding: 24 }}>Loading product…</p></main>;
  }

  return (
    <main className="dashboard-content cmp-page">
      {variantToDelete && (
        <ConfirmDialog
          title="Delete Variant?"
          message="Are you sure you want to delete this variant?"
          confirmLabel="Delete"
          cancelLabel="Cancel"
          isDanger={true}
          onConfirm={confirmRemoveVariant}
          onCancel={() => setVariantToDelete(null)}
        />
      )}

      <div className="cmp-header">
        <div>
          <h1 className="cmp-title">{isEditing ? "Edit Multiple Product" : "Create Multiple Product"}</h1>
          <div className="cmp-breadcrumb">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onGoToRoot ? onGoToRoot() : onBack?.();
              }}
            >
              All Categories
            </a>
            {categoryPath.map((c, idx) => (
              <React.Fragment key={`${c.id ?? "crumb"}-${idx}`}>
                <span className="cmp-breadcrumb-sep">›</span>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onBreadcrumbClick?.(idx);
                  }}
                >
                  {c.name}
                </a>
              </React.Fragment>
            ))}
            <span className="cmp-breadcrumb-sep">›</span>
            <span className="cmp-breadcrumb-current">Create Multiple Product</span>
          </div>
        </div>

        <button type="button" className="cmp-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Title / Description / Category / Sub Category */}
      <div className="cmp-card">
        <label className="cmp-field">
          <span className="cmp-label">Title</span>
          <input
            type="text"
            className={`cmp-input${errors.title ? " cmp-input--error" : ""}`}
            placeholder="Necklace"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              clearTopError("title");
            }}
          />
          {errors.title?.map((msg) => (
            <FieldError key={msg}>{msg}</FieldError>
          ))}
        </label>

        <label className="cmp-field">
          <span className="cmp-label">Description</span>
          <textarea
            className={`cmp-textarea${errors.description ? " cmp-input--error" : ""}`}
            placeholder="Enter Description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              clearTopError("description");
            }}
          />
          {errors.description?.map((msg) => (
            <FieldError key={msg}>{msg}</FieldError>
          ))}
        </label>

        <div className="cmp-row">
          <label className="cmp-field">
            <span className="cmp-label">Category</span>
            <select
              className="cmp-select"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setSubCategory("");
              }}
            >
              <option value="">Select Your Category</option>
              {categories.map((c) => (
                <option key={c.category_id ?? c.name} value={c.category_id ?? c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="cmp-field">
            <span className="cmp-label">Sub Category</span>
            <select
              className="cmp-select"
              value={subCategory}
              onChange={(e) => setSubCategory(e.target.value)}
              disabled={!category || loadingSubcategories || subcategories.length === 0}
            >
              <option value="">
                {loadingSubcategories ? "Loading…" : "Select Your Sub Category"}
              </option>
              {subcategories.map((sc) => (
                <option key={sc.subcategory_id} value={sc.subcategory_id}>
                  {sc.name}
                </option>
              ))}
            </select>
            {category && !loadingSubcategories && subcategories.length === 0 && (
              <InfoHint>Sub Category Not Found</InfoHint>
            )}
          </label>
        </div>
      </div>

      {/* Variants */}
      <div className="cmp-card">
        <span className="cmp-section-title">Variants</span>

        {variants.map((v, idx) => {
          const vErrors = errors[v.id] || {};
          return (
            <div className="cmp-variant" key={v.id}>
              <div className="cmp-variant-row">
                <label className="cmp-field">
                  <span className="cmp-label">Size/Dimension</span>
                  <input
                    type="text"
                    className={`cmp-input${vErrors.sizeDimension ? " cmp-input--error" : ""}`}
                    placeholder="Size"
                    value={v.sizeDimension}
                    onChange={(e) => updateVariant(v.id, "sizeDimension", e.target.value)}
                  />
                  {vErrors.sizeDimension?.map((msg) => (
                    <FieldError key={msg}>{msg}</FieldError>
                  ))}
                </label>

                <label className="cmp-field">
                  <span className="cmp-label">Stock Quantity</span>
                  <input
                    type="text"
                    className={`cmp-input${vErrors.stockQuantity ? " cmp-input--error" : ""}`}
                    placeholder="0"
                    value={v.stockQuantity}
                    onChange={(e) => updateVariant(v.id, "stockQuantity", e.target.value)}
                  />
                  {vErrors.stockQuantity?.map((msg) => (
                    <FieldError key={msg}>{msg}</FieldError>
                  ))}
                </label>

                <label className="cmp-field">
                  <span className="cmp-label">Minimum Stock Alert</span>
                  <input
                    type="text"
                    className={`cmp-input${vErrors.minStockAlert ? " cmp-input--error" : ""}`}
                    placeholder="0"
                    value={v.minStockAlert}
                    onChange={(e) => updateVariant(v.id, "minStockAlert", e.target.value)}
                  />
                  {vErrors.minStockAlert?.map((msg) => (
                    <FieldError key={msg}>{msg}</FieldError>
                  ))}
                </label>

                <label className="cmp-field">
                  <span className="cmp-label">MRP Price</span>
                  <input
                    type="text"
                    className={`cmp-input${vErrors.price ? " cmp-input--error" : ""}`}
                    placeholder="₹0.00"
                    value={v.price}
                    onChange={(e) => updateVariant(v.id, "price", e.target.value)}
                  />
                  {vErrors.price?.map((msg) => (
                    <FieldError key={msg}>{msg}</FieldError>
                  ))}
                </label>

                <label className="cmp-field">
                  <span className="cmp-label">Price</span>
                  <input
                    type="text"
                    className={`cmp-input${vErrors.sellingPrice ? " cmp-input--error" : ""}`}
                    placeholder="₹0.00"
                    value={v.sellingPrice}
                    onChange={(e) => updateVariant(v.id, "sellingPrice", e.target.value)}
                  />
                  {vErrors.sellingPrice?.map((msg) => (
                    <FieldError key={msg}>{msg}</FieldError>
                  ))}
                </label>
              </div>

              <div className="cmp-variant-row cmp-variant-row--color-sku">
                <div className="cmp-field">
                  <span className="cmp-label">Color</span>
                  <div className="cmp-color-grid">
                    <button
                      type="button"
                      className={`cmp-color-swatch cmp-color-swatch--none${!v.color ? " cmp-color-swatch--selected" : ""
                        }`}
                      onClick={() => updateVariant(v.id, "color", null)}
                      aria-label="No color (None)"
                      title="No color (None)"
                    >
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                        <circle cx="10" cy="10" r="8" stroke="#9CA3AF" strokeWidth="1.5" strokeDasharray="2 2" />
                        <line x1="4.5" y1="15.5" x2="15.5" y2="4.5" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                    {COLOR_SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`cmp-color-swatch${v.color === c ? " cmp-color-swatch--selected" : ""
                          }${c === "#FFFFFF" ? " cmp-color-swatch--white" : ""}`}
                        style={{ backgroundColor: c }}
                        onClick={() => updateVariant(v.id, "color", v.color === c ? null : c)}
                        aria-label={`Select color ${c}`}
                      >
                        {v.color === c && (
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

                <label className="cmp-field">
                  <span className="cmp-label">Sku</span>
                  <input
                    type="text"
                    className="cmp-input"
                    placeholder="Input your text"
                    value={v.sku}
                    onChange={(e) => updateVariant(v.id, "sku", e.target.value)}
                  />
                  <span className="cmp-hint">Auto Generated Or Enter Manually</span>
                </label>
              </div>

              <div className="cmp-variant-row cmp-variant-row--media">
                <div className="cmp-media-row">
                  <button
                    type="button"
                    className="cmp-media-add"
                    onClick={() => mediaInputRefs.current[v.id]?.click()}
                    aria-label="Add media"
                  >
                    +
                  </button>
                  <input
                    ref={(el) => (mediaInputRefs.current[v.id] = el)}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => handleMediaSelect(v.id, e)}
                  />
                  {(v.images || []).map((url, i) => (
                    <div
                      className="cmp-media-thumb"
                      key={`existing-${v.id}-${i}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", JSON.stringify({ type: "existing", index: i }));
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        try {
                          const data = JSON.parse(e.dataTransfer.getData("text/plain"));
                          if (data.type === "existing") {
                            handleReorderExistingImages(v.id, data.index, i);
                          }
                        } catch (err) { }
                      }}
                      title="Drag to reorder"
                      style={{ cursor: "grab" }}
                    >
                      <img src={url} alt="Variant" />
                      <button
                        type="button"
                        className="cmp-media-remove"
                        onClick={() => handleRemoveExistingImage(v.id, i)}
                        aria-label="Remove image"
                      >
                        &#10005;
                      </button>
                    </div>
                  ))}

                  {v.media.map((m, i) => (
                    <div
                      className="cmp-media-thumb"
                      key={m.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", JSON.stringify({ type: "new", index: i }));
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        try {
                          const data = JSON.parse(e.dataTransfer.getData("text/plain"));
                          if (data.type === "new") {
                            handleReorderMedia(v.id, data.index, i);
                          }
                        } catch (err) { }
                      }}
                      title="Drag to reorder"
                      style={{ cursor: "grab" }}
                    >
                      <img src={m.url} alt="Variant media" />
                      <button
                        type="button"
                        className="cmp-media-remove"
                        onClick={() => handleRemoveMedia(v.id, m.id)}
                        aria-label="Remove image"
                      >
                        &#10005;
                      </button>
                    </div>
                  ))}
                </div>

                {variants.length > 1 && (
                  <button
                    type="button"
                    className="cmp-delete-btn"
                    onClick={() => requestRemoveVariant(v.id)}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M2.5 4.5h11M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M12.5 4.5l-.6 8.4a1.5 1.5 0 0 1-1.5 1.4H5.6a1.5 1.5 0 0 1-1.5-1.4l-.6-8.4"
                        stroke="#DC2626"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Delete
                  </button>
                )}
              </div>

              <InfoHint>
                Chosen Size / Color Must Be Different From The Previous Variant.
              </InfoHint>
            </div>
          );
        })}

        <button type="button" className="cmp-add-variant-btn" onClick={handleAddVariant}>
          <span className="cmp-add-variant-plus">+</span> Add variants
        </button>
      </div>

      {/* Visibility Options */}
      <div className="cmp-card">
        <span className="cmp-section-title">Visibility Options</span>

        <div className="cmp-visibility-row">
          <div>
            <div className="cmp-visibility-title">Show On Store</div>
            <div className="cmp-visibility-desc">
              Product will be visible to customers
            </div>
          </div>
          <Toggle checked={showOnStore} onChange={setShowOnStore} />
        </div>

        {/* <div className="cmp-visibility-row">
          <div>
            <div className="cmp-visibility-title">Featured product</div>
            <div className="cmp-visibility-desc">
              Show in featured collections on home page
            </div>
          </div>
          <Toggle checked={featuredProduct} onChange={setFeaturedProduct} />
        </div> */}
      </div>

      {/* Bottom Footer Actions */}
      <div className="cmp-footer">
        <button
          type="button"
          className="cmp-cancel-btn"
          onClick={onBack}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          className="cmp-save-btn cmp-save-btn--bottom"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </main>
  );
};

export default CreateMultipleProduct;