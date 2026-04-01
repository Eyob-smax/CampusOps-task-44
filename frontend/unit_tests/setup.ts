// ---------------------------------------------------------------------------
// Shared test setup — runs before each test file.
// Provides localStorage, window, document, and history shims for Node.
// ---------------------------------------------------------------------------

const _ls: Record<string, string> = (globalThis as any).__test_ls ?? {};
(globalThis as any).__test_ls = _ls;

if (!(globalThis as any).localStorage) {
  (globalThis as any).localStorage = {
    getItem(key: string) { return _ls[key] ?? null; },
    setItem(key: string, value: string) { _ls[key] = value; },
    removeItem(key: string) { delete _ls[key]; },
    clear() { Object.keys(_ls).forEach((k) => delete _ls[k]); },
    get length() { return Object.keys(_ls).length; },
    key() { return null; },
  };
}

const hasRealDom =
  typeof (globalThis as any).window !== 'undefined' &&
  typeof (globalThis as any).document !== 'undefined' &&
  typeof (globalThis as any).document.createElement === 'function';

if (!hasRealDom) {
  (globalThis as any).window = {
    location: { protocol: 'http:', hostname: 'localhost', href: '' },
  };
}

if (!hasRealDom) {
  // Minimal document shim that satisfies Vue's runtime-dom bootstrap
  const noop = () => ({});
  const noopEl: any = () => ({
    setAttribute: noop,
    getAttribute: () => null,
    removeAttribute: noop,
    style: {},
    classList: { add: noop, remove: noop, contains: () => false },
    appendChild: noop,
    removeChild: noop,
    insertBefore: noop,
    contains: () => false,
    addEventListener: noop,
    removeEventListener: noop,
    tagName: 'DIV',
    childNodes: [],
    firstChild: null,
    nextSibling: null,
    nodeType: 1,
  });

  (globalThis as any).document = {
    title: '',
    createElement: noopEl,
    createElementNS: noopEl,
    createTextNode: () => ({ nodeType: 3 }),
    createComment: () => ({ nodeType: 8 }),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    head: { appendChild: noop },
    body: { appendChild: noop },
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: { setAttribute: noop, getAttribute: () => null, style: {} },
  };

  // History API stub for vue-router
  (globalThis as any).history = {
    state: {},
    pushState: noop,
    replaceState: noop,
    go: noop,
    back: noop,
    forward: noop,
    get length() { return 0; },
    scrollRestoration: 'auto',
  };
}

// Navigator: already exists in Node, no need to stub
