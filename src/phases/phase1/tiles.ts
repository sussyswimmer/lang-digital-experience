/** The Phase 1 collage: five everyday scenes from the brief, plus two decorative photos. */
import type { AmbientId } from '../../audio/AudioEngine';
import { P1_ICONS } from './art';

export const TILE_IDS = ['farmers', 'market', 'aodai', 'rain', 'craft'] as const;
export type TileId = (typeof TILE_IDS)[number];
export type DecoId = 'sky' | 'lotus';

export interface TileSpec {
  id: TileId | DecoId;
  /** photo stem under assets/img/photos/ */
  stem: string;
  /** object-position focal point (0..1) so the 4:3 polaroid crop keeps the hat in view */
  focal: [number, number];
  ambient?: AmbientId;
  icon?: string;
  deco?: boolean;
}

export const TILES: TileSpec[] = [
  // the rice field (the same farmers return in the storybook's first chapter)
  { id: 'farmers', stem: 'p3-protection', focal: [0.66, 0.4], ambient: 'breeze', icon: P1_ICONS.rice },
  { id: 'market', stem: 'p1-market', focal: [0.5, 0.42], ambient: 'market', icon: P1_ICONS.mango },
  { id: 'aodai', stem: 'p1-aodai', focal: [0.5, 0.28], ambient: 'school', icon: P1_ICONS.bike },
  { id: 'rain', stem: 'p1-rain', focal: [0.5, 0.45], ambient: 'rain', icon: P1_ICONS.rain },
  { id: 'craft', stem: 'diverse-3', focal: [0.46, 0.52], ambient: 'workshop', icon: P1_ICONS.needle },
];

export const DECOS: TileSpec[] = [
  { id: 'sky', stem: 'diverse-4', focal: [0.42, 0.55], deco: true },
  { id: 'lotus', stem: 'p1-farmers', focal: [0.55, 0.4], deco: true },
];

/**
 * Short muted loops (Higgsfield image-to-video → EffectCraft grade, npm run assets:video) at
 * assets/video/p1-<tile>.{webm,mp4} + -poster.webp. Tiles without one (the áo dài photo carries a stock
 * credit, so it isn't animated) use the photo with a slow Ken Burns drift.
 */
export const VIDEO_READY: Partial<Record<TileId, boolean>> = { farmers: true, market: true, rain: true, craft: true };
