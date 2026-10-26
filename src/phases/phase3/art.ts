/** Picture icons and drawings for the storybook (every button pairs one of these with its text). */
export const P3_ICONS = {
  sun: '<svg viewBox="0 0 48 48"><g stroke="#F6A623" stroke-width="3.4" stroke-linecap="round"><path d="M24 3v6M24 39v6M3 24h6M39 24h6M9 9l4 4M35 35l4 4M9 39l4-4M35 13l4-4"/></g><circle cx="24" cy="24" r="10.5" fill="#FFD25E" stroke="#E0902B" stroke-width="2.2"/></svg>',
  lantern:
    '<svg viewBox="0 0 48 48"><path d="M24 4v5" stroke="#7A5A3A" stroke-width="2.6" stroke-linecap="round"/><path d="M14 13h20l-2 26H16z" fill="#FFD27A" stroke="#A9472A" stroke-width="2.4" stroke-linejoin="round"/><path d="M18 20h12M17.5 27h13M17 33h14" stroke="#E0902B" stroke-width="1.6"/><path d="M12 13h24M14 39h20" stroke="#7A5A3A" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="26" r="13" fill="#FFE29A" opacity=".35"/></svg>',
  rain: '<svg viewBox="0 0 48 48"><path d="M12 27a8 8 0 0 1 1-16 11 11 0 0 1 21 3 7 7 0 0 1-1 13z" fill="#FFF9EC" stroke="#4A6E91" stroke-width="2.6" stroke-linejoin="round"/><g stroke="#3F8FC4" stroke-width="3.2" stroke-linecap="round"><path d="M15 33l-2.5 6M24 33l-2.5 7M33 33l-2.5 6"/></g></svg>',
  count:
    '<svg viewBox="0 0 48 48"><circle cx="16" cy="16" r="11" fill="#A9472A"/><text x="16" y="21" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="15" fill="#FFF9EC">1</text><circle cx="33" cy="30" r="11" fill="#2F5D46"/><text x="33" y="35" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="15" fill="#FFF9EC">2</text></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>',
  again: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v5h5"/></svg>',
  star: '<svg viewBox="0 0 48 48"><path d="M24 4l6 13 14 1.6-10.5 9.5 3 14L24 35l-12.5 7.1 3-14L4 18.6 18 17z" fill="#FFD25E" stroke="#C2731A" stroke-width="2.4" stroke-linejoin="round"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  book: '<svg viewBox="0 0 48 48"><path d="M6 10c7-2 13-1 18 3 5-4 11-5 18-3v28c-7-2-13-1-18 3-5-4-11-5-18-3z" fill="#FFF9EC" stroke="#1F4D3A" stroke-width="2.8" stroke-linejoin="round"/><path d="M24 13v28" stroke="#1F4D3A" stroke-width="2.4"/></svg>',
  hand: '<svg viewBox="0 0 64 64"><path d="M24 30V12a5 5 0 0 1 10 0v14l2-1a5 5 0 0 1 6 2l1 1a5 5 0 0 1 6 2l1 1a5 5 0 0 1 6 3v12c0 9-7 16-16 16h-4c-6 0-11-3-14-8l-8-13a4.5 4.5 0 0 1 7-5z" fill="#FFF9EC" stroke="#6B4A2B" stroke-width="3.4" stroke-linejoin="round"/></svg>',
  ch1: '<svg viewBox="0 0 48 48"><circle cx="34" cy="13" r="7" fill="#FFD25E" stroke="#E0902B" stroke-width="2"/><path d="M6 38c6-3 12-3 18 0s12 3 18 0" fill="none" stroke="#7FBF5E" stroke-width="3" stroke-linecap="round"/><path d="M20 14 31 30Q20 34 9 30Z" fill="#E0A93B" stroke="#7A5A3A" stroke-width="2" stroke-linejoin="round"/></svg>',
  ch2: '<svg viewBox="0 0 48 48"><circle cx="24" cy="26" r="18" fill="#FFE29A" opacity=".5"/><path d="M24 8 42 34Q24 41 6 34Z" fill="#F6DC98" stroke="#7A5A3A" stroke-width="2.2" stroke-linejoin="round"/><path d="M19 22v8M17 30h4M27 24c1 3 0 6-2 7M30 27c1 2 0 4-1 5" stroke="#5A3F28" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>',
  ch3: '<svg viewBox="0 0 48 48"><path d="M12 8 22 22Q12 25 2 22Z" fill="#E0A93B" stroke="#7A5A3A" stroke-width="1.8" stroke-linejoin="round"/><path d="M36 8 46 22Q36 25 26 22Z" fill="#E0A93B" stroke="#7A5A3A" stroke-width="1.8" stroke-linejoin="round"/><path d="M24 20 34 34Q24 37 14 34Z" fill="#E0A93B" stroke="#7A5A3A" stroke-width="1.8" stroke-linejoin="round"/><g stroke="#3F8FC4" stroke-width="2.2" stroke-linecap="round"><path d="M8 30l-1 3M41 30l-1 3M24 40l-1 4"/></g></svg>',
} as const;

/** a smiling sun for Chapter 1 (the child drags it across the sky) */
export const SUN_ART = `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="sunfill" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#FFF3B0"/><stop offset=".55" stop-color="#FFD25E"/><stop offset="1" stop-color="#F6A623"/></radialGradient>
    <radialGradient id="sunglow"><stop offset=".45" stop-color="#FFE08A" stop-opacity=".85"/><stop offset="1" stop-color="#FFC94A" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="60" cy="60" r="60" fill="url(#sunglow)"/>
  <g class="sun-rays" stroke="#F6A623" stroke-width="7" stroke-linecap="round">
    <path d="M60 4v14M60 102v14M4 60h14M102 60h14M20 20l10 10M90 90l10 10M20 100l10-10M90 30l10-10"/>
  </g>
  <circle cx="60" cy="60" r="31" fill="url(#sunfill)" stroke="#E0902B" stroke-width="3"/>
  <circle cx="49" cy="56" r="3.6" fill="#5A3F28"/><circle cx="71" cy="56" r="3.6" fill="#5A3F28"/>
  <circle cx="44" cy="67" r="5" fill="#F4A79A" opacity=".8"/><circle cx="76" cy="67" r="5" fill="#F4A79A" opacity=".8"/>
  <path d="M50 68q10 9 20 0" fill="none" stroke="#5A3F28" stroke-width="3.4" stroke-linecap="round"/>
</svg>`;
