#!/usr/bin/env node
// CI: henter fremdriften fra den hemmelige gist og skriver den som Progress-JSON (docs/architecture.md §5.3).
//   node scripts/fetch-progress.mjs --out "$RUNNER_TEMP/progress.json"
// Env: GIST_ID og GIST_READ_TOKEN. Begge skal være sat for at kalenderen får ✅-mærker. Mangler en af dem, springes hentningen over
//      uden fejl og uden fil (med en ::warning::-annotation), og kalenderen bygges uden mærker. Udrulningen fejler aldrig af den grund.
//      GIST_API (standard https://api.github.com; http kun for localhost, til tests).
// Exit: 0 = hentet eller bevidst sprunget over, 1 = hentning mislykkedes (deploy springes over, i går's kalender består), 2 = brug.
// Logger kun tal. Aldrig gist-id, token, URL eller indhold.
import { rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { META_FILE, mergeWeek, parseWeekFile, toExport } from '../src/progress.js';

const WEEK_FILE = /^u\d{2}\.json$/;
const GIST_ID_RE = /^[A-Za-z0-9]{1,64}$/;
const DEFAULT_DELAYS = [1000, 4000]; // 3 forsøg: straks, efter 1 s, efter 4 s

// ::warning::-annotationer ved udeladt hentning (mærkerne udelades, men udrulningen fortsætter). Ingen secrets i teksten.
export const SKIP_WARNINGS = {
  GIST_ID: 'GIST_ID er ikke sat, så fremdriften hentes ikke, og kalenderen bygges uden ✅-mærker. Forbind appen, og gem gist-id\'et med: gh secret set GIST_ID',
  GIST_READ_TOKEN: 'GIST_READ_TOKEN er ikke sat, så gisten hentes ikke, og kalenderen bygges uden ✅-mærker. Læse-tokenet er påkrævet for mærkerne. Opret et token uden rettigheder, og gem det med: gh secret set GIST_READ_TOKEN (se docs/guides/forbind-github.md)',
};

class FetchError extends Error {
  constructor(message, { retryable = false } = {}) { super(message); this.retryable = retryable; }
}
class UsageError extends Error {}

const isObj = v => typeof v === 'object' && v !== null && !Array.isArray(v);

function apiBase(env) {
  const api = (env.GIST_API || 'https://api.github.com').replace(/\/+$/, '');
  // Tokenet må kun sendes til GitHub eller en lokal testserver.
  if (!/^https:\/\/[^/\s]+$/.test(api) && !/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(api)) throw new UsageError('GIST_API skal være en https-adresse (http kun for localhost)');
  return api;
}

async function attempt({ api, id, token, fetchImpl }) {
  let res;
  try {
    res = await fetchImpl(`${api}/gists/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ironman-2027-ci',
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new FetchError(`netværksfejl (${e?.cause?.code ?? e?.name ?? 'ukendt'})`, { retryable: true });
  }
  if (res.status === 401) throw new FetchError('401: GIST_READ_TOKEN blev afvist');
  if (res.status === 404) throw new FetchError('404: gisten findes ikke, eller tokenet mangler adgang (prøv at give det Gists-læsetilladelse)');
  const limited = res.status === 429 || (res.status === 403 && (res.headers.get('x-ratelimit-remaining') === '0' || res.headers.has('retry-after')));
  if (limited || res.status === 408 || res.status >= 500) throw new FetchError(`GitHub svarede ${res.status}`, { retryable: true });
  if (!res.ok) throw new FetchError(`GitHub svarede ${res.status}`);
  let body;
  try { body = await res.json(); } catch { throw new FetchError('svaret var ikke JSON', { retryable: true }); }
  if (!isObj(body) || !isObj(body.files)) throw new FetchError('uventet svar fra GitHub', { retryable: true });
  return body;
}

// → { skipped: true } eller { progress, stats }. Kaster FetchError/UsageError.
export async function fetchProgress({
  env = process.env,
  fetchImpl = globalThis.fetch,
  sleep = ms => new Promise(r => setTimeout(r, ms)),
  delays = DEFAULT_DELAYS,
} = {}) {
  const id = (env.GIST_ID ?? '').trim();
  const token = (env.GIST_READ_TOKEN ?? '').trim();
  if (!id || !token) return { skipped: true, reason: !id ? 'GIST_ID' : 'GIST_READ_TOKEN' };
  if (!GIST_ID_RE.test(id)) throw new UsageError('GIST_ID har ugyldigt format');
  const api = apiBase(env);

  let body;
  for (let i = 0; ; i++) {
    try { body = await attempt({ api, id, token, fetchImpl }); break; }
    catch (e) {
      if (!(e instanceof FetchError) || !e.retryable || i >= delays.length) throw e;
      console.warn(`Forsøg ${i + 1} mislykkedes (${e.message}); prøver igen om ${delays[i]} ms`);
      await sleep(delays[i]);
    }
  }

  if (!isObj(body.files[META_FILE])) throw new FetchError(`gisten er ikke en ironman-2027-gist (mangler ${META_FILE})`);
  const progress = {};
  const stats = { weeks: 0, sessions: 0, done: 0, skipped: 0 };
  for (const [name, file] of Object.entries(body.files)) {
    if (!WEEK_FILE.test(name)) continue;
    // Beskadiget eller afkortet ugefil: spring den over (og tæl den), så én dårlig fil ikke blokerer alle deploys.
    const parsed = isObj(file) && !file.truncated && typeof file.content === 'string' ? parseWeekFile(name, file.content) : null;
    if (!parsed) { stats.skipped++; continue; }
    progress[parsed.weekId] = mergeWeek(progress[parsed.weekId] ?? {}, parsed.week);
  }
  for (const week of Object.values(progress)) {
    const entries = Object.values(week);
    if (!entries.length) continue;
    stats.weeks++;
    stats.sessions += entries.length;
    stats.done += entries.filter(e => e.done === true).length;
  }
  return { progress, stats };
}

function parseDelays(env) {
  const raw = env.FETCH_PROGRESS_DELAYS_MS; // kun til tests: fx "0,0"
  if (!raw) return DEFAULT_DELAYS;
  const list = raw.split(',').map(s => Number(s.trim()));
  return list.every(n => Number.isInteger(n) && n >= 0) ? list : DEFAULT_DELAYS;
}

async function main() {
  const at = process.argv.indexOf('--out');
  const out = at > 0 ? process.argv[at + 1] : undefined;
  if (!out) { console.error('Brug: node scripts/fetch-progress.mjs --out <fil>'); return 2; }
  try {
    const r = await fetchProgress({ delays: parseDelays(process.env) });
    if (r.skipped) {
      rmSync(out, { force: true }); // ingen forældet fil, så bygget får progress = null (ingen mærker)
      console.log(`::warning::${SKIP_WARNINGS[r.reason]}`);
      return 0;
    }
    writeFileSync(out, JSON.stringify(toExport(r.progress, new Date())), { mode: 0o600 });
    const { weeks, sessions, done, skipped } = r.stats;
    console.log(`Fremdrift hentet: ${weeks} uger, ${sessions} pas (${done} gennemført)${skipped ? `, ${skipped} ugefiler sprunget over` : ''}`);
    if (skipped) console.log(`::warning::${skipped} ugefil(er) i gisten kunne ikke læses og er sprunget over`);
    return 0;
  } catch (e) {
    if (e instanceof UsageError) { console.error(`::error::${e.message}`); return 2; }
    if (e instanceof FetchError) { console.error(`::error::Kunne ikke hente fremdrift: ${e.message}`); return 1; }
    throw e;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) process.exitCode = await main();
