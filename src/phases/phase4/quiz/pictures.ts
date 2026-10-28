/**
 * Answer pictures for the Memory Quiz, drawn in code until the Blender/Higgsfield pictures land at
 * img/quiz/<imageId>.webp. Every answer has a picture so children who can't read yet can play.
 * viewBox 0 0 240 180 (4:3, like the renders), drawn on a transparent background so they letterbox
 * cleanly on the card's own soft backdrop.
 */
import { frame, fullHat, outerLeaves, shadow, stitches, strap, svgDoc, type Cone } from '../hub/hat';
import { STRAP_COLOURS } from '../hub/hat';

const VB = '0 0 240 180';
const HAT: Cone = { cx: 120, apexY: 26, brimY: 116, rx: 100, ry: 22 };
const PURPLE = STRAP_COLOURS.purple;

const sparkle = (x: number, y: number, s: number, fill = '#FFF') =>
  `<path d="M${x} ${y - s}Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y}Q${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s}Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y}Q${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s}Z" fill="${fill}"/>`;

const wind = `<g fill="none" stroke="#7EC8E3" stroke-width="4" stroke-linecap="round" opacity=".9"><path d="M6 40h40a10 10 0 1 0-10-10"/><path d="M190 150h36a8 8 0 1 1-8 8"/><path d="M8 140h30"/></g>`;

function numeral(n: number): string {
  const w = n >= 10 ? 62 : 44;
  return `<g transform="translate(14 12)"><rect width="${w}" height="44" rx="22" fill="#1F4D3A"/><text x="${w / 2}" y="32" text-anchor="middle" font-family="'Be Vietnam Pro',system-ui,sans-serif" font-weight="700" font-size="30" fill="#FFF4D6">${n}</text></g>`;
}

const ART: Record<string, (uid: string) => string> = {
  // Q1: which part keeps the hat on in the wind?
  thread: () =>
    svgDoc(
      VB,
      `
      <ellipse cx="96" cy="160" rx="54" ry="8" fill="#3B2A1C" opacity=".14"/>
      <rect x="62" y="52" width="68" height="100" rx="8" fill="#F7F3EA" stroke="#C9C1AE" stroke-width="2.5"/>
      <g stroke="#DAD3C2" stroke-width="2.4">${[64, 76, 88, 100, 112, 124, 136].map((y) => `<path d="M65 ${y}h62"/>`).join('')}</g>
      <ellipse cx="96" cy="52" rx="42" ry="11" fill="#B98339" stroke="#8E6128" stroke-width="2.5"/><ellipse cx="96" cy="152" rx="42" ry="11" fill="#B98339" stroke="#8E6128" stroke-width="2.5"/>
      <ellipse cx="96" cy="52" rx="8" ry="2.6" fill="#6B4A2B"/>
      <path d="M130 84c26-8 46 10 34 30s-44 16-34 40" fill="none" stroke="#FFFDF5" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M130 84c26-8 46 10 34 30s-44 16-34 40" fill="none" stroke="#9E9682" stroke-width="1" stroke-dasharray="3 4"/>
      <path d="M170 20 214 150" stroke="#8A8F98" stroke-width="4.4" stroke-linecap="round"/><ellipse cx="172" cy="27" rx="2.6" ry="6" transform="rotate(-19 172 27)" fill="#fff" stroke="#6B7078" stroke-width="1.8"/>`,
    ),
  leaves: () =>
    svgDoc(
      VB,
      `
      <ellipse cx="120" cy="164" rx="70" ry="9" fill="#3B2A1C" opacity=".14"/>
      ${[-36, -12, 12, 36].map((d, i) => `<g transform="translate(120 98) rotate(${d})"><path d="M0 -76C26 -36 24 30 0 62C-24 30 -26 -36 0 -76z" fill="${['#E4B455', '#F3D58C', '#EECB76', '#E9BF62'][i]}" stroke="#9C6A1C" stroke-width="2.4"/><path d="M0 -68V56" stroke="#9C6A1C" stroke-width="1.8"/><g stroke="#9C6A1C" stroke-width="1.2" opacity=".7"><path d="M0 -36l14-8M0 -36l-14-8M0 -8l16-8M0 -8l-16-8M0 20l14-8M0 20l-14-8"/></g></g>`).join('')}
      ${sparkle(64, 44, 7)}`,
    ),
  strap: (u) => svgDoc(VB, `${wind}<g transform="translate(0 6)">${fullHat(HAT, u, PURPLE)}</g>`),

  // Q2: what if the bamboo rings disappeared?
  floppy: (u) =>
    svgDoc(
      VB,
      `
      <ellipse cx="120" cy="150" rx="104" ry="12" fill="#3B2A1C" opacity=".16"/>
      <defs><linearGradient id="fl-${u}" x1="0" x2="1"><stop offset="0" stop-color="#A9741F"/><stop offset=".45" stop-color="#F3D58C"/><stop offset="1" stop-color="#A9741F"/></linearGradient></defs>
      <path d="M150 64C140 58 132 70 126 84C112 104 70 118 20 132Q30 146 70 146Q120 156 170 144Q214 140 222 130C190 120 170 104 164 88C160 76 162 68 150 64Z" fill="url(#fl-${u})" stroke="#7A5226" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M150 64c10-2 22 4 26 14" fill="none" stroke="#7A5226" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M176 78c4 6 3 12-2 14" fill="none" stroke="#7A5226" stroke-width="2.4" stroke-linecap="round"/>
      <g fill="none" stroke="#B2832E" stroke-width="1.4" opacity=".8"><path d="M140 72C120 100 80 124 50 138"/><path d="M146 76C140 104 120 130 104 148"/><path d="M154 78C160 106 170 128 186 142"/></g>
      <g fill="none" stroke="#7A5A3A" stroke-width="2.4" stroke-linecap="round" opacity=".55"><path d="M30 92q6-8 0-16M210 92q-6-8 0-16"/></g>`,
    ),
  shiny: (u) =>
    svgDoc(
      VB,
      `<g transform="translate(0 6)">${shadow(HAT, u)}${strap(HAT, PURPLE, { uid: u })}${outerLeaves(HAT, u, { shine: true })}${stitches(HAT)}</g>
      ${sparkle(58, 52, 12)}${sparkle(176, 40, 9)}${sparkle(196, 96, 13)}${sparkle(84, 102, 7)}${sparkle(30, 30, 6, '#F6A623')}${sparkle(214, 22, 7, '#F6A623')}`,
    ),
  tight: (u) =>
    svgDoc(
      VB,
      `<g transform="translate(0 -6)">${shadow(HAT, u)}${strap(HAT, PURPLE, { uid: u, tight: true })}${outerLeaves(HAT, u)}${stitches(HAT)}</g>
      <g fill="none" stroke="#A9472A" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M40 150h26m-10-9 10 9-10 9"/><path d="M200 150h-26m10-9-10 9 10 9"/></g>`,
    ),

  // Q3: why not a torn, brittle leaf?
  gap: (u) =>
    svgDoc(
      VB,
      `
      <path d="M30 26a12 12 0 0 1 4-23 16 16 0 0 1 30 4 10 10 0 0 1 0 19z" fill="#FFF" stroke="#9DB4C4" stroke-width="2"/>
      <g transform="translate(0 14)">${fullHat(HAT, u, PURPLE)}
      <path d="M120 40 L106 66 L114 70 L100 104 L128 110 L126 82 L134 78 Z" fill="#5A3F28"/>
      <path d="M120 40 L106 66 L114 70 L100 104" fill="none" stroke="#7A5226" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M120 40 L134 78 L126 82 L128 110" fill="none" stroke="#7A5226" stroke-width="2.4" stroke-linejoin="round"/></g>
      <g fill="#3F8FC4">${[
        [44, 40],
        [60, 58],
        [116, 30],
        [176, 34],
        [196, 58],
        [116, 74],
      ]
        .map(([x, y]) => `<path d="M${x} ${y}q5 8 0 11q-5-3 0-11z"/>`)
        .join('')}</g>`,
    ),
  tinyRings: () =>
    svgDoc(
      VB,
      `<ellipse cx="120" cy="150" rx="92" ry="10" fill="#3B2A1C" opacity=".14"/>
      <g transform="translate(0 14)">${frame(HAT, { rings: 10, ribs: 12, scale: 0.42 })}</g>
      <g fill="none" stroke="#A9472A" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M28 120l26-14m-12-2 12 2-4 12"/><path d="M212 120l-26-14m12-2-12 2 4 12"/></g>`,
    ),
  strapColour: (u) =>
    svgDoc(
      VB,
      `<g transform="translate(0 2)">${shadow(HAT, u)}${strap(HAT, STRAP_COLOURS.green, { uid: u })}${outerLeaves(HAT, u)}${stitches(HAT)}</g>
      <g transform="translate(196 30)"><path d="M0 -18q12 16 12 24a12 12 0 0 1-24 0q0-8 12-24z" fill="${STRAP_COLOURS.peach}" stroke="#A9472A" stroke-width="2"/></g>
      <g transform="translate(40 34)"><path d="M0 -14q9 12 9 18a9 9 0 0 1-18 0q0-6 9-18z" fill="${PURPLE}" stroke="#5E3A73" stroke-width="2"/></g>
      <path d="M60 52q20-14 44-6" fill="none" stroke="#7A5A3A" stroke-width="3" stroke-dasharray="4 5" stroke-linecap="round"/>`,
    ),

  // Q4: how many rings?
  rings8: () => ringFrame(8),
  rings16: () => ringFrame(16),
  rings30: () => ringFrame(30),

  // Q5: what is hidden between the leaves?
  poems: (u) =>
    svgDoc(
      VB,
      `<rect x="8" y="6" width="224" height="168" rx="18" fill="#12301F"/>
      <defs><radialGradient id="glow-${u}"><stop offset="0" stop-color="#FFE6A6" stop-opacity=".9"/><stop offset="1" stop-color="#FFE6A6" stop-opacity="0"/></radialGradient>
      <linearGradient id="lit-${u}" x1="0" x2="1"><stop offset="0" stop-color="#E9B95A"/><stop offset=".5" stop-color="#FFF0C2"/><stop offset="1" stop-color="#E9B95A"/></linearGradient></defs>
      <ellipse cx="120" cy="92" rx="110" ry="78" fill="url(#glow-${u})"/>
      <path d="M120 22 220 118Q120 146 20 118Z" fill="url(#lit-${u})" stroke="#E0A93B" stroke-width="2"/>
      <g fill="#5A3F28" opacity=".85"><path d="M88 62l-9 8h18z"/><circle cx="88" cy="75" r="5"/><path d="M83 81h10l6 32q-11 5-22 0z"/>
      <path d="M140 112q16 10 32 0q-16 4-32 0z"/><path d="M156 112V96l9 13z"/>
      <path d="M118 120q-9-12 0-20q9 8 0 20zM118 120q-14-3-13-14q9 2 13 14zM118 120q14-3 13-14q-9 2-13 14z"/></g>
      <g stroke="#5A3F28" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="3.4 2.6" opacity=".85"><path d="M120 60h34M122 72h28M124 84h32M126 96h22"/></g>
      ${sparkle(30, 30, 7, '#FFE6A6')}${sparkle(208, 40, 9, '#FFE6A6')}`,
    ),
  coins: () =>
    svgDoc(
      VB,
      `<ellipse cx="120" cy="152" rx="80" ry="10" fill="#3B2A1C" opacity=".14"/>
      ${[
        [84, 112, 0],
        [148, 116, -8],
        [116, 76, 10],
      ]
        .map(
          ([x, y, r]) =>
            `<g transform="translate(${x} ${y}) rotate(${r})"><circle r="38" fill="#C99A2E"/><circle r="36" fill="#F2C94C" stroke="#B8862A" stroke-width="3"/><circle r="29" fill="none" stroke="#B8862A" stroke-width="2"/><rect x="-9" y="-9" width="18" height="18" fill="#7A5226" stroke="#B8862A" stroke-width="2"/><g fill="#B8862A"><rect x="-3" y="-25" width="6" height="9" rx="1"/><rect x="-3" y="16" width="6" height="9" rx="1"/><rect x="-25" y="-3" width="9" height="6" rx="1"/><rect x="16" y="-3" width="9" height="6" rx="1"/></g><path d="M-26 -12a30 30 0 0 1 14-14" fill="none" stroke="#FFF7D6" stroke-width="4" stroke-linecap="round"/></g>`,
        )
        .join('')}${sparkle(196, 42, 9)}`,
    ),
  rice: () => {
    const grains: string[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI;
      const r = Math.sqrt(rnd());
      const x = 120 + Math.cos(a) * r * 78 * (rnd() > 0.5 ? 1 : -1);
      const y = 150 - Math.sin(a) * r * 46;
      grains.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="6" ry="3.2" transform="rotate(${(rnd() * 180).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${rnd() > 0.5 ? '#E8C877' : '#D9B25C'}" stroke="#A9832F" stroke-width="1"/>`);
    }
    return svgDoc(
      VB,
      `<ellipse cx="120" cy="156" rx="90" ry="10" fill="#3B2A1C" opacity=".14"/>${grains.join('')}
      <path d="M200 160C196 110 186 70 166 40" fill="none" stroke="#7A8F3A" stroke-width="3.4" stroke-linecap="round"/>
      ${[0, 1, 2, 3, 4, 5]
        .map((i) => `<ellipse cx="${(170 + i * 4.5).toFixed(1)}" cy="${(46 + i * 14).toFixed(1)}" rx="6" ry="3.4" transform="rotate(${-50 + i * 4} ${(170 + i * 4.5).toFixed(1)} ${(46 + i * 14).toFixed(1)})" fill="#E0B44E" stroke="#A9832F"/><ellipse cx="${(160 + i * 5).toFixed(1)}" cy="${(52 + i * 14).toFixed(1)}" rx="6" ry="3.4" transform="rotate(${40 - i * 4} ${(160 + i * 5).toFixed(1)} ${(52 + i * 14).toFixed(1)})" fill="#E8C877" stroke="#A9832F"/>`)
        .join('')}`,
    );
  },
};

function ringFrame(n: number): string {
  return svgDoc(VB, `<ellipse cx="128" cy="152" rx="96" ry="10" fill="#3B2A1C" opacity=".14"/><g transform="translate(8 16)">${frame(HAT, { rings: n, ribs: 12 })}</g>${numeral(n)}`);
}

let counter = 0;

/** the SVG picture for an answer's `art` key */
export function answerArt(key: string): string {
  const draw = ART[key];
  return draw ? draw(`qa${key}${counter++}`) : svgDoc(VB, '');
}

export const ART_KEYS = Object.keys(ART);
