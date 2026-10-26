export type Lang = 'en' | 'vi';

/** Phase 2 layers, in the order the brief introduces them. */
export const LAYERS = ['stitches', 'leaves', 'frame', 'strap'] as const;
export type LayerId = (typeof LAYERS)[number];

/** Phase 3 storybook chapters. */
export const CHAPTERS = ['protection', 'heritage', 'identity'] as const;
export type ChapterId = (typeof CHAPTERS)[number];

export const GAMES = ['build', 'colour', 'quiz'] as const;
export type GameId = (typeof GAMES)[number];

export type FlowState =
  | 'landing'
  | 'p1'
  | 'p2'
  | 'p3'
  | 'hub'
  | 'build'
  | 'colour'
  | 'gallery'
  | 'quiz'
  | 'certificate';

export type StepState = 'locked' | 'active' | 'done';

export interface Progress {
  v: 1;
  firstRunComplete: boolean;
  p1: { seenTiles: string[]; done: boolean };
  p2: { layers: Record<LayerId, StepState> };
  p3: { chapters: Record<ChapterId, StepState> };
  games: {
    build: { completed: number };
    colour: { saved: number };
    quiz: { best: number; badges: string[]; certificateAt?: string };
  };
}

export interface Settings {
  lang: Lang;
  narration: boolean;
  captions: boolean;
  volume: number;
  motion: 'system' | 'reduced' | 'full';
  strapColour: 'purple' | 'peach' | 'green';
}

export interface Route {
  state: FlowState;
  /** e.g. { layer: 'leaves' } for #/play/p2/leaves */
  params: Record<string, string>;
}
