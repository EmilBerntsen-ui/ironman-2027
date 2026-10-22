// Hjælper til test/store-*.test.mjs: en GitHub Gist-API i hukommelsen (ingen netværk, ingen rigtige tokens).
// Kan: GET /user, GET /gists (side + Link), POST /gists, GET /gists/:id med ETag/304, PATCH med filgranulær overskrivning,
// 401 ved forkert token, rate-limit-svar, indsprøjtede fejl og en `before`-hook til at låse anmodninger (latens, afbrudte svar, sammenfletning).
// Kører ikke tests selv (men `node --test` indlæser filen; den har ingen bivirkninger).

export const API = 'https://api.github.com';
export const TEST_TOKEN = 'github_pat_TESTONLY00000000000000000000'; // opdigtet; findes ikke hos GitHub
export const TEST_LOGIN = 'testuser';

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

// Hurtig venteløkke: lader afventende mikro-/makroopgaver køre (fetch-fakes svarer uden rigtig I/O).
export async function settle(rounds = 25) {
  for (let i = 0; i < rounds; i++) await new Promise(r => setImmediate(r));
}

// Falsk ur + falske timere. `advance(ms)` kører de timere der forfalder i rækkefølge. Timere kører aldrig af sig selv.
export function createClock(startIso = '2026-11-24T10:00:00.000Z') {
  let t = Date.parse(startIso);
  let seq = 0;
  const timers = new Map(); // id → { at, fn }
  return {
    now: () => new Date(t),
    set: iso => { t = Date.parse(iso); },
    ms: () => t,
    setTimeout(fn, ms = 0) { const id = ++seq; timers.set(id, { at: t + Math.max(0, ms), fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    get pending() { return [...timers.values()].map(x => x.at - t).sort((a, b) => a - b); },
    // Spol uret frem og kør alt der forfalder (hvert callback kan oprette nye timere).
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        timers.delete(due[0]);
        t = Math.max(t, due[1].at);
        due[1].fn();
        await settle();
      }
      t = end;
    },
  };
}

export function createFakeGitHub({ tokens = { [TEST_TOKEN]: TEST_LOGIN }, now = () => new Date(), pageSize = 100 } = {}) {
  const gists = new Map();
  let nextId = 1;
  const requests = [];
  const injected = []; // { match, times, respond }
  const fake = {
    api: API,
    requests,
    offline: false,
    before: null, // async (req) => void; afventes før anmodningen behandles
    rateLimit: null, // { remaining, reset (epoch-sekunder), retryAfter? } → 403 på alle kald
    pageSize,

    // Opret en gist direkte (uden om API'et). → gist
    addGist({ id, description = '', files = {}, updated_at } = {}) {
      id = id || (nextId++).toString(16).padStart(32, '0');
      const g = { id, description, public: false, files: {}, rev: 1, updated_at: updated_at || now().toISOString() };
      for (const [name, content] of Object.entries(files)) g.files[name] = { filename: name, content: typeof content === 'string' ? content : JSON.stringify(content) };
      gists.set(id, g);
      return g;
    },
    gist: id => gists.get(id),
    file: (id, name) => (gists.get(id) && gists.get(id).files[name] ? gists.get(id).files[name].content : undefined),
    fileJson: (id, name) => { const c = fake.file(id, name); return c === undefined ? undefined : JSON.parse(c); },
    fileNames: id => Object.keys((gists.get(id) || { files: {} }).files).sort(),
    // Tæl anmodninger: count({ method:'PATCH' }) eller count(r => …)
    count: m => requests.filter(typeof m === 'function' ? m : r => Object.entries(m).every(([k, v]) => r[k] === v)).length,
    // Næste `times` anmodninger der matcher besvares med `respond` ('network' = fetch afviser, ellers { status, headers?, body? }).
    inject(match, respond, times = 1) { injected.push({ match, respond, times }); },

    fetch: async (url, init = {}) => {
      const u = new URL(url);
      const headers = {};
      for (const [k, v] of Object.entries(init.headers || {})) headers[k.toLowerCase()] = v;
      const req = {
        method: (init.method || 'GET').toUpperCase(), url: String(url), host: u.host, path: u.pathname, search: u.search,
        query: Object.fromEntries(u.searchParams), headers, cache: init.cache, body: init.body === undefined ? undefined : JSON.parse(init.body),
      };
      requests.push(req);
      if (fake.offline) throw new TypeError('Failed to fetch');
      if (fake.before) await fake.before(req);
      if (fake.offline) throw new TypeError('Failed to fetch');
      const hit = injected.find(i => i.times > 0 && i.match(req));
      if (hit) {
        hit.times--;
        if (hit.respond === 'network') throw new TypeError('Failed to fetch');
        return done(req, json(hit.respond.status, hit.respond.body || { message: 'injected' }, hit.respond.headers));
      }
      if (u.origin !== API) return done(req, json(404, { message: 'Not Found' }));
      if (headers.authorization === undefined || !tokens[(headers.authorization.match(/^Bearer (.+)$/) || [])[1]]) return done(req, json(401, { message: 'Bad credentials' }));
      if (fake.rateLimit) {
        const rl = fake.rateLimit;
        return done(req, json(403, { message: 'API rate limit exceeded' }, {
          'x-ratelimit-remaining': String(rl.remaining ?? 0), 'x-ratelimit-reset': String(rl.reset),
          ...(rl.retryAfter !== undefined ? { 'retry-after': String(rl.retryAfter) } : {}),
        }));
      }
      const login = tokens[headers.authorization.slice(7)];
      return done(req, route(req, login));
    },
  };

  const done = (req, res) => { req.status = res.status; return res; }; // svarkoden gemmes i anmodningsloggen

  const full = g => ({
    id: g.id, description: g.description, public: g.public, updated_at: g.updated_at,
    files: Object.fromEntries(Object.entries(g.files).map(([n, f]) => [n, { filename: n, type: 'application/json', size: f.content.length, truncated: false, content: f.content }])),
  });
  const summary = g => ({
    id: g.id, description: g.description, public: g.public, updated_at: g.updated_at,
    files: Object.fromEntries(Object.entries(g.files).map(([n, f]) => [n, { filename: n, type: 'application/json', size: f.content.length }])),
  });

  function route(req, login) {
    const { method, path } = req;
    if (path === '/user' && method === 'GET') return json(200, { login });
    if (path === '/gists' && method === 'GET') {
      const per = Math.min(+req.query.per_page || 30, fake.pageSize), page = +req.query.page || 1;
      const all = [...gists.values()].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
      const slice = all.slice((page - 1) * per, page * per);
      const hdr = {};
      if (page * per < all.length) hdr.link = `<${API}/gists?per_page=${per}&page=${page + 1}>; rel="next", <${API}/gists?per_page=${per}&page=${Math.ceil(all.length / per)}>; rel="last"`;
      return json(200, slice.map(summary), hdr);
    }
    if (path === '/gists' && method === 'POST') {
      const b = req.body || {};
      if (!b.files || !Object.keys(b.files).length) return json(422, { message: 'Validation Failed' });
      const g = fake.addGist({ description: b.description, files: Object.fromEntries(Object.entries(b.files).map(([n, f]) => [n, f.content])), updated_at: now().toISOString() });
      g.public = !!b.public;
      return json(201, full(g));
    }
    const m = /^\/gists\/([^/]+)$/.exec(path);
    if (m) {
      const g = gists.get(m[1]);
      if (!g) return json(404, { message: 'Not Found' });
      if (method === 'GET') {
        const etag = `W/"${g.id}-${g.rev}"`;
        if (req.headers['if-none-match'] === etag) return new Response(null, { status: 304, headers: { etag } });
        return json(200, full(g), { etag, 'cache-control': 'private, max-age=60, s-maxage=60' });
      }
      if (method === 'PATCH') {
        const files = (req.body || {}).files;
        if (!files || typeof files !== 'object') return json(422, { message: 'Validation Failed' });
        for (const [name, f] of Object.entries(files)) { // filgranulært: kun de nævnte filer røres
          if (f === null) delete g.files[name];
          else if (typeof f.content === 'string') g.files[name] = { filename: name, content: f.content };
        }
        g.rev++;
        g.updated_at = now().toISOString();
        return json(200, full(g));
      }
    }
    return json(404, { message: 'Not Found' });
  }

  return fake;
}
