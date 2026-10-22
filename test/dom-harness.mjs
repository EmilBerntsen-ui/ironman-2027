// Hjælper til test/settings.test.mjs og test/app.test.mjs: en minimal falsk DOM, så settings.js og app.js kan køres uden browser.
// Ikke en rigtig DOM: HTML-tekst (innerHTML) parses ikke, og `querySelector` finder kun elementer lavet med createElement/append.
// Kører ikke tests selv (men `node --test` indlæser filen; den har ingen bivirkninger).

export class FakeText {
  constructor(text) { this.text = String(text); this.parent = null; }
  get textContent() { return this.text; }
}

export class FakeEl {
  constructor(tag, doc = null) {
    Object.assign(this, {
      tag, doc, children: [], attrs: {}, handlers: {}, parent: null, className: '', dataset: {}, style: {},
      value: '', checked: false, disabled: false, hidden: false, open: false, files: null,
      innerHTML: '', clientWidth: 800, clientHeight: 0, offsetTop: 0, offsetHeight: 0, scrollTop: 0, _text: '',
    });
    const el = this;
    this.classList = {
      toggle(c, on) { const set = new Set(el.className.split(/\s+/).filter(Boolean)); if (on === undefined ? !set.has(c) : on) set.add(c); else set.delete(c); el.className = [...set].join(' '); },
      contains: c => el.className.split(/\s+/).includes(c),
      add(c) { if (!el.classList.contains(c)) el.className = (el.className + ' ' + c).trim(); },
      remove(c) { el.className = el.className.split(/\s+/).filter(x => x && x !== c).join(' '); },
    };
  }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this.children = []; this._text = String(v); }
  get isConnected() { let n = this; while (n.parent) n = n.parent; return n === this.doc?.body; }

  append(...kids) {
    for (const k of kids) {
      const node = typeof k === 'string' ? new FakeText(k) : k;
      node.parent = this;
      this.children.push(node);
    }
  }
  replaceChildren(...kids) { this.children = []; this._text = ''; this.append(...kids); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }
  removeEventListener(type, fn) { this.handlers[type] = (this.handlers[type] ?? []).filter(f => f !== fn); }
  dispatch(type, ev = {}) { const e = { target: this, type, preventDefault() {}, ...ev }; for (const f of [...(this.handlers[type] ?? [])]) f(e); }
  click() { if (this.disabled) return; this.dispatch('click'); }
  showModal() { this.open = true; }
  close() { if (this.open) { this.open = false; this.dispatch('close'); } }
  focus() {} select() {} scrollTo() {} scrollIntoView() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; }
  closest() { return null; }

  // Søgning i det byggede træ (kun elementer, ikke tekstknuder)
  findAll(pred, out = []) { for (const c of this.children) if (c instanceof FakeEl) { if (pred(c)) out.push(c); c.findAll(pred, out); } return out; }
  find(pred) { return this.findAll(pred)[0] ?? null; }
  byId(id) { return this.find(e => e.attrs.id === id); }
  buttons(label) { return this.findAll(e => e.tag === 'button' && (label === undefined || e.textContent === label)); }
  // Falsk `querySelector`: app.js kalder den på elementer, hvis indhold sat via innerHTML aldrig parses. Giver derfor altid et element.
  querySelector() { return new FakeEl('div', this.doc); }
  querySelectorAll() { return []; }
}

export function fakeDocument({ visibilityState = 'visible' } = {}) {
  const handlers = {};
  const byId = new Map();
  const doc = {
    visibilityState,
    body: null,
    createElement: tag => new FakeEl(tag, doc),
    getElementById(id) { if (!byId.has(id)) { const e = new FakeEl('div', doc); e.id = id; byId.set(id, e); } return byId.get(id); },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: (type, fn) => { (handlers[type] ??= []).push(fn); },
    removeEventListener: (type, fn) => { handlers[type] = (handlers[type] ?? []).filter(f => f !== fn); },
    fire: (type, ev = {}) => { for (const f of [...(handlers[type] ?? [])]) f({ type, target: doc, ...ev }); },
    listeners: type => (handlers[type] ?? []).length,
  };
  doc.body = new FakeEl('body', doc);
  return doc;
}

// Falsk window med hændelseslyttere (fire) og de felter settings.js/app.js/LocalStore læser.
export function fakeWindow(doc, extra = {}) {
  const handlers = {};
  const win = {
    document: doc,
    addEventListener: (type, fn) => { (handlers[type] ??= []).push(fn); },
    removeEventListener: (type, fn) => { handlers[type] = (handlers[type] ?? []).filter(f => f !== fn); },
    fire: (type, ev = {}) => { for (const f of [...(handlers[type] ?? [])]) f({ type, ...ev }); },
    listeners: type => (handlers[type] ?? []).length,
    ...extra,
  };
  win.top = win; win.self = win;
  return win;
}

export const memoryStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, keys: () => [...m.keys()] };
};
