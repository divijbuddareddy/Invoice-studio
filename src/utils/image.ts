import type { StoredImage } from '../types';

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB raw upload
export const MAX_STORED_DATAURL = 1_500_000; // ~1.1 MB after processing
const ALLOWED: Record<string, string[]> = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/svg+xml': ['svg'],
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The image could not be read. Try a different PNG or JPEG file.'));
    img.src = src;
  });
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('The file could not be read.'));
    r.readAsDataURL(file);
  });
}

/**
 * Validates and normalises an uploaded image. Everything — including SVG — is rasterised
 * to PNG through a canvas. Loading SVG via <img> never executes embedded scripts, and the
 * rasterised output contains no markup, so the stored value is always a safe bitmap.
 */
export async function processImageUpload(file: File, maxDim = 800): Promise<StoredImage> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const allowedExts = ALLOWED[file.type];
  if (!allowedExts || !allowedExts.includes(ext)) {
    throw new Error('Unsupported file. Please upload a PNG, JPEG or SVG image.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Image is larger than 2 MB. Please upload a smaller file.');
  }
  let src: string;
  if (file.type === 'image/svg+xml') {
    const text = await file.text();
    if (/<script|on\w+\s*=|javascript:|<foreignObject/i.test(text)) {
      throw new Error('This SVG contains scripts or embedded HTML and cannot be used. Export it as PNG instead.');
    }
    src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  } else {
    src = await readAsDataUrl(file);
  }
  const img = await loadImage(src);
  let w = img.naturalWidth || img.width || 300;
  let h = img.naturalHeight || img.height || 150;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser cannot process images (canvas unavailable).');
  ctx.drawImage(img, 0, 0, w, h);
  let dataUrl = canvas.toDataURL('image/png');
  if (dataUrl.length > MAX_STORED_DATAURL) {
    // Fall back to JPEG on a white background for large photographic images.
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  }
  if (dataUrl.length > MAX_STORED_DATAURL) throw new Error('Image is still too large after resizing.');
  return { dataUrl, width: w, height: h };
}

export function isSafeImageDataUrl(s: string): boolean {
  return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length <= MAX_STORED_DATAURL;
}
