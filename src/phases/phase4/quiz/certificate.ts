/**
 * The "Nón Lá Explorer" certificate, drawn on an A4-landscape canvas (2480×1754 ≈ 300 dpi) so
 * it can be saved as a PNG, wrapped in a PDF or printed. All text is painted into the picture, so
 * the PDF needs no Vietnamese font; the web fonts are loaded first so the diacritics render.
 */
import type { Lang } from '../../../app/types';
import { i18n } from '../../../i18n/i18n';
import { assetUrl } from '../../../assets/manifest';
import { BENCH, fullHat, svgDoc, STRAP_COLOURS } from '../hub/hat';
import { QUIZ_BADGES, MAKER_BADGE, badgeImage, svgImage, type BadgeDef } from '../hub/badges';

export const CERT_W = 2480;
export const CERT_H = 1754;

const HEAD = '"Fraunces Variable", "Fraunces", Georgia, serif';
const BODY = '"Be Vietnam Pro", system-ui, sans-serif';

const C = {
  paper: '#FBF3DF',
  cream: '#FFF9EC',
  straw: '#E0A93B',
  strawDark: '#B8862A',
  terracotta: '#A9472A',
  forest: '#1F4D3A',
  wood: '#5A3F28',
  ink: '#3B2A1C',
  dragon: '#C21F66',
  seal: '#B3261E',
};

export interface CertData {
  lang: Lang;
  name: string;
  date: Date;
  /** quiz badge ids collected */
  badges: string[];
  /** the build game's "Little Hat Maker" badge */
  maker: boolean;
}

export type Measure = (text: string) => number;

/** greedy word wrap; a single over-long word stays on its own line */
export function wrapLines(measure: Measure, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && measure(next) > maxWidth) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** the largest font size (stepping down from `start`) at which `text` fits `maxWidth` */
export function fitSize(measureAt: (size: number) => number, maxWidth: number, start: number, min: number): number {
  let size = start;
  while (size > min && measureAt(size) > maxWidth) size -= 2;
  return Math.max(size, min);
}

/** x centres for `n` items of width `w` with `gap`, centred on `cx` */
export function rowCentres(n: number, cx: number, w: number, gap: number): number[] {
  const total = n * w + (n - 1) * gap;
  return Array.from({ length: n }, (_, i) => cx - total / 2 + w / 2 + i * (w + gap));
}

export function formatDate(d: Date, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** every string the certificate will draw, for font loading */
function allText(data: CertData): string {
  const t = (id: string, l: Lang = data.lang) => i18n.t(id, { n: data.badges.length }, l);
  return [
    t('cert.heading', 'en'),
    t('cert.heading', 'vi'),
    t('cert.given'),
    t('cert.for'),
    t('cert.count'),
    t('cert.date'),
    t('cert.seal'),
    data.name,
    formatDate(data.date, data.lang),
    ...[...QUIZ_BADGES, MAKER_BADGE].map((b) => t(b.nameId)),
  ].join(' ');
}

export async function loadCertFonts(data: CertData): Promise<void> {
  if (!('fonts' in document)) return;
  const text = allText(data);
  try {
    await Promise.all([
      document.fonts.load(`800 120px "Fraunces Variable"`, text),
      document.fonts.load(`700 60px "Fraunces Variable"`, text),
      document.fonts.load(`600 54px "Be Vietnam Pro"`, text),
      document.fonts.load(`700 54px "Be Vietnam Pro"`, text),
    ]);
  } catch {
    /* fall back to the system font rather than not drawing */
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** a small deterministic random generator so the paper texture is the same on every redraw */
function rng(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export async function drawCertificate(canvas: HTMLCanvasElement, data: CertData): Promise<void> {
  await loadCertFonts(data);
  const [hero, hatImg, ...medals] = await Promise.all([
    loadImage(assetUrl('img/art/hub-quiz-1600.webp')),
    svgImage(svgDoc('0 0 400 300', fullHat(BENCH, 'cert', STRAP_COLOURS.purple))).catch(() => null),
    ...QUIZ_BADGES.map((b) => badgeImage(b, data.badges.includes(b.id)).catch(() => null)),
    badgeImage(MAKER_BADGE, data.maker).catch(() => null),
  ]);
  canvas.width = CERT_W;
  canvas.height = CERT_H;
  const g = canvas.getContext('2d');
  if (!g) return;
  const t = (id: string, l: Lang = data.lang) => i18n.t(id, { n: data.badges.length }, l);

  paper(g);
  border(g);
  if (hatImg) corners(g, hatImg);

  // ---- title (both languages, the child's language first) ----
  const [big, small] = data.lang === 'vi' ? (['vi', 'en'] as const) : (['en', 'vi'] as const);
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = C.forest;
  const titleSize = fitSize((s) => ((g.font = `800 ${s}px ${HEAD}`), g.measureText(t('cert.heading', big)).width), 1760, 124, 80);
  g.font = `800 ${titleSize}px ${HEAD}`;
  g.fillText(t('cert.heading', big), CERT_W / 2, 360);
  g.fillStyle = C.terracotta;
  g.font = `700 70px ${HEAD}`;
  g.fillText(t('cert.heading', small), CERT_W / 2, 455);
  divider(g, CERT_W / 2, 512, hatImg);

  // ---- the picture medallion ----
  medallion(g, 640, 980, 330, hero, hatImg);

  // ---- who and why ----
  const cx = 1590;
  const colW = 1100;
  g.fillStyle = C.wood;
  g.font = `600 56px ${BODY}`;
  g.fillText(t('cert.given'), cx, 660);
  const name = data.name.trim();
  if (name) {
    const size = fitSize((s) => ((g.font = `800 ${s}px ${HEAD}`), g.measureText(name).width), colW, 150, 70);
    g.font = `800 ${size}px ${HEAD}`;
    g.fillStyle = C.dragon;
    g.fillText(name, cx, 830);
  }
  g.strokeStyle = C.strawDark;
  g.lineWidth = 5;
  g.setLineDash([2, 14]);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx - colW / 2, 868);
  g.lineTo(cx + colW / 2, 868);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = C.ink;
  g.font = `600 50px ${BODY}`;
  wrapLines((s) => g.measureText(s).width, t('cert.for'), colW).forEach((line, i) => g.fillText(line, cx, 960 + i * 66));

  // ---- badges ----
  const defs: BadgeDef[] = [...QUIZ_BADGES, MAKER_BADGE];
  const xs = rowCentres(defs.length, cx, 160, 34);
  const top = 1086;
  defs.forEach((b, i) => {
    const img = medals[i];
    const earned = b.id === MAKER_BADGE.id ? data.maker : data.badges.includes(b.id);
    if (img) g.drawImage(img, xs[i] - 80, top, 160, 198);
    g.fillStyle = earned ? C.ink : 'rgba(59,42,28,0.4)';
    g.font = `800 28px ${BODY}`;
    wrapLines((s) => g.measureText(s).width, t(b.nameId), 180)
      .slice(0, 2)
      .forEach((line, k) => g.fillText(line, xs[i], top + 236 + k * 34));
  });
  g.fillStyle = C.forest;
  g.font = `700 54px ${HEAD}`;
  g.fillText(t('cert.count'), cx, 1430);

  // ---- date and seal ----
  g.textAlign = 'left';
  g.fillStyle = C.wood;
  g.font = `800 40px ${BODY}`;
  const dateLabel = `${t('cert.date')}:`;
  g.fillText(dateLabel, cx - colW / 2, 1540);
  const lw = g.measureText(dateLabel).width;
  g.font = `600 40px ${BODY}`;
  g.fillText(formatDate(data.date, data.lang), cx - colW / 2 + lw + 16, 1540);
  seal(g, 2080, 1494, 118, t('cert.seal'), hatImg);
}

function paper(g: CanvasRenderingContext2D): void {
  g.fillStyle = C.paper;
  g.fillRect(0, 0, CERT_W, CERT_H);
  const glow = g.createRadialGradient(CERT_W / 2, CERT_H * 0.45, 100, CERT_W / 2, CERT_H / 2, CERT_W * 0.65);
  glow.addColorStop(0, 'rgba(255,255,255,0.65)');
  glow.addColorStop(1, 'rgba(232,201,146,0.35)');
  g.fillStyle = glow;
  g.fillRect(0, 0, CERT_W, CERT_H);
  // a few soft paper fibres
  const r = rng(11);
  g.lineWidth = 1.4;
  for (let i = 0; i < 900; i++) {
    const x = r() * CERT_W;
    const y = r() * CERT_H;
    const a = r() * Math.PI;
    const l = 6 + r() * 18;
    g.strokeStyle = `rgba(122,90,58,${(0.04 + r() * 0.06).toFixed(3)})`;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** terracotta band, a woven straw band, then a fine forest line and a dashed gold line */
function border(g: CanvasRenderingContext2D): void {
  roundRect(g, 36, 36, CERT_W - 72, CERT_H - 72, 46);
  g.fillStyle = C.terracotta;
  g.fill();
  roundRect(g, 64, 64, CERT_W - 128, CERT_H - 128, 34);
  const straw = g.createLinearGradient(0, 0, CERT_W, CERT_H);
  straw.addColorStop(0, '#EED39A');
  straw.addColorStop(0.5, '#E0A93B');
  straw.addColorStop(1, '#D9A13A');
  g.fillStyle = straw;
  g.fill();
  // weave: the straw band is criss-crossed like a hat's leaf rows
  g.save();
  roundRect(g, 64, 64, CERT_W - 128, CERT_H - 128, 34);
  g.clip();
  g.strokeStyle = 'rgba(122,82,38,0.28)';
  g.lineWidth = 3;
  for (let d = -CERT_H; d < CERT_W; d += 22) {
    g.beginPath();
    g.moveTo(d, 0);
    g.lineTo(d + CERT_H, CERT_H);
    g.stroke();
    g.beginPath();
    g.moveTo(d + CERT_H, 0);
    g.lineTo(d, CERT_H);
    g.stroke();
  }
  g.restore();
  roundRect(g, 118, 118, CERT_W - 236, CERT_H - 236, 24);
  g.fillStyle = C.paper;
  g.fill();
  g.strokeStyle = C.forest;
  g.lineWidth = 6;
  g.stroke();
  roundRect(g, 140, 140, CERT_W - 280, CERT_H - 280, 16);
  g.strokeStyle = C.straw;
  g.lineWidth = 4;
  g.setLineDash([18, 12]);
  g.stroke();
  g.setLineDash([]);
  // repaint the paper glow inside the frame
  const glow = g.createRadialGradient(CERT_W / 2, CERT_H * 0.45, 100, CERT_W / 2, CERT_H / 2, CERT_W * 0.6);
  glow.addColorStop(0, 'rgba(255,255,255,0.55)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(150, 150, CERT_W - 300, CERT_H - 300);
}

function leaf(g: CanvasRenderingContext2D, x: number, y: number, len: number, angle: number, colour: string): void {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.5, -len * 0.28, len, 0);
  g.quadraticCurveTo(len * 0.5, len * 0.28, 0, 0);
  g.fillStyle = colour;
  g.fill();
  g.strokeStyle = 'rgba(18,48,31,0.5)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(len * 0.08, 0);
  g.lineTo(len * 0.92, 0);
  g.stroke();
  g.restore();
}

/** a little hat with two leaves in each inner corner */
function corners(g: CanvasRenderingContext2D, hat: HTMLImageElement): void {
  const spots: [number, number, number][] = [
    [190, 190, 0],
    [CERT_W - 190, 190, Math.PI / 2],
    [CERT_W - 190, CERT_H - 190, Math.PI],
    [190, CERT_H - 190, -Math.PI / 2],
  ];
  for (const [x, y, rot] of spots) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    leaf(g, 6, 6, 150, 0.12, '#2F5D46');
    leaf(g, 6, 6, 150, Math.PI / 2 - 0.12, '#7FBF5E');
    g.restore();
    g.drawImage(hat, x - 70, y - 62, 140, 105);
  }
}

function divider(g: CanvasRenderingContext2D, cx: number, y: number, hat: HTMLImageElement | null): void {
  g.strokeStyle = C.straw;
  g.lineWidth = 5;
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + s * 90, y);
    g.lineTo(cx + s * 420, y);
    g.stroke();
    g.fillStyle = C.terracotta;
    g.beginPath();
    g.arc(cx + s * 440, y, 9, 0, Math.PI * 2);
    g.fill();
  }
  if (hat) g.drawImage(hat, cx - 64, y - 52, 128, 96);
}

/** the painted explorer (or the drawn hat) in a gold-ringed circle */
function medallion(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, hero: HTMLImageElement | null, hat: HTMLImageElement | null): void {
  g.save();
  g.shadowColor = 'rgba(59,42,28,0.35)';
  g.shadowBlur = 40;
  g.shadowOffsetY = 16;
  g.beginPath();
  g.arc(cx, cy, r + 26, 0, Math.PI * 2);
  g.fillStyle = C.straw;
  g.fill();
  g.restore();
  g.beginPath();
  g.arc(cx, cy, r + 26, 0, Math.PI * 2);
  g.strokeStyle = C.strawDark;
  g.lineWidth = 6;
  g.stroke();
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.clip();
  if (hero) {
    // cover-fit, nudged so the child and her magnifying glass sit in the circle
    const s = Math.max((2 * r) / hero.width, (2 * r) / hero.height) * 1.08;
    const w = hero.width * s;
    const h = hero.height * s;
    g.drawImage(hero, cx - w * 0.42, cy - h / 2, w, h);
  } else {
    g.fillStyle = '#F6E7C4';
    g.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    if (hat) g.drawImage(hat, cx - r * 0.9, cy - r * 0.62, r * 1.8, r * 1.35);
  }
  g.restore();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.strokeStyle = C.cream;
  g.lineWidth = 8;
  g.stroke();
  // ribbon tails under the medallion
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + s * 60, cy + r + 10);
    g.lineTo(cx + s * 150, cy + r + 190);
    g.lineTo(cx + s * 100, cy + r + 170);
    g.lineTo(cx + s * 70, cy + r + 220);
    g.lineTo(cx + s * 4, cy + r + 30);
    g.closePath();
    g.fillStyle = s < 0 ? C.forest : '#2F5D46';
    g.fill();
  }
}

/** a round red stamp with the hat in the middle and the words running round the edge */
function seal(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, text: string, hat: HTMLImageElement | null): void {
  g.save();
  g.translate(cx, cy);
  g.rotate(-0.12);
  g.globalAlpha = 0.92;
  g.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const rr = r + (i % 2 ? 0 : 7);
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = C.seal;
  g.fill();
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(255,244,214,0.9)';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(0, 0, r - 16, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(0, 0, r - 62, 0, Math.PI * 2);
  g.stroke();
  if (hat) {
    g.save();
    g.beginPath();
    g.arc(0, 0, r - 66, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#FFF4D6';
    g.fill();
    g.drawImage(hat, -58, -48, 116, 87);
    g.restore();
  }
  // lettering round the ring: once if it's long (Vietnamese), twice if short, sized to fit
  g.fillStyle = '#FFF4D6';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const radius = r - 39;
  const room = Math.PI * 2 * radius * 0.94;
  let size = 28;
  g.font = `800 ${size}px ${BODY}`;
  const once = `${text} • `;
  const label = g.measureText(once).width * 2 <= room ? once + once : once;
  const full = g.measureText(label).width;
  if (full > room) {
    size = Math.max(14, Math.floor((size * room) / full));
    g.font = `800 ${size}px ${BODY}`;
  }
  const total = g.measureText(label).width;
  // spread the letters evenly round the whole ring, each at its own width
  const spread = (Math.PI * 2) / total;
  let a = 0;
  for (const ch of label) {
    const w = g.measureText(ch).width;
    g.save();
    g.rotate(a + (w / 2) * spread);
    g.translate(0, -radius);
    g.fillText(ch, 0, 0);
    g.restore();
    a += w * spread;
  }
  g.restore();
}

/** PNG blob of the certificate */
export function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** an A4-landscape PDF holding the certificate picture (jsPDF is loaded only when asked for) */
export async function downloadPdf(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: i18n.t('cert.heading') });
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 297, 210, undefined, 'FAST');
  doc.save(filename);
}
