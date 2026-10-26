// EffectCraft output from the PC (raw-assets/video-edited + raw-assets/lottie, T4) → public/assets.
//   scroll-intro-fx-1080p.mp4      → scroll/{960,1600}/f_0001.webp … (every 2nd frame) + scroll/manifest.json
//   <clip>-loop-{1080,540}.mp4/webm → video/p1-<tile>.{mp4,webm}, video/p1-<tile>-540.mp4, -poster.webp
//   raw-assets/lottie/*.json        → lottie/*.json (minified)
import { readdir, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';

const ED = 'raw-assets/video-edited';
const OUT = 'public/assets';
const ff = (...args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });

// Higgsfield clip name → Phase 1 tile id
const TILES = { 'p1-rice': 'farmers', 'p1-market': 'market', 'p1-rain': 'rain', 'p1-craft': 'craft' };

const intro = path.join(ED, 'scroll-intro-fx-1080p.mp4');
if (existsSync(intro)) {
  const tmp = path.join('node_modules/.cache/scroll-frames');
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  ff('-i', intro, '-vf', "select='not(mod(n\\,2))'", '-fps_mode', 'vfr', path.join(tmp, 'f_%04d.png'));
  const frames = (await readdir(tmp)).filter((f) => f.endsWith('.png')).sort();
  for (const w of [960, 1600]) {
    const dir = path.join(OUT, 'scroll', String(w));
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    for (const f of frames) {
      await sharp(path.join(tmp, f)).resize({ width: w }).webp({ quality: w > 1000 ? 74 : 70, effort: 4 })
        .toFile(path.join(dir, f.replace('.png', '.webp')));
    }
  }
  await writeFile(path.join(OUT, 'scroll', 'manifest.json'),
    JSON.stringify({ frames: frames.length, widths: [960, 1600], aspect: 16 / 9, sourceFps: 30, step: 2 }) + '\n');
  console.log('scroll frames', frames.length);
}

await mkdir(path.join(OUT, 'video'), { recursive: true });
for (const [clip, tile] of Object.entries(TILES)) {
  const mp4 = path.join(ED, `${clip}-loop-1080.mp4`);
  if (!existsSync(mp4)) continue;
  const dest = (s) => path.join(OUT, 'video', `p1-${tile}${s}`);
  // re-mux with faststart and no audio track so <video muted autoplay> streams on every browser
  ff('-i', mp4, '-an', '-c:v', 'copy', '-movflags', '+faststart', dest('.mp4'));
  const small = path.join(ED, `${clip}-loop-540.mp4`);
  if (existsSync(small)) ff('-i', small, '-an', '-c:v', 'copy', '-movflags', '+faststart', dest('-540.mp4'));
  const webm = path.join(ED, `${clip}-loop-1080.webm`);
  if (existsSync(webm)) ff('-i', webm, '-an', '-c:v', 'copy', dest('.webm'));
  const poster = dest('-poster.png');
  ff('-i', mp4, '-frames:v', '1', poster);
  await sharp(poster).resize({ width: 1280 }).webp({ quality: 78 }).toFile(dest('-poster.webp'));
  await rm(poster);
  console.log('video', tile);
}

const LOT = 'raw-assets/lottie';
if (existsSync(LOT)) {
  await mkdir(path.join(OUT, 'lottie'), { recursive: true });
  for (const f of (await readdir(LOT)).filter((x) => x.endsWith('.json'))) {
    const json = JSON.parse(await readFile(path.join(LOT, f), 'utf8'));
    for (const k of ['v', 'fr', 'ip', 'op', 'w', 'h', 'layers']) if (!(k in json)) throw new Error(`${f}: missing ${k}`);
    await writeFile(path.join(OUT, 'lottie', f), JSON.stringify(json));
    console.log('lottie', f);
  }
}
