/**
 * Hash routes (GitHub Pages has no SPA rewrites, and teammates can deep-link a screen for feedback):
 *
 *   #/                      landing (scroll intro)
 *   #/play                  resume where the child left off
 *   #/play/p1               Phase 1 collage
 *   #/play/p2/:layer        stitches | leaves | frame | strap
 *   #/play/p3/:chapter      protection | heritage | identity
 *   #/play/hub              activity hub
 *   #/play/build  #/play/colour[/:page]  #/play/gallery  #/play/quiz  #/play/certificate
 */
import type { FlowState, Route } from './types';

const PLAY_STATES: FlowState[] = ['p1', 'p2', 'p3', 'hub', 'build', 'colour', 'gallery', 'quiz', 'certificate'];

export function parseHash(hash: string): Route | 'resume' {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts.length === 0) return { state: 'landing', params: {} };
  if (parts[0] !== 'play') return { state: 'landing', params: {} };
  if (parts.length === 1) return 'resume';
  const state = parts[1] as FlowState;
  if (!PLAY_STATES.includes(state)) return 'resume';
  const params: Record<string, string> = {};
  if (state === 'p2' && parts[2]) params.layer = parts[2];
  if (state === 'p3' && parts[2]) params.chapter = parts[2];
  if (state === 'colour' && parts[2]) params.page = parts[2];
  return { state, params };
}

export function toHash(r: Route): string {
  if (r.state === 'landing') return '#/';
  const extra = r.params.layer ?? r.params.chapter ?? r.params.page;
  return `#/play/${r.state}${extra ? `/${extra}` : ''}`;
}

export class Router {
  private handler: ((r: Route | 'resume') => void) | null = null;

  start(handler: (r: Route | 'resume') => void): void {
    this.handler = handler;
    window.addEventListener('hashchange', () => this.handler?.(parseHash(location.hash)));
    this.handler(parseHash(location.hash));
  }

  go(r: Route, replace = false): void {
    const hash = toHash(r);
    if (location.hash === hash) {
      this.handler?.(r);
      return;
    }
    if (replace) {
      history.replaceState(null, '', hash);
      this.handler?.(r);
    } else {
      location.hash = hash;
    }
  }
}
