import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { productService } from '../services/productService';
import { variantService } from '../services/variantService';
import { cartService } from '../services/cartService';
import { wishlistService } from '../services/wishlistService';
import { authService } from '../services/authService';
import { orderService } from '../services/orderService';
import { icarryService } from '../services/icarryService';
import { isSyncableOrder } from '../admin/utils/trackingSync';
import { clean } from '../utils/customerName';

/** Strip currency symbols & commas so */
const parsePrice = (v) => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[₹,\s]/g, ''));
  return isNaN(n) ? 0 : n;
};


// ── Product Detail Cache ────────────────────────────────────────────────────
// In-memory session cache with 5-minute TTL and in-flight request deduplication.
const PD_CACHE_KEY = 'anika_pd_cache';
const PD_TTL_MS = 5 * 60 * 1000;
const inflightPd = new Map();

/** Clean up legacy stale cache from localStorage and return empty session cache */
const loadPdCache = () => {
  try {
    localStorage.removeItem(PD_CACHE_KEY);
  } catch {}
  return {};
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
  productDetails: loadPdCache(), // { productId: { cachedAt, images, base, variants } } (session cache, 5-min TTL)
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

        const productImgs = Array.isArray(p.images) && p.images.length > 0
          ? p.images
          : (p.image_url ? [p.image_url] : []);

        return {
          id: p.product_id || p.id,
          productId: p.product_id || p.id,
          img: firstVariantImage || p.image_url || (p.images && p.images[0]) || '/src/assets/cart/bangle1.webp',
          images: productImgs,
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

  loadProductById: async (productId) => {
    // If we have fresh productDetails AND already have name/desc, skip DB query
    const cachedDetails = get().productDetails[productId];
    const isFresh = cachedDetails?.base && (Date.now() - cachedDetails.cachedAt < PD_TTL_MS);
    const sel = get().selectedProduct;
    const sameSel = String(sel?.productId || sel?.id) === String(productId);

    let existingMeta = sameSel ? sel : null;
    if (!existingMeta) {
      for (const catList of Object.values(get().products || {})) {
        const found = (catList || []).find(p => String(p.productId || p.id) === String(productId));
        if (found) { existingMeta = found; break; }
      }
    }

    if (isFresh && existingMeta?.name) {
      const product = {
        ...existingMeta,
        id: productId,
        productId,
        img: cachedDetails.images[0] || existingMeta.img,
        images: cachedDetails.images,
        has_variants: cachedDetails.base.has_variants,
      };
      get().setSelectedProduct(product);
      return product;
    }

    const { data, error } = await supabase
      .from('products')
      .select('product_id, name, description, price, compare_price, image_url, images, has_variants, categories(name), product_variants(price, compare_price, stock, images)')
      .eq('product_id', productId)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) return null;

    const variants = data.product_variants || [];
    const hasVariants = !!data.has_variants && variants.length > 0;
    const prices = variants.map(v => Number(v.price)).filter(Boolean);

    const productImgs = Array.isArray(data.images) && data.images.length > 0
      ? data.images
      : (data.image_url ? [data.image_url] : []);

    const product = {
      id: data.product_id,
      productId: data.product_id,
      name: data.name,
      desc: data.description,
      category: data.categories?.name,
      price: hasVariants ? Math.min(...prices) : Number(data.price) || 0,
      compare_price: hasVariants
        ? Math.max(...variants.map(v => Number(v.compare_price) || 0))
        : Number(data.compare_price) || 0,
      img: variants.find(v => v.images?.length)?.images?.[0] || data.image_url || productImgs[0] || '',
      images: productImgs,
      has_variants: hasVariants,
    };
    get().setSelectedProduct(product);
    return product;
  },

  // Caching Individual Product Details (images + price + variants)
  // Single embedded select with 5-minute TTL and in-flight deduplication
  fetchProductDetails: async (productId, { force = false } = {}) => {
    if (!productId) return null;
    const cached = get().productDetails[productId];

    // Cache hit only if within TTL and price/stock (base) is present
    if (!force && cached?.base && (Date.now() - cached.cachedAt < PD_TTL_MS)) {
      return cached;
    }

    // In-flight request deduplication
    if (inflightPd.has(productId)) {
      return inflightPd.get(productId);
    }

    const fetchPromise = (async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select(`images, image_url, price, compare_price, sku, stock, stock_alert, sizes, colors, has_variants,
                   product_variants(variant_id, sku, size, color, price, compare_price, stock, stock_alert, images, is_active, created_at)`)
          .eq('product_id', productId)
          .maybeSingle();

        if (error || !data) return null;

        let rawImgs = [];
        if (Array.isArray(data.images) && data.images.length > 0) {
          rawImgs = data.images;
        } else if (data.image_url) {
          rawImgs = [data.image_url];
        }
        // De-duplicate URLs and filter out falsy/empty values
        const images = [...new Set(rawImgs.map(u => typeof u === 'string' ? u.trim() : u).filter(Boolean))];

        const rawVariants = data.product_variants || [];
        const variantRows = rawVariants
          .filter(v => v.is_active !== false)
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        const baseData = {
          price: data.price,
          compare_price: data.compare_price,
          sku: data.sku,
          stock: data.stock,
          stock_alert: data.stock_alert,
          sizes: data.sizes,
          colors: data.colors,
          has_variants: data.has_variants,
        };

        const details = { cachedAt: Date.now(), images, base: baseData, variants: variantRows };
        const updatedCache = { ...get().productDetails, [productId]: details };
        set({ productDetails: updatedCache });
        return details;
      } catch (err) {
        console.error(`Error fetching product details for ${productId}:`, err);
        return null;
      } finally {
        inflightPd.delete(productId);
      }
    })();

    inflightPd.set(productId, fetchPromise);
    return fetchPromise;
  },

  validateProductImageCache: () => {},

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

  invalidateOrders: () => set({ ordersFetchedFor: null }),

  refreshOrders: async (userId) => {
    return get().fetchOrders(userId, { force: true });
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

    // Optimistically update admin list listeners (e.g. useAdminData)
    ids.forEach((id) => {
      get()._adminOrderListeners.forEach((fn) => {
        try {
          fn(id, { admin_read: Boolean(read) });
        } catch (_) { }
      });
    });

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

      // Rollback admin list listeners
      ids.forEach((id) => {
        const prevOrder = prevOrders.find((o) => o.id === id);
        const prevRead = prevOrder ? prevOrder.admin_read : !read;
        get()._adminOrderListeners.forEach((fn) => {
          try {
            fn(id, { admin_read: prevRead });
          } catch (_) { }
        });
      });

      throw err;
    }
  },

  // --- Admin Order List & Realtime Sync Actions ---
  _adminOrderListeners: new Set(),
  registerAdminOrderListener: (listener) => {
    const listeners = get()._adminOrderListeners;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  updateOrderInList: (orderId, patch) => {
    if (!orderId || !patch) return;
    const currentSelected = get().selectedAdminOrder;
    const updatedSelected = currentSelected && currentSelected.id === orderId
      ? { ...currentSelected, ...patch }
      : currentSelected;

    set((state) => ({
      orders: state.orders.map((o) => (o.id === orderId ? { ...o, ...patch } : o)),
      selectedAdminOrder: updatedSelected,
    }));

    if (updatedSelected && currentSelected && currentSelected.id === orderId) {
      try {
        localStorage.setItem('anika_selected_admin_order', JSON.stringify(updatedSelected));
      } catch (_) { }
    }

    // Broadcast update to all registered admin listeners (e.g. useAdminData)
    get()._adminOrderListeners.forEach((fn) => {
      try {
        fn(orderId, patch);
      } catch (err) {
        console.error('Error in admin order listener:', err);
      }
    });
  },

  syncAllTracking: async (ordersList, { onProgress } = {}) => {
    const list = Array.isArray(ordersList) ? ordersList : (get().orders || []);
    const syncable = list.filter(isSyncableOrder);
    const skipped = list.length - syncable.length;

    if (syncable.length === 0) {
      if (typeof onProgress === 'function') onProgress(0, 0);
      return { total: 0, updated: 0, unchanged: 0, failed: 0, skipped };
    }

    let updated = 0;
    let unchanged = 0;
    let failed = 0;
    let done = 0;
    const total = syncable.length;

    const CONCURRENCY = 3;
    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < syncable.length) {
        const order = syncable[nextIndex++];
        try {
          const res = await icarryService.track(order.id);
          if (res && res.error) {
            failed++;
          } else if (res?.updates && Object.keys(res.updates).length > 0) {
            get().updateOrderInList(order.id, res.updates);
            updated++;
          } else {
            unchanged++;
          }
        } catch (err) {
          console.error(`[syncAllTracking] Error syncing order ${order.id}:`, err);
          failed++;
        } finally {
          done++;
          if (typeof onProgress === 'function') {
            try {
              onProgress(done, total);
            } catch (_) { }
          }
        }
      }
    };

    const workerCount = Math.min(CONCURRENCY, syncable.length);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);

    return {
      total,
      updated,
      unchanged,
      failed,
      skipped,
    };
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
        const itemPrice = parsePrice(product.price);
        const rawMrp = parsePrice(product.originalPrice || product.original || product.compare_price || 0);
        const originalPrice = rawMrp > itemPrice ? rawMrp : 0;
        localCart.push({
          id: `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          productId: product.productId || product.id,
          name: product.name,
          price: itemPrice,
          originalPrice: originalPrice,
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
        const rawMrp = parsePrice(product.originalPrice || product.compare_price || 0);
        const originalPrice = rawMrp > price ? rawMrp : 0;
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
    const cacheKey = `anika_profile_synced_${user.id}`;
    const currentHash = `${user.email}|${cleanName || ''}`;

    try {
      if (sessionStorage.getItem(cacheKey) === currentHash) {
        return; // Profile already synced in this session
      }
    } catch {}

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
    } else {
      try {
        sessionStorage.setItem(cacheKey, currentHash);
      } catch {}
    }
  },
}));