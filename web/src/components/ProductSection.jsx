import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './ProductSection.css';
import RingHandImg from '../assets/RingHand.webp';
import { supabase } from '../lib/supabase';
import { Skeleton } from './ui/Skeleton';

const VISIBLE = 5;

export default function ProductSection({ onProductClick }) {
  const [startIndex, setStartIndex] = useState(0);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
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
        .eq('categories.name', 'Bangles')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('Error fetching Bangles for ProductSection:', error);
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
          productId: p.product_id,
          img: p.images?.[0] || p.image_url || '',
          images: Array.isArray(p.images) && p.images.length > 0 ? p.images : (p.image_url ? [p.image_url] : []),
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

  const canPrev = startIndex > 0;
  const canNext = startIndex + VISIBLE < products.length;

  const prev = () => { if (canPrev) setStartIndex(i => i - 1); };
  const next = () => { if (canNext) setStartIndex(i => i + 1); };

  const visible = products.slice(startIndex, startIndex + VISIBLE);

  if (loading) return (
    <section className="product-section">
      <div className="product-left">
        <img src={RingHandImg} alt="Ring on hand" className="ring-hand-img" loading="lazy" />
        <div className="lifestyle-overlay">
          <p className="lifestyle-subtitle">Wear the Memories</p>
          <h2 className="lifestyle-title">Bangles</h2>
        </div>
      </div>
      <div className="product-right">
        <div className="product-cards">
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
  );

  return (
    <section className="product-section">
      <div className="product-left">
        <img src={RingHandImg} alt="Ring on hand" className="ring-hand-img" loading="lazy" decoding="async" />
        <div className="lifestyle-overlay">
          <p className="lifestyle-subtitle">Wear the Memories</p>
          <h2 className="lifestyle-title">Bangles</h2>
        </div>
      </div>

      <div className="product-right">
        <div className="product-cards">
          {visible.map((product) => (
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
          <button className="shop-now-btn" onClick={() => navigate('/bangles')}>Shop Now</button>
        </div>
      </div>
    </section>
  );
}