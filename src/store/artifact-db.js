// owned by 2b
// ---- ArtifactDbStore: delt Artifact-database (kun artifact-målet) – docs/architecture.md §2.2 ----
// Én dokument pr. uge i collection `progress`: skrives som {v:2, sessions:Week, updated}; v1-dokumenter {done:{…}, updated} læses også.
// En LocalStore er cache. Et snapshot merges ind (aldrig erstat), så ikke-synkroniserede lokale ændringer aldrig forsvinder.
// Regler for skrivning:
//  - Aldrig fra et snapshot-callback. Et snapshot merges kun ind i lokal tilstand; evt. genskrivning udskydes til uden for callbacken.
//  - Snapshots med metadata.fromCache (og get() fra cachen) er ikke afgørende: de merges lokalt, men udløser aldrig en skrivning.
//    Kun et afgørende (server-)snapshot kan vise, at databasen mangler noget vi har, og først da skubbes ugerne op igen.
//  - En skrivning henter først dokumentet med get(), fletter det ind (seneste updatedAt vinder pr. pas, gravsten inkluderet) og sætter derefter.
import { diffWeeks, mergeWeek, parseAny, stableStringify } from '../progress.js';
import { LocalStore } from './local.js';

const LABEL_OK = 'Gemmes på tværs af enheder';
const LABEL_FORBIDDEN = 'Du kan ikke gemme på denne side. Det gemmes kun i denne browser.';
const LABEL_FAILED = 'Kunne ikke gemme. Prøv igen om lidt.';
const LABEL_LOST = 'Forbindelsen røg. Genindlæs siden.';
const LABEL_OFFLINE = 'Offline. Sendes, når der er forbindelse.';
const OPEN_TIMEOUT_MS = 10000;   // runtimen kan være op til ca. 10 s om at svare på claude.use('db')
const WEEK_ID_RE = /^u\d{2}$/;

const fromCache = x => !!(x && x.metadata && x.metadata.fromCache === true);

// Dokumentets data (snapshot-dokument eller get()-svar), eller undefined hvis det ikke findes. Er svaret selve dataene, bruges de direkte.
function dataOfDoc(doc) {
  if (doc == null) return undefined;
  if (typeof doc.data !== 'function') return doc;
  const exists = typeof doc.exists === 'function' ? doc.exists() : doc.exists;
  return exists === false ? undefined : doc.data();
}

// Ét dokument → Week, eller null hvis id'et ikke er en uge. Et dokument der mangler eller ikke kan læses giver en tom uge. v1 og v2 læses.
function weekOfDoc(id, doc) {
  if (typeof id !== 'string' || !WEEK_ID_RE.test(id)) return null;
  const data = dataOfDoc(doc);
  if (data === undefined) return {};
  try { return parseAny([{ id, data }])[id] || {}; } catch { return {}; }
}

export class ArtifactDbStore {
  static OPEN_TIMEOUT_MS = OPEN_TIMEOUT_MS;
  #db; #local; #now;
  #server = {};                // weekId → Week, som den stod i databasen ved det seneste afgørende snapshot (eller vores egen seneste skrivning)
  #healQueued = false;
  #writing = new Set();
  #again = new Set();
  #failed = new Set();         // uger hvor sidste skrivning fejlede
  #inflight = new Set();       // løfter for igangværende skrivninger
  #statusSubs = new Set();
  #unsub = null;
  #started = false;
  #disposed = false;
  #state = 'ready';
  #lastSync = null;
  #label = LABEL_OK;
  #lastEmitted = '';

  // → Promise<ArtifactDbStore|null>. null = ingen db-capability (så bliver app.js ved LocalStore). Kan tage op til timeoutMs (10 s),
  // så app.js starter på en LocalStore og skifter, når dette løfte er opfyldt.
  static async open({ claude = globalThis.window && globalThis.window.claude, timeoutMs = OPEN_TIMEOUT_MS, storage, now, win } = {}) {
    if (!claude || typeof claude.use !== 'function') return null;
    let timer;
    try {
      const db = await Promise.race([
        Promise.resolve(claude.use('db')),
        new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); }),
      ]);
      return db ? new ArtifactDbStore(db, { storage, now, win }) : null;
    } catch { return null; } finally { clearTimeout(timer); }
  }

  constructor(db, { storage, now = () => new Date(), win } = {}) {
    this.#db = db;
    this.#now = now;
    this.#local = new LocalStore({ storage, now, win });
  }

  get kind() { return 'artifact'; }
  get status() {
    return { kind: 'artifact', state: this.#state, pending: this.#failed.size, lastSync: this.#lastSync, label: this.#label };
  }
  snapshot() { return this.#local.snapshot(); }
  subscribe(cb) { return this.#local.subscribe(cb); }
  onStatus(cb) { this.#statusSubs.add(cb); return () => { this.#statusSubs.delete(cb); }; }

  // Fra lokal cache med det samme; abonnerer på databasen i baggrunden.
  async load() {
    if (!this.#started) { this.#started = true; this.#listen(); }
    return this.#local.snapshot();
  }

  save(weekId, sessionKey, patch) {
    if (!this.#local.save(weekId, sessionKey, patch)) return;
    this.#write(weekId);
  }

  // Skriv de uger der mangler (efter en fejl, eller som databasen ikke har) igen og vent på at alt er sendt.
  async syncNow() {
    const weeks = new Set([...this.#failed, ...diffWeeks(this.#local.snapshot(), this.#server)]);
    for (const w of weeks) this.#write(w);
    while (this.#inflight.size) await Promise.all([...this.#inflight]);
  }

  async importProgress(p) {
    const { changed, weeks } = this.#local.mergeIn(p);
    for (const w of weeks) this.#write(w);
    while (this.#inflight.size) await Promise.all([...this.#inflight]);
    return { changed };
  }

  dispose() {
    this.#disposed = true;
    if (typeof this.#unsub === 'function') { try { this.#unsub(); } catch { /* ligegyldigt */ } }
    this.#unsub = null;
    this.#local.dispose();
    this.#statusSubs.clear();
  }

  #listen() {
    try {
      this.#unsub = this.#db.collection('progress').onSnapshot(
        snap => this.#onSnapshot(snap),
        () => this.#setState('offline', LABEL_LOST),
      );
    } catch { this.#setState('offline', LABEL_LOST); }
  }

  // Kun merge ind i lokal tilstand. Aldrig skrivning herfra: et cache-snapshot kan være forældet, og en skrivning inde i en
  // callback udløser selv nye snapshots midt i udsendelsen.
  #onSnapshot(snap) {
    if (this.#disposed) return;
    const seen = {};
    for (const doc of (snap && snap.docs) || []) {
      const week = doc ? weekOfDoc(doc.id, doc) : null;
      if (week) seen[doc.id] = week;
    }
    try { this.#local.mergeIn(seen); } catch { /* kan ikke ske: seen er allerede normaliseret */ }
    if (fromCache(snap)) return;   // ikke afgørende: intet om hvad databasen mangler
    this.#server = seen;
    this.#healLater();
  }

  // Selvhelbredelse efter et afgørende snapshot: skriv de uger databasen mangler (eller som tidligere fejlede). Udskudt til efter callbacken.
  #healLater() {
    if (this.#healQueued) return;
    this.#healQueued = true;
    queueMicrotask(() => {
      this.#healQueued = false;
      if (this.#disposed) return;
      const weeks = new Set([...diffWeeks(this.#local.snapshot(), this.#server), ...this.#failed]);
      for (const w of weeks) if (!this.#writing.has(w)) this.#write(w); // en igangværende skrivning tjekker selv bagefter
    });
  }

  #write(weekId) {
    if (this.#disposed) return;
    if (this.#writing.has(weekId)) { this.#again.add(weekId); return; }
    this.#writing.add(weekId);
    const p = this.#doWrite(weekId).finally(() => { this.#inflight.delete(p); });
    this.#inflight.add(p);
    this.#setState('syncing');
  }

  // get → flet (seneste updatedAt vinder pr. pas, gravsten tæller) → set. Intet at skrive, hvis databasen allerede har det hele.
  async #doWrite(wk) {
    let ok = false;
    try {
      const ref = this.#db.doc('progress/' + wk);
      const snap = await ref.get();
      const remote = weekOfDoc(wk, snap) || {};
      if (Object.keys(remote).length) this.#local.mergeIn({ [wk]: remote }); // også en cache-aflæsning må gerne flettes ind lokalt
      if (fromCache(snap)) throw Object.assign(new Error('offline'), { offline: true }); // men aldrig skrives ud fra
      const week = mergeWeek(this.#local.snapshot()[wk], remote);
      if (stableStringify(week) !== stableStringify(remote)) await ref.set({ v: 2, sessions: week, updated: this.#now().toISOString() });
      this.#server[wk] = week;
      this.#failed.delete(wk);
      this.#lastSync = this.#now().toISOString();
      ok = true;
    } catch (e) {
      this.#failed.add(wk);
      if (e && e.offline) this.#setState('offline', LABEL_OFFLINE);
      else this.#setState('error', e && e.code === 'invalid_argument' ? LABEL_FORBIDDEN : LABEL_FAILED);
    }
    this.#writing.delete(wk);
    if (ok) {
      // Er der kommet noget ind (eller gemt) mens vi skrev, er databasen allerede bagud igen
      const again = this.#again.delete(wk);
      const now = this.#local.snapshot()[wk] || {};
      if (again || stableStringify(now) !== stableStringify(this.#server[wk])) this.#write(wk);
      else if (!this.#writing.size && !this.#failed.size) this.#setState('ready', LABEL_OK);
    } else this.#again.delete(wk);
  }

  #setState(state, label) {
    this.#state = state;
    if (label) this.#label = label;
    else if (state === 'syncing') this.#label = LABEL_OK;
    this.#touch();
  }

  #touch() {
    const s = this.status;
    const sig = JSON.stringify(s);
    if (sig === this.#lastEmitted) return;
    this.#lastEmitted = sig;
    for (const cb of [...this.#statusSubs]) { try { cb(s); } catch { /* ligegyldigt */ } }
  }
}
