/**
 * Pictures for the build game: one SVG layer per piece (they stack on the workbench exactly like
 * the Blender build-0N renders will) and a "material" picture per piece for the tray, so a
 * pre-reader can tell a bundle of leaves from a spool of thread.
 */
import { BENCH, bodyPath, frame, innerLeaves, outerLeaves, poemArt, shadow, stitches, strap, svgDoc, type Cone } from '../hub/hat';
import type { PieceId } from './order';

const BENCH_VB = '0 0 400 300';

export function layerSvg(piece: PieceId, uid: string, strapColour: string): string {
  const c = BENCH;
  switch (piece) {
    case 'frame':
      return svgDoc(BENCH_VB, frame(c));
    case 'leaf-inner':
      return svgDoc(BENCH_VB, innerLeaves(c, uid));
    case 'poem-art':
      return svgDoc(BENCH_VB, poemArt(c, uid));
    case 'leaf-outer':
      return svgDoc(BENCH_VB, outerLeaves(c, uid));
    case 'stitches':
      return svgDoc(BENCH_VB, stitches(c));
    case 'strap':
      return svgDoc(BENCH_VB, strap(c, strapColour, { uid }));
  }
}

/**
 * Where the hat stands in the Blender build-0N renders once they are zoomed onto the workbench
 * (see .p4b-stack.is-renders in build.css: scale 1.4 about 50% 22.8%; measured from the renders'
 * alpha bounds), so the dashed outline matches whichever pictures are in use.
 */
export const RENDER_BENCH: Cone = { cx: 200, apexY: 30, brimY: 166, rx: 148, ry: 50 };

/** the empty workbench: the hat's shadow and a dashed outline of where it will stand */
export function ghostSvg(c: Cone = BENCH, withShadow = true): string {
  return svgDoc(
    BENCH_VB,
    `${withShadow ? shadow(c, 'ghost') : ''}<path d="${bodyPath(c)}" fill="#FFF9EC" fill-opacity=".35" stroke="#7A5A3A" stroke-opacity=".38" stroke-width="3" stroke-dasharray="10 9" stroke-linejoin="round"/>`,
  );
}

const TRAY_VB = '0 0 160 120';
const TRAY_CONE: Cone = { cx: 80, apexY: 14, brimY: 86, rx: 70, ry: 15 };

export function trayArt(piece: PieceId, strapColour: string): string {
  switch (piece) {
    case 'frame':
      return svgDoc(TRAY_VB, `<ellipse cx="80" cy="104" rx="64" ry="9" fill="#3B2A1C" opacity=".15"/>${frame(TRAY_CONE, { rings: 9, ribs: 10 })}`);
    case 'leaf-inner':
      return svgDoc(
        TRAY_VB,
        `<ellipse cx="80" cy="106" rx="60" ry="8" fill="#3B2A1C" opacity=".14"/>
        <path d="M22 92 Q80 60 140 86 L136 98 Q80 76 26 104Z" fill="#8C6A3E"/>
        <path d="M26 98 Q72 70 124 82 L120 92 Q74 84 30 106Z" fill="#A47E4E"/>
        ${leaf(80, 60, 92, 26, -14, '#E3DAA8', '#A89A5B')}${leaf(76, 52, 92, 26, -4, '#ECE4BE', '#A89A5B')}${leaf(84, 44, 90, 24, 8, '#E6DDAF', '#A89A5B')}`,
      );
    case 'poem-art':
      return svgDoc(
        TRAY_VB,
        `<g transform="rotate(-6 80 60)"><rect x="26" y="14" width="108" height="88" rx="6" fill="#FFF4D6" stroke="#D9C49A" stroke-width="2"/>
        <rect x="26" y="14" width="108" height="88" rx="6" fill="#FFE6A6" opacity=".35"/>
        <g fill="#5A3F28"><path d="M52 32l-9 8h18z"/><circle cx="52" cy="44" r="4.5"/><path d="M47 50h10l6 34q-11 5-22 0z"/>
        <path d="M84 86q14 9 28 0q-14 4-28 0z"/><path d="M98 86V72l8 11z"/></g>
        <g stroke="#5A3F28" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="3 2.4"><path d="M80 30h36M80 40h30M80 50h34M80 60h24"/></g></g>`,
      );
    case 'leaf-outer':
      return svgDoc(
        TRAY_VB,
        `<ellipse cx="80" cy="106" rx="56" ry="8" fill="#3B2A1C" opacity=".14"/>
        ${leaf(80, 64, 104, 30, -32, '#E9BF62', '#9C6A1C')}${leaf(80, 60, 104, 30, -10, '#F3D58C', '#9C6A1C')}${leaf(80, 58, 104, 30, 12, '#EECB76', '#9C6A1C')}${leaf(80, 62, 104, 30, 32, '#E4B455', '#9C6A1C')}
        <path d="M58 34l6-10 3 10" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>`,
      );
    case 'stitches':
      return svgDoc(
        TRAY_VB,
        `<ellipse cx="62" cy="104" rx="42" ry="7" fill="#3B2A1C" opacity=".14"/>
        <rect x="38" y="30" width="48" height="66" rx="6" fill="#F7F3EA" stroke="#C9C1AE" stroke-width="2"/>
        <g stroke="#DAD3C2" stroke-width="2">${[38, 46, 54, 62, 70, 78, 86].map((y) => `<path d="M40 ${y}h44"/>`).join('')}</g>
        <ellipse cx="62" cy="30" rx="30" ry="8" fill="#B98339" stroke="#8E6128" stroke-width="2"/><ellipse cx="62" cy="96" rx="30" ry="8" fill="#B98339" stroke="#8E6128" stroke-width="2"/>
        <ellipse cx="62" cy="30" rx="6" ry="2" fill="#6B4A2B"/>
        <path d="M86 50c18-6 30 8 22 22s-30 14-26 30" fill="none" stroke="#FFFDF5" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M86 50c18-6 30 8 22 22s-30 14-26 30" fill="none" stroke="#9E9682" stroke-width=".8" stroke-dasharray="2 3"/>
        <path d="M112 16 146 104" stroke="#8A8F98" stroke-width="3.4" stroke-linecap="round"/><ellipse cx="114" cy="21" rx="2" ry="4.4" transform="rotate(-21 114 21)" fill="#fff" stroke="#6B7078" stroke-width="1.4"/>
        <path d="M12 72q12-14 24-2t22 0" fill="none" stroke="#B3261E" stroke-width="3" stroke-linecap="round"/>`,
      );
    case 'strap':
      return svgDoc(
        TRAY_VB,
        `<ellipse cx="80" cy="104" rx="56" ry="8" fill="#3B2A1C" opacity=".14"/>
        <path d="M30 28c-10 40 6 66 50 66s58-30 48-66" fill="none" stroke="#3B2A1C" stroke-opacity=".2" stroke-width="12" stroke-linecap="round" transform="translate(0 3)"/>
        <path d="M30 28c-10 40 6 66 50 66s58-30 48-66" fill="none" stroke="${strapColour}" stroke-width="11" stroke-linecap="round"/>
        <path d="M30 28c-10 40 6 66 50 66s58-30 48-66" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-linecap="round" transform="translate(-1 -3)"/>
        <g fill="${strapColour}" stroke="#3B2A1C" stroke-opacity=".3" stroke-width="1.5"><circle cx="30" cy="24" r="7"/><circle cx="128" cy="24" r="7"/></g>
        <path d="M24 18l-6-8M136 18l6-8" stroke="${strapColour}" stroke-width="3" stroke-linecap="round"/>`,
      );
  }
}

/** a long palm leaf with a central vein, centred at (x, y), rotated `deg` */
function leaf(x: number, y: number, len: number, wid: number, deg: number, fill: string, vein: string): string {
  const h = len / 2;
  const w = wid / 2;
  return `<g transform="translate(${x} ${y}) rotate(${deg})"><path d="M0 ${-h}C${w * 1.5} ${-h * 0.4} ${w * 1.3} ${h * 0.5} 0 ${h}C${-w * 1.3} ${h * 0.5} ${-w * 1.5} ${-h * 0.4} 0 ${-h}z" fill="${fill}" stroke="${vein}" stroke-width="1.6"/><path d="M0 ${-h + 4}V${h - 4}" stroke="${vein}" stroke-width="1.2"/>${[-0.5, -0.2, 0.1, 0.4]
    .map((k) => `<path d="M0 ${f(h * k)}l${f(w * 0.7)} ${f(-h * 0.14)}M0 ${f(h * k)}l${f(-w * 0.7)} ${f(-h * 0.14)}" stroke="${vein}" stroke-width=".8" opacity=".7"/>`)
    .join('')}</g>`;
}

const f = (n: number) => (Math.round(n * 10) / 10).toString();
