import React, { useState, useCallback, useMemo, useEffect, memo, lazy, Suspense } from 'react';
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation } from "swiper/modules";
import { useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from '../lib/supabase';
import { variantService } from '../services/variantService';
import { productService } from "../services/productService";
import { getOriginalImageUrl } from '../utils/imageUtils';
import { getNavPath } from "../services/categoryRoute";

import './ProductDetails.css';
import SiteHeader from './SiteHeader';
import Toast from './Toast';
import { useStore } from '../hooks/useStore';
import SizeChart from '../assets/Size_bangle.png';
import LengthChart from '../assets/Anklet_length.jpeg'

import "swiper/css";
import "swiper/css/navigation";
// import "swiper/css/pagination";
import "swiper/css/zoom";

import DescIcon from '../assets/details/ad_pro.svg';
import SpecIcon from '../assets/details/mat.svg';
import DeliveryIcon from '../assets/details/del.svg';
import ReturnIcon from '../assets/details/re.svg';
import AuthenticityIcon from '../assets/details/hand.svg';
import HelpIcon from '../assets/details/help.svg';

// ── Optimized Lazy Loading for heavy components ──────────────────────────────
const SiteFooter = lazy(() => import('./SiteFooter'));
const CategorySection = lazy(() => import('./CategorySection'));

// Main gallery images
import MainBangle from '../assets/Product1.webp';

import PayPalIcon from '../assets/PaymentPal.webp';
import GPayIcon from '../assets/PaymentGPay.webp';
import RazorIcon from '../assets/PaymentRazor.webp';
import UpiIcon from '../assets/upi.svg';
import VisaIcon from '../assets/visa.svg';
import MastercardIcon from '../assets/mastercard.svg';
import PaymentMorePopup from './PaymentMorePopup';


// ── Loading Skeleton (Placeholder for better perceived speed) ─────────────────
const LoadingSkeleton = ({ height = '200px' }) => (
  <div className="pp-skeleton" style={{ height, background: '#f5f5f5', borderRadius: '8px', margin: '16px 0' }}>
    <div className="pp-skeleton-shimmer" />
  </div>
);


// ── Memoized sub-components ──────────────────────────────────────────────────
const ProductGallery = memo(({ activeThumb, setActiveThumb, displayImage, displayName, thumbs, discountPct }) => {
  const currentIndex = activeThumb === -1 ? 0 : activeThumb;
  const safeIndex = Math.min(currentIndex, thumbs.length - 1);
  const currentImg = getOriginalImageUrl(activeThumb === -1 ? displayImage : thumbs[safeIndex]?.rawImg || displayImage);
  const swiperRef = useRef(null);

  const [zoomOpen, setZoomOpen] = useState(false);
  const [isZoomedIn, setIsZoomedIn] = useState(false);
  const [touchStartX, setTouchStartX] = useState(null);

  useEffect(() => {
    if (swiperRef.current) {
      swiperRef.current.update();
      if (activeThumb >= thumbs.length) {
        swiperRef.current.slideTo(0, 0);
        setActiveThumb(0);
      }
    }
  }, [thumbs, activeThumb, setActiveThumb]);

  const goToIndex = (i) => {
    const clamped = Math.max(0, Math.min(thumbs.length - 1, i));
    setActiveThumb(clamped)
  };

  const handleTouchStart = (e) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    const SWIPE_THRESHOLD = 50;
    if (Math.abs(diff) > SWIPE_THRESHOLD) {
      if (diff > 0) {
        goToIndex(currentIndex + 1);
      } else {
        goToIndex(currentIndex - 1);
      }
    }
    setTouchStartX(null);
  };

  const handleZoomImageClick = (e) => {
    if (!isZoomedIn) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      e.currentTarget.style.transformOrigin = `${x}% ${y}%`;
    }
    setIsZoomedIn(z => !z);
  };

  const closeZoom = () => {
    setZoomOpen(false);
    setIsZoomedIn(false);
  };

  return (
    <div className="pp-gallery">
      <div className="pp-main-wrap">
        <div className="pp-image-container-inner"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {discountPct > 0 && (
            <div className="pp-main-badge">{discountPct}% Off</div>
          )}


          <button
            className="pp-zoom-btn"
            aria-label="Zoom image"
            onClick={() => setZoomOpen(true)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>

          <Swiper
            key={thumbs.map((item) => item.rawImg || item.img).join('|')}
            modules={[Navigation]}
            navigation={false}
            observer={true}
            observeParents={true}
            // pagination = {{ clickable: true }}
            // zoom= {true}
            onSwiper={(swiper) => (swiperRef.current = swiper)}
            onSlideChange={(swiper) => setActiveThumb(swiper.activeIndex)}
            speed={500}
            spaceBetween={0}
          >
            {thumbs.map((item) => (
              <SwiperSlide key={item.id}>
                <img
                  src={item.img}
                  alt={item.alt}
                  className='pp-main-img'
                />
              </SwiperSlide>
            ))}
          </Swiper>

          {/* <img
            src={currentImg}
            alt={displayName}
            className="pp-main-img"
            loading="lazy"
            decoding="async"
          />  */}
        </div>
      </div>

      {thumbs.length > 1 && (
        <div className="pp-dots" role="tablist" aria-label="Product images">
          {thumbs.map((item, i) => (
            <button
              key={item.id}
              className={`pp-dot ${currentIndex === i ? 'active' : ''}`}
              onClick={() => swiperRef.current?.slideTo(i)}
              aria-label={`View image ${i + 1}`}
              aria-selected={currentIndex === i}
              role="tab"
            />
          ))}
        </div>
      )}

      {zoomOpen && (
        <div className="pp-zoom-overlay" onClick={closeZoom}>
          <button className="pp-zoom-close" onClick={closeZoom} aria-label="Close zoom">✕</button>
          <img
            src={currentImg}
            alt={displayName}
            className={`pp-zoom-img ${isZoomedIn ? 'zoomed' : ''}`}
            onClick={(e) => { e.stopPropagation(); handleZoomImageClick(e); }}
          />
          <p className="pp-zoom-hint">{isZoomedIn ? 'Click to zoom out' : 'Click image to zoom in'}</p>
        </div>
      )}
    </div>
  );
});

const RelatedProducts = memo(({ showAll, setShowAll, relatedItems, onProductClick }) => {
  const visibleRelated = showAll ? relatedItems.slice(0, 8) : relatedItems.slice(0, 4);
  return (
    <section className="pp-related">
      <h2 className="pp-related-h2">You May Also Like</h2>
      <div className="pp-related-grid">
        {visibleRelated.map(p => (
          <div
            key={p.id}
            className="pp-rel-card"
            onClick={() => onProductClick && onProductClick(p)}
            style={{ cursor: 'pointer' }}
          >
            <div className="pp-rel-img-wrap">
              {p.badge && (
                <span className='pp-rel-badge'>
                  {p.badge}
                </span>
              )}
              <img src={productService.getResizedImageUrl(p.img, 'card')} alt={p.name} className="pp-rel-img" loading="lazy" decoding="async" />
            </div>
            <div className="pp-rel-info">
              <p className="pp-rel-name">{p.name}</p>
              {/* <p className="pp-rel-sub">{p.sub}</p> */}
              <div className="pp-rel-prices">
                <span className="pp-rel-price">{p.price}</span>
                {p.original && <span className="pp-rel-orig"> {p.original}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
      {relatedItems.length > 4 && (
        <div className="pp-show-wrap">
          <button className="pp-show-btn" onClick={() => setShowAll(s => !s)}>
            {showAll ? 'Show Less' : 'Show More'}
          </button>
        </div>
      )}
    </section>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
export default function ProductPage({ onBack }) {
  const navigate = useNavigate();
  const { productId: urlProductId } = useParams();

  // Zustand Store
  const selectedProduct = useStore(state => state.selectedProduct);
  const setSelectedProduct = useStore(state => state.setSelectedProduct);
  const loadProductById = useStore(state => state.loadProductById);
  const categories = useStore(state => state.categories);
  const addToCart = useStore(state => state.addToCart);
  const toggleWishlist = useStore(state => state.toggleWishlist);
  const wishlistItems = useStore(state => state.wishlistItems);
  const fetchProductsByCategory = useStore(state => state.fetchProductsByCategory);
  const productsCache = useStore(state => state.products);
  const fetchProductDetails = useStore(state => state.fetchProductDetails);
  const productDetailsCache = useStore(state => state.productDetails);

  const cat = selectedProduct?.category || 'Bangles';

  // React State Hooks
  const [pageLoading, setPageLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [activeThumb, setActiveThumb] = useState(0);
  const [qty, setQty] = useState(1);

  const [descOpen, setDescOpen] = useState(false);
  const [addlOpen, setAddlOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [warrantyOpen, setWarrantyOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const [productImages, setProductImages] = useState(
    Array.isArray(selectedProduct?.images) && selectedProduct.images.length > 0
      ? selectedProduct.images
      : []
  );
  const [showAll, setShowAll] = useState(false);
  const [productPrices, setProductPrice] = useState(null);
  const [relatedPrices, setRelatedPrices] = useState({});

  const [toastMsg, setToastMsg] = useState("");
  const [toastType, setToastType] = useState("success");
  const [selectedSize, setSelectedSize] = useState("");
  const [sizeError, setSizeError] = useState(false);
  const [showSizeChart, setShowSizeChart] = useState(false);

  // Dynamic sizes/lengths fetched from database
  const [size, setSize] = useState([]);

  const [hasVariants, setHasVariants] = useState(false);
  const [variants, setVariants] = useState([]);
  const [selectedColor, setSelectedColor] = useState("");

  const SIZE_CHART_BY_CATEGORY = {
    Bangles: SizeChart,
    Anklets: LengthChart,
  }

  const SIZE_LABEL_BY_CATEGORY = {
    Bangles: "Size",
    Anklets: "Length",
  }

  useEffect(() => {
    if (!urlProductId) return;

    const currentId = String(selectedProduct?.productId || selectedProduct?.id || '');
    if (currentId !== String(urlProductId)) {
      setPageLoading(true);
      setNotFound(false);
      loadProductById(urlProductId)
        .then((product) => {
          if (!product) {
            setNotFound(true);
          }
        })
        .catch((err) => {
          console.error("Failed to load product by ID:", err);
          setNotFound(true);
        })
        .finally(() => {
          setPageLoading(false);
        });
    }
  }, [urlProductId, selectedProduct, loadProductById]);

  // Compute outside effect so cachedEntry can be a dependency.
  // When validateProductCache evicts a stale entry, cachedEntry becomes
  // undefined and the effect re-runs to fetch fresh data from DB.
  const productId = selectedProduct?.productId || selectedProduct?.id;
  const cachedEntry = productId ? productDetailsCache[productId] : undefined;

  // Track the last loaded product ID so we only reset UI state when the product actually changes
  const lastLoadedIdRef = useRef(null);

  useEffect(() => {
    if (!productId) return;
    if (urlProductId && String(productId) !== String(urlProductId)) return;

    const isNewProduct = String(productId) !== String(lastLoadedIdRef.current);

    // Only reset UI state when switching to a genuinely different product
    if (isNewProduct) {
      lastLoadedIdRef.current = String(productId);
      setSize([]);
      setProductImages(
        Array.isArray(selectedProduct?.images) && selectedProduct.images.length > 0
          ? selectedProduct.images
          : []
      );
      setProductPrice(null);
      setVariants([]);
      setSelectedColor('');
      setSelectedSize('');
      setSizeError(false);
      setQty(1);
    }

    const extractSizes = (variantList, baseObj) => {
      let sList = [];
      if (variantList && variantList.length > 0) {
        sList = [...new Set(variantList.map(v => v.size).filter(Boolean))];
      }
      const rawBaseSizes = baseObj?.sizes || selectedProduct?.sizes;
      if (sList.length === 0 && rawBaseSizes) {
        if (Array.isArray(rawBaseSizes)) {
          sList = rawBaseSizes.filter(Boolean);
        } else if (typeof rawBaseSizes === 'string') {
          sList = rawBaseSizes.split(',').map(s => s.trim()).filter(Boolean);
        }
      }
      if (sList.length === 0 && cat?.toLowerCase() === 'bangles') {
        sList = ['2.4', '2.6', '2.8'];
      }
      return sList;
    };

    const applyDetails = (details, isFreshFetch = false) => {
      if (!details) return;
      const rawImgs = Array.isArray(details.images) ? details.images : [];
      const validImgs = [...new Set(rawImgs.map(u => typeof u === 'string' ? u.trim() : u).filter(Boolean))];

      if (validImgs.length > 0) {
        setProductImages(prev => {
          // Fresh DB fetch for this product is authoritative
          if (isFreshFetch) {
            return validImgs;
          }
          // Never replace a longer list with a shorter stale one
          if (prev.length > validImgs.length) {
            return prev;
          }
          return validImgs;
        });
      }
      const baseData = details.base;
      setHasVariants(!!baseData?.has_variants);
      if (baseData?.has_variants) {
        const variantRows = details.variants || [];
        setVariants(variantRows);
        const sizes = extractSizes(variantRows, baseData);
        setSize(sizes);
        if (isNewProduct) setSelectedSize('');
        const firstVariant = variantRows[0];
        if (isNewProduct) setSelectedColor(firstVariant?.color || '');
      } else {
        setProductPrice(baseData);
        const sizes = extractSizes([], baseData);
        if (sizes.length > 0) {
          setSize(sizes);
          if (isNewProduct) setSelectedSize('');
        }
        const parsedColors = Array.isArray(baseData?.colors)
          ? baseData.colors
          : (typeof baseData?.colors === 'string' ? baseData.colors.split(',').map(s => s.trim()).filter(Boolean) : []);
        if (parsedColors.length > 0 && isNewProduct) setSelectedColor(parsedColors[0]);
      }
    };

    // Stale-While-Revalidate:
    // 1. Show cached details immediately as placeholder if present
    if (cachedEntry) {
      applyDetails(cachedEntry, false);
    }

    // 2. Fetch fresh details & images (uses 5-min TTL in store, in-flight deduplicated)
    let ignore = false;
    fetchProductDetails(productId).then(freshDetails => {
      if (ignore) return;
      if (String(productId) !== String(lastLoadedIdRef.current)) return;
      if (freshDetails) {
        applyDetails(freshDetails, true);
      }
    });

    return () => {
      ignore = true;
    };
  }, [productId, cat, urlProductId, selectedProduct]);

  const showToast = (message, type = "success") => {
    setToastMsg("");
    setToastType(type);
    setTimeout(() => setToastMsg(message), 10);
  };

  const isWishlisted = useMemo(() => {
    const currentId = selectedProduct?.productId || selectedProduct?.id;
    return wishlistItems.some(w => w.id === currentId);
  }, [wishlistItems, selectedProduct]);

  // const rawDiscount = productPrices?.discount_price ?? 0;
  const activeSizeValue = selectedSize;

  const selectedVariant = useMemo(() => {
    if (!hasVariants || variants.length === 0) return null;
    return variants.find(
      v => (v.size || "") === (activeSizeValue || "") && (v.color || "") === (selectedColor || "")
    ) || null;
  }, [hasVariants, variants, activeSizeValue, selectedColor]);

  useEffect(() => {
    if (!hasVariants || variants.length === 0) return;

    const colorsForCurrentSize = [...new Set(
      variants.filter(v => !activeSizeValue || v.size === activeSizeValue).map(v => v.color).filter(Boolean)
    )];
    if (colorsForCurrentSize.length > 0 && !colorsForCurrentSize.includes(selectedColor)) {
      setSelectedColor(colorsForCurrentSize[0]);
    }
  }, [activeSizeValue, hasVariants, variants]);

  const totalVariantStock = useMemo(() => {
    if (!hasVariants || !variants.length) return null;
    return variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
  }, [hasVariants, variants]);

  // Determine which image to show in gallery
  const rawPrice = hasVariants
    ? (selectedVariant?.price ?? productPrices?.price ?? selectedProduct?.price ?? variants[0]?.price ?? null)
    : (productPrices?.price ?? selectedProduct?.price ?? null);

  const rawCompare = hasVariants
    ? (selectedVariant?.compare_price ?? productPrices?.compare_price ?? selectedProduct?.compare_price ?? variants[0]?.compare_price ?? null)
    : (productPrices?.compare_price ?? selectedProduct?.compare_price ?? null);

  const displayImage = selectedProduct?.img || selectedProduct?.image || MainBangle;
  const displayName = selectedProduct?.name || 'Antique Bangle set';

  const displaySku = hasVariants
    ? (selectedVariant?.sku || variants[0]?.sku || '')
    : (productPrices?.sku || selectedProduct?.sku || '');

  const stockCount = hasVariants
    ? (selectedVariant ? selectedVariant.stock : (totalVariantStock === 0 ? 0 : null))
    : (productPrices?.stock ?? selectedProduct?.stock ?? null);

  const stockAlertThreshold = hasVariants
    ? (selectedVariant?.stock_alert ?? 10)
    : (productPrices?.stock_alert ?? 10);

  const payPrice = rawPrice != null ? Number(rawPrice) : 0;
  const strikePrice = rawCompare != null ? Number(rawCompare) : 0;
  const hasMrp = strikePrice > payPrice && payPrice > 0;

  const displayPrice = payPrice ? `₹${payPrice.toLocaleString("en-IN")}` : "";
  const displayOriginal = strikePrice ? `₹${strikePrice.toLocaleString("en-IN")}` : "";

  const discountPct = hasMrp
    ? Math.round(((strikePrice - payPrice) / strikePrice) * 100)
    : 0;

  const isSizeRequired = size.length > 0;
  const isSizeSelected = !isSizeRequired || Boolean(selectedSize);

  const isOutOfStock = hasVariants
    ? (selectedVariant ? (selectedVariant.stock != null && selectedVariant.stock <= 0) : totalVariantStock === 0)
    : (stockCount !== null && stockCount <= 0);

  const canAddToCart = hasVariants
    ? (isSizeSelected && !!selectedVariant && selectedVariant.stock > 0)
    : (isSizeSelected && (stockCount == null || stockCount > 0));


  const availableColorForSize = useMemo(() => {
    if (hasVariants) {
      return [...new Set(
        variants
          .filter(v => !activeSizeValue || v.size === activeSizeValue)
          .map(v => v.color)
          .filter(Boolean)
      )];
    }
    const rawColors = productPrices?.colors || selectedProduct?.colors;
    if (Array.isArray(rawColors)) return rawColors.filter(Boolean);
    if (typeof rawColors === 'string') return rawColors.split(',').map(c => c.trim()).filter(Boolean);
    return [];
  }, [hasVariants, variants, activeSizeValue, productPrices, selectedProduct]);

  const dynamicThumbs = useMemo(() => {
    let imgs = [];

    if (hasVariants) {
      if (selectedVariant?.images?.length > 0) {
        imgs = selectedVariant.images;
      } else {
        const anyVariantWithImages = variants.find(v => v.images?.length > 0);
        if (anyVariantWithImages) {
          imgs = anyVariantWithImages.images;
        }
      }
    }

    if (imgs.length === 0 && productImages.length > 0) {
      imgs = productImages;
    }

    if (imgs.length === 0 && Array.isArray(selectedProduct?.images) && selectedProduct.images.length > 0) {
      imgs = selectedProduct.images;
    }

    if (imgs.length === 0) {
      imgs = [displayImage];
    }

    // De-duplicate by URL and filter out falsy values
    const cleanImgs = [...new Set(imgs.map(u => typeof u === 'string' ? u.trim() : u).filter(Boolean))];

    return cleanImgs.map((img, i) => ({
      id: i + 1,
      img: productService.getResizedImageUrl(img, 'detail'),
      rawImg: getOriginalImageUrl(img),
      alt: `${displayName} view ${i + 1}`
    }));
  }, [productImages, displayImage, displayName, hasVariants, selectedVariant, variants, selectedProduct?.images])

  // Fetch related products from DB when category changes
  useEffect(() => {
    fetchProductsByCategory(cat);
  }, [cat, fetchProductsByCategory]);

  // Scroll to top when selected product changes (resets window scroll and desktop column scroll)
  useEffect(() => {
    window.scrollTo(0, 0);
    const infoCol = document.querySelector('.pp-info');
    if (infoCol) {
      infoCol.scrollTop = 0;
    }
    setActiveThumb(0);
    setQty(1);
  }, [selectedProduct]);

  useEffect(() => {
    setQty(1);
  }, [selectedVariant?.variant_id]);

  const dynamicRelated = useMemo(() => {
    const dbProducts = productsCache[cat] || [];
    const currentId = selectedProduct?.productId || selectedProduct?.id;

    const mapped = dbProducts
      .filter(
        (p) =>
          p.id !== currentId &&
          p.productId !== currentId
      )
      .slice(0, 8)
      .map((p) => {
        const sellingPrice = Number(p.price) || 0;
        const mrp = Number(p.compare_price) || 0;
        const hasMrp = mrp > sellingPrice && sellingPrice > 0;

        const discountPct = hasMrp ? Math.round(((mrp - sellingPrice) / mrp) * 100) : 0;

        return {
          ...p,
          sub: p.desc || p.category || cat,

          price: sellingPrice ? `₹${sellingPrice.toLocaleString("en-IN")}` : "",
          original: hasMrp ? `₹${mrp.toLocaleString("en-IN")}` : "",
          badge: discountPct > 0 ? `${discountPct}% Off` : "",
          category: p.category || cat,
        };
      });
    return mapped;
  }, [cat, productsCache, selectedProduct]);

  // Dynamic Info Rows
  const dynamicInfo = useMemo(() => [
    ['Product Type', `Antique ${cat} Set`],
    ['Material', 'Gold-plated alloy with synthetic stones'],
    ['Category', cat],
    ['Finish', 'Matte Antique Gold Finish'],
    ['Shipping', 'Shipping  available across India'],
  ], [cat]);

  // Memoized callbacks to prevent unnecessary re-renders
  const handleThumbClick = useCallback((i) => {
    setActiveThumb(i);
  }, []);

  const handleQtyChange = useCallback((delta) => {
    setQty(prev => {
      const next = prev + delta;
      if (next < 1) return 1;
      if (stockCount != null && stockCount > 0 && next > stockCount) {
        return stockCount;
      }
      return next;
    });
  }, [stockCount]);

  const toggleDesc = useCallback(() => setDescOpen(o => !o), []);
  const toggleAddl = useCallback(() => setAddlOpen(o => !o), []);
  const toggleDelivery = () => setDeliveryOpen((prev) => !prev);
  const toggleReturn = () => setReturnOpen((prev) => !prev);
  const toggleWarranty = () => setWarrantyOpen((prev) => !prev);
  const toggleHelp = () => setHelpOpen((prev) => !prev);

  const toggleShowAll = useCallback(() => setShowAll(s => !s), []);

  const handleHeaderLinkClick = (link) => {
    if (link === "Home") {
      navigate("/");
    } else {
      navigate(getNavPath(link, categories));
    }
  };

  const handleRelatedProductClick = useCallback(
    (product) => {
      setSelectedProduct({
        ...product,
        category: product.category || cat,
      });
      navigate(`/product/${product.productId || product.id}`);
    },
    [cat, setSelectedProduct, navigate]
  );

  const handleBuyNow = useCallback(async () => {
    if (isSizeRequired && !selectedSize) {
      setSizeError(true);
      setTimeout(() => setSizeError(false), 2000);
      showToast("Please select a size to order the product", "error");
      return;
    }
    if (isOutOfStock) {
      showToast("Selected item is out of stock", "error");
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/account/signup");
      return;
    }
    if (!canAddToCart) return;

    const sizeParam = selectedSize || null;
    const colorParam = selectedColor || null;

    navigate("/shipping", {
      state: {
        product: {
          productId: selectedProduct?.productId || selectedProduct?.id || selectedProduct?.product_id,
          id: selectedProduct?.productId || selectedProduct?.id || selectedProduct?.product_id,
          name: displayName,
          price: payPrice,
          originalPrice: hasMrp ? strikePrice : 0,
          qty: qty,
          img: dynamicThumbs[0]?.img || selectedVariant?.images?.[0] || displayImage,
          category: cat,
          sku: displaySku || selectedProduct?.sku || selectedVariant?.sku || '',
          size: sizeParam,
          color: colorParam,
        }
      }
    });
  }, [isSizeRequired, selectedSize, isOutOfStock, displayName, payPrice, strikePrice, qty, dynamicThumbs, selectedVariant, displayImage, cat, displaySku, selectedProduct, selectedColor, canAddToCart, navigate]);

  const handleShare = useCallback(async () => {
    const targetId = selectedProduct?.productId || selectedProduct?.id;
    const shareUrl = `${window.location.origin}/product/${targetId}`;
    const shareData = {
      title: displayName,
      text: `Check out this beautiful ${displayName} from Anika`,
      url: shareUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // user cancelled or share failed silently
      }
    } else {
      // Desktop fallback: WhatsApp share
      const message = `${shareData.text}: ${shareData.url}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    }
  }, [displayName, selectedProduct]);

  if (pageLoading) {
    return (
      <div className="pp-root">
        <SiteHeader activeLink="" onLinkClick={handleHeaderLinkClick} />
        <div style={{ maxWidth: '1200px', margin: '40px auto', padding: '0 20px' }}>
          <LoadingSkeleton height="600px" />
        </div>
        <Suspense fallback={null}>
          <SiteFooter />
        </Suspense>
      </div>
    );
  }

  if (notFound || (!pageLoading && urlProductId && !selectedProduct)) {
    return (
      <div className="pp-root">
        <SiteHeader activeLink="" onLinkClick={handleHeaderLinkClick} />
        <div style={{ maxWidth: '600px', margin: '80px auto', textAlign: 'center', padding: '40px 20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '12px', color: '#1a1a1a' }}>Product not found</h2>
          <p style={{ color: '#666', marginBottom: '24px', fontSize: '15px' }}>
            The product you are looking for does not exist or has been removed.
          </p>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '12px 28px',
              backgroundColor: '#8b0030',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Back to home
          </button>
        </div>
        <Suspense fallback={null}>
          <SiteFooter />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="pp-root">

      {/* ── HEADER ── */}
      <SiteHeader activeLink="" onLinkClick={handleHeaderLinkClick} />

      {/* ── PRODUCT DETAIL ── */}
      <section className="pp-detail-section">
        <div className="pp-detail-card">
          <ProductGallery
            key={selectedProduct?.productId || selectedProduct?.id}
            activeThumb={activeThumb}
            setActiveThumb={handleThumbClick}
            displayImage={displayImage}
            displayName={displayName}
            thumbs={dynamicThumbs}
            discountPct={discountPct}
          />

          <div className="pp-info">
            <div className='pp-title-row'>
              <h1 className="pp-title">{displayName}</h1>

              <button
                className='pp-title-share-btn'
                aria-label='share the product'
                onClick={handleShare}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              </button>
            </div>
            {displaySku && (
              <p className="pp-sku">SKU: {displaySku}</p>
            )}

            <div className="pp-rating">
              {'★★★★★'.split('').map((s, i) => <span key={i} className="pp-star">{s}</span>)}
              <span className="pp-rating-count">5.0 (25 Reviews)</span>
            </div>

            <div className="pp-prices">
              <span className="pp-price">{displayPrice}</span>
              {hasMrp && (
                <>
                  <span className="pp-strike">{displayOriginal}</span>
                  {discountPct > 0 && (
                    <span className='pp-discount-badge'>{discountPct}% Off</span>
                  )}
                </>
              )}
            </div>
            <p className="pp-tax-note">Inclusive of all taxes</p>

            {size.length > 0 && (
              <div className={`pp-size ${sizeError && !selectedSize ? 'pp-size-error' : ''}`}>
                <div className='pp-size-row'>
                  <h4>
                    {SIZE_LABEL_BY_CATEGORY[cat] || "Size"}:{" "}
                    {selectedSize ? (
                      <span className="pp-selected-size-text">{selectedSize}</span>
                    ) : (
                      <span className="pp-select-size-prompt">Select a size</span>
                    )}
                  </h4>
                  {SIZE_CHART_BY_CATEGORY[cat] && (
                    <a href='#' className='pp-size-link'
                      onClick={(e) => { e.preventDefault(); setShowSizeChart(true) }}
                    >
                      Size Chart
                    </a>
                  )}
                </div>
                {showSizeChart && SIZE_CHART_BY_CATEGORY[cat] && (
                  <div className='pp-size-chart-overlay' onClick={() => setShowSizeChart(false)}>
                    <div className='pp-size-chart-modal' onClick={(e) => e.stopPropagation()}>
                      <div className='pp-size-chart-header'>
                        <h3>Size Guide ({cat})</h3>
                        <button className='pp-size-chart-close' onClick={() => setShowSizeChart(false)} aria-label="Close size chart">✕</button>
                      </div>
                      <div className='pp-size-chart-body'>
                        <img src={SIZE_CHART_BY_CATEGORY[cat]} alt={`${cat} Size Chart`} />
                      </div>
                    </div>
                  </div>
                )}

                <div className='pp-size-buttons'>
                  {size.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`pp-size-btn ${selectedSize === s ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedSize(s);
                        setSizeError(false);
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {sizeError && !selectedSize && (
                  <span className="pp-size-error-msg">Please select a size to proceed</span>
                )}
              </div>
            )}

            {availableColorForSize && availableColorForSize.length > 0 && (
              <div className='pp-color'>
                <div className='pp-color-row'>
                  <h4>Color</h4>
                </div>
                <div className='pp-color-buttons'>
                  {availableColorForSize.map((c) => (
                    <button
                      key={c}
                      type='button'
                      className={`pp-color-swatch-ring${selectedColor === c ? ' active' : ''}`}
                      onClick={() => setSelectedColor(c)}
                      aria-label={`Select color ${c}`}
                      title={c}
                    >
                      <span
                        className={`pp-color-swatch-circle${c === '#FFFFFF' ? ' pp-color-swatch--white' : ''}`}
                        style={{ backgroundColor: c }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {stockCount != null && (
              <div className="pp-stock">
                {stockCount === 0 ? (
                  <span className="pp-stock-out">Out of stock</span>
                ) : stockCount <= stockAlertThreshold ? (
                  <span className="pp-stock-low">Hurry, Only {stockCount} item{stockCount > 1 ? 's' : ''} left in stock!</span>
                ) : (
                  <span className="pp-stock-ok">In stock</span>
                )}
              </div>
            )}
            <div className="pp-ship-row">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7b1d1d" strokeWidth="2" aria-hidden="true">
                <rect x="1" y="3" width="15" height="13" />
                <path d="M16 8h4l3 3v5h-7V8z" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
              <span>
                Delivers in 3 – 4 business days &nbsp;
                <button className="pp-ship-link">Shipping &amp; Return</button>
              </span>
            </div>

            <div className="pp-cart-row">
              <div className="pp-qty">
                <button onClick={() => handleQtyChange(-1)} aria-label="Decrease quantity">−</button>
                <span>{qty}</span>
                <button onClick={() => handleQtyChange(1)} aria-label="Increase quantity">+</button>
              </div>
              <button
                className="pp-cart-btn"
                disabled={isOutOfStock}
                onClick={async () => {
                  if (isSizeRequired && !selectedSize) {
                    setSizeError(true);
                    setTimeout(() => setSizeError(false), 2000);
                    showToast("Please select a size to order the product", "error");
                    return;
                  }
                  if (isOutOfStock || !canAddToCart) return;

                  const { data: { session } } = await supabase.auth.getSession();
                  if (!session) {
                    navigate("/account/signup");
                    return;
                  }

                  if (selectedProduct) {
                    const sizeParam = selectedSize || null;
                    const colorParam = selectedColor || null;
                    const cartProductPayload = {
                      ...selectedProduct,
                      productId: selectedProduct?.productId || selectedProduct?.id || selectedProduct?.product_id,
                      id: selectedProduct?.productId || selectedProduct?.id || selectedProduct?.product_id,
                      name: displayName,
                      price: payPrice,
                      originalPrice: hasMrp ? strikePrice : 0,
                      compare_price: hasMrp ? strikePrice : 0,
                      image: dynamicThumbs[0]?.img || selectedVariant?.images?.[0] || displayImage,
                      img: dynamicThumbs[0]?.img || selectedVariant?.images?.[0] || displayImage,
                      category: cat,
                    };
                    await addToCart(cartProductPayload, qty, sizeParam, colorParam);
                    showToast(`Added "${displayName}" to cart!`);
                  }
                }}
              >
                {isOutOfStock ? "Out of Stock" : (isSizeRequired && !selectedSize ? "Select Size" : "Add to Cart")}
              </button>
              <button
                className="pp-wish-btn"
                aria-label="Add to wishlist"
                onClick={async () => {
                  if (selectedProduct) {
                    const wishProductPayload = {
                      ...selectedProduct,
                      productId: selectedProduct?.productId || selectedProduct?.id || selectedProduct?.product_id,
                      id: selectedProduct?.productId || selectedProduct?.id || selectedProduct?.product_id,
                      name: displayName,
                      price: payPrice,
                      originalPrice: hasMrp ? strikePrice : 0,
                      compare_price: hasMrp ? strikePrice : 0,
                      category: cat,
                      image: dynamicThumbs[0]?.img || selectedVariant?.images?.[0] || displayImage,
                      img: dynamicThumbs[0]?.img || selectedVariant?.images?.[0] || displayImage,
                    };
                    await toggleWishlist(wishProductPayload);
                  }
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill={isWishlisted ? "#C42049" : "none"} stroke={isWishlisted ? "#C42049" : "#888"} strokeWidth="1.5" aria-hidden="true">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>
            </div>

            <button className="pp-buy-btn" onClick={handleBuyNow}>Buy Now</button>

            <div className='pp-opay'>
              <p>Guaranteed Safe Checkout</p>
              <div className='pp-opay-icons'>
                <img src={UpiIcon} alt="UPI" className="pp-opay-upi" />
                <img src={VisaIcon} alt="Visa" className="pp-opay-card" />
                <img src={MastercardIcon} alt="Mastercard" className="pp-opay-card" />
                <PaymentMorePopup />
              </div>
            </div>

            {/* ── ACCORDIONS (Moved inside pp-info for desktop side-by-side) ── */}
            <div className="pp-accordions">
              <div className="pp-acc-item">
                <button className="pp-acc-head" onClick={toggleDesc} aria-expanded={descOpen}>
                  <span className='pp-acc-label'>
                    <img src={DescIcon} alt="" className="pp-acc-icon" />
                    About Product
                  </span>
                  <svg className={`pp-chev ${descOpen ? 'open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" />
                  </svg>
                </button>
                {descOpen && (
                  <div className='pp-acc-body'>
                    {selectedProduct?.desc ? (
                      selectedProduct.desc
                        .split("\n")
                        .filter((para) => para.trim())
                        .map((para, i) => <p key={i}>{para}</p>)
                    ) : (
                      <p>No description available for this product yet.</p>
                    )}
                    <div className='pp-promise'>
                      <h4 className="pp-promise-title">Our Promise to You</h4>
                      <ul className='pp-promise-list'>
                        <li>All our products are 100% Brand New.</li>
                        <li>Every piece is hand checked by our team before shipping.</li>
                        <li>What you see in photos is exactly what you get. No misleading filters or editing enhancements.</li>
                        <li>Secure packaging to ensure damage-free delivery.</li>
                        <li>All our products are skin friendly, made from brass/copper (except for Impon (Anti tarnished) collection).</li>
                        <li>Dispatch time for orders: 24 hrs to 48 hrs of order confirmation; Shipping 2–3 days.</li>
                        <li>You will get WhatsApp and e-mail updates of your order once confirmed.</li>
                        <li>For additional images/videos: please WhatsApp <a href="tel:+919363131636">9363131636</a> (Mon–Sat, 10 AM–5 PM). Queries will be answered in order.</li>
                      </ul>
                    </div>
                  </div>
                )}

              </div>

              <div className="pp-acc-item">
                <button className="pp-acc-head" onClick={toggleAddl} aria-expanded={addlOpen}>
                  <span className='pp-acc-label'>
                    <img src={SpecIcon} alt="" className="pp-acc-icon" />
                    Material & Specifications
                  </span>
                  <svg className={`pp-chev ${addlOpen ? 'open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" />
                  </svg>
                </button>
                {addlOpen && (
                  <div className="pp-acc-body">
                    <table className="pp-info-tbl">
                      <tbody>
                        {dynamicInfo.map(([k, v]) => (
                          <tr key={k}>
                            <td className="pp-tbl-key">{k}</td>
                            <td className="pp-tbl-val">{v}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className='pp-acc-item'>
                <button className='pp-acc-head' onClick={toggleDelivery} aria-expanded={deliveryOpen}>
                  <span className='pp-acc-label'>
                    <img src={DeliveryIcon} alt="" className="pp-acc-icon" />
                    Delivery Details
                  </span>
                  <svg className={`pp-chev ${deliveryOpen ? 'open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" />
                  </svg>
                </button>
                {deliveryOpen && (
                  <div className='pp-acc-body'>
                    <p>At Anika, we ensure that your order reaches you safely and as quickly as possible. Please read our shipping policy carefully before placing your order.</p>

                    <div className='pp-policy-block'>
                      <h4 className="pp-policy-block-title">Order Processing Time</h4>
                      <ul className="pp-policy-block-list">
                        <li>All orders are processed within 2–3 business days (excluding Sundays and public holidays).</li>
                      </ul>
                    </div>

                    <div className='pp-policy-block'>
                      <h4 className="pp-policy-block-title">Shipping Timeline</h4>
                      <ul className='pp-policy-block-list'>
                        <li>We ship across India through trusted courier partners (DTDC, Ekart, ST Courier).</li>
                        <li>Delivery typically takes 3–7 business days depending on your location.</li>
                        <li>During high-demand seasons or unforeseen delays (like weather or courier issues), delivery may take slightly longer.</li>
                      </ul>
                    </div>

                    <div className='pp-policy-note'>
                      <strong>Address Accuracy – Please Note</strong>
                      <p>Before placing your order, please double-check your shipping address, phone number, and PIN code.</p>
                      <p>If a package is misrouted or returned due to an incorrect or incomplete address, the courier and our company will not bear any responsibility.</p>
                      <p>In such cases, customers will have to bear any reshipping charges or product loss incurred.</p>
                    </div>

                    <div className='pp-policy-block'>
                      <h4 className="pp-policy-block-title">Non-Serviceable Areas</h4>
                      <ul className='pp-policy-block-list'>
                        <li>⁠If your PIN code is not serviceable by our delivery partners, we will reach out to you for an alternative address.</li>
                      </ul>
                    </div>

                    <div className='pp-policy-block'>
                      <h4 className="pp-policy-block-title">Tracking Information</h4>
                      <ul className='pp-policy-block-list'>
                        <li>Once your order is shipped, a tracking link will be sent via email/WhatsApp number</li>
                        <li>You can use this to track the real-time status of your delivery.</li>
                      </ul>
                    </div>

                    <div className='pp-policy-block'>
                      <h4 className='pp-policy-block-title'>Please Note</h4>
                      <ul className='pp-policy-block-list'>
                        <li>All our orders are prepaid, and you have already paid the courier charges during checkout.</li>
                        <li>If any delivery person asks for additional money, security deposit, or any extra payment, please do NOT pay.</li>
                        <li>Such requests are not from us and may be a scam.</li>
                        <li>In case this happens, kindly refuse the package and immediately contact us through WhatsApp or call.</li>
                        <li>We use only reputed courier services, and we have never faced such issues. This message is shared purely to keep our customers aware and safe.</li>
                        <li>Your safety and trust mean the most to us.</li>
                      </ul>

                    </div>
                  </div>
                )}
              </div>

              <div className='pp-acc-item'>
                <button className='pp-acc-head' onClick={toggleReturn} aria-expanded={returnOpen}>
                  <span className='pp-acc-label'>
                    <img src={ReturnIcon} alt="" className="pp-acc-icon" />
                    Return & Refund Policy
                  </span>
                  <svg className={`pp-chev ${returnOpen ? 'open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" />
                  </svg>
                </button>
                {returnOpen && (
                  <div className='pp-acc-body'>
                    <div className='pp-policy-block pp-policy-block--reject'>
                      <h4 className="pp-policy-block-title pp-policy-block-title--reject">We Do NOT Accept Returns for the Following Reasons</h4>
                      <ul className="pp-policy-block-list pp-policy-block-list--reject">
                        <li>Product doesn't suit you.</li>
                        <li>Changed mind after ordering.</li>
                        <li>Ordered for someone else and they didn't like it.</li>
                        <li>Someone ordered on your behalf.</li>
                        <li>Order placed by mistake.</li>
                        <li>Bangle size / motif width doesn't fit.</li>
                        <li>Delays in delivery.</li>
                        <li>Product not received before your occasion date.</li>
                        <li>Damage while wearing or trying after delivery.</li>
                      </ul>
                    </div>

                    <div className='pp-policy-block pp-policy-block--accept'>
                      <h4 className="pp-policy-block-title pp-policy-block-title--accept">We Accept Returns Only for the Following</h4>
                      <ul className='pp-policy-block-list pp-policy-block-list--accept'>
                        <li>Damages</li>
                        <li>Missing items</li>
                      </ul>
                    </div>

                    <div className='pp-policy-note'>
                      <strong>Return Request Process</strong>
                      <p>Please follow the steps below within 24 hrs of delivery.</p>
                      <ol className='pp-policy-steps'>
                        <li>
                          Report the issue on WhatsApp with:
                          <ul className='pp-policy-block-list'>
                            <li>Name</li>
                            <li>Order ID</li>
                            <li>360° Unboxing Video (Compulsory – No cuts/editing)</li>
                          </ul>
                        </li>
                      </ol>
                      <p><strong>Repacked items will not be accepted.</strong></p>
                      <p><strong>Issues reported after 24 hrs of delivery will not be accepted.</strong></p>
                      <p><strong>Packages returned without an unboxing video will not be considered for review</strong></p>
                    </div>

                    <div className='pp-policy-block'>
                      <h4 className='pp-policy-block-title'>Approved Return Instruction</h4>
                      <ul className='pp-policy-block-list'>
                        <li>⁠Return the item within 48 hrs of delivery.</li>
                        <li>You can use India Post, ST Courier, Franch Express or DTDC.</li>
                        <li>Shipping charges are calculated at checkout based on your delivery address and are shown on the payment page before you pay.</li>
                        <li>Our team will share the return address.</li>
                        <li>Kindly forward the tracking number on WhatsApp once dispatched.</li>
                      </ul>
                    </div>

                    <div className='pp-policy-block'>
                      <h4 className='pp-policy-block-title'>Refund / Replacement</h4>
                      <ul className='pp-policy-block-list'>
                        <li>Once the product is received and inspected, we’ll inform you of the status via WhatsApp.</li>
                        <li>⁠Replacement will be shipped at no additional cost.</li>
                        <li>⁠Refund, if applicable, will be processed for the product price only.</li>
                      </ul>
                    </div>

                  </div>
                )}
              </div>

              <div className='pp-acc-item'>
                <button className='pp-acc-head' onClick={toggleWarranty} aria-expanded={warrantyOpen}>
                  <span className='pp-acc-label'>
                    <img src={AuthenticityIcon} alt="" className="pp-acc-icon" />
                    Authenticity & Warranty
                  </span>
                  <svg className={`pp-chev ${warrantyOpen ? 'open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" />
                  </svg>
                </button>
                {warrantyOpen && (
                  <div className="pp-acc-body">
                    <p>This product is covered under a manufacturer warranty against defects in materials and workmanship.</p>
                    <p>Warranty does not cover damage from misuse, accidents, or normal wear and tear.</p>
                  </div>
                )}
              </div>

              <div className='pp-acc-item'>
                <button className='pp-acc-head' onClick={toggleHelp} aria-expanded={helpOpen}>
                  <span className='pp-acc-label'>
                    <img src={HelpIcon} alt="" className="pp-acc-icon" />
                    Need Help?
                  </span>
                  <svg className={`pp-chev ${helpOpen ? 'open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" />
                  </svg>
                </button>
                {helpOpen && (
                  <div className='pp-acc-body'>
                    <p>Call us at <a href="tel:+919363631636">+91 93636 31636</a>, Mon–Sat, 9:30 AM – 6:30 PM IST.</p>
                    <p>Or write to us anytime and we'll get back within 24 hours.</p>
                  </div>
                )}
              </div>



            </div>
          </div>
        </div>
      </section>

      {/* ── YOU MAY ALSO LIKE ── */}
      <RelatedProducts
        showAll={showAll}
        setShowAll={setShowAll}
        relatedItems={dynamicRelated}
        onProductClick={handleRelatedProductClick}
      />

      {/* ── CATEGORY STRIP ── */}
      <div className="pp-category-section-wrap">
        <Suspense fallback={<LoadingSkeleton height="150px" />}>
          <CategorySection onCategoryClick={handleHeaderLinkClick} />
        </Suspense>
      </div>

      {/* ── FOOTER ── */}
      <Suspense fallback={<LoadingSkeleton height="300px" />}>
        <SiteFooter />
      </Suspense>

      {/* ── TOAST ── */}
      <Toast
        message={toastMsg}
        type={toastType}
        onClose={() => setToastMsg("")}
      />
    </div>
  );
}
