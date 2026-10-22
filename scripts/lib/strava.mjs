// Strava: ren matchning af aktiviteter mod planlagte pas (ingen netværk, ingen filer) og tynde HTTP-hjælpere (docs/strava.md §3–§4).
// Rå Strava-objekter røres kun af pickActivity(), som lægger en hvidliste over dem med det samme. Resten af koden ser aldrig navne,
// kort, koordinater, sted, gear eller enhed, så intet af det kan havne i logs eller i gisten.
import { addDays, isoDate } from '../../src/plan.js';
import { sessionSig, stampEntry } from '../../src/progress.js';

export const STRAVA_API = 'https://www.strava.com/api/v3';
export const STRAVA_OAUTH = 'https://www.strava.com/oauth';
export const REFRESH_TOKEN_RE = /^[A-Za-z0-9]{20,200}$/;

const MIN_ACTIVITY_MIN = 5;   // kortere aktiviteter (opvarmning, fejlstart) matches ikke
const MIN_SHARE = 0.25;       // en aktivitet skal være mindst 25 % af det planlagte pas
const MAX_PER_GROUP = 6;      // flere aktiviteter i samme gruppe samme dag er ekstra
const LEDGER_KEEP_DAYS = 30;
const MAX_MIN = 900;
const MAX_DIST = 1_000_000;
const ENTRY_DEV = 'strava';

export class UsageError extends Error {}
// status 0 = netværksfejl/timeout. Teksten er vores egen og indeholder aldrig svarkrop, URL eller token.
export class HttpError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) { super(message); this.name = 'HttpError'; this.status = status; this.retryable = retryable; }
}

const isObj = v => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// ---- Datoer ----

const CPH_PARTS = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' });
// Tidspunkt (ms eller Date) → dansk kalenderdato 'YYYY-MM-DD'. Uafhængig af processens TZ.
export function cphDate(ms) {
  const t = ms instanceof Date ? ms.getTime() : ms;
  if (!Number.isFinite(t)) throw new TypeError('cphDate: ugyldigt tidspunkt');
  const p = Object.fromEntries(CPH_PARTS.formatToParts(t).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
// 'YYYY-MM-DD' ± dage (ren kalenderregning i UTC).
export const shiftDate = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10);

// ---- Sportsgrupper ----

const STRAVA_GROUPS = {
  Swim: 'swim',
  Ride: 'bike', VirtualRide: 'bike', GravelRide: 'bike', MountainBikeRide: 'bike',
  Run: 'run', TrailRun: 'run', VirtualRun: 'run',
  WeightTraining: 'str', Crossfit: 'str', Workout: 'str',
};
// Strava sport_type → swim | bike | run | str, ellers null (EBikeRide, Walk, Hike, Yoga, Rowing … er ekstra).
export const sportGroup = type => (typeof type === 'string' && hasOwn(STRAVA_GROUPS, type) ? STRAVA_GROUPS[type] : null);

// Planlagt pas → gruppe: swim | bike | run | str | tri (race med svømning) | null (hvile eller 0 min, matches aldrig).
export function sessionGroup(s) {
  if (!isObj(s) || s.s === 'rest' || !s.m) return null;
  if (s.s === 'race') return /svøm/i.test(String(s.d ?? '')) ? 'tri' : 'run';
  return s.s === 'swim' || s.s === 'bike' || s.s === 'run' || s.s === 'str' ? s.s : null;
}

// ---- Hvidliste ----

// Rå Strava-aktivitet → { id, group, startMs, endMs, date, min, elapsedSec, dist?, hr? } eller null (ubrugelig).
// Alt andet end disse felter droppes: navn, beskrivelse, kort/polylines, koordinater, sted, gear, enhed, atlet, fotos …
export function pickActivity(raw) {
  if (!isObj(raw)) return null;
  const id = typeof raw.id === 'number' ? (Number.isSafeInteger(raw.id) ? String(raw.id) : '') : typeof raw.id === 'string' ? raw.id : '';
  if (!/^\d{1,20}$/.test(id)) return null;
  const startMs = typeof raw.start_date === 'string' ? Date.parse(raw.start_date) : NaN;
  if (!Number.isFinite(startMs) || !finite(raw.elapsed_time) || raw.elapsed_time < 0) return null;
  const elapsed = raw.elapsed_time;
  const moving = finite(raw.moving_time) && raw.moving_time >= 0 ? raw.moving_time : elapsed;
  const group = sportGroup(raw.sport_type ?? raw.type);
  const sec = group === 'swim' || group === 'str' ? elapsed : moving; // svømning og styrke: hele tiden; ellers bevægelsestid
  const a = {
    id, group, startMs, endMs: startMs + elapsed * 1000, date: cphDate(startMs),
    min: clamp(Math.round(sec / 60), 0, MAX_MIN), elapsedSec: Math.round(elapsed),
  };
  if ((group === 'swim' || group === 'bike' || group === 'run') && finite(raw.distance) && raw.distance > 0) a.dist = clamp(Math.round(raw.distance), 0, MAX_DIST);
  if (raw.has_heartrate === true && finite(raw.average_heartrate)) {
    const hr = Math.round(raw.average_heartrate);
    if (hr >= 30 && hr <= 250) a.hr = hr;
  }
  return a;
}

// ---- Matchning ----

// Pas som kan skrives: intet pas, eller en gravsten ældre end aktivitetens start (tjek-og-fjern før træningen må ikke blokere den).
const writable = (e, startMs) => !e || (e.done === false && Date.parse(e.updatedAt) < startMs);

// Bedste tildeling af aktiviteter A (i starttid-orden) til pas S: flest par → mindst Σ|Δmin| → kronologisk (k-te aktivitet til k-te pas).
// Udtømmende søgning; mængderne er små. → [[sessionIndex, activityIndex], …]
function assign(S, A) {
  let best = null;
  const used = new Array(A.length).fill(false);
  const pick = new Array(S.length).fill(-1);
  const less = (x, y) => { // x < y som vektorer, hvor "intet pas" (-1) tæller som uendeligt
    for (let i = 0; i < x.length; i++) { const a = x[i] < 0 ? Infinity : x[i], b = y[i] < 0 ? Infinity : y[i]; if (a !== b) return a < b; }
    return false;
  };
  (function rec(i, pairs, cost) {
    if (i === S.length) {
      if (!best || pairs > best.pairs || (pairs === best.pairs && (cost < best.cost || (cost === best.cost && less(pick, best.pick))))) best = { pairs, cost, pick: [...pick] };
      return;
    }
    rec(i + 1, pairs, cost);
    for (let j = 0; j < A.length; j++) {
      if (used[j] || A[j].min < MIN_SHARE * S[i].s.m) continue;
      used[j] = true; pick[i] = j;
      rec(i + 1, pairs + 1, cost + Math.abs(A[j].min - S[i].s.m));
      used[j] = false; pick[i] = -1;
    }
  })(0, 0, 0);
  return best ? best.pick.map((j, i) => [i, j]).filter(([, j]) => j >= 0) : [];
}

// Pas fra en eller flere aktiviteter (flere kun til triatlon-løb). `prev` = intet pas eller en gammel gravsten.
// updatedAt = aktivitetens slut, så en manuel afkrydsning efter træningen altid vinder (LWW).
function buildEntry(session, acts, prev) {
  const sorted = [...acts].sort((a, b) => a.startMs - b.startMs || (a.id < b.id ? -1 : 1));
  const first = sorted[0];
  const sig = sessionSig(session);
  if (sessionGroup(session) !== 'tri') {
    const patch = { done: true, at: new Date(first.startMs).toISOString(), min: first.min, src: 'strava', extId: first.id, sig };
    if (first.dist != null) patch.dist = first.dist;
    if (first.hr != null) patch.hr = first.hr;
    return stampEntry(patch, prev ?? null, { now: new Date(first.endMs), dev: ENTRY_DEV });
  }
  const sec = sorted.reduce((n, a) => n + a.elapsedSec, 0);
  const dist = sorted.reduce((n, a) => n + (a.dist ?? 0), 0);
  let ids = sorted.map(a => a.id);
  if (ids.join(',').length > 64) { // de 3 længste aktiviteter, i starttid-orden; alle id'er står stadig i hovedbogen
    const top = new Set([...sorted].sort((a, b) => b.elapsedSec - a.elapsedSec || a.startMs - b.startMs).slice(0, 3).map(a => a.id));
    ids = sorted.map(a => a.id).filter(id => top.has(id));
  }
  const patch = { done: true, at: new Date(first.startMs).toISOString(), min: clamp(Math.round(sec / 60), 0, MAX_MIN), src: 'strava', extId: ids.join(','), sig };
  if (dist > 0) patch.dist = Math.min(MAX_DIST, Math.round(dist));
  return stampEntry(patch, prev ?? null, { now: new Date(Math.max(...sorted.map(a => a.endMs))), dev: ENTRY_DEV });
}

// Matcher aktiviteter mod planen (docs/strava.md §4.3–§4.4). Ren funktion: rører hverken input, net eller ur.
//   weeks       plan()-uger ({ id, start, days })
//   progress    fjernstatus: weekId → Week (kun læst)
//   activities  pickActivity()-resultater
//   ledger      id → { d, w, k } fra _strava.json
//   today       dansk dato 'YYYY-MM-DD' (eller Date/ms)
//   blocked     uge-id'er der ikke må skrives til (ulæselig ugefil i gisten): behandles som optaget
// → { writes: weekId → { sessionKey → Entry }, ledger, stats: { window, matched, healed, occupied, extras, known } }
export function matchActivities({ weeks, progress = {}, activities = [], ledger = {}, today, lookbackDays = 3, blocked = [] }) {
  const todayStr = typeof today === 'string' ? today : cphDate(today);
  const from = shiftDate(todayStr, -lookbackDays);
  const blockedWeeks = new Set(blocked);

  const days = new Map();    // dato → { weekId, di, sessions }
  const target = new Map();  // `${weekId}|${key}` → pas
  for (const w of weeks) {
    w.days.forEach((sessions, di) => {
      days.set(isoDate(addDays(w.start, di)), { weekId: w.id, di, sessions });
      sessions.forEach((s, si) => target.set(`${w.id}|${di}-${si}`, s));
    });
  }
  const remote = (w, k) => (isObj(progress[w]) && hasOwn(progress[w], k) ? progress[w][k] : null);

  const consumed = new Set(Object.keys(ledger));
  for (const week of Object.values(progress)) for (const e of Object.values(week ?? {})) if (e?.extId) for (const id of String(e.extId).split(',')) consumed.add(id);

  const byId = new Map(activities.map(a => [a.id, a]));
  const writes = {};
  const out = { ...ledger };
  const stats = { window: 0, matched: 0, healed: 0, occupied: 0, extras: 0, known: 0 };
  const claimed = new Set(); // mål der genskabes i denne kørsel: ingen nye aktiviteter lander ovenpå
  const put = (w, k, entry) => { (writes[w] ??= {})[k] = entry; };
  const ledgerAdd = (acts, w, k) => { for (const a of acts) out[a.id] = { d: a.date, w, k }; };

  // 1. Selvheling: en bogført aktivitet hvis mål-pas mangler (en tabt skrivning; enheder sletter aldrig nøgler) skrives igen.
  const groups = new Map(); // mål → id'er
  for (const [id, l] of Object.entries(ledger)) { const t = `${l.w}|${l.k}`; (groups.get(t) ?? groups.set(t, []).get(t)).push(id); }
  for (const [t, ids] of [...groups].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const [w, k] = t.split('|');
    if (blockedWeeks.has(w) || remote(w, k)) continue;              // ulæselig uge: rør ikke; et pas (også en gravsten) står ved magt
    const session = target.get(t);
    const acts = ids.map(id => byId.get(id)).filter(Boolean);
    if (!session || !acts.length) { for (const id of ids) delete out[id]; continue; } // ukendt pas eller aktiviteten er ikke længere hentet
    put(w, k, buildEntry(session, sessionGroup(session) === 'tri' ? acts : [acts.sort((a, b) => a.startMs - b.startMs)[0]], null));
    claimed.add(t);
    stats.healed++;
  }

  // 2. Nye aktiviteter pr. dag i vinduet.
  const inWindow = activities.filter(a => a.date >= from && a.date <= todayStr);
  stats.window = inWindow.length;
  const perDate = new Map();
  for (const a of inWindow) {
    if (consumed.has(a.id)) { stats.known++; continue; }
    if (!a.group || !days.has(a.date)) { stats.extras++; continue; } // ukendt sport, eller en dag uden for planen
    (perDate.get(a.date) ?? perDate.set(a.date, []).get(a.date)).push(a);
  }

  for (const date of [...perDate.keys()].sort()) {
    const { weekId, di, sessions } = days.get(date);
    let acts = perDate.get(date).sort((a, b) => a.startMs - b.startMs || (a.id < b.id ? -1 : 1));
    const slots = sessions.map((s, si) => ({ s, si, key: `${di}-${si}`, group: sessionGroup(s) })).filter(x => x.group);
    const isOccupied = (x, startMs) => blockedWeeks.has(weekId) || claimed.has(`${weekId}|${x.key}`) || !writable(remote(weekId, x.key), startMs);

    // Triatlon-løb: alle dagens svømme-, cykel- og løbeaktiviteter går til løbet.
    const race = slots.find(x => x.group === 'tri');
    if (race) {
      const legs = acts.filter(a => a.group === 'swim' || a.group === 'bike' || a.group === 'run');
      acts = acts.filter(a => !legs.includes(a));
      if (legs.length) {
        const sec = legs.reduce((n, a) => n + a.elapsedSec, 0);
        if (sec / 60 < MIN_SHARE * race.s.m) stats.extras += legs.length;
        else if (isOccupied(race, Math.min(...legs.map(a => a.startMs)))) stats.occupied += legs.length;
        else { put(weekId, race.key, buildEntry(race.s, legs, remote(weekId, race.key))); ledgerAdd(legs, weekId, race.key); stats.matched++; }
      }
    }

    for (const group of ['swim', 'bike', 'run', 'str']) {
      const S = slots.filter(x => x.group === group);
      const ofGroup = acts.filter(a => a.group === group);
      const A = ofGroup.filter(a => a.min >= MIN_ACTIVITY_MIN);
      stats.extras += ofGroup.length - Math.min(A.length, MAX_PER_GROUP);
      const used = A.slice(0, MAX_PER_GROUP);
      if (!S.length) { stats.extras += used.length; continue; }
      const pairs = assign(S, used);
      stats.extras += used.length - pairs.length;
      for (const [i, j] of pairs) {
        const x = S[i], a = used[j];
        if (isOccupied(x, a.startMs)) { stats.occupied++; continue; } // manuel eller fjernet: absorberer aktiviteten, ingen skrivning
        put(weekId, x.key, buildEntry(x.s, [a], remote(weekId, x.key)));
        ledgerAdd([a], weekId, x.key);
        stats.matched++;
      }
    }
  }

  // 3. Beskær hovedbogen (ældre end 30 dage).
  const keep = shiftDate(todayStr, -LEDGER_KEEP_DAYS);
  for (const [id, l] of Object.entries(out)) if (l.d < keep) delete out[id];

  return { writes, ledger: out, stats };
}

// ---- HTTP ----

const defaultSleep = ms => new Promise(r => setTimeout(r, ms));
const defaultRetryable = res => res.status === 408 || res.status >= 500; // 429 genforsøges aldrig inden for kørslen

// Tilladt basisadresse: https, eller http kun til localhost/127.0.0.1 (testservere). Token må ikke kunne sendes andre steder hen.
export function validBase(value, fallback, name) {
  const base = String(value ?? '').trim().replace(/\/+$/, '') || fallback;
  const path = '(?:/[\\w.~-]+)*';
  const https = new RegExp(`^https://[^/\\s?#@]+${path}$`), local = new RegExp(`^http://(?:127\\.0\\.0\\.1|localhost)(?::\\d+)?${path}$`);
  if (!https.test(base) && !local.test(base)) throw new UsageError(`${name} skal være en https-adresse (http kun for localhost)`);
  return base;
}

const describe = e => (e?.status ? `status ${e.status}` : 'netværksfejl');
export { describe as describeHttpError };

// Ét kald med genforsøg: netværksfejl, timeout og `retryable(res)` genforsøges efter `delays` (ms). Svarkroppen på fejl læses aldrig.
// → parset JSON. Kaster HttpError med vores egen tekst (aldrig URL, krop eller token).
export async function fetchJson({ fetchImpl = globalThis.fetch, url, init = {}, delays = [1000, 4000], sleep = defaultSleep, retryable = defaultRetryable, label = 'Svar' } = {}) {
  for (let i = 0; ; i++) {
    let err;
    try {
      const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(20_000) });
      if (res.ok) {
        try { return await res.json(); } catch { err = new HttpError(`${label}: svaret var ikke JSON`, { status: res.status, retryable: true }); }
      } else {
        try { await res.body?.cancel(); } catch { /* ligegyldigt */ }
        err = new HttpError(`${label}: status ${res.status}`, { status: res.status, retryable: retryable(res) });
      }
    } catch (e) {
      err = new HttpError(`${label}: netværksfejl (${e?.cause?.code ?? e?.name ?? 'ukendt'})`, { retryable: true });
    }
    if (!err.retryable || i >= delays.length) throw err;
    await sleep(delays[i]);
  }
}

const FORM = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', 'user-agent': 'ironman-2027-ci' };

// Fornyer adgangen. → { accessToken, refreshToken } (alt andet i svaret droppes med det samme).
export async function refreshToken({ fetchImpl, oauth = STRAVA_OAUTH, clientId, clientSecret, refreshToken: token, delays, sleep }) {
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: token }).toString();
  const j = await fetchJson({ fetchImpl, url: `${oauth}/token`, init: { method: 'POST', headers: FORM, body }, delays, sleep, label: 'Strava (token)' });
  if (!isObj(j) || typeof j.access_token !== 'string' || !/^\S{8,500}$/.test(j.access_token) || typeof j.refresh_token !== 'string' || !REFRESH_TOKEN_RE.test(j.refresh_token)) {
    throw new HttpError('Strava (token): uventet svar', { retryable: false });
  }
  return { accessToken: j.access_token, refreshToken: j.refresh_token };
}

// Veksler engangskoden til et refresh-token (strava-auth.mjs). Ét forsøg. → { refreshToken }; access_token og athlete droppes med det samme.
export async function exchangeCode({ fetchImpl = globalThis.fetch, oauth = STRAVA_OAUTH, clientId, clientSecret, code } = {}) {
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code' }).toString();
  const j = await fetchJson({ fetchImpl, url: `${oauth}/token`, init: { method: 'POST', headers: FORM, body }, delays: [], label: 'Strava (token)' });
  if (!isObj(j) || typeof j.refresh_token !== 'string' || !REFRESH_TOKEN_RE.test(j.refresh_token)) throw new HttpError('Strava (token): svaret indeholdt intet gyldigt refresh-token', { retryable: false });
  return { refreshToken: j.refresh_token };
}

// Henter aktiviteter efter `after` (epoch-sekunder), højst `maxPages` sider. Hver aktivitet hvidlistes straks (pickActivity); rå objekter
// returneres aldrig. Detalje-endpoints kaldes aldrig. → pickActivity()-resultater (unikke id'er).
export async function listActivities({ fetchImpl, api = STRAVA_API, accessToken, after, perPage = 100, maxPages = 3, delays, sleep }) {
  const seen = new Map();
  for (let page = 1; page <= maxPages; page++) {
    const rows = await fetchJson({
      fetchImpl, url: `${api}/athlete/activities?after=${Math.trunc(after)}&per_page=${perPage}&page=${page}`,
      init: { headers: { Authorization: `Bearer ${accessToken}`, accept: 'application/json', 'user-agent': 'ironman-2027-ci' } }, delays, sleep, label: 'Strava (aktiviteter)',
    });
    if (!Array.isArray(rows)) throw new HttpError('Strava (aktiviteter): uventet svar', { retryable: false });
    for (const raw of rows) { const a = pickActivity(raw); if (a && !seen.has(a.id)) seen.set(a.id, a); }
    if (rows.length < perPage) break;
  }
  return [...seen.values()];
}
