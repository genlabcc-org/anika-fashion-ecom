import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./WishlistPage.css";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import { useStore } from "../hooks/useStore";
import { getOriginalImageUrl } from '../utils/imageUtils';
import { getNavPath } from "../services/categoryRoute";

export default function WishlistPage({ onBack }) {
  const navigate = useNavigate();

  // Zustand Store
  const categories = useStore((state) => state.categories);
  const wishlistItems = useStore((state) => state.wishlistItems);
  const removeFromWishlist = useStore((state) => state.removeFromWishlist);
  const removeSelectedFromWishlist = useStore((state) => state.removeSelectedFromWishlist);
  const addToCart = useStore((state) => state.addToCart);
  const setSelectedProduct = useStore((state) => state.setSelectedProduct);

  const [selectedIds, setSelectedIds] = useState([]);
  const [toast, setToast] = useState("");
  const [newsletterEmail, setNewsletterEmail] = useState("");

  // Sync selectedIds when wishlist items change
  useEffect(() => {
    if (wishlistItems.length > 0) {
      setSelectedIds((prev) => {
        const valid = prev.filter((id) => wishlistItems.some((item) => item.id === id));
        if (valid.length > 0) return valid;
        return wishlistItems.map((item) => item.id);
      });
    } else {
      setSelectedIds([]);
    }
  }, [wishlistItems]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const allSelected = wishlistItems.length > 0 && selectedIds.length === wishlistItems.length;

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(wishlistItems.map((i) => i.id));
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const deleteSelected = async () => {
    await removeSelectedFromWishlist(selectedIds);
    setSelectedIds([]);
    showToast("Items removed from wishlist");
  };

  const handleAddToCart = async (item) => {
    const hasSizes = (item.sizes && item.sizes.length > 0) || (item.category && item.category.toLowerCase() === 'bangles');
    if (hasSizes) {
      handleViewProduct(item);
      showToast("Please select a size to order this product", "info");
      return;
    }
    await addToCart({
      productId: item.id || item.productId,
      id: item.id || item.productId,
      name: item.name,
      price: item.price,
      originalPrice: item.originalPrice,
      img: item.image,
      image: item.image,
      category: item.category,
    });
    showToast(`Added "${item.name}" to cart!`);
  };

  const handleViewProduct = (item) => {
    setSelectedProduct({
      id: item.id || item.productId,
      productId: item.id || item.productId,
      name: item.name,
      price: item.price,
      originalPrice: item.originalPrice,
      img: item.image,
      image: item.image,
      category: item.category || "",
    });
    navigate("/product");
  };

  return (
    <div className="wishlist-page-wrapper">

      {/* ── HEADER ──────────────────────────────────────────── */}
      <SiteHeader
        activeLink=""
        onLinkClick={(link) => navigate(getNavPath(link, categories))}
      />

      {/* ── TOAST ───────────────────────────────────────────── */}
      {toast && (
        <div className="wishlist-toast">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          {toast}
        </div>
      )}

      <main className="wishlist-main">

        <div className="wishlist-header-row" style={{ display: 'flex', alignItems: 'center' }}>
          {onBack && (
            <button onClick={onBack} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: '15px', display: 'flex', alignItems: 'center', padding: '5px', color: 'inherit' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="24" height="24">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          )}
          <h1 className="wishlist-title">Wishlist</h1>
        </div>

        {/* ── WISHLIST ITEMS ─────────────────────────────────── */}
        {wishlistItems.length === 0 ? (
          <div className="wishlist-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            <p>Your wishlist is empty</p>
          </div>
        ) : (
          <>
            {/* Select bar */}
            <div className="wishlist-select-bar">
              <label className="select-all-label">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="wish-checkbox"
                />
                <span>{selectedIds.length}/{wishlistItems.length} Items Selected</span>
              </label>
              <button
                className="wish-delete-btn"
                onClick={deleteSelected}
                disabled={selectedIds.length === 0}
                aria-label="Delete selected"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
            </div>

            {/* Items list */}
            <div className="wishlist-items-list">
              {wishlistItems.map((item) => (
                <div key={item.id} className="wishlist-item">
                  <input
                    type="checkbox"
                    className="wish-checkbox item-checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => toggleSelect(item.id)}
                  />
                  <img
                    src={getOriginalImageUrl(item.image)}
                    alt={item.name}
                    className="wishlist-item-img"
                    onClick={() => handleViewProduct(item)}
                    style={{ cursor: "pointer" }}
                  />
                  <div className="wishlist-item-info">
                    <p
                      className="wishlist-item-name"
                      onClick={() => handleViewProduct(item)}
                      style={{ cursor: "pointer" }}
                    >
                      {item.name}
                    </p>
                    <div className="wishlist-item-pricing">
                      <span className="wishlist-item-price">₹{Number(item.price || 0).toLocaleString("en-IN")}</span>
                      {item.originalPrice && Number(item.originalPrice) > Number(item.price) && (
                        <span className="wishlist-item-original">₹{Number(item.originalPrice).toLocaleString("en-IN")}</span>
                      )}
                    </div>
                    {item.category && (
                      <p className="wishlist-item-category">{item.category}</p>
                    )}
                    {item.deliveryDate && (
                      <div className="wishlist-item-delivery">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="1" y="3" width="15" height="13" rx="1"/>
                          <path d="M16 8h4l3 5v3h-7V8z"/>
                          <circle cx="5.5" cy="18.5" r="2.5"/>
                          <circle cx="18.5" cy="18.5" r="2.5"/>
                        </svg>
                        <span>Delivered by {item.deliveryDate}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleAddToCart(item)}
                      style={{
                        marginTop: "8px",
                        padding: "6px 14px",
                        backgroundColor: "#111827",
                        color: "#fff",
                        border: "none",
                        borderRadius: "4px",
                        fontSize: "0.85rem",
                        cursor: "pointer",
                        width: "fit-content"
                      }}
                    >
                      {(item.sizes && item.sizes.length > 0) || (item.category && item.category.toLowerCase() === 'bangles')
                        ? "Select Size"
                        : "Add to Cart"}
                    </button>
                  </div>
                  <button
                    className="wishlist-remove-btn"
                    onClick={async () => {
                      await removeFromWishlist(item.id);
                      showToast("Item removed from wishlist");
                    }}
                    aria-label="Remove from wishlist"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

      </main>

      {/* ── FOOTER ──────────────────────────────────────────── */}
      <SiteFooter
        newsletterEmail={newsletterEmail}
        setNewsletterEmail={setNewsletterEmail}
        onSubscribe={() => { showToast("Subscribed!"); setNewsletterEmail(""); }}
      />

    </div>
  );
}