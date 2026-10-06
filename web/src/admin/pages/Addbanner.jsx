import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import "./Addbanner.css";
import { bannerService } from "../../services/bannerService";

const UploadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const BackIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const AddBanner = ({ onBack, onPublish, initialData }) => {
  const location = useLocation();
  const bannerData = location.state?.banner || initialData;

  const [editingId] = useState(() => {
    if (!bannerData) return null;
    return bannerData.id ?? bannerData._id ?? bannerData.banner_id ?? bannerData.uuid ?? null;
  });
  const [title, setTitle] = useState(() => bannerData?.title || "");
  const [description, setDescription] = useState(() => bannerData?.description || bannerData?.tagline || "");
  const [previewImage, setPreviewImage] = useState(() => bannerData?.image_url || bannerData?.image || null);
  const [imageFile, setImageFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Mobile Image State
  const [previewMobileImage, setPreviewMobileImage] = useState(() => bannerData?.mobile_url || bannerData?.mobile_image_url || null);
  const [mobileImageFile, setMobileImageFile] = useState(null);
  const [isDraggingMobile, setIsDraggingMobile] = useState(false);

  const [previewMode, setPreviewMode] = useState("desktop"); // 'desktop' | 'mobile'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const fileInputRef = useRef(null);
  const mobileFileInputRef = useRef(null);

  const handleFileSelect = (file) => {
    if (file && file.type.startsWith("image/")) {
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setPreviewImage(url);
      setErrorMsg("");
    }
  };

  const handleFileChange = (e) => {
    const file = e.target?.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    e.target.value = "";
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  // Mobile File Handlers
  const handleMobileFileSelect = (file) => {
    if (file && file.type.startsWith("image/")) {
      setMobileImageFile(file);
      const url = URL.createObjectURL(file);
      setPreviewMobileImage(url);
      setErrorMsg("");
    }
  };

  const handleMobileFileChange = (e) => {
    const file = e.target?.files?.[0];
    if (file) {
      handleMobileFileSelect(file);
    }
    e.target.value = "";
  };

  const handleMobileFileDrop = (e) => {
    e.preventDefault();
    setIsDraggingMobile(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      handleMobileFileSelect(file);
    }
  };

  const handleDiscard = () => {
    if (onBack) onBack();
  };

  const isEditing = editingId !== null && editingId !== undefined;

  const handlePublish = async () => {
    if (isSubmitting) return;
    if (!title.trim()) {
      setErrorMsg("Please enter a banner title");
      return;
    }
    if (!previewImage && !imageFile) {
      setErrorMsg("Please select or drop a desktop banner image");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg("");

      let finalImageUrl = previewImage;
      let finalMobileUrl = previewMobileImage;

      // 1. Upload Desktop image to Cloudflare R2 if new file selected
      if (imageFile) {
        const { publicUrl } = await bannerService.uploadBannerImage(imageFile);
        finalImageUrl = publicUrl;
        setImageFile(null);
      }

      // 2. Upload Mobile image to Cloudflare R2 if new file selected
      if (mobileImageFile) {
        const { publicUrl } = await bannerService.uploadBannerImage(mobileImageFile);
        finalMobileUrl = publicUrl;
        setMobileImageFile(null);
      }

      // 3. Save or update banner data in Supabase banners table
      let bannerResult;
      if (isEditing) {
        bannerResult = await bannerService.updateBanner(editingId, {
          title: title.trim(),
          description: description.trim(),
          imageUrl: finalImageUrl,
          mobileUrl: finalMobileUrl,
        });
      } else {
        bannerResult = await bannerService.createBanner({
          title: title.trim(),
          description: description.trim(),
          imageUrl: finalImageUrl,
          mobileUrl: finalMobileUrl,
        });
      }

      if (onPublish) {
        onPublish(bannerResult);
      } else if (onBack) {
        onBack();
      }
    } catch (err) {
      console.error("Failed to save banner:", err);
      setErrorMsg(err.message || "Failed to save banner. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ab">
      {/* Hidden File Inputs outside container */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <input
        ref={mobileFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleMobileFileChange}
      />

      {/* Header */}
      <div className="ab__header">
        <button className="ab__back-btn" onClick={onBack} aria-label="Go back">
          <BackIcon />
        </button>
        <h1 className="ab__title">{isEditing ? "Edit Banner" : "Add Banner"}</h1>
      </div>

      <div className="ab__body">
        {errorMsg && (
          <div className="ab__error-banner" style={{ background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "8px", marginBottom: "12px", fontSize: "13px" }}>
            {errorMsg}
          </div>
        )}

        {/* Banner Title */}
        <div className="ab__section">
          <label className="ab__label">Banner Title</label>
          <input
            className="ab__input"
            type="text"
            placeholder="e.g. Draped in Elegance"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* Banner Description */}
        <div className="ab__section">
          <label className="ab__label">Banner Description</label>
          <textarea
            className="ab__input"
            rows="3"
            placeholder="e.g. Discover handcrafted fashion jewellery for every occasion"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ resize: "vertical" }}
          />
        </div>

        {/* Banner Images Row (Desktop + Mobile) */}
        <div className="ab__row">
          {/* Desktop Banner Image */}
          <div className="ab__col">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <label className="ab__label" style={{ margin: 0 }}>Desktop Banner Image <span style={{ color: "#ef4444" }}>*</span></label>
              {imageFile && (
                <div className="ab__file-badge">
                  <span>{(imageFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                  {imageFile.size <= 6 * 1024 * 1024 ? (
                    <span className="ab__file-status ab__file-status--original">✓ Original Clarity</span>
                  ) : (
                    <span className="ab__file-status ab__file-status--compress">⚡ Auto-optimizing</span>
                  )}
                </div>
              )}
            </div>
            <div
              className={`ab__upload-zone${isDragging ? " ab__upload-zone--dragging" : ""}${previewImage ? " ab__upload-zone--has-image" : ""}`}
              onClick={() => {
                if (!previewImage) fileInputRef.current?.click();
              }}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleFileDrop}
            >
              {previewImage ? (
                <div className="ab__image-container">
                  <img src={previewImage} alt="Desktop Banner preview" className="ab__upload-preview" />
                  <div className="ab__image-overlay">
                    <button
                      type="button"
                      className="ab__image-btn ab__image-btn--change"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                    >
                      <EditIcon /> Change Image
                    </button>
                    <button
                      type="button"
                      className="ab__image-btn ab__image-btn--remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewImage(null);
                        setImageFile(null);
                      }}
                    >
                      <TrashIcon /> Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="ab__upload-placeholder">
                  <div className="ab__upload-icon-wrap">
                    <UploadIcon />
                  </div>
                  <span className="ab__upload-text">Click or drop desktop image</span>
                  <span className="ab__upload-hint">1920×600px recommended · Under 3MB (Up to 6MB as-is)</span>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Banner Image (Optional) */}
          <div className="ab__col">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <label className="ab__label" style={{ margin: 0 }}>Mobile Banner Image <span style={{ color: "#9ca3af", fontWeight: "normal" }}>(Optional)</span></label>
              {mobileImageFile && (
                <div className="ab__file-badge">
                  <span>{(mobileImageFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                  {mobileImageFile.size <= 6 * 1024 * 1024 ? (
                    <span className="ab__file-status ab__file-status--original">✓ Original Clarity</span>
                  ) : (
                    <span className="ab__file-status ab__file-status--compress">⚡ Auto-optimizing</span>
                  )}
                </div>
              )}
            </div>
            <div
              className={`ab__upload-zone${isDraggingMobile ? " ab__upload-zone--dragging" : ""}${previewMobileImage ? " ab__upload-zone--has-image" : ""}`}
              onClick={() => {
                if (!previewMobileImage) mobileFileInputRef.current?.click();
              }}
              onDragOver={(e) => { e.preventDefault(); setIsDraggingMobile(true); }}
              onDragLeave={() => setIsDraggingMobile(false)}
              onDrop={handleMobileFileDrop}
            >
              {previewMobileImage ? (
                <div className="ab__image-container">
                  <img src={previewMobileImage} alt="Mobile Banner preview" className="ab__upload-preview" />
                  <div className="ab__image-overlay">
                    <button
                      type="button"
                      className="ab__image-btn ab__image-btn--change"
                      onClick={(e) => {
                        e.stopPropagation();
                        mobileFileInputRef.current?.click();
                      }}
                    >
                      <EditIcon /> Change Mobile Image
                    </button>
                    <button
                      type="button"
                      className="ab__image-btn ab__image-btn--remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewMobileImage(null);
                        setMobileImageFile(null);
                      }}
                    >
                      <TrashIcon /> Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="ab__upload-placeholder">
                  <div className="ab__upload-icon-wrap">
                    <UploadIcon />
                  </div>
                  <span className="ab__upload-text">Click or drop mobile image</span>
                  <span className="ab__upload-hint">600×600px portrait · Under 2MB (Up to 6MB as-is)</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Home Page Hero Preview */}
        <div className="ab__section">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <label className="ab__label" style={{ margin: 0 }}>Home Page Hero Preview</label>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                className={`ab__mode-btn${previewMode === 'desktop' ? ' ab__mode-btn--active' : ''}`}
                onClick={() => setPreviewMode('desktop')}
                style={{
                  padding: "4px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: "500",
                  border: previewMode === 'desktop' ? "1px solid #111827" : "1px solid #e5e7eb",
                  background: previewMode === 'desktop' ? "#111827" : "#fff",
                  color: previewMode === 'desktop' ? "#fff" : "#374151",
                  cursor: "pointer"
                }}
              >
                Desktop View
              </button>
              <button
                type="button"
                className={`ab__mode-btn${previewMode === 'mobile' ? ' ab__mode-btn--active' : ''}`}
                onClick={() => setPreviewMode('mobile')}
                style={{
                  padding: "4px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: "500",
                  border: previewMode === 'mobile' ? "1px solid #111827" : "1px solid #e5e7eb",
                  background: previewMode === 'mobile' ? "#111827" : "#fff",
                  color: previewMode === 'mobile' ? "#fff" : "#374151",
                  cursor: "pointer"
                }}
              >
                Mobile View
              </button>
            </div>
          </div>

          <div className="ab__preview-box" style={{ position: "relative", minHeight: previewMode === 'mobile' ? "240px" : "180px", maxWidth: previewMode === 'mobile' ? "320px" : "100%", margin: "0 auto", borderRadius: "12px", overflow: "hidden" }}>
            {((previewMode === 'mobile' ? previewMobileImage || previewImage : previewImage)) ? (
              <div style={{ position: "relative", width: "100%", height: previewMode === 'mobile' ? "240px" : "180px" }}>
                <img
                  src={previewMode === 'mobile' ? previewMobileImage || previewImage : previewImage}
                  alt="Hero preview"
                  className="ab__preview-img"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)", display: "flex", flexDirection: "column", justifyContent: "center", padding: "20px" }}>
                  <h3 style={{ color: "#fff", margin: "0 0 6px 0", fontSize: previewMode === 'mobile' ? "15px" : "18px", fontWeight: "700" }}>{title || "Banner Title"}</h3>
                  <p style={{ color: "rgba(255,255,255,0.85)", margin: 0, fontSize: previewMode === 'mobile' ? "12px" : "13px" }}>{description || "Banner description will appear here..."}</p>
                </div>
              </div>
            ) : (
              <div className="ab__preview-placeholder">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span>Upload an image to see Hero preview</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="ab__footer">
        <button className="ab__btn ab__btn--discard" onClick={handleDiscard} disabled={isSubmitting}>Discard</button>
        <button className="ab__btn ab__btn--publish" onClick={handlePublish} disabled={isSubmitting}>
          {isSubmitting
            ? (isEditing ? "Updating..." : "Uploading...")
            : (isEditing ? "Update Banner" : "Publish Banner")}
        </button>
      </div>
    </div>
  );
};

export default AddBanner;