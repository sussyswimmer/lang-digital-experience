// PhotoCraft-edited photos (raw-assets/photos/edited) → web formats in public/assets/img/photos.
// <stem>-<width>.{avif,webp,jpg} at 640/1280/1920 (+2560 for full-bleed heroes), sRGB, no metadata.
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SRC = 'raw-assets/photos/edited';
const OUT = 'public/assets/img/photos';
// Only the photos the site shows are published (docs/ARCHITECTURE.md §4); the others stay in raw-assets.
const USED = new Set([
  'p1-farmers', 'p1-market', 'p1-aodai', 'p1-rain', 'diverse-3', 'diverse-4',
  'p2-stitching', 'p2-layering-leaves', 'p2-16-rims', 'p2-chin-straps',
  'p3-protection', 'p3-poem', 'p3-identity',
]);
// full-bleed photos whose code asks for the 2560 size (the landing hero, storybook chapter 3)
const HEROES = new Set(['diverse-4', 'p3-identity']);

await mkdir(OUT, { recursive: true });
const all = (await readdir(SRC)).filter((f) => f.endsWith('.jpg'));
const files = all.filter((f) => USED.has(path.basename(f, '.jpg')));
const skipped = all.filter((f) => !files.includes(f));
if (skipped.length) console.log('not used by the site, skipped:', skipped.join(', '));
const index = {};
for (const file of files) {
  const stem = path.basename(file, '.jpg');
  const img = sharp(path.join(SRC, file)).rotate();
  const meta = await img.metadata();
  const widths = [640, 1280, 1920, ...(HEROES.has(stem) ? [2560] : [])].filter((w) => w <= meta.width);
  for (const w of widths) {
    const base = img.clone().resize({ width: w, withoutEnlargement: true });
    await base.clone().avif({ quality: 50, effort: 5 }).toFile(path.join(OUT, `${stem}-${w}.avif`));
    await base.clone().webp({ quality: 78 }).toFile(path.join(OUT, `${stem}-${w}.webp`));
    await base.clone().jpeg({ quality: 80, progressive: true, mozjpeg: true }).toFile(path.join(OUT, `${stem}-${w}.jpg`));
  }
  // average colour (sharp's stats().dominant picks near-black bins on dark photos)
  const px = await img.clone().resize(1, 1, { fit: 'fill' }).raw().toBuffer();
  index[stem] = { width: meta.width, height: meta.height, widths, average: `rgb(${px[0]},${px[1]},${px[2]})` };
  console.log(stem, widths.join(','));
}
await writeFile('content/photos.json', JSON.stringify(index, null, 2) + '\n');
