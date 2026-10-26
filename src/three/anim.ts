/**
 * GSAP tweens that wake the render-on-demand loop and can all be killed at once (each layer owns
 * one Anim, so leaving a layer stops exactly its animations).
 */
import { gsap } from 'gsap';

type Animation = gsap.core.Tween | gsap.core.Timeline;

export class Anim {
  private live = new Set<Animation>();
  private children = new Set<Anim>();

  constructor(private wake: () => void) {}

  child(): Anim {
    const a = new Anim(this.wake);
    this.children.add(a);
    return a;
  }

  to(target: gsap.TweenTarget, vars: gsap.TweenVars): gsap.core.Tween {
    return this.track(gsap.to(target, this.wrap(vars)));
  }

  fromTo(target: gsap.TweenTarget, from: gsap.TweenVars, to: gsap.TweenVars): gsap.core.Tween {
    return this.track(gsap.fromTo(target, from, this.wrap(to)));
  }

  timeline(vars: gsap.TimelineVars = {}): gsap.core.Timeline {
    return this.track(gsap.timeline(this.wrap(vars) as gsap.TimelineVars));
  }

  /** a delayed call that dies with this Anim */
  call(seconds: number, fn: () => void): gsap.core.Tween {
    return this.track(gsap.delayedCall(seconds, fn));
  }

  /** resolve when a tween/timeline completes (or immediately if it is killed) */
  done(a: Animation): Promise<void> {
    return new Promise((resolve) => {
      const prev = a.eventCallback('onComplete');
      a.eventCallback('onComplete', (...args: unknown[]) => {
        (prev as ((...x: unknown[]) => void) | undefined)?.(...args);
        resolve();
      });
      const prevInt = a.eventCallback('onInterrupt');
      a.eventCallback('onInterrupt', (...args: unknown[]) => {
        (prevInt as ((...x: unknown[]) => void) | undefined)?.(...args);
        resolve();
      });
    });
  }

  get active(): boolean {
    for (const a of this.live) if (a.isActive()) return true;
    for (const c of this.children) if (c.active) return true;
    return false;
  }

  killAll(): void {
    for (const a of this.live) a.kill();
    this.live.clear();
    for (const c of this.children) c.killAll();
  }

  dispose(): void {
    this.killAll();
    this.children.clear();
  }

  private track<T extends Animation>(a: T): T {
    this.live.add(a);
    const drop = () => this.live.delete(a);
    const prev = a.eventCallback('onComplete');
    a.eventCallback('onComplete', (...args: unknown[]) => {
      (prev as ((...x: unknown[]) => void) | undefined)?.(...args);
      drop();
      this.wake();
    });
    this.wake();
    return a;
  }

  private wrap<V extends gsap.TweenVars | gsap.TimelineVars>(vars: V): V {
    const onUpdate = vars.onUpdate as ((...args: unknown[]) => void) | undefined;
    return {
      ...vars,
      onUpdate: (...args: unknown[]) => {
        this.wake();
        onUpdate?.(...args);
      },
    };
  }
}
