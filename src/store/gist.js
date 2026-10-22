// owned by 2b
// ---- GistStore: synk via en hemmelig Gist (kun site-målet) – docs/architecture.md §3.4–§3.5 og §4 ----
// Hver enhed har en fuld, flettet kopi (LocalStore som cache). Synk er tilstandsbaseret: GET (ETag) → merge → PATCH af de beskidte
// ugefiler → verificerende GET. Gisten har ét fil pr. uge (u01.json …), så en PATCH kun rører de uger der er ændret.
// Tokenet ligger kun i `im2027-gist` (localStorage), sendes kun til api.github.com og logges aldrig.
import { GIST_DESCRIPTION, META_FILE, FORMAT, SCHEMA, diffWeeks, parseWeekFile, serializeWeek, weekFileName } from '../progress.js';
import { LocalStore } from './local.js';

const API = 'https://api.github.com';
const CFG_KEY = 'im2027-gist';
const SYNC_KEY = 'im2027-gist-sync';
const LOCK_NAME = 'im2027-sync';
const PLAN_START = '2026-10-26'; // første plandag; står i markørfilen
const DEBOUNCE_MS = 1500, MAX_WAIT_MS = 10000, POLL_MS = 60000, THROTTLE_MS = 10000;
const VERIFY_MS = 4000, VERIFY_JITTER_MS = 1000;
const BACKOFF_BASE_MS = 2000, BACKOFF_CAP_MS = 300000;
const FALLBACK_PAUSE_MS = 60000, MAX_PAUSE_MS = 3660000;
const REQUEST_TIMEOUT_MS = 20000; // en hængende forbindelse må ikke holde Web Lock'en (og dermed al synk) fast
const RATE_LIMIT_RE = /rate limit|abuse detection/i; // GitHub svarer 403 med den tekst, også for sekundære grænser, ofte uden headers
const WEEK_ID_RE = /^u\d{2}$/;
const GIST_ID_RE = /^[A-Za-z0-9]{1,64}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{10,255}$/;
const LOGIN_RE = /^[A-Za-z0-9-]{1,39}$/;
const MAX_PAGES = 10;

// Intern fejl med en kode: 'network' | 'server' | 'auth' | 'scope' | 'ratelimit' | 'notfound' | 'invalid' | 'http'
class GistError extends Error {
  constructor(code, message, extra) {
    super(message);
    this.name = 'GistError';
    this.code = code;
    if (extra) Object.assign(this, extra);
  }
}

const bound = f => (typeof f === 'function' ? f.bind(globalThis) : undefined);

function resolveDeps(d = {}) {
  return {
    fetch: d.fetch || bound(globalThis.fetch),
    storage: d.storage || globalThis.localStorage,
    now: d.now || (() => new Date()),
    api: (d.api || API).replace(/\/+$/, ''),
    timeoutMs: Number.isFinite(d.timeoutMs) && d.timeoutMs > 0 ? d.timeoutMs : REQUEST_TIMEOUT_MS,
  };
}

const readKey = (s, k) => { try { return s.getItem(k); } catch { return null; } };
const writeKey = (s, k, v) => { try { s.setItem(k, v); } catch { /* fuld eller blokeret */ } };
const removeKey = (s, k) => { try { s.removeItem(k); } catch { /* ligegyldigt */ } };

// Ét kald til GitHub. Tokenet sendes aldrig til andre værter end `api`.
async function ghFetch(deps, token, method, target, { body, etag } = {}) {
  const url = /^https?:\/\//.test(target) ? target : deps.api + target;
  if (!url.startsWith(deps.api + '/')) throw new GistError('http', 'Ugyldig adresse fra GitHub');
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (etag) headers['If-None-Match'] = etag;
  try {
    // signal: afbryder både hængende forbindelser og hængende svarlæsning. Timeout er en netværksfejl (prøv igen med backoff).
    const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(deps.timeoutMs) : undefined;
    return await deps.fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal });
  } catch (e) {
    throw new GistError('network', e && e.name === 'TimeoutError' ? 'GitHub svarede ikke i tide' : 'Ingen forbindelse til GitHub');
  }
}

// Brødteksten fra et fejlsvar som tekst (kort), eller ''. Kun til at genkende grænsebeskeder; vises aldrig.
async function bodyMessage(res) {
  try {
    const text = (await res.text()).slice(0, 2000);
    try { const j = JSON.parse(text); return j && typeof j.message === 'string' ? j.message : text; } catch { return text; }
  } catch { return ''; }
}

// Ikke-ok svar → GistError. Grænse-svar får `until` (ms siden epoch): 403/429 med retry-after eller x-ratelimit-remaining: 0, og 403/429
// hvis besked nævner "rate limit" (også sekundære grænser, som ofte kommer uden headers). Uden en dato (`fallback: true`) bruger kalderen backoff.
async function failure(res, nowMs) {
  const h = n => (res.headers && typeof res.headers.get === 'function' ? res.headers.get(n) : null);
  const st = res.status;
  if (st === 401) return new GistError('auth', 'Tokenet blev afvist', { status: st });
  if (st === 403 || st === 429) {
    const ra = h('retry-after'), remaining = h('x-ratelimit-remaining'), reset = h('x-ratelimit-reset');
    let until = null, fallback = false;
    if (ra != null && ra !== '' && Number.isFinite(+ra)) until = nowMs + Math.max(0, +ra) * 1000;
    else if (remaining === '0') until = reset != null && reset !== '' && Number.isFinite(+reset) ? +reset * 1000 : nowMs + FALLBACK_PAUSE_MS;
    else if (st === 429 || RATE_LIMIT_RE.test(await bodyMessage(res))) { until = nowMs + FALLBACK_PAUSE_MS; fallback = true; }
    if (until !== null) return new GistError('ratelimit', 'GitHubs grænse for forespørgsler er nået', { status: st, until: Math.min(until, nowMs + MAX_PAUSE_MS), fallback });
    return new GistError('scope', 'Tokenet mangler Gists: Read and write', { status: st });
  }
  if (st === 404) return new GistError('notfound', 'Gist ikke fundet', { status: st });
  if (st === 409 || st >= 500) return new GistError('server', `GitHub svarede ${st}`, { status: st });
  if (st === 422) return new GistError('invalid', 'GitHub afviste ændringen (422)', { status: st });
  return new GistError('http', `GitHub svarede ${st}`, { status: st });
}

async function jsonOf(res) {
  try { return await res.json(); } catch { throw new GistError('server', 'Ugyldigt svar fra GitHub'); } // typisk afbrudt svar: prøv igen
}

const hhmm = iso => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const weeksLabel = n => `${n} ${n === 1 ? 'uge' : 'uger'} venter`;

export class GistStore {
  // → { token, gistId, login, connectedAt } | null
  static readConfig(storage) {
    try {
      const c = JSON.parse(storage.getItem(CFG_KEY));
      if (!c || typeof c !== 'object' || !TOKEN_RE.test(c.token || '') || !GIST_ID_RE.test(c.gistId || '')) return null;
      return {
        token: c.token, gistId: c.gistId,
        login: typeof c.login === 'string' && LOGIN_RE.test(c.login) ? c.login : '',
        connectedAt: typeof c.connectedAt === 'string' ? c.connectedAt : null,
      };
    } catch { return null; }
  }

  // Tjek tokenet, find gisten (markørfil + beskrivelse; nyeste vinder) eller opret den. Rører ikke lageret, så Node-scriptet
  // scripts/create-gist.mjs bruger præcis den samme find-eller-opret som appen.
  // deps.gistId: manuelt gist-id (springer opslaget over). → { gistId, login, created }
  static async findOrCreate(token, deps = {}) {
    const d = resolveDeps(deps);
    token = String(token ?? '').trim();
    if (!TOKEN_RE.test(token)) throw new GistError('auth', 'Tokenet ser ikke rigtigt ud. Kopiér hele tokenet fra GitHub');
    const nowMs = () => d.now().getTime();
    const call = async (method, target, body) => {
      const res = await ghFetch(d, token, method, target, { body });
      if (!res.ok) throw await failure(res, nowMs());
      return res;
    };

    const user = await jsonOf(await call('GET', '/user'));
    const login = typeof user.login === 'string' && LOGIN_RE.test(user.login) ? user.login : '';

    let gistId = null, created = false;
    if (deps.gistId) {
      const id = String(deps.gistId).trim();
      if (!GIST_ID_RE.test(id)) throw new GistError('invalid', 'Gist-id ser ikke rigtigt ud');
      const g = await jsonOf(await call('GET', `/gists/${encodeURIComponent(id)}`));
      if (!g.files || !g.files[META_FILE]) throw new GistError('invalid', 'Gisten er ikke en Ironman 2027-log');
      gistId = id;
    } else {
      let best = null, url = '/gists?per_page=100';
      for (let page = 0; url && page < MAX_PAGES; page++) {
        const res = await call('GET', url);
        const list = await jsonOf(res);
        for (const g of Array.isArray(list) ? list : []) {
          if (!g || g.description !== GIST_DESCRIPTION || !g.files || !g.files[META_FILE] || !GIST_ID_RE.test(g.id || '')) continue;
          if (!best || String(g.updated_at || '') > String(best.updated_at || '')) best = g;
        }
        const m = /<([^>]+)>\s*;\s*rel="next"/.exec((res.headers && res.headers.get('link')) || '');
        url = m ? m[1] : null; // ghFetch afviser alt der ikke ligger under api-adressen
      }
      if (best) gistId = best.id;
      else {
        const meta = JSON.stringify({ format: FORMAT, v: SCHEMA, kind: 'meta', start: PLAN_START, createdAt: d.now().toISOString() });
        const g = await jsonOf(await call('POST', '/gists', { description: GIST_DESCRIPTION, public: false, files: { [META_FILE]: { content: meta } } }));
        if (!GIST_ID_RE.test(g.id || '')) throw new GistError('http', 'Ugyldigt svar fra GitHub');
        gistId = g.id; created = true;
      }
    }
    return { gistId, login, created };
  }

  // Forbind: find (eller opret) gisten, gem konfigurationen og markér alle lokale uger som beskidte.
  // deps.gistId: manuelt gist-id (springer opslaget over). → { gistId, login, created }
  static async connect(token, deps = {}) {
    const d = resolveDeps(deps);
    const found = await GistStore.findOrCreate(token, deps);
    token = String(token).trim();
    writeKey(d.storage, CFG_KEY, JSON.stringify({ token, gistId: found.gistId, login: found.login, connectedAt: d.now().toISOString() }));
    // Første flush fletter begge veje: alle lokale uger med pas er beskidte
    const local = new LocalStore({ storage: d.storage, now: d.now, win: null });
    const snap = local.snapshot();
    const dirty = Object.keys(snap).filter(w => Object.keys(snap[w]).length).sort();
    local.dispose();
    writeKey(d.storage, SYNC_KEY, JSON.stringify({ etag: null, dirty, lastSync: null }));
    return found;
  }

  // Fjern forbindelsen (token, gist-id og synkkø). wipeLocal sletter også den lokale kopi.
  static disconnect(storage, { wipeLocal = false } = {}) {
    removeKey(storage, CFG_KEY);
    removeKey(storage, SYNC_KEY);
    if (wipeLocal) removeKey(storage, LocalStore.KEY);
  }

  #cfg; #deps; #storage; #now; #fetch; #setT; #clearT; #random; #win; #locks; #poll;
  #local;
  #state = 'ready';
  #detail = '';
  #paused = false;
  #blockedUntil = 0;
  #failures = 0;
  #limitHits = 0;       // på hinanden følgende grænsesvar uden dato: backoff 60 s · 2ⁿ
  #disposed = false;
  #chain = Promise.resolve();
  #queued = null;
  #timers = { flush: null, max: null, retry: null, verify: null, poll: null };
  #lastTrigger = -Infinity;
  #statusSubs = new Set();
  #lastEmitted = '';
  #listeners = [];

  constructor(config, { fetch, storage, now, setTimeout: st, clearTimeout: ct, random, api, poll = true, win, locks, timeoutMs } = {}) {
    if (!config || !TOKEN_RE.test(config.token || '') || !GIST_ID_RE.test(config.gistId || '')) throw new TypeError('GistStore: ugyldig konfiguration');
    this.#cfg = config;
    this.#deps = resolveDeps({ fetch, storage, now, api, timeoutMs });
    this.#storage = this.#deps.storage;
    this.#now = this.#deps.now;
    this.#fetch = this.#deps.fetch;
    this.#setT = st || bound(globalThis.setTimeout);
    this.#clearT = ct || bound(globalThis.clearTimeout);
    this.#random = random || Math.random;
    this.#win = win === undefined ? globalThis.window : win;
    this.#locks = locks === undefined ? (globalThis.navigator && globalThis.navigator.locks) : locks;
    this.#poll = poll;
    this.#local = new LocalStore({ storage: this.#storage, now: this.#now, win: this.#win });
  }

  get kind() { return 'gist'; }
  // Til visning: aldrig tokenet selv, kun præfiks + de sidste 4 tegn (github_pat_…abcd)
  get config() {
    const t = this.#cfg.token, prefix = (/^(?:github_pat_|gh[a-z]_)/.exec(t) || [''])[0];
    return { gistId: this.#cfg.gistId, login: this.#cfg.login, connectedAt: this.#cfg.connectedAt, tokenHint: `${prefix}…${t.slice(-4)}` };
  }
  get status() {
    const sync = this.#readSync();
    const pending = sync.dirty.length;
    let label;
    switch (this.#state) {
      case 'ready': label = sync.lastSync ? `Synkroniseret kl. ${hhmm(sync.lastSync)}` : 'Ikke synkroniseret endnu'; break;
      case 'syncing': label = 'Synkroniserer…'; break;
      case 'offline': label = (this.#paused ? 'Pause (GitHub-grænse)' : 'Offline') + (pending ? ' · ' + weeksLabel(pending) : ''); break;
      case 'auth': label = 'Forbind GitHub igen'; break;
      default: label = 'Synkfejl – tryk for detaljer';
    }
    return { kind: 'gist', state: this.#state, pending, lastSync: sync.lastSync, label, detail: this.#detail };
  }
  snapshot() { return this.#local.snapshot(); }
  subscribe(cb) { return this.#local.subscribe(cb); }
  onStatus(cb) { this.#statusSubs.add(cb); return () => { this.#statusSubs.delete(cb); }; }

  // Lokal kopi med det samme; synk starter i baggrunden (med poll: true).
  async load() {
    if (this.#poll) { this.#startTriggers(); this.#sync(); }
    return this.#local.snapshot();
  }

  save(weekId, sessionKey, patch) {
    if (!this.#local.save(weekId, sessionKey, patch)) return;
    this.#markDirty([weekId]);
    this.#scheduleFlush();
  }

  syncNow() { return this.#sync(); }

  async importProgress(p) {
    const { changed, weeks } = this.#local.mergeIn(p);
    if (weeks.length) { this.#markDirty(weeks); this.#scheduleFlush(); }
    return { changed };
  }

  dispose() {
    this.#disposed = true;
    for (const k of Object.keys(this.#timers)) this.#clear(k);
    for (const [target, type, fn] of this.#listeners) target.removeEventListener(type, fn);
    this.#listeners = [];
    this.#local.dispose();
    this.#statusSubs.clear();
  }

  // ---- synkkø (im2027-gist-sync) ----
  #readSync() {
    try {
      const j = JSON.parse(readKey(this.#storage, SYNC_KEY));
      if (j && typeof j === 'object') {
        return {
          etag: typeof j.etag === 'string' ? j.etag : null,
          dirty: Array.isArray(j.dirty) ? [...new Set(j.dirty.filter(w => typeof w === 'string' && WEEK_ID_RE.test(w)))].sort() : [],
          lastSync: typeof j.lastSync === 'string' ? j.lastSync : null,
        };
      }
    } catch { /* tom eller ødelagt */ }
    return { etag: null, dirty: [], lastSync: null };
  }
  #writeSync(s) { writeKey(this.#storage, SYNC_KEY, JSON.stringify({ etag: s.etag, dirty: s.dirty, lastSync: s.lastSync })); }
  #patchSync(fn) { const s = this.#readSync(); fn(s); this.#writeSync(s); }
  #markDirty(weeks) { this.#patchSync(s => { s.dirty = [...new Set([...s.dirty, ...weeks])].sort(); }); }

  // ---- tilstand og timere ----
  #nowMs() { return this.#now().getTime(); }
  #setState(state, detail = '', paused = false) {
    this.#state = state;
    this.#detail = detail;
    this.#paused = state === 'offline' && paused; // pause = GitHubs grænse (ikke netværk)
    this.#emitStatus();
  }
  #emitStatus() {
    const s = this.status;
    const sig = JSON.stringify(s);
    if (sig === this.#lastEmitted) return;
    this.#lastEmitted = sig;
    for (const cb of [...this.#statusSubs]) { try { cb(s); } catch { /* ligegyldigt */ } }
  }
  #arm(name, ms, fn) {
    this.#clear(name);
    if (this.#disposed) return;
    this.#timers[name] = this.#setT(() => { this.#timers[name] = null; fn(); }, Math.max(0, ms));
  }
  #clear(name) {
    if (this.#timers[name] !== null) { this.#clearT(this.#timers[name]); this.#timers[name] = null; }
  }

  // Debounce 1,5 s, højst 10 s fra første ændring i batchen.
  #scheduleFlush() {
    if (this.#disposed || this.#state === 'auth') { this.#emitStatus(); return; }
    if (this.#state === 'ready') this.#setState('syncing'); else this.#emitStatus();
    const go = () => { this.#clear('flush'); this.#clear('max'); this.#sync(); };
    this.#arm('flush', DEBOUNCE_MS, go);
    if (this.#timers.max === null) this.#arm('max', MAX_WAIT_MS, go);
  }

  // Én synkronisering ad gangen pr. fane (kæde) og pr. browser (Web Locks); samtidige kald deler den ventende kørsel.
  #sync() {
    if (this.#queued) return this.#queued;
    const run = () => {
      this.#queued = null;
      if (!this.#locks) return this.#cycle();
      let started = false;
      const job = () => { started = true; return this.#cycle(); };
      try { return Promise.resolve(this.#locks.request(LOCK_NAME, job)).catch(() => (started ? undefined : this.#cycle())); }
      catch { return this.#cycle(); } // Web Locks utilgængelig: kør uden
    };
    const p = this.#chain.then(run, run);
    this.#queued = p;
    this.#chain = p.catch(() => {});
    return p.catch(() => {});
  }

  async #cycle() {
    if (this.#disposed || this.#state === 'auth') return;
    const t = this.#nowMs();
    if (this.#blockedUntil > t) { this.#arm('retry', this.#blockedUntil - t + 500, () => this.#sync()); this.#emitStatus(); return; }
    this.#clear('retry');
    this.#clear('flush'); this.#clear('max'); // alt der er beskidt nu, sendes af denne kørsel; senere ændringer starter en ny debounce
    this.#lastTrigger = t;
    this.#setState('syncing');
    try {
      this.#local.reread();
      await this.#pull();
      await this.#push();
      this.#failures = 0;
      this.#limitHits = 0;
      this.#blockedUntil = 0;
      this.#patchSync(s => { s.lastSync = this.#now().toISOString(); });
      const busy = this.#timers.flush !== null && this.#readSync().dirty.length > 0; // en ny ændring venter på sin flush
      this.#setState(busy ? 'syncing' : 'ready');
    } catch (e) {
      this.#fail(e);
    }
  }

  #fail(e) {
    const code = e instanceof GistError ? e.code : 'unknown';
    if (code === 'auth' || code === 'scope') {
      for (const k of Object.keys(this.#timers)) this.#clear(k); // stop alt til der forbindes igen; beskidte uger beholdes
      this.#setState('auth', e.message);
    } else if (code === 'ratelimit') {
      const hits = this.#limitHits++;
      this.#blockedUntil = e.fallback ? this.#nowMs() + Math.min(MAX_PAUSE_MS, FALLBACK_PAUSE_MS * 2 ** hits) : e.until;
      this.#setState('offline', e.message, true);
      this.#arm('retry', Math.max(0, this.#blockedUntil - this.#nowMs()) + 500, () => this.#sync());
    } else if (code === 'network' || code === 'server') {
      this.#failures++;
      const base = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (this.#failures - 1));
      this.#setState('offline', e.message);
      this.#arm('retry', base * (1 + (this.#random() * 0.4 - 0.2)), () => this.#sync());
    } else if (code === 'notfound') {
      this.#setState('error', 'Gist ikke fundet');
    } else {
      this.#setState('error', e && e.message ? String(e.message) : 'Ukendt fejl');
    }
  }

  // ---- netværk ----
  async #request(method, path, opts) {
    const res = await ghFetch(this.#deps, this.#cfg.token, method, path, opts);
    if (res.status === 304) return res;
    if (!res.ok) throw await failure(res, this.#nowMs());
    return res;
  }

  // GET med ETag → merge ind i den lokale kopi → alt lokalt som gisten mangler bliver beskidt (selvhelbredelse).
  async #pull() {
    const sync = this.#readSync();
    const hasLocal = Object.keys(this.#local.snapshot()).length > 0;
    const res = await this.#request('GET', `/gists/${encodeURIComponent(this.#cfg.gistId)}`, { etag: sync.etag && hasLocal ? sync.etag : undefined });
    if (res.status === 304) return;
    const j = await jsonOf(res);
    // Et 200 uden `files` er ikke en tom gist, men et ødelagt svar (proxy, loginside). Opfattes det som tomt, ville alt lokalt blive skrevet over gisten.
    if (!j || typeof j.files !== 'object' || j.files === null || Array.isArray(j.files)) throw new GistError('server', 'Uventet svar fra GitHub (ingen filer)');
    const files = j.files;
    const remote = {};
    for (const name of Object.keys(files)) {
      const f = files[name];
      if (!f || typeof f.content !== 'string') continue;
      const parsed = parseWeekFile(name, f.content); // validerer hver byte før den når tilstanden
      if (parsed) remote[parsed.weekId] = parsed.week;
    }
    const etag = res.headers && res.headers.get('etag');
    this.#local.mergeIn(remote);
    const heal = diffWeeks(this.#local.snapshot(), remote);
    this.#patchSync(s => { s.etag = etag || null; if (heal.length) s.dirty = [...new Set([...s.dirty, ...heal])].sort(); });
  }

  // Send de beskidte ugefiler i én PATCH. Ændrede uger undervejs forbliver beskidte. Planlæg derefter ét verificerende læs.
  async #push() {
    const dirty = this.#readSync().dirty;
    if (!dirty.length) return;
    const snap = this.#local.snapshot();
    const files = {}, sent = {};
    for (const w of dirty) {
      if (!snap[w] || !Object.keys(snap[w]).length) continue; // intet at skrive
      sent[w] = serializeWeek(w, snap[w]);
      files[weekFileName(w)] = { content: sent[w] };
    }
    if (!Object.keys(files).length) { this.#patchSync(s => { s.dirty = []; }); return; }
    await this.#request('PATCH', `/gists/${encodeURIComponent(this.#cfg.gistId)}`, { body: { files } });
    const cur = this.#local.snapshot();
    this.#patchSync(s => {
      s.dirty = s.dirty.filter(w => !(w in sent) ? Object.keys(cur[w] || {}).length > 0 : serializeWeek(w, cur[w]) !== sent[w]);
      s.etag = null;
    });
    if (this.#timers.verify === null) this.#arm('verify', VERIFY_MS + (this.#random() * 2 - 1) * VERIFY_JITTER_MS, () => this.#sync());
  }

  // ---- udløsere: ved indlæsning, fokus, online, synlighed og hvert 60. sekund mens siden er synlig ----
  #startTriggers() {
    const win = this.#win;
    if (!win || typeof win.addEventListener !== 'function' || this.#listeners.length) { this.#schedulePoll(); return; }
    const doc = win.document;
    const hidden = () => !!doc && doc.visibilityState === 'hidden';
    const trigger = bypass => {
      if (this.#disposed || hidden()) return;
      const t = this.#nowMs();
      if (!bypass && t - this.#lastTrigger < THROTTLE_MS) return;
      this.#lastTrigger = t;
      this.#sync();
    };
    const on = (target, type, fn) => { target.addEventListener(type, fn); this.#listeners.push([target, type, fn]); };
    if (doc) on(doc, 'visibilitychange', () => {
      if (!hidden()) trigger(false);
      else if (this.#readSync().dirty.length && this.#state !== 'auth') this.#sync(); // skjules siden, så send ventende ændringer nu
    });
    on(win, 'focus', () => trigger(false));
    on(win, 'online', () => trigger(true));
    this.#schedulePoll();
  }
  #schedulePoll() {
    this.#arm('poll', POLL_MS, () => {
      const doc = this.#win && this.#win.document;
      if (!doc || doc.visibilityState !== 'hidden') this.#sync();
      this.#schedulePoll();
    });
  }
}
