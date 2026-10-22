#!/usr/bin/env node
// Engangs-OAuth mod Strava på din Mac (docs/strava.md §1.2). Kør igen efter et tilbagekald eller en `auth`-alarm fra CI.
//   read -rs STRAVA_CLIENT_SECRET && export STRAVA_CLIENT_SECRET
//   STRAVA_CLIENT_ID=123456 node scripts/strava-auth.mjs [--port 8721] [--print] [--read-all]
//   unset STRAVA_CLIENT_SECRET
// Standard: scope `activity:read`; `--read-all` bruger `activity:read_all` (så ses også aktiviteter sat til "Kun dig").
// Standard: gemmer STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET og STRAVA_REFRESH_TOKEN som Actions-secrets med `gh secret set` (værdien via stdin).
// --print: skriver kun refresh-tokenet til stdout (til pipes), og alle beskeder til stderr. Ingen fil skrives. Et token vises aldrig i standardtilstand.
// Env: STRAVA_CLIENT_ID (tal), STRAVA_CLIENT_SECRET. Exit: 0 = færdig, 1 = mislykket (afvist, afbrudt, ingen gh), 2 = brug.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError, STRAVA_OAUTH, exchangeCode } from './lib/strava.mjs';

export { exchangeCode };
export const REPO = 'EmilBerntsen-ui/ironman-2027';
export const SCOPE = 'activity:read';
export const SCOPE_ALL = 'activity:read_all';
export const SECRET_NAMES = ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET', 'STRAVA_REFRESH_TOKEN'];
const DEFAULT_PORT = 8721;
const TIMEOUT_MS = 5 * 60 * 1000;

class UsageError extends Error {}

// ---- Adresse og svar fra Strava ----

// → adressen brugeren skal åbne. `port` er callback-porten på localhost.
export function authorizeUrl({ clientId, port = DEFAULT_PORT, state, scope = SCOPE }) {
  const u = new URL('https://www.strava.com/oauth/authorize');
  u.search = new URLSearchParams({
    client_id: String(clientId), response_type: 'code', redirect_uri: `http://localhost:${port}/callback`, approval_prompt: 'force', scope, state,
  }).toString();
  return u.toString();
}

const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

// Callback-adressen (sti + query, eller fuld adresse) → { ok: true, code, scope } eller { ok: false, reason, message }.
// reason: 'state' | 'denied' | 'error' | 'nocode' | 'scope'. Meddelelsen er vores egen tekst; Stravas tekst og koden gengives aldrig.
export function parseCallback(url, state, { scope = SCOPE } = {}) {
  let q;
  try { q = new URL(String(url), 'http://localhost').searchParams; } catch { return { ok: false, reason: 'state', message: 'Ugyldig anmodning.' }; }
  if (!safeEqual(q.get('state') ?? '', state)) return { ok: false, reason: 'state', message: 'Ugyldig anmodning (state passer ikke).' };
  if (q.has('error')) {
    return q.get('error') === 'access_denied'
      ? { ok: false, reason: 'denied', message: 'Du afviste adgangen hos Strava. Kør scriptet igen, og tryk på Authorize.' }
      : { ok: false, reason: 'error', message: 'Strava svarede med en fejl. Kør scriptet igen.' };
  }
  const code = q.get('code') ?? '';
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(code)) return { ok: false, reason: 'nocode', message: 'Strava sendte ingen kode. Kør scriptet igen.' };
  const granted = (q.get('scope') ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const enough = granted.includes(scope) || (scope === SCOPE && granted.includes(SCOPE_ALL));
  if (!enough) return { ok: false, reason: 'scope', message: `Du fjernede flueben ved aktiviteter på samtykkesiden (der kræves ${scope}). Kør scriptet igen, og lad fluebenet være sat.` };
  return { ok: true, code, scope: granted.join(',') };
}

// ---- Lokal server (kun loopback) ----

const page = (title, body) => `<!doctype html><html lang="da"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>`
  + `<body style="font:18px system-ui;max-width:32rem;margin:15vh auto;padding:0 1rem"><h1>${title}</h1><p>${body}</p></body></html>`;

// Lytter på 127.0.0.1:<port> (og [::1]:<port>, hvis den findes). Kun GET /callback besvares; alt andet får 404.
// Lukker efter første gyldige svar (ok eller afvist) eller efter `timeoutMs`. `state` der ikke passer, besvares med 400, og der lyttes videre.
// → { port, servers, result: Promise<parseCallback-resultat | { ok:false, reason:'timeout' }>, close() }
export async function listenForCallback({ port = DEFAULT_PORT, state, scope = SCOPE, timeoutMs = TIMEOUT_MS } = {}) {
  let settle;
  const result = new Promise(r => { settle = r; });
  const servers = [];
  let actual = port;
  const hostRe = () => new RegExp(`^(?:localhost|127\\.0\\.0\\.1|\\[::1\\]):${actual}$`);
  const handler = (req, res) => {
    const reply = (status, html) => { res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" }); res.end(html); };
    const path = String(req.url ?? '').split('?')[0];
    if (req.method !== 'GET' || path !== '/callback') return reply(404, page('Ikke fundet', 'Her er intet at se.'));
    if (!hostRe().test(String(req.headers.host ?? ''))) return reply(400, page('Ugyldig anmodning', 'Forkert adresse.')); // DNS-rebinding
    const parsed = parseCallback(req.url, state, { scope });
    if (!parsed.ok && parsed.reason === 'state') return reply(400, page('Ugyldig anmodning', 'Denne anmodning hører ikke til den igangværende godkendelse.'));
    reply(parsed.ok ? 200 : 400, parsed.ok ? page('Færdig – du kan lukke fanen', 'Gå tilbage til terminalen.') : page('Det lykkedes ikke', parsed.message));
    settle(parsed);
  };
  const listen = (host, p) => new Promise((ok, fail) => {
    const s = http.createServer(handler);
    s.once('error', fail);
    s.listen({ host, port: p, exclusive: true }, () => { s.off('error', fail); ok(s); });
  });
  const v4 = await listen('127.0.0.1', port);
  servers.push(v4);
  actual = v4.address().port;
  try { servers.push(await listen('::1', actual)); } catch { /* ingen IPv6-loopback: localhost løses så til 127.0.0.1 */ }
  const timer = setTimeout(() => settle({ ok: false, reason: 'timeout', message: 'Ingen godkendelse inden for 5 minutter. Kør scriptet igen.' }), timeoutMs);
  const close = () => { clearTimeout(timer); for (const s of servers) { try { s.closeAllConnections?.(); s.close(); } catch { /* allerede lukket */ } } };
  return { port: actual, servers, result, close };
}

// ---- gh ----

// Findes `gh`? (Tjekkes før OAuth, så en engangskode ikke går tabt.)
export function ghAvailable({ spawnImpl = spawn } = {}) {
  return new Promise(ok => {
    try {
      const c = spawnImpl('gh', ['--version'], { stdio: 'ignore' });
      c.once('error', () => ok(false));
      c.once('close', code => ok(code === 0));
    } catch { ok(false); }
  });
}

// Sætter secrets med `gh secret set NAVN --repo …`. Værdien går via stdin, aldrig via argv eller env. `values`: { NAVN: værdi }.
// Kaster Error med vores egen tekst (uden værdier).
export async function setSecrets({ spawnImpl = spawn, values, repo = REPO } = {}) {
  for (const name of SECRET_NAMES) {
    if (!(name in values)) continue;
    await new Promise((ok, fail) => {
      let child, errText = '';
      try { child = spawnImpl('gh', ['secret', 'set', name, '--repo', repo], { stdio: ['pipe', 'ignore', 'pipe'] }); } catch { fail(new Error('Kunne ikke starte gh')); return; }
      child.once('error', e => fail(new Error(e?.code === 'ENOENT' ? 'gh (GitHub CLI) er ikke installeret' : 'Kunne ikke starte gh')));
      child.stderr?.on('data', d => { if (errText.length < 400) errText += String(d); });
      child.once('close', code => (code === 0 ? ok() : fail(new Error(`gh secret set ${name} fejlede (exit ${code})`))));
      child.stdin.on('error', () => {}); // gh kan lukke stdin tidligt; close-hændelsen melder fejlen
      child.stdin.end(String(values[name]));
    });
  }
}

// ---- Hovedprogram ----

function parseArgs(argv) {
  const opts = { port: DEFAULT_PORT, print: false, readAll: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--print') opts.print = true;
    else if (a === '--read-all') opts.readAll = true;
    else if (a === '--port') {
      const v = argv[++i];
      if (!/^\d{1,5}$/.test(v ?? '') || Number(v) > 65535) throw new UsageError('--port skal være et tal fra 0 til 65535');
      opts.port = Number(v);
    } else throw new UsageError(`Ukendt valg: ${a.slice(0, 20)}`);
  }
  return opts;
}

const openBrowser = url => {
  const c = spawn('open', [url], { stdio: 'ignore', detached: true }); // argv-liste, aldrig en shell
  c.on('error', () => {});
  c.unref();
};

// → exit-kode. Alt kan injiceres i tests.
export async function main({
  env = process.env, argv = process.argv.slice(2), fetchImpl = globalThis.fetch, spawnImpl = spawn, openImpl = openBrowser,
  out = s => process.stdout.write(s), err = s => process.stderr.write(s), timeoutMs = TIMEOUT_MS, oauth = STRAVA_OAUTH,
} = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
    if (!/^\d{1,12}$/.test(String(env.STRAVA_CLIENT_ID ?? ''))) throw new UsageError('STRAVA_CLIENT_ID mangler eller er ikke et tal. Brug: STRAVA_CLIENT_ID=123456 node scripts/strava-auth.mjs');
    if (!String(env.STRAVA_CLIENT_SECRET ?? '').trim()) throw new UsageError('STRAVA_CLIENT_SECRET mangler. Brug: read -rs STRAVA_CLIENT_SECRET && export STRAVA_CLIENT_SECRET');
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    err(`${e.message}\n`);
    return 2;
  }
  const clientId = env.STRAVA_CLIENT_ID, clientSecret = env.STRAVA_CLIENT_SECRET;
  const say = s => (opts.print ? err : out)(`${s}\n`); // --print: stdout er forbeholdt tokenet
  const scope = opts.readAll ? SCOPE_ALL : SCOPE;

  if (!opts.print && !(await ghAvailable({ spawnImpl }))) {
    err('gh (GitHub CLI) blev ikke fundet, så secrets kan ikke gemmes. Installér gh og log ind (gh auth login), eller kør igen med --print for at få tokenet på stdout.\n');
    return 1;
  }

  const state = randomBytes(16).toString('hex');
  let listener;
  try { listener = await listenForCallback({ port: opts.port, state, scope, timeoutMs }); }
  catch { err(`Kunne ikke lytte på port ${opts.port} (er den i brug?). Prøv --port med et andet tal.\n`); return 1; }

  try {
    const url = authorizeUrl({ clientId, port: listener.port, state, scope });
    say(`Åbn denne adresse i browseren, og tryk på Authorize (scope: ${scope}):\n${url}`);
    try { openImpl(url); } catch { say('Kunne ikke åbne browseren automatisk; åbn adressen ovenfor selv.'); }
    const cb = await listener.result;
    if (!cb.ok) { say(cb.message); return 1; }
    listener.close();

    let refreshToken;
    try { ({ refreshToken } = await exchangeCode({ fetchImpl, oauth, clientId, clientSecret, code: cb.code })); }
    catch (e) {
      say(e instanceof HttpError && e.status ? `Strava afviste kodevekslingen (status ${e.status}). Tjek Client ID og Client Secret, og kør igen.` : 'Strava kunne ikke nås eller svarede uventet. Kør igen om lidt.');
      return 1;
    }

    if (opts.print) {
      out(`${refreshToken}\n`);
      say('Refresh-tokenet er skrevet til stdout. Gem det som secret STRAVA_REFRESH_TOKEN, sammen med STRAVA_CLIENT_ID og STRAVA_CLIENT_SECRET.');
      return 0;
    }
    try { await setSecrets({ spawnImpl, values: { STRAVA_CLIENT_ID: clientId, STRAVA_CLIENT_SECRET: clientSecret, STRAVA_REFRESH_TOKEN: refreshToken } }); }
    catch (e) {
      say(`${e.message}. Kør scriptet igen, eller brug --print og gem selv secrets.`);
      return 1;
    }
    say(`Gemte ${SECRET_NAMES.join(', ')} som secrets i ${REPO}.`);
    say('Husk: unset STRAVA_CLIENT_SECRET. Kør derefter: gh workflow run pages.yml -f strava_days=7 && gh run watch --exit-status');
    return 0;
  } finally {
    listener.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) process.exitCode = await main();
