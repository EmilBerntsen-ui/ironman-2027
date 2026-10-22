// owned by 2b
// ---- LocalStore: fremdrift i localStorage + enhedens id (docs/architecture.md §2) ----
// Indeholder aldrig netværk. ArtifactDbStore og GistStore ombryder en LocalStore som cache.
// Ingen bivirkninger ved indlæsning: alt sker først når en klasse instantieres (bundleren kører filen i en DOM-løs kontekst i tests).
import { mergeProgress, parseAny, stableStringify, stampEntry } from '../progress.js';

const KEY = 'im2027-progress-v2';     // {"v":2,"weeks":Progress}
const V1_KEY = 'im2027-progress';      // gammelt format; læses én gang og røres aldrig
const DEV_KEY = 'im2027-device';
const LABEL = 'Gemmes kun på denne enhed';
const WEEK_ID_RE = /^u\d{2}$/;
const SESSION_KEY_RE = /^[0-6]-\d{1,2}$/;
const DEV_RE = /^[a-z0-9]{1,16}$/;

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; } // kan kaste (blokeret) eller mangle (Node)
}
function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
}
const readKey = (s, k) => { try { return s.getItem(k); } catch { return null; } };
const writeKey = (s, k, v) => { try { s.setItem(k, v); return true; } catch { return false; } };

// Enhedens id: 8 tilfældige base36-tegn, oprettes én gang. Bruges som `dev` (afgør lige tidsstempler i merge).
export function deviceId(storage) {
  const old = storage ? readKey(storage, DEV_KEY) : null;
  if (old && DEV_RE.test(old)) return old;
  const bytes = new Uint8Array(8);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
  const id = Array.from(bytes, b => (b % 36).toString(36)).join('');
  if (storage) writeKey(storage, DEV_KEY, id);
  return id;
}

export class LocalStore {
  static KEY = KEY;
  #storage; #now; #win; #dev;
  #p = {};
  #subs = new Set();
  #onStorage = null;

  constructor({ storage, now = () => new Date(), win = globalThis.window } = {}) {
    this.#storage = storage || defaultStorage() || memoryStorage();
    this.#now = now;
    this.#win = win;
    this.#dev = deviceId(this.#storage);
    this.#read();
    if (win && typeof win.addEventListener === 'function') {
      // Andre faner: tag ændringer ind (merge, aldrig erstat)
      this.#onStorage = ev => {
        if (ev && ev.storageArea && ev.storageArea !== this.#storage) return;
        if (!ev || ev.key === null || ev.key === KEY) this.reread();
      };
      win.addEventListener('storage', this.#onStorage);
    }
  }

  get kind() { return 'local'; }
  get dev() { return this.#dev; }
  get status() { return { kind: 'local', state: 'ready', pending: 0, lastSync: null, label: LABEL }; }
  snapshot() { return this.#p; }

  // Lokal cache; ingen netværk. (Konstruktøren har allerede læst lageret.)
  async load() { return this.#p; }
  async syncNow() {}
  dispose() {
    if (this.#onStorage && this.#win) this.#win.removeEventListener('storage', this.#onStorage);
    this.#onStorage = null;
    this.#subs.clear();
  }

  subscribe(cb) { this.#subs.add(cb); return () => { this.#subs.delete(cb); }; }
  onStatus() { return () => {}; } // LocalStore skifter aldrig status

  // Synkron lokal anvendelse; kaster aldrig. patch = null → gravsten. Returnerer om passet blev gemt.
  save(weekId, sessionKey, patch) {
    try {
      if (typeof weekId !== 'string' || typeof sessionKey !== 'string' || !WEEK_ID_RE.test(weekId) || !SESSION_KEY_RE.test(sessionKey)) return false;
      const week = this.#p[weekId] || {};
      const e = stampEntry(patch, week[sessionKey], { now: this.#now(), dev: this.#dev });
      if (!e) return false;
      this.#p = { ...this.#p, [weekId]: { ...week, [sessionKey]: e } };
      this.#persist();
      this.#emit();
      return true;
    } catch { return false; }
  }

  // Merge (LWW pr. pas) ukendt fremdrift ind i den lokale kopi. Accepterer alt parseAny forstår
  // (Progress, v2-eksport, v1-blob, Artifact-dokumenter, JSON-tekst). Kaster ved ukendt format.
  // → { changed: antal pas der ændrede sig, weeks: berørte uger }
  mergeIn(input) {
    const incoming = parseAny(input);
    return this.#absorb(incoming);
  }
  async importProgress(p) {
    const { changed } = this.mergeIn(p);
    return { changed };
  }

  // Genlæs lageret og merge (andre faner kan have skrevet).
  reread() {
    const raw = readKey(this.#storage, KEY);
    if (raw == null) return;
    try { this.#absorb(parseAny(raw)); } catch { /* ødelagt blob: behold hukommelsen, den skrives ved næste gem */ }
  }

  #absorb(incoming) {
    const next = mergeProgress(this.#p, incoming);
    let changed = 0;
    const weeks = new Set();
    for (const w of Object.keys(incoming)) {
      for (const k of Object.keys(incoming[w])) {
        const before = this.#p[w] && this.#p[w][k];
        if (stableStringify(before) !== stableStringify(next[w][k])) { changed++; weeks.add(w); }
      }
    }
    if (changed) { this.#p = next; this.#persist(); this.#emit(); }
    return { changed, weeks: [...weeks].sort() };
  }

  #read() {
    const raw = readKey(this.#storage, KEY);
    if (raw != null) {
      try { this.#p = parseAny(raw); return; } catch {
        // Ødelagt: gem en kopi før den overskrives
        if (readKey(this.#storage, KEY + '-bad') == null) writeKey(this.#storage, KEY + '-bad', raw);
        this.#p = {};
        return;
      }
    }
    const v1 = readKey(this.#storage, V1_KEY);
    if (v1 != null) {
      try { this.#p = parseAny(v1); this.#persist(); } catch { this.#p = {}; } // v1-nøglen røres ikke
    }
  }

  #persist() { writeKey(this.#storage, KEY, JSON.stringify({ v: 2, weeks: this.#p })); }

  #emit() {
    for (const cb of [...this.#subs]) { try { cb(this.#p); } catch { /* en lytter må ikke vælte gem */ } }
  }
}
