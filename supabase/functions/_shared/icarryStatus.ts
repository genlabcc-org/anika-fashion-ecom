// supabase/functions/_shared/icarryStatus.ts

/**
 * iCarry Status Mapping (API documentation p. 34)
 * Rank 1: Pre-transit / booking / manifest
 * Rank 2: In-transit / active delivery
 * Rank 3: Terminal states (Delivered, Canceled, Voided, Returned, Lost, Damaged)
 */
export const STATUS_MAP: Record<number, { name: string; rank: number }> = {
  1:  { name: "Pending Pickup", rank: 1 },
  2:  { name: "Processing", rank: 1 },
  3:  { name: "Shipped", rank: 2 },
  7:  { name: "Canceled", rank: 3 },
  12: { name: "Damaged", rank: 3 },
  14: { name: "Lost", rank: 3 },
  16: { name: "Voided", rank: 3 },
  21: { name: "Delivered", rank: 3 },
  22: { name: "In Transit", rank: 2 },
  23: { name: "Returned to Origin", rank: 3 },
  24: { name: "Manifested", rank: 1 },
  25: { name: "Pickup Scheduled", rank: 1 },
  26: { name: "Out For Delivery", rank: 2 },
  27: { name: "Pending Return", rank: 2 },
};

/**
 * Helper to determine status rank from status text string.
 * CRITICAL: Checks "pending return" FIRST and returns 2 before checking includes("return")!
 */
export function getStatusRank(statusText: string | null | undefined): number {
  if (!statusText) return 0;
  const s = statusText.toLowerCase().trim();

  // 1. Check "pending return" FIRST (returns 2, in transit return)
  if (s === "pending return" || s.startsWith("pending return")) {
    return 2;
  }

  // 2. Rank 3: Terminal states
  if (
    s.includes("delivered") ||
    s.includes("cancel") ||
    s === "voided" ||
    s.includes("return") ||
    s.includes("rto") ||
    s === "lost" ||
    s === "damaged"
  ) {
    return 3;
  }

  // 3. Rank 2: In-transit / active delivery
  if (
    s.includes("picked up") ||
    s === "shipped" ||
    s.includes("in transit") ||
    s.includes("out for delivery") ||
    s === "dispatched"
  ) {
    return 2;
  }

  // 4. Rank 1: Pre-transit / booking / manifest
  if (
    s === "booked" ||
    s.includes("manifest") ||
    s.includes("pickup scheduled") ||
    s.includes("pending pickup") ||
    s.includes("processing")
  ) {
    return 1;
  }

  return 0;
}

/**
 * Constant-time string comparison using SHA-256 digests.
 * Prevents timing attacks regardless of string length.
 */
export async function timingSafeEqualStr(a: string, b: string): Promise<boolean> {
  if (!a || !b) return false;
  const encoder = new TextEncoder();
  const aHash = await crypto.subtle.digest("SHA-256", encoder.encode(a));
  const bHash = await crypto.subtle.digest("SHA-256", encoder.encode(b));
  return crypto.subtle.timingSafeEqual(new Uint8Array(aHash), new Uint8Array(bHash));
}

/**
 * Parses carrier date string into ISO string with timezone.
 * Returns null for empty / invalid date values.
 * If the string has no timezone indicator, treats it as Asia/Kolkata (+05:30).
 */
export function parseCarrierDate(v: any): string | null {
  if (v === null || v === undefined) return null;
  const str = String(v).trim();
  if (!str) return null;

  try {
    // Check if DD/MM/YYYY format e.g. "23/01/2025"
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
      const [dd, mm, yyyy] = str.split("/");
      const isoCandidate = `${yyyy}-${mm}-${dd}T00:00:00+05:30`;
      const d = new Date(isoCandidate);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }

    // Check if timezone indicator is already present at the end
    // E.g. 'Z', '+05:30', '+0530', '-04:00'
    const hasTz = /Z|[+-]\d{2}(?::?\d{2})?$/i.test(str);
    const dateInput = hasTz ? str : `${str}+05:30`;

    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

export interface OrderState {
  id: string;
  status?: string | null;
  delivery_status?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
}

export interface TransitionResult {
  shouldUpdate: boolean;
  reason?: string;
  updates?: Record<string, any>;
  warning?: string;
}

/**
 * Computes database updates following strict business transition rules:
 * - shipped_at (if null): set when newRank === 2, or when delivered.
 * - orders.status = "Shipped" only when newRank === 2 and current status is
 *   not Shipped/Delivered/Cancelled/Refund Completed/Returned.
 * - "Delivered" on code 21; "Cancelled" on codes 7 and 16.
 * - Lost (14), Damaged (12), Returned to Origin (23): update delivery_status only,
 *   leave orders.status unchanged, and log a console warning.
 * - Never set shipped_at for Cancelled/Lost/Damaged/Returned.
 */
export function calculateOrderTransition(
  order: OrderState,
  rawStatus: any,
  carrierDatePicked?: any,
  carrierDateDelivered?: any
): TransitionResult {
  const numCode = Number(rawStatus);
  const isKnownCode = Number.isInteger(numCode) && numCode in STATUS_MAP;

  let newDeliveryStatus: string;
  let newRank: number;

  if (isKnownCode) {
    const mapped = STATUS_MAP[numCode];
    newDeliveryStatus = mapped.name;
    newRank = mapped.rank;
  } else {
    newDeliveryStatus = String(rawStatus ?? "").trim() || "Unknown";
    newRank = getStatusRank(newDeliveryStatus);
  }

  const currentStatusLower = (order.status || "").trim().toLowerCase();
  const currentDeliveryLower = (order.delivery_status || "").trim().toLowerCase();

  const currentRank = Math.max(
    getStatusRank(order.delivery_status),
    getStatusRank(order.status)
  );

  // Terminal states (Delivered, Cancelled, Returned, Lost, Damaged, Voided) are never overwritten
  const isCurrentTerminal =
    currentRank === 3 ||
    ["delivered", "cancelled", "canceled", "returned", "rto", "lost", "damaged", "refund completed", "voided"].some(t =>
      currentStatusLower.includes(t) || currentDeliveryLower.includes(t)
    );

  if (isCurrentTerminal) {
    return {
      shouldUpdate: false,
      reason: `Order is in terminal state (status="${order.status}", delivery="${order.delivery_status}"). Preserving terminal state; ignoring "${newDeliveryStatus}".`,
    };
  }

  // Prevent rank regression
  if (newRank < currentRank) {
    return {
      shouldUpdate: false,
      reason: `Preventing rank regression: current rank ${currentRank} ("${order.delivery_status}") -> incoming rank ${newRank} ("${newDeliveryStatus}"). Update skipped.`,
    };
  }

  const updates: Record<string, any> = {
    delivery_status: newDeliveryStatus,
  };

  let warning: string | undefined;

  // Unknown status code warning
  if (!isKnownCode) {
    warning = `Unknown status code "${rawStatus}" received for order ${order.id}. Storing raw status.`;
  }

  const isSpecialTerminalException = numCode === 14 || numCode === 12 || numCode === 23;
  const isCancelCode = numCode === 7 || numCode === 16;
  const isDeliveredCode = numCode === 21 || newDeliveryStatus.toLowerCase() === "delivered";

  // 1. Lost (14), Damaged (12), Returned to Origin (23):
  // Update delivery_status only, leave orders.status unchanged, log console warning
  if (isSpecialTerminalException) {
    warning = `Order ${order.id} flagged with exception: "${newDeliveryStatus}" (code ${numCode}). Updating delivery_status only; orders.status remains "${order.status}".`;
    // Do not set shipped_at or orders.status
    return { shouldUpdate: true, updates, warning };
  }

  // 2. Cancelled on codes 7 and 16:
  // Never set shipped_at for Cancelled
  if (isCancelCode) {
    if (currentStatusLower !== "refund completed") {
      updates.status = "Cancelled";
    }
    return { shouldUpdate: true, updates, warning };
  }

  // 3. Delivered on code 21:
  // shipped_at (if null) is set when delivered.
  // delivered_at is set.
  if (isDeliveredCode) {
    if (!order.delivered_at) {
      updates.delivered_at = parseCarrierDate(carrierDateDelivered) || new Date().toISOString();
    }
    if (!order.shipped_at) {
      updates.shipped_at = parseCarrierDate(carrierDatePicked) || updates.delivered_at || new Date().toISOString();
    }
    if (currentStatusLower !== "refund completed" && !currentStatusLower.includes("cancel")) {
      updates.status = "Delivered";
    }
    return { shouldUpdate: true, updates, warning };
  }

  // 4. In-Transit (newRank === 2):
  // shipped_at (if null): set when newRank === 2
  // orders.status = "Shipped" only when newRank === 2 and current status is not Shipped/Delivered/Cancelled/Refund Completed/Returned
  if (newRank === 2) {
    if (!order.shipped_at) {
      updates.shipped_at = parseCarrierDate(carrierDatePicked) || new Date().toISOString();
    }
    const isProtectedStatus = ["shipped", "delivered", "cancelled", "canceled", "refund completed", "returned", "rto"].some(s =>
      currentStatusLower.includes(s)
    );
    if (!isProtectedStatus) {
      updates.status = "Shipped";
    }
  }

  return { shouldUpdate: true, updates, warning };
}
