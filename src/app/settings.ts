import { KEYS, readJSON } from './persist';
import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  lang: 'en',
  narration: true,
  captions: true,
  volume: 1,
  motion: 'system',
  strapColour: 'purple',
};

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...(readJSON<Partial<Settings>>(KEYS.settings) ?? {}) };
}
