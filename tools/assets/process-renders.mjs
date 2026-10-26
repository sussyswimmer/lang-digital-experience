// Blender renders from the PC (raw-assets/renders, T3) → web assets in public/assets/img.
//   stills/build-0N-*.png      → img/layers/build-0N-*.webp (+ -800)   one locked camera, alpha kept
//   stills/<other>.png         → img/renders/<name>.webp (+ -800)
//   quiz/<q>-<answer>.png      → img/quiz/<q>-<answer>.webp (+ -600)
//   lineart/page-*.png         → img/lineart/page-*.png  (2400 px, greyscale, white paper)
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
  const dest = name.startsWith('build-') ? `layers/${name}` : `renders/${name}`;
  await webp(path.join(SRC, 'stills', f), path.join(OUT, dest), [1600, 800]);
}
for (const f of await pngs('quiz')) {
  await webp(path.join(SRC, 'quiz', f), path.join(OUT, 'quiz', path.basename(f, '.png')), [1200, 600]);
}
for (const f of await pngs('cover')) {
  await webp(path.join(SRC, 'cover', f), path.join(OUT, 'renders', path.basename(f, '.png')), [2048, 1024]);
}
for (const f of await pngs('lineart')) {
  await mkdir(path.join(OUT, 'lineart'), { recursive: true });
  // flatten onto white so colouring fills never see transparent "holes", then keep a clean 1-channel PNG
  await sharp(path.join(SRC, 'lineart', f))
    .flatten({ background: '#ffffff' })
    .resize({ width: 2400 })
    .greyscale()
    .png({ compressionLevel: 9, palette: true, colours: 16 })
    .toFile(path.join(OUT, 'lineart', f));
  console.log('lineart/' + f);
}
