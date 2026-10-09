/**
 * Helper to determine if an order contributes to revenue and active store totals.
 * Excludes cancelled, returned, and refund completed orders.
 * Orders with delivery_status = 'Pickup Cancelled' (carrier pickup cancelled)
 * still count towards revenue as long as their store order status is active.
 *
 * @param {object} order
 * @returns {boolean}
 */
export function isRevenueOrder(order) {
  if (!order) return false;
  const s = (order.status || '').toLowerCase().trim();

  // Exclude cancelled, returned, and refund completed
  if (['cancelled', 'canceled', 'returned', 'return', 'refund completed'].includes(s)) {
    return false;
  }

  return true;
}
