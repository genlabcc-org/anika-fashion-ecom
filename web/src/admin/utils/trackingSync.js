/**
 * Tracking sync eligibility utilities for iCarry shipments.
 */

export const isTerminalOrder = (order) => {
  if (!order) return false;
  const s = (order.status || '').toLowerCase();
  const d = (order.delivery_status || '').toLowerCase();
  const terminalTerms = ['delivered', 'cancelled', 'canceled', 'refund completed'];
  return (
    terminalTerms.some((t) => s.includes(t)) &&
    terminalTerms.some((t) => d.includes(t))
  );
};

export const isExternalCourierOrder = (order) => {
  if (!order) return false;
  if (order.fulfillment_type === 'manual') return true;
  return /st courier|manual|dtdc|local|porter/i.test(order.courier_name || '');
};

export const isSyncableOrder = (order) => {
  if (!order || !order.id) return false;
  const hasTrackingId = Boolean(order.waybill || order.shipment_id);
  if (!hasTrackingId) return false;
  if (order.fulfillment_type === 'manual') return false;
  if (/st courier|manual|dtdc|local|porter/i.test(order.courier_name || '')) return false;
  if (isTerminalOrder(order)) return false;
  return true;
};
