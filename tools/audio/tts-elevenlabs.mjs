// Record narration with ElevenLabs, then hand the clips to tts-ingest (trim, loudness, mono 48 kbps).
// Voices and model: tools/audio/voices.json (one voice per language, so the narrator never changes).
//
// Usage: ELEVENLABS_API_KEY=… node tools/audio/tts-elevenlabs.mjs [--all] [--lang en|vi] [--only id,id] [--dry]
//   default  the lines tts-plan lists as missing or changed
//   --all    every voiced line (kinds narration and label), e.g. after changing a voice
//   --dry    print what would be recorded and the credits it needs, record nothing
// In a Claude cloud session the key is injected by the network proxy: run with ELEVENLABS_API_KEY=proxy-injected.
//
// Resumable: finished clips are kept in ops/tts/results/ with their text hash, so a rerun only records
// what is missing. Writes ops/tts/results.json for `npm run tts:ingest`.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const API = 'https://api.elevenlabs.io';
const opt = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const flag = (name) => process.argv.includes(name);
const key = process.env.ELEVENLABS_API_KEY;
const cfg = JSON.parse(readFileSync('tools/audio/voices.json', 'utf8'));
const onlyLang = opt('--lang');
const onlyIds = opt('--only')?.split(',');
const all = flag('--all');
const dry = flag('--dry');
const CONCURRENCY = 3; // the Starter plan's limit

const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
const speakable = (text) => text.replace(/[⟦⟧]/g, '').trim();

// ---- what to record (the same rules as tts-plan)
const strings = {};
for (const f of readdirSync('content/strings').filter((f) => f.endsWith('.json'))) {
  Object.assign(strings, JSON.parse(readFileSync(`content/strings/${f}`, 'utf8')));
}
const recordedPath = 'content/audio-recorded.json';
const recorded = existsSync(recordedPath) ? JSON.parse(readFileSync(recordedPath, 'utf8')) : {};
const jobs = [];
for (const [id, e] of Object.entries(strings)) {
  if (e.kind !== 'narration' && e.kind !== 'label') continue;
  if (onlyIds && !onlyIds.includes(id)) continue;
  for (const lang of ['en', 'vi']) {
    if (onlyLang && lang !== onlyLang) continue;
    const text = speakable(e[lang] || e.en || '');
    if (!text) continue;
    const h = hash(text);
    const current = recorded[`${lang}/${id}`]?.hash === h && existsSync(`public/assets/audio/narration/${lang}/${id}.mp3`);
    if (!all && !onlyIds && current) continue;
    jobs.push({ id, lang, text, hash: h });
  }
}

// clips already recorded by this script for the same text (and voice) are reused
const outDir = 'ops/tts/results';
mkdirSync(outDir, { recursive: true });
const manifestPath = path.join(outDir, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const stamp = (j) => `${j.hash}:${cfg[j.lang].voice}:${cfg.model}`;
const fileOf = (j) => path.join(outDir, `${j.lang}-${j.id}.mp3`);
const todo = jobs.filter((j) => !(manifest[`${j.lang}/${j.id}`] === stamp(j) && existsSync(fileOf(j))));
const credits = todo.reduce((n, j) => n + j.text.length, 0);
console.log(`${jobs.length} clips wanted, ${todo.length} to record (${credits} characters), ${jobs.length - todo.length} already recorded`);
console.log(`voices: en ${cfg.en.name}, vi ${cfg.vi.name}; model ${cfg.model}`);
if (dry) process.exit(0);
if (!key) {
  console.error('ELEVENLABS_API_KEY is not set');
  process.exit(1);
}

// ---- budget check: never start a run the plan cannot finish
if (todo.length) {
  const sub = await fetch(`${API}/v1/user/subscription`, { headers: { 'xi-api-key': key } }).then((r) => r.json());
  const left = (sub.character_limit ?? 0) - (sub.character_count ?? 0);
  console.log(`plan ${sub.tier}: ${left} characters left this period`);
  if (credits > left) {
    console.error(`not enough credits: need ${credits}, have ${left}. Record part with --lang or --only.`);
    process.exit(1);
  }
}

// ---- record, three at a time, retrying rate limits and server errors
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function record(j) {
  const body = JSON.stringify({ text: j.text, model_id: cfg.model, language_code: j.lang });
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(`${API}/v1/text-to-speech/${cfg[j.lang].voice}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body,
    });
    if (res.ok) {
      writeFileSync(fileOf(j), Buffer.from(await res.arrayBuffer()));
      manifest[`${j.lang}/${j.id}`] = stamp(j);
      return true;
    }
    const detail = (await res.text()).slice(0, 300);
    if (res.status === 429 || res.status >= 500) {
      await sleep(2000 * 2 ** (attempt - 1));
      continue;
    }
    console.error(`  ${j.lang}/${j.id}: HTTP ${res.status} ${detail}`);
    return false;
  }
  console.error(`  ${j.lang}/${j.id}: gave up after 5 tries`);
  return false;
}

let done = 0;
let failed = 0;
const queue = [...todo];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let j = queue.shift(); j; j = queue.shift()) {
      if (await record(j)) done++;
      else failed++;
      if ((done + failed) % 25 === 0) {
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
        console.log(`  ${done + failed}/${todo.length}`);
      }
    }
  }),
);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));

// ---- hand every wanted clip that exists to tts-ingest
const results = jobs
  .filter((j) => manifest[`${j.lang}/${j.id}`] === stamp(j) && existsSync(fileOf(j)))
  .map((j) => ({ id: j.id, lang: j.lang, hash: j.hash, url: `file://${path.resolve(fileOf(j))}` }));
writeFileSync('ops/tts/results.json', JSON.stringify(results, null, 1));
console.log(`recorded ${done}, failed ${failed}; ${results.length} clips ready: run npm run tts:ingest`);
if (failed) process.exit(2);
