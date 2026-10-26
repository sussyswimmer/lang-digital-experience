/**
 * A parametric nón lá drawn in SVG, part by part, seen from a little above (like the Blender
 * stills camera). The build game stacks the parts as layers; the quiz pictures and the
 * certificate reuse them. Every function returns SVG markup; `uid` keeps gradient ids unique.
 */

export interface Cone {
  cx: number;
  apexY: number;
  brimY: number;
  /** brim half-width */
  rx: number;
  /** brim half-height (how much of the top we see) */
  ry: number;
}

/** the workbench hat: viewBox 0 0 400 300, roughly where the Blender stills put it */
export const BENCH: Cone = { cx: 200, apexY: 40, brimY: 212, rx: 178, ry: 40 };

export const STRAP_COLOURS = { purple: '#8E5BA8', peach: '#F4A79A', green: '#A9D8A0' } as const;
export type StrapColour = keyof typeof STRAP_COLOURS;

const f = (n: number) => (Math.round(n * 10) / 10).toString();

interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** the ring that sits `t` of the way from the apex (0) to the brim (1) */
export function ringAt(c: Cone, t: number): Ellipse {
  return { cx: c.cx, cy: c.apexY + (c.brimY - c.apexY) * t, rx: c.rx * t, ry: c.ry * t };
}

/** ring k of 16, counted up from the wide brim (ring 1 = brim) */
export function ringT(k: number, count = 16): number {
  return 1 - (k - 1) / count;
}

export function frontArc(e: Ellipse): string {
  return `M${f(e.cx - e.rx)} ${f(e.cy)}A${f(e.rx)} ${f(e.ry)} 0 0 0 ${f(e.cx + e.rx)} ${f(e.cy)}`;
}

export function backArc(e: Ellipse): string {
  return `M${f(e.cx - e.rx)} ${f(e.cy)}A${f(e.rx)} ${f(e.ry)} 0 0 1 ${f(e.cx + e.rx)} ${f(e.cy)}`;
}

/** the visible (front) surface of the cone */
export function bodyPath(c: Cone): string {
  return `M${f(c.cx)} ${f(c.apexY)}L${f(c.cx - c.rx)} ${f(c.brimY)}A${f(c.rx)} ${f(c.ry)} 0 0 0 ${f(c.cx + c.rx)} ${f(c.brimY)}Z`;
}

/** a point on the brim at azimuth `a` (radians; π/2 = nearest the viewer) */
function brimPoint(c: Cone, a: number, t = 1): { x: number; y: number } {
  const e = ringAt(c, t);
  return { x: e.cx + e.rx * Math.cos(a), y: e.cy + e.ry * Math.sin(a) };
}

export function shadow(c: Cone, uid: string): string {
  return `<defs><radialGradient id="sh-${uid}"><stop offset="0" stop-color="#3B2A1C" stop-opacity=".34"/><stop offset="1" stop-color="#3B2A1C" stop-opacity="0"/></radialGradient></defs>
  <ellipse cx="${f(c.cx)}" cy="${f(c.brimY + c.ry * 1.25)}" rx="${f(c.rx * 1.02)}" ry="${f(c.ry * 0.62)}" fill="url(#sh-${uid})"/>`;
}

/** bamboo frame: `rings` circular rings and `ribs` supporting ribs (the back half drawn fainter) */
export function frame(c: Cone, opts: { rings?: number; ribs?: number; scale?: number; colour?: string } = {}): string {
  const rings = opts.rings ?? 16;
  const ribs = opts.ribs ?? 12;
  const s = opts.scale ?? 1;
  const col = opts.colour ?? '#B98339';
  const back: string[] = [];
  const front: string[] = [];
  for (let i = 0; i < ribs; i++) {
    const a = (i / ribs) * Math.PI * 2 + 0.13;
    const p = brimPoint(c, a);
    (Math.sin(a) > 0 ? front : back).push(`<path d="M${f(c.cx)} ${f(c.apexY)}L${f(p.x)} ${f(p.y)}"/>`);
  }
  const ringBack: string[] = [];
  const ringFront: string[] = [];
  for (let k = 1; k <= rings; k++) {
    const e = ringAt(c, ringT(k, rings) * s);
    const w = k === 1 ? 3.4 : 2.1;
    ringBack.push(`<path d="${backArc(e)}" stroke-width="${f(w * 0.75)}"/>`);
    ringFront.push(`<path d="${frontArc(e)}" stroke-width="${f(w)}"/>`);
  }
  return `<g fill="none" stroke="${col}" stroke-linecap="round">
    <g opacity=".42" stroke-width="1.4">${back.join('')}</g>
    <g opacity=".5">${ringBack.join('')}</g>
    <g stroke-width="1.8">${front.join('')}</g>
    <g stroke="#8E6128" opacity=".95">${ringFront.join('')}</g>
    <circle cx="${f(c.cx)}" cy="${f(c.apexY)}" r="3" fill="${col}" stroke="#8E6128"/>
  </g>`;
}

/** pale, matte inner leaves (with the mo bark layer folded in): the frame still shows through */
export function innerLeaves(c: Cone, uid: string): string {
  const veins: string[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI;
    const p = brimPoint(c, a + 0.08);
    veins.push(`<path d="M${f(c.cx)} ${f(c.apexY + 6)}L${f(p.x)} ${f(p.y)}"/>`);
  }
  return `<defs><linearGradient id="il-${uid}" x1="0" x2="1">
      <stop offset="0" stop-color="#C9BB7A"/><stop offset=".45" stop-color="#EDE5BC"/><stop offset=".7" stop-color="#E2D69F"/><stop offset="1" stop-color="#B9A866"/>
    </linearGradient><clipPath id="ilc-${uid}"><path d="${bodyPath(c)}"/></clipPath></defs>
  <path d="${bodyPath(c)}" fill="url(#il-${uid})" opacity=".9"/>
  <g clip-path="url(#ilc-${uid})" stroke="#A89A5B" stroke-width="1" opacity=".45" fill="none">${veins.join('')}</g>
  <path d="${frontArc(ringAt(c, 1))}" fill="none" stroke="#8C6A3E" stroke-width="2.4" opacity=".7"/>`;
}

/** the hidden paper art: a girl in áo dài, a boat, a lotus and lines of poetry */
export function poemArt(c: Cone, uid: string): string {
  const k = c.rx / 178;
  const X = (x: number) => f(c.cx + (x - 200) * k);
  const Y = (y: number) => f(c.apexY + (y - 40) * k);
  const lines = [0, 1, 2, 3]
    .map((i) => `<path d="M${X(226)} ${Y(104 + i * 13)}h${f((26 - i * 4) * k)}" stroke-dasharray="${f(3 * k)} ${f(2.2 * k)}"/>`)
    .join('');
  return `<defs><radialGradient id="pg-${uid}"><stop offset="0" stop-color="#FFE6A6" stop-opacity=".9"/><stop offset="1" stop-color="#FFE6A6" stop-opacity="0"/></radialGradient></defs>
  <ellipse cx="${X(200)}" cy="${Y(150)}" rx="${f(96 * k)}" ry="${f(62 * k)}" fill="url(#pg-${uid})"/>
  <g fill="#5A3F28" opacity=".82">
    <path d="M${X(162)} ${Y(118)}l${f(-10 * k)} ${f(9 * k)}h${f(20 * k)}z"/>
    <circle cx="${X(162)}" cy="${Y(131)}" r="${f(5 * k)}"/>
    <path d="M${X(157)} ${Y(137)}h${f(10 * k)}l${f(6 * k)} ${f(40 * k)}q${f(-11 * k)} ${f(6 * k)} ${f(-22 * k)} 0z"/>
    <path d="M${X(234)} ${Y(178)}q${f(18 * k)} ${f(12 * k)} ${f(36 * k)} 0q${f(-18 * k)} ${f(5 * k)} ${f(-36 * k)} 0z"/>
    <path d="M${X(252)} ${Y(178)}v${f(-18 * k)}l${f(10 * k)} ${f(14 * k)}z"/>
    <path d="M${X(196)} ${Y(186)}q${f(-9 * k)} ${f(-14 * k)} 0 ${f(-22 * k)}q${f(9 * k)} ${f(8 * k)} 0 ${f(22 * k)}zM${X(196)} ${Y(186)}q${f(-16 * k)} ${f(-4 * k)} ${f(-14 * k)} ${f(-15 * k)}q${f(10 * k)} ${f(2 * k)} ${f(14 * k)} ${f(15 * k)}zM${X(196)} ${Y(186)}q${f(16 * k)} ${f(-4 * k)} ${f(14 * k)} ${f(-15 * k)}q${f(-10 * k)} ${f(2 * k)} ${f(-14 * k)} ${f(15 * k)}z"/>
  </g>
  <g stroke="#5A3F28" stroke-width="${f(2.2 * k)}" stroke-linecap="round" fill="none" opacity=".8">${lines}</g>`;
}

/** golden outer leaves with their seams; `phase` turns the seams (the spin at the end of the game) */
export function outerLeaves(c: Cone, uid: string, opts: { phase?: number; shine?: boolean; opacity?: number } = {}): string {
  return `<defs><linearGradient id="ol-${uid}" x1="0" x2="1">
      <stop offset="0" stop-color="#A9741F"/><stop offset=".38" stop-color="#F3D58C"/><stop offset=".55" stop-color="#FBE7B0"/><stop offset=".72" stop-color="#E9BF62"/><stop offset="1" stop-color="#9C6A1C"/>
    </linearGradient><clipPath id="olc-${uid}"><path d="${bodyPath(c)}"/></clipPath></defs>
  <path d="${bodyPath(c)}" fill="url(#ol-${uid})" opacity="${opts.opacity ?? 1}"/>
  <g clip-path="url(#olc-${uid})"><g data-seams="" stroke="#B2832E" stroke-width="1.3" opacity=".75" fill="none">${seams(c, opts.phase ?? 0)}</g>
  ${opts.shine ? `<path d="M${f(c.cx - c.rx * 0.08)} ${f(c.apexY + 14)}L${f(c.cx - c.rx * 0.32)} ${f(c.brimY + c.ry * 0.7)}L${f(c.cx - c.rx * 0.12)} ${f(c.brimY + c.ry * 0.95)}Z" fill="#fff" opacity=".55"/>` : ''}</g>
  <path d="${bodyPath(c)}" fill="none" stroke="#7A5226" stroke-width="2" stroke-linejoin="round" opacity=".7"/>`;
}

/** leaf seams on the front of the cone, turned by `phase` radians */
export function seams(c: Cone, phase: number, n = 24): string {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((i / n) * Math.PI * 2 + phase) % (Math.PI * 2);
    if (Math.sin(a) <= 0.02) continue;
    const p = brimPoint(c, a);
    out.push(`M${f(c.cx)} ${f(c.apexY)}L${f(p.x)} ${f(p.y)}`);
  }
  return `<path d="${out.join('')}"/>`;
}

/** white stitch rows from ring 3 up to the tip, plus the red-thread brim with its bamboo wires */
export function stitches(c: Cone, opts: { offset?: number } = {}): string {
  const rows: string[] = [];
  for (let k = 3; k <= 14; k++) {
    const e = ringAt(c, ringT(k));
    const dash = Math.max(1.2, 2.6 * (e.rx / c.rx));
    rows.push(
      `<path d="${frontArc(e)}" stroke-dasharray="${f(dash)} ${f(dash * 2.2)}" stroke-dashoffset="${f(opts.offset ?? 0)}" stroke-width="${f(1 + 1.2 * (e.rx / c.rx))}"/>`,
    );
  }
  const brim = ringAt(c, 1);
  return `<g fill="none" stroke-linecap="round">
    <g stroke="#6B4A2B" opacity=".25" transform="translate(0 1.2)">${rows.join('')}</g>
    <g stroke="#FFFDF5">${rows.join('')}</g>
    <path d="${frontArc({ ...brim, rx: brim.rx + 1.5, ry: brim.ry + 0.6 })}" stroke="#D9B26A" stroke-width="2"/>
    <path d="${frontArc(brim)}" stroke="#9E2B1E" stroke-width="5.2" stroke-dasharray="2.4 1.6"/>
    <path d="${frontArc({ ...brim, rx: brim.rx - 3, ry: brim.ry - 0.8 })}" stroke="#C99A4B" stroke-width="1.6"/>
  </g>`;
}

/** the chin strap hanging under the brim; `sway` (−1…1) swings it, `tight` pulls it up short */
export function strap(c: Cone, colour: string, opts: { sway?: number; tight?: boolean; uid?: string } = {}): string {
  const k = c.rx / 178;
  const L = { x: c.cx - 112 * k, y: c.brimY + 12 * k };
  const R = { x: c.cx + 112 * k, y: c.brimY + 12 * k };
  const drop = (opts.tight ? 30 : 84) * k;
  const sx = (opts.sway ?? 0) * 26 * k;
  const d = `M${f(L.x)} ${f(L.y)}C${f(L.x + 20 * k + sx)} ${f(L.y + drop * 1.25)} ${f(R.x - 20 * k + sx)} ${f(R.y + drop * 1.25)} ${f(R.x)} ${f(R.y)}`;
  // only the part below the brim is visible: the rest hangs inside the hat
  const id = `sc-${opts.uid ?? 'x'}`;
  return `<defs><clipPath id="${id}"><path d="M0 ${f(c.brimY)}H${f(c.cx - c.rx)}A${f(c.rx)} ${f(c.ry)} 0 0 0 ${f(c.cx + c.rx)} ${f(c.brimY)}H2000V2000H0Z"/></clipPath></defs>
  <g clip-path="url(#${id})" fill="none" stroke-linecap="round">
    <path d="${d}" stroke="#3B2A1C" stroke-opacity=".25" stroke-width="${f(8 * k)}" transform="translate(0 ${f(2 * k)})"/>
    <path d="${d}" stroke="${colour}" stroke-width="${f(6.5 * k)}"/>
    <path d="${d}" stroke="#fff" stroke-opacity=".35" stroke-width="${f(1.8 * k)}" transform="translate(0 ${f(-1.4 * k)})"/>
  </g>`;
}

export function svgDoc(viewBox: string, body: string, extra = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" ${extra}>${body}</svg>`;
}

/** the whole finished hat, every layer, as one picture */
export function fullHat(c: Cone, uid: string, colour: string, opts: { shine?: boolean } = {}): string {
  return [shadow(c, uid), strap(c, colour, { uid }), outerLeaves(c, uid, { shine: opts.shine }), stitches(c)].join('');
}
