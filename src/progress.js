// ---- Fremdrift: skema v2 (ren logik, ingen DOM og ingen Node-API'er) ----
// Kører både i Node (tests, CI) og i browseren (bundlet af build/bundle.mjs).
// Regler fra bundleren: én `export` pr. linje (ingen `export const a = 1, b = 2`), ingen default-eksport,
// ingen `export { … }`. Se docs/architecture.md §3.

/** @typedef {{ done: boolean, updatedAt: string, dev?: string, at?: string, min?: number, rpe?: number,
 *              note?: string, src?: 'manual'|'strava', extId?: string, sig?: string,
 *              dist?: number, hr?: number }} Entry   dist = meter (Strava), hr = gennemsnitspuls i slag/min (Strava) */
/** @typedef {Record<string, Entry>} Week            sessionKey → Entry */
/** @typedef {Record<string, Week>} Progress         weekId → Week */

export const FORMAT = 'ironman-2027-progress';
export const SCHEMA = 2;
export const EPOCH = '1970-01-01T00:00:00.000Z';
export const META_FILE = '_ironman-2027.json';
export const GIST_DESCRIPTION = 'Ironman 2027 – træningslog (redigér ikke manuelt)';

const WEEK_ID_RE = /^u\d{2}$/;
const SESSION_KEY_RE = /^[0-6]-\d{1,2}$/;
const WEEK_FILE_RE = /^(u\d{2})\.json$/;
const UNKNOWN_KEY_RE = /^[A-Za-z][\w-]{0,39}$/;
const MAX_MS = Date.parse('9999-12-31T23:59:59.999Z');
const KNOWN = new Set(['done', 'updatedAt', 'dev', 'at', 'min', 'rpe', 'note', 'src', 'extId', 'sig', 'dist', 'hr']);

const isObj = v => typeof v === 'object' && v !== null && !Array.isArray(v);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Gyldigt tidsstempel → kanonisk ISO-streng (UTC, millisekunder), ellers null.
function isoOrNull(v) {
  if (typeof v !== 'string' || v.length > 40) return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t) || t < 0 || t > MAX_MS) return null;
  return new Date(t).toISOString();
}
const cleanStr = (v, max) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

// ---- Enkeltpas ----

// Valider og normalisér ét pas fra ukendt kilde (v1 `true`, v1 {at,…} eller v2). Returnerer Entry eller null.
export function normalizeEntry(raw) {
  if (raw === true) return { done: true, updatedAt: EPOCH };
  if (!isObj(raw)) return null;
  const legacy = !hasOwn(raw, 'done');
  if (!legacy && typeof raw.done !== 'boolean') return null;
  const dev = cleanStr(raw.dev, 16);

  if (!legacy && raw.done === false) { // gravsten: alle detaljer droppes
    const t = { done: false, updatedAt: isoOrNull(raw.updatedAt) || EPOCH };
    if (dev) t.dev = dev;
    return t;
  }

  const hasAt = raw.at !== undefined && raw.at !== null;
  const at = hasAt ? isoOrNull(raw.at) || EPOCH : null;
  const e = { done: true, updatedAt: isoOrNull(raw.updatedAt) || at || EPOCH };
  if (dev) e.dev = dev;
  if (at) e.at = at;
  if (Number.isInteger(raw.min) && raw.min >= 0 && raw.min <= 900) e.min = raw.min;
  if (Number.isInteger(raw.rpe) && raw.rpe >= 1 && raw.rpe <= 10) e.rpe = raw.rpe;
  if (typeof raw.note === 'string') {
    let n = raw.note.slice(0, 1000);
    if (/[\uD800-\uDBFF]$/.test(n)) n = n.slice(0, -1); // del ikke et surrogatpar
    if (n) e.note = n;
  }
  if (raw.src === 'manual' || raw.src === 'strava') e.src = raw.src;
  const extId = cleanStr(raw.extId, 64); if (extId) e.extId = extId;
  const sig = cleanStr(raw.sig, 120); if (sig) e.sig = sig;
  if (Number.isInteger(raw.dist) && raw.dist >= 0 && raw.dist <= 1000000) e.dist = raw.dist; // meter (Strava)
  if (Number.isInteger(raw.hr) && raw.hr >= 30 && raw.hr <= 250) e.hr = raw.hr;              // gennemsnitspuls (Strava)

  // Fremadkompatibilitet: ukendte felter overlever kun som korte primitiver (højst 16 stk.).
  let extra = 0;
  for (const k of Object.keys(raw)) {
    if (KNOWN.has(k) || !UNKNOWN_KEY_RE.test(k) || extra >= 16) continue;
    const v = raw[k];
    if ((typeof v === 'string' && v.length <= 200) || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) { e[k] = v; extra++; }
  }
  return e;
}

export const isDone = e => e?.done === true;

// Signatur for det planlagte pas ved logning; bruges til at opdage forskudte pas senere.
export const sessionSig = s => `${s.s}:${s.t}`;

// Byg et nyt, stemplet pas. `patch` = felterne for et gennemført pas (eller null/done:false = gravsten).
// Hele detaljesættet erstattes af `patch`; kun `at` (første gang gennemført) arves fra `prev`.
// updatedAt = max(now, prev.updatedAt + 1 ms), så en redigering altid slår den version den bygger på, selv med skæv ur.
export function stampEntry(patch, prev, { now, dev } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new TypeError('stampEntry: ugyldigt now');
  const prevIso = prev ? isoOrNull(prev.updatedAt) : null;
  const ms = Math.min(MAX_MS, Math.max(nowMs, prevIso ? Date.parse(prevIso) + 1 : -Infinity));
  const updatedAt = new Date(ms).toISOString();
  if (patch == null || patch.done === false) {
    const t = { done: false, updatedAt };
    const d = cleanStr(dev, 16); if (d) t.dev = d;
    return t;
  }
  const at = (prev && prev.done === true && isoOrNull(prev.at)) || isoOrNull(patch.at) || new Date(nowMs).toISOString();
  const { done: _d, updatedAt: _u, dev: _v, at: _a, ...rest } = patch;
  return normalizeEntry({ ...rest, done: true, updatedAt, dev, at });
}

// ---- Merge (kommutativ, associativ, idempotent) ----

// Total orden: updatedAt → dev → stableStringify. Hele posten vinder, så ukendte felter følger vinderen.
function cmpEntry(a, b) {
  const ta = a.updatedAt || EPOCH, tb = b.updatedAt || EPOCH;
  if (ta !== tb) return ta > tb ? 1 : -1;
  const da = a.dev || '', db = b.dev || '';
  if (da !== db) return da > db ? 1 : -1;
  const sa = stableStringify(a), sb = stableStringify(b);
  return sa === sb ? 0 : sa > sb ? 1 : -1;
}

// Et manglende pas taber til alt, også en gravsten.
export function mergeEntry(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return cmpEntry(a, b) >= 0 ? a : b;
}

export function mergeWeek(a, b) {
  const out = {};
  for (const src of [a, b]) {
    if (!isObj(src)) continue;
    for (const k of Object.keys(src)) {
      if (k === '__proto__') continue;
      const m = mergeEntry(hasOwn(out, k) ? out[k] : null, src[k]);
      if (m) out[k] = m;
    }
  }
  return out;
}

export function mergeProgress(a, b) {
  const out = {};
  for (const src of [a, b]) {
    if (!isObj(src)) continue;
    for (const w of Object.keys(src)) {
      if (w === '__proto__') continue;
      out[w] = mergeWeek(hasOwn(out, w) ? out[w] : null, src[w]);
    }
  }
  return out;
}

// Uger hvor `local` har noget som `remote` mangler (eller har en ældre version af): mergeWeek(local[w], remote[w]) ≠ remote[w].
export function diffWeeks(local, remote) {
  const out = [];
  for (const w of Object.keys(local || {}).sort()) {
    const r = (remote && remote[w]) || {};
    if (stableStringify(mergeWeek(local[w], r)) !== stableStringify(r)) out.push(w);
  }
  return out;
}

// ---- Serialisering ----

export function stableStringify(value) {
  if (value && typeof value.toJSON === 'function') value = value.toJSON();
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(v => stableStringify(v) ?? 'null').join(',') + ']';
  const parts = [];
  for (const k of Object.keys(value).sort()) {
    const s = stableStringify(value[k]);
    if (s !== undefined) parts.push(JSON.stringify(k) + ':' + s);
  }
  return '{' + parts.join(',') + '}';
}

export function weekFileName(weekId) {
  if (typeof weekId !== 'string' || !WEEK_ID_RE.test(weekId)) throw new TypeError(`ugyldigt uge-id: ${weekId}`);
  return weekId + '.json';
}

// Stabil JSON til gisten: sorterede nøgler, ét pas pr. linje, ingen afsluttende linjeskift.
export function serializeWeek(weekId, week) {
  weekFileName(weekId);
  const keys = Object.keys(week || {}).filter(k => week[k]).sort();
  const head = `{"format":${JSON.stringify(FORMAT)},"v":${SCHEMA},"week":${JSON.stringify(weekId)},"sessions":{`;
  if (!keys.length) return head + '}}';
  return head + '\n' + keys.map(k => `${JSON.stringify(k)}:${stableStringify(week[k])}`).join(',\n') + '\n}}';
}

// Valider hvert pas i en {sessionKey: raw}-map; ugyldige nøgler og pas droppes.
function normalizeWeek(map) {
  const week = {};
  if (!isObj(map)) return week;
  for (const k of Object.keys(map)) {
    if (!SESSION_KEY_RE.test(k)) continue;
    const e = normalizeEntry(map[k]);
    if (e) week[k] = e;
  }
  return week;
}

// Ugefil fra gisten (`u05.json`) → { weekId, week } eller null hvis navn, format eller version ikke passer.
export function parseWeekFile(name, text) {
  const m = WEEK_FILE_RE.exec(String(name));
  if (!m) return null;
  let j;
  try { j = JSON.parse(text); } catch { return null; }
  if (!isObj(j) || j.format !== FORMAT || j.v !== SCHEMA || !isObj(j.sessions)) return null;
  if (j.week !== undefined && j.week !== m[1]) return null;
  return { weekId: m[1], week: normalizeWeek(j.sessions) };
}

// Én uges værdi i en vilkårlig kendt form → Week.
function weekFromAny(v) {
  if (!isObj(v)) return {};
  if (isObj(v.sessions)) return normalizeWeek(v.sessions); // v2 ugefil og v2 Artifact-dokument
  if (isObj(v.done)) return normalizeWeek(v.done);         // v1 Artifact-dokument {done:{…}, updated}
  return normalizeWeek(v);                                 // ren sessions-map (v1 localStorage / v2 Progress)
}

function fromWeeksMap(map) {
  const out = {};
  const keys = Object.keys(map);
  const weekKeys = keys.filter(k => WEEK_ID_RE.test(k));
  if (keys.length && !weekKeys.length) throw new TypeError('Ukendt format: ingen uger fundet');
  for (const w of weekKeys) {
    const week = weekFromAny(map[w]);
    if (Object.keys(week).length) out[w] = week;
  }
  return out;
}

function fromDocs(docs) {
  const out = {};
  let matched = 0;
  for (const d of docs) {
    if (!isObj(d)) continue;
    const id = d.id ?? d.doc_id ?? d._id;
    if (typeof id !== 'string' || !WEEK_ID_RE.test(id)) continue;
    matched++;
    const week = weekFromAny(isObj(d.data) ? d.data : d);
    if (Object.keys(week).length) out[id] = mergeWeek(out[id], week);
  }
  if (docs.length && !matched) throw new TypeError('Ukendt format: ingen uger fundet');
  return out;
}

// Læs enhver kendt fremdriftsform (tekst eller parset JSON) → Progress:
//   v2-eksport, rå v2 Progress, v2 localStorage-blob {v:2,weeks}, v2 ugefil, v1 localStorage-blob,
//   v1/v2 Artifact-dokumenter (som map `{u01:{done:…}}` eller liste `[{id:'u01', data|done…}]`).
// Kaster TypeError/SyntaxError hvis formatet ikke kan genkendes, så en forkert fil aldrig ligner en tom import.
export function parseAny(input) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  if (Array.isArray(data)) return fromDocs(data);
  if (!isObj(data)) throw new TypeError('Ukendt format');
  if (Array.isArray(data.docs)) return fromDocs(data.docs);
  if (data.format !== undefined) {
    if (data.format !== FORMAT) throw new TypeError('Ukendt format');
    if (data.v !== SCHEMA) throw new TypeError(`Ukendt skemaversion: ${data.v}`);
    if (isObj(data.weeks)) return fromWeeksMap(data.weeks);
    if (data.kind === 'meta') return {};
    if (typeof data.week === 'string' && WEEK_ID_RE.test(data.week) && isObj(data.sessions)) {
      const week = normalizeWeek(data.sessions);
      return Object.keys(week).length ? { [data.week]: week } : {};
    }
    throw new TypeError('Ukendt format');
  }
  if (data.v === SCHEMA && isObj(data.weeks)) return fromWeeksMap(data.weeks);
  return fromWeeksMap(data);
}

// Eksportfil: { format, v:2, kind:'export', exportedAt, weeks } med sorterede nøgler og uden tomme uger.
export function toExport(progress, now = new Date()) {
  const weeks = {};
  for (const w of Object.keys(progress || {}).sort()) {
    const sess = progress[w] || {};
    const keys = Object.keys(sess).filter(k => sess[k]).sort();
    if (!keys.length) continue;
    weeks[w] = {};
    for (const k of keys) weeks[w][k] = sess[k];
  }
  return { format: FORMAT, v: SCHEMA, kind: 'export', exportedAt: new Date(now).toISOString(), weeks };
}
