import React, { useEffect, useState } from "react";
import ConfirmDialog from "../dialogs/confirmdialogs";
import "./FormCategory.css";
import { useSearchParams } from "react-router-dom";
import { productService } from "../../../services/productService";
import { compressImage } from '../../../utils/imageCompression';


const ChangeRemoveActions = ({ onChange, onRemove }) => (
  <div className="scc-pill-row">
    <button type="button" className="scc-pill scc-pill-change" onClick={onChange}>
      Change
    </button>
    <button type="button" className="scc-pill scc-pill-remove" onClick={onRemove}>
      Remove
    </button>
  </div>
);

const formatBytes = (bytes) => {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)}MB`;
};

// Toast notification (matches "Sub Category Created Successfully" style)
const SuccessToast = ({ message, onClose }) => (
  <div className="scc-toast">
    <span className="scc-toast-check">
      <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
        <path
          d="M1 5L4.2 8.2L11 1"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
    <span className="scc-toast-message">{message}</span>
    <button
      type="button"
      className="scc-toast-close"
      onClick={onClose}
      aria-label="Dismiss notification"
    >
      &#10005;
    </button>
  </div>
);

const CreateSubCategory = ({ parentCategory, categories = [], onBack, onDiscard, onSave }) => {

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [showOnStore, setShowOnStore] = useState(false);
  const [searchParams] = useSearchParams();
  const parentId = searchParams.get("parentId");
  const subcategoryId = searchParams.get("subcategoryId");
  const isEditMode = !!subcategoryId;

  const [coverImage, setCoverImage] = useState(null); // { file, url, dims }
  const [loadingExisting, setLoadingExisting] = useState(isEditMode);
  //   const [previewImage, setPreviewImage] = useState(null);

  const [showToast, setShowToast] = useState(false);
  const toastTimerRef = React.useRef(null);

  // Controls the "Are You Sure?" confirmation popup shown before saving
  const [showConfirm, setShowConfirm] = useState(false);

  const coverInputRef = React.useRef(null);
  //   const previewInputRef = React.useRef(null);
  //   const parentId = searchParams.get("parentId");

  const matchedParent = categories.find(
    (c) => String(c.category_id ?? c.id) === String(parentId)
  );

  const [parentCategoryName, setParentCategoryName] = useState(
    matchedParent?.name || ""
  );

  useEffect(() => {
    if (!subcategoryId) return;
    const loadingExisting = async () => {
      try {
        const rows = await productService.getSubCategories(parentId);
        const existing = rows.find((s) => s.subcategory_id === subcategoryId);
        if (existing) {
          setName(existing.name || "");
          setDescription(existing.description || "");
          setShowOnStore(!!existing.is_active);
          if (existing.image_url) {
            setCoverImage({ url: existing.image_url, name: "current-image", file: null });
          }
        }
      } catch (error) {
        console.error("Error loading subcategory:", error);
      } finally {
        setLoadingExisting(false);
      }
    };
    loadingExisting();
  }, [subcategoryId, parentId]);

  const handleFileSelect = (e, setter) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Use a base64 data URL (via FileReader), not URL.createObjectURL.
    // Blob URLs only live for the current tab session — they break the
    // instant the page refreshes, even if saved into localStorage. A data
    // URL is just a string, so it serializes and survives a reload.
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const img = new Image();
      img.onload = () => {
        setter({
          file,
          url: dataUrl,
          name: file.name,
          width: img.width,
          height: img.height,
          size: formatBytes(file.size),
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };


  const dismissToast = () => {
    setShowToast(false);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  };

  // "Save" button (both top bar and bottom) no longer saves directly —
  // it just opens the confirm dialog.
  const handleSaveClick = () => {
    setShowConfirm(true);
  };

  const slugify = (str) =>
    (str || "").toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  // This is the actual save logic, now triggered from ConfirmDialog's
  // onConfirm instead of directly from the Save button.

  const [isSaving, setIsSaving] = useState(false);

  const performSave = async () => {
    setIsSaving(true);
    try {
      let imageUrl = coverImage?.url && !coverImage?.file ? coverImage.url : null;

      if (coverImage?.file) {
        const compressed = await compressImage(coverImage.file);
        const fileToUpload = compressed?.file ?? compressed;
        const safeName = (fileToUpload.name || coverImage.file.name).replace(/\s+/g, '-');
        // const safeName = compressedFile.file.name.replace(/\s+/g, '-');
        const filePath = `subcategories/${Date.now()}-${safeName}`;
        await productService.uploadSubcategoryImage(filePath, coverImage.file);
        imageUrl = productService.getSubcategoryImagePublicUrl(filePath);
      }

      const payload = {
        parent_id: parentId || parentCategory?.id,
        name,
        slug: slugify(name),
        description: description || null,
        image_url: imageUrl,
        is_active: showOnStore,
      };

      const saved = isEditMode
        ? await productService.updateSubcategory(subcategoryId, payload)
        : await productService.createSubcategory(payload);

      setIsSaving(false);
      setShowConfirm(false);
      setShowToast(true);

      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setShowToast(false);
        toastTimerRef.current = null;
        onSave?.(saved);
      }, 1200);
    } catch (error) {
      console.error("Error saving subcategory:", error);
      setIsSaving(false);
      alert("Failed to save subcategory: " + error.message);
      setShowConfirm(false);
    }
  };
  //   const performSave = () => {
  //     onSave?.({
  //       id: parentCategory?.id ? `${parentCategory.id}-${Date.now()}` : Date.now(),
  //       name,
  //     //   parentId,
  //       parentCategoryName,
  //       description,
  //       showOnStore,
  //       // url is a base64 data string (not a blob URL), so this whole object
  //       // is plain serializable data — safe to store in localStorage and it
  //       // survives a page refresh. CategoryDetail reads item.image?.url.
  //       image: coverImage
  //         ? {
  //             url: coverImage.url,
  //             name: coverImage.name,
  //             width: coverImage.width,
  //             height: coverImage.height,
  //             size: coverImage.size,
  //           }
  //         : null,
  //       parentId: parentId || parentCategory?.id || null,
  //     });

  return (
    <div className="dashboard-shell">
      {showToast && (
        <SuccessToast
          message="Sub Category Created Successfully"
          onClose={dismissToast}
        />
      )}

      {showConfirm && (
        <ConfirmDialog
          title={isEditMode ? "Update Sub Category?" : "Create Sub Category?"}
          message={`Are you sure you want to ${isEditMode ? "update" : "create"} "${name || "this sub category"}"?`}
          confirmLabel={isSaving ? "Saving..." : "Save"}
          isLoading={isSaving}
          onConfirm={performSave}
          onCancel={() => !isSaving && setShowConfirm(false)}
        />
      )}

      <div className="dashboard-body">
        <main className="scc-page">
          <div className="scc-topbar">
            <div className="scc-topbar-left">
              <button className="scc-back-btn" onClick={onBack} aria-label="Go back">
                ←
              </button>
              <h1 className="scc-title">Create Sub Category</h1>
            </div>
            <div className="scc-topbar-actions">
              <button className="scc-btn scc-btn-outline" onClick={onDiscard}>
                Discard
              </button>
              <button className="scc-btn scc-btn-dark" onClick={handleSaveClick}>
                Save
              </button>
            </div>
          </div>

          <div className="scc-form-wrap">
            <div className="scc-card">
              {/* Sub Category Information */}
              <section className="scc-section">
                <h2 className="scc-card-title">Sub Category Information</h2>
                <div className="scc-divider" />

                <label className="scc-field-label" htmlFor="scc-name">
                  Sub Category Name
                </label>
                <input
                  id="scc-name"
                  type="text"
                  className="scc-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter sub category name"
                />

                <label className="scc-field-label" htmlFor="scc-parent-category">
                  Parent Category Name
                </label>

                <input
                  id="scc-parent-category"
                  type="text"
                  className="scc-input"
                  value={parentCategoryName}
                  onChange={(e) => setParentCategoryName(e.target.value)}
                  placeholder="Enter parent category name"
                  readOnly={!!matchedParent}
                  style={matchedParent ? { backgroundColor: "#f5f5f5", cursor: "not-allowed" } : undefined}
                />
                {matchedParent && (
                  <div className="scc-optional-tag" style={{ marginTop: 4 }}>
                    Locked — creating a subcategory under "{matchedParent.name}"
                  </div>
                )}

                <label className="scc-field-label scc-field-label-optional" htmlFor="scc-desc">
                  Description <span className="scc-optional-tag">optional</span>
                </label>
                <textarea
                  id="scc-desc"
                  className="scc-textarea"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter Description"
                />
              </section>

              {/* Sub Category Cover Image */}
              <section className="scc-section">
                <h2 className="scc-card-title">Sub Category Cover Image</h2>

                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => handleFileSelect(e, setCoverImage)}
                />

                {coverImage ? (
                  <div className="scc-cover-filled">
                    <div className="scc-cover-image-wrap">
                      <img src={coverImage.url} alt="Sub category cover" />
                    </div>
                    <div className="scc-cover-meta">
                      <span className="scc-meta-filename">{coverImage.name}</span>
                      <span className="scc-meta-line">Uploaded just now</span>
                      <span className="scc-meta-line">
                        {coverImage.width}×{coverImage.height} · {coverImage.size}
                      </span>
                      <ChangeRemoveActions
                        onChange={() => coverInputRef.current?.click()}
                        onRemove={() => setCoverImage(null)}
                      />
                    </div>
                  </div>
                ) : (
                  <div
                    className="scc-dropzone"
                    onClick={() => coverInputRef.current?.click()}
                  >
                    <button type="button" className="scc-dropzone-btn">
                      <span className="scc-dropzone-icon">&#8595;</span>
                      Click or drop image
                    </button>
                    <span className="scc-dropzone-hint">
                      JPG, PNG or WEBP &middot; Max 2 MB &middot; 16:9 Ratio
                    </span>
                  </div>
                )}
              </section>

              {/* Visibility Options */}
              <section className="scc-section scc-visibility-section">
                <h2 className="scc-card-title">Visibility Options</h2>
                <div className="scc-visibility-row">
                  <div>
                    <div className="scc-visibility-title">Show On Store</div>
                    <div className="scc-visibility-subtitle">
                      Product will be visible to customers
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`scc-toggle ${showOnStore ? "scc-toggle-on" : ""}`}
                    onClick={() => setShowOnStore((v) => !v)}
                    aria-pressed={showOnStore}
                    aria-label="Toggle show on store"
                  >
                    <span className="scc-toggle-knob" />
                  </button>
                </div>
              </section>
            </div>

            <div className="scc-bottom-actions">
              <button className="scc-btn scc-btn-dark" onClick={handleSaveClick} disabled={isSaving}>
                {isSaving ? "Saving..." : isEditMode ? "Update Subcategory" : "Save Subcategory"}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default CreateSubCategory;