// PhotoCraft-edited photos (raw-assets/photos/edited) → web formats in public/assets/img/photos.
// <stem>-<width>.{avif,webp,jpg} at 640/1280/1920 (+2560 for full-bleed heroes), sRGB, no metadata.
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SRC = 'raw-assets/photos/edited';
const OUT = 'public/assets/img/photos';
const HEROES = new Set(['p3-protection', 'p3-identity', 'p3-poem', 'diverse-4', 'diverse-1']);

await mkdir(OUT, { recursive: true });
const files = (await readdir(SRC)).filter((f) => f.endsWith('.jpg'));
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
  const { dominant } = await img.stats();
  index[stem] = { width: meta.width, height: meta.height, widths, dominant: `rgb(${dominant.r},${dominant.g},${dominant.b})` };
  console.log(stem, widths.join(','));
}
await writeFile('content/photos.json', JSON.stringify(index, null, 2) + '\n');
