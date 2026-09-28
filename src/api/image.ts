/** Canvas helpers: downscale an uploaded photo for the model, and crop card faces out of it. */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode that image.'));
    img.src = src;
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

/** Re-encode as JPEG with the longest edge at most `maxEdge` pixels. */
export async function downscale(src: string, maxEdge: number, quality = 0.86): Promise<string> {
  const img = await loadImage(src);
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable.');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

/** Crop a normalized box (0..1) out of the image, with a little padding, at most `maxEdge` tall. */
export async function crop(src: string, box: Box, maxEdge: number, pad = 0.015): Promise<string> {
  const img = await loadImage(src);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const x0 = Math.max(0, (box.x - pad) * W);
  const y0 = Math.max(0, (box.y - pad) * H);
  const x1 = Math.min(W, (box.x + box.w + pad) * W);
  const y1 = Math.min(H, (box.y + box.h + pad) * H);
  const cw = Math.max(1, x1 - x0);
  const ch = Math.max(1, y1 - y0);
  const scale = Math.min(1, maxEdge / Math.max(cw, ch));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cw * scale);
  canvas.height = Math.round(ch * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable.');
  ctx.drawImage(img, x0, y0, cw, ch, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.88);
}

export function dataUrlParts(dataUrl: string): { mediaType: string; data: string } {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error('Expected a base64 data URL.');
  return { mediaType: m[1], data: m[2] };
}

/**
 * Encode a data URL as a JPEG whose base64 text stays under `maxBytes`, stepping down quality and
 * then size until it fits. The KV store rejects values over roughly 100 KB, and one card record
 * must hold its image plus its text.
 */
export async function encodeUnder(src: string, maxEdge: number, maxBytes: number): Promise<string> {
  let edge = maxEdge;
  for (let round = 0; round < 6; round++) {
    for (const quality of [0.82, 0.72, 0.62, 0.52]) {
      const out = await downscale(src, edge, quality);
      if (out.length <= maxBytes) return out;
    }
    edge = Math.round(edge * 0.8);
  }
  return downscale(src, Math.round(maxEdge * 0.35), 0.5);
}
