import React, { useState, useRef, useEffect } from "react";
import { productService } from "../../services/productService";
import { useStore } from "../../hooks/useStore";
import back from "../../assets/admin/back.png";
import "./addcategory.css";

const EMPTY_FORM = {
  name: "",
  slug: "",
  sort_order: "",
  description: "",
};

const resolveIsActive = (data) => {
  if (!data) return true;
  if (typeof data.is_active === "boolean") return data.is_active;
  if (data.is_active !== undefined && data.is_active !== null) {
    return String(data.is_active) === "true" || data.is_active === 1;
  }
  if (data.status) {
    return data.status.toLowerCase() === "active";
  }
  return true;
};

// ── Image Upload ──────────────────────────────────────────────
const uploadCategoryImage = async (file, categoryName) => {
  const fileExt = file.name.split(".").pop();
  const fileName = `${categoryName.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.${fileExt}`;
  const filePath = `categories/${fileName}`;

  try {
    await productService.uploadCategoryImage(filePath, file);
    const publicUrl = productService.getCategoryImagePublicUrl(filePath);
    return { url: publicUrl, path: filePath };
  } catch (error) {
    console.error("Upload error:", error);
    return { error };
  }
};

// ── Compress Image ────────────────────────────────────────────
const compressImage = async (file, maxWidth = 800, quality = 0.8) => {
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

export default function AddCategory({ onBack, onPublish, onSaveDraft, initialData }) {
  const isEditing = !!initialData;

  const [form, setForm] = useState(() =>
    initialData
      ? {
        name: initialData.name || "",
        slug: initialData.slug || "",
        sort_order: initialData.sort_order?.toString() || "",
        description: initialData.description || "",
      }
      : EMPTY_FORM
  );

  const [imageUrl, setImageUrl] = useState(initialData?.image_url || null);
  const [rawFile, setRawFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [isActive, setIsActive] = useState(() => resolveIsActive(initialData));
  const [materialOptions, setMaterialOptions] = useState([]);
  const [stoneOptions, setStoneOptions] = useState([]);
  const [materialInput, setMaterialInput] = useState("");
  const [stoneInput, setStoneInput] = useState("");

  const fileRef = useRef();

  useEffect(() => {
    if (initialData) {
      setForm({
        name: initialData.name || "",
        slug: initialData.slug || "",
        sort_order: initialData.sort_order?.toString() || "",
        description: initialData.description || "",
      });
      setImageUrl(initialData.image_url || null);
      setRawFile(null);
      setIsActive(resolveIsActive(initialData));
      setMaterialOptions([]);
      setStoneOptions([]);
      setMaterialInput("");
      setStoneInput("");
    } else {
      setForm(EMPTY_FORM);
      setImageUrl(null);
      setRawFile(null);
      setIsActive(true);
      setMaterialOptions([]);
      setStoneOptions([]);
      setMaterialInput("");
      setStoneInput("");
    }
  }, [initialData]);

  const handleAddMaterial = () => {
    const nextValue = materialInput.trim();
    if (nextValue && !materialOptions.includes(nextValue)) {
      setMaterialOptions((prev) => [...prev, nextValue]);
      setMaterialInput("");
    }
  };

  const handleAddStone = () => {
    const nextValue = stoneInput.trim();
    if (nextValue && !stoneOptions.includes(nextValue)) {
      setStoneOptions((prev) => [...prev, nextValue]);
      setStoneInput("");
    }
  };

  const set = (k) => (e) => {
    const value = e.target.value;
    setForm((f) => {
      const updated = { ...f, [k]: value };
      // Auto-generate slug from name while typing (add mode only)
      if (k === "name" && !isEditing) {
        updated.slug = value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      }
      return updated;
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const processFile = (file) => {
    setImageUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setRawFile(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) processFile(file);
  };

  const removeImage = () => {
    setImageUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setRawFile(null);
  };

  // ── Upload Image ────────────────────────────────────────────
  const uploadImage = async () => {
    if (!rawFile) return { url: imageUrl, error: null };

    setUploading(true);
    const compressed = await compressImage(rawFile);
    const { url, error } = await uploadCategoryImage(compressed, form.name || "category");

    setUploading(false);
    return { url, error };
  };

  const [saving, setSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // ── Save Category ───────────────────────────────────────────
  const saveCategory = async (targetStatus) => {
    setSaving(true);
    const { url: uploadedUrl, error: uploadError } = await uploadImage();
    if (uploadError) {
      setSaving(false);
      alert("Failed to upload image: " + uploadError.message);
      return { error: uploadError };
    }

    const effectiveIsActive = targetStatus === "draft" ? false : Boolean(isActive);

    const categoryData = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      sort_order: parseInt(form.sort_order, 10) || 0,
      description: form.description?.trim() || "",
      image_url: uploadedUrl,
      is_active: effectiveIsActive,
    };

    try {
      if (isEditing) {
        const catId = initialData?.category_id || initialData?.id;
        if (!catId) {
          throw new Error("Category ID is missing. Cannot update category.");
        }
        const data = await productService.updateCategory(catId, categoryData);
        if (!data || data.length === 0) {
          throw new Error("Category update returned no data. Check category ID.");
        }
        const updated = data[0];
        try {
          useStore.getState().updateCategoryInStore?.(updated);
          useStore.getState().fetchCategories?.({ force: true });
        } catch (e) {
          console.warn("Failed to sync store categories:", e);
        }
        setSaving(false);
        return { data: updated, error: null };
      } else {
        const data = await productService.insertCategory(categoryData);
        if (!data || data.length === 0) {
          throw new Error("Category insert returned no data.");
        }
        const created = data[0];
        try {
          useStore.getState().updateCategoryInStore?.(created);
          useStore.getState().fetchCategories?.({ force: true });
        } catch (e) {
          console.warn("Failed to sync store categories:", e);
        }
        setSaving(false);
        return { data: created, error: null };
      }
    } catch (error) {
      setSaving(false);
      alert((isEditing ? "Update failed: " : "Insert failed: ") + error.message);
      return { error };
    }
  };

  const handlePublish = async () => {
    if (!form.name.trim()) {
      alert("Category name is required.");
      return;
    }
    const result = await saveCategory("active");
    if (!result.error) {
      setToastMessage(isEditing ? "Category Updated Successfully!" : "Category Created Successfully!");
      setShowToast(true);
      setTimeout(() => {
        if (onPublish) onPublish(result.data);
      }, 1200);
    }
  };

  const handleDraft = async () => {
    if (!form.name.trim()) {
      alert("Category name is required.");
      return;
    }
    const result = await saveCategory("draft");
    if (!result.error) {
      setToastMessage("Category Draft Saved Successfully!");
      setShowToast(true);
      setTimeout(() => {
        if (onSaveDraft) onSaveDraft(result.data);
      }, 1200);
    }
  };

  return (
    <div className="ap-page">
      {/* ── Header ── */}
      <div className="ap-header">
        <button className="ap-back-btn" onClick={onBack}>
          <img src={back} alt="Back" />
        </button>
        <h1>{isEditing ? "Edit Category" : "Add Category"}</h1>
      </div>

      {/* ── Name & Details ── */}
      <div className="ap-card">
        <div className="ap-card-title">Category Details</div>

        <div className="ap-field">
          <label>Category Name</label>
          <input
            placeholder="e.g Rings"
            value={form.name}
            onChange={set("name")}
          />
        </div>

        <div className="ap-field">
          <label>Description</label>
          <input
            placeholder="Short description for SEO"
            value={form.description}
            onChange={set("description")}
          />
        </div>

        <div className="ap-row-2">
          <div className="ap-field">
            <label>Display Order</label>
            <input
              type="number"
              placeholder="0"
              value={form.sort_order}
              onChange={set("sort_order")}
            />
            <div className="ap-auto-hint">Lower number appears first</div>
          </div>
          <div className="ap-field">
            <label>Slug</label>
            <input
              placeholder="auto-generated"
              value={form.slug}
              readOnly
            />
            <div className="ap-auto-hint">URL-friendly name</div>
          </div>
        </div>
      </div>

      {/* ── Category Image ── */}
      <div className="ap-card">
        <div className="ap-card-title">Category Image</div>

        <div
          className={`ap-drop-zone ${uploading ? "uploading" : ""}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current.click()}
        >
          <div className="ap-drop-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {uploading ? "Uploading..." : "Click or drop image"}
          </div>
          <div className="ap-drop-hint">SVG, PNG or WEBP • Max 2 MB</div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {imageUrl && (
          <div className="ap-thumbs" style={{ marginTop: 10 }}>
            <div className="ap-thumb-wrapper">
              <img src={imageUrl} className="ap-thumb" alt="Category" />
              <button
                className="ap-thumb-del"
                onClick={(e) => { e.stopPropagation(); removeImage(); }}
                title="Remove image"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Visibility ── */}
      <div className="ap-card">
        <div className="ap-card-title">Visibility</div>
        <div className="ap-toggle-row">
          <div>
            <div className="ap-toggle-label">Active</div>
            <div className="ap-toggle-sub">Category visible on store</div>
          </div>
          <label className="ap-toggle">
            <input
              type="checkbox"
              checked={isActive}
              onChange={() => setIsActive((v) => !v)}
            />
            <span className="ap-slider" />
          </label>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="ap-footer">
        <button type="button" className="ap-btn-draft" onClick={handleDraft} disabled={saving || uploading}>
          {saving ? "Saving..." : "Save Draft"}
        </button>
        <button type="button" className="ap-btn-publish" onClick={handlePublish} disabled={saving || uploading}>
          {saving ? "Saving..." : uploading ? "Uploading..." : isEditing ? "Update Category" : "Publish Category"}
        </button>
      </div>

      {showToast && (
        <div style={{
          position: "fixed",
          bottom: "30px",
          right: "30px",
          background: "#111827",
          color: "#fff",
          padding: "14px 24px",
          borderRadius: "10px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
          zIndex: 9999,
          animation: "dropdown-fade 0.2s ease"
        }}>
          <span style={{ background: "#10B981", borderRadius: "50%", padding: "4px", display: "flex" }}>
            <svg width="14" height="14" viewBox="0 0 12 10" fill="none">
              <path d="M1 5L4.2 8.2L11 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span style={{ fontSize: "14px", fontWeight: "600" }}>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}