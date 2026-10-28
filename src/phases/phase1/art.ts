/**
 * Little picture icons for Phase 1 (pre-readers recognise the scene from the icon).
 * The scene icons are ink line drawings in `currentColor`: each one is pressed into a round
 * paper stamp under its photo (paper.css .stamp), so the stamp's ink colours them. The one
 * exception is the needle's thread, which is the red thread that sews the hat.
 */
const INK = 'fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';

export const P1_ICONS = {
  rice: `<svg viewBox="0 0 48 48" ${INK}><path d="M24 43V21M16 43c0-9 3-15 8-19M32 43c0-9-3-15-8-19"/><g fill="currentColor" stroke="none"><ellipse cx="24" cy="11" rx="3" ry="5.2"/><ellipse cx="18.5" cy="15.5" rx="2.8" ry="4.6" transform="rotate(-30 18.5 15.5)"/><ellipse cx="29.5" cy="15.5" rx="2.8" ry="4.6" transform="rotate(30 29.5 15.5)"/><ellipse cx="13.5" cy="22" rx="2.6" ry="4.2" transform="rotate(-42 13.5 22)"/><ellipse cx="34.5" cy="22" rx="2.6" ry="4.2" transform="rotate(42 34.5 22)"/></g></svg>`,
  mango: `<svg viewBox="0 0 48 48" ${INK}><path d="M23 13c10-2 18 6 17 16-1 9-9 15-18 14C12 42 6 34 8 25c2-8 8-11 15-12z"/><path d="M25 13c0-4 2-7 5-8"/><path d="M27 10c5-5 12-4 14-1-4 4-9 4-14 1z" fill="currentColor"/><path d="M14 25c2-4 5-7 9-8" stroke-width="2.2"/></svg>`,
  bike: `<svg viewBox="0 0 48 48" ${INK}><circle cx="12" cy="32" r="8"/><circle cx="36" cy="32" r="8"/><path d="M12 32l8-14h12l4 14M20 18l6 14H12M30 12h5l-3 6"/><rect x="31" y="19" width="10" height="7" rx="1.5" stroke-width="2.4"/></svg>`,
  rain: `<svg viewBox="0 0 48 48" ${INK}><path d="M13 28a8 8 0 0 1 1-16 11 11 0 0 1 21 3 7 7 0 0 1-1 13z"/><path d="M16 34l-2 6M25 34l-2 7M34 34l-2 6"/></svg>`,
  needle: `<svg viewBox="0 0 48 48" ${INK}><path d="M10 40 38 8"/><ellipse cx="35.5" cy="10.5" rx="2.4" ry="4.2" transform="rotate(42 35.5 10.5)" stroke-width="2.2"/><path d="M36 11c6 6-2 14-10 12S12 30 20 38s12-2 8-6" stroke="var(--thread, #C8392B)" stroke-width="2.6"/></svg>`,
  explore:
    '<svg viewBox="0 0 48 48"><circle cx="20" cy="20" r="13" fill="#FFF9EC" stroke="currentColor" stroke-width="4"/><path d="M30 30l11 11" stroke="currentColor" stroke-width="5.5" stroke-linecap="round"/><path d="M20 11 29 25Q20 28 11 25Z" fill="#E0A93B" stroke="#7A5A3A" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m6 12.5 3.8 3.8 8.2-9" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
} as const;

/** A friendly nón lá drawing (rings, ribs, a purple strap). `uid` keeps gradient ids unique. */
export function hatArt(uid: string): string {
  const rings: string[] = [];
  for (let k = 1; k <= 6; k++) {
    const y = 10 + (98 * k) / 7;
    const hw = (92 * k) / 7;
    rings.push(`<path d="M${100 - hw} ${y.toFixed(1)}Q100 ${(y + 3 + (20 * k) / 7).toFixed(1)} ${100 + hw} ${y.toFixed(1)}"/>`);
  }
  const ribs: string[] = [];
  for (let k = -5; k <= 5; k++) ribs.push(`<path d="M100 10L${100 + k * 16.5} ${(119 - Math.abs(k) * 1.9).toFixed(1)}"/>`);
  return `<svg viewBox="0 0 200 156" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="hs-${uid}" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#B9822A"/><stop offset=".42" stop-color="#F6DC98"/><stop offset=".62" stop-color="#EBC067"/><stop offset="1" stop-color="#A9741F"/>
    </linearGradient>
    <clipPath id="hc-${uid}"><path d="M100 8 192 108Q100 134 8 108Z"/></clipPath>
  </defs>
  <ellipse cx="100" cy="136" rx="78" ry="9" fill="#3B2A1C" opacity=".16"/>
  <path d="M42 112Q100 156 158 112" fill="none" stroke="#8E5BA8" stroke-width="4" stroke-linecap="round"/>
  <path d="M100 8 192 108Q100 134 8 108Z" fill="url(#hs-${uid})"/>
  <g clip-path="url(#hc-${uid})" fill="none" stroke="#B8862A" stroke-width="1.2" opacity=".7">${ribs.join('')}</g>
  <g fill="none" stroke="#9C6F28" stroke-width="1.6" opacity=".75">${rings.join('')}</g>
  <path d="M100 8 192 108Q100 134 8 108Z" fill="none" stroke="#6B4A2B" stroke-width="3" stroke-linejoin="round"/>
  <path d="M8 108Q100 134 192 108" fill="none" stroke="#8A3B22" stroke-width="3.4"/>
  <path d="M96 10l4-5 4 5" fill="none" stroke="#C0392B" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;
}
