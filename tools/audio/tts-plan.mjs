// Which narration clips need (re)recording? Spoken strings (kinds narration and label) get a voice in both
// languages (the brief: audio narration backup for on-screen text for non-readers).
// Writes ops/tts/pending.json: [{ id, lang, text, hash }] for missing or changed lines.
// Usage: node tools/audio/tts-plan.mjs [--lang en|vi] [--files phase1,phase2] [--kinds narration,label]
// (button labels, kind "ui", are not spoken by the app, so by default only narration and labels are voiced)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const opt = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const only = opt('--lang');
const files = opt('--files')?.split(',');
const kinds = new Set((opt('--kinds') ?? 'narration,label').split(','));
const strings = {};
for (const f of readdirSync('content/strings').filter((f) => f.endsWith('.json') && (!files || files.includes(f.slice(0, -5))))) {
  Object.assign(strings, JSON.parse(readFileSync(`content/strings/${f}`, 'utf8')));
}
const recordedPath = 'content/audio-recorded.json'; // { "<lang>/<id>": { hash, seconds } }
const recorded = existsSync(recordedPath) ? JSON.parse(readFileSync(recordedPath, 'utf8')) : {};
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
const speakable = (text) => text.replace(/[⟦⟧]/g, '').trim();

const pending = [];
for (const [id, e] of Object.entries(strings)) {
  if (!kinds.has(e.kind)) continue;
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
