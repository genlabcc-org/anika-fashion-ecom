import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Offers.css';
import FestiveImg from '../assets/offers/image-5.webp';
import { supabase } from '../lib/supabase';

const VISIBLE = 5;

export default function Offers({ onProductClick }) {
  const [startIndex, setStartIndex] = useState(0);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const { data: catData } = await supabase
          .from('categories')
          .select('category_id, name')
          .ilike('name', '%toe%')
          .eq('is_active', true);

        let catIds = (catData || []).map(c => c.category_id);

        let productsData = [];

        if (catIds.length > 0) {
          const { data } = await supabase
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
              categories(name)
            `)
            .in('category_id', catIds)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(5);

          productsData = data || [];
        }

        if (productsData.length === 0) {
          const { data: nameData } = await supabase
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
              categories(name)
            `)
            .ilike('name', '%toe%')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(5);

          productsData = nameData || [];
        }

        const mapped = productsData.map(p => {
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
            category: p.categories?.name || 'Toe Rings',
            price: sellingPrice ? `₹${sellingPrice.toLocaleString('en-IN')}` : '',
            original: mrp && mrp > sellingPrice ? `₹${mrp.toLocaleString('en-IN')}` : '',
          };
        });

        setProducts(mapped);
      } catch (err) {
        console.error('Error fetching Toe Rings:', err);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  const canPrev = startIndex > 0;
  const canNext = startIndex + VISIBLE < products.length;

  const prev = () => {
    if (canPrev) setStartIndex((i) => i - 1);
  };

  const next = () => {
    if (canNext) setStartIndex((i) => i + 1);
  };

  const visible = products.slice(startIndex, startIndex + VISIBLE);

  if (loading) {
    return (
      <section className="product-section">
        <div className="product-left">
          <img src={FestiveImg} alt="Toe rings showcase" className="ring-hand-img" loading="lazy" />
          <div className="lifestyle-overlay">
            <p className="lifestyle-subtitle">Grace for Every Step</p>
            <h2 className="lifestyle-title">Toe Rings</h2>
          </div>
        </div>
        <div className="product-right">
          <div className="product-cards">
            {Array.from({ length: VISIBLE }).map((_, i) => (
              <div key={i} className="product-card">
                <div className="product-img-wrapper" style={{ background: '#f5f5f5', borderRadius: 8 }} />
                <div className="product-details">
                  <div style={{ height: 12, width: 60, background: '#eee', borderRadius: 4, margin: '8px 0 4px' }} />
                  <div style={{ height: 10, width: 90, background: '#f0f0f0', borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="product-section">
      <div className="product-left">
        <img src={FestiveImg} alt="Toe rings showcase" className="ring-hand-img" loading="lazy" decoding="async" />
        <div className="lifestyle-overlay">
          <p className="lifestyle-subtitle">Grace for Every Step</p>
          <h2 className="lifestyle-title">Toe Rings</h2>
        </div>
      </div>

      <div className="product-right">
        <div className="product-cards">
          {visible.map((product) => (
            <div
              key={product.id}
              className="product-card"
              onClick={() => onProductClick && onProductClick(product)}
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
          <button className="shop-now-btn" onClick={() => navigate('/toe-rings')}>Shop Now</button>
        </div>
      </div>
    </section>
  );
}