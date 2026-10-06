// src/utils/imageCompression.js
import imageCompression from 'browser-image-compression';

export const COMPRESSION_PRESETS = {
  card: { maxWidthOrHeight: 600, maxSizeMB: 0.3 },
  detail: { maxWidthOrHeight: 1200, maxSizeMB: 0.6 },
  variant: { maxWidthOrHeight: 1000, maxSizeMB: 0.5 },
  banner: { maxWidthOrHeight: 2560, maxSizeMB: 4, initialQuality: 0.9 },
};

export async function compressImage(file, preset = 'detail') {
  const presetConfig = COMPRESSION_PRESETS[preset] || COMPRESSION_PRESETS.detail;
  const options = {
    ...presetConfig,
    useWebWorker: true,
    fileType: 'image/webp',
  };

  try {
    return await imageCompression(file, options);
  } catch (err) {
    console.error('Image compression failed, using original file:', err);
    return file; // fail-safe: don't block upload if compression errors out
  }
}