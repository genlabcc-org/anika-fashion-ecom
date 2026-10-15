import { supabase } from '../lib/supabase';

export const normState = (s) =>
  String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');

export const DEFAULT_STATE_KEY = '__default__';

export const INDIAN_STATES = [
  "Andaman & Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra & Nagar Haveli and Daman & Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu & Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal"
];

export const shippingService = {
  // Public/Checkout rate fetching (only active rates)
  async getRates() {
    const { data, error } = await supabase
      .from('shipping_rates')
      .select('state, fee, free_above')
      .eq('is_active', true);
    if (error) throw error;
    return data || [];
  },

  // Admin rate fetching (all configured rates)
  async getAllAdminRates() {
    const { data, error } = await supabase
      .from('shipping_rates')
      .select('*')
      .order('state', { ascending: true });
    if (error) throw error;

    // Put __default__ at the top if present
    const sorted = [...(data || [])].sort((a, b) => {
      if (a.state === DEFAULT_STATE_KEY) return -1;
      if (b.state === DEFAULT_STATE_KEY) return 1;
      return a.state.localeCompare(b.state);
    });
    return sorted;
  },

  // Add a new shipping rate row
  async addRate({ state, fee, free_above, is_active = true }) {
    const trimmedState = String(state || '').trim();
    if (!trimmedState) throw new Error("State or region name is required.");

    const payload = {
      state: trimmedState,
      fee: Math.max(0, Number(fee) || 0),
      free_above: free_above !== '' && free_above !== null && !isNaN(Number(free_above)) && Number(free_above) > 0 ? Number(free_above) : null,
      is_active: Boolean(is_active),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('shipping_rates')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Update an existing shipping rate row
  async updateRate(originalState, { state, fee, free_above, is_active }) {
    const payload = {
      fee: Math.max(0, Number(fee) || 0),
      free_above: free_above !== '' && free_above !== null && !isNaN(Number(free_above)) && Number(free_above) > 0 ? Number(free_above) : null,
      is_active: Boolean(is_active),
      updated_at: new Date().toISOString()
    };
    if (state && state.trim() !== originalState) {
      payload.state = state.trim();
    }

    const { data, error } = await supabase
      .from('shipping_rates')
      .update(payload)
      .eq('state', originalState)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Delete a shipping rate
  async deleteRate(state) {
    const { error } = await supabase
      .from('shipping_rates')
      .delete()
      .eq('state', state);

    if (error) throw error;
    return true;
  },

  // Toggle active status
  async toggleRateStatus(state, is_active) {
    const { data, error } = await supabase
      .from('shipping_rates')
      .update({
        is_active: Boolean(is_active),
        updated_at: new Date().toISOString()
      })
      .eq('state', state)
      .select()
      .single();

    if (error) throw error;
    return data;
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

