/** In-code card pictures for the hub, used only if the Higgsfield art (img/art/hub-*.webp) can't load. */
import { frame, outerLeaves, shadow, stitches, strap, svgDoc, type Cone } from './hat';
import { badgeSvg, QUIZ_BADGES } from './badges';

const VB = '0 0 400 300';

function bg(uid: string, a: string, b: string): string {
  return `<defs><linearGradient id="bg-${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="400" height="300" fill="url(#bg-${uid})"/>
  <rect x="0" y="0" width="64" height="210" fill="#1F4D3A"/><g stroke="#2F5D46" stroke-width="4">${[24, 44, 64, 84, 104, 124, 144, 164, 184].map((y) => `<path d="M6 ${y}h52"/>`).join('')}</g>
  <rect x="0" y="210" width="400" height="90" fill="#8A6440"/><rect x="0" y="210" width="400" height="8" fill="#6B4A2B"/>
  <g stroke="#7A5A3A" stroke-width="2" opacity=".6"><path d="M20 244h120M180 262h150M60 284h200"/></g>`;
}

export function buildCardSvg(): string {
  const half: Cone = { cx: 220, apexY: 64, brimY: 214, rx: 150, ry: 34 };
  return svgDoc(
    VB,
    `${bg('b', '#F6E7C4', '#EED39A')}${shadow(half, 'cb')}${frame(half)}
    <g clip-path="url(#half-cb)"><defs><clipPath id="half-cb"><rect x="220" y="0" width="200" height="300"/></clipPath></defs>${outerLeaves(half, 'cb')}${stitches(half)}</g>
    <g transform="translate(300 236) rotate(-8)"><path d="M0 0c20-14 52-12 70 0-18 10-50 12-70 0z" fill="#E9BF62" stroke="#9C6A1C" stroke-width="2"/><path d="M4 0h62" stroke="#9C6A1C" stroke-width="1.4"/></g>
    <g transform="translate(96 252)"><ellipse rx="24" ry="9" fill="#FFF9EC" stroke="#7A5A3A" stroke-width="2"/><path d="M14 -2 52 -26" stroke="#8A8F98" stroke-width="3" stroke-linecap="round"/></g>`,
  );
}

export function colourCardSvg(): string {
  const hat: Cone = { cx: 210, apexY: 70, brimY: 196, rx: 128, ry: 28 };
  return svgDoc(
    VB,
    `${bg('c', '#F7EBCF', '#F6E7C4')}
    <rect x="96" y="40" width="228" height="190" rx="8" fill="#FFF9EC" stroke="#D9C49A" stroke-width="3" transform="rotate(-3 210 135)"/>
    <path d="M210 70 338 196Q210 224 82 196Z" fill="none" stroke="#3B2A1C" stroke-width="3" stroke-linejoin="round"/>
    <path d="M210 70 290 148Q210 166 130 148Z" fill="#E0457B" opacity=".55"/><path d="M130 148Q210 166 290 148L322 180Q210 204 98 180Z" fill="#A9D8A0" opacity=".8"/>
    <path d="M98 180Q210 204 322 180L338 196Q210 224 82 196Z" fill="#8E5BA8" opacity=".7"/>
    ${strap(hat, '#8E5BA8', { uid: 'cc' })}
    <g transform="translate(300 250) rotate(-35)"><rect x="-60" y="-9" width="120" height="18" rx="5" fill="#8E5BA8"/><path d="M60 -9 82 0 60 9z" fill="#F4A79A"/><rect x="-46" y="-9" width="10" height="18" fill="#FFF9EC" opacity=".5"/></g>
    <g transform="translate(120 262) rotate(20)"><rect x="-44" y="-8" width="88" height="16" rx="5" fill="#7FBF5E"/><path d="M44 -8 62 0 44 8z" fill="#F6DC98"/></g>`,
  );
}

export function quizCardSvg(): string {
  const hat: Cone = { cx: 150, apexY: 80, brimY: 200, rx: 120, ry: 28 };
  const medal = (i: number, x: number, y: number, s: number) =>
    `<g transform="translate(${x} ${y}) scale(${s})">${badgeSvg(QUIZ_BADGES[i]).replace(/<svg[^>]*>|<\/svg>/g, '')}</g>`;
  return svgDoc(
    VB,
    `${bg('q', '#F6E7C4', '#EED39A')}${shadow(hat, 'cq')}${strap(hat, '#8E5BA8', { uid: 'cq' })}${outerLeaves(hat, 'cq', { shine: true })}${stitches(hat)}
    ${medal(0, 268, 36, 0.62)}${medal(2, 318, 92, 0.52)}${medal(4, 262, 132, 0.5)}
    <g transform="translate(118 112)"><circle r="34" fill="#FFF9EC" fill-opacity=".35" stroke="#5A3F28" stroke-width="7"/><path d="M24 24 54 56" stroke="#5A3F28" stroke-width="11" stroke-linecap="round"/></g>`,
  );
}
