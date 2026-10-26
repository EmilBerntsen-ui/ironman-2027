# Ironman 2027 on GitHub: architecture (phase 1)

Status: decided 2026-10-22. Phase 2 agents implement this; deviations need a note in their PR.

Scope: one source tree, two build targets: (a) an installable PWA on GitHub Pages with cross-device sync through a secret Gist and a secret-path calendar feed, (b) the existing claude.ai Artifact. Strava (phase 6) was first a set of data-model hooks, and is now designed and implemented in [strava.md](strava.md).

Assumed repo and URL: `github.com/EmilBerntsen-ui/ironman-2027` (public), served at `https://emilberntsen-ui.github.io/ironman-2027/`. Every site URL is relative, so renaming the repo only changes the guides.

## 0. Decisions at a glance

| Topic | Decision |
|---|---|
| Targets | `node build.mjs --target=artifact\|site\|all` writes `dist/artifact/index.html` and `dist/site/**`. A mini-bundler uses a module list per target. Build output contains no timestamps (content hashes only) |
| Storage | One `Store` interface with three implementations: `LocalStore` (both targets), `ArtifactDbStore` (artifact only) and `GistStore` (site only). `app.js` picks one from the target and the saved config |
| Data | Schema v2. Merge is last-writer-wins per session on `updatedAt`. Un-checking writes a tombstone `{done:false}`. v1 data stays readable. No GC, because the key space is bounded at about 430 sessions |
| Gist layout | One file per week (`u01.json`…`u43.json`) plus a marker file `_ironman-2027.json`. A PATCH sends only the dirty week files |
| Sync | State-based. Each device keeps a full merged replica. Sync runs GET (with ETag), merge, PATCH, then a verify read. Polls every 60 s while visible and on focus/online. A queue of dirty weeks lives in localStorage |
| Auth/security | One fine-grained PAT per device, with Gists read/write only, kept in localStorage. Strict meta CSP, self-hosted fonts, no third-party JS |
| CI/CD | Triggers: push to `main`, cron `17 2 * * *` and `17 20 * * *` (the second one is for Strava) and manual dispatch (input `strava_days`). Steps: test, Strava sync (see [strava.md](strava.md)), fetch gist, build, `deploy-pages`, then delete the Pages artifact |
| ICS | `✅` for done sessions and nothing else: sessions that are not done, past or future, are unchanged (no mark for missed sessions). The marks need `GIST_ID` and `GIST_READ_TOKEN`. Only `done` and `min` are read. Served at the secret path `cal/<CAL_TOKEN>/ironman-2027.ics` |
| Strava | The Action imports activities and writes `src:"strava"` entries into the gist, so sessions show as done without ticking. Spec in [strava.md](strava.md): personal API app, rotated refresh token stored encrypted in the gist (`_strava.json`), scope `activity:read` (`--read-all` for `activity:read_all`), a manual tick always wins. Only `dist`/`hr` are new fields, and the `.ics` ignores them |
| Pace | Every planned session carries an explicit zone (`z`, optional `main`, `ind`, `legs`) in `plan.js`; nothing is parsed from the text. `src/pace.js` derives recommended pace ranges from three baselines (run threshold 5:45 /km, swim CSS 2:10 /100 m, bike threshold 29 km/h), shown in the sheet, on the cards, in the zone guide and in each `.ics` description. The log has an optional actual `pace` (§3.1). Bike is km/h only, and indoor sessions say "efter følelse og kadence". Details in §3.8 |
| Nutrition | `src/nutrition.js` (pure, no DOM) derives a day type from the day's planned sessions and shows carbohydrate per kg, an energy **estimate** and before/during/after fueling per session. Numbers come only from [research/ernaering-kilder.md](research/ernaering-kilder.md). The user's weight is personal: kept only in `localStorage` under `im2027-weight-kg`, never in a Store, the gist, an export or the `.ics`. Chips on every day, a weekly average, a `Kost` block in the sheet and a `Kost` guide. Details in §3.9 |
| PWA | The whole shell is precached and served cache-first, versioned by content hash. The SW ignores `/cal/` and cross-origin requests. An update toast prompts the reload |

---

## 1. Build targets

### 1.1 File layout after phase 2

```
src/plan.js                 unchanged (plan data, TSS, PMC)
src/progress.js             NEW  schema v2: pure logic, runs in Node and the browser
src/pace.js                 NEW  recommended pace per zone, parsing and formatting of pace (pure logic, Node and browser)
src/nutrition.js            NEW  day types, macros, energy estimate, fueling per session, weight (local only), `Kost` guide data (pure logic)
src/ics.js                  + completion marks
src/app.html                body markup only (head moved to the shells)
src/shell.artifact.html     NEW  title/meta/Google Fonts/<style>/<script> wrapper (no doctype/html/head/body)
src/shell.site.html         NEW  full document: doctype, CSP, manifest, icons
src/app.js                  uses a Store
src/styles.css              frozen during phase 2
src/settings.js / .css      NEW  sync dialog: connect, status, export/import
src/store/local.js          NEW  LocalStore, deviceId
src/store/artifact-db.js    NEW  ArtifactDbStore
src/store/gist.js           NEW  GistStore
src/pwa.js / .css           NEW  SW registration, update toast, iOS install hint
src/sw.js                   NEW  service-worker template
src/fonts.css               NEW  @font-face for self-hosted fonts (site only)
assets/manifest.webmanifest, assets/icons/*, assets/fonts/*.woff2 + OFL.txt
build.mjs                   CLI
build/bundle.mjs            TARGETS, bundleJs, bundleCss, render
build/artifact.mjs          buildArtifact()
build/site.mjs              buildSite()
build/calendar.mjs          writeCalendar()
scripts/fetch-progress.mjs  CI: gist to progress JSON
scripts/create-gist.mjs     one-off from a terminal: find-or-create the secret gist (same code as the app's first connect)
scripts/make-icons.mjs      zero-dependency PNG generator
.github/workflows/pages.yml
```

### 1.2 Outputs

| | artifact | site |
|---|---|---|
| Output | `dist/artifact/index.html` | `dist/site/` |
| Document | no doctype/html/head/body (claude.ai rule) | `<!doctype html><html lang="da"><head>…</head><body>…` |
| CSS | inline `<style>` | inline `<style>` (CSP allows it, see §4) |
| JS | inline `<script>`, one IIFE | external `app.<sha8>.js`, `defer` |
| Fonts | Google Fonts `<link>` (as today) | self-hosted `fonts/*.woff2` |
| Store | `ArtifactDbStore`, falling back to `LocalStore` | `GistStore` if configured, else `LocalStore` |
| Extra files | none | `sw.js`, `manifest.webmanifest`, `icons/*`, `fonts/*`, `cal/<CAL_TOKEN>/ironman-2027.ics` (only when `CAL_TOKEN` is set) |

`dist/ironman-2027.ics` (plan only, no marks) is still written on every build for manual import. It is never deployed.

### 1.3 Module lists (`build/bundle.mjs`)

```js
export const TARGETS = {
  artifact: {
    shell: 'src/shell.artifact.html',
    css: ['src/styles.css', 'src/settings.css'],
    js: ['src/plan.js', 'src/progress.js', 'src/pace.js', 'src/nutrition.js', 'src/store/local.js', 'src/store/artifact-db.js', 'src/settings.js', 'src/app.js'],
  },
  site: {
    shell: 'src/shell.site.html',
    css: ['src/fonts.css', 'src/styles.css', 'src/settings.css', 'src/pwa.css'],
    js: ['src/plan.js', 'src/progress.js', 'src/pace.js', 'src/nutrition.js', 'src/store/local.js', 'src/store/gist.js', 'src/settings.js', 'src/app.js', 'src/pwa.js'],
  },
};
export function bundleJs(files, { target, version }) /* → string */;
export function bundleCss(files) /* → string */;
export function render(shellFile, { body, styles, script, appJs }) /* → string */;
```

Bundler rules for `bundleJs`. They replace today's `replace(/^export /gm, '')`.
- Prepend `const BUILD = Object.freeze({ target, version });`.
- In each file, remove single-line `import … from '…';` lines. Collect export names with `/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([\w$]+)/gm`, then strip the keyword. Wrap the file as `const { a, b } = (() => { <src>\nreturn { a, b }; })();`. A file without exports becomes a plain IIFE.
- Throw on any of: a duplicate export name across files, `export default`, `export { … }`, a multi-line import, or (artifact only) `</script` in the output.
- The whole bundle is wrapped in one outer `'use strict'` IIFE. Names resolve by global name in list order. `import` lines exist for Node tests and editors only.
- Bundles reference identifiers that exist only in one target behind a `typeof` guard: `typeof GistStore !== 'undefined'`.
- No `Date.now()`, timestamps or randomness in any built shell file. `version` is `sha256(bundle)` cut to 12 hex characters. A nightly rebuild with unchanged source is byte-identical, so the SW raises no spurious update.

Shell placeholders: `<!--BODY-->` (filled from `src/app.html`), `/*STYLES*/`, `/*SCRIPT*/` (artifact, inline) and `__APP_JS__` (site, `src` filename).

### 1.4 `build.mjs` and build module signatures

```js
// node build.mjs [--target=artifact|site|all]   (default: all)
const target = (process.argv.find(a => a.startsWith('--target=')) ?? '--target=all').slice(9);
const weeks = plan();
if (target === 'artifact' || target === 'all') await buildArtifact({ outDir: 'dist/artifact' });
writeFileSync('dist/ironman-2027.ics', buildIcs(weeks));                       // plan only, as today
if (target === 'site' || target === 'all') {
  await buildSite({ outDir: 'dist/site' });                                    // 2a
  const progress = readProgressFile(process.env.PROGRESS_FILE);                // null if unset or missing; else parseAny()
  await writeCalendar({ outDir: 'dist/site', weeks, progress,
                        calToken: process.env.CAL_TOKEN, now: new Date() });   // 2c
}
```

- `buildArtifact({ outDir }) → Promise<{ version, bytes }>`
- `buildSite({ outDir }) → Promise<{ version, precache: string[] }>` cleans `outDir` first and writes everything except `cal/`.
- `writeCalendar({ outDir, weeks, progress, calToken, now }) → Promise<{ written: boolean }>`
  - `calToken` must match `/^[A-Za-z0-9_-]{32,128}$/`.
  - If the token is missing or invalid: throw when `process.env.CI === 'true'`; otherwise warn and skip.
  - Logs `cal/<redacted>/ironman-2027.ics`, never the token.
- Tests build into `fs.mkdtemp` directories, never into `dist/`.

`.gitignore` adds `dist/`, `*progress*.json` and `!test/fixtures/*.json`. Fixtures must be synthetic. Node's default `node --test` glob runs every `*.mjs` under `test/`, so fixtures must be `.json`.

---

## 2. Storage adapter

### 2.1 Interface

```js
/** @typedef {import('../progress.js').Entry} Entry */
/** @typedef {Record<string, Record<string, Entry>>} Progress   weekId → sessionKey → Entry */
/** @typedef {{ done: true, at?: string, min?: number, rpe?: number, note?: string,
 *              src?: 'manual'|'strava', extId?: string, sig?: string }} EntryPatch */
/** @typedef {{ kind: 'local'|'artifact'|'gist',
 *              state: 'ready'|'syncing'|'offline'|'auth'|'error',
 *              pending: number,            // weeks not yet pushed
 *              lastSync: string|null,      // ISO
 *              label: string }} StoreStatus  // Danish one-liner for the header badge */

// Every store implements:
//   readonly kind
//   readonly status: StoreStatus
//   load(): Promise<Progress>          resolves from the local cache without waiting for the network; starts a background sync
//   snapshot(): Progress               current merged state; treat as read-only
//   subscribe(cb: (p: Progress) => void): () => void    called after every local save and every remote merge that changed anything
//   onStatus(cb: (s: StoreStatus) => void): () => void
//   save(weekId: string, sessionKey: string, patch: EntryPatch | null): void
//        synchronous local apply, async persist, never throws; null means un-check (tombstone)
//   syncNow(): Promise<void>           LocalStore resolves immediately
//   importProgress(p: Progress): Promise<{ changed: number }>   LWW merge, then persist
//   dispose(): void
```

`save` stamps the entry itself through `stampEntry(patch, prev, { now, dev })`. Callers never set `updatedAt` or `dev`.

### 2.2 Implementations

| Class | File | Local persistence | Remote |
|---|---|---|---|
| `LocalStore` | `src/store/local.js` | `localStorage['im2027-progress-v2'] = {"v":2,"weeks":Progress}`. Migrates once from v1 key `im2027-progress`, which is left untouched. A `storage` event re-reads (other tabs) | none |
| `ArtifactDbStore` | `src/store/artifact-db.js` | wraps a `LocalStore` as cache | `window.claude.use('db')`, collection `progress`, one doc per week. Writes `{v:2, sessions: Week, updated}` and reads v1 `{done:{…}, updated}` too. See the rules below |
| `GistStore` | `src/store/gist.js` | wraps a `LocalStore` as cache, plus `im2027-gist-sync` | GitHub Gist API (§3.4) |

`ArtifactDbStore` rules:
- `onSnapshot` only merges into local state (LWW per session, tombstones included). It never replaces local state and never writes from inside the callback.
- A snapshot with `metadata.fromCache` is merged but is otherwise ignored. Only a server-definitive snapshot can show that the database lacks something we have. After such a snapshot the missing weeks (and weeks whose last write failed) are pushed again, deferred until the callback has returned.
- A write is `get()` the week doc, merge it into the local week (LWW per session on `updatedAt`, tombstones win when newer), and then `set()` the merged week. If the database already holds everything, `set` is skipped. A `get()` answered from the cache is merged but never written from; the week stays pending until a definitive snapshot or `syncNow()`.
- The artifact runtime can take up to about 10 s to answer `claude.use('db')`, so `open()` waits up to 10 s (`ArtifactDbStore.OPEN_TIMEOUT_MS`) and `app.js` does not wait for it (§2.3).

Constructors take injected dependencies, so Node tests need no DOM:

```js
export function deviceId(storage)            // localStorage['im2027-device']: 8 random base36 chars, created once
new LocalStore({ storage = globalThis.localStorage, now = () => new Date() } = {})
ArtifactDbStore.open({ claude = globalThis.window?.claude, timeoutMs = 10000, storage, now }) // → Promise<ArtifactDbStore|null>
new GistStore(config, { fetch, storage, now, setTimeout, clearTimeout, random,
                        api = 'https://api.github.com', poll = true,     // poll:false in tests
                        timeoutMs = 20000 })                             // per-request timeout
GistStore.readConfig(storage)                // → { token, gistId, login, connectedAt } | null
GistStore.connect(token, deps)               // → Promise<{ gistId, login, created: boolean }>   (§4.3)
GistStore.findOrCreate(token, deps)          // the lookup/create half of connect, without touching storage; also used by scripts/create-gist.mjs
GistStore.disconnect(storage, { wipeLocal = false })
export function mountSettings({ store, target, version, openButton, gist /* GistStore|null */ })  // → { open, close, setStore(next), dispose }
```

### 2.3 Selection in `app.js`

```js
let store = new LocalStore();                       // from the first paint; everything is saved locally at once
function pickStore() {                              // site: a GistStore when connected, else null (stay on LocalStore)
  const cfg = BUILD.target !== 'artifact' && typeof GistStore !== 'undefined' ? GistStore.readConfig(localStorage) : null;
  return cfg ? new GistStore(cfg) : null;
}
// artifact: don't wait for claude.use('db') (up to ~10 s). Start on LocalStore and switch when it resolves:
ArtifactDbStore.open().then(db => { if (db) swapTo(db); });
```

`swapTo(next)` attaches the new store, disposes the old `LocalStore` and calls `settings.setStore(next)`. Edits made before the switch are already in `localStorage`. The new store reads them, and its first definitive snapshot pushes them to the database. While waiting, the status button says "Forbinder…".

Changes to `app.js` (2b):
- `state` becomes `store.snapshot()`.
- `entry(wk, key)` returns the entry only when `isDone(e)`.
- `setEntry(key, val)` calls `store.save(wk, sub, val ? { ...val, done: true, sig: sessionSig(s) } : null)`.
- `store.subscribe(refresh)`, and `store.onStatus(s => { savemode.textContent = s.label; })`.
- `#savemode` becomes `<button type="button" class="savemode" id="savemode">`, which opens the settings dialog. A visible "⚙ Indstillinger" button (`#settingsBtn`, at least 44 × 44 px) next to it opens the same dialog, and "Angiv vægt" link-buttons (`data-weight`, shown only without a saved weight) open it with the weight field focused.
- After connect or disconnect, settings calls `location.reload()`. Re-initialising this way is simplest and correct.
- Today, today's index and the current week are recomputed by `rollDay()` on `visibilitychange` (to visible), `pageshow` and `focus` when the date has changed. It redraws the header, grid, agenda and charts. A week the user navigated to stays selected; a user who was on the old "this week" follows to the new one. An installed PWA can stay in the background for days, so the date computed at load time would go stale.
- Accessibility: the page body is a single `<main>` landmark. The week bars are `role="button"` groups whose accessible name (`aria-label`) is the same text as their tooltip (`<title>`).

---

## 3. Progress data model v2

### 3.1 Entry

```jsonc
{
  "done": true,                              // false = tombstone (un-checked)
  "updatedAt": "2026-11-24T06:58:01.123Z",   // required; Date#toISOString(); LWW key
  "dev": "k3f9a2c1",                         // writer device id; tie-break
  "at": "2026-11-24T06:57:40.000Z",          // first marked done; kept across edits
  "min": 42,                                 // actual minutes, integer 0..900
  "rpe": 7,                                  // integer 1..10
  "note": "Tung i benene",                   // ≤ 1000 chars
  "src": "manual",                           // "manual" | "strava"; absent = manual
  "extId": "12345678901",                    // external activity id (Strava), string
  "sig": "run:Løbeintervaller",              // `${s.s}:${s.t}` of the planned session at log time
  "dist": 10234,                             // metres, integer 0..1,000,000 (Strava only; never in the .ics)
  "hr": 148,                                 // average heart rate, integer 30..250 (Strava only; never in the .ics)
  "pace": 330                                // actual pace: sec/km (run), sec/100 m (swim) or km/h (bike); number 1..3600, one decimal; never in the .ics
}
```

- Tombstone: `{"done": false, "updatedAt": "…", "dev": "…"}`. All detail fields are dropped, `dist`, `hr` and `pace` too.
- Keys are unchanged from v1. `weekId` matches `/^u\d{2}$/`. `sessionKey` matches `/^[0-6]-\d{1,2}$/` (day with Monday = 0, then session index).

### 3.2 `src/progress.js` API

Pure: no DOM, no Node APIs.

```js
export const FORMAT = 'ironman-2027-progress', SCHEMA = 2, EPOCH = '1970-01-01T00:00:00.000Z';
export const META_FILE = '_ironman-2027.json';
export const GIST_DESCRIPTION = 'Ironman 2027 – træningslog (redigér ikke manuelt)';
export function normalizeEntry(raw)                   // → Entry|null; accepts v1 true, v1 {at,…} and v2
export function isDone(e)                             // → boolean (e?.done === true)
export function sessionSig(s)                         // → `${s.s}:${s.t}`
export function stampEntry(patch, prev, { now, dev }) // → Entry; updatedAt = max(now, prev.updatedAt + 1 ms); keeps prev.at
export function mergeEntry(a, b)                      // → Entry
export function mergeWeek(a, b)                       // → Week (new object)
export function mergeProgress(a, b)                   // → Progress (new object)
export function diffWeeks(local, remote)              // → weekIds where mergeWeek(local[w], remote[w]) ≠ remote[w]
export function weekFileName(weekId)                  // 'u05' → 'u05.json'
export function serializeWeek(weekId, week)           // → stable JSON: sorted keys, one session per line
export function parseWeekFile(name, text)             // → { weekId, week } | null
export function parseAny(json)                        // → Progress; accepts v2 export, raw v2 Progress, v1 localStorage blob, v1 artifact docs
export function toExport(progress, now)               // → { format, v: 2, kind: 'export', exportedAt, weeks }
export function stableStringify(value)
```

### 3.3 Merge, compatibility and validation

Merge is per session. It is commutative, associative and idempotent:
1. The higher `updatedAt` wins (string compare of ISO UTC). The whole entry wins, so unknown fields travel with the winner.
2. On a tie, the higher `dev` wins.
3. On a further tie, the higher `stableStringify(entry)` wins.

An absent entry loses to anything, including a tombstone. Tombstones are never collected: there are at most about 430 keys in total. `stampEntry` makes sure an edit beats the version it was based on, even if the device clock runs behind.

v1 compatibility is read-only. Everything written is v2:
- v1 `true` becomes `{done:true, updatedAt: EPOCH}`.
- v1 `{at, min?, rpe?, note?}` becomes `{done:true, updatedAt: at ?? EPOCH, at, min, rpe, note}`.
- An artifact v1 doc `{done:{…}, updated}` is mapped through the two rules above.

Any v2 edit therefore beats legacy data.

Validation in `normalizeEntry` runs on every remote byte before it reaches state or the DOM:
- Drop the entry if it is neither an object nor `true`.
- `min` must be an integer 0..900, otherwise the field is dropped.
- `rpe` must be an integer 1..10.
- `note` must be a string, cut to 1000 characters.
- Timestamps must give a finite `Date.parse`, otherwise they become `EPOCH`.
- `src` must be a value of the enum.
- Length limits: `extId` ≤ 64, `sig` ≤ 120, `dev` ≤ 16.
- `dist` must be an integer 0..1,000,000 and `hr` an integer 30..250, otherwise the field is dropped.
- `pace` must be a finite number 1..3600 (rounded to one decimal), otherwise the field is dropped. The unit follows from the session's sport (`src/pace.js`), so it needs no extra field. Schema v2 stays: entries without `pace` read as before, `pace` travels with the winning entry in the merge, and a client that does not know the field keeps it as an unknown primitive.
- Unknown keys are kept only when the value is a primitive of ≤ 200 characters. This gives bounded forward compatibility.

### 3.4 Gist layout

One secret gist, with `description = GIST_DESCRIPTION`:

- `_ironman-2027.json` is the marker: `{"format":"ironman-2027-progress","v":2,"kind":"meta","start":"2026-10-26","createdAt":"…"}`
- `u01.json` … `u43.json` are created on first write:

```json
{"format":"ironman-2027-progress","v":2,"week":"u05","sessions":{
"1-0":{"at":"2026-11-24T06:57:40.000Z","dev":"k3f9a2c1","done":true,"min":42,"note":"…","rpe":7,"sig":"run:Løbeintervaller","updatedAt":"2026-11-24T06:58:01.123Z"},
"1-1":{"dev":"k3f9a2c1","done":false,"updatedAt":"2026-11-24T07:10:00.000Z"}
}}
```

Why one file per week:
- The Gist PATCH has no `If-Match`, but it is file-granular: files not named in the body stay untouched.
- With one file per week, a lost update needs two devices writing the same week within one round trip. With a single file, every save would race every other save.
- One file per month saves nothing over one per week.
- 44 files are well inside gist limits (300 files per API response, 1 MB per file before truncation). A full week file is about 3 KB, and one GET still returns everything.

### 3.5 Sync protocol (`GistStore`)

Each device holds a full local replica, and the merge is a join (CRDT-style). No op-log is needed.

Local keys:
- `im2027-progress-v2`: merged state, shared with `LocalStore`.
- `im2027-gist-sync`: `{"etag":"W/\"…\"","dirty":["u05"],"lastSync":"…"}`.
- `im2027-gist`: config (§4.1).

Operations:
- **save**: apply locally, persist, add the week to `dirty`, then flush after a 1.5 s debounce (10 s at most).
- **pull**: `GET /gists/{id}` with `cache:'no-store'` and `If-None-Match: <etag>`. The API sends `Cache-Control: max-age=60`, so the default browser cache would serve stale data.
  - 304: done. A conditional 304 does not count against the rate limit.
  - 200: parse the `u??.json` files and compute `merged = mergeProgress(local, remote)`. Persist, notify if anything changed, store the new etag, then add `diffWeeks(merged, remote)` to `dirty`. This is the self-heal step.
- **flush**: pull first. If `dirty` is empty, stop. Otherwise send one `PATCH /gists/{id}` with `{"files":{"u05.json":{"content":"…"}}}` for all dirty weeks. On 200, clear those weeks from `dirty`, set `etag = null` and schedule one verify-pull 4 s ± 1 s later.
- **Lost-update case**: A and B both pull, then both PATCH u05, so A's edit is overwritten on the server. A still holds the edit locally. A's verify-pull (or next poll) finds `diffWeeks ≠ ∅` and re-pushes. The data converges unless A's storage is wiped before its next sync. Gist revision history is the last backstop.
- **Triggers**:
  - on load;
  - on `visibilitychange` to visible, `focus` and `online` (throttled to 10 s);
  - every 60 s while visible;
  - never while hidden.
- **Cross-tab**: pull and flush run inside `navigator.locks.request('im2027-sync', …)` where available. The `storage` event re-reads local state.
- **Errors**:
  - Every request carries `AbortSignal.timeout(20000)`. A timeout is a network error, so a hung connection never holds the sync lock.
  - Network error (including a timeout), 5xx or 409: state `offline`, retry with backoff 2 s·2ⁿ ± 20 %, capped at 5 min.
  - A 200 answer to the gist GET without a `files` object is an error (state `offline`, same backoff), never an empty gist. Treating it as empty would overwrite the gist with whatever is local.
  - 403/429 with `x-ratelimit-remaining: 0` or `retry-after`: send nothing until `x-ratelimit-reset` or `retry-after` has passed.
  - 403/429 whose body message matches `/rate limit|abuse detection/i` (also GitHub's secondary rate limit, which often comes without headers) is a rate limit too. Without a date the pause is 60 s and doubles on each consecutive hit (capped at about 1 h); a success resets it. Any other 403 is a missing token scope: state `auth`.
  - 401: state `auth`. Stop until a new token is pasted. `dirty` is kept. The settings dialog shows the token field ("Nyt token"), so the user can paste a new token without disconnecting; it reuses the existing gist id.
  - 404: state `error` with "Gist ikke fundet".
  - 422: state `error`. `dirty` is kept.
- **Budget**: about 1 request per minute per visible device (mostly 304s) plus 2 per save batch. That is far below 5,000/h and below the secondary limit on writes.
- **Status labels (Danish)**:

  | Store / state | Label |
  |---|---|
  | local | "Gemmes kun på denne enhed" |
  | artifact | "Gemmes på tværs af enheder" |
  | ready | "Synkroniseret kl. HH:MM" |
  | syncing | "Synkroniserer…" |
  | offline | "Offline · N uger venter" |
  | auth | "Forbind GitHub igen" |
  | error | "Synkfejl – tryk for detaljer" |

### 3.6 Migration from the artifact to the gist

The settings dialog in both targets has two actions:
- **Eksportér** shows a textarea with the `toExport()` JSON and a best-effort copy button. A download link appears only on the site, because the artifact sandbox may block downloads and the clipboard.
- **Importér** takes pasted JSON or a file, runs `parseAny`, then `store.importProgress`.

Migration steps: republish the artifact from `dist/artifact/index.html`, open it, click Eksportér. On the site, connect GitHub, then click Importér.

There is also a path without the UI: Claude reads collection `progress` with the ArtifactData tool and produces the same export JSON.

Afterwards the artifact keeps its own separate storage. There is deliberately no artifact↔gist bridge: the artifact sandbox cannot reach `api.github.com`, and a PAT must never be stored in the artifact DB.

### 3.7 Strava (phase 6)

Designed in [strava.md](strava.md). What this document fixes:
- The fields `src`, `extId`, `min` and (new) `dist` and `hr`.
- The rule: an importer creates entries only for sessions that have no `done:true` entry, and it never overwrites a done entry (manual or Strava). A Strava entry carries `updatedAt` = the activity's end, so a manual tick made after the workout wins last-writer-wins.
- The gist gets one more file, `_strava.json`, which only CI writes (encrypted refresh token and an activity ledger). `parseWeekFile` only accepts `u\d\d.json`, so every existing reader ignores it.

### 3.8 Pace: zones, recommended and actual

Plan side (`src/plan.js`). Every session has an explicit zone, set where the session is built and never derived from its text:
- `z`: the zone of the whole session (or its warm-up and cool-down): `easy` (Z1), `z2`, `im` (IM pace), `hm` (half-marathon pace), `tempo`, `ss` (sweet spot, bike), `thr` (threshold), `z4` (10 km pace), `css` (swim), `race`, `test`, `str`, `rest`.
- `main`: the zone of the main set when it differs (`z: 'easy', main: 'thr'` for a run with threshold reps).
- `ind`: bike sessions only. `true` = indoor (spinner), `'opt'` = indoor or outdoor.
- `legs`: triathlon races only, `{ swim, bike, run }`.
- Every non-rest, non-strength session must have a zone that has a range for its sport, or be a `test`. `test/pace.test.mjs` enforces it.

Zones (`src/pace.js`). Three baselines, `BASELINES = { run: 345, swim: 130, bike: 29 }` (run threshold in sec/km, swim CSS in sec/100 m, bike threshold in km/h). They are conservative defaults, to be updated after the week-5 tests. Each zone is a range given as offsets from its baseline, so changing a baseline moves every zone, every card and every `.ics` line:

| Zone | Run (/km) | Swim (/100 m) | Bike (km/h) |
|---|---|---|---|
| `easy` / `z2` | T+60…+90 (6:45–7:15) | C+10…+20 (ca. 2:25) | easy: under B−7 (22), z2: B−7…−4 (22–25) |
| `im` | T+35…+50 (6:20–6:35) | C+5…+10 (2:15–2:20) | B−5…−3 (24–26) |
| `hm` | T+10…+20 (5:55–6:05) | none | none |
| `tempo` | T+5…+15 (5:50–6:00) | none | none |
| `ss` | none | none | B−3…−1.5 (26–27.5) |
| `thr` / `css` | T−5…+5 (5:40–5:50) | C−2…+2 (2:08–2:12) | B−1…+1 (28–30) |
| `z4` | T−20…−10 (5:25–5:35) | none | none |

(T, C and B are the three baselines. Bike bounds round to 0.5 km/h.)

Display. `paceText(session)` gives `Anbefalet: 6:45–7:15 /km · hovedsæt 5:40–5:50 /km`. It replaces the old intensity fact in the sheet, and the same text is a line in every `.ics` description. `paceCompact` is the short form on the cards. Bike is shown in km/h only. A bike session with `ind: true` says `efter følelse og kadence` instead, because km/h means nothing on a spinner; with `ind: 'opt'` both are shown. Tests say `hård og jævn indsats, notér resultatet`, and strength and rest have no pace. The zone guide in `app.html` is generated from the same table (`guideRows`). `intensity()` and `tss()` stay in `plan.js` for the PMC chart, but the intensity factor is no longer displayed.

Actual pace. The log form has `Faktisk pace`: run `mm:ss` per km, swim `mm:ss` per 100 m, bike km/h. `parsePace` is tolerant (`5:30`, `5.30`, `5,30`, `27,5`, with or without a unit). The value is stored as `pace` (§3.1). The sheet and the card show it and compare it with the recommended range: `hurtigere end anbefalet`, `i zonen` or `langsommere end anbefalet` (for run and swim a lower number is faster). A session with a main set is compared with the main-set zone, since a typed pace is read as the main-set pace. Strength, rest, indoor bike and triathlon races have no pace field. The compliance colour of a card is still decided by duration only. An entry without `pace` but with `dist` and `min` (Strava, [strava.md](strava.md) §5) gets a derived average shown as `⌀ 6:03 /km`. It is never stored, and it is not compared when the session has a main set, because the average includes warm-up and cool-down.

### 3.9 Nutrition: day types, macros and fueling

Source. Every number comes from [research/ernaering-kilder.md](research/ernaering-kilder.md) (the report). Where the report marks a rule as a practical proposal, the module comment and the guide say so. The report counts per kg of body weight, and so does the module. With a known weight it shows grams, otherwise g/kg.

Day type (`dayType(sessions, date)`), from the planned minutes of the day:

| Type | Rule | Carbohydrate (g/kg/day) |
|---|---|---|
| `hvile` | 0 min | 3 to 5 |
| `let` | up to 60 min | 5 to 7 |
| `moderat` | 61–180 min | 6 to 10 |
| `lang` | over 180 min | 8 to 12 |
| `opladning` | the 2 days before IRONMAN Copenhagen (22 Aug 2027) and the day before Køge Jernmand (13 Jun 2027); wins over minutes | 10 to 12 |
| `race` | the two race days | none (the race deficit cannot be closed) |

Protein is 1.6 g/kg/day (range 1.2–2.0) in 4–5 meals of about 0.3 g/kg. Energy is an **estimate**: `weight × 37 kcal + training minutes × (weight × 8.5 kcal/h) / 60`, shown as a ±5 % range rounded to 50 kcal. The two constants are practical estimates built on report §1.2 (NNR 2023 PAL 1.6 is about 37.5 kcal/kg/day; the net MET cost of cycling and running is about 7–9 kcal/kg/h), not measured values, and ±5 % is a display band, not an error margin. `opladning` and `race` days show no kcal figure and are left out of the weekly average.

Fueling per session (`sessionFueling(day, idx, { next, weight })`), from duration, zone (`isHardSession`: the zone or main-set zone is an intensity zone, see §3.8) and whether the title says `(morgen)`:

| | Rule |
|---|---|
| Before | easy morning up to 60 min: fasted or 30 g carbohydrate. Morning intervals (or an easy morning over 60 min, up to 90): 30–50 g 30–60 min before. Long (over 60 min) or hard: meal 2–3 h before with 1–2 g/kg, little fat and fibre. Key sessions (tests, races, over 150 min, hard 90 min or more): optional caffeine about 3 mg/kg about 60 min before. A brick run follows straight after the bike. Races: breakfast 1–4 g/kg 1–4 h before, 5–10 mL/kg fluid 2–4 h before |
| During | under 75 min: water only. 75–150 min: 30–60 g/h. Over 150 min: 60–90 g/h (glucose + fructose). From 75 min a fluid note (neither lose over 2 % nor gain weight), and over 120 min 500–700 mg sodium per litre. IRONMAN and Køge: bike 60–90 g/h, run 30–90 g/h |
| After | normal: meal within 1–2 h with 20–40 g protein + carbohydrate. If another demanding session follows (later the same day, or a hard `(morgen)` session first thing the next day) and the day itself is demanding: 1–1.2 g/kg/h carbohydrate for 4 h + 0.3 g/kg protein. Fluid 1.25–1.5 L per kg lost from 75 min |

Back-to-back is an approximation of "under 8 h to the next demanding session" (ACSM) from the plan alone, because start times are private and not in the repo. In the sheet the block shows the day and the three lines. Chips show `Moderat · 3.600–3.950 kcal · 420–700 g KH` (without weight `Moderat · 6–10 g/kg KH`).

Weight (`parseWeight`, `readWeight`, `saveWeight`). 35–200 kg, comma or point. It is stored only in `localStorage` under `im2027-weight-kg` (`WEIGHT_KEY`), set from the settings dialog on both targets, and never given to a Store. `app.js` reads it at start and on a `storage` event from another tab, and redraws chips, weekly sums and the guide when it changes. A broken stored value counts as no weight.

Guide. `kostGuide(weight)` returns the guide as data (day table, before/during/after, race week, supplements, warning signs, weekly weigh-in, sources) and `app.js` draws it in a collapsible section. The link to the report lives in JS, not in `app.html`, because the site document may name no external address but `api.github.com` (`test/site.test.mjs`). The guide carries the line `Generel vejledning, ikke individuel lægefaglig rådgivning.`

`.ics`. `energyLine(session)` gives `Energi undervejs: 30–60 g kulhydrat/t` or `60–90 g/t (glukose + fruktose)` for sessions over 75 minutes (races: bike and run), and nothing otherwise.

---

## 4. GistStore auth and security

### 4.1 Token

- One fine-grained PAT per device, for example "IM2027 iPhone" or "IM2027 Mac".
- Resource owner: EmilBerntsen-ui.
- Expiration: custom date 2027-09-30, which covers the race plus margin.
- Repository access: "Public repositories". This is read-only and the minimum GitHub offers.
- Account permissions: **Gists → Read and write**, nothing else.
- Blast radius: read and write on the account's gists.

The token is stored as `localStorage['im2027-gist'] = {"token":"github_pat_…","gistId":"…","login":"EmilBerntsen-ui","connectedAt":"…"}`:
- Never in cookies, Cache Storage or a URL, and never logged.
- The UI shows only `github_pat_…` plus the last 4 characters.
- sessionStorage was rejected because the token must survive a PWA relaunch.
- An IndexedDB or WebCrypto wrapper was rejected: same-origin script could still use the key, so it adds no protection.

### 4.2 Threat model (public `github.io` origin)

| Threat | Mitigation |
|---|---|
| XSS on the site steals the token | No third-party script, style or font. Meta CSP (below). All remote data passes through `normalizeEntry`. Rendering uses only `esc()` or `textContent`, the existing pattern. No `eval`, no inline handlers |
| **Shared origin**: every Pages project site of the account lives on `https://emilberntsen-ui.github.io` and shares its localStorage | Rule: no other Pages site on this account (there are none today) unless it is first-party with no third-party JS. Otherwise move to a custom domain |
| **A secret gist is unlisted, not private**: anyone with the gist URL or ID can read notes and RPE | The gist ID lives only in device localStorage and the `GIST_ID` Actions secret. It never appears in the repo, the page, the `.ics` or logs. Settings shows it only locally |
| The calendar path leaks | `CAL_TOKEN` exists only as an Actions secret. It is never in the client bundle, `sw.js` or logs. CI has a leak-guard step, and the Pages artifact is deleted after deploy (§5). Rotation: change the secret and rerun; the old path disappears with the next deploy |
| Body weight reaches the gist, the repo, an export or the `.ics` | The weight lives only in `localStorage` (`im2027-weight-kg`), outside every Store. `test/settings.test.mjs` reads everything sent to and stored in the fake gist and finds no trace of it. No example, test or doc names a real person's body data (tests use 70 kg) |
| Notes or RPE reach the repo or the `.ics` | The ICS builder reads only `done` and `min` (a test asserts this). Progress JSON exists only in `$RUNNER_TEMP`. `.gitignore` covers export files |
| Clickjacking the token form | Meta CSP cannot set `frame-ancestors`, so settings hides the token field when `window.top !== window.self` |
| A device is lost | Revoke that device's PAT at github.com/settings/personal-access-tokens. Other devices keep working |
| Search engines index the personal schedule | `<meta name="robots" content="noindex">` |

CSP for the site target. It is the first element in `<head>` after `<meta charset>`:

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' https://api.github.com; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'">
```

- `'unsafe-inline'` applies to styles only. The inline `<style>` and the existing `style="--c:…"` and `style="flex:…"` attributes need it, and CSS injection has low impact.
- Script stays at `'self'`: no inline script, no eval.
- Meta CSP ignores `frame-ancestors` and `report-uri`. Accepted.

Fonts are self-hosted on the site. The latin subset covers æøå. Files: Barlow 400/500/600, Barlow Condensed 600/700/800 and IBM Plex Mono 500, as `assets/fonts/{family}-{weight}.woff2` plus `OFL.txt`. About 150 KB in total, all precached. The artifact keeps Google Fonts.

### 4.3 "Forbind GitHub" UX (`settings.js`, site only)

1. The status button opens the "Synkronisering" dialog, built by `settings.js`; it reuses the `.sheet` styles. When not connected, it shows:
   - a three-line explainer;
   - a link to `https://github.com/settings/personal-access-tokens/new`;
   - the exact settings from §4.1;
   - a token field (`type=password autocomplete=off autocapitalize=off spellcheck=false`);
   - a **Forbind** button.
2. `GistStore.connect(token)` runs these steps:
   1. `GET /user` gives the login. A 401 shows "Tokenet blev afvist".
   2. `GET /gists?per_page=100` (paginated via `Link`) looks for a gist whose `description === GIST_DESCRIPTION` and that contains `files[META_FILE]`. If several match, the newest `updated_at` wins. A 403 shows "Tokenet mangler Gists: Read and write".
   3. If none matches: `POST /gists {description, public:false, files:{[META_FILE]:{content}}}`.
   4. Save the config, mark every local week that has entries as dirty, and reload. The first flush merges in both directions.
   5. An "Avanceret: gist-id" field allows manual entry if listing fails.
3. The connected view shows:
   - the login, last sync, pending count and the gist ID (needed for the `GIST_ID` secret);
   - **Synk nu**, **Eksportér** and **Importér**;
   - **Afbryd forbindelse**, which removes `im2027-gist` and `im2027-gist-sync`. A checkbox "Slet også data på denne enhed" also removes `im2027-progress-v2`. Weeks that are still pending exist only on this device, so when the box is ticked and `pending > 0`, the dialog warns inline and the confirm text says that they are lost for good. The text only says that the data on GitHub stays when nothing is pending;
   - while the state is `auth`, the token field from the connect view sits above this, for pasting a new token without disconnecting;
   - a link "Tilbagekald token på GitHub" to `https://github.com/settings/personal-access-tokens`;
   - a footer with `Version <BUILD.version>`.

API headers on every call: `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`.

---

## 5. CI/CD

### 5.1 `.github/workflows/pages.yml` (outline)

```yaml
name: pages
on:
  push: { branches: [main] }
  schedule:
    - cron: '17 2 * * *'                # 04:17 CEST / 03:17 CET; :17 avoids top-of-hour cron delays
    - cron: '17 20 * * *'               # 22:17 CEST / 21:17 CET: today's Strava sessions the same evening
  workflow_dispatch:
    inputs:
      strava_days: { description: 'Strava: days back (1–30)', required: false, default: '3' }
permissions: { contents: read }
concurrency: { group: pages, cancel-in-progress: false }
env: { TZ: Europe/Copenhagen }
jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      strava: '${{ steps.strava.outputs.status || steps.strava.outcome }}'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: node --test
      - name: Strava sync                 # strava.md §7: skipped with a ::notice:: when the secrets are absent; never fails the deploy
        id: strava
        continue-on-error: true
        timeout-minutes: 3
        env:
          STRAVA_CLIENT_ID: '${{ secrets.STRAVA_CLIENT_ID }}'
          STRAVA_CLIENT_SECRET: '${{ secrets.STRAVA_CLIENT_SECRET }}'
          STRAVA_REFRESH_TOKEN: '${{ secrets.STRAVA_REFRESH_TOKEN }}'
          GIST_ID: '${{ secrets.GIST_ID }}'
          GIST_WRITE_TOKEN: '${{ secrets.GIST_WRITE_TOKEN }}'
          STRAVA_LOOKBACK_DAYS: "${{ inputs.strava_days || '3' }}"
        run: node scripts/strava-sync.mjs
      - name: Fetch progress (secret gist)
        env: { GIST_ID: '${{ secrets.GIST_ID }}', GIST_READ_TOKEN: '${{ secrets.GIST_READ_TOKEN }}' }
        run: node scripts/fetch-progress.mjs --out "$RUNNER_TEMP/progress.json"
      - name: Build site
        env: { CAL_TOKEN: '${{ secrets.CAL_TOKEN }}', PROGRESS_FILE: '${{ runner.temp }}/progress.json' }
        run: node build.mjs --target=site
      - name: Leak guard
        env: { CAL_TOKEN: '${{ secrets.CAL_TOKEN }}', GIST_ID: '${{ secrets.GIST_ID }}' }
        run: |
          for s in "$CAL_TOKEN" "$GIST_ID"; do
            [ -n "$s" ] || continue
            if grep -rqF -- "$s" dist/site --exclude-dir=cal; then echo "::error::secret outside cal/"; exit 1; fi
          done
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist/site, retention-days: 1 }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions: { pages: write, id-token: write }
    environment: { name: github-pages, url: '${{ steps.d.outputs.page_url }}' }
    steps:
      - id: d
        uses: actions/deploy-pages@v4
  cleanup:
    needs: [build, deploy]
    if: always()
    runs-on: ubuntu-latest
    permissions: { actions: write }
    env: { GH_TOKEN: '${{ github.token }}' }
    steps:
      - name: Delete Pages artifact (public-repo artifacts are downloadable; it contains cal/<CAL_TOKEN>)
        run: gh api "repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/artifacts" --jq '.artifacts[].id' | xargs -r -I{} gh api -X DELETE "repos/$GITHUB_REPOSITORY/actions/artifacts/{}"
      - name: Keep cron alive (public repos disable schedules after 60 days without activity)
        if: github.event_name == 'schedule'
        run: gh api -X PUT "repos/$GITHUB_REPOSITORY/actions/workflows/pages.yml/enable"
      - name: Strava alert                # the site is already deployed here; a failing run makes GitHub send an e-mail
        if: contains(fromJSON('["auth","error","failure"]'), needs.build.outputs.strava)
        env: { STRAVA_STATUS: '${{ needs.build.outputs.strava }}' }
        run: |
          echo "::error::Strava sync failed ($STRAVA_STATUS). Run node scripts/strava-auth.mjs for 'auth'; see docs/guides/strava.md"
          exit 1
```

- There is no `pull_request` trigger, so secrets are never exposed to fork code.
- Pin each action to its current major version when implementing. The versions above are the minimum.

### 5.2 Secrets and one-time setup

| Secret | Value | Used by |
|---|---|---|
| `GIST_ID` | id of the progress gist (shown in the settings dialog). Needed for ✅ marks together with `GIST_READ_TOKEN` | fetch-progress, leak guard, Strava sync |
| `GIST_READ_TOKEN` | Fine-grained PAT with no extra permissions. **Required for ✅ marks**: without it fetch-progress skips the fetch and the calendar is built without marks (see §5.3). Secret gists are readable by id, so the token adds no access, it only lifts the rate limit from 60/h to 5,000/h. If 2c finds that it gets a 404, add Gists permission | fetch-progress |
| `CAL_TOKEN` | `openssl rand -hex 20` (40 chars), also kept in the user's password manager | build, leak guard |
| `STRAVA_CLIENT_ID` | numeric id of the personal Strava API app | Strava sync only |
| `STRAVA_CLIENT_SECRET` | the app's secret; also the key material for `_strava.json` | Strava sync only |
| `STRAVA_REFRESH_TOKEN` | seed refresh token from `scripts/strava-auth.mjs` (it sets all three `STRAVA_*` secrets) | Strava sync only |
| `GIST_WRITE_TOKEN` | fine-grained PAT "IM2027 CI write": Gists read and write, expiry 2027-09-30, separate from the device tokens | Strava sync only |
| `GITHUB_TOKEN` | automatic | cleanup |

One-time setup:
- Set the secrets with `gh secret set CAL_TOKEN` (and the same for the others).
- The progress gist can be created before the app is connected: `GITHUB_TOKEN=… node scripts/create-gist.mjs | gh secret set GIST_ID`. The script uses `GistStore.findOrCreate`, prints only the gist id, and refuses to create a second gist: if one with the marker file exists, it prints that id instead.
- Strava is optional and set up with the checklist in [guides/strava.md](guides/strava.md). Without its four secrets the sync step is skipped with a notice and everything else works as before.
- Set the Pages source to Actions: `gh api -X POST repos/EmilBerntsen-ui/ironman-2027/pages -f build_type=workflow`.

### 5.3 `scripts/fetch-progress.mjs`

- Env vars:
  - `GIST_ID`: if empty, print `::warning::`, write no file and exit 0. The build then gets `progress = null` and adds no marks at all.
  - `GIST_READ_TOKEN`: **required for ✅ marks**. If `GIST_ID` is set but the token is empty, print a `::warning::` annotation that explains that the ✅ marks are skipped and that the read token is required. Write no file (a stale one is removed) and exit 0. The deploy never fails because of a missing token.
  - `GIST_API`: default `https://api.github.com`; tests point it at a fake.
- Makes 3 attempts, waiting 1 s and then 4 s. If all fail it exits 1: the deploy is skipped and yesterday's calendar stays, which is better than wiping the ✅ marks.
- Writes `Progress` JSON built through `parseWeekFile`. It prints only counts, never content.

### 5.4 ICS completion marks

The signature becomes `buildIcs(weeks, now = new Date(), { progress = null, schedule = null } = {})`. Marks depend only on `progress`, never on today's date.

| Session | SUMMARY | First DESCRIPTION line |
|---|---|---|
| `isDone` | `✅ 🏃 Løbeintervaller (45 min)` | `Gennemført` or `Gennemført · 42 min` |
| anything else (not done, or no progress data) | unchanged | unchanged |

There is deliberately no mark for missed sessions: the calendar only ever shows what was done.

- `UID`, `DTSTART` and `DURATION` stay unchanged, so clients update events in place.
- Only `done` and `min` are read from `progress`.
- Every description also has a line `Anbefalet: …` (recommended pace, §3.8) before the week line. It comes from the plan alone, never from `progress`, so it is the same with and without marks. Strength sessions have none.
- Sessions over 75 minutes have one more line, `Energi undervejs: …` (§3.9), right after `Anbefalet`. It is g/h only: never weight, kcal or g/kg, so the calendar carries no body data.
- With `progress = null` the output is byte-identical to today's, and `test/plan.test.mjs` stays green.
- Add `X-PUBLISHED-TTL:PT6H` and change `REFRESH-INTERVAL` to `PT6H`.

### 5.5 Pages caching and calendar refresh

Pages sends `Cache-Control: max-age=600` on every file, and this cannot be changed. The design handles it like this:
- The SW precaches with `cache:'reload'`.
- The SW is registered with `updateViaCache:'none'`.
- The JS filename is content-hashed.
- The `.ics` may be up to 10 min stale, which does not matter against a nightly build. Pages serves `.ics` as `text/calendar`.

Subscription URL: `webcal://emilberntsen-ui.github.io/ironman-2027/cal/<CAL_TOKEN>/ironman-2027.ics`. Use `https://` for Google.

How clients refresh:
- **iPhone**: subscribe under the iCloud account. Apple's servers then fetch the feed and sync it to the Mac too.
- **macOS Calendar**: has an auto-refresh setting per subscription.
- **Google**: polls every 8–24 h, ignores TTL hints and has no manual refresh. ✅ marks can lag by up to about 1.5 days.

The marks reflect the state at 04:17. Run `gh workflow run pages.yml` to rebuild immediately.

---

## 6. PWA

### 6.1 Manifest (`assets/manifest.webmanifest`, copied to `dist/site/manifest.webmanifest`)

```json
{
  "name": "Ironman 2027 · træningsplan",
  "short_name": "IM 2027",
  "description": "43 ugers træningsplan til IRONMAN Copenhagen 22. august 2027",
  "lang": "da",
  "dir": "ltr",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#EEF2F1",
  "theme_color": "#EEF2F1",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" },
    { "src": "icons/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
  ]
}
```

`shell.site.html` head contains, in order:
1. `<meta charset="utf-8">`
2. the CSP
3. `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
4. `<title>Ironman 2027</title>` and robots `noindex`
5. `theme-color` for light (`#EEF2F1`) and dark (`#0E1413`), each with a `media` query
6. `<link rel="manifest" href="manifest.webmanifest">`, `<link rel="icon" href="icons/icon.svg" type="image/svg+xml">` and `<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">`
7. `apple-mobile-web-app-title` set to "IM 2027", and `apple-mobile-web-app-status-bar-style` set to `default`
8. the inline `<style>`
9. `<script src="__APP_JS__" defer>`

### 6.2 Service worker (`src/sw.js`, with `__VERSION__` and `__PRECACHE__` injected by `buildSite`)

- The cache is named `im2027-shell-<VERSION>`. `VERSION` = sha256 over the sorted (path + bytes) of all precached files, cut to 12 hex characters.
- `PRECACHE` is an explicit allowlist returned by `buildSite`, never a directory scan: `./`, `app.<sha8>.js`, `manifest.webmanifest`, `icons/*`, `fonts/*`. It never includes `cal/`.
- `install`: `cache.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })))`. No `skipWaiting`.
- `activate`: delete every cache whose name starts with `im2027-` and is not the current one, then `clients.claim()`.
- `fetch`: pass through (no `respondWith`) unless the request is GET, same-origin, inside the scope, and its path does not contain `/cal/`. Navigations get the cached `./` (`ignoreSearch:true`), with the network as fallback. Everything else is a cache match with network fallback. There is no runtime caching, and `api.github.com` is never touched.
- `message {type:'SKIP_WAITING'}` calls `self.skipWaiting()`.
- **Why cache-first and not "plan network-first"**:
  - The plan is compiled into `app.<hash>.js`, so a plan update simply arrives as an SW update.
  - Index and JS always come from the same cache, so they can never mismatch, and offline always works.
  - The `.ics` is not a browser resource (calendar apps fetch it directly), so the SW ignores it.

### 6.3 `src/pwa.js`

- `navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' })`.
- `reg.update()` runs on `visibilitychange` to visible, throttled to once per 5 min. iOS standalone apps resume without a navigation, so this check is needed.
- **Update prompt**: when `reg.waiting` exists and the page already has a controller, show the toast "Ny version af planen er klar" with an [Opdatér] button.
  - The button posts `SKIP_WAITING`. On `controllerchange`, the page reloads once.
  - The page never reloads by itself.
  - While any `dialog[open]` exists (for example the log sheet), the toast waits.
- Call `navigator.storage?.persist?.()`.
- **iOS install hint**: on iOS Safari, when `!navigator.standalone` and the hint has not been dismissed (`im2027-install-hint`), show the banner "Tryk Del → Føj til hjemmeskærm".

### 6.4 iOS quirks the design accounts for

- The home-screen app has storage separate from Safari. Connect GitHub inside the installed app; the guides say so.
- In Safari tabs, script-writable storage can be wiped after 7 days without use. Home-screen apps are exempt. The gist is the source of truth, so the worst case is a reconnect.
- There is no `beforeinstallprompt` and no Background Sync. Pending writes flush on the next open or visibility change.
- In the EU (Denmark), standalone web apps work on iOS ≥ 17.4, after Apple reverted their removal. `<dialog>` needs iOS ≥ 15.4.
- The status bar style is `default`, not `black-translucent`, so no top safe-area work is needed. The existing CSS already handles the left, right and bottom insets.

---

## 7. Phase 2 work breakdown

### 7.0 Step 2.0: scaffold

This step runs sequentially before the fan-out. It is done by the orchestrator or one Sonnet agent, and it is small. It lands every shared contract and creates every file as a stub, so the parallel agents never touch the same file.

**Owns:**
- `build.mjs`, `build/bundle.mjs` and `build/artifact.mjs` (complete);
- stub `build/site.mjs` and `build/calendar.mjs`;
- `src/progress.js` (complete), `test/progress.test.mjs` and `test/build.test.mjs`;
- `src/shell.artifact.html`, and `src/app.html` (moving the head out only);
- `package.json` (scripts `build`, `build:site`, `build:artifact`, `test`) and `.gitignore`;
- stubs with a `// owned by 2x` header and the final export names: `src/store/{local,artifact-db,gist}.js`, `src/settings.{js,css}`, `src/pwa.{js,css}`, `src/fonts.css`, `src/shell.site.html`, `src/sw.js`;
- removes `dist/index.html`, which moves to `dist/artifact/`.

**Acceptance:**
- `node --test` is green: the 7 existing tests plus progress tests covering:
  - v1 conversion;
  - LWW and tie-breaks;
  - a tombstone beating an older done entry;
  - commutativity, associativity and idempotence over a few hundred random merges;
  - `stampEntry` with a skewed clock;
  - each `parseAny` input shape;
  - `serializeWeek` stability.
- `node build.mjs --target=artifact && ! grep -qiE '<!doctype|<html|<head|<body' dist/artifact/index.html`.
- `test/build.test.mjs` parses the inline script with `new vm.Script()` and checks that two builds are identical.
- The artifact page in a browser behaves as before: check a session, reload, and it is still checked.

The following run in parallel, each in its own worktree or branch.

### 2a: PWA target (Sonnet)

**Owns:** `build/site.mjs`, `src/shell.site.html`, `src/sw.js`, `src/pwa.js`, `src/pwa.css`, `src/fonts.css`, `assets/fonts/**`, `test/site.test.mjs`.

**Relies on:**
- `TARGETS`, `bundleJs`, `bundleCss` and `render` (2.0);
- the `BUILD` global;
- the icon and manifest file names (icons agent, §7 Icons);
- the CSP string in §4.2 and the SW rules in §6.2.

**Acceptance:**
- `node build.mjs --target=site` produces `dist/site/{index.html, app.<8hex>.js, sw.js, manifest.webmanifest, icons/*, fonts/*}`.
- `node --test test/site.test.mjs` checks:
  - `index.html` starts with `<!doctype html>` and contains the exact CSP string;
  - there are no `fonts.googleapis`, `gstatic` or `http:` URLs, and no inline `<script>` without `src`;
  - `sw.js` `PRECACHE` equals the files on disk (excluding `cal/`) and does not contain `cal/`;
  - two consecutive builds are byte-identical.
- `CAL_TOKEN=$(openssl rand -hex 20) node build.mjs --target=site && ! grep -rqF "$CAL_TOKEN" dist/site --exclude-dir=cal`.
- In a browser (Chrome DevTools MCP or Playwright) against `python3 -m http.server -d dist/site 8080`:
  - no console errors and no CSP violations, both on load and when opening a workout sheet;
  - `navigator.serviceWorker.ready` resolves;
  - offline emulation plus reload still renders the grid;
  - the Manifest panel shows no installability errors;
  - after a rebuild with a changed plan string, a reload shows the toast, and Opdatér shows the new text.

### 2b: Gist sync and settings UI (Sonnet; critical path)

**Owns:** `src/app.js`, `src/app.html`, `src/store/local.js`, `src/store/artifact-db.js`, `src/store/gist.js`, `src/settings.js`, `src/settings.css`, `test/store-local.test.mjs`, `test/store-artifact.test.mjs`, `test/store-gist.test.mjs`, `test/fake-gist.mjs`.

**Relies on:**
- the `progress.js` API (2.0);
- the bundler rules, including these export names, which must not collide: `LocalStore`, `deviceId`, `ArtifactDbStore`, `GistStore`, `mountSettings`;
- CSP `connect-src` allows only `api.github.com`;
- the existing `.sheet` dialog styles.

Internal order: LocalStore and the `app.js` refactor first, then ArtifactDbStore, then GistStore, then settings.

**Acceptance:**
- `node --test test/store-*.test.mjs` runs against `test/fake-gist.mjs`, an in-memory Gist API with GET/ETag/304, file-granular PATCH, POST, list, and injectable latency and failures. The tests cover:
  - two devices, different sessions in the same week, with pull and PATCH interleaved so the lost update happens: within ≤ 2 sync cycles both snapshots are equal and contain both edits;
  - an un-check on A reaches B (tombstone);
  - `fetch` rejecting gives state `offline` with `pending > 0`; once restored it flushes and `pending` returns to 0;
  - a 401 gives state `auth` and no further requests;
  - a 403 with `x-ratelimit-remaining: 0` sends nothing before `x-ratelimit-reset`;
  - `connect` finds an existing marker gist, creates one when none exists, and ignores gists without `META_FILE`;
  - `LocalStore` migrates the v1 key, and `importProgress` accepts a v1 blob and a v2 export;
  - `ArtifactDbStore` with a fake `claude.use('db')` reads v1 docs, writes v2 docs, and a snapshot never drops unsynced local edits.
- `node build.mjs` (both targets) and `node --test` are green.
- `! grep -q api.github.com dist/artifact/index.html` and `! grep -q "claude.use" dist/site/app.*.js`.
- Manual end-to-end, needing a real PAT from the user:
  - two browsers connected: a check in A appears in B within 60 s or on focus;
  - an edit made in airplane mode syncs after reconnecting;
  - the note `<img src=x onerror=alert(1)>` renders as plain text.

### 2c: CI/CD and ICS marks (Sonnet)

**Owns:** `.github/workflows/pages.yml`, `build/calendar.mjs`, `src/ics.js`, `scripts/fetch-progress.mjs`, `test/ics-marks.test.mjs`, `test/fetch-progress.test.mjs`, `test/fixtures/progress.v2.json` (synthetic).

**Relies on:**
- `parseAny`, `parseWeekFile`, `isDone` and `META_FILE` (2.0);
- the `writeCalendar` call site in `build.mjs` (2.0);
- 2a's site build, but only for the live deploy.

**Acceptance:**
- `node --test` is green. The ICS-mark tests check:
  - done gives `✅` and "Gennemført · 42 min";
  - sessions that are absent or tombstoned, past or future, are unchanged (no mark for missed sessions);
  - the fixture note `HEMMELIG-NOTE-XYZ` and its RPE never appear in the output;
  - the UID set is unchanged;
  - `buildIcs(weeks, now)` is unchanged against the current output.
- `fetch-progress` against a `node:http` fake (`GIST_API=http://127.0.0.1:<port>`) writes merged progress, retries and then exits 1 on 500s, and with an empty `GIST_ID` writes no file and prints a warning.
- `CAL_TOKEN=$(openssl rand -hex 20) PROGRESS_FILE=test/fixtures/progress.v2.json node build.mjs --target=site && test -s "dist/site/cal/$CAL_TOKEN/ironman-2027.ics"`.
- If `actionlint` is installed, `actionlint .github/workflows/pages.yml` is clean.
- Live, after the secrets are set and everything is merged:
  - `gh workflow run pages.yml && gh run watch --exit-status`;
  - `curl -sI "https://emilberntsen-ui.github.io/ironman-2027/cal/$CAL_TOKEN/ironman-2027.ics" | grep -i 'content-type: text/calendar'`;
  - `gh api repos/EmilBerntsen-ui/ironman-2027/actions/runs/<id>/artifacts --jq .total_count` prints `0`;
  - `curl -s https://emilberntsen-ui.github.io/ironman-2027/sw.js | grep -c 'cal/'` prints `0`.

### Icons and manifest (Haiku)

**Owns:** `scripts/make-icons.mjs`, `assets/icons/{icon.svg, icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png}`, `assets/manifest.webmanifest`, `test/manifest.test.mjs`.

**Spec:**
- A zero-dependency Node script (`node:zlib` plus its own CRC32) writes opaque PNGs.
- Artwork: a full-bleed `#14201E` square with three horizontal bars, for swim (`#5BB2E6`), bike (`#93C35F`) and run (`#F08A58`).
  - Each bar is 12 % of the side tall and 56 % wide, centred horizontally, with 8 % gaps.
  - The block of bars is centred vertically, and the bars have square ends.
  - Everything stays inside the 80 % maskable safe circle, so the maskable icon uses the same art.
- Sizes: 192, 512, maskable 512, and apple-touch 180.
- `icon.svg` uses the same geometry.
- The manifest content is exactly §6.1.

**Acceptance:**
- Running `node scripts/make-icons.mjs` twice gives identical `shasum assets/icons/*`.
- `node --test test/manifest.test.mjs` checks the manifest fields, that every icon exists, that the PNG IHDR width and height match `sizes`, and that no pixel has alpha < 255.

### Danish guides (Haiku)

**Owns:** `docs/guides/kalender-iphone.md`, `docs/guides/kalender-google.md`, `docs/guides/installer-app.md`, `docs/guides/forbind-github.md`, `docs/guides/opsaetning.md`, `README.md`.

**Content, all taken from this document:**
- The URL pattern, using the placeholders `<CAL_TOKEN>` and `<GIST_ID>` only.
- **iPhone**: either tap a `webcal://` link, or go to Indstillinger → Apps → Kalender → Kalenderkonti → Tilføj konto → Andet → Tilføj abonnementskalender, saved under iCloud. Verify the menu path on a device.
- **Google**: Andre kalendere → + → Fra webadresse (on a computer only), refreshes every 8–24 h.
- **PAT**: the steps exactly as in §4.1. Use one token per device, and connect inside the installed app.
- **Installing the app**: on iPhone, Android and desktop.
- **One-time setup**:
  - `openssl rand -hex 20`;
  - `gh secret set …`;
  - enable Pages;
  - the first connect creates the gist; copy the gist ID from settings into `gh secret set GIST_ID`;
  - migrate artifact data with Eksportér/Importér.
- **README**: the new build commands, the fact that `dist/artifact/index.html` is the file published to the Artifact, and links to the guides.

**Acceptance:**
- Every `node` and `gh` command matches the final scripts.
- All relative links resolve: `for f in $(grep -oh '](docs/[^)#]*' README.md docs/guides/*.md | cut -c3-); do test -f "$f" || echo "MISSING $f"; done`.
- `grep -rE 'github_pat_[A-Za-z0-9]|[0-9a-f]{32}' README.md docs/guides` finds nothing.
- One Danish proofreading pass.

### Merge order

**2.0, then icons, 2a, 2b, 2c, and the guides last.**

- 2a's site test needs the icons.
- 2c's live deploy needs 2a and 2b.
- The guides describe the final behaviour.

After each merge, `node --test && node build.mjs` must be green on `main`.

---

## 8. Risks and open questions

**Risks**

1. **Session keys are positional** (`<day>-<idx>`). Moving sessions in `plan.js`, for example when the spring timetable is known, would attach past logs to the wrong sessions. Rule: never edit past weeks. `sig` is recorded so that a later migration script can detect mismatches.
2. **A secret gist is only unlisted.** Anyone with the gist URL can read notes and RPE. Mitigated by never exposing the ID; see Q2.
3. **Shared `emilberntsen-ui.github.io` origin.** A future Pages site on this account with third-party JS could read the PAT.
4. **Cron auto-disable** after 60 days of repo inactivity. The keepalive step must be verified to reset the timer. Fallback: an occasional commit.
5. **`GIST_READ_TOKEN` with zero permissions** relies on secret gists being readable by id. 2c verifies this; the fallback is Gists permission.
6. **Deleting the Pages artifact after deploy** must not affect the live site. 2c verifies this on the first run.
7. **PAT expiry on 2027-09-30.** An expired token shows "Forbind GitHub igen", and unsynced edits stay queued.
8. **Residual lost update.** It needs two devices writing the same week in the same second, and the overwritten device then losing its storage before its next sync. Gist revisions are the backstop.
9. **Public exposure.** The repo and site expose the training routines and the weekly structure. The school, the employer and all class, work and session clock times are deliberately kept out of the repo and the site: start times live only in the gitignored `cal-schedule.local.json` and the `CAL_SCHEDULE` secret, and the CI leak guard fails the build if the private words appear outside `cal/`. This was already accepted with the public repo; see Q3.

**Open questions for the user**

- **Q1** (decided): missed past sessions get no mark in the calendar. Only `✅` for done.
- **Q2**: Is an unlisted secret gist acceptable for notes and RPE? The alternative is client-side encryption of `note` and `rpe` with a passphrase entered once per device. That would also hide them from CI, which never needs them.
- **Q3**: Is a public repo and public site showing the training schedule (without school, employer or clock times) acceptable? The private alternatives are Pages on GitHub Pro, or a private repo plus another static host.
- **Q4**: Confirm the repo name `ironman-2027`. It sets the URL `emilberntsen-ui.github.io/ironman-2027/`.
