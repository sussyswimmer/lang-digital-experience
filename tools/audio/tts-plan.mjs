// Which narration clips need (re)recording? Every string except kind "alt" gets a voice in both
// languages (the brief: audio narration backup for all on-screen text).
// Writes ops/tts/pending.json: [{ id, lang, text, hash }] for missing or changed lines.
// Usage: node tools/audio/tts-plan.mjs [--lang en|vi]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const only = process.argv.includes('--lang') ? process.argv[process.argv.indexOf('--lang') + 1] : null;
const strings = {};
for (const f of readdirSync('content/strings').filter((f) => f.endsWith('.json'))) {
  Object.assign(strings, JSON.parse(readFileSync(`content/strings/${f}`, 'utf8')));
}
const recordedPath = 'content/audio-recorded.json'; // { "<lang>/<id>": { hash, seconds } }
const recorded = existsSync(recordedPath) ? JSON.parse(readFileSync(recordedPath, 'utf8')) : {};
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
const speakable = (text) => text.replace(/[⟦⟧]/g, '').trim();

const pending = [];
for (const [id, e] of Object.entries(strings)) {
  if (e.kind === 'alt') continue;
  for (const lang of ['en', 'vi']) {
    if (only && lang !== only) continue;
    const text = speakable(e[lang] || e.en || '');
    if (!text) continue;
    const h = hash(text);
    if (recorded[`${lang}/${id}`]?.hash === h && existsSync(`public/assets/audio/narration/${lang}/${id}.mp3`)) continue;
    pending.push({ id, lang, text, hash: h });
  }
}
mkdirSync('ops/tts', { recursive: true });
writeFileSync('ops/tts/pending.json', JSON.stringify(pending, null, 1));
const chars = (l) => pending.filter((p) => p.lang === l).reduce((n, p) => n + Math.max(50, p.text.length), 0);
console.log(`pending: ${pending.length} clips; en ${chars('en')} chars, vi ${chars('vi')} chars (≥50 billed per clip)`);
