/**
 * What happens in each Phase 2 layer (pure data): the guided question, the insight chunks (the
 * brief's words, split into 2–3 sentence clips), which 3D cue each chunk fires, the team photo and
 * the idle-hint gesture.
 */
import type { LayerId } from '../../app/types';

export interface LayerScript {
  layer: LayerId;
  index: number;
  name: string;
  question: string;
  chunks: string[];
  /** chunk index → 3D cue name (see LayerController.cue) */
  cues: Record<number, string>;
  photo: { stem: string; alt: string };
}

const chunks = (layer: number, n: number) => Array.from({ length: n }, (_, i) => `p2.l${layer}.insight.${i + 1}`);

export const SCRIPT: Record<LayerId, LayerScript> = {
  stitches: {
    layer: 'stitches',
    index: 0,
    name: 'p2.l1.name',
    question: 'p2.l1.question',
    chunks: chunks(1, 5),
    cues: { 0: 'stitches', 2: 'thirdRim', 3: 'brim' },
    photo: { stem: 'p2-stitching', alt: 'p2.l1.photo.alt' },
  },
  leaves: {
    layer: 'leaves',
    index: 1,
    name: 'p2.l2.name',
    question: 'p2.l2.question',
    chunks: chunks(2, 7),
    cues: { 3: 'mo', 5: 'resin' },
    photo: { stem: 'p2-layering-leaves', alt: 'p2.l2.photo.alt' },
  },
  frame: {
    layer: 'frame',
    index: 2,
    name: 'p2.l3.name',
    question: 'p2.l3.question',
    chunks: chunks(3, 6),
    cues: { 2: 'rings', 3: 'joints', 4: 'measure' },
    photo: { stem: 'p2-16-rims', alt: 'p2.l3.photo.alt' },
  },
  strap: {
    layer: 'strap',
    index: 3,
    name: 'p2.l4.name',
    question: 'p2.l4.question',
    chunks: chunks(4, 6),
    cues: { 1: 'strap', 3: 'knots', 4: 'colours' },
    photo: { stem: 'p2-chin-straps', alt: 'p2.l4.photo.alt' },
  },
};

/** Insight sub-steps: which chunk comes next (auto-advance stops at the last one). */
export function nextChunk(current: number, total: number): number | null {
  return current + 1 < total ? current + 1 : null;
}

export function prevChunk(current: number): number | null {
  return current > 0 ? current - 1 : null;
}

/** Is `layer` a known Phase 2 layer id (from the route)? */
export function isLayer(layer: string | undefined): layer is LayerId {
  return layer === 'stitches' || layer === 'leaves' || layer === 'frame' || layer === 'strap';
}
