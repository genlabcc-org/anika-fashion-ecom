import { supabase } from '../lib/supabase';

const COLS = 'id, platform, code, url, title, thumbnail_url, is_active, created_at';

export const videoService = {
  /** Home page: newest active videos (RLS already hides inactive ones) */
  async getLatest(limit = 8, platform = null) {
    let q = supabase
      .from('social_videos')
      .select('id, platform, code, title, thumbnail_url')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (platform) q = q.eq('platform', platform);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  /** Admin list: everything, including hidden */
  async getAll() {
    const { data, error } = await supabase
      .from('social_videos')
      .select(COLS)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async add({ platform = 'youtube', code, url, title = '' }) {
    if (!code) throw new Error('Video code is required');
    const { data, error } = await supabase
      .from('social_videos')
      .insert([{ platform, code, url, title: title || null }])
      .select(COLS)
      .single();
    if (error) throw error; // 23505 = already added (unique platform+code)
    return data;
  },

  async setActive(id, is_active) {
    const { error } = await supabase
      .from('social_videos')
      .update({ is_active })
      .eq('id', id);
    if (error) throw error;
  },

  async remove(id) {
    const { error } = await supabase
      .from('social_videos')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};