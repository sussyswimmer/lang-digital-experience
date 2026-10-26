// Blender renders from the PC (raw-assets/renders, T3) → web assets in public/assets/img.
//   stills/build-0N-*.png      → img/layers/build-0N-*.webp (+ -800)   one locked camera, alpha kept;
//                                 build-00-shadow is the whole hat's floor shadow that goes under the stack
//                                 + img/layers/thumb-0N-*.webp: the piece trimmed to its own bounds (game tray)
//   stills/<other>.png         → img/renders/<name>.webp (+ -800)
//   quiz/<q>-<answer>.png      → img/quiz/<q>-<answer>.webp (+ -600)
//   lineart/page-*.png         → img/lineart/page-*.png  (2400×1800, black lines on transparent: the
//                                 colouring studio draws the paint layer underneath)
//   cover/cover.png            → img/renders/cover.webp (+ -1024)
import { readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC = 'raw-assets/renders';
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
  const build = name.startsWith('build-');
  await webp(path.join(SRC, 'stills', f), path.join(OUT, build ? `layers/${name}` : `renders/${name}`), [1600, 800]);
  if (build && name !== 'build-00-shadow') {
    const trimmed = await sharp(path.join(SRC, 'stills', f)).trim({ threshold: 1 }).toBuffer();
    await sharp(trimmed)
      .resize({ width: 480, height: 480, fit: 'inside' })
      .extend({ top: 16, bottom: 16, left: 16, right: 16, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 84, alphaQuality: 90 })
      .toFile(path.join(OUT, 'layers', name.replace('build-', 'thumb-') + '.webp'));
  }
}
for (const f of await pngs('quiz')) {
  await webp(path.join(SRC, 'quiz', f), path.join(OUT, 'quiz', path.basename(f, '.png')), [1200, 600]);
}
for (const f of await pngs('cover')) {
  await webp(path.join(SRC, 'cover', f), path.join(OUT, 'renders', path.basename(f, '.png')), [2048, 1024]);
}
for (const f of await pngs('lineart')) {
  await mkdir(path.join(OUT, 'lineart'), { recursive: true });
  // Freestyle renders black lines on near-white paper: ink coverage becomes the alpha of pure black, with
  // anything lighter than PAPER treated as blank so no faint veil sits over the paint
  const grey = await sharp(path.join(SRC, 'lineart', f))
    .flatten({ background: '#ffffff' })
    .resize({ width: 2400, height: 1800, fit: 'contain', background: '#ffffff' })
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
