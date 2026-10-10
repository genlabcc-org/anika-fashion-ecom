import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { productService } from '../services/productService';
import { variantService } from '../services/variantService';
import { cartService } from '../services/cartService';
import { wishlistService } from '../services/wishlistService';
import { authService } from '../services/authService';
import { orderService } from '../services/orderService';
import { clean } from '../utils/customerName';

/** Strip currency symbols & commas so */
const parsePrice = (v) => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[₹,\s]/g, ''));
  return isNaN(n) ? 0 : n;
};

const getOriginalImageUrl = (url) => {
  if (!url || typeof url !== 'string') return url;
  let clean = url.replace('/storage/v1/render/image/public/', '/storage/v1/object/public/');
  if (clean.includes('?')) {
    const [baseUrl, query] = clean.split('?');
    const params = new URLSearchParams(query);
    params.delete('width');
    params.delete('height');
    params.delete('resize');
    params.delete('quality');
    params.delete('format');
    const remaining = params.toString();
    clean = remaining ? `${baseUrl}?${remaining}` : baseUrl;
  }
  return clean;
};

// ── Product Detail Cache (localStorage, 1-year TTL) ─────────────────────────
const PD_CACHE_KEY = 'anika_pd_cache';
const PD_CACHE_TTL = 365 * 24 * 60 * 60 * 1000; // 1 year in ms

/** Load image-only entries from localStorage (price/stock never persisted) */
const loadPdCache = () => {
  try {
    const raw = localStorage.getItem(PD_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const now = Date.now();
    const valid = {};
    Object.entries(parsed).forEach(([id, entry]) => {
      if (entry.cachedAt && (now - entry.cachedAt) < PD_CACHE_TTL) {
        // Only restore images — price/stock are re-fetched fresh on every refresh
        valid[id] = { cachedAt: entry.cachedAt, images: entry.images || [] };
      }
    });
    return valid;
  } catch {
    return {};
  }
};

/** Persist only image data to localStorage (price/stock intentionally excluded) */
const savePdCache = (cache) => {
  try {
    const imgOnly = {};
    Object.entries(cache).forEach(([id, entry]) => {
      imgOnly[id] = { cachedAt: entry.cachedAt, images: entry.images || [] };
    });
    localStorage.setItem(PD_CACHE_KEY, JSON.stringify(imgOnly));
  } catch (e) {
    console.warn('Product detail cache write failed (localStorage full?):', e);
  }
};

/** Remove one product entry from localStorage cache */
const evictPdEntry = (productId) => {
  try {
    const raw = localStorage.getItem(PD_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    delete parsed[productId];
    localStorage.setItem(PD_CACHE_KEY, JSON.stringify(parsed));
  } catch { /* ignore */ }
};

export const useStore = create((set, get) => ({
  // --- Authentication State ---
  session: null,
  user: null,
  sessionLoading: true,

  // --- Admin ---
  isAdmin: false,
  adminChecked: false,

  // --- Addresses ---
  addresses: [],
  loadingAddresses: false,
  addressesFetchedFor: null,

  // --- Catalog Caching ---
  categories: [],
  products: {}, // { categoryName: [products] }
  productDetails: loadPdCache(), // { productId: { cachedAt, images, base, variants } } — persisted 1 year
  loadingCategories: false,
  loadingProducts: false,

  // --- Cart and Wishlist ---
  cartItems: [],
  wishlistItems: [],
  loadingCart: false,
  loadingWishlist: false,

  // --- Orders ---
  orders: [],
  loadingOrders: false,
  ordersFetchedFor: null,
  newOrdersCount: 0,

  // --- Selected Product ---
  selectedProduct: (() => {
    const saved = localStorage.getItem('anika_selected_product');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  })(),

  // --- Selected Admin Order ---
  selectedAdminOrder: (() => {
    const saved = localStorage.getItem('anika_selected_admin_order');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  })(),

  // --- Selected Admin Customer ---
  selectedAdminCustomer: (() => {
    const saved = localStorage.getItem('anika_selected_admin_customer');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  })(),

  // --- Actions ---

  // Initialize Auth & Session
  initAuth: async () => {
    try {
      const session = await authService.getSession();
      if (session) {
        set({ session, user: session.user });
        await get().syncCartAndWishlist(session.user.id);
        get().checkAdminStatus(session.user.id);
        await get().syncProfileFromMetadata(session.user);
      } else {
        // Load guest cart & wishlist from localStorage
        const localCart = localStorage.getItem('anika_guest_cart');
        const localWishlist = localStorage.getItem('anika_guest_wishlist');
        set({
          cartItems: localCart ? JSON.parse(localCart) : [],
          wishlistItems: localWishlist ? JSON.parse(localWishlist) : []
        });
      }
    } catch (err) {
      console.error('Failed to initialize auth in store:', err);
    } finally {
      set({ sessionLoading: false });
    }

    // Subscribe to auth state changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      // console.log('Auth event in Zustand store:', event, session?.user?.id);
      if (session) {
        const currentUser = get().user;
        if (!currentUser || currentUser.id !== session.user.id) {
          // New sign-in (or first load) — set user and sync guest cart/wishlist
          set({ session, user: session.user });
          await get().syncCartAndWishlist(session.user.id);
        } else {
          // Same user, but metadata may have changed (e.g. profile edit) — keep it fresh
          set({ session, user: session.user });
        }
      } else {
        // Sign out / Clear session
        set({
          session: null,
          user: null,
          isAdmin: false,
          adminChecked: false,
          cartItems: [],
          wishlistItems: [],
          orders: [],
          ordersFetchedFor: null,
          newOrdersCount: 0,
          addresses: [],
          addressesFetchedFor: null
        });
        localStorage.removeItem('anika_guest_cart');
        localStorage.removeItem('anika_guest_wishlist');
      }
    });

    // Validate product image cache on refresh (price is always fresh)
    get().validateProductImageCache();
  },


  checkAdminStatus: async (userId) => {
    if (!userId) {
      set({ isAdmin: false, adminChecked: true });
      return false;
    }
    try {
      const data = await authService.checkAdminUser(userId);
      const isAdmin = data?.role === "admin";
      set({ isAdmin, adminChecked: true });
      return isAdmin;
    } catch (err) {
      console.error('Admin check error:', err.message);
      set({ isAdmin: false, adminChecked: true });
      return false;
    }
  },



  // Caching Addresses
  fetchAddresses: async (userId, { force = false } = {}) => {
    if (!userId) return [];
    const { addressesFetchedFor, addresses } = get();
    if (!force && addressesFetchedFor === userId) return addresses;

    set({ loadingAddresses: true });
    try {
      const data = await orderService.getAddresses(userId);
      set({ addresses: data || [], loadingAddresses: false, addressesFetchedFor: userId });
      return data || [];
    } catch (err) {
      console.error('Error fetching addresses in store:', err);
      set({ loadingAddresses: false });
      return [];
    }
  },

  // Caching Categories
  fetchCategories: async () => {
    if (get().categories.length > 0) return get().categories;
    set({ loadingCategories: true });
    try {
      const data = await productService.getCategories();
      set({ categories: data || [], loadingCategories: false });
      return data;
    } catch (err) {
      console.error('Error fetching categories in store:', err);
      set({ loadingCategories: false });
      return [];
    }
  },

  // Caching Products by Category
  fetchProductsByCategory: async (categoryName) => {
    if (get().products[categoryName]) return get().products[categoryName];
    set({ loadingProducts: true });
    try {
      const productsData = await productService.getProductsByCategoryName(categoryName);
      const mapped = (productsData || []).map(p => {
        const variants = p.product_variants || [];
        const hasVariants = !!p.has_variants && variants.length > 0;

        const sellingPrice = hasVariants
          ? Math.min(...variants.map(v => Number(v.price) || Infinity).filter(isFinite))
          : (Number(p.price) || 0);

        const mrp = hasVariants
          ? Math.max(...variants.map(v => Number(v.compare_price) || 0))
          : (Number(p.compare_price) || 0);

        const totalStock = hasVariants
          ? variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0)
          : (Number(p.stock) || 0);

        const firstVariantImage = hasVariants
          ? variants.find(v => v.images?.length > 0)?.images?.[0]
          : null;

        return {
          id: p.product_id || p.id,
          productId: p.product_id || p.id,
          img: getOriginalImageUrl(firstVariantImage || p.image_url || (p.images && p.images[0]) || '/src/assets/cart/bangle1.webp'),
          name: p.name,
          desc: p.description,
          price: sellingPrice,
          compare_price: mrp,
          sizes: p.sizes || variants.map(v => v.size).filter(Boolean),
          stock: totalStock > 0 ? 'in-stock' : 'out-of-stock',
          subcategory: p.subcategory || p.subcategories?.name || null,
          subcategory_id: p.subcategory_id || null,
          has_variants: hasVariants,
        };
      });
      set(state => ({
        products: {
          ...state.products,
          [categoryName]: mapped
        },
        loadingProducts: false
      }));
      return mapped;
    } catch (err) {
      console.error(`Error fetching products for category ${categoryName}:`, err);
      set({ loadingProducts: false });
      return [];
    }
  },

  // Caching Individual Product Details (images + price + variants)
  // Images: served from Zustand session cache (populated from localStorage on load)
  // Price/stock/variants: ALWAYS fetched fresh from DB on first access per session
  fetchProductDetails: async (productId, { force = false } = {}) => {
    if (!productId) return null;
    const cached = get().productDetails[productId];

    // Full session cache hit (images + base both present) — return immediately
    if (!force && cached?.base) return cached;

    try {
      // If images already in cache (from localStorage), skip image DB call
      const hasImages = cached?.images?.length > 0;

      const fetchTasks = [
        hasImages
          ? Promise.resolve({ data: { images: cached.images, image_url: null }, error: null })
          : supabase
            .from('products')
            .select('images, image_url')
            .eq('product_id', productId)
            .single(),
        // Price/stock always fetched fresh
        supabase
          .from('products')
          .select('price, compare_price, sku, stock, stock_alert, sizes, colors, has_variants')
          .eq('product_id', productId)
          .single(),
      ];

      const [imgResult, baseResult] = await Promise.all(fetchTasks);

      const imgData = imgResult.data;
      const baseData = baseResult.data;
      if (baseResult.error) throw baseResult.error;

      const images = hasImages
        ? cached.images
        : (Array.isArray(imgData?.images) && imgData.images.length > 0
          ? imgData.images
          : (imgData?.image_url ? [imgData.image_url] : []));

      let variantRows = [];
      if (baseData?.has_variants) {
        try {
          variantRows = await variantService.getVariantsByProductId(productId);
        } catch (err) {
          console.error('Failed to load variants in store:', err);
        }
      }

      const details = { cachedAt: Date.now(), images, base: baseData, variants: variantRows };
      const updatedCache = { ...get().productDetails, [productId]: details };
      set({ productDetails: updatedCache });
      savePdCache(updatedCache); // persists images only (price excluded by savePdCache)
      return details;
    } catch (err) {
      console.error(`Error fetching product details for ${productId}:`, err);
      return null;
    }
  },

  // On refresh: productDetails loaded from localStorage has images only.
  // base (price/stock) and variants will be null/missing → triggers DB fetch.
  // This ensures price/stock is ALWAYS fresh on every page refresh,
  // while images are served from localStorage cache (1-year TTL).
  validateProductImageCache: () => {
    const cache = get().productDetails;
    const now = Date.now();
    let changed = false;
    const updatedCache = { ...cache };
    Object.entries(cache).forEach(([id, entry]) => {
      if (!entry.cachedAt || (now - entry.cachedAt) >= PD_CACHE_TTL) {
        delete updatedCache[id];
        evictPdEntry(id);
        changed = true;
      }
    });
    if (changed) set({ productDetails: updatedCache });
  },

  // Caching Orders
  fetchOrders: async (userId, { force = false } = {}) => {
    if (!userId) return [];
    const { ordersFetchedFor, orders } = get();
    if (!force && ordersFetchedFor === userId) return orders;

    set({ loadingOrders: true });
    try {
      const data = await orderService.getOrders(userId);
      set({ orders: data || [], loadingOrders: false, ordersFetchedFor: userId });
      return data || [];
    } catch (err) {
      console.error('Error fetching orders in store:', err);
      set({ loadingOrders: false });
      return [];
    }
  },

  // --- Admin Order Badge ---
  fetchNewOrdersCount: async () => {
    try {
      const count = await orderService.getNewOrdersCount();
      set({ newOrdersCount: count });
      return count;
    } catch (err) {
      console.error('Error fetching new orders count:', err);
      return 0;
    }
  },

  subscribeToOrders: () => {
    get().fetchNewOrdersCount();

    let debounceTimer = null;
    const handleOrderChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        get().fetchNewOrdersCount();
      }, 300);
    };

    const channelName = `admin-orders-badge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        handleOrderChange
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  },

  markOrdersRead: async (ids, read = true) => {
    if (!ids || ids.length === 0) return [];
    const prevCount = get().newOrdersCount;
    const prevOrders = get().orders;
    const prevSelected = get().selectedAdminOrder;

    let delta = 0;
    if (read) {
      const unreadCount = prevOrders.filter(o => ids.includes(o.id) && o.admin_read === false).length;
      delta = unreadCount > 0 ? -unreadCount : -ids.length;
    } else {
      const readCount = prevOrders.filter(o => ids.includes(o.id) && o.admin_read !== false).length;
      delta = readCount > 0 ? readCount : ids.length;
    }
    const optimisticCount = Math.max(0, prevCount + delta);

    set((state) => ({
      newOrdersCount: optimisticCount,
      orders: state.orders.map((o) =>
        ids.includes(o.id) ? { ...o, admin_read: Boolean(read) } : o
      ),
      selectedAdminOrder: state.selectedAdminOrder && ids.includes(state.selectedAdminOrder.id)
        ? { ...state.selectedAdminOrder, admin_read: Boolean(read) }
        : state.selectedAdminOrder,
    }));

    try {
      const data = await orderService.setOrdersRead(ids, read);
      return data;
    } catch (err) {
      console.error('Failed to update orders read status:', err);
      set({
        newOrdersCount: prevCount,
        orders: prevOrders,
        selectedAdminOrder: prevSelected,
      });
      throw err;
    }
  },

  // --- Selected Product Actions ---
  setSelectedProduct: (product) => {
    set({ selectedProduct: product });
    if (product) {
      localStorage.setItem('anika_selected_product', JSON.stringify(product));
    } else {
      localStorage.removeItem('anika_selected_product');
    }
  },

  setSelectedAdminOrder: (orderOrFn) => {
    const nextOrder = typeof orderOrFn === 'function' ? orderOrFn(get().selectedAdminOrder) : orderOrFn;
    set({ selectedAdminOrder: nextOrder });
    if (nextOrder) {
      localStorage.setItem('anika_selected_admin_order', JSON.stringify(nextOrder));
    } else {
      localStorage.removeItem('anika_selected_admin_order');
    }
  },

  setSelectedAdminCustomer: (customerOrFn) => {
    const nextCustomer = typeof customerOrFn === 'function' ? customerOrFn(get().selectedAdminCustomer) : customerOrFn;
    set({ selectedAdminCustomer: nextCustomer });
    if (nextCustomer) {
      localStorage.setItem('anika_selected_admin_customer', JSON.stringify(nextCustomer));
    } else {
      localStorage.removeItem('anika_selected_admin_customer');
    }
  },

  // --- Cart Actions ---
  addToCart: async (product, qty = 1, size = null, color = null) => {
    const user = get().user;
    // Normalize size/color: DB stores '' for null, so normalize here for consistent comparison
    const normSize = size || '';
    const normColor = color || '';
    if (user) {
      set({ loadingCart: true });
      try {
        const existingItem = get().cartItems.find(
          item => item.productId === (product.productId || product.id) &&
            (item.size || '') === normSize &&
            (item.color || '') === normColor
        );

        if (existingItem) {
          const newQty = existingItem.qty + qty;
          await cartService.updateCartItemQty(existingItem.id, newQty);
        } else {
          await cartService.addCartItem(user.id, product.productId || product.id, qty, normSize, normColor);
        }

        const updatedItems = await cartService.getCartItems(user.id);
        set({ cartItems: updatedItems, loadingCart: false });
      } catch (err) {
        console.error('Error adding to database cart:', err);
        set({ loadingCart: false });
        alert("Failed to add product to cart. Please sign out and sign in again to refresh your session.");
      }
    } else {
      // Guest local update
      const localCart = [...get().cartItems];
      const existingIdx = localCart.findIndex(
        item => item.productId === (product.productId || product.id) &&
          (item.size || '') === normSize &&
          (item.color || '') === normColor
      );

      if (existingIdx > -1) {
        localCart[existingIdx].qty += qty;
      } else {
        localCart.push({
          id: `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          productId: product.productId || product.id,
          name: product.name,
          price: parsePrice(product.price),
          originalPrice: parsePrice(product.originalPrice || product.original || product.compare_price || Math.round(parsePrice(product.price) * 1.3)),
          category: product.category,
          qty,
          size: normSize,
          color: normColor,
          image: product.img || product.image || (product.images && product.images[0]) || '/src/assets/cart/bangle1.webp',
          deliveryDate: 'Sep 12, 2025'
        });
      }
      set({ cartItems: localCart });
      localStorage.setItem('anika_guest_cart', JSON.stringify(localCart));
    }
  },

  updateCartQty: async (itemId, qty) => {
    const user = get().user;
    if (user) {
      set({ loadingCart: true });
      try {
        await cartService.updateCartItemQty(itemId, qty);
        const updatedItems = await cartService.getCartItems(user.id);
        set({ cartItems: updatedItems, loadingCart: false });
      } catch (err) {
        console.error('Error updating cart item quantity:', err);
        set({ loadingCart: false });
      }
    } else {
      const localCart = get().cartItems.map(item =>
        item.id === itemId ? { ...item, qty: Math.max(1, qty) } : item
      );
      set({ cartItems: localCart });
      localStorage.setItem('anika_guest_cart', JSON.stringify(localCart));
    }
  },

  removeFromCart: async (itemId) => {
    const user = get().user;
    if (user) {
      set({ loadingCart: true });
      try {
        await cartService.deleteCartItems([itemId]);
        const updatedItems = await cartService.getCartItems(user.id);
        set({ cartItems: updatedItems, loadingCart: false });
      } catch (err) {
        console.error('Error removing from cart:', err);
        set({ loadingCart: false });
      }
    } else {
      const localCart = get().cartItems.filter(item => item.id !== itemId);
      set({ cartItems: localCart });
      localStorage.setItem('anika_guest_cart', JSON.stringify(localCart));
    }
  },

  removeSelectedFromCart: async (selectedIds) => {
    if (!selectedIds || selectedIds.length === 0) return;
    const user = get().user;
    if (user) {
      set({ loadingCart: true });
      try {
        await cartService.deleteCartItems(selectedIds);
        const updatedItems = await cartService.getCartItems(user.id);
        set({ cartItems: updatedItems, loadingCart: false });
      } catch (err) {
        console.error('Error removing selected from cart:', err);
        set({ loadingCart: false });
      }
    } else {
      const localCart = get().cartItems.filter(item => !selectedIds.includes(item.id));
      set({ cartItems: localCart });
      localStorage.setItem('anika_guest_cart', JSON.stringify(localCart));
    }
  },

  // --- Wishlist Actions ---
  toggleWishlist: async (product) => {
    const user = get().user;
    const productId = product.productId || product.id || product.product_id;
    if (!productId) return;
    if (user) {
      set({ loadingWishlist: true });
      try {
        const exists = get().wishlistItems.find(w => (w.id === productId || w.productId === productId));
        if (exists) {
          await wishlistService.deleteWishlistItem(user.id, productId);
        } else {
          await wishlistService.addWishlistItem(user.id, productId);
        }
        const updatedItems = await wishlistService.getWishlistItems(user.id);
        set({ wishlistItems: updatedItems, loadingWishlist: false });
      } catch (err) {
        console.error('Error toggling wishlist:', err);
        set({ loadingWishlist: false });
        alert("Failed to toggle wishlist item. Please sign out and sign in again to refresh your session.");
      }
    } else {
      // Guest local update
      let localWishlist = [...get().wishlistItems];
      const exists = localWishlist.find(w => (w.id === productId || w.productId === productId));
      if (exists) {
        localWishlist = localWishlist.filter(w => (w.id !== productId && w.productId !== productId));
      } else {
        const price = parsePrice(product.price);
        const originalPrice = parsePrice(product.originalPrice || product.compare_price || Math.round(price * 1.3));
        localWishlist.push({
          id: productId,
          productId: productId,
          name: product.name,
          price: price,
          originalPrice: originalPrice,
          category: product.category || '',
          qty: 1,
          image: product.img || product.image || (product.images && product.images[0]) || '/src/assets/cart/bangle1.webp',
          deliveryDate: '2 - 3 Days'
        });
      }
      set({ wishlistItems: localWishlist });
      localStorage.setItem('anika_guest_wishlist', JSON.stringify(localWishlist));
    }
  },

  removeFromWishlist: async (productId) => {
    const user = get().user;
    if (user) {
      set({ loadingWishlist: true });
      try {
        await wishlistService.deleteWishlistItem(user.id, productId);
        const updatedItems = await wishlistService.getWishlistItems(user.id);
        set({ wishlistItems: updatedItems, loadingWishlist: false });
      } catch (err) {
        console.error('Error removing from wishlist:', err);
        set({ loadingWishlist: false });
      }
    } else {
      const localWishlist = get().wishlistItems.filter(w => w.id !== productId);
      set({ wishlistItems: localWishlist });
      localStorage.setItem('anika_guest_wishlist', JSON.stringify(localWishlist));
    }
  },

  removeSelectedFromWishlist: async (selectedProductIds) => {
    if (!selectedProductIds || selectedProductIds.length === 0) return;
    const user = get().user;
    if (user) {
      set({ loadingWishlist: true });
      try {
        // Get the DB IDs matching these product IDs for this user
        const currentWishlist = get().wishlistItems;
        const dbIdsToDelete = currentWishlist
          .filter(item => selectedProductIds.includes(item.id))
          .map(item => item.dbId)
          .filter(Boolean);

        await wishlistService.deleteWishlistItems(dbIdsToDelete);
        const updatedItems = await wishlistService.getWishlistItems(user.id);
        set({ wishlistItems: updatedItems, loadingWishlist: false });
      } catch (err) {
        console.error('Error removing selected from wishlist:', err);
        set({ loadingWishlist: false });
      }
    } else {
      const localWishlist = get().wishlistItems.filter(item => !selectedProductIds.includes(item.id));
      set({ wishlistItems: localWishlist });
      localStorage.setItem('anika_guest_wishlist', JSON.stringify(localWishlist));
    }
  },

  // --- Synchronization Actions (Merge guest state to DB) ---
  syncCartAndWishlist: async (userId) => {
    if (!userId) return;
    set({ loadingCart: true, loadingWishlist: true });

    try {
      // 1. Sync Cart
      const guestCartJson = localStorage.getItem('anika_guest_cart');
      const guestCart = guestCartJson ? JSON.parse(guestCartJson) : [];
      const dbCart = await cartService.getCartItems(userId);

      // Merge items. If exists in both, use larger qty
      const mergedCart = [];

      // Add DB cart items first
      dbCart.forEach(dbItem => {
        mergedCart.push({
          user_id: userId,
          product_id: dbItem.productId,
          qty: dbItem.qty,
          size: dbItem.size,
          color: dbItem.color
        });
      });

      // Merge guest cart items
      guestCart.forEach(guestItem => {
        const existingIdx = mergedCart.findIndex(
          m => m.product_id === guestItem.productId && m.size === guestItem.size && m.color === guestItem.color
        );
        if (existingIdx > -1) {
          mergedCart[existingIdx].qty = Math.max(mergedCart[existingIdx].qty, guestItem.qty);
        } else {
          mergedCart.push({
            user_id: userId,
            product_id: guestItem.productId,
            qty: guestItem.qty,
            size: guestItem.size,
            color: guestItem.color
          });
        }
      });

      // Deduplicate mergedCart by product_id+size+color before syncing
      const dedupedCart = [];
      mergedCart.forEach(item => {
        const key = `${item.product_id}__${item.size || ''}__${item.color || ''}`;
        const existingIdx = dedupedCart.findIndex(d =>
          `${d.product_id}__${d.size || ''}__${d.color || ''}` === key
        );
        if (existingIdx > -1) {
          dedupedCart[existingIdx].qty = Math.max(dedupedCart[existingIdx].qty, item.qty);
        } else {
          dedupedCart.push({ ...item, size: item.size || '', color: item.color || '' });
        }
      });

      if (dedupedCart.length > 0) {
        try {
          await cartService.syncCartItems(dedupedCart);
        } catch (syncErr) {
          console.warn('Cart sync upsert failed (non-critical):', syncErr);
        }
      }
      localStorage.removeItem('anika_guest_cart');
      const finalCart = await cartService.getCartItems(userId);
      set({ cartItems: finalCart, loadingCart: false });

      // 2. Sync Wishlist
      const guestWishlistJson = localStorage.getItem('anika_guest_wishlist');
      const guestWishlist = guestWishlistJson ? JSON.parse(guestWishlistJson) : [];
      const dbWishlist = await wishlistService.getWishlistItems(userId);

      const mergedWishlist = [];
      dbWishlist.forEach(dbItem => {
        mergedWishlist.push({
          user_id: userId,
          product_id: dbItem.id
        });
      });

      guestWishlist.forEach(guestItem => {
        const exists = mergedWishlist.some(m => m.product_id === guestItem.id);
        if (!exists) {
          mergedWishlist.push({
            user_id: userId,
            product_id: guestItem.id
          });
        }
      });

      if (mergedWishlist.length > 0) {
        await wishlistService.syncWishlistItems(mergedWishlist);
      }
      localStorage.removeItem('anika_guest_wishlist');
      const finalWishlist = await wishlistService.getWishlistItems(userId);
      set({ wishlistItems: finalWishlist, loadingWishlist: false });

    } catch (err) {
      console.error('Failed to sync guest cart & wishlist to database:', err);
      // Still try to load cart from DB so user doesn't see an empty cart
      try {
        const fallbackCart = await cartService.getCartItems(userId);
        set({ cartItems: fallbackCart, loadingCart: false, loadingWishlist: false });
      } catch {
        set({ loadingCart: false, loadingWishlist: false });
      }
    }
  },
  syncProfileFromMetadata: async (user) => {
    if (!user) return;

    const cleanName = clean(user.user_metadata?.name || user.user_metadata?.full_name);
    const profilePayload = {
      id: user.id,
      email: user.email,
      updated_at: new Date().toISOString(),
    };
    if (cleanName) {
      profilePayload.name = cleanName;
    }

    const { error } = await supabase
      .from("profiles")
      .upsert(profilePayload, {
        onConflict: "id",
      });
    if (error) {
      console.error("Profile sync failed:", error);
    }
  },
}));