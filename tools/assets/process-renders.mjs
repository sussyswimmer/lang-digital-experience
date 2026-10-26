// Blender renders from the PC (raw-assets/renders, T3) → web assets in public/assets/img.
//   stills/build-0N-*.png      → img/layers/build-0N-*.webp (+ -800)   one locked camera, alpha kept; each is
//                                 cut by the layers below it so they stack like the real hat; build-00-shadow is
//                                 the whole hat's floor shadow that goes under the stack
//   stills/piece-0N-*.png      → img/layers/thumb-0N-*.webp: the whole piece, trimmed (game tray)
//   stills/<other>.png         → img/renders/<name>.webp (+ -800)
//   quiz/<q>-<answer>.png      → img/quiz/<q>-<answer>.webp (+ -600); Q1/Q5 answers come from QUIZ_EXTRA
//   lineart/page-*.png         → img/lineart/page-*.png  (2400×1800, black lines on transparent: the
//                                 colouring studio draws the paint layer underneath); pages 3–4 come from
//                                 raw-assets/higgsfield/lineart
//   cover/cover.png            → img/renders/cover.webp (+ -1024); cover-hat.png (no floor) → cover-hat.webp (+ -600)
import { readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC = 'raw-assets/renders';
const HF_LINEART = 'raw-assets/higgsfield/lineart';
const OUT = 'public/assets/img';

async function pngs(dir) {
  const d = path.join(SRC, dir);
  return existsSync(d) ? (await readdir(d)).filter((f) => f.endsWith('.png')).sort() : [];
}

async function webp(src, dest, widths) {
  await mkdir(path.dirname(dest), { recursive: true });
  const img = sharp(src);
  const { width } = await img.metadata();
  for (const [i, w] of widths.entries()) {
    const file = i === 0 ? `${dest}.webp` : `${dest}-${w}.webp`;
    await img.clone().resize({ width: Math.min(w, width) }).webp({ quality: 82, alphaQuality: 90, effort: 5 }).toFile(file);
  }
  console.log(path.relative(OUT, dest), widths.join(','));
}

for (const f of await pngs('stills')) {
  const name = path.basename(f, '.png');
  const piece = /^piece-\d\d-/.test(name);
  if (name.startsWith('build-')) await webp(path.join(SRC, 'stills', f), path.join(OUT, `layers/${name}`), [1600, 800]);
  else if (!piece) await webp(path.join(SRC, 'stills', f), path.join(OUT, `renders/${name}`), [1600, 800]);
  if (piece) {
    const trimmed = await sharp(path.join(SRC, 'stills', f)).trim({ threshold: 1 }).toBuffer();
    await sharp(trimmed)
      .resize({ width: 480, height: 480, fit: 'inside' })
      .extend({ top: 16, bottom: 16, left: 16, right: 16, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 84, alphaQuality: 90 })
      .toFile(path.join(OUT, 'layers', name.replace('piece-', 'thumb-') + '.webp'));
  }
}
for (const f of await pngs('quiz')) {
  await webp(path.join(SRC, 'quiz', f), path.join(OUT, 'quiz', path.basename(f, '.png')), [1200, 600]);
}
// quiz answers built from other renders / Higgsfield art (Q1: which part keeps the hat on; Q5: what is hidden)
const QUIZ_EXTRA = {
  'q1-thread': 'raw-assets/renders/stills/brim-closeup.png',
  'q1-leaves': 'raw-assets/renders/stills/piece-04-leaf-outer.png',
  'q1-strap': 'raw-assets/renders/stills/underside-purple.png',
  'q5-poems': 'raw-assets/higgsfield/art/quiz-q5-poems.png',
  'q5-coins': 'raw-assets/higgsfield/art/quiz-q5-coins.png',
  'q5-rice': 'raw-assets/higgsfield/art/quiz-q5-rice.png',
};
for (const [id, src] of Object.entries(QUIZ_EXTRA)) {
  if (!existsSync(src)) continue;
  const tmp = path.join('node_modules/.cache', `${id}.png`);
  await mkdir(path.dirname(tmp), { recursive: true });
  // same 4:3 card as the rendered answers; pieces are centred on transparent
  await sharp(src).resize(1200, 900, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(tmp);
  await webp(tmp, path.join(OUT, 'quiz', id), [1200, 600]);
}
for (const f of await pngs('cover')) {
  if (f === 'cover.png') {
    await webp(path.join(SRC, 'cover', f), path.join(OUT, 'renders/cover'), [2048, 1024]);
    continue;
  }
  // trimmed to the hat so the element's box is the hat itself (the 3D hat shrinks onto that rect)
  const tmp = path.join('node_modules/.cache', f);
  await mkdir(path.dirname(tmp), { recursive: true });
  await sharp(path.join(SRC, 'cover', f)).trim({ threshold: 1 }).toFile(tmp);
  await webp(tmp, path.join(OUT, 'renders', path.basename(f, '.png')), [1200, 600]);
}
// colouring pages 1–2 are Blender Freestyle renders; 3 (poem hat) and 4 (market) are Higgsfield line art
const LINEART = [
  ...(await pngs('lineart')).map((f) => [path.join(SRC, 'lineart', f), f, 0]),
  ...(existsSync(HF_LINEART) ? (await readdir(HF_LINEART)).filter((f) => f.endsWith('.png')) : [])
    .map((f) => [path.join(HF_LINEART, f), f, 0.05]),
];
for (const [src, f, margin] of LINEART) {
  await mkdir(path.join(OUT, 'lineart'), { recursive: true });
  // Freestyle renders black lines on near-white paper: ink coverage becomes the alpha of pure black, with
  // anything lighter than PAPER treated as blank so no faint veil sits over the paint
  const [mx, my] = [Math.round(2400 * margin), Math.round(1800 * margin)];
  const grey = await sharp(src)
    .flatten({ background: '#ffffff' })
    .resize({ width: 2400 - 2 * mx, height: 1800 - 2 * my, fit: 'contain', background: '#ffffff' })
    .extend({ top: my, bottom: my, left: mx, right: mx, background: '#ffffff' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = grey.info;
  const rgba = Buffer.alloc(width * height * 4);
  const PAPER = 225;
  for (let i = 0; i < width * height; i++) rgba[i * 4 + 3] = Math.round((Math.max(0, PAPER - grey.data[i]) * 255) / PAPER);
  await sharp(rgba, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, 'lineart', f));
  console.log('lineart/' + f);
}
