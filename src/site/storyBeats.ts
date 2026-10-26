/**
 * The four caption beats of the scroll intro, keyed to scroll progress (0..1) along the INTRO
 * timeline (blender/render_jobs.py): assembled hat → layers open → rings spread → reassembled → hero.
 */
export interface Beat {
  id: string;
  /** shown while from <= progress < to (the last beat stays on to the end) */
  from: number;
  to: number;
  /** progress of the frame used as this beat's still under reduced motion */
  still: number;
}

export const BEATS: readonly Beat[] = [
  { id: 'site.story.1', from: 0.0, to: 0.24, still: 0.04 }, // leaves: the whole hat, then its leaves open
  { id: 'site.story.2', from: 0.3, to: 0.54, still: 0.45 }, // the 16 rings spread out
  { id: 'site.story.3', from: 0.6, to: 0.8, still: 0.78 }, // stitches fly back on
  { id: 'site.story.4', from: 0.86, to: 1.0001, still: 1.0 }, // hero view: ready to explore
];

/** Index of the beat on screen at `progress`, or -1 between beats. */
export function activeBeat(progress: number, beats: readonly Beat[] = BEATS): number {
  const p = Math.min(1, Math.max(0, progress));
  return beats.findIndex((b) => p >= b.from && p < b.to);
}

/** 0-based frame index of a beat's still. */
export function stillFrame(beat: number, count: number, beats: readonly Beat[] = BEATS): number {
  return Math.round(beats[beat].still * (count - 1));
}

/** Where to scroll (as progress) so a beat is comfortably on screen. */
export function beatTarget(beat: number, beats: readonly Beat[] = BEATS): number {
  const b = beats[beat];
  return beat === beats.length - 1 ? 1 : (b.from + Math.min(b.to, 1)) / 2;
}
