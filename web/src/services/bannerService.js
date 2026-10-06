import { supabase } from '../lib/supabase';
import { compressImage } from '../utils/imageCompression';

export const MAX_BANNER_BYTES = 6 * 1024 * 1024; // 6MB threshold

/**
 * Prepares banner file for upload.
 * If file size <= 6MB, returns original file as-is without any canvas re-encoding or loss of clarity.
 * If file > 6MB, compresses gently down to 4MB max at 2560px with 0.9 quality.
 * @param {File} file 
 * @returns {Promise<File|Blob>}
 */
export async function prepareBanner(file) {
  if (!file) return file;
  if (file.size <= MAX_BANNER_BYTES) {
    return file; // upload as-is to preserve 100% original quality
  }

  // only compress genuinely huge files (> 6MB)
  return await compressImage(file, 'banner');
}

export const bannerService = {
  /**
   * Fetch all banners from Supabase banners table
   * @returns {Promise<any[]>}
   */
  async getBanners() {
    try {
      const { data, error } = await supabase
        .from('banners')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching banners:', error);
        return [];
      }
      return (data || []).map((b) => ({
        ...b,
        id: b.id ?? b.banner_id ?? b._id,
      }));
    } catch (err) {
      console.error('Unexpected error fetching banners:', err);
      return [];
    }
  },

  /**
   * Upload image file to Cloudflare R2 under banners/ folder.
   * Files <= 6MB are uploaded as-is with original clarity.
   * Files > 6MB are compressed to max 4MB.
   * @param {File} file 
   * @returns {Promise<{ filePath: string, publicUrl: string }>}
   */
  async uploadBannerImage(file) {
    // 1. Prepare banner (upload as-is if <= 6MB; gentle compress only if > 6MB)
    const fileToUpload = await prepareBanner(file);

    const cleanName = (fileToUpload.name || file.name || 'banner').replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `banners/${Date.now()}-${cleanName}`;

    const formData = new FormData();
    formData.append('file', fileToUpload);
    formData.append('filePath', filePath);
    formData.append('cacheControl', '31536000');

    const { data, error } = await supabase.functions.invoke('upload-image', {
      body: formData,
    });

    if (error) {
      console.error('Cloudflare image upload error:', error);
      throw error;
    }

    const publicUrl = `${import.meta.env.VITE_R2_PUBLIC_URL}/${filePath}`;
    return { filePath, publicUrl, data };
  },

  /**
   * Create banner record in Supabase banners table
   * @param {Object} bannerData 
   * @returns {Promise<any>}
   */
  async createBanner({ title, description, imageUrl, mobileUrl }) {
    const record = {
      title: title || '',
      description: description || '',
      image_url: imageUrl || '',
      mobile_url: mobileUrl || null,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('banners')
      .insert([record])
      .select();

    if (error) {
      console.error('Error creating banner in Supabase:', error);
      if (error.code === '42501' || error.message?.includes('row-level security')) {
        throw new Error('Supabase RLS Policy Error: Please run the SQL policy setup in your Supabase SQL Editor to allow banner inserts.');
      }
      throw error;
    }
    const created = data?.[0] || record;
    return { ...created, id: created.id ?? created.banner_id };
  },

  /**
   * Update banner record in Supabase banners table
   * @param {string|number} id 
   * @param {Object} bannerData 
   * @returns {Promise<any>}
   */
  async updateBanner(id, { title, description, imageUrl, mobileUrl }) {
    const updates = {
      title: title || '',
      description: description || '',
      updated_at: new Date().toISOString(),
    };
    if (imageUrl !== undefined) {
      updates.image_url = imageUrl || '';
    }
    if (mobileUrl !== undefined) {
      updates.mobile_url = mobileUrl || null;
    }

    // Try updating using 'banner_id' column first
    let { data, error } = await supabase
      .from('banners')
      .update(updates)
      .eq('banner_id', id)
      .select();

    // Fallback to 'id' column if 'banner_id' column matches 0 rows or errors
    if ((error && error.message?.includes("'banner_id'")) || (!error && (!data || data.length === 0))) {
      const res = await supabase
        .from('banners')
        .update(updates)
        .eq('id', id)
        .select();

      if (!res.error && res.data && res.data.length > 0) {
        data = res.data;
        error = null;
      }
    }

    if (error) {
      console.error('Error updating banner in Supabase:', error);
      if (error.code === '42501' || error.message?.includes('row-level security')) {
        throw new Error('Supabase RLS Policy Error: Please run the SQL policy setup in your Supabase SQL Editor to allow banner updates.');
      }
      throw error;
    }

    const updated = data?.[0] || { banner_id: id, id, ...updates };
    return { ...updated, id: updated.banner_id ?? updated.id ?? id };
  },

  /**
   * Delete image file from Cloudflare R2 via upload-image edge function
   * @param {string} url 
   */
  async deleteCloudflareImage(url) {
    if (!url || typeof url !== 'string') return;
    
    // Extract relative filePath (e.g. banners/1788932483503-HomeImage.webp)
    let filePath = null;
    const match = url.match(/banners\/[^?#]+/);
    if (match) {
      filePath = match[0];
    } else {
      try {
        const parsed = new URL(url);
        filePath = parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname;
      } catch (e) {
        filePath = null;
      }
    }

    if (!filePath) return;

    try {
      await supabase.functions.invoke('upload-image', {
        method: 'DELETE',
        body: { filePath },
      });
    } catch (err) {
      console.warn('Failed to delete image from Cloudflare R2:', filePath, err);
    }
  },

  /**
   * Delete banner record from Supabase banners table and remove images from Cloudflare R2
   * @param {string|number} id 
   * @returns {Promise<boolean>}
   */
  async deleteBanner(id) {
    // 1. Retrieve existing banner to get image_url and mobile_url before deletion
    let { data: existingBanners } = await supabase
      .from('banners')
      .select('*')
      .eq('banner_id', id);

    if (!existingBanners || existingBanners.length === 0) {
      const res = await supabase
        .from('banners')
        .select('*')
        .eq('id', id);
      existingBanners = res.data;
    }

    const bannerToDelete = existingBanners?.[0];

    // 2. Delete banner record from Supabase table
    let { error } = await supabase
      .from('banners')
      .delete()
      .eq('banner_id', id);

    if (error && error.message?.includes("'banner_id'")) {
      const res = await supabase
        .from('banners')
        .delete()
        .eq('id', id);
      error = res.error;
    }

    if (error) {
      console.error('Error deleting banner from Supabase:', error);
      if (error.code === '42501' || error.message?.includes('row-level security')) {
        throw new Error('Supabase RLS Policy Error: Please run the SQL policy setup in your Supabase SQL Editor to allow banner deletion.');
      }
      throw error;
    }

    // 3. Delete associated desktop and mobile images from Cloudflare R2 bucket
    if (bannerToDelete) {
      if (bannerToDelete.image_url) {
        await this.deleteCloudflareImage(bannerToDelete.image_url);
      }
      if (bannerToDelete.mobile_url) {
        await this.deleteCloudflareImage(bannerToDelete.mobile_url);
      }
    }

    return true;
  }
};
