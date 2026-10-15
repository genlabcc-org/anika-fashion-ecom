import { useState, useRef, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authService } from "../services/authService";
import { useAdmin } from "../hooks/useAdmin";
import { useStore } from "../hooks/useStore";
import { getNavPath } from "../services/categoryRoute";
import { getUserInitials } from "../utils/avatarUtils";
import "./SiteHeader.css";
import LogoImg from "../assets/offers/logo.svg";
import UserIcon from "../assets/header/User.png";
import CartIcon from "../assets/header/cards.png";

const DEFAULT_LINKS = ["Earrings", "Bracelets", "Bangles", "Necklaces"];

// Max items per row in the lower nav bar before wrapping to a new row
const ITEMS_PER_ROW = 9;

// Splits an array into chunks of `size`
const chunkArray = (arr, size) => {
  const rows = [];
  for (let i = 0; i < arr.length; i += size) {
    rows.push(arr.slice(i, i + size));
  }
  return rows;
};



// Retrieves real subcategories for a category from the store categories array,
// and prepends "All [Category]" so users can view all main category products.
const getSubcategories = (link, categories = []) => {
  if (link === "Home") return [];

  const matched = categories.find(
    (c) => c.name?.toLowerCase() === link.toLowerCase()
  );

  const realSubs = (matched?.subcategories || [])
    .map((s) => (typeof s === "string" ? s : s.name))
    .filter(Boolean);

  if (realSubs.length > 0) {
    const allLabel = `All ${link}`;
    return [allLabel, ...realSubs];
  }

  return [];
};

const LoginDropdown = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const user = useStore((s) => s.user);
  const isAdmin = useStore((s) => s.isAdmin);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = async () => {
    await authService.signOut();
    setOpen(false);
    navigate("/");
  };

  const initials = getUserInitials(user?.user_metadata?.name || user?.email, "U");

  return (
    <div className="login-wrapper" ref={ref}>
      <button className="icon-btn header-user-btn" aria-label="Account" onClick={() => setOpen(!open)}>
        {user ? (
          <div className="header-avatar-circle" title={user.user_metadata?.name || user.email}>
            {initials}
          </div>
        ) : (
          <img src={UserIcon} alt="Account" className="header-icon" />
        )}
      </button>

      {open && (
        <div className="login-dropdown">
          {user ? (
            <>
              <div className="dropdown-user-header">
                <div className="dropdown-avatar-circle">
                  {initials}
                </div>
                <div className="dropdown-user-info">
                  <p className="dropdown-name">{user.user_metadata?.name || "User"}</p>
                  <p className="dropdown-email">{user.email}</p>
                </div>
              </div>
              <hr />
              <Link to="/profile" onClick={() => setOpen(false)}>My Profile</Link>
              {isAdmin && (
                <>
                  <hr />
                  <Link to="/admin" onClick={() => setOpen(false)} className="admin_link">
                    Admin Panel
                  </Link>
                </>
              )}
              <hr />
              <button className="dropdown-logout" onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <>
              <Link to="/account/login">Login</Link>
              <hr />
              <Link to="/account/signup">New Customer? <span>Sign Up</span></Link>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// Desktop nav item: click toggles a popup of subcategories below it.
// Shows a divider + chevron icon when the item has subcategories.
const NavItem = ({ link, isActive, categories, onLinkClick, onSubClick, isLower = false }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const subcategories = useMemo(
    () => getSubcategories(link, categories),
    [link, categories]
  );
  const hasPopup = subcategories.length > 0;

  useEffect(() => {
    if (!hasPopup) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [hasPopup]);

  const handleMainClick = () => {
    if (!hasPopup) {
      onLinkClick(link);
      return;
    }
    setOpen((o) => !o);
  };

  const handleSubClick = (sub) => {
    setOpen(false);
    onSubClick(link, sub);
  };

  const linkClass = isLower ? "lower-nav-link" : "nav-link";
  const caretClass = isLower ? "lower-nav-caret-icon" : "nav-caret-icon";
  const popupClass = isLower ? "nav-popup lower-nav-popup" : "nav-popup";
  const wrapperClass = isLower ? "lower-nav-item-wrapper" : "nav-item-wrapper";

  return (
    <div className={wrapperClass} ref={ref}>
      <button
        className={`${linkClass} ${isActive ? "active" : ""} ${hasPopup ? "has-caret" : ""}`}
        onClick={handleMainClick}
      >
        <span>{link}</span>
        {hasPopup && (
          <svg
            className={`${caretClass} ${open ? "open" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            width="14"
            height="14"
          >
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {hasPopup && open && (
        <div className={popupClass}>
          {subcategories.map((sub) => (
            <button
              key={sub}
              className="nav-popup-item"
              onClick={() => handleSubClick(sub)}
            >
              {sub}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Mobile nav item: click expands an accordion of subcategories inline
const MobileNavItem = ({ link, categories, onLinkClick, onSubClick }) => {
  const [expanded, setExpanded] = useState(false);

  const subcategories = useMemo(
    () => getSubcategories(link, categories),
    [link, categories]
  );
  const hasPopup = subcategories.length > 0;

  const handleMainClick = () => {
    if (!hasPopup) {
      onLinkClick(link);
      return;
    }
    setExpanded((e) => !e);
  };

  const handleSubClick = (sub) => {
    setExpanded(false);
    onSubClick(link, sub);
  };

  return (
    <div className="mobile-nav-item">
      <button
        className={`mobile-nav-link ${expanded ? "expanded" : ""}`}
        onClick={handleMainClick}
      >
        <span>{link}</span>
        {hasPopup && (
          <svg
            className={`mobile-nav-caret-icon ${expanded ? "open" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            width="16"
            height="16"
          >
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {hasPopup && expanded && (
        <div className="mobile-nav-submenu">
          {subcategories.map((sub) => (
            <button
              key={sub}
              className="mobile-nav-subitem"
              onClick={() => handleSubClick(sub)}
            >
              {sub}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const InstagramIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const WhatsappIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984 0 1.764.459 3.487 1.334 5.005l-1.416 5.174 5.297-1.389c1.464.798 3.118 1.218 4.772 1.219h.004c5.505 0 9.988-4.478 9.989-9.985 0-2.668-1.038-5.176-2.925-7.062a9.927 9.927 0 0 0-7.065-2.946zm5.642 14.341c-.244.688-1.417 1.315-1.96 1.369-.51.051-1.157.078-3.418-.853-2.888-1.19-4.747-4.135-4.891-4.327-.143-.191-1.171-1.558-1.171-2.97 0-1.412.738-2.106 1.002-2.394.263-.287.574-.359.765-.359.191 0 .383.002.55.011.177.009.414-.067.647.493.243.585.829 2.022.901 2.169.072.146.12.316.024.507-.096.191-.144.311-.287.478-.144.168-.302.375-.431.504-.144.143-.294.301-.126.589.168.287.747 1.233 1.603 1.996 1.101.98 2.031 1.285 2.318 1.428.287.143.454.12.622-.072.168-.191.718-.838.909-1.125.191-.287.383-.239.646-.144.263.096 1.674.79 1.961.933.287.143.479.215.55.335.072.12.072.694-.172 1.382z" />
  </svg>
);

const FacebookIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.891h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
  </svg>
);

export default function SiteHeader({ activeLink = "Home", onLinkClick }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const cartItems = useStore(state => state.cartItems);
  const wishlistItems = useStore(state => state.wishlistItems);
  const categories = useStore(state => state.categories);
  const fetchCategories = useStore(state => state.fetchCategories);

  const cartCount = cartItems.reduce((acc, item) => acc + item.qty, 0);
  const wishlistCount = wishlistItems.length;

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // All available navigation category links
  const allNavLinks = useMemo(() => {
    const customNames = (categories || [])
      .map(c => c.name)
      .filter(Boolean)
      .filter(name => !DEFAULT_LINKS.some(d => d.toLowerCase() === name.toLowerCase()));

    return ["Home", ...DEFAULT_LINKS, ...customNames];
  }, [categories]);

  // Top navbar shows fixed maximum of 8 categories
  const topNavLinks = useMemo(() => allNavLinks.slice(0, 8), [allNavLinks]);

  // Lower navbar shows remaining categories, chunked into rows of 8 items
  const lowerNavNames = useMemo(() => allNavLinks.slice(8), [allNavLinks]);

  const lowerNavRows = useMemo(
    () => chunkArray(lowerNavNames, 8),
    [lowerNavNames]
  );

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const handleLinkClick = (link) => {
    setMenuOpen(false);
    if (onLinkClick) {
      onLinkClick(link);
    } else {
      // Fallback: if a parent page doesn't pass its own onLinkClick,
      // navigate directly using the shared category-aware router
      navigate(getNavPath(link, categories));
    }
  };

  // Called when a subcategory item is clicked, desktop or mobile
  const handleSubClick = (parentLink, sub) => {
    setMenuOpen(false);
    const isAllOption =
      sub.toLowerCase() === `all ${parentLink.toLowerCase()}` ||
      sub.toLowerCase() === parentLink.toLowerCase();

    if (isAllOption) {
      navigate(getNavPath(parentLink, categories));
    } else {
      navigate(`${getNavPath(parentLink, categories)}?sub=${encodeURIComponent(sub)}`);
    }
  };

  return (
    <>
      <header className={`header ${menuOpen ? "menu-open" : ""}`}>
        <div className="header-top-row">

          <button className="burger-btn mobile-only" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
            <div className={`burger-icon ${menuOpen ? "open" : ""}`}>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </button>

          <div className="logo" onClick={() => handleLinkClick("Home")} style={{ cursor: "pointer" }}>
            <img src={LogoImg} alt="Anika" className="logo-img" />
          </div>

          <nav className="desktop-nav">
            {topNavLinks.map((link) => (
              <NavItem
                key={link}
                link={link}
                isActive={link === activeLink}
                categories={categories}
                onLinkClick={handleLinkClick}
                onSubClick={handleSubClick}
              />
            ))}
          </nav>

          <div className="header-actions">
            <button className="icon-btn" aria-label="Wishlist" onClick={() => navigate("/wishlist")} style={{ position: "relative" }}>
              <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
                <path
                  d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                />
              </svg>
              {wishlistCount > 0 && (
                <span style={{
                  position: "absolute", top: "2px", right: "2px",
                  background: "#fff", color: "#C42049", borderRadius: "50%",
                  padding: "1px 5px", fontSize: "10px", fontWeight: "bold",
                  minWidth: "16px", textAlign: "center",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.2)"
                }}>{wishlistCount}</span>
              )}
            </button>

            <button className="icon-btn" aria-label="Cart" onClick={() => navigate("/cart")} style={{ position: "relative" }}>
              <img src={CartIcon} alt="Cart" className="header-icon" />
              {cartCount > 0 && (
                <span style={{
                  position: "absolute", top: "2px", right: "2px",
                  background: "#fff", color: "#C42049", borderRadius: "50%",
                  padding: "1px 5px", fontSize: "10px", fontWeight: "bold",
                  minWidth: "16px", textAlign: "center",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.2)"
                }}>{cartCount}</span>
              )}
            </button>

            <LoginDropdown />
          </div>
        </div>

        {lowerNavRows.length > 0 && (
          <div className="header-desktop-lower">
            {lowerNavRows.map((row, i) => (
              <nav className="lower-nav-row" key={i}>
                {row.map((name) => (
                  <NavItem
                    key={name}
                    link={name}
                    isActive={name === activeLink}
                    categories={categories}
                    onLinkClick={handleLinkClick}
                    onSubClick={handleSubClick}
                    isLower={true}
                  />
                ))}
              </nav>
            ))}
          </div>
        )}
      </header>

      <div className={`mobile-menu ${menuOpen ? "open" : ""}`}>
        <nav className="mobile-nav-links">
          {topNavLinks.map((link) => (
            <MobileNavItem
              key={link}
              link={link}
              categories={categories}
              onLinkClick={handleLinkClick}
              onSubClick={handleSubClick}
            />
          ))}
        </nav>

        {lowerNavNames.length > 0 && (
          <div className="mobile-collections">
            <div className="mobile-collections-links">
              {lowerNavNames.map((name) => (
                <MobileNavItem
                  key={name}
                  link={name}
                  categories={categories}
                  onLinkClick={handleLinkClick}
                  onSubClick={handleSubClick}
                />
              ))}
            </div>
          </div>
        )}

        <div className="mobile-menu-socials-wrap">
          <div className="mobile-menu-socials">
            <a href="https://www.instagram.com/anikafashionstore.jewellery/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="mobile-social-btn mobile-social-btn--ig">
              <InstagramIcon />
            </a>
            <a href="https://wa.me/919363631636" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="mobile-social-btn mobile-social-btn--wa">
              <WhatsappIcon />
            </a>
            <a href="https://www.facebook.com/people/anikafashionstore/100090910872220/?ref=1" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="mobile-social-btn mobile-social-btn--fb">
              <FacebookIcon />
            </a>
          </div>
          <p className="mobile-socials-title">Follow us on!</p>
        </div>
      </div>
    </>
  );
}