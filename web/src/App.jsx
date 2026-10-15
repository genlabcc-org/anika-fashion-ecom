import React, { useEffect, useState } from 'react';
import { useParams } from "react-router-dom";
import { useStore } from './hooks/useStore';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";

import Signup from "./account/JewelrySignup";
import Login from "./account/JewelryLogin";
import OtpVerify from "./account/OtpVerify";
import AnikaProfile from "./profile/AnikaProfile";
import AnikaOrders from "./profile/AnikaOrders";
import OrderTracking from "./profile/OrderTracking";
import AnikaAddresses from "./profile/AnikaAddresses";
import AnikaWishlist from "./profile/AnikaWishlist";
import AnikaAccount from "./profile/AnikaAccount";
import ShippingAddress from "./components/shippingAddress";
import Payment from "./components/CartPage";
import HomePage from './components/HomePage';
import ProductDetails from './components/ProductDetails';
import CategoryPage from "./product/categorypage";
import WishlistPage from './components/wishlistPage'; // ← added
import Cartpage from './components/CartPage';

import Terms from './components/Policies/Term';
import Privacy from './components/Policies/Privacy';

import AdminRoute from "./components/AdminRoute";
import Dashboard from "./admin/pages/Dashboard";

import { getNavPath } from "./services/categoryRoute";


// Scrolls to top on every route change
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// Custom CategoryPage
function CategoryBySlug(){
  const { slug } = useParams();
  const categories = useStore(state => state.categories);
  const fetchCategories = useStore(state => state.fetchCategories);

  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetchCategories().finally(() => setChecked(true));
  }, [fetchCategories]);

  const rawSlug = decodeURIComponent(slug || '');
  const normalizedSlug = rawSlug.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const match = categories.find(
    c => c.slug === slug ||
         c.slug === normalizedSlug ||
         (c.name || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') === normalizedSlug
  );

  if (!checked){
    return null;
  }

  if (match) {
    return <CategoryPage category={match.name} />;
  }

  const defaultNames = {
    'rings': 'Rings',
    'toe-rings': 'Toe Rings',
    'earrings': 'Earrings',
    'bracelets': 'Bracelets',
    'bangles': 'Bangles',
    'necklaces': 'Necklaces',
    'anklets': 'Anklets',
    'hip-accessories': 'Hip Accessories',
  };

  if (defaultNames[normalizedSlug]) {
    return <CategoryPage category={defaultNames[normalizedSlug]} />;
  }

  return (
    <div style={{ padding: '80px 20px', textAlign: 'center' }}>
      <h2>Page not found</h2>
    </div>
  );
}

function LegacyProductRedirect() {
  const selectedProduct = useStore((s) => s.selectedProduct);
  const targetId = selectedProduct?.productId || selectedProduct?.id;
  if (targetId) {
    return <Navigate to={`/product/${targetId}`} replace />;
  }
  return <Navigate to="/" replace />;
}

function App() {
  const initAuth = useStore(state => state.initAuth);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route
          path="/"
          element={<HomePage />}
        />
        <Route
          path="/product/:productId"
          element={
            <ProductDetails
              onBack={() => window.history.back()}
            />
          }
        />
        <Route
          path="/product"
          element={<LegacyProductRedirect />}
        />
        <Route path="/rings" element={<CategoryPage category="Rings" />} />
        <Route path="/toe-rings" element={<CategoryPage category="Toe Rings" />} />
        <Route path="/earrings" element={<CategoryPage category="Earrings" />} />
        <Route path="/bracelets" element={<CategoryPage category="Bracelets" />} />
        <Route path="/bangles" element={<CategoryPage category="Bangles" />} />
        <Route path="/necklaces" element={<CategoryPage category="Necklaces" />} />
        <Route path="/anklets" element={<CategoryPage category="Anklets" />} />
        <Route path="/hip-accessories" element={<CategoryPage category="Hip Accessories" />} />

        <Route path="/category/:slug" element={<CategoryBySlug />} />
        <Route path="/:slug" element={<CategoryBySlug />} />

        <Route path="/account/login" element={<Login />} />
        <Route path="/account/signup" element={<Signup />} />
        <Route path="/account/otp-verify" element={<OtpVerify />} />
        <Route path="/shipping" element={<ShippingAddress />} />
        <Route path="/payment" element={<Payment />} />
        <Route path="/profile" element={<AnikaProfile />} />
        <Route path="/profile/orders" element={<AnikaOrders />} />
        <Route path="/profile/orders/track/:orderId" element={<OrderTracking />} />
        <Route path="/track-order/:orderId" element={<OrderTracking />} />
        <Route path="/profile/addresses" element={<AnikaAddresses />} />
        <Route path="/profile/wishlists" element={<AnikaWishlist />} />
        <Route path="/profile/account" element={<AnikaAccount />} />

        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />

        <Route path="/cart" element={<Cartpage />} />
        <Route path="/wishlist" element={<WishlistPage />} /> {/* ← added */}



        <Route path='/admin/*' element={
          <AdminRoute>
            <Dashboard />
          </AdminRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
