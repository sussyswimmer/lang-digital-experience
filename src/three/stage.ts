/** Temporary viewer until the three.js stage lands: satisfies the HatViewer API with no-ops. */
import type { HatViewer, LayerController } from './HatViewer';

export async function createViewer(host: HTMLElement): Promise<HatViewer> {
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  const noop: LayerController = { run: async () => {}, finish: () => {}, dispose: () => {} };
  return {
    canvas,
    ready: Promise.resolve(),
    show: () => {},
    hide: () => {},
    setInteractive: () => {},
    resetHat: () => {},
    convergeFrom: async () => {},
    layer: () => noop,
    setStrapColour: () => {},
    celebrateAndShrinkTo: async () => {},
    project: () => null,
    dispose: () => canvas.remove(),
  };
}
