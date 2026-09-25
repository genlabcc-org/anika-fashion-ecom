import { supabase } from '../lib/supabase';

const invoke = async (action, payload) => {
  const { data, error } = await supabase.functions.invoke('icarry', { body: { action, payload } });
  if (error) throw error;
  return data;
};

export const icarryService = {
  checkPincode: (pincode) => invoke('pincode', { pincode: String(pincode) }),
  track:        (orderId) => invoke('track', { orderId }),
  label:        (orderId) => invoke('label', { orderId }),
  cancel:       (orderId) => invoke('cancel', { orderId }),
  retryBooking: (orderId) => invoke('retryBooking', { orderId }),
};
