// Writes docs/vi-review.csv for the Vietnamese review (Meri): one row per string, English beside
// the Vietnamese draft, with an empty "corrected" column. Re-import by pasting corrections into
// content/strings/<file>.json and setting viStatus to "reviewed".
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';

const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
const rows = [['file', 'id', 'kind', 'english', 'vietnamese_draft', 'status', 'corrected_vietnamese', 'comment']];
for (const f of readdirSync('content/strings').filter((x) => x.endsWith('.json')).sort()) {
  for (const [id, e] of Object.entries(JSON.parse(readFileSync(`content/strings/${f}`, 'utf8')))) {
    rows.push([f, id, e.kind, e.en, e.vi, e.viStatus ?? 'machine', '', '']);
  }
}
mkdirSync('docs', { recursive: true });
// UTF-8 BOM so Excel and Google Sheets open the diacritics correctly
writeFileSync('docs/vi-review.csv', '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n');
console.log(`docs/vi-review.csv: ${rows.length - 1} strings`);
