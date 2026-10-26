#!/usr/bin/env node
// CI: læser de seneste Strava-aktiviteter, matcher dem mod planen og skriver `src:"strava"`-pas i den hemmelige gist (docs/strava.md §3).
//   node scripts/strava-sync.mjs [--dry-run]
// Env: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN, GIST_ID, GIST_WRITE_TOKEN, STRAVA_LOOKBACK_DAYS (1–30, standard 3).
//      Mangler Strava-secrets helt, springes trinnet over med en ::notice:: (udrulningen er upåvirket); mangler nogle, advarer det.
//      Kun til tests: GIST_API, STRAVA_API, STRAVA_OAUTH (https, eller http kun for localhost/127.0.0.1), STRAVA_NOW (ISO-tidspunkt),
//      STRAVA_DELAYS_MS (fx "0,0") og STRAVA_VERIFY_WAIT_MS.
// --dry-run gør alt undtagen at skrive pas til gisten. Et roteret refresh-token gemmes stadig, ellers ville det gå tabt.
// Output: `status=<ok|skipped|unavailable|auth|error>` til $GITHUB_OUTPUT. Exit 0 for alle håndterede udfald; ≠ 0 kun ved en fejl i scriptet.
//   Afvigelse fra §3 trin 2: en 401/403/404 fra selve gisten (dødt eller udløbet GIST_WRITE_TOKEN, forkert GIST_ID) giver `error`
//   (rød kørsel + mail), ikke `unavailable`: den heler aldrig af sig selv. Netværksfejl og 5xx giver `unavailable`.
// Logger kun tal og vores egne danske sætninger. Aldrig tokens, gist-id, aktivitets-id'er, navne, koordinater, URL'er eller svarkroppe.
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plan } from '../src/plan.js';
import { META_FILE, isExtraKey, isSessionKey, mergeWeek, parseWeekFile, serializeWeek, stableStringify } from '../src/progress.js';
import {
  HttpError, STRAVA_API, STRAVA_OAUTH, UsageError, cphDate, describeHttpError, fetchJson, listActivities, matchActivities, refreshToken, validBase,
} from './lib/strava.mjs';

export { UsageError };
export const STATE_FILE = '_strava.json';
const STATE_FORMAT = 'ironman-2027-strava';
const GIST_API = 'https://api.github.com';
const GIST_ID_RE = /^[A-Za-z0-9]{1,64}$/;
const WEEK_FILE = /^u\d{2}\.json$/;
const DEFAULT_DELAYS = [1000, 4000]; // 3 forsøg: straks, efter 1 s, efter 4 s
const VERIFY_WAIT_MS = 3000;
const REQUIRED = ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET', 'STRAVA_REFRESH_TOKEN'];

const isObj = v => typeof v === 'object' && v !== null && !Array.isArray(v);
const defaultSleep = ms => new Promise(r => setTimeout(r, ms));

// ---- Refresh-token i gisten: AES-256-GCM, nøglen afledes af STRAVA_CLIENT_SECRET (docs/strava.md §2.2) ----

const KDF_SALT = 'ironman-2027', KDF_INFO = 'strava-rt-v1', AAD = 'ironman-2027-strava-rt-v1';
const deriveKey = secret => Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.from(KDF_SALT), Buffer.from(KDF_INFO), 32));
const b64 = buf => Buffer.from(buf).toString('base64url');

// → { iv, ct, tag } (base64url). `iv` kan angives i tests.
export function encryptToken(token, secret, iv = randomBytes(12)) {
  const c = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  c.setAAD(Buffer.from(AAD));
  const ct = Buffer.concat([c.update(token, 'utf8'), c.final()]);
  return { iv: b64(iv), ct: b64(ct), tag: b64(c.getAuthTag()) };
}
// → token, eller null hvis nøglen er en anden, data er ændret eller formen er forkert.
export function decryptToken(rt, secret) {
  try {
    if (!isObj(rt) || typeof rt.iv !== 'string' || typeof rt.ct !== 'string' || typeof rt.tag !== 'string') return null;
    const d = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(rt.iv, 'base64url'));
    d.setAAD(Buffer.from(AAD));
    d.setAuthTag(Buffer.from(rt.tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(rt.ct, 'base64url')), d.final()]).toString('utf8');
  } catch { return null; }
}
// De første 16 hex-tegn af sha256(seed-token): hvilket seed det gemte token nedstammer fra.
export const fingerprint = token => createHash('sha256').update(token).digest('hex').slice(0, 16);

// ---- _strava.json ----

const EMPTY_STATE = () => ({ rt: null, base: null, seen: {} });
const ledgerOk = l => isObj(l) && typeof l.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(l.d) && typeof l.w === 'string' && /^u\d{2}$/.test(l.w) && typeof l.k === 'string' && (isSessionKey(l.k) || isExtraKey(l.k));

// → { rt, base, seen } eller null (ugyldig fil, forkert format eller version).
export function parseState(text) {
  let j;
  try { j = JSON.parse(text); } catch { return null; }
  if (!isObj(j) || j.format !== STATE_FORMAT || j.v !== 1) return null;
  const seen = {};
  if (isObj(j.seen)) for (const [id, l] of Object.entries(j.seen)) if (/^\d{1,20}$/.test(id) && ledgerOk(l)) seen[id] = { d: l.d, w: l.w, k: l.k };
  const rt = isObj(j.rt) && ['iv', 'ct', 'tag'].every(f => typeof j.rt[f] === 'string') ? { iv: j.rt.iv, ct: j.rt.ct, tag: j.rt.tag } : null;
  return { rt, base: typeof j.base === 'string' && /^[0-9a-f]{16}$/.test(j.base) ? j.base : null, seen };
}
const sortedSeen = seen => Object.fromEntries(Object.keys(seen).sort().map(id => [id, seen[id]]));
export const serializeState = ({ rt, base, seen }) => JSON.stringify({ format: STATE_FORMAT, v: 1, rt, base, seen: sortedSeen(seen) });

// ---- Gist ----

const gistHeaders = token => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'ironman-2027-ci' });
const gistRetryable = res => res.status === 408 || res.status === 429 || res.status >= 500
  || (res.status === 403 && (res.headers.get('x-ratelimit-remaining') === '0' || res.headers.has('retry-after')));

// Læser gist-svaret → { weeks: Progress, blocked: [ugeId], state, stateCorrupt, hasMeta }. Ulæselige ugefiler gør ugen "blokeret": den skrives aldrig.
function readGist(body) {
  const weeks = {}, blocked = [];
  for (const [name, f] of Object.entries(body.files)) {
    if (!WEEK_FILE.test(name)) continue;
    const parsed = isObj(f) && !f.truncated && typeof f.content === 'string' ? parseWeekFile(name, f.content) : null;
    if (parsed) weeks[parsed.weekId] = mergeWeek(weeks[parsed.weekId] ?? {}, parsed.week);
    else blocked.push(name.slice(0, 3));
  }
  let state = EMPTY_STATE(), stateCorrupt = false;
  const sf = body.files[STATE_FILE];
  if (isObj(sf)) {
    const parsed = !sf.truncated && typeof sf.content === 'string' ? parseState(sf.content) : null;
    if (parsed) state = parsed; else stateCorrupt = true;
  }
  return { weeks, blocked, state, stateCorrupt, hasMeta: isObj(body.files[META_FILE]) };
}

// ---- Selve kørslen ----

// → { status, stats? }. Kaster kun ved en fejl i scriptet selv (ikke ved Strava-/GitHub-svar).
export async function syncStrava({
  env = process.env, fetchImpl = globalThis.fetch, sleep = defaultSleep, delays = DEFAULT_DELAYS, verifyWaitMs = VERIFY_WAIT_MS,
  now = () => new Date(), dryRun = false, out = line => console.log(line),
} = {}) {
  const notice = m => out(`::notice::${m}`), warn = m => out(`::warning::${m}`), error = m => out(`::error::${m}`);
  const v = name => String(env[name] ?? '').trim();
  const inActions = env.GITHUB_ACTIONS === 'true';

  // 1. Sat op?
  if (!REQUIRED.some(v)) { notice('Strava er ikke sat op – synkroniseringen springes over (se docs/guides/strava.md)'); return { status: 'skipped' }; }
  const missing = [...REQUIRED, 'GIST_ID', 'GIST_WRITE_TOKEN'].filter(n => !v(n));
  if (missing.length) { warn(`Strava-synk springes over, fordi ${missing.join(', ')} mangler (se docs/guides/strava.md)`); return { status: 'skipped' }; }
  if (!GIST_ID_RE.test(v('GIST_ID'))) { warn('Strava-synk springes over: GIST_ID har ugyldigt format'); return { status: 'skipped' }; }
  if (!/^\d{1,12}$/.test(v('STRAVA_CLIENT_ID'))) { warn('Strava-synk springes over: STRAVA_CLIENT_ID har ugyldigt format (skal være tal)'); return { status: 'skipped' }; }

  let gistApi, stravaApi, stravaOauth;
  try {
    gistApi = validBase(env.GIST_API, GIST_API, 'GIST_API');
    stravaApi = validBase(env.STRAVA_API, STRAVA_API, 'STRAVA_API');
    stravaOauth = validBase(env.STRAVA_OAUTH, STRAVA_OAUTH, 'STRAVA_OAUTH');
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    error(e.message);
    return { status: 'error' };
  }
  let lookback = 3;
  if (v('STRAVA_LOOKBACK_DAYS')) {
    const n = /^\d{1,2}$/.test(v('STRAVA_LOOKBACK_DAYS')) ? Number(v('STRAVA_LOOKBACK_DAYS')) : NaN;
    if (n >= 1 && n <= 30) lookback = n; else warn('STRAVA_LOOKBACK_DAYS skal være et helt tal fra 1 til 30; bruger 3 dage');
  }

  const gistId = v('GIST_ID'), gistToken = v('GIST_WRITE_TOKEN');
  const clientId = v('STRAVA_CLIENT_ID'), clientSecret = v('STRAVA_CLIENT_SECRET'), seedToken = v('STRAVA_REFRESH_TOKEN');
  const gistGet = () => fetchJson({ fetchImpl, url: `${gistApi}/gists/${gistId}`, init: { headers: gistHeaders(gistToken) }, delays, sleep, retryable: gistRetryable, label: 'GitHub' });
  const gistPatch = files => fetchJson({
    fetchImpl, url: `${gistApi}/gists/${gistId}`, delays, sleep, retryable: gistRetryable, label: 'GitHub',
    init: { method: 'PATCH', headers: { ...gistHeaders(gistToken), 'Content-Type': 'application/json' }, body: JSON.stringify({ files }) },
  });
  const gistFailure = (e, what) => { // 401/403/404 heler aldrig af sig selv → error; resten (også en rate limit) er forbigående → unavailable
    if (!e.retryable && [401, 403, 404].includes(e.status)) { error(`${what} (${describeHttpError(e)}). Tjek GIST_WRITE_TOKEN (Gists: Read and write) og GIST_ID`); return { status: 'error' }; }
    warn(`${what} (${describeHttpError(e)}); næste kørsel prøver igen`);
    return { status: 'unavailable' };
  };
  const stravaFailure = (e, what, authStatuses) => {
    if (authStatuses.includes(e.status)) {
      warn('Strava-adgangen er udløbet eller tilbagekaldt – kør `node scripts/strava-auth.mjs` (se docs/guides/strava.md)');
      return { status: 'auth' };
    }
    warn(`${what} (${describeHttpError(e)}); næste kørsel tager igen`);
    return { status: 'unavailable' };
  };

  // 2. Hent gisten. Strava kaldes først bagefter, så et roteret token altid har et sted at blive gemt.
  let g;
  try {
    const body = await gistGet();
    if (!isObj(body) || !isObj(body.files)) throw new HttpError('GitHub: uventet svar', { retryable: false });
    g = readGist(body);
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    return gistFailure(e, 'Gisten kunne ikke hentes');
  }
  if (!g.hasMeta) { warn(`Gisten er ikke en ironman-2027-gist (mangler ${META_FILE}); tjek GIST_ID`); return { status: 'error' }; }
  if (g.blocked.length) warn(`${g.blocked.length} ugefil(er) i gisten kunne ikke læses; de uger får ingen Strava-pas`);
  if (g.stateCorrupt) warn('Strava-tilstanden i gisten kunne ikke læses og nulstilles ved næste skrivning');
  const state = g.state;

  // 3. Forny adgangen. Det gemte token bruges kun, hvis det stammer fra den nuværende seed (§2.2).
  const fp = fingerprint(seedToken);
  const stored = state.base === fp && state.rt ? decryptToken(state.rt, clientSecret) : null;
  let used = stored ?? seedToken, fellBack = false, tokens;
  const refresh = token => refreshToken({ fetchImpl, oauth: stravaOauth, clientId, clientSecret, refreshToken: token, delays, sleep });
  try {
    try { tokens = await refresh(used); }
    catch (e) {
      if (!(e instanceof HttpError && [400, 401].includes(e.status) && used !== seedToken)) throw e;
      used = seedToken; fellBack = true;
      tokens = await refresh(used);
    }
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    return stravaFailure(e, 'Strava kunne ikke nås', [400, 401, 403]);
  }
  if (inActions) { out(`::add-mask::${tokens.accessToken}`); out(`::add-mask::${tokens.refreshToken}`); }

  // Et roteret token gemmes straks, før aktiviteterne hentes: det gamle er dødt, og næste kørsel skal kunne fortsætte.
  // Det gemmes også, når der ikke var noget brugbart gemt token (første kørsel, ny seed, ulæselig fil) eller når det gemte var dødt.
  let current = state;
  if (tokens.refreshToken !== used || stored === null || fellBack) {
    const next = { rt: encryptToken(tokens.refreshToken, clientSecret), base: fp, seen: state.seen };
    try { await gistPatch({ [STATE_FILE]: { content: serializeState(next) } }); }
    catch (e) {
      if (!(e instanceof HttpError)) throw e;
      error(`Strava-tokenet kunne ikke gemmes i gisten (${describeHttpError(e)}). Kør node scripts/strava-auth.mjs, hvis næste kørsel afvises`);
      return { status: 'error' };
    }
    current = next;
  }

  // 4. Aktiviteter (hvidlistet med det samme: rå objekter forlader aldrig listActivities).
  const nowDate = now();
  let activities;
  try {
    activities = await listActivities({ fetchImpl, api: stravaApi, accessToken: tokens.accessToken, after: nowDate.getTime() / 1000 - (lookback + 2) * 86400, delays, sleep });
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    return stravaFailure(e, 'Strava-aktiviteterne kunne ikke hentes', [401, 403]);
  }

  // 5–6. Match.
  const today = cphDate(nowDate);
  const res = matchActivities({ weeks: plan(), progress: g.weeks, activities, ledger: current.seen, today, lookbackDays: lookback, blocked: g.blocked });
  const s = res.stats;
  const logLine = () => out(`Strava${dryRun ? ' (prøvekørsel)' : ''}: ${s.window} aktiviteter i vinduet · ${s.matched} nye pas · ${s.healed} genskabt · ${s.occupied} optaget (manuel/fjernet) · ${s.extras} ekstra${s.skipped ? ` · ${s.skipped} ignoreret` : ''}${s.known ? ` · ${s.known} allerede hentet` : ''}`);
  const writeWeeks = Object.keys(res.writes).sort();
  const seenChanged = JSON.stringify(sortedSeen(res.ledger)) !== JSON.stringify(sortedSeen(current.seen));

  if (!writeWeeks.length && !seenChanged) { logLine(); return { status: 'ok', stats: s }; }
  if (dryRun) {
    if (!inActions) for (const w of writeWeeks) for (const [k, e] of Object.entries(res.writes[w])) out(`  ${w} ${k}: ${e.min} min`); // pas-detaljer er private: aldrig i CI
    logLine();
    return { status: 'ok', stats: s };
  }

  // 7. Skriv: kun de ændrede ugefiler plus _strava.json, i ét PATCH. Grundlaget er altid den friskhentede fjernuge.
  const weekFiles = (weeks, base) => Object.fromEntries(weeks.map(w => [`${w}.json`, { content: serializeWeek(w, mergeWeek(base[w] ?? {}, res.writes[w])) }]));
  const stateFile = { [STATE_FILE]: { content: serializeState({ rt: current.rt, base: current.base, seen: res.ledger }) } };
  try { await gistPatch({ ...weekFiles(writeWeeks, g.weeks), ...stateFile }); }
  catch (e) {
    if (!(e instanceof HttpError)) throw e;
    return gistFailure(e, 'Pas kunne ikke skrives til gisten');
  }

  // 8. Efterprøv: en enheds PATCH kan have overskrevet vores uge (tabt opdatering, §3.5 i arkitekturen). Højst 2 ekstra runder.
  if (writeWeeks.length) {
    let verified = false;
    for (let round = 0; round <= 2; round++) {
      await sleep(verifyWaitMs);
      let g2;
      try {
        const body = await gistGet();
        if (!isObj(body) || !isObj(body.files)) throw new HttpError('GitHub: uventet svar');
        g2 = readGist(body);
      } catch (e) {
        if (!(e instanceof HttpError)) throw e;
        warn('Skrivningen kunne ikke efterprøves; heles ved næste kørsel hvis den blev overskrevet');
        verified = null;
        break;
      }
      const lost = writeWeeks.filter(w => !g2.blocked.includes(w) && stableStringify(mergeWeek(g2.weeks[w] ?? {}, res.writes[w])) !== stableStringify(g2.weeks[w] ?? {}));
      if (!lost.length) { verified = true; break; }
      if (round === 2) break;
      try { await gistPatch(weekFiles(lost, g2.weeks)); }
      catch (e) {
        if (!(e instanceof HttpError)) throw e;
        warn('Gendannelsen efter en tabt opdatering mislykkedes; heles ved næste kørsel');
        verified = null;
        break;
      }
    }
    if (verified === false) warn('En anden enhed overskrev ugen flere gange i træk; Strava-passene gendannes ved næste kørsel');
  }

  logLine();
  return { status: 'ok', stats: s };
}

// ---- CLI ----

const parseList = raw => {
  if (!raw) return undefined;
  const list = raw.split(',').map(x => Number(x.trim()));
  return list.every(n => Number.isInteger(n) && n >= 0) ? list : undefined;
};
const setOutput = (env, status) => { if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `status=${status}\n`); };

// → exit-kode. `sync` kan udskiftes i tests.
export async function main({ env = process.env, argv = process.argv, sync = syncStrava } = {}) {
  const t = env.STRAVA_NOW ? Date.parse(env.STRAVA_NOW) : NaN; // kun til tests
  try {
    const delays = parseList(env.STRAVA_DELAYS_MS);
    const wait = env.STRAVA_VERIFY_WAIT_MS !== undefined && /^\d+$/.test(env.STRAVA_VERIFY_WAIT_MS) ? Number(env.STRAVA_VERIFY_WAIT_MS) : undefined;
    const r = await sync({
      env, dryRun: argv.includes('--dry-run'),
      ...(delays ? { delays } : {}), ...(wait !== undefined ? { verifyWaitMs: wait } : {}), ...(Number.isFinite(t) ? { now: () => new Date(t) } : {}),
    });
    setOutput(env, r.status);
    return 0;
  } catch (e) {
    console.log(`::error::Strava-synk fejlede uventet (${e?.name ?? 'Error'}); se docs/guides/strava.md`);
    setOutput(env, 'error');
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) process.exitCode = await main();
