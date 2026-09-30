import { useState, useEffect } from "react";
import "./CartPage.css";
import Navbar from "./SiteHeader"
import Footer from "./SiteFooter"
import { useNavigate } from "react-router-dom";
import WishlistPage from "./wishlistPage";
import { useStore } from "../hooks/useStore";
import { getOriginalImageUrl } from '../utils/imageUtils';
import { getNavPath } from "../services/categoryRoute";

export default function CartPage() {
  const categories = useStore((state) => state.categories);
  const cartItems = useStore((state) => state.cartItems);
  const wishlistItems = useStore((state) => state.wishlistItems);
  const updateCartQty = useStore((state) => state.updateCartQty);
  const removeFromCart = useStore((state) => state.removeFromCart);
  const removeSelectedFromCart = useStore((state) => state.removeSelectedFromCart);
  const toggleWishlist = useStore((state) => state.toggleWishlist);

  const [selectedIds, setSelectedIds] = useState([]);
  const selectedItems = cartItems.filter((i) => selectedIds.includes(i.id));
  const [toast, setToast] = useState("");
  const [showWishlist, setShowWishlist] = useState(false);

  const navigate = useNavigate();

  // Initialize and sync selected items when cartItems load or change
  useEffect(() => {
    if (cartItems.length > 0) {
      setSelectedIds((prev) => {
        const valid = prev.filter((id) => cartItems.some((item) => item.id === id));
        if (valid.length > 0) return valid;
        return cartItems.map((item) => item.id);
      });
    } else {
      setSelectedIds([]);
    }
  }, [cartItems]);

  const handleNavClick = (link) => {
    navigate(getNavPath(link, categories));
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const allSelected = cartItems.length > 0 && selectedIds.length === cartItems.length;

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(cartItems.map((i) => i.id));
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const updateQty = async (id, val) => {
    await updateCartQty(id, val);
  };

  const deleteSelected = async () => {
    await removeSelectedFromCart(selectedIds);
    setSelectedIds([]);
    showToast("Items removed from cart");
  };

  const moveToWishlist = async () => {
    const moved = cartItems.filter((i) => selectedIds.includes(i.id));
    for (const item of moved) {
      const isWishlisted = wishlistItems.some((w) => w.id === item.productId);
      if (!isWishlisted) {
        await toggleWishlist({
          productId: item.productId,
          name: item.name,
          price: item.price,
          originalPrice: item.originalPrice,
          category: item.category,
          img: item.image
        });
      }
    }
    await removeSelectedFromCart(selectedIds);
    setSelectedIds([]);
    showToast("Items moved to wishlist");
    setTimeout(() => setShowWishlist(true), 800);
  };

  // Only calculate totals for currently SELECTED items
  const subtotal = selectedItems.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);
  // GST is already included in product price — extract for display only, not added to total
  const gstIncluded = subtotal > 0 ? Math.round(subtotal - (subtotal / 1.03)) : 0;
  const platformFee = 0;
  const grandTotal = subtotal + platformFee;



  if (showWishlist) {
    return (
      <WishlistPage
        onBack={() => setShowWishlist(false)}
      />
    );
  }

  return (
    <>
      <Navbar activeLink="" onLinkClick={handleNavClick} />
      <div className="cart-page-wrapper">

        {/* TOAST */}
        {toast && (
          <div className="cart-toast">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {toast}
          </div>
        )}

        <main className="cart-main">

          {/* LEFT */}
          <div className="cart-left">
            <h1 className="cart-title">My Cart</h1>

            {cartItems.length === 0 ? (
              <div className="cart-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
                <p>Your cart is empty</p>
                <button className="cart-empty-shop-btn" onClick={() => navigate('/')}>
                  Start Shopping
                </button>
              </div>
            ) : (
              <>
                {/* SELECT ALL BAR */}
                <div className="cart-select-bar">
                  <label className="select-all-label">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="cart-checkbox"
                    />
                    <span>{selectedIds.length}/{cartItems.length} Items Selected</span>
                  </label>
                  <div className="cart-bar-actions">
                    <button
                      className="cart-delete-btn"
                      onClick={deleteSelected}
                      disabled={selectedIds.length === 0}
                      aria-label="Delete selected"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                    <button
                      className="cart-wishlist-btn"
                      onClick={moveToWishlist}
                      disabled={selectedIds.length === 0}
                    >
                      Move To Wishlist
                    </button>
                  </div>
                </div>

                {/* CART ITEMS LIST */}
                <div className="cart-items-list">
                  {cartItems.map((item) => (
                    <div key={item.id} className="cart-item">
                      <input
                        type="checkbox"
                        className="cart-checkbox item-checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelect(item.id)}
                      />
                      <img src={getOriginalImageUrl(item.image)} alt={item.name} className="cart-item-img" />
                      <div className="cart-item-info">
                        <p className="cart-item-name">{item.name}</p>
                        <div className="cart-item-pricing">
                          <span className="cart-item-price">₹{Number(item.price || 0).toLocaleString("en-IN")}</span>
                          {item.originalPrice && Number(item.originalPrice) > Number(item.price) && (
                            <span className="cart-item-original">₹{Number(item.originalPrice).toLocaleString("en-IN")}</span>
                          )}
                        </div>
                        <div className="cart-item-qty">
                          <select
                            value={item.qty}
                            onChange={(e) => updateQty(item.id, parseInt(e.target.value))}
                            className="qty-select"
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                              <option key={n} value={n}>Qty: {n}</option>
                            ))}
                          </select>
                        </div>
                        {(item.size || item.color) && (
                          <div className="cart-item-variant-meta" style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.85rem", color: "#666", marginTop: "4px" }}>
                            {item.size && <span>Size: <strong>{item.size}</strong></span>}
                            {item.color && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                                Color: <span style={{ display: "inline-block", width: "12px", height: "12px", borderRadius: "50%", backgroundColor: item.color, border: "1px solid #ccc" }} />
                              </span>
                            )}
                          </div>
                        )}
                        <p className="cart-item-category">{item.category}</p>
                        <div className="cart-item-delivery">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="1" y="3" width="15" height="13" rx="1" />
                            <path d="M16 8h4l3 5v3h-7V8z" />
                            <circle cx="5.5" cy="18.5" r="2.5" />
                            <circle cx="18.5" cy="18.5" r="2.5" />
                          </svg>
                          <span>Delivered by {item.deliveryDate}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* RIGHT — ORDER SUMMARY */}
          {cartItems.length > 0 && (
            <div className="cart-right">
              <div className="order-summary">
                <div className="summary-row summary-subtotal">
                  <span>Subtotal ({selectedItems.length} {selectedItems.length === 1 ? 'item' : 'items'})</span>
                  <span>₹{subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="summary-divider"></div>
                <div className="summary-row gst-faded-row">
                  <span>GST (3% Incl.)</span>
                  <span>₹{gstIncluded.toLocaleString("en-IN")}</span>
                </div>
                <div className="cart-delivery-note">
                  * Delivery Charge will be added in the payment page
                </div>
                <div className="summary-divider"></div>
                <div className="summary-row summary-grand">
                  <span>Grand Total</span>
                  <span>₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <button
                  className="checkout-btn"
                  onClick={() => navigate("/shipping", { state: { selectedItems } })}
                  disabled={selectedItems.length === 0}
                >
                  Checkout {selectedItems.length > 0 ? `(${selectedItems.length})` : ''}
                </button>
              </div>
            </div>
          )}

        </main>

        {/* FOOTER */}
        <Footer />

      </div>
    </>
  );
}