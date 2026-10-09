// supabase/functions/_shared/icarryStatus.ts

/**
 * iCarry Status Mapping (API documentation p. 34)
 * Rank 1: Pre-transit / booking / manifest
 * Rank 2: In-transit / active delivery
 * Rank 3: Terminal states (Delivered, Canceled, Voided, Returned, Lost, Damaged)
 */
export const STATUS_MAP: Record<number, { name: string; rank: number }> = {
  1: { name: "Pending Pickup", rank: 1 },
  2: { name: "Processing", rank: 1 },
  3: { name: "Shipped", rank: 2 },
  7: { name: "Canceled", rank: 3 },
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

  // 2. Check "pickup cancelled" (returns 1, pre-transit so future sync/webhook updates are not blocked!)
  if (s === "pickup cancelled" || s.startsWith("pickup cancelled")) {
    return 1;
  }

  // 3. Rank 3: Terminal states (exclude pickup cancel)
  if (
    s.includes("delivered") ||
    (s.includes("cancel") && !s.includes("pickup cancel")) ||
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
    s.includes("pickup cancelled") ||
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
  courier_name?: string | null;
  fulfillment_type?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
}

export interface TransitionResult {
  shouldUpdate: boolean;
  reason?: string;
  updates?: Record<string, any>;
  warning?: string;
}

export interface TrackExtractionResult {
  effectiveStatus: string;
  isCancelled: boolean;
  carrierDatePicked?: string | null;
  carrierDateDelivered?: string | null;
}

/**
 * Extracts normalized status from iCarry track response (api_track_shipment)
 * and/or sync item (api_shipment_status_sync).
 * Specifically scans top-level status AND the details history array for cancellation events
 * (e.g. "Seller cancelled the order" or "Shipment Cancelled").
 */
export function extractStatusFromTrackResponse(trackRes: any, syncItem?: any): TrackExtractionResult {
  let effectiveStatus = "";
  let isCancelled = false;
  let carrierDatePicked: string | null = null;
  let carrierDateDelivered: string | null = null;

  // 1. Inspect syncItem if available (from api_shipment_status_sync)
  if (syncItem) {
    const s = String(syncItem.status || "").trim();
    if (s === "7" || s === "16") {
      isCancelled = true;
      effectiveStatus = "Pickup Cancelled";
    } else if (Number(s) in STATUS_MAP) {
      effectiveStatus = STATUS_MAP[Number(s)].name;
    }
    carrierDatePicked = syncItem.date_picked || syncItem["date_picked "] || null;
    carrierDateDelivered = syncItem.date_delivered || null;
  }

  // 2. Inspect trackRes top-level fields
  if (trackRes) {
    const rawStatus = String(trackRes.status || "").trim();
    if (/cancel|void/i.test(rawStatus)) {
      isCancelled = true;
      effectiveStatus = "Pickup Cancelled";
    } else if (!effectiveStatus && rawStatus) {
      effectiveStatus = rawStatus;
    }

    if (!carrierDatePicked && trackRes.picked_datetime) {
      carrierDatePicked = trackRes.picked_datetime;
    }
    if (!carrierDateDelivered && trackRes.delivered_datetime) {
      carrierDateDelivered = trackRes.delivered_datetime;
    }

    // 3. Scan details history array for cancellation events
    const details = Array.isArray(trackRes.details) ? trackRes.details : [];
    for (const item of details) {
      const notes = String(item?.notes || item?.status || item?.comment || "").trim();
      if (/cancel|void/i.test(notes)) {
        isCancelled = true;
        effectiveStatus = "Pickup Cancelled";
        break;
      }
    }
  }

  if (isCancelled) {
    effectiveStatus = "Pickup Cancelled";
  }

  return {
    effectiveStatus: effectiveStatus || "Booked",
    isCancelled,
    carrierDatePicked,
    carrierDateDelivered,
  };
}

/**
 * Computes database updates following strict business transition rules:
 * - shipped_at (if null): set when newRank === 2, or when delivered.
 * - orders.status = "Shipped" only when newRank === 2 and current status is
 *   not Shipped/Delivered/Cancelled/Refund Completed/Returned.
 * - "Delivered" on code 21; "Cancelled" on codes 7, 16 or any cancelled status.
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
  // If order is fulfilled via manual fulfillment, ignore iCarry transitions
  if (order.fulfillment_type === "manual" || (order.courier_name && /st courier|manual|dtdc|local|porter/i.test(order.courier_name))) {
    return {
      shouldUpdate: false,
      reason: `Order is managed manually (fulfillment_type='${order.fulfillment_type || "manual"}'). iCarry transition ignored.`,
    };
  }

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
  // CRITICAL: Must NOT treat "pickup cancelled" as terminal!
  const isCurrentTerminal =
    currentRank === 3 ||
    ["delivered", "cancelled", "canceled", "returned", "rto", "lost", "damaged", "refund completed", "voided"].some(t => {
      const isStatusMatch = currentStatusLower.includes(t) && !currentStatusLower.includes("pickup cancel");
      const isDeliveryMatch = currentDeliveryLower.includes(t) && !currentDeliveryLower.includes("pickup cancel");
      return isStatusMatch || isDeliveryMatch;
    });

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
  const isCancelCode =
    numCode === 7 ||
    numCode === 16 ||
    /cancel|void/i.test(newDeliveryStatus) ||
    /cancel|void/i.test(String(rawStatus ?? ""));
  const isDeliveredCode = numCode === 21 || newDeliveryStatus.toLowerCase() === "delivered";

  // 1. Lost (14), Damaged (12), Returned to Origin (23):
  // Update delivery_status only, leave orders.status unchanged, log console warning
  if (isSpecialTerminalException) {
    warning = `Order ${order.id} flagged with exception: "${newDeliveryStatus}" (code ${numCode}). Updating delivery_status only; orders.status remains "${order.status}".`;
    // Do not set shipped_at or orders.status
    return { shouldUpdate: true, updates, warning };
  }

  // 2. Cancelled on codes 7/16 or cancel status text:
  // Carrier pickup cancellation: sets delivery_status = "Pickup Cancelled". Never touches orders.status!
  if (isCancelCode) {
    updates.delivery_status = "Pickup Cancelled";
    return {
      shouldUpdate: true,
      updates,
      warning: `Carrier pickup cancelled for order ${order.id}. Delivery status set to "Pickup Cancelled", order status preserved as "${order.status}".`,
    };
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
