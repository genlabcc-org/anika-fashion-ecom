/**
 * Sanitizes an image URL to ensure the raw, uncropped, full-resolution original image is returned.
 * Strips Supabase on-the-fly transformations (/render/image/ -> /object/) and removes crop query params.
 */
export const getOriginalImageUrl = (url) => {
  if (!url || typeof url !== 'string') return url;
  if (url.includes('r2.dev')) return url;
  let clean = url.replace('/storage/v1/render/image/public/', '/storage/v1/object/public/');
  if (clean.includes('?')) {
    const [baseUrl, query] = clean.split('?');
    const params = new URLSearchParams(query);
    params.delete('width');
    params.delete('height');
    params.delete('resize');
    params.delete('quality');
    params.delete('format');
    const remaining = params.toString();
    clean = remaining ? `${baseUrl}?${remaining}` : baseUrl;
  }
  return clean;
};
