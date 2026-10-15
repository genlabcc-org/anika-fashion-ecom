import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './ProductSection.css';
import { supabase } from '../lib/supabase';
import { Skeleton } from './ui/Skeleton';

const VISIBLE = 10;

export default function NecklaceSection({ onProductClick }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const scrollRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProducts = async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          product_id,
          name,
          price,
          compare_price,
          discount_price,
          images,
          has_variants,
          product_variants(price, compare_price, stock),
          categories!inner(name)
        `)
        .eq('is_active', true)
        .eq('categories.name', 'Necklaces')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Error fetching Necklaces for NecklaceSection:', error);
        setProducts([]);
        setLoading(false);
        return;
      }

      const mapped = (data || []).map(p => {
        const variants = p.product_variants || [];
        const hasVariants = !!p.has_variants && variants.length > 0;

        const sellingPrice = hasVariants
          ? Math.min(...variants.map(v => Number(v.price) || Infinity).filter(isFinite))
          : (Number(p.price) || 0);

        const mrp = hasVariants
          ? Math.max(...variants.map(v => Number(v.compare_price) || 0))
          : (Number(p.compare_price) || 0);

        return {
          id: p.product_id,
          img: p.images?.[0] || '',
          name: p.name,
          category: p.categories?.name || '',
          price: sellingPrice ? `₹${sellingPrice.toLocaleString('en-IN')}` : '',
          original: mrp && mrp > sellingPrice ? `₹${mrp.toLocaleString('en-IN')}` : '',
        };
      });

      setProducts(mapped);
      setLoading(false);
    };

    fetchProducts();
  }, []);

  // Auto-slide effect
  useEffect(() => {
    if (loading || products.length === 0 || isHovered) return;

    const interval = setInterval(() => {
      if (scrollRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
        if (scrollLeft + clientWidth >= scrollWidth - 20) {
          scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          scrollRef.current.scrollBy({ left: 191, behavior: 'smooth' });
        }
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [loading, products, isHovered]);

  if (loading) return (
    <div className="product-section-wrapper">
      <div className="showcase-header">
        <span className="showcase-eyebrow">Handcrafted Collection</span>
        <h2 className="showcase-title">Necklaces</h2>
        <p className="showcase-subtitle">
          From delicate chains to bold statement sets, every piece is crafted to turn heads.
        </p>
      </div>
      <section className="product-section">
        <div className="product-right">
          <div className="product-cards necklace-cards">
            {Array.from({ length: VISIBLE }).map((_, i) => (
              <div key={i} className="product-card" style={{ border: 'none', padding: 0 }}>
                <Skeleton height="180px" width="100%" borderRadius="12px" />
                <div className="product-details" style={{ marginTop: '8px' }}>
                  <Skeleton height="14px" width="50%" />
                  <Skeleton height="12px" width="80%" style={{ marginTop: '4px' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );

  return (
    <div className="product-section-wrapper">
      <div className="showcase-header">
        <span className="showcase-eyebrow">Handcrafted Collection</span>
        <h2 className="showcase-title">Necklaces</h2>
        <p className="showcase-subtitle">
          From delicate chains to bold statement sets, every piece is crafted to turn heads.
        </p>
      </div>

      <section className="product-section">
        <div className="product-right">
          <div
            ref={scrollRef}
            className="product-cards necklace-cards"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onTouchStart={() => setIsHovered(true)}
            onTouchEnd={() => setIsHovered(false)}
          >
            {products.map((product) => (
              <div
                key={product.id}
                className="product-card"
                onClick={() => onProductClick(product)}
                style={{ cursor: 'pointer' }}
              >
                <div className="product-img-wrapper">
                  <img src={product.img} alt={product.name} className="product-img" loading="lazy" decoding="async" />
                </div>
                <div className="product-details">
                  <div className="product-info">
                    <span className="product-price">{product.price}</span>
                    {product.original && <span className="product-original">{product.original}</span>}
                  </div>
                  <p className="product-name">{product.name}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="product-footer">
            <button className="shop-now-btn" onClick={() => navigate('/necklaces')}>Shop Now</button>
          </div>
        </div>
      </section>
    </div>
  );
}
