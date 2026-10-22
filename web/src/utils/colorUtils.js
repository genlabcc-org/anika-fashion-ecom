/**
 * Color utility helpers for converting color codes (hex/rgb) into human-friendly names
 * and finding closest matching color names.
 */

export const COLOR_MAP = {
  // Swatches from Admin AddProduct & ProductVariant
  '#EF4444': 'Red',
  '#9B111E': 'Ruby Red',
  '#E75480': 'Pink',
  '#FFC0CB': 'Baby Pink',
  '#734F96': 'Lavender',
  '#8B2FC9': 'Purple',
  '#87CEEB': 'Sky Blue',
  '#4169E1': 'Royal Blue',
  '#040273': 'Deep Blue',
  '#429E9D': 'Mint Blue',
  '#05C3DD': 'Aqua Blue',
  '#008000': 'Green',
  '#50C878': 'Emerald Green',
  '#98FF98': 'Mint Green',
  '#FFFF00': 'Yellow',
  '#FFA500': 'Orange',
  '#111827': 'Black',
  '#FFFFFF': 'White',
  '#9CA3AF': 'Gray',
  '#2DD4BF': 'Teal',

  // Common shades & standards
  '#000000': 'Black',
  '#1F2937': 'Dark Gray',
  '#374151': 'Charcoal',
  '#4B5563': 'Gray',
  '#6B7280': 'Gray',
  '#D1D5DB': 'Light Gray',
  '#E5E7EB': 'Off White',
  '#F3F4F6': 'Off White',
  '#3B82F6': 'Blue',
  '#1D4ED8': 'Dark Blue',
  '#2563EB': 'Blue',
  '#0284C7': 'Sky Blue',
  '#0EA5E9': 'Sky Blue',
  '#10B981': 'Emerald',
  '#059669': 'Green',
  '#16A34A': 'Green',
  '#22C55E': 'Green',
  '#F59E0B': 'Amber',
  '#D97706': 'Amber',
  '#F97316': 'Orange',
  '#DC2626': 'Red',
  '#B91C1C': 'Dark Red',
  '#8B5CF6': 'Violet',
  '#7C3AED': 'Purple',
  '#EC4899': 'Pink',
  '#F43F5E': 'Rose',
  '#14B8A6': 'Teal',
  '#06B6D4': 'Cyan',
  '#84CC16': 'Lime',
  '#65A30D': 'Lime',
  '#FFD700': 'Gold',
  '#DAA520': 'Goldenrod',
  '#C0C0C0': 'Silver',
  '#CD7F32': 'Bronze',
  '#B87333': 'Copper',
  '#800000': 'Maroon',
  '#000080': 'Navy',
  '#808000': 'Olive',
  '#F5F5DC': 'Beige',
  '#FAF0E6': 'Linen',
  '#FFE4E1': 'Misty Rose',
  '#E6E6FA': 'Lavender',
  '#D8BFD8': 'Thistle'
};

/**
 * Converts a 3 or 6 hex string to { r, g, b }
 */
function hexToRgb(hex) {
  let c = hex.replace('#', '').trim();
  if (c.length === 3) {
    c = c.split('').map((char) => char + char).join('');
  }
  if (c.length !== 6) return null;
  const num = parseInt(c, 16);
  if (Number.isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

/**
 * Returns a human-readable color name for any given color code or name.
 * If color starts with '#', it looks up the map or finds the closest match.
 * If color is already a name (e.g. "Gold", "Red"), it returns the formatted name.
 * 
 * @param {string} color 
 * @returns {string}
 */
export function getColorName(color) {
  if (!color || typeof color !== 'string') return '';
  const trimmed = color.trim();
  if (!trimmed || trimmed === 'N/A' || trimmed.toLowerCase() === 'undefined' || trimmed.toLowerCase() === 'null') {
    return '';
  }

  // If it doesn't start with '#', it's already a named color
  if (!trimmed.startsWith('#')) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }

  const upper = trimmed.toUpperCase();
  // Exact match
  if (COLOR_MAP[upper]) {
    return COLOR_MAP[upper];
  }

  // 3-digit hex match
  if (upper.length === 4) {
    const expanded = `#${upper[1]}${upper[1]}${upper[2]}${upper[2]}${upper[3]}${upper[3]}`;
    if (COLOR_MAP[expanded]) return COLOR_MAP[expanded];
  }

  // Find closest matching color using Euclidean RGB distance
  const rgb = hexToRgb(upper);
  if (!rgb) return trimmed;

  let minDiff = Infinity;
  let closestName = trimmed;

  for (const [keyHex, name] of Object.entries(COLOR_MAP)) {
    const targetRgb = hexToRgb(keyHex);
    if (!targetRgb) continue;
    const diff = Math.sqrt(
      Math.pow(rgb.r - targetRgb.r, 2) +
      Math.pow(rgb.g - targetRgb.g, 2) +
      Math.pow(rgb.b - targetRgb.b, 2)
    );
    if (diff < minDiff) {
      minDiff = diff;
      closestName = name;
    }
  }

  // If closest difference is reasonably small (within ~75 Euclidean distance), return the friendly name
  if (minDiff <= 75) {
    return closestName;
  }

  return trimmed;
}
