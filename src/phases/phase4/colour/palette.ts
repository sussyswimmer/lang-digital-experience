/**
 * The paint box. The first row is the traditional quai nón (strap) colours from the brief; the
 * rest are the warm, earthy everyday colours of the site (straw, terracotta, shutter-door
 * forest, weathered wood, market fruit) plus the basics. Each name is spoken when picked.
 */
export interface Swatch {
  id: string;
  hex: string;
  /** string id of the spoken / accessible name */
  nameId: string;
  strap?: boolean;
}

const sw = (id: string, hex: string, strap = false): Swatch => ({ id, hex, nameId: `colour.c.${id}`, strap });

export const PALETTE: readonly Swatch[] = [
  sw('purple', '#8E5BA8', true),
  sw('peach', '#F4A79A', true),
  sw('lightgreen', '#A9D8A0', true),
  sw('straw', '#E0A93B'),
  sw('mango', '#F6A623'),
  sw('yellow', '#FFD84D'),
  sw('terracotta', '#C2603D'),
  sw('red', '#D7263D'),
  sw('dragon', '#C21F66'),
  sw('leaf', '#7FBF5E'),
  sw('forest', '#1F4D3A'),
  sw('sky', '#7EC8E3'),
  sw('river', '#3A6FB0'),
  sw('wood', '#7A5A3A'),
  sw('sand', '#EDC9A0'),
  sw('white', '#FFFFFF'),
  sw('grey', '#9C958C'),
  sw('black', '#2B2118'),
];

export const DEFAULT_SWATCH = PALETTE[0];

/** paper and ink of the studio (also used when composing the saved PNG) */
export const PAPER = '#FFFDF7';
export const INK: readonly [number, number, number] = [43, 29, 18];
