/**
 * The badges a child can collect: one per quiz question (correct first try) and the
 * "Little Hat Maker" badge for finishing the build game. Drawn in SVG so they stay crisp on the
 * badge shelf, in the quiz and on the printed certificate.
 */
import type { Progress } from '../../../app/types';

export interface BadgeDef {
  id: string;
  nameId: string;
  /** medal face colour */
  face: string;
  /** ribbon colour */
  ribbon: string;
  /** icon drawn on the face, in a 100×100 box centred at (50, 46) */
  icon: string;
}

const CREAM = '#FFF4D6';

export const QUIZ_BADGES: BadgeDef[] = [
  {
    id: 'q1',
    nameId: 'quiz.badge.q1',
    face: '#8E5BA8',
    ribbon: '#C21F66',
    icon: `<path d="M50 24l6.5 13.2 14.5 2.1-10.5 10.2 2.5 14.5L50 57.2 37 64l2.5-14.5L29 39.3l14.5-2.1z" fill="${CREAM}"/><path d="M34 66q16 12 32 0" fill="none" stroke="${CREAM}" stroke-width="4" stroke-linecap="round"/>`,
  },
  {
    id: 'q2',
    nameId: 'quiz.badge.q2',
    face: '#2F5D46',
    ribbon: '#E0A93B',
    icon: `<g fill="none" stroke="${CREAM}" stroke-width="3" stroke-linecap="round"><path d="M50 22 26 62M50 22l24 40M50 22v44M50 22 38 65M50 22l12 43"/><ellipse cx="50" cy="62" rx="24" ry="6"/><ellipse cx="50" cy="49" rx="16" ry="4"/><ellipse cx="50" cy="36" rx="8" ry="2.2"/></g>`,
  },
  {
    id: 'q3',
    nameId: 'quiz.badge.q3',
    face: '#5E9E45',
    ribbon: '#2F5D46',
    icon: `<path d="M50 70C34 58 34 36 50 22c16 14 16 36 0 48z" fill="${CREAM}"/><path d="M50 28v38M50 40l-8-6M50 50l-9-6M50 40l8-6M50 50l9-6" stroke="#5E9E45" stroke-width="2.4" stroke-linecap="round"/>`,
  },
  {
    id: 'q4',
    nameId: 'quiz.badge.q4',
    face: '#E08A1E',
    ribbon: '#A9472A',
    icon: `<g fill="none" stroke="${CREAM}" stroke-linecap="round"><ellipse cx="50" cy="62" rx="26" ry="6.5" stroke-width="3.4"/><ellipse cx="50" cy="52" rx="20" ry="5" stroke-width="3"/><ellipse cx="50" cy="42" rx="14" ry="3.6" stroke-width="2.8"/><ellipse cx="50" cy="33" rx="8.5" ry="2.3" stroke-width="2.6"/><ellipse cx="50" cy="26" rx="3.5" ry="1" stroke-width="2.4"/></g>`,
  },
  {
    id: 'q5',
    nameId: 'quiz.badge.q5',
    face: '#C21F66',
    ribbon: '#8E5BA8',
    icon: `<path d="M30 28h36a4 4 0 0 1 4 4v30a4 4 0 0 1-4 4H34" fill="${CREAM}"/><path d="M30 28a4 4 0 0 0-4 4v4h8v-4a4 4 0 0 0-4-4zM34 66a4 4 0 0 1-4-4V36h4z" fill="#F6DC98"/><g stroke="#C21F66" stroke-width="2.6" stroke-linecap="round"><path d="M40 38h22M40 46h18M40 54h20"/></g>`,
  },
];

export const MAKER_BADGE: BadgeDef = {
  id: 'maker',
  nameId: 'build.badge.name',
  face: '#A9472A',
  ribbon: '#2F5D46',
  icon: `<path d="M50 22 76 58Q50 68 24 58Z" fill="#F6DC98" stroke="${CREAM}" stroke-width="3" stroke-linejoin="round"/><path d="M33 52q17 6 34 0M40 42q10 3 20 0" stroke="#B8862A" stroke-width="2" fill="none"/><path d="M62 70 78 30" stroke="${CREAM}" stroke-width="3" stroke-linecap="round"/><ellipse cx="77" cy="32" rx="1.6" ry="3" transform="rotate(22 77 32)" fill="#A9472A"/>`,
};

export const ALL_BADGES: BadgeDef[] = [...QUIZ_BADGES, MAKER_BADGE];

export function badgeDef(id: string): BadgeDef | undefined {
  return ALL_BADGES.find((b) => b.id === id);
}

/** which badges this child has (quiz badges in quiz order, then the maker badge) */
export function earnedBadges(p: Progress): string[] {
  const quiz = QUIZ_BADGES.map((b) => b.id).filter((id) => p.games.quiz.badges.includes(id));
  return p.games.build.completed > 0 ? [...quiz, MAKER_BADGE.id] : quiz;
}

/** a medal with ribbon tails; viewBox 0 0 100 124 */
export function badgeSvg(def: BadgeDef, earned = true): string {
  if (!earned) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 124"><circle cx="50" cy="48" r="40" fill="#F3E6C6" stroke="#B8A27A" stroke-width="3" stroke-dasharray="7 6"/><g opacity=".28">${def.icon.replaceAll(CREAM, '#7A5A3A')}</g></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 124">
  <path d="M30 76 20 118l14-7 8 12 10-40z" fill="${def.ribbon}"/><path d="M70 76l10 42-14-7-8 12-10-40z" fill="${def.ribbon}"/>
  <path d="M30 76 20 118l14-7" fill="none" stroke="#000" stroke-opacity=".15" stroke-width="2"/>
  <circle cx="50" cy="50" r="42" fill="#7A5226" opacity=".25"/>
  <circle cx="50" cy="47" r="42" fill="#E0A93B"/>
  <circle cx="50" cy="47" r="42" fill="none" stroke="#B8862A" stroke-width="3"/>
  <circle cx="50" cy="47" r="35" fill="${def.face}"/>
  <circle cx="50" cy="47" r="35" fill="none" stroke="#FFF4D6" stroke-opacity=".5" stroke-width="1.6" stroke-dasharray="3 4"/>
  <g transform="translate(0 1)">${def.icon}</g>
  <path d="M22 30a34 34 0 0 1 22-16" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="4" stroke-linecap="round"/>
</svg>`;
}

/** the badge as an <img> (for drawing onto the certificate canvas) */
export function badgeImage(def: BadgeDef, earned = true): Promise<HTMLImageElement> {
  return svgImage(badgeSvg(def, earned));
}

export function svgImage(markup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('svg image failed'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });
}
