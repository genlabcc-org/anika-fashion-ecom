import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { productService } from "../services/productService";
import { useStore } from "../hooks/useStore";
import "./SearchBar.css";

// Helper to safely parse images whether array, JSON string, or single string
const parseImages = (imgs) => {
  if (!imgs) return [];
  if (Array.isArray(imgs)) return imgs;
  if (typeof imgs === "string") {
    try {
      const parsed = JSON.parse(imgs);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [imgs];
    }
  }
  return [];
};

/**
 * Maps a raw product row from Supabase search to the storefront product shape.
 * Lowest variant price (>0) is used for variant products.
 * First variant image -> image_url -> images[0] is used for display.
 */
export function mapSearchProduct(p) {
  const variants = p.product_variants || [];
  const hasVariants = !!p.has_variants && variants.length > 0;

  // Variant lowest price (>0) or fallback to base price
  const validVariantPrices = variants
    .map((v) => Number(v.price))
    .filter((pr) => !isNaN(pr) && pr > 0);

  const sellingPrice =
    hasVariants && validVariantPrices.length > 0
      ? Math.min(...validVariantPrices)
      : Number(p.price) || 0;

  const validComparePrices = variants
    .map((v) => Number(v.compare_price))
    .filter((cp) => !isNaN(cp) && cp > 0);

  const comparePrice =
    hasVariants && validComparePrices.length > 0
      ? Math.max(...validComparePrices)
      : Number(p.compare_price) || 0;

  // First variant image -> image_url -> images[0]
  const firstVariantWithImages = hasVariants
    ? variants.find((v) => parseImages(v.images).length > 0)
    : null;

  const firstVariantImage = firstVariantWithImages
    ? parseImages(firstVariantWithImages.images)[0]
    : null;

  const productImgs = parseImages(p.images).length > 0
    ? parseImages(p.images)
    : p.image_url
    ? [p.image_url]
    : [];

  const displayImg =
    firstVariantImage ||
    p.image_url ||
    (productImgs.length > 0 ? productImgs[0] : null) ||
    "/src/assets/cart/bangle1.webp";

  const categoryName = p.categories?.name || p.category || "";

  const totalStock = hasVariants
    ? variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0)
    : Number(p.stock) || 0;

  return {
    id: p.product_id || p.id,
    productId: p.product_id || p.id,
    name: p.name,
    desc: p.description || "",
    price: sellingPrice,
    compare_price: comparePrice,
    img: displayImg,
    images: productImgs,
    category: categoryName,
    has_variants: hasVariants,
    sizes: p.sizes || variants.map((v) => v.size).filter(Boolean),
    stock: totalStock > 0 ? "in-stock" : "out-of-stock",
  };
}

export default function SearchBar({
  className = "",
  onProductSelected,
  autoFocus = false,
  onClose,
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const requestIdRef = useRef(0);

  const navigate = useNavigate();
  const setSelectedProduct = useStore((s) => s.setSelectedProduct);

  // Auto-focus when requested
  useEffect(() => {
    if (autoFocus) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  // Close dropdown on outside click or touch
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  // Debounced search with race-condition guard
  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    setIsOpen(true);

    const currentReqId = ++requestIdRef.current;

    const timer = setTimeout(async () => {
      try {
        const rawResults = await productService.searchProductsByName(trimmed, 6);
        if (currentReqId !== requestIdRef.current) return;
        const mapped = (rawResults || []).map(mapSearchProduct);
        setResults(mapped);
      } catch (err) {
        if (currentReqId !== requestIdRef.current) return;
        console.error("Product search error:", err);
        setResults([]);
      } finally {
        if (currentReqId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  const handleSelectProduct = (product) => {
    setSelectedProduct(product);
    setIsOpen(false);
    setQuery("");
    setResults([]);
    if (onProductSelected) {
      onProductSelected(product);
    }
    if (onClose) {
      onClose();
    }
    navigate("/product");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
      if (onClose) {
        onClose();
      }
    } else if (e.key === "Enter") {
      if (results.length > 0 && isOpen) {
        e.preventDefault();
        handleSelectProduct(results[0]);
      }
    }
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const showDropdown = isOpen && query.trim().length >= 2;

  return (
    <div className={`sb-container ${className}`} ref={containerRef}>
      <div className="sb-input-wrapper">
        <span className="sb-icon" aria-hidden="true">
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>

        <input
          ref={inputRef}
          type="text"
          className="sb-input"
          placeholder="Search bangles, anklets, necklaces..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (query.trim().length >= 2) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          aria-label="Search products"
        />

        {query.length > 0 && (
          <button
            type="button"
            className="sb-clear-btn"
            onClick={handleClear}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="sb-dropdown" role="listbox">
          {loading ? (
            <div className="sb-status sb-status--loading">
              <span className="sb-spinner" aria-hidden="true" />
              <span>Searching...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="sb-status sb-status--empty">
              No products found
            </div>
          ) : (
            <div className="sb-results-list">
              {results.map((product) => {
                const formattedPrice =
                  "₹" + Number(product.price || 0).toLocaleString("en-IN");

                return (
                  <div
                    key={product.id}
                    className="sb-item"
                    onClick={() => handleSelectProduct(product)}
                    role="option"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSelectProduct(product);
                    }}
                  >
                    <img
                      src={product.img}
                      alt={product.name}
                      className="sb-item-img"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.src = "/src/assets/cart/bangle1.webp";
                      }}
                    />
                    <div className="sb-item-info">
                      <span className="sb-item-name">{product.name}</span>
                      <div className="sb-item-meta">
                        {product.category && (
                          <span className="sb-item-category">
                            {product.category}
                          </span>
                        )}
                        <span className="sb-item-price">{formattedPrice}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
