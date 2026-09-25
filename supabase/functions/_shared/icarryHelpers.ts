// supabase/functions/_shared/icarryHelpers.ts

/**
 * iCarry uses its own 2-letter state codes (not ISO).
 * Source: iCarry API documentation Appendix p. 49.
 */
export const STATE_CODE: Record<string, string> = {
  'andaman and nicobar islands': 'AN',
  'andhra pradesh': 'AP',
  'arunachal pradesh': 'AR',
  'assam': 'AS',
  'bihar': 'BI',
  'chandigarh': 'CH',
  'dadra and nagar haveli': 'DA',
  'daman and diu': 'DM',
  'delhi': 'DE',
  'goa': 'GO',
  'gujarat': 'GU',
  'haryana': 'HA',
  'himachal pradesh': 'HP',
  'jammu and kashmir': 'JA',
  'jharkhand': 'JH',
  'karnataka': 'KA',
  'kerala': 'KE',
  'ladakh': 'LA',
  'lakshadweep islands': 'LI',
  'lakshadweep': 'LI',
  'madhya pradesh': 'MP',
  'maharashtra': 'MA',
  'manipur': 'MN',
  'meghalaya': 'ME',
  'mizoram': 'MI',
  'nagaland': 'NA',
  'odisha': 'OD',
  'puducherry': 'PO',
  'punjab': 'PU',
  'rajasthan': 'RA',
  'sikkim': 'SI',
  'tamil nadu': 'TN',
  'telangana': 'TS',
  'tripura': 'TR',
  'uttar pradesh': 'UP',
  'uttarakhand': 'UK',
  'west bengal': 'WB',
  'chhattisgarh': 'CG',
  'chattisgarh': 'CG',
};

/**
 * Normalizes state name to iCarry 2-letter state code.
 */
export const toStateCode = (s?: string): string => {
  if (!s) return '';
  const t = s.trim();
  if (t.length === 2) return t.toUpperCase();
  return STATE_CODE[t.toLowerCase()] ?? '';
};

/**
 * Cleans phone number to exactly 10 digits (no +91, no leading 0, no non-digit characters).
 */
export const cleanMobile = (m?: string): string => {
  if (!m) return '';
  return m
    .replace(/\D/g, '')
    .replace(/^(91|0)(?=\d{10}$)/, '')
    .slice(-10);
};

export interface ParcelDimensions {
  weight: number; // in grams
  l: number;      // length in cm
  b: number;      // breadth in cm
  h: number;      // height in cm
}

/**
 * Parcel default weights (gm) and dimensions (cm) aligned with store categories.
 * Can be tuned as needed with real packed parcel measurements.
 */
export const PARCEL_DEFAULTS: Record<string, ParcelDimensions> = {
  Bangles: { weight: 200, l: 12, b: 12, h: 6 },
  Anklets: { weight: 150, l: 12, b: 10, h: 4 },
  Necklaces: { weight: 250, l: 18, b: 14, h: 5 },
  Rings: { weight: 100, l: 8, b: 8, h: 4 },
  'Toe Rings': { weight: 100, l: 8, b: 8, h: 4 },
  Earrings: { weight: 150, l: 10, b: 10, h: 4 },
  Bracelets: { weight: 200, l: 12, b: 10, h: 4 },
  'Hip Accessories': { weight: 200, l: 20, b: 15, h: 6 },
  default: { weight: 200, l: 12, b: 10, h: 5 },
};

/**
 * Helper to calculate total parcel weight and dimensions for single or multi-item orders.
 * Sums the item weights, takes the max parcel length/breadth, and adds +2 cm height per extra item.
 */
export function calculateParcel(items: Array<{ category?: string | null; quantity?: number | null }>): {
  weight: number;
  length: number;
  breadth: number;
  height: number;
} {
  if (!items || items.length === 0) {
    const d = PARCEL_DEFAULTS['default'];
    return { weight: d.weight, length: d.l, breadth: d.b, height: d.h };
  }

  let totalWeight = 0;
  let maxL = 0;
  let maxB = 0;
  let maxH = 0;
  let totalItemsCount = 0;

  for (const item of items) {
    const catName = item.category || 'default';
    const defaults = PARCEL_DEFAULTS[catName] || PARCEL_DEFAULTS['default'];
    const qty = Math.max(1, Number(item.quantity || 1));
    totalItemsCount += qty;
    totalWeight += defaults.weight * qty;
    maxL = Math.max(maxL, defaults.l);
    maxB = Math.max(maxB, defaults.b);
    maxH = Math.max(maxH, defaults.h);
  }

  // Add 2 cm to height for each additional item beyond the first
  const extraItems = Math.max(0, totalItemsCount - 1);
  const finalHeight = maxH + extraItems * 2;

  return {
    weight: totalWeight,
    length: maxL,
    breadth: maxB,
    height: finalHeight,
  };
}
