import { supabase } from '../lib/supabase';

export const normState = (s) =>
  String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');

export const shippingService = {
  async getRates() {
    const { data, error } = await supabase
      .from('shipping_rates')
      .select('state, fee, free_above')
      .eq('is_active', true);
    if (error) throw error;
    return data || [];
  },

  calcFee(rates, state, amount) {
    const row =
      rates.find(r => normState(r.state) === normState(state)) ||
      rates.find(r => r.state === '__default__');
    if (!row) return 0;
    if (row.free_above != null && amount >= Number(row.free_above)) return 0;
    return Number(row.fee) || 0;
  },

  // { state, district } = ok | null = invalid pincode | undefined = lookup failed (don't block)
  async lookupPincode(pin) {
    if (!/^[1-9]\d{5}$/.test(pin)) return null;
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
      const json = await res.json();
      const po = json?.[0]?.PostOffice?.[0];
      return json?.[0]?.Status === 'Success' && po
        ? { state: po.State, district: po.District }
        : null;
    } catch {
      return undefined;
    }
  },
};
