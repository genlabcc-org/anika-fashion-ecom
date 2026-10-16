import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { getUserInitials } from "../utils/avatarUtils";
import "./AnikaWishlist.css";
import Navbar from "../components/SiteHeader";
import Footer from "../components/SiteFooter";
import { getOriginalImageUrl } from '../utils/imageUtils';

const TABS = ["Profile", "Orders", "Addresses", "Wishlists", "Account"];

export default function AnikaWishlist() {
  const [activeTab] = useState("Wishlists");
  const navigate = useNavigate();

  const user = useStore((s) => s.user);
  const sessionLoading = useStore((s) => s.sessionLoading);
  const wishlistItems = useStore((state) => state.wishlistItems);

  const removeFromWishlist = useStore((state) => state.removeFromWishlist);
  const addToCart = useStore((state) => state.addToCart);
  const setSelectedProduct = useStore((state) => state.setSelectedProduct);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user){
      navigate("/account/login");
      return;
    }
  }, [user, sessionLoading]);

  const handleTabClick = (tab) => {
    if (tab === "Profile") navigate("/profile");
    else if (tab === "Orders") navigate("/profile/orders");
    else if (tab === "Addresses") navigate("/profile/addresses");
    else if (tab === "Wishlists") return;
    else if (tab === "Account") navigate("/profile/account");
  };

  const handleNavClick = (link) => {
    if (link === "Home") navigate("/");
    else navigate(`/${link.toLowerCase()}`);
  };

  const handleViewProduct = (item) => {
    const targetId = item.id || item.productId;
    setSelectedProduct({
      id: targetId,
      productId: targetId,
      name: item.name,
      price: item.price,
      originalPrice: item.originalPrice,
      img: item.image,
      images: item.images || (item.image ? [item.image] : []),
      desc: item.desc || "",
      category: item.category || "",
      sizes: item.sizes || [],
      stock: "in-stock",
    });
    navigate(`/product/${targetId}`);
  };

  const handleAddToCart = async (item) => {
    const hasSizes = (item.sizes && item.sizes.length > 0) || (item.category && item.category.toLowerCase() === 'bangles');
    if (hasSizes) {
      handleViewProduct(item);
      return;
    }
    await addToCart({
      productId: item.id || item.productId,
      id: item.id || item.productId,
      name: item.name,
      price: item.price,
      originalPrice: item.originalPrice,
      img: item.image || item.img,
      image: item.image || item.img,
      category: item.category,
    });
  };

  const handleRemove = async (productId) => {
    await removeFromWishlist(productId);
  };

  return (
    <>
      <Navbar onLinkClick={handleNavClick} />
      <div className="aw-root">
        <h1 className="aw-profile-title">Profile</h1>

        {/* User info */}
        <div className="aw-user-section">
          <div className="aw-avatar">
            {getUserInitials(user?.user_metadata?.name || user?.email)}
          </div>
          <div className="aw-user-text">
            <span className="aw-user-name">{user?.user_metadata?.name || "User"}</span>
            <span className="aw-user-meta">
              {user?.email}&nbsp;·&nbsp;Member since{" "}
              {user
                ? new Date(user.created_at).toLocaleDateString("en-IN", {
                    month: "short",
                    year: "numeric",
                  })
                : ""}
            </span>
            <span className="aw-vip-badge">{wishlistItems.length} wishlisted</span>
          </div>
        </div>

        <hr className="aw-divider" />

        {/* Tabs */}
        <div className="aw-tabs">
          {TABS.map((tab) => (
            <button
              key={tab}
              className={`aw-tab${activeTab === tab ? " aw-tab--active" : ""}`}
              onClick={() => handleTabClick(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Wishlist content */}
        <div className="aw-card">
          <div className="aw-card-header">
            <span className="aw-card-title">My Wishlist</span>
            <span className="aw-item-count">{wishlistItems.length} items</span>
          </div>

          {wishlistItems.length === 0 ? (
            <div className="aw-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              <p>Your wishlist is empty</p>
              <span>Save items you love and come back to them anytime.</span>
              <button className="aw-shop-btn" onClick={() => navigate("/")}>
                Shop Now
              </button>
            </div>
          ) : (
            <div className="aw-grid">
              {wishlistItems.map((item) => (
                <div key={item.id} className="aw-item-card">
                  {/* Remove button */}
                  <button
                    className="aw-remove-btn"
                    onClick={() => handleRemove(item.id)}
                    title="Remove from wishlist"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>

                  {/* Product image */}
                  <div
                    className="aw-img-wrap"
                    onClick={() => handleViewProduct(item)}
                  >
                    {item.image ? (
                      <img src={getOriginalImageUrl(item.image)} alt={item.name} className="aw-img" />
                    ) : (
                      <div className="aw-img-placeholder">✨</div>
                    )}
                  </div>

                  {/* Product info */}
                  <div className="aw-item-info">
                    <span className="aw-item-name" onClick={() => handleViewProduct(item)}>
                      {item.name}
                    </span>
                    <div className="aw-pricing">
                      <span className="aw-price">
                        ₹{Number(item.price).toLocaleString("en-IN")}
                      </span>
                      {item.originalPrice && Number(item.originalPrice) > Number(item.price) && (
                        <span className="aw-original-price">
                          ₹{Number(item.originalPrice).toLocaleString("en-IN")}
                        </span>
                      )}
                    </div>
                    <div className="aw-item-actions">
                      <button
                        className="aw-cart-btn"
                        onClick={() => handleAddToCart(item)}
                      >
                        {(item.sizes && item.sizes.length > 0) || (item.category && item.category.toLowerCase() === 'bangles')
                          ? "Select Size"
                          : "Add to Cart"}
                      </button>
                      <button
                        className="aw-view-btn"
                        onClick={() => handleViewProduct(item)}
                      >
                        View
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}
