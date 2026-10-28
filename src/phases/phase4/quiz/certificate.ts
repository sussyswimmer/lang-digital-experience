/**
 * The "Nón Lá Explorer" certificate, drawn on an A4-landscape canvas (2480×1754 ≈ 300 dpi) so
 * it can be saved as a PNG, wrapped in a PDF or printed. All text is painted into the picture, so
 * the PDF needs no Vietnamese font; the web fonts are loaded first so the diacritics render.
 * It is a sheet of rice paper (docs/DESIGN.md): grain and fibres, a red running stitch sewn round
 * the edge, the explorer's picture taped on, the medals in a row and a round red ink stamp.
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

/* the table's palette (src/styles/tokens.css): paper, deep forest for headings, ink for text,
   bamboo brown for small print and the red thread as the one accent */
const C = {
  paper: '#FBF5E6',
  paperDeep: '#F1E6CB',
  forest: '#12301F',
  ink: '#1E2A22',
  wood: '#5A3F28',
  thread: '#C8392B',
  deckle: 'rgba(59,42,28,0.14)',
  tape: 'rgba(246,166,35,0.5)',
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

  // ---- title (both languages, the child's language first), a short stitch under it ----
  const [big, small] = data.lang === 'vi' ? (['vi', 'en'] as const) : (['en', 'vi'] as const);
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = C.forest;
  const titleSize = fitSize((s) => ((g.font = `800 ${s}px ${HEAD}`), g.measureText(t('cert.heading', big)).width), 1760, 124, 80);
  g.font = `800 ${titleSize}px ${HEAD}`;
  g.fillText(t('cert.heading', big), CERT_W / 2, 350);
  g.fillStyle = C.wood;
  g.font = `700 66px ${HEAD}`;
  g.fillText(t('cert.heading', small), CERT_W / 2, 440);
  stitch(g, CERT_W / 2 - 170, CERT_W / 2 + 170, 494, 6);

  // ---- the explorer's picture, taped on ----
  print(g, 640, 1000, 700, hero, hatImg);

  // ---- who and why ----
  const cx = 1590;
  const colW = 1100;
  g.fillStyle = C.wood;
  g.font = `600 56px ${BODY}`;
  g.fillText(t('cert.given'), cx, 640);
  const name = data.name.trim();
  if (name) {
    const size = fitSize((s) => ((g.font = `800 ${s}px ${HEAD}`), g.measureText(name).width), colW, 150, 70);
    g.font = `800 ${size}px ${HEAD}`;
    g.fillStyle = C.forest;
    g.fillText(name, cx, 820);
  }
  // the line the name is written on is sewn in red thread
  stitch(g, cx - colW / 2, cx + colW / 2, 862, 5);
  g.fillStyle = C.ink;
  g.font = `600 50px ${BODY}`;
  wrapLines((s) => g.measureText(s).width, t('cert.for'), colW).forEach((line, i) => g.fillText(line, cx, 950 + i * 66));

  // ---- badges ----
  const defs: BadgeDef[] = [...QUIZ_BADGES, MAKER_BADGE];
  const xs = rowCentres(defs.length, cx, 160, 34);
  const top = 1086;
  defs.forEach((b, i) => {
    const img = medals[i];
    const earned = b.id === MAKER_BADGE.id ? data.maker : data.badges.includes(b.id);
    if (img) g.drawImage(img, xs[i] - 80, top, 160, 198);
    g.fillStyle = earned ? C.ink : 'rgba(30,42,34,0.4)';
    g.font = `700 28px ${BODY}`;
    wrapLines((s) => g.measureText(s).width, t(b.nameId), 180)
      .slice(0, 2)
      .forEach((line, k) => g.fillText(line, xs[i], top + 236 + k * 34));
  });
  g.fillStyle = C.forest;
  g.font = `700 54px ${HEAD}`;
  g.fillText(t('cert.count'), cx, 1430);

  // ---- date and stamp ----
  g.textAlign = 'left';
  g.fillStyle = C.wood;
  g.font = `700 40px ${BODY}`;
  const dateLabel = `${t('cert.date')}:`;
  g.fillText(dateLabel, cx - colW / 2, 1540);
  const lw = g.measureText(dateLabel).width;
  g.font = `600 40px ${BODY}`;
  g.fillText(formatDate(data.date, data.lang), cx - colW / 2 + lw + 16, 1540);
  stamp(g, 2080, 1494, 118, t('cert.seal'));
}

/** rice paper: the paper colour, a fine grain of ink specks (drawn at half size and scaled up,
    so they soften) and a few long fibres running mostly across the sheet */
function paper(g: CanvasRenderingContext2D): void {
  g.fillStyle = C.paper;
  g.fillRect(0, 0, CERT_W, CERT_H);
  const r = rng(11);
  const gw = CERT_W / 2;
  const gh = CERT_H / 2;
  const noise = document.createElement('canvas');
  noise.width = gw;
  noise.height = gh;
  const ng = noise.getContext('2d');
  if (ng) {
    const img = ng.createImageData(gw, gh);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 59;
      d[i + 1] = 42;
      d[i + 2] = 28;
      d[i + 3] = Math.floor(r() * 26);
    }
    ng.putImageData(img, 0, 0);
    g.drawImage(noise, 0, 0, CERT_W, CERT_H);
  }
  g.lineWidth = 1.6;
  for (let i = 0; i < 700; i++) {
    const x = r() * CERT_W;
    const y = r() * CERT_H;
    const a = (r() - 0.5) * 0.5;
    const l = 10 + r() * 40;
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

/** a horizontal running stitch of red thread */
function stitch(g: CanvasRenderingContext2D, x1: number, x2: number, y: number, width: number): void {
  g.save();
  g.strokeStyle = C.thread;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.setLineDash([width * 4, width * 3]);
  g.globalAlpha = 0.92;
  g.beginPath();
  g.moveTo(x1, y);
  g.lineTo(x2, y);
  g.stroke();
  g.restore();
}

/** the red running stitch sewn round the sheet, a little in from the edge */
function border(g: CanvasRenderingContext2D): void {
  const inset = 96;
  g.save();
  g.strokeStyle = C.thread;
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.setLineDash([30, 22]);
  g.globalAlpha = 0.92;
  roundRect(g, inset, inset, CERT_W - 2 * inset, CERT_H - 2 * inset, 30);
  g.stroke();
  g.restore();
}

/** the explorer's picture: a print on a mount of deeper paper, taped to the sheet at a slant */
function print(g: CanvasRenderingContext2D, cx: number, cy: number, size: number, hero: HTMLImageElement | null, hat: HTMLImageElement | null): void {
  const half = size / 2;
  const m = 22;
  g.save();
  g.translate(cx, cy);
  g.rotate(-0.035);
  // the mount, lifted a touch off the sheet, with a hairline deckle
  g.save();
  g.shadowColor = 'rgba(59,42,28,0.22)';
  g.shadowBlur = 30;
  g.shadowOffsetY = 10;
  g.fillStyle = C.paperDeep;
  roundRect(g, -half - m, -half - m, size + 2 * m, size + 2 * m, 14);
  g.fill();
  g.restore();
  g.strokeStyle = C.deckle;
  g.lineWidth = 2;
  roundRect(g, -half - m, -half - m, size + 2 * m, size + 2 * m, 14);
  g.stroke();
  // the print
  g.save();
  roundRect(g, -half, -half, size, size, 8);
  g.clip();
  if (hero) {
    // cover-fit, centred: the square print shows the whole square picture
    const s = Math.max(size / hero.width, size / hero.height);
    const w = hero.width * s;
    const h = hero.height * s;
    g.drawImage(hero, -w / 2, -h / 2, w, h);
  } else {
    g.fillStyle = C.paperDeep;
    g.fillRect(-half, -half, size, size);
    if (hat) g.drawImage(hat, -half * 0.9, -half * 0.62, half * 1.8, half * 1.35);
  }
  g.restore();
  roundRect(g, -half, -half, size, size, 8);
  g.stroke();
  // a strip of washi tape over the top edge, striped like .sheet--tape
  g.save();
  g.translate(0, -half - m);
  g.rotate(-0.06);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = C.tape;
  g.fillRect(-110, -26, 220, 54);
  g.fillStyle = 'rgba(246,166,35,0.25)';
  for (let x = -110; x < 110; x += 24) g.fillRect(x, -26, 12, 54);
  g.restore();
  g.restore();
}

/** a round red ink stamp: a thick ring and a thin one, the words running round between them and
    the hat glyph (the hub's one-ink icon) in the middle; pressed a little askew */
function stamp(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, text: string): void {
  g.save();
  g.translate(cx, cy);
  g.rotate(-0.14);
  g.globalAlpha = 0.9;
  g.globalCompositeOperation = 'multiply';
  g.strokeStyle = C.thread;
  g.fillStyle = C.thread;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 9;
  g.beginPath();
  g.arc(0, 0, r - 4, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, 0, r - 66, 0, Math.PI * 2);
  g.stroke();
  g.save();
  g.scale(4.6, 4.6);
  g.translate(-12, -11.6);
  g.lineWidth = 1.9;
  g.stroke(new Path2D('M12 4.5 20 15.5Q12 18.6 4 15.5Z'));
  g.stroke(new Path2D('M7.2 17.2c1.4 2.6 8.2 2.6 9.6 0'));
  g.restore();
  // lettering round the ring: once if it's long (Vietnamese), twice if short, sized to fit
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const radius = r - 37;
  const room = Math.PI * 2 * radius * 0.94;
  let size = 26;
  g.font = `700 ${size}px ${BODY}`;
  const once = `${text} • `;
  const label = g.measureText(once).width * 2 <= room ? once + once : once;
  const full = g.measureText(label).width;
  if (full > room) {
    size = Math.max(14, Math.floor((size * room) / full));
    g.font = `700 ${size}px ${BODY}`;
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
