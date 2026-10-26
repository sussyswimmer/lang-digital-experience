/** Little picture icons for Phase 1 (pre-readers recognise the scene from the icon). */
export const P1_ICONS = {
  rice: '<svg viewBox="0 0 48 48"><path d="M24 44V20M16 44c0-10 2-16 8-20M32 44c0-10-2-16-8-20" fill="none" stroke="#4E8A3A" stroke-width="3.2" stroke-linecap="round"/><g fill="#E0A93B" stroke="#B8862A" stroke-width="1.2"><ellipse cx="24" cy="10" rx="3.2" ry="5"/><ellipse cx="18.5" cy="15" rx="3" ry="4.6" transform="rotate(-28 18.5 15)"/><ellipse cx="29.5" cy="15" rx="3" ry="4.6" transform="rotate(28 29.5 15)"/><ellipse cx="13" cy="22" rx="2.8" ry="4.2" transform="rotate(-40 13 22)"/><ellipse cx="35" cy="22" rx="2.8" ry="4.2" transform="rotate(40 35 22)"/></g></svg>',
  mango: '<svg viewBox="0 0 48 48"><path d="M24 12c10-2 18 6 17 16-1 9-9 15-18 14C13 41 7 33 9 24c2-8 8-11 15-12z" fill="#F6A623" stroke="#C2731A" stroke-width="2"/><path d="M14 22c2-4 6-6 10-6" fill="none" stroke="#FFE0A0" stroke-width="3" stroke-linecap="round"/><path d="M25 12c0-4 2-7 5-8" fill="none" stroke="#6B4A2B" stroke-width="2.4" stroke-linecap="round"/><path d="M27 9c5-5 12-4 14-1-4 4-9 4-14 1z" fill="#7FBF5E" stroke="#4E8A3A" stroke-width="1.6"/></svg>',
  bike: '<svg viewBox="0 0 48 48"><g fill="none" stroke="#1F4D3A" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="32" r="8"/><circle cx="36" cy="32" r="8"/><path d="M12 32l8-14h12l4 14M20 18l6 14h-14M30 12h5l-3 6"/></g><rect x="31" y="20" width="10" height="7" rx="1.5" fill="#E0A93B" stroke="#7A5A3A" stroke-width="1.6"/></svg>',
  rain: '<svg viewBox="0 0 48 48"><path d="M13 28a8 8 0 0 1 1-16 11 11 0 0 1 21 3 7 7 0 0 1-1 13z" fill="#FFF9EC" stroke="#5B7FA3" stroke-width="2.4" stroke-linejoin="round"/><g stroke="#3F8FC4" stroke-width="3" stroke-linecap="round"><path d="M16 34l-2 5M25 34l-2 6M34 34l-2 5"/></g></svg>',
  needle: '<svg viewBox="0 0 48 48"><path d="M10 40 38 8" stroke="#7A5A3A" stroke-width="3" stroke-linecap="round"/><ellipse cx="36" cy="10" rx="2.6" ry="4.4" transform="rotate(42 36 10)" fill="#FFF9EC" stroke="#7A5A3A" stroke-width="1.8"/><path d="M36 10c6 6-2 14-10 12S12 30 20 38s12-2 8-6" fill="none" stroke="#A9472A" stroke-width="2.4" stroke-linecap="round"/></svg>',
  explore:
    '<svg viewBox="0 0 48 48"><circle cx="20" cy="20" r="13" fill="#FFF9EC" stroke="currentColor" stroke-width="4"/><path d="M30 30l11 11" stroke="currentColor" stroke-width="5.5" stroke-linecap="round"/><path d="M20 11 29 25Q20 28 11 25Z" fill="#E0A93B" stroke="#7A5A3A" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#2F5D46"/><path d="m6.5 12.5 3.6 3.6 7.4-8" fill="none" stroke="#FFF9EC" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
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
