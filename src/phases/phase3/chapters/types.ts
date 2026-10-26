/** The contract between the storybook and its three chapters: a picture, narration, one interaction. */
import type { AppContext } from '../../../app/context';
import type { ChapterId } from '../../../app/types';

export interface ChapterHost {
  ctx: AppContext;
  /** tweens created through this are killed when the screen unmounts */
  g: gsap.Context;
  /** true while this chapter is the open page and the screen is mounted */
  isCurrent(id: ChapterId): boolean;
  /** show a line in the page's prompt bubble (it is not spoken; the chapter decides that) */
  prompt(id: string): void;
  /** the chapter's interaction is done: the Next arrow unlocks and pulses */
  done(id: ChapterId): void;
  /** Chapter 2 turns the whole book dark */
  setDark(on: boolean): void;
}

export interface Chapter {
  readonly id: ChapterId;
  readonly icon: string;
  /** picture with the interaction on top */
  readonly pic: HTMLElement;
  /** the chapter's own buttons, shown in the side panel */
  readonly actions: HTMLElement;
  /** narration ids for the chapter's story */
  readonly story: string[];
  readonly firstPrompt: string;
  readonly complete: boolean;
  /** the page became current: tell the story and start listening */
  start(): void;
  /** the page is no longer current: stop sounds, sims and hints */
  stop(): void;
  /** register the idle hint for the current step */
  hint(): void;
  resize(): void;
  dispose(): void;
}
