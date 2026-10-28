/** Stroke icons for Phase 4 buttons (currentColor), always shown next to their text. */
const s = (body: string, w = 2.4) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const P4_ICONS = {
  grid: s('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'),
  again: s('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>'),
  download: s('<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>'),
  pdf: s('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h4"/>'),
  print: s('<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>'),
  pencil: s('<path d="M4 20l1-5L16 4l4 4L9 19z"/><path d="M14 6l4 4"/>'),
  photo: s('<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 8"/>'),
  layers: s('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>'),
  book: s('<path d="M4 5c3-1.5 5.5-1.5 8 0v15c-2.5-1.5-5-1.5-8 0z"/><path d="M12 5c2.5-1.5 5-1.5 8 0v15c-3-1.5-5.5-1.5-8 0"/>'),
  frame: s('<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="10" height="10" rx="1"/><path d="m7 15 3-3 2 2 2-3 3 4"/>', 2),
  scroll: s('<path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8"/><path d="M6 4a2 2 0 0 0-2 2v2h4V6a2 2 0 0 0-2-2z"/><path d="M8 20a2 2 0 0 1-2-2V8"/><path d="M11 9h5M11 13h5"/>'),
  medal: s('<path d="M8 3l2.5 6M16 3l-2.5 6"/><circle cx="12" cy="15" r="6"/><path d="m12 12 1 2h2l-1.6 1.3.6 2.2-2-1.3-2 1.3.6-2.2L9 14h2z" fill="currentColor" stroke-width="1"/>'),
  speaker: s('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6"/>'),
  close: s('<path d="M6 6l12 12M18 6 6 18"/>', 2.8),
  next: s('<path d="M9 5l7 7-7 7"/>', 2.8),
  /* one-ink stamps for the hub's paper tags: a nón lá, a brush, a question, a certificate */
  hat: s('<path d="M12 4.5 20 15.5Q12 18.6 4 15.5Z"/><path d="M7.2 17.2c1.4 2.6 8.2 2.6 9.6 0"/>', 2.2),
  brush: s('<path d="M19.5 4.5 11.5 12.5"/><path d="M12.6 11.4 14.6 13.4 11 17c-1.5 1.5-3.8 1.6-6 .8 1-2 .8-4.3 2.4-6z"/>', 2.2),
  question: s('<path d="M9.1 9.3a2.9 2.9 0 1 1 4.2 2.6c-.9.5-1.3 1.1-1.3 2v1.1"/><path d="M12 18.6h.01"/>', 2.4),
  cert: s('<rect x="3.5" y="5" width="17" height="12" rx="2"/><path d="M7 9h10M7 12.5h5.5"/><circle cx="16.5" cy="15.5" r="2.4"/><path d="m15 17.6-.8 3.4 2.3-1.3 2.3 1.3-.8-3.4"/>', 2),
} as const;

/** coloured picture icons (pre-readers recognise the picture) */
export const P4_PICTURES = {
  stitches:
    '<svg viewBox="0 0 48 48"><path d="M8 38 40 10" stroke="#8A8F98" stroke-width="3" stroke-linecap="round"/><ellipse cx="38" cy="12" rx="2.4" ry="4" transform="rotate(48 38 12)" fill="#fff" stroke="#6B7078" stroke-width="1.6"/><path d="M38 12c6 6-4 12-10 10S12 30 18 38" fill="none" stroke="#C0392B" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="4 3"/></svg>',
  leaves:
    '<svg viewBox="0 0 48 48"><path d="M24 44C10 32 10 14 24 4c14 10 14 28 0 40z" fill="#E9BF62" stroke="#9C6A1C" stroke-width="2"/><path d="M24 8v34M24 18l-7-5M24 26l-8-5M24 18l7-5M24 26l8-5" stroke="#9C6A1C" stroke-width="1.6" stroke-linecap="round"/></svg>',
  frame:
    '<svg viewBox="0 0 48 48"><g fill="none" stroke="#B98339" stroke-width="2.2" stroke-linecap="round"><path d="M24 6 4 36M24 6l20 30M24 6v34M24 6 12 39M24 6l12 33"/><ellipse cx="24" cy="36" rx="20" ry="5"/><ellipse cx="24" cy="26" rx="13.3" ry="3.4"/><ellipse cx="24" cy="16" rx="6.7" ry="1.8"/></g></svg>',
  strap:
    '<svg viewBox="0 0 48 48"><path d="M24 6 44 30Q24 36 4 30Z" fill="#E9BF62" stroke="#7A5226" stroke-width="2" stroke-linejoin="round"/><path d="M11 32c4 13 22 13 26 0" fill="none" stroke="#8E5BA8" stroke-width="3.4" stroke-linecap="round"/></svg>',
  sun: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="9" fill="#F6A623" stroke="#C2731A" stroke-width="2"/><g stroke="#F6A623" stroke-width="3" stroke-linecap="round"><path d="M24 4v6M24 38v6M4 24h6M38 24h6M10 10l4 4M34 34l4 4M38 10l-4 4M14 34l-4 4"/></g></svg>',
  poem: '<svg viewBox="0 0 48 48"><rect x="2" y="2" width="44" height="44" rx="10" fill="#12301F"/><path d="M24 8 42 34Q24 40 6 34Z" fill="#F6DC98" stroke="#E0A93B" stroke-width="1.5"/><g fill="#5A3F28"><circle cx="20" cy="22" r="2.2"/><path d="M18 25h4l3 9h-10z"/><path d="M27 31q4 3 8 0z"/></g><g stroke="#5A3F28" stroke-width="1.4" stroke-linecap="round"><path d="M27 20h5M27 24h4"/></g></svg>',
  rain: '<svg viewBox="0 0 48 48"><path d="M13 26a8 8 0 0 1 1-16 11 11 0 0 1 21 3 7 7 0 0 1-1 13z" fill="#FFF9EC" stroke="#5B7FA3" stroke-width="2.4" stroke-linejoin="round"/><g stroke="#3F8FC4" stroke-width="3" stroke-linecap="round"><path d="M16 32l-2 5M25 32l-2 6M34 32l-2 5"/></g><path d="M18 46l6-8 6 8z" fill="#E0A93B"/></svg>',
  photos:
    '<svg viewBox="0 0 48 48"><rect x="4" y="10" width="28" height="22" rx="3" fill="#7EC8E3" stroke="#2F5D46" stroke-width="2" transform="rotate(-8 18 21)"/><rect x="16" y="16" width="28" height="22" rx="3" fill="#FFF9EC" stroke="#2F5D46" stroke-width="2"/><path d="M30 20 39 32Q30 35 21 32Z" fill="#E0A93B" stroke="#7A5226" stroke-width="1.4"/><path d="M17 37l7-7 4 4" fill="none" stroke="#7FBF5E" stroke-width="2"/></svg>',
  layers:
    '<svg viewBox="0 0 48 48"><path d="M24 4 44 30Q24 38 4 30Z" fill="#E9BF62" stroke="#7A5226" stroke-width="2" stroke-linejoin="round"/><path d="M24 4 34 17Q24 21 14 17Z" fill="#F6DC98" opacity=".8"/><g fill="none" stroke="#B98339" stroke-width="1.6"><path d="M9 26q15 6 30 0M14 20q10 4 20 0"/></g><path d="M38 36l4 4M6 36l-4 4" stroke="#C21F66" stroke-width="3" stroke-linecap="round"/></svg>',
  book: '<svg viewBox="0 0 48 48"><path d="M6 10c6-3 12-3 18 0v30c-6-3-12-3-18 0z" fill="#1F4D3A" stroke="#12301F" stroke-width="2" stroke-linejoin="round"/><path d="M24 10c6-3 12-3 18 0v30c-6-3-12-3-18 0z" fill="#2F5D46" stroke="#12301F" stroke-width="2" stroke-linejoin="round"/><path d="M15 16 21 26Q15 28 9 26Z" fill="#E0A93B"/><path d="M29 18h9M29 23h8M29 28h9" stroke="#F6DC98" stroke-width="1.8" stroke-linecap="round"/></svg>',
  gallery:
    '<svg viewBox="0 0 48 48"><rect x="4" y="6" width="40" height="36" rx="4" fill="#7A5A3A"/><rect x="9" y="11" width="30" height="26" rx="2" fill="#FFF9EC"/><path d="M24 14 36 31Q24 35 12 31Z" fill="#E0457B" stroke="#7A5226" stroke-width="1.4"/><path d="M15 27q9 4 18 0" stroke="#8E5BA8" stroke-width="3" fill="none"/><path d="M18 22q6 2 12 0" stroke="#7FBF5E" stroke-width="3" fill="none"/></svg>',
  crayon:
    '<svg viewBox="0 0 48 48"><g transform="rotate(-40 24 24)"><rect x="6" y="18" width="30" height="12" rx="3" fill="#8E5BA8" stroke="#5E3A73" stroke-width="2"/><path d="M36 18l9 6-9 6z" fill="#F4A79A" stroke="#5E3A73" stroke-width="2" stroke-linejoin="round"/><rect x="12" y="18" width="5" height="12" fill="#FFF9EC" opacity=".6"/></g><path d="M8 42q8-6 16-1t16-3" fill="none" stroke="#7FBF5E" stroke-width="3.4" stroke-linecap="round"/></svg>',
  question:
    '<svg viewBox="0 0 48 48"><path d="M6 10a6 6 0 0 1 6-6h24a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H22l-9 9v-9h-1a6 6 0 0 1-6-6z" fill="#2F5D46"/><path d="M19 15a5 5 0 1 1 7 4.6c-1.4.6-2 1.6-2 3V24" fill="none" stroke="#FFF4D6" stroke-width="3.4" stroke-linecap="round"/><circle cx="24" cy="29" r="2.2" fill="#FFF4D6"/></svg>',
  maker:
    '<svg viewBox="0 0 56 56"><circle cx="28" cy="28" r="27" fill="#2F5D46"/><circle cx="28" cy="33" r="14" fill="#F2C9A0"/><path d="M14 31c0-9 6-13 14-13s14 4 14 13c-3-5-8-7-14-7s-11 2-14 7z" fill="#B9B4AE"/><circle cx="23" cy="33" r="1.8" fill="#3B2A1C"/><circle cx="33" cy="33" r="1.8" fill="#3B2A1C"/><path d="M23 39q5 4 10 0" fill="none" stroke="#A9472A" stroke-width="2" stroke-linecap="round"/><circle cx="19" cy="37" r="2.4" fill="#E8907A" opacity=".5"/><circle cx="37" cy="37" r="2.4" fill="#E8907A" opacity=".5"/><path d="M28 3 50 21Q28 26 6 21Z" fill="#E9BF62" stroke="#7A5226" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 18q14 4 28 0" fill="none" stroke="#B8862A" stroke-width="1.2"/></svg>',
  certificate:
    '<svg viewBox="0 0 48 48"><rect x="4" y="8" width="40" height="30" rx="3" fill="#FFF9EC" stroke="#A9472A" stroke-width="2.4"/><path d="M11 16h26M14 22h20M16 27h16" stroke="#7A5A3A" stroke-width="2" stroke-linecap="round"/><circle cx="34" cy="34" r="7" fill="#E0A93B" stroke="#B8862A" stroke-width="1.6"/><path d="M30 39l-2 7 6-3 6 3-2-7" fill="#C21F66"/></svg>',
} as const;
