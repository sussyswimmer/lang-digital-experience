/**
 * Every visible string has an id with English and Vietnamese text (content/strings/*.json).
 * Narration audio is found by convention: assets/audio/narration/<lang>/<id>.mp3.
 * Vietnamese is machine-drafted until Meri reviews it (viStatus: "machine" → "reviewed").
 */
import type { Lang } from '../app/types';

export type StringKind = 'ui' | 'narration' | 'label' | 'alt';

export interface StringEntry {
  kind: StringKind;
  en: string;
  vi: string;
  viStatus?: 'machine' | 'reviewed';
  notes?: string;
}

const modules = import.meta.glob<Record<string, StringEntry>>('../../content/strings/*.json', {
  eager: true,
  import: 'default',
});

export const STRINGS: Record<string, StringEntry> = Object.assign({}, ...Object.values(modules));

type Listener = (lang: Lang) => void;
type Vars = Record<string, string | number>;

class I18n {
  lang: Lang = 'en';
  private listeners = new Set<Listener>();
  private bound = new Map<Element, { id: string; vars?: Vars }>();
  /** attribute bindings (aria-label, alt, title…): node → attribute → string */
  private boundAttrs = new Map<Element, Map<string, { id: string; vars?: Vars }>>();

  has(id: string): boolean {
    return id in STRINGS;
  }

  /** Text for `id` in the current (or given) language; {name} placeholders are filled from vars. */
  t(id: string, vars?: Record<string, string | number>, lang: Lang = this.lang): string {
    const entry = STRINGS[id];
    if (!entry) {
      if (import.meta.env.DEV) console.warn(`[i18n] missing string "${id}"`);
      return `⟦${id}⟧`;
    }
    let text = entry[lang] || entry.en;
    if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
    return text;
  }

  /** Keep an element's text in sync with the language toggle. */
  bind<E extends Element>(node: E, id: string, vars?: Vars): E {
    this.bound.set(node, { id, vars });
    node.textContent = this.t(id, vars);
    node.setAttribute('data-i18n', id);
    return node;
  }

  /** Keep an attribute (aria-label, alt, title…) in sync with the language toggle. */
  bindAttr<E extends Element>(node: E, attr: string, id: string, vars?: Vars): E {
    let attrs = this.boundAttrs.get(node);
    if (!attrs) this.boundAttrs.set(node, (attrs = new Map()));
    attrs.set(attr, { id, vars });
    node.setAttribute(attr, this.t(id, vars));
    return node;
  }

  /** Forget nodes that have left the page, so they can be freed (the shell calls this when a screen unmounts). */
  prune(): void {
    for (const node of this.bound.keys()) if (!node.isConnected) this.bound.delete(node);
    for (const node of this.boundAttrs.keys()) if (!node.isConnected) this.boundAttrs.delete(node);
  }

  setLang(lang: Lang): void {
    if (lang === this.lang) return;
    this.lang = lang;
    document.documentElement.lang = lang;
    this.prune();
    for (const [node, { id, vars }] of this.bound) node.textContent = this.t(id, vars);
    for (const [node, attrs] of this.boundAttrs) for (const [attr, { id, vars }] of attrs) node.setAttribute(attr, this.t(id, vars));
    for (const l of this.listeners) l(lang);
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const i18n = new I18n();
export const t = (id: string, vars?: Record<string, string | number>) => i18n.t(id, vars);

/** Vietnamese and English number words for counting (rings, hats). */
const VI_NUM = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười'];
export function countWord(n: number, lang: Lang = i18n.lang): string {
  if (lang === 'vi') {
    if (n <= 10) return VI_NUM[n];
    if (n < 20) return `mười ${n % 10 === 5 ? 'lăm' : VI_NUM[n % 10]}`.replace(' không', '');
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    const unit = ones === 0 ? '' : ones === 1 ? ' mốt' : ones === 5 ? ' lăm' : ` ${VI_NUM[ones]}`;
    return `${VI_NUM[tens]} mươi${unit}`;
  }
  return String(n);
}
