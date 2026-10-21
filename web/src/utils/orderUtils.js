/**
 * Shared list of order statuses excluded from valid customer order counts.
 * Only orders that are paid/confirmed and not cancelled, refunded, returned, pending, or failed are counted.
 */
export const EXCLUDED_ORDER_COUNT_STATUSES = [
  'cancelled',
  'canceled',
  'pending',
  'refunded',
  'refund completed',
  'partially refunded',
  'returned',
  'return',
  'failed',
  'payment failed',
  'refund failed',
];

/**
 * Checks whether an order is a valid, paid, non-cancelled customer order.
 * @param {object} order 
 * @returns {boolean}
 */
export function isCountableCustomerOrder(order) {
  if (!order) return false;
  const status = (order.status || '').toLowerCase().trim();
  if (EXCLUDED_ORDER_COUNT_STATUSES.includes(status)) {
    return false;
  }
  const payment = (order.payment || '').toLowerCase().trim();
  if (['failed', 'payment failed', 'unpaid'].includes(payment)) {
    return false;
  }
  return true;
}

/**
 * Resolves a group key for a customer order.
 * - Group by user_id first (registered users).
 * - Phone/email matching is used ONLY for orders with a null / missing user_id (guest checkouts).
 * - A user_id order is NEVER merged into a different user's group or guest group via phone/email.
 * 
 * @param {object} order 
 * @returns {string|null}
 */
export function getOrderCustomerKey(order) {
  if (!order) return null;
  const userId = order.user_id || order.customer?.id;
  if (userId) {
    return `user:${userId}`;
  }

  // Guest checkout (null / missing user_id): group strictly among guest orders
  const phone = order.phone || order.phone_number || order.customer?.phone || order.shipping_address?.phone || order.address?.phone_number;
  if (phone && phone !== 'N/A' && phone !== 'No phone set') {
    const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
    if (cleanPhone.length >= 10) {
      return `guest:phone:${cleanPhone}`;
    }
  }

  const email = order.email || order.customer?.email;
  if (email && email !== 'N/A' && typeof email === 'string' && email.includes('@')) {
    return `guest:email:${email.toLowerCase().trim()}`;
  }

  return `guest:order:${order.id || Math.random()}`;
}

/**
 * Formats a customer order count for UI badges.
 * - 1 -> "1st order"
 * - N (> 1) -> "N orders"
 * - 0 -> "0 orders"
 * 
 * @param {number} count 
 * @returns {string}
 */
export function formatCustomerOrderCount(count) {
  const n = Number(count) || 0;
  if (n === 1) {
    return '1st order';
  }
  return `${n} orders`;
}

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

  // Exclude cancelled, returned, and refund completed / refunded
  if (['cancelled', 'canceled', 'returned', 'return', 'refund completed', 'refunded'].includes(s)) {
    return false;
  }

  return true;
}

