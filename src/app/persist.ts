/** localStorage with a silent in-memory fallback (private mode, blocked storage, previews). */
const memory = new Map<string, string>();

export function readJSON<T>(key: string): T | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    raw = memory.get(key) ?? null;
  }
  if (raw === null) raw = memory.get(key) ?? null;
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJSON(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    /* memory copy is enough for this visit */
  }
}

export function remove(key: string): void {
  memory.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const KEYS = { progress: 'nonla.progress.v1', settings: 'nonla.settings.v1' } as const;
