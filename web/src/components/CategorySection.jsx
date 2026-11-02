import { useState, useEffect, useMemo } from "react";
import { productService } from "../services/productService";
import { useStore } from "../hooks/useStore";
import { SkeletonCategories } from "./ui/Skeleton";
import "./CategorySection.css";

const isCategoryActive = (cat) => {
  if (!cat) return false;
  return cat.is_active !== false && String(cat.is_active) !== "false" && cat.is_active !== 0;
};

export default function CategorySection({ onCategoryClick, title = "Category", subtitle = "" }) {
  const storeCategories = useStore((state) => state.categories);
  const fetchCategories = useStore((state) => state.fetchCategories);
  const [fallbackCategories, setFallbackCategories] = useState([]);
  const [loading, setLoading] = useState(!storeCategories || storeCategories.length === 0);

  useEffect(() => {
    let isMounted = true;
    const loadCategories = async () => {
      try {
        const data = await fetchCategories();
        if (isMounted && (!data || data.length === 0)) {
          const directData = await productService.getCategories();
          if (isMounted) setFallbackCategories(directData || []);
        }
      } catch (err) {
        console.error("Failed to load categories:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadCategories();
    return () => {
      isMounted = false;
    };
  }, [fetchCategories]);

  const rawList = storeCategories && storeCategories.length > 0 ? storeCategories : fallbackCategories;
  const categories = useMemo(() => {
    return (rawList || []).filter(isCategoryActive);
  }, [rawList]);

  if (loading && (!rawList || rawList.length === 0)) {
    return (
      <section className="category-section">
        <div className="category-header">
          <h2 className="category-title">{title}</h2>
          {subtitle && <p className="category-subtitle">{subtitle}</p>}
        </div>
        <div className="category-wrapper" style={{ justifyContent: 'center' }}>
          <SkeletonCategories count={6} />
        </div>
      </section>
    );
  }

  if (categories.length === 0) {
    return null;
  }

  return (
    <section className="category-section">
      <div className="category-header">
        <h2 className="category-title">{title}</h2>
        {subtitle && <p className="category-subtitle">{subtitle}</p>}
      </div>
      <div className="category-wrapper">
        {categories.map((cat) => (
          <div
            key={cat.category_id || cat.id}
            className="category-item"
            onClick={() => onCategoryClick && onCategoryClick(cat.name)}
          >
            <img src={cat.image_url} alt={cat.name} loading="lazy" decoding="async" />
            <p>{cat.name}</p>
          </div>
        ))}
      </div>
    </section>
  );
}