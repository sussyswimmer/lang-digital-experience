// Lists files under public/assets that nothing uses (they still ship with the build and bloat the repo).
// A file counts as used when:
//   - it is narration (audio/narration/<lang>/<id>.mp3) for a string id that exists (the §2 naming convention);
//   - its path, its path without the extension, or its file name (without extension) appears in src/, content/,
//     index.html or a JSON file under public/;
//   - it matches a template literal in src/ such as `img/art/hub-${id}-800.webp`. When the file name starts with the
//     interpolation (`img/photos/${stem}-1280.jpg`), the part it stands for must itself appear somewhere;
//   - it is a variant derived in code from a used file: the name without a -<width> suffix, or without one more
//     -<word> (build-06-strap-peach-800.webp → build-06-strap), appears as a quoted name or path.
// Heuristic: an unused size of a used photo is not caught here (tools/assets/process-photos.mjs decides the sizes).
// Usage: node tools/assets/check-unreferenced.mjs [--strict]   (--strict exits 1 when something is unused)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = 'public/assets';
// generated indexes and wish lists, not uses
const SKIP = new Set(['content/photos.json', 'content/audio-index.json']);
const skip = (p) => SKIP.has(p) || /^content\/asset-requests.*\.json$/.test(p);

function* walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p.split(path.sep).join('/');
  }
}

const sources = [...walk('src'), ...walk('content'), 'index.html', ...[...walk('public')].filter((p) => p.endsWith('.json'))]
  .filter((p) => /\.(ts|js|mjs|css|html|json)$/.test(p) && !skip(p));
const corpus = sources.map((p) => readFileSync(p, 'utf8')).join('\n');

const strings = new Set();
for (const f of readdirSync('content/strings').filter((x) => x.endsWith('.json'))) {
  for (const id of Object.keys(JSON.parse(readFileSync(`content/strings/${f}`, 'utf8')))) strings.add(id);
}

// template literals that point into public/assets, e.g. `img/art/hub-${c.id}-800.webp` (also when nested in
// another template): each ${…} becomes a wildcard for part of one path segment
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const INTERP = String.raw`\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}`;
const TEMPLATE = new RegExp(String.raw`[\w./-]*(?:${INTERP}[\w./-]*)+\.(?:webp|png|jpe?g|avif|svg|mp3|mp4|webm|json|glb)\b`, 'g');
const templates = [];
for (const p of sources.filter((x) => /\.(ts|js)$/.test(x))) {
  for (const [t] of readFileSync(p, 'utf8').matchAll(TEMPLATE)) {
    const re = t.split(new RegExp(`(${INTERP})`)).map((x, i) => (i % 2 ? '([^/]+)' : esc(x))).join('');
    templates.push({ re: new RegExp(`(?:^|/)${re}$`), stemFirst: t.slice(t.lastIndexOf('/') + 1).startsWith('${') });
  }
}

/** `s` as a quoted name or the last part of a path ('p1-farmers', /hat-full.webp), not inside a longer word */
const token = (s, more = '') => new RegExp(`['"\`/]${esc(s)}['"\`.${more}]`).test(corpus);

const used = (rel) => {
  const narr = rel.match(/^audio\/narration\/(en|vi)\/(.+)\.mp3$/);
  if (narr) return strings.has(narr[2]);
  const name = path.posix.basename(rel).replace(/\.[^.]+$/, '');
  if (corpus.includes(rel) || corpus.includes(rel.replace(/\.[^.]+$/, '')) || token(name)) return true;
  for (const t of templates) {
    const m = rel.match(t.re);
    if (m && (!t.stemFirst || corpus.includes(m[1]))) return true;
  }
  // a variant derived in code from a used file: its -<width> size, or one more -<word> (build-06-strap-peach-800.webp)
  const stem = name.replace(/-\d+$/, '');
  const base = stem.replace(/-[a-z]+$/, '');
  return [stem, base.includes('-') ? base : name].some((s) => s !== name && token(s, '-'));
};

const unused = [...walk(ROOT)].map((p) => p.slice(ROOT.length + 1)).filter((rel) => !used(rel));
const bytes = unused.reduce((n, rel) => n + statSync(`${ROOT}/${rel}`).size, 0);
if (unused.length) {
  console.warn(`warn  ${unused.length} files under ${ROOT} are not referenced (${(bytes / 1e6).toFixed(1)} MB):`);
  for (const rel of unused) console.warn(`      ${rel}`);
} else {
  console.log(`every file under ${ROOT} is referenced`);
}
process.exit(unused.length && process.argv.includes('--strict') ? 1 : 0);
