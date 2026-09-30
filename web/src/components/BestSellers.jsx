import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../hooks/useStore';
import { productService } from '../services/productService';
import { SkeletonProductCard } from './ui/Skeleton';
import './BestSellers.css';

export default function BestSellers({ onProductClick }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const wishlistItems = useStore((state) => state.wishlistItems);
  const toggleWishlist = useStore((state) => state.toggleWishlist);

  const wishlistProductIds = wishlistItems.map((w) => w.id || w.productId);

  useEffect(() => {
    let isMounted = true;

    const fetchBestSellers = async () => {
      try {
        // 1. Fetch the newest 8 active product IDs that are shown in New Arrivals
        const { data: newArrivalsData } = await supabase
          .from('products')
          .select('product_id')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(8);

        const newArrivalIds = (newArrivalsData || []).map((p) => p.product_id).filter(Boolean);

        // 2. Fetch distinct active products for Best Sellers, strictly EXCLUDING New Arrivals
        let query = supabase
          .from('products')
          .select(`
            product_id,
            name,
            price,
            compare_price,
            discount_price,
            images,
            image_url,
            has_variants,
            is_featured,
            product_variants(price, compare_price, stock),
            categories(name, slug)
          `)
          .eq('is_active', true);

        if (newArrivalIds.length > 0) {
          query = query.not('product_id', 'in', `(${newArrivalIds.join(',')})`);
        }

        // Prioritize featured products or older established classics
        let { data: distinctData, error: bsError } = await query
          .order('is_featured', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(8);

        if (bsError) {
          console.error('Error fetching best sellers:', bsError);
        }

        let finalProducts = distinctData || [];

        // Fallback only if the catalog has very few products and no other products exist
        if (finalProducts.length === 0 && newArrivalIds.length > 0) {
          const { data: fallbackData } = await supabase
            .from('products')
            .select(`
              product_id,
              name,
              price,
              compare_price,
              discount_price,
              images,
              image_url,
              has_variants,
              is_featured,
              product_variants(price, compare_price, stock),
              categories(name, slug)
            `)
            .eq('is_active', true)
            .order('name', { ascending: true })
            .limit(8);

          finalProducts = fallbackData || [];
        }

        const mapped = finalProducts.map((p) => {
          const variants = p.product_variants || [];
          const hasVariants = !!p.has_variants && variants.length > 0;

          const sellingPrice = hasVariants
            ? Math.min(...variants.map((v) => Number(v.price) || Infinity).filter(isFinite))
            : (Number(p.price) || 0);

          const mrp = hasVariants
            ? Math.max(...variants.map((v) => Number(v.compare_price) || 0))
            : (Number(p.compare_price) || 0);

          const firstVariantImage = hasVariants
            ? variants.find((v) => v.images?.length > 0)?.images?.[0]
            : null;

          const img =
            firstVariantImage ||
            (Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : (p.image_url || ''));

          const categoryName = p.categories?.name || '';
          const discountPct =
            mrp > sellingPrice && sellingPrice > 0
              ? Math.round(((mrp - sellingPrice) / mrp) * 100)
              : 0;

          return {
            id: p.product_id,
            productId: p.product_id,
            name: p.name,
            img,
            category: categoryName,
            categorySlug: p.categories?.slug || '',
            price: sellingPrice ? `₹${sellingPrice.toLocaleString('en-IN')}` : '',
            original: mrp && mrp > sellingPrice ? `₹${mrp.toLocaleString('en-IN')}` : '',
            rawPrice: sellingPrice,
            rawMrp: mrp,
            discountPct,
            has_variants: hasVariants,
          };
        });

        if (isMounted) {
          setProducts(mapped);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load best sellers:', err);
        if (isMounted) setLoading(false);
      }
    };

    fetchBestSellers();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleWishlistClick = (e, product) => {
    e.stopPropagation();
    toggleWishlist({
      id: product.id,
      productId: product.id,
      name: product.name,
      img: product.img,
      price: product.rawPrice,
      compare_price: product.rawMrp,
    });
  };

  return (
    <section className="best-sellers-section">
      <div className="best-sellers-header">
        <span className="best-sellers-eyebrow">Customer Favorites</span>
        <h2 className="best-sellers-title">Best Sellers</h2>
        <p className="best-sellers-subtitle">
          Our most coveted pieces, cherished for their enduring craftsmanship and elegance.
        </p>
      </div>

      {loading ? (
        <div className="best-sellers-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonProductCard key={i} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="best-sellers-empty">
          <p>No products available currently. Check back soon!</p>
        </div>
      ) : (
        <div className="best-sellers-grid">
          {products.map((product) => {
            const isWishlisted = wishlistProductIds.includes(product.id);
            return (
              <article
                key={product.id}
                className="best-seller-card"
                onClick={() => onProductClick && onProductClick(product)}
              >
                <div className="best-seller-img-box">
                  {product.discountPct > 0 && (
                    <span className="best-seller-offer-badge">
                      {product.discountPct}% Off
                    </span>
                  )}

                  <button
                    type="button"
                    aria-label="Toggle Wishlist"
                    className={`best-seller-wishlist-btn ${isWishlisted ? 'active' : ''}`}
                    onClick={(e) => handleWishlistClick(e, product)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill={isWishlisted ? '#C42049' : 'none'}
                      stroke={isWishlisted ? '#C42049' : '#444'}
                      strokeWidth="2"
                    >
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </button>

                  <img
                    src={productService.getResizedImageUrl(product.img, 'card')}
                    alt={product.name}
                    className="best-seller-img"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = product.img || '/src/assets/cart/bangle1.webp';
                    }}
                  />
                </div>

                <div className="best-seller-info">
                  {product.category && (
                    <span className="best-seller-category">{product.category}</span>
                  )}
                  <h3 className="best-seller-name">{product.name}</h3>
                  <div className="best-seller-price-row">
                    <span className="best-seller-price">{product.price}</span>
                    {product.original && (
                      <span className="best-seller-original">{product.original}</span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
