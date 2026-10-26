/** A minimal typed observable store. */
export class Store<T extends object> {
  private value: T;
  private listeners = new Set<(v: T, prev: T) => void>();

  constructor(initial: T) {
    this.value = initial;
  }

  get(): T {
    return this.value;
  }

  set(next: T | ((v: T) => T)): void {
    const prev = this.value;
    this.value = typeof next === 'function' ? (next as (v: T) => T)(prev) : next;
    if (this.value !== prev) for (const l of this.listeners) l(this.value, prev);
  }

  patch(part: Partial<T>): void {
    this.set({ ...this.value, ...part });
  }

  subscribe(fn: (v: T, prev: T) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
