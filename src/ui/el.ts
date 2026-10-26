/** Tiny DOM helper: el('button.btn.btn--cta', { onclick, 'data-touch': '' }, 'Start'). */
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> & { style?: Partial<CSSStyleDeclaration> | string; dataset?: Record<string, string> };

export function el<K extends keyof HTMLElementTagNameMap>(
  tagAndClasses: K | `${K}.${string}` | `${K}#${string}`,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const [tagWithId, ...classes] = tagAndClasses.split('.');
  const [tag, id] = tagWithId.split('#');
  const node = document.createElement(tag as K);
  if (id) node.id = id;
  if (classes.length) node.classList.add(...classes);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'style') {
      if (typeof value === 'string') node.setAttribute('style', value);
      else Object.assign(node.style, value);
    } else if (key === 'dataset') {
      Object.assign(node.dataset, value as Record<string, string>);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key in node && typeof value !== 'string') {
      (node as unknown as Record<string, unknown>)[key] = value;
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(node, ...children);
  return node;
}

export function append(parent: Node, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function svg(markup: string, className = 'icon'): SVGSVGElement {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  const s = t.content.firstElementChild as SVGSVGElement;
  s.classList.add(className);
  s.setAttribute('aria-hidden', 'true');
  return s;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
