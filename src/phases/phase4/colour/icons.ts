/**
 * Tool icons for the studio and the gallery (24-unit grid, stroke = currentColor). Parts filled
 * with var(--swatch) show the colour the child has picked, so the tools "hold" the paint.
 */
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

export const COLOUR_ICONS = {
  fill: `<svg viewBox="0 0 24 24" ${S}><path d="M4.5 11.5 11 5l7 7-6.5 6.5a2 2 0 0 1-2.8 0l-4.2-4.2a2 2 0 0 1 0-2.8Z" fill="#FFF9EC"/><path d="M4.6 12.4h12.6" /><path d="m11 5-2-2"/><path d="M20 15.5c0 0-2 2.4-2 3.6a2 2 0 0 0 4 0c0-1.2-2-3.6-2-3.6Z" style="fill:var(--swatch,#8E5BA8)"/></svg>`,
  brush: `<svg viewBox="0 0 24 24" ${S}><path d="M20.5 3.5c-3 1.6-7.2 5.6-9.4 8.6l1.8 1.8c3-2.2 7-6.4 8.6-9.4Z" fill="#E0A93B"/><path d="M10.6 12.6c-2.2.1-3.6 1.6-3.8 3.6-.2 1.6-1.2 2.6-3.3 3 2.4 1.8 6.6 1.6 8.3-.4 1-1.2 1.2-2.6.6-4.4Z" style="fill:var(--swatch,#8E5BA8)"/></svg>`,
  eraser: `<svg viewBox="0 0 24 24" ${S}><path d="m9 20.5-5-5a2 2 0 0 1 0-2.8L13.2 3.5a2 2 0 0 1 2.8 0l4.5 4.5a2 2 0 0 1 0 2.8L10.8 20.5Z" fill="#F4A79A"/><path d="m8.5 9 7 7"/><path d="M9 20.5h11"/></svg>`,
  undo: `<svg viewBox="0 0 24 24" ${S} stroke-width="2.4"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>`,
  redo: `<svg viewBox="0 0 24 24" ${S} stroke-width="2.4"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>`,
  clear: `<svg viewBox="0 0 24 24" ${S}><rect x="5" y="3" width="14" height="18" rx="2" fill="#FFF9EC"/><path d="m3.5 13 4-1 9-5.5 2.5 4-9 5.5-4 1.2Z" fill="#7EC8E3"/><path d="M8 18.5h3"/></svg>`,
  save: `<svg viewBox="0 0 24 24" ${S}><rect x="3" y="4" width="18" height="16" rx="2.5" fill="#FFF9EC"/><rect x="6" y="7" width="12" height="10" rx="1"/><path d="M12 15.2s-3-1.8-3-3.6A1.6 1.6 0 0 1 12 10.8a1.6 1.6 0 0 1 3 .8c0 1.8-3 3.6-3 3.6Z" fill="#E0457B" stroke="#E0457B" stroke-width="1"/></svg>`,
  gallery: `<svg viewBox="0 0 24 24" ${S}><rect x="2.5" y="5" width="12" height="10" rx="1.5" fill="#F6E7C4" transform="rotate(-6 8.5 10)"/><rect x="9.5" y="9" width="12" height="10" rx="1.5" fill="#FFF9EC" transform="rotate(5 15.5 14)"/><path d="m12 17.5 2.6-3 2 2 1.4-1.4 2 2.4" transform="rotate(5 15.5 14)"/><circle cx="17.6" cy="11.8" r="1" fill="#F6A623" stroke="none"/></svg>`,
  pages: `<svg viewBox="0 0 24 24" ${S}><rect x="3" y="3" width="8" height="8" rx="1.8" fill="#F6E7C4"/><rect x="13" y="3" width="8" height="8" rx="1.8" fill="#A9D8A0"/><rect x="3" y="13" width="8" height="8" rx="1.8" fill="#F4A79A"/><rect x="13" y="13" width="8" height="8" rx="1.8" fill="#C9B3DA"/></svg>`,
  download: `<svg viewBox="0 0 24 24" ${S} stroke-width="2.4"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" ${S} stroke-width="2.2"><path d="M4 6.5h16"/><path d="M9 6.5V4.5h6v2"/><path d="M6 6.5 7 20a1.5 1.5 0 0 0 1.5 1.4h7A1.5 1.5 0 0 0 17 20l1-13.5" fill="#FFF9EC"/><path d="M10 10.5v7M14 10.5v7"/></svg>`,
  keep: `<svg viewBox="0 0 24 24" ${S} stroke-width="2.8"><path d="m5 12 5 5 9-10"/></svg>`,
  brushDot: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" style="fill:var(--swatch,#8E5BA8)"/></svg>`,
} as const;
