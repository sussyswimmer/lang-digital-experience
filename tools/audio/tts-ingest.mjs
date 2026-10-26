// Download finished TTS jobs and install them as narration clips.
// Input: ops/tts/results.json  [{ id, lang, hash, url }]
// Output: public/assets/audio/narration/<lang>/<id>.mp3 (mono, 48 kbps, loudness-normalised),
//         content/audio-recorded.json, content/audio-index.json
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const results = JSON.parse(readFileSync('ops/tts/results.json', 'utf8'));
const recordedPath = 'content/audio-recorded.json';
const recorded = existsSync(recordedPath) ? JSON.parse(readFileSync(recordedPath, 'utf8')) : {};
const tmp = path.join(tmpdir(), 'tts-ingest');
mkdirSync(tmp, { recursive: true });
let n = 0;
for (const r of results) {
  if (!r.url) continue;
  const raw = path.join(tmp, `${r.lang}-${r.id}.src`);
  execFileSync('curl', ['-sSf', '-o', raw, r.url]);
  const outDir = `public/assets/audio/narration/${r.lang}`;
  mkdirSync(outDir, { recursive: true });
  const out = `${outDir}/${r.id}.mp3`;
  // trim leading/trailing silence, normalise to -16 LUFS, mono 48 kbps
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-af',
    'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,areverse,loudnorm=I=-16:TP=-1.5:LRA=11',
    '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '48k', out]);
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim());
  recorded[`${r.lang}/${r.id}`] = { hash: r.hash, seconds: Math.round(seconds * 100) / 100 };
  rmSync(raw);
  n++;
}
writeFileSync(recordedPath, JSON.stringify(recorded, null, 1));
const index = { en: [], vi: [] };
for (const key of Object.keys(recorded).sort()) {
  const [lang, id] = [key.slice(0, 2), key.slice(3)];
  if (existsSync(`public/assets/audio/narration/${lang}/${id}.mp3`)) index[lang].push(id);
}
writeFileSync('content/audio-index.json', JSON.stringify(index) + '\n');
console.log(`installed ${n} clips; index en ${index.en.length}, vi ${index.vi.length}`);
