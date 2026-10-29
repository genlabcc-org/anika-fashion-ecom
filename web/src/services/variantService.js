import { supabase } from '../lib/supabase';
import { compressImage } from '../utils/imageCompression';

// ── SKU generation ──────────────────────────────────────────
const generateBaseSku = (productName) => {
  const words = productName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'PRD';

  const initials = words
    .slice(0, -1)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  const lastWordPart = words[words.length - 1].slice(0, 3).toUpperCase();

  return (initials + lastWordPart).slice(0, 8) || 'PRD';
};

const generateVariantSku = (baseSku, index) => `${baseSku}-V${index + 1}`;

export const variantService = {
  /**
   * Creates a base product plus all its variants in one flow.
   */
  async createProductWithVariants(productData, variants) {
    const payload = { ...productData, has_variants: true };
    if (payload.category_ids !== undefined && payload.category_ids !== null) {
      if (Array.isArray(payload.category_ids)) {
        payload.category_ids = payload.category_ids.map(Number).filter(n => !isNaN(n) && n > 0);
      }
    } else if (payload.category_id) {
      payload.category_ids = [Number(payload.category_id)];
    }

    const { data: product, error: productError } = await supabase
      .from('products')
      .insert([payload])
      .select()
      .single();
    if (productError) throw productError;


    const baseSku = product.sku?.trim() || generateBaseSku(product.name);

    const variantRows = [];
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const imageUrls = await this._uploadVariantImages(v.media, product.name);

      variantRows.push({
        product_id: product.product_id,
        sku: v.sku?.trim() || generateVariantSku(baseSku, i),
        size: v.sizeDimension || null,
        color: v.color || null,
        price: parseFloat(v.sellingPrice) || 0,
        compare_price: parseFloat(v.price) || null,
        stock: parseInt(v.stockQuantity) || 0,
        stock_alert: parseInt(v.minStockAlert) || null,
        images: imageUrls,
        is_active: true,
      });
    }

    const { data: insertedVariants, error: variantError } = await supabase
      .from('product_variants')
      .insert(variantRows)
      .select();

    if (variantError) {
      await supabase.from('products').delete().eq('product_id', product.product_id);
      throw variantError;
    }

    // ── Sync base product images from the first variant that has any ──
    const firstWithImages = insertedVariants.find(v => v.images?.length > 0);
    if (firstWithImages) {
      const { data: updatedProduct, error: syncError } = await supabase
        .from('products')
        .update({ images: firstWithImages.images, image_url: firstWithImages.images[0] })
        .eq('product_id', product.product_id)
        .select()
        .single();
      if (!syncError && updatedProduct) {
        return { product: updatedProduct, variants: insertedVariants };
      }
    }

    return { product, variants: insertedVariants };
  },

  /**
   * Fetches a product plus its variants — for the edit form.
   */
  async getProductWithVariants(productId) {
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('product_id', productId)
      .single();
    if (productError) throw productError;

    const variants = await this.getVariantsByProductId(productId);
    return { product, variants };
  },

  /**
   * Updates an existing product plus its variants (create/update/delete in one call).
   */
  async updateProductWithVariants(productId, productData, variants, deletedVariantIds = []) {
    const payload = { ...productData };
    if (payload.category_ids !== undefined && payload.category_ids !== null) {
      if (Array.isArray(payload.category_ids)) {
        payload.category_ids = payload.category_ids.map(Number).filter(n => !isNaN(n) && n > 0);
      }
    } else if (payload.category_id) {
      payload.category_ids = [Number(payload.category_id)];
    }

    const { data: product, error: productError } = await supabase
      .from('products')
      .update(payload)
      .eq('product_id', productId)
      .select()
      .single();
    if (productError) throw productError;


    if (deletedVariantIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('product_variants')
        .delete()
        .in('variant_id', deletedVariantIds);
      if (deleteError) throw deleteError;
    }

    const baseSku = product.sku?.trim() || generateBaseSku(product.name);
    const existingVariantUpdates = [];
    const newVariantRows = [];

    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const imageUrls = v.media?.length
        ? await this._uploadVariantImages(v.media, product.name)
        : (v.images || []);

      const rowData = {
        sku: v.sku?.trim() || generateVariantSku(baseSku, i),
        size: v.sizeDimension || null,
        color: v.color || null,
        price: parseFloat(v.sellingPrice) || 0,
        compare_price: parseFloat(v.price) || null,
        stock: parseInt(v.stockQuantity) || 0,
        stock_alert: parseInt(v.minStockAlert) || null,
        images: imageUrls,
        is_active: true,
      };

      if (v.variant_id) {
        existingVariantUpdates.push({ variant_id: v.variant_id, data: rowData });
      } else {
        newVariantRows.push({
          product_id: productId,
          ...rowData,
        });
      }
    }

    const savedVariants = [];

    // 1. Update existing variants individually (avoids non-DEFAULT identity INSERT error)
    if (existingVariantUpdates.length > 0) {
      const updatedResults = await Promise.all(
        existingVariantUpdates.map(async ({ variant_id, data }) => {
          const { data: updated, error } = await supabase
            .from('product_variants')
            .update(data)
            .eq('variant_id', variant_id)
            .select()
            .single();
          if (error) throw error;
          return updated;
        })
      );
      savedVariants.push(...updatedResults);
    }

    // 2. Insert newly added variants (omit variant_id so DB automatically generates it)
    if (newVariantRows.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from('product_variants')
        .insert(newVariantRows)
        .select();
      if (insertError) throw insertError;
      if (inserted) savedVariants.push(...inserted);
    }

    // ── Keep base product images in sync on edit too ──
    const firstWithImages = savedVariants.find(v => v.images?.length > 0);
    if (firstWithImages) {
      const { data: updatedProduct, error: syncError } = await supabase
        .from('products')
        .update({ images: firstWithImages.images, image_url: firstWithImages.images[0] })
        .eq('product_id', productId)
        .select()
        .single();
      if (!syncError && updatedProduct) {
        return { product: updatedProduct, variants: savedVariants };
      }
    }

    return { product, variants: savedVariants };
  },

  /**
   * Retrieves all active variants for a product.
   */
  async getVariantsByProductId(productId) {
    const { data, error } = await supabase
      .from('product_variants')
      .select('*')
      .eq('product_id', productId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async updateVariant(variantId, variantData) {
    const { variant_id, ...cleanData } = variantData || {};
    const { data, error } = await supabase
      .from('product_variants')
      .update(cleanData)
      .eq('variant_id', variantId)
      .select();
    if (error) throw error;
    return data;
  },

  async deleteVariant(variantId) {
    const { error } = await supabase
      .from('product_variants')
      .delete()
      .eq('variant_id', variantId);
    if (error) throw error;
  },

  async _uploadVariantImages(mediaItems, productName) {
    if (!mediaItems || mediaItems.length === 0) return [];
    const urls = [];
    for (const item of mediaItems) {
      const compressedFile = await compressImage(item.file, 'variant');

      const fileExt = compressedFile.name?.split('.').pop() || 'webp';
      const fileName = `${productName.replace(/\s+/g, '-').toLowerCase()}-variant-${Date.now()}.${fileExt}`;
      const filePath = `products/variants/${fileName}`;

      const formData = new FormData();
      formData.append('file', item.file);
      formData.append('filePath', filePath);
      formData.append('cacheControl', '31536000');

      const { data, error } = await supabase.functions.invoke('upload-image', {
        body: formData,
      });

      if (error) throw error;
      urls.push(data.publicUrl);
      // const { error } = await supabase.storage.from('product_img').upload(filePath, item.file, {
      //   cacheControl: '31536000',
      //   upsert: false,
      // });
      // if (error) throw error;

      // const { data } = supabase.storage.from('product_img').getPublicUrl(filePath);
      // urls.push(data.publicUrl);
    }
    return urls;
  },
};