import { supabase } from '../lib/supabase';
import { compressImage } from '../utils/imageCompression';

// const IMAGE_SIZES = {
//   card: { width: 400, height: 400 },
//   detail: { width: 800, height: 800 },
// };

export const productService = {
  /**
   * Retrieves all categories.
   * @returns {Promise<any[]>}
   */
  async getCategories() {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*, subcategories(*), products(count)')
        .order('sort_order', { ascending: true });
      if (!error && data) {
        return data.map(c => ({
          ...c,
          productCount: c.products?.[0]?.count ?? 0,
          subcategories: (c.subcategories || []).filter(s => s.is_active !== false)
        }));
      }
    } catch (e) {
      console.warn('Foreign key subcategories join fallback:', e);
    }

    const { data: cats, error: catErr } = await supabase
      .from('categories')
      .select('*, products(count)')
      .order('sort_order', { ascending: true });
    if (catErr) throw catErr;

    const { data: subs } = await supabase
      .from('subcategories')
      .select('*')
      .order('created_at', { ascending: false });

    const subsByParent = {};
    (subs || []).forEach(s => {
      if (s.parent_id) {
        if (!subsByParent[s.parent_id]) subsByParent[s.parent_id] = [];
        subsByParent[s.parent_id].push(s);
      }
    });

    return (cats || []).map(c => ({
      ...c,
      productCount: c.products?.[0]?.count ?? 0,
      subcategories: subsByParent[c.category_id] || subsByParent[c.id] || []
    }));
  },

  getResizedImageUrl(url, sizeKey = 'card', quality = 75) {
    if (!url || typeof url !== 'string') return url;
    let clean = url.replace('/storage/v1/render/image/public/', '/storage/v1/object/public/');
    if (clean.includes('?')) {
      clean = clean.split('?')[0];
    }
    return clean;
  },

  /**
   * Generates next SKU in AF<CAT><0001> format (e.g. AFCLO0003).
   * @param {string} categoryName 
   * @returns {Promise<string>}
   */
  async getNextSku(categoryName) {
    const catCode = (categoryName || 'PRD')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 3)
      .toUpperCase();
    const prefix = `AF${catCode}`;

    try {
      const { data, error } = await supabase
        .from('products')
        .select('sku')
        .ilike('sku', `${prefix}%`);

      if (!error && data && data.length > 0) {
        let maxNum = 0;
        for (const item of data) {
          if (!item.sku) continue;
          const match = item.sku.match(new RegExp(`^${prefix}(\\d+)`, 'i'));
          if (match && match[1]) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxNum) {
              maxNum = num;
            }
          }
        }
        const nextNum = maxNum + 1;
        return `${prefix}${String(nextNum).padStart(4, '0')}`;
      }
      return `${prefix}0001`;
    } catch (e) {
      console.warn('Failed to query existing SKUs:', e);
      return `${prefix}0001`;
    }
  },

  /**
   * Retrieves all products.
   * @returns {Promise<any[]>}
   */
  async getProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('product_id, name, price, compare_price, stock, sku, image_url, images, is_active, has_variants, category_id, subcategory_id, categories(name), subcategories(name), product_variants(variant_id, price, compare_price, stock, sku, color, size, images)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  /**
   * Deletes a product by product_id.
   * @param {string|number} productId 
   * @returns {Promise<void>}
   */
  async deleteProduct(productId) {
    const { data: existing } = await supabase
      .from('products')
      .select('image_url, images, product_variants(images)')
      .eq('product_id', productId)
      .single();

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('product_id', productId);
    if (error) throw error;

    const r2Base = import.meta.env.VITE_R2_PUBLIC_URL;
    const allUrls = [
      ...(existing?.image_url ? [existing.image_url] : []),
      ...(existing?.images || []),
      ...(existing?.product_variants || []).flatMap(v => v.images || []),
    ];

    const r2FilePaths = allUrls
      .filter(url => url?.includes(r2Base))
      .map(url => url.replace(`${r2Base}/`, ''));

    for (const filePath of r2FilePaths) {
      try {
        await this.deleteSubcategoryImageR2(filePath);
      } catch (err) {
        console.warn(`Failed to delete image ${filePath} from R2:`, err);
      }
    }
  },

  /**
   * Deletes a category by category_id.
   * @param {string|number} categoryId 
   * @returns {Promise<void>}
   */
  async deleteCategory(categoryId) {
    const { data: subs, error: subError } = await supabase
      .from('subcategories')
      .select('subcategory_id')
      .eq('parent_id', categoryId);
    if (subError) throw subError;

    if (subs && subs.length) {
      const err = new Error('CATEGORY_HAS_SUBCATEGORIES');
      err.code = 'CATEGORY_HAS_SUBCATEGORIES';
      throw err;
    }

    const { data: existing } = await supabase
      .from('categories')
      .select('image_url')
      .eq('category_id', categoryId)
      .single();

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('category_id', categoryId);
    if (error) throw error;

    const r2Base = import.meta.env.VITE_R2_PUBLIC_URL;
    if (existing?.image_url?.includes(r2Base)) {
      const filePath = existing.image_url.replace(`${r2Base}/`, '');
      try {
        await this.deleteSubcategoryImageR2(filePath);
      } catch (err) {
        console.warn('Failed to delete category image from R2:', err);
      }
    }
  },

  /**
   * Helper to ensure Postgres text[] array columns (colors, sizes, images) are valid arrays.
   */
  formatProductPayload(productData) {
    if (!productData) return {};
    const payload = { ...productData };

    if (payload.colors !== undefined && payload.colors !== null) {
      if (typeof payload.colors === 'string') {
        payload.colors = payload.colors.split(',').map(c => c.trim()).filter(Boolean);
      } else if (!Array.isArray(payload.colors)) {
        payload.colors = [String(payload.colors)];
      }
      if (payload.colors.length === 0) payload.colors = null;
    }

    if (payload.sizes !== undefined && payload.sizes !== null) {
      if (typeof payload.sizes === 'string') {
        payload.sizes = payload.sizes.split(',').map(s => s.trim()).filter(Boolean);
      } else if (!Array.isArray(payload.sizes)) {
        payload.sizes = [String(payload.sizes)];
      }
      if (payload.sizes.length === 0) payload.sizes = null;
    }

    if (payload.images !== undefined && payload.images !== null) {
      if (!Array.isArray(payload.images)) {
        payload.images = [payload.images].filter(Boolean);
      }
    }

    return payload;
  },

  /**
   * Inserts a new product record.
   * @param {object} productData 
   * @returns {Promise<any>}
   */
  async insertProduct(productData) {
    const formatted = this.formatProductPayload(productData);
    const { data, error } = await supabase
      .from('products')
      .insert([formatted])
      .select();
    if (error) throw error;
    return data;
  },

  /**
   * Inserts a new category record.
   * @param {object} categoryData 
   * @returns {Promise<any>}
   */
  async insertCategory(categoryData) {
    const { data, error } = await supabase
      .from('categories')
      .insert([categoryData])
      .select();
    if (error) throw error;
    return data;
  },

  /**
   * Updates an existing category.
   * @param {string|number} categoryId 
   * @param {object} categoryData 
   * @returns {Promise<any>}
   */
  async updateCategory(categoryId, categoryData) {
    const { data, error } = await supabase
      .from('categories')
      .update(categoryData)
      .eq('category_id', categoryId)
      .select();
    if (error) throw error;
    return data;
  },

  /**
   * Updates an existing product.
   * @param {string|number} productId 
   * @param {object} productData 
   * @returns {Promise<any>}
   */
  async updateProduct(productId, productData) {
    const formatted = this.formatProductPayload(productData);
    const { data, error } = await supabase
      .from('products')
      .update(formatted)
      .eq('product_id', productId)
      .select();
    if (error) throw error;
    return data;
  },

  /**
   * Uploads an image file to the product-images storage bucket.
   * @param {string} filePath 
   * @param {File} file 
   * @returns {Promise<any>}
   */
  async uploadProductImage(filePath, file, cacheControl = '31536000') {
    const compressedFile = await compressImage(file, 'detail');

    const formData = new FormData();
    formData.append('file', compressedFile);
    formData.append('filePath', filePath);
    formData.append('cacheControl', cacheControl);

    const { data, error } = await supabase.functions.invoke('upload-image', {
      body: formData,
    });
    if (error) throw error;
    return data;
  },

  /**
   * Resolves the public URL for a product image.
   * @param {string} filePath 
   * @returns {string}
   */
  getProductImagePublicUrl(filePath) {
    return `${import.meta.env.VITE_R2_PUBLIC_URL}/${filePath}`;
  },

  /**
   * Uploads an image file to the category-images storage bucket.
   * @param {string} filePath 
   * @param {File} file 
   * @returns {Promise<any>}
   */
  async uploadCategoryImage(filePath, file, cacheControl = '31536000') {
    const compressedFile = await compressImage(file, 'card');

    const formData = new FormData();
    formData.append('file', compressedFile);
    formData.append('filePath', filePath);
    formData.append('cacheControl', cacheControl);

    const { data, error } = await supabase.functions.invoke('upload-image', {
      body: formData,
    });
    if (error) throw error;
    return data;
  },

  /**
   * Resolves the public URL for a category image.
   * @param {string} filePath 
   * @returns {string}
   */
  getCategoryImagePublicUrl(filePath) {
    return `${import.meta.env.VITE_R2_PUBLIC_URL}/${filePath}`;
  },

  /**
   * Retrieves active products for a specific category name.
   * @param {string} categoryName
   * @returns {Promise<any[]>}
   */
  async getProductsByCategoryName(categoryName) {
    const { data: catData, error: catError } = await supabase
      .from('categories')
      .select('category_id')
      .eq('name', categoryName)
      .eq('is_active', true)
      .maybeSingle();

    if (catError) throw catError;
    if (!catData) return [];

    let queryData = null;
    try {
      const { data, error } = await supabase
        .from('products')
        .select('product_id, name, price, compare_price, stock, image_url, images, sizes, has_variants, subcategory_id, subcategories(name), product_variants(price, compare_price, stock, images)')
        .eq('category_id', catData.category_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (!error && data) {
        queryData = data.map(p => ({
          ...p,
          subcategory: p.subcategories?.name || p.subcategory || null
        }));
      }
    } catch (e) {
      console.warn('Subcategories join fallback in getProductsByCategoryName:', e);
    }

    if (!queryData) {
      const { data, error } = await supabase
        .from('products')
        .select('product_id, name, price, compare_price, stock, image_url, images, sizes, has_variants, subcategory_id, subcategories(name), product_variants(price, compare_price, stock, images)')
        .eq('category_id', catData.category_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const subIds = (data || []).map(p => p.subcategory_id).filter(Boolean);
      let subMap = {};
      if (subIds.length > 0) {
        const { data: subRows } = await supabase
          .from('subcategories')
          .select('subcategory_id, name')
          .in('subcategory_id', subIds);

        (subRows || []).forEach(s => {
          subMap[s.subcategory_id] = s.name;
        });
      }

      queryData = (data || []).map(p => ({
        ...p,
        subcategory: subMap[p.subcategory_id] || p.subcategory || null
      }));
    }

    return queryData;
  },

  /**
   * Retrieves specific products by their IDs (lean columns only).
   * @param {Array<string|number>} productIds
   * @returns {Promise<any[]>}
   */

  async getProductsByIds(productIds) {
    if (!productIds || productIds.length === 0) return [];
    const { data, error } = await supabase
      .from('products')
      .select('product_id, name, price, compare_price, image_url, images, stock, sizes')
      .in('product_id', productIds);
    if (error) throw error;
    return data || [];
  },

  /**
   * Searches active products by name.
   * @param {string} query
   * @param {number} limit
   * @returns {Promise<any[]>}
   */
  async searchProductsByName(query, limit = 5) {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) return [];

    const { data, error } = await supabase
      .from('products')
      .select('*, categories(name)')
      .eq('is_active', true)
      .ilike('name', `%${normalizedQuery}%`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  async uploadSubcategoryImage(filePath, file, cacheControl = '31536000') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('filePath', filePath);
    formData.append('cacheControl', cacheControl);

    const { data, error } = await supabase.functions.invoke('upload-image', {
      body: formData,
    });
    if (error) throw error;
    return data;
  },

  async deleteSubcategoryImageR2(filePath) {
    const { data, error } = await supabase.functions.invoke('upload-image', {
      method: 'DELETE',
      body: { filePath },
    });
    if (error) throw error;
    return data
  },

  getSubcategoryImagePublicUrl(filePath) {
    return `${import.meta.env.VITE_R2_PUBLIC_URL}/${filePath}`;
  },

  /**
  * Retrieves subcategories.
  * @param {number|null} parentId
  * @returns {Promise<any[]>}
  */
  async getSubCategories(parentId = null) {
    let query = supabase
      .from("subcategories")
      .select("subcategory_id, name, image_url, parent_id, is_active")
      .order("created_at", { ascending: false });

    if (parentId !== null && parentId !== undefined) {
      query = query.eq("parent_id", parentId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  /**
   * Creates a subcategory.
   * @param {object} payload
   * @returns {Promise<any>}
   */
  async createSubcategory(payload) {
    const { data, error } = await supabase
      .from("subcategories")
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Updates a subcategory.
   * @param {string} id
   * @param {object} payload
   * @returns {Promise<any>}
   */
  async updateSubcategory(id, payload) {
    const { data, error } = await supabase
      .from("subcategories")
      .update(payload)
      .eq("subcategory_id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Deletes a subcategory.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async deleteSubcategory(id) {
    const { data: existing } = await supabase
      .from("subcategories")
      .select("image_url")
      .eq("subcategory_id", id)
      .single();

    const { error } = await supabase
      .from("subcategories")
      .delete()
      .eq("subcategory_id", id);

    if (error) throw error;

    if (existing?.image_url?.includes(import.meta.env.VITE_R2_PUBLIC_URL)) {
      const filePath = existing.image_url.replace(`${import.meta.env.VITE_R2_PUBLIC_URL}/`, '');
      try {
        await this.deleteSubcategoryImageR2(filePath);
      } catch (err) {
        console.warn('Failed to delete subcategory image from R2:', err);
      }
    }
  },
};
