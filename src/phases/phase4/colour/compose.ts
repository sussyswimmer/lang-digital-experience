/** Saving a picture: paper + paint + lines into a PNG, plus a small WebP thumbnail for the gallery grid. */
import { PAPER } from './palette';

export const THUMB_W = 400;

export function canvasToBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof c.toBlob === 'function') {
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality);
      return;
    }
    // very old WebKit: go through a data URL
    try {
      const url = c.toDataURL(type, quality);
      void fetch(url)
        .then((r) => r.blob())
        .then(resolve, reject);
    } catch (e) {
      reject(e);
    }
  });
}

function flat(paint: HTMLCanvasElement, lines: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = paint.width;
  c.height = paint.height;
  const g = c.getContext('2d')!;
  g.fillStyle = PAPER;
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(paint, 0, 0);
  g.drawImage(lines, 0, 0);
  return c;
}

export async function composePicture(paint: HTMLCanvasElement, lines: HTMLCanvasElement): Promise<{ png: Blob; thumb: Blob }> {
  const full = flat(paint, lines);
  const t = document.createElement('canvas');
  t.width = THUMB_W;
  t.height = Math.round((THUMB_W * full.height) / full.width);
  const g = t.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(full, 0, 0, t.width, t.height);
  // browsers without a WebP encoder hand back a PNG, which is fine for a thumbnail
  const [png, thumb] = await Promise.all([canvasToBlob(full, 'image/png'), canvasToBlob(t, 'image/webp', 0.85)]);
  return { png, thumb };
}

/** offer a blob as a download (the gallery and the session-only fallback) */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function pictureFilename(pageId: string, at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `tranh-cua-con-${pageId}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
}
