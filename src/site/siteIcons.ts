/** Landing-page icons (24×24, stroke = currentColor), always paired with text for pre-readers. */
const S = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';

export const SITE_ICONS = {
  play: `<svg viewBox="0 0 24 24"><path d="M8.5 5.5v13l10-6.5z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
  clock: `<svg ${S}><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>`,
  tablet: `<svg ${S}><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M18.5 12h.01"/></svg>`,
  family: `<svg ${S}><circle cx="8" cy="6.5" r="2.6"/><path d="M3.5 20v-4.5a4.5 4.5 0 0 1 9 0V20"/><circle cx="16.8" cy="10.5" r="2"/><path d="M13.6 20v-2.6a3.2 3.2 0 0 1 6.4 0V20"/></svg>`,
  leaf: `<svg ${S}><path d="M5 19c0-8 5-13.5 14-14-.5 9-6 14-14 14z"/><path d="M5 19 13 11"/></svg>`,
  rings: `<svg ${S}><path d="M12 3.5 3 17"/><path d="M12 3.5 21 17"/><ellipse cx="12" cy="17" rx="9" ry="2.6"/><ellipse cx="12" cy="12.3" rx="5.9" ry="1.7"/><ellipse cx="12" cy="7.8" rx="3" ry="0.9"/></svg>`,
  needle: `<svg ${S}><path d="M4 20 18.5 5.5"/><ellipse cx="19.2" cy="4.8" rx="1.4" ry="1" transform="rotate(-45 19.2 4.8)"/><path d="M19 5.5c-3 4.5 2 7-1 10.5s-8 1-10 4"/></svg>`,
  star: `<svg ${S}><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  arrowUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>`,
  globe: `<svg ${S}><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5S9.5 6.1 12 3.5z"/></svg>`,
  heart: `<svg viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" fill="currentColor"/></svg>`,
  book: `<svg ${S}><path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z"/><path d="M12 6.5v13"/></svg>`,
  puzzle: `<svg ${S}><path d="M5 8h3.5a2 2 0 1 1 4 0H16v3.5a2 2 0 1 1 0 4V19H5v-3.5a2 2 0 1 0 0-4z"/></svg>`,
  camera: `<svg ${S}><path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`,
  cube: `<svg ${S}><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/></svg>`,
  sparkle: `<svg ${S}><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m12 8 1.3 2.7L16 12l-2.7 1.3L12 16l-1.3-2.7L8 12l2.7-1.3z" fill="currentColor"/></svg>`,
  brush: `<svg ${S}><path d="M20 4 10.5 13.5"/><path d="M9.5 13c-2.2 0-4 1.6-4 3.8 0 1.4-.8 2.2-2 2.7 4.6 1.2 8.4-.6 8.4-4.1z"/></svg>`,
  people: `<svg ${S}><circle cx="9" cy="8" r="3"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.3"/><path d="M15.5 14.2a4.2 4.2 0 0 1 5.5 4"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`,
  lock: `<svg ${S}><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>`,
} as const;

export type SiteIcon = keyof typeof SITE_ICONS;
