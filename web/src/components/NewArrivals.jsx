import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../hooks/useStore';
import { productService } from '../services/productService';
import { SkeletonProductCard } from './ui/Skeleton';
import './NewArrivals.css';

export default function NewArrivals({ onProductClick }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const wishlistItems = useStore((state) => state.wishlistItems);
  const toggleWishlist = useStore((state) => state.toggleWishlist);

  const wishlistProductIds = wishlistItems.map((w) => w.id || w.productId);

  useEffect(() => {
    let isMounted = true;
    const fetchNewArrivals = async () => {
      try {
        const { data, error } = await supabase
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
          .order('created_at', { ascending: false })
          .limit(8);

        if (error) {
          console.error('Error fetching new arrivals:', error);
          if (isMounted) {
            setProducts([]);
            setLoading(false);
          }
          return;
        }

        const mapped = (data || []).map((p) => {
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
        console.error('Failed to load new arrivals:', err);
        if (isMounted) setLoading(false);
      }
    };

    fetchNewArrivals();
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
    <section className="new-arrivals-section">
      <div className="new-arrivals-header">
        <span className="new-arrivals-eyebrow">Just Dropped</span>
        <h2 className="new-arrivals-title">New Arrivals</h2>
        <p className="new-arrivals-subtitle">
          Explore our latest handcrafted pieces, thoughtfully created for timeless beauty.
        </p>
      </div>

      {loading ? (
        <div className="new-arrivals-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonProductCard key={i} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="new-arrivals-empty">
          <p>No new products found. Check back soon!</p>
        </div>
      ) : (
        <div className="new-arrivals-grid">
          {products.map((product) => {
            const isWishlisted = wishlistProductIds.includes(product.id);
            return (
              <article
                key={product.id}
                className="new-arrival-card"
                onClick={() => onProductClick && onProductClick(product)}
              >
                <div className="new-arrival-img-box">
                  {product.discountPct > 0 && (
                    <span className="new-arrival-offer-badge">
                      {product.discountPct}% Off
                    </span>
                  )}

                  <button
                    type="button"
                    aria-label="Toggle Wishlist"
                    className={`new-arrival-wishlist-btn ${isWishlisted ? 'active' : ''}`}
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
                    className="new-arrival-img"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = product.img || '/src/assets/cart/bangle1.webp';
                    }}
                  />
                </div>

                <div className="new-arrival-info">
                  {product.category && (
                    <span className="new-arrival-category">{product.category}</span>
                  )}
                  <h3 className="new-arrival-name">{product.name}</h3>
                  <div className="new-arrival-price-row">
                    <span className="new-arrival-price">{product.price}</span>
                    {product.original && (
                      <span className="new-arrival-original">{product.original}</span>
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
