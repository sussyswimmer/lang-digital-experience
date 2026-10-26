/** Picture icons for the four layers and the panel buttons (pre-readers read pictures first). */
export const LAYER_ICONS = {
  stitches:
    '<svg viewBox="0 0 48 48"><path d="M8 36 38 10" stroke="#8A6A45" stroke-width="3.5" stroke-linecap="round"/><ellipse cx="38.5" cy="9.5" rx="3" ry="1.6" transform="rotate(-40 38.5 9.5)" fill="none" stroke="#8A6A45" stroke-width="2"/><path d="M6 40c5-8 9 4 14-4s9 4 14-4 8 2 10-1" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="3 4"/><path d="M6 40c5-8 9 4 14-4s9 4 14-4 8 2 10-1" fill="none" stroke="#C9BFA8" stroke-width="1" stroke-dasharray="3 4" stroke-dashoffset="-.5"/></svg>',
  leaves:
    '<svg viewBox="0 0 48 48"><path d="M24 4C10 14 8 30 24 44 40 30 38 14 24 4Z" fill="#E0A93B" stroke="#8C6431" stroke-width="2.4" stroke-linejoin="round"/><path d="M24 8v34M24 18l-7-5M24 26l-9-6M24 34l-8-5M24 18l7-5M24 26l9-6M24 34l8-5" stroke="#B8862A" stroke-width="1.8" stroke-linecap="round"/></svg>',
  frame:
    '<svg viewBox="0 0 48 48" fill="none" stroke-linecap="round"><path d="M24 6 4 40M24 6l20 34M24 6v36" stroke="#B8862A" stroke-width="2"/><ellipse cx="24" cy="40" rx="20" ry="4.5" stroke="#C79A55" stroke-width="3"/><ellipse cx="24" cy="31" rx="14.6" ry="3.3" stroke="#C79A55" stroke-width="2.8"/><ellipse cx="24" cy="22" rx="9.2" ry="2.2" stroke="#C79A55" stroke-width="2.6"/><ellipse cx="24" cy="13.5" rx="4.4" ry="1.1" stroke="#C79A55" stroke-width="2.4"/></svg>',
  strap:
    '<svg viewBox="0 0 48 48"><path d="M24 4 44 26Q24 32 4 26Z" fill="#E0A93B" stroke="#8C6431" stroke-width="2.4" stroke-linejoin="round"/><path d="M9 27q15 26 30 0" fill="none" stroke="#8E5BA8" stroke-width="4" stroke-linecap="round"/><circle cx="9" cy="27" r="3" fill="#6E4A86"/><circle cx="39" cy="27" r="3" fill="#6E4A86"/></svg>',
} as const;

export const PANEL_ICONS = {
  hand: '<svg viewBox="0 0 64 64"><path d="M24 30V12a5 5 0 0 1 10 0v14l2-1a5 5 0 0 1 6 2l1 1a5 5 0 0 1 6 2l1 1a5 5 0 0 1 6 3v12c0 9-7 16-16 16h-4c-6 0-11-3-14-8l-8-13a4.5 4.5 0 0 1 7-5z" fill="#FFF9EC" stroke="#6B4A2B" stroke-width="3.5" stroke-linejoin="round"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill="#F6A623" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 8"/></svg>',
  thread: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#FBFAF6" stroke="#C9BFA8" stroke-width="2"/><path d="M6 12h12M7.5 8h9M7.5 16h9" stroke="#C9BFA8" stroke-width="1.4"/></svg>',
  redThread: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#C0261C" stroke="#C9A15A" stroke-width="2.4"/><path d="M6 12h12M7.5 8h9M7.5 16h9" stroke="#F4A79A" stroke-width="1.4"/></svg>',
} as const;
