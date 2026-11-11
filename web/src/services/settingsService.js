import { supabase } from '../lib/supabase';

const KEY_SHOW_OUT_OF_STOCK = 'show_out_of_stock';
const LS_KEY_SHOW_OUT_OF_STOCK = 'anika_show_out_of_stock';

export const settingsService = {
  /**
   * Synchronously reads the cached show_out_of_stock setting from localStorage.
   * Defaults to true so out-of-stock products display by default as requested.
   * @returns {boolean}
   */
  getShowOutOfStockSync() {
    try {
      const stored = localStorage.getItem(LS_KEY_SHOW_OUT_OF_STOCK);
      if (stored === null || stored === undefined) return true;
      return stored === 'true' || stored === true;
    } catch {
      return true;
    }
  },

  /**
   * Retrieves the show_out_of_stock setting from Supabase store_settings table,
   * falling back to the local cache if the table does not exist or network is offline.
   * @returns {Promise<boolean>}
   */
  async getShowOutOfStock() {
    const cached = this.getShowOutOfStockSync();
    try {
      const { data, error } = await supabase
        .from('store_settings')
        .select('value')
        .eq('key', KEY_SHOW_OUT_OF_STOCK)
        .maybeSingle();

      if (!error && data && data.value !== undefined && data.value !== null) {
        const val = typeof data.value === 'boolean' ? data.value : String(data.value) === 'true';
        try {
          localStorage.setItem(LS_KEY_SHOW_OUT_OF_STOCK, String(val));
        } catch { }
        return val;
      }
    } catch (e) {
      console.warn('Could not fetch store setting from database (using cache):', e);
    }
    return cached;
  },

  /**
   * Persists the show_out_of_stock setting to localStorage and Supabase store_settings.
   * @param {boolean} value
   * @returns {Promise<boolean>}
   */
  async setShowOutOfStock(value) {
    const boolVal = Boolean(value);

    // 1. Immediately update localStorage for instant reactivity
    try {
      localStorage.setItem(LS_KEY_SHOW_OUT_OF_STOCK, String(boolVal));
    } catch { }

    // 2. Broadcast local event for open components/tabs
    try {
      window.dispatchEvent(
        new CustomEvent('anika_setting_changed', {
          detail: { key: KEY_SHOW_OUT_OF_STOCK, value: boolVal },
        })
      );
    } catch { }

    // 3. Persist to Supabase store_settings table
    try {
      const { error } = await supabase
        .from('store_settings')
        .upsert(
          {
            key: KEY_SHOW_OUT_OF_STOCK,
            value: boolVal,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'key' }
        );

      if (error) {
        console.warn('Store setting upsert note (persisted locally):', error.message || error);
      }
    } catch (dbErr) {
      console.warn('Failed to upsert store setting to Supabase:', dbErr);
    }

    return boolVal;
  },
};

