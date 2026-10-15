import React, { Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import AnikaHome from './AnikaHome';
import './HomePage.css';
import { useStore } from '../hooks/useStore';
import { getNavPath } from "../services/categoryRoute";

const ProductSection = lazy(() => import('./ProductSection'));
const NecklaceSection = lazy(() => import('./NecklaceSection'));
const BannerSection = lazy(() => import('./BannerSection'));
const CategorySection = lazy(() => import('./CategorySection'));
const NewArrivals = lazy(() => import('./NewArrivals'));
const BestSellers = lazy(() => import('./BestSellers'));
const CollectionsSection = lazy(() => import('./CollectionsSection'));
const RealExperience = lazy(() => import('./RealExperience'));
const Offers = lazy(() => import('./Offers'));
const CustomerExperiences = lazy(() => import('./CustomerExperiences'));
const SiteFooter = lazy(() => import('./SiteFooter'));

const SectionLoader = () => (
  <div style={{ height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
  </div>
);

export default function HomePage() {
  const navigate = useNavigate();
  const categories = useStore(state => state.categories);
  const setSelectedProduct = useStore(state => state.setSelectedProduct);

  // Wrap setSelectedProduct to also navigate
  const handleProductClick = (product) => {
    setSelectedProduct(product);      // saves product to Zustand state
    navigate(`/product/${product.productId || product.id}`);         // then go to product page
  };

  const handleCategoryClick = (name) => {
    navigate(getNavPath(name, categories));
  };

  return (
    <div className="homepage">
      <AnikaHome />

      <Suspense fallback={<SectionLoader />}>
        <div id="categories">
          <CategorySection onCategoryClick={handleCategoryClick} />
        </div>
        <div id="new-arrivals">
          <NewArrivals onProductClick={handleProductClick} />
        </div>
        <div id="best-sellers">
          <BestSellers onProductClick={handleProductClick} />
        </div>
        <div id="shop"><ProductSection onProductClick={handleProductClick} /></div>
        <div id="necklaces-section"><NecklaceSection onProductClick={handleProductClick} /></div>
        {/* <BannerSection /> */}
        {/* <CollectionsSection /> */}
        <RealExperience />
        <div id="offers"><Offers onProductClick={handleProductClick} /></div>
        <div id="reviews"><CustomerExperiences /></div>
        <SiteFooter />
      </Suspense>
    </div>
  );
}