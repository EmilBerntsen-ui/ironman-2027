# Ironman 2027: Strava import (phase 6)

Status: design, 2026-10-22; implemented 2026-10-22 (see §13 for deviations). Builds on `docs/architecture.md` (§3 data model, §3.7 hooks, §5 CI/CD). Deviations need a note in the PR.

Goal: TrainingPeaks-style auto-compliance. The GitHub Action reads the athlete's recent Strava activities, matches them to planned sessions and writes `src:"strava"` entries into the secret gist. The app (60 s gist poll) and the `.ics` (next build) then show those sessions as done, with no manual ticking.

## 0. Decisions at a glance

| Topic | Decision |
|---|---|
| Strava access | A personal Strava API app ("single player"). Scope **`activity:read`** by default; `--read-all` switches to `activity:read_all` (Q1, decided). The refresh token comes from a one-time local OAuth run: `scripts/strava-auth.mjs` on the Mac, with a `http://localhost:8721/callback` redirect. No server |
| Refresh-token rotation | The secret `STRAVA_REFRESH_TOKEN` is the seed. A rotated token is stored **AES-256-GCM-encrypted in the gist** (`_strava.json`). The key is derived from `STRAVA_CLIENT_SECRET`. There is no PAT with `secrets:write` (§2.2) |
| CI token | New `GIST_WRITE_TOKEN` (fine-grained, Gists RW), used only in the Strava step. `fetch-progress` keeps `GIST_READ_TOKEN` |
| When | The existing 04:17 cron plus a new **22:17 CEST / 21:17 CET** cron, so an evening session shows the same evening. Also runs on push and manual dispatch (`strava_days` input) |
| Window | Copenhagen dates `today−3 … today` (`STRAVA_LOOKBACK_DAYS`, 1–30). Idempotent through an activity ledger plus `extId` |
| Matching | Same Copenhagen date, same sport group. An optimal assignment per day and group minimises Σ\|Δmin\|; ties go to chronological order. A triathlon race session aggregates all of that day's swim, bike and run activities |
| Who wins | Strava only writes to a session with **no entry**, or with a tombstone **older than the activity start**. It never touches a `done:true` entry (manual or Strava). Strava entries carry `updatedAt = activity end`, so a manual tick made after the workout always wins LWW |
| Extras | Activities with no matching planned session become **extras** (`x-s<id>` keys, `source:'strava'`, `activityId`; architecture §3.10): the same Copenhagen date decides the day, an unknown sport is `other`. Those that cannot be saved (outside the plan, under 5 minutes, a race day below 25 %, an unreadable week) are only counted (`skipped`) |
| Stored per entry | `done, updatedAt, dev:"strava", at, min, src:"strava", extId, sig`, plus the new optional `dist` (m) and `hr` (bpm). Never GPS, polylines, names or locations |
| Failure | A Strava outage or rate limit gives a warning, and the deploy continues. Dead auth or a bug: the deploy still happens, then the `cleanup` job fails, so GitHub e-mails the user |

---

## 1. Strava app and one-time OAuth

### 1.1 App (user, at strava.com/settings/api)

- Name: `IM2027 Sync`. Strava forbids "Strava" in the name.
- Category: Training. Website: `https://emilberntsen-ui.github.io/ironman-2027/`.
- **Authorization Callback Domain: `localhost`**.
- Strava asks for an icon. Upload `assets/icons/icon-512.png`.
- The app shows a Client ID (numeric, not secret) and a Client Secret (secret).

### 1.2 `scripts/strava-auth.mjs` (run once on the Mac, and again after any revoke)

```
read -rs STRAVA_CLIENT_SECRET && export STRAVA_CLIENT_SECRET
STRAVA_CLIENT_ID=123456 node scripts/strava-auth.mjs [--port 8721] [--print] [--read-all]
```

1. Validate the env vars: `STRAVA_CLIENT_ID` must match `/^\d{1,12}$/`, and the secret must be non-empty. Generate `state = randomBytes(16).toString('hex')`.
2. Listen on `127.0.0.1:<port>`, and on `[::1]:<port>` if that is available. Only `GET /callback` is served; everything else gets 404. The server shuts down after 5 min or after the first valid callback.
3. Build the URL `https://www.strava.com/oauth/authorize?client_id=…&response_type=code&redirect_uri=http://localhost:<port>/callback&approval_prompt=force&scope=activity:read&state=…` (`scope=activity:read_all` with `--read-all`). Print it, and open it with `spawn('open', [url])` (an argv array, never a shell).
4. Callback checks:
   - `state` matches, compared with `timingSafeEqual`;
   - there is no `error` (`access_denied` → Danish message, exit 1);
   - `code` is present;
   - the granted `scope` (query param) contains the requested activity scope (`activity:read_all` also satisfies `activity:read`). The user can untick it on the consent page; if so, say so and exit 1.
   - Reply with a small Danish HTML page: "Færdig – du kan lukke fanen".
5. Send `POST https://www.strava.com/oauth/token` (form body: `client_id, client_secret, code, grant_type=authorization_code`). Keep only `refresh_token` and validate it against `/^[A-Za-z0-9]{20,200}$/`. Drop `access_token` and the `athlete` object at once.
6. Output:
   - By default, run `gh secret set STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` and `STRAVA_REFRESH_TOKEN` (repo `EmilBerntsen-ui/ironman-2027`). Each value goes in through **stdin**, never argv.
   - With `--print`, write only the refresh token to stdout (for piping) and every message to stderr.
   - Never write a file. Never print a token in the default mode.
   - If `gh` is missing, say so and exit 1 (the user can rerun with `--print`).
7. Exports for tests: `authorizeUrl(opts)`, `parseCallback(url, state)`, `exchangeCode({ fetchImpl, … })`, `setSecrets({ spawnImpl, values })`, and `main()` behind the usual `import.meta.url` guard.

Rerunning the script is how the user recovers from `auth` alerts. CI notices the new seed token through its fingerprint (§2.2).

---

## 2. Secrets and tokens

### 2.1 New Actions secrets

| Secret | Value | Used by |
|---|---|---|
| `STRAVA_CLIENT_ID` | numeric app id | Strava step |
| `STRAVA_CLIENT_SECRET` | app secret; also the KDF input for `_strava.json` | Strava step |
| `STRAVA_REFRESH_TOKEN` | seed refresh token from `strava-auth.mjs` | Strava step |
| `GIST_WRITE_TOKEN` | fine-grained PAT "IM2027 CI write": Account → **Gists: Read and write**, repository access "Public repositories" (read-only minimum), expiry 2027-09-30. Separate from the device PATs, so it can be revoked on its own | Strava step only |

`GIST_ID` is reused. The 5 secrets above are set **only** in the `env:` of the Strava step (a test checks this).

### 2.2 Refresh-token rotation: where the newest token lives

Strava returns a `refresh_token` on every refresh. It is usually unchanged, but once a different one has been issued the old one is dead, so a rotated token must be persisted.

| Option | For | Against |
|---|---|---|
| A. Update the `STRAVA_REFRESH_TOKEN` secret from CI (`gh secret set` with a PAT that has repo **Secrets: write**) | The token never leaves Actions secrets | A new long-lived credential in a public repo's CI that can overwrite **every** secret (`CAL_TOKEN`, `GIST_ID`, …). It is not atomic with the gist write, and a second PAT has to be managed |
| **B. Store it in the secret gist, encrypted (chosen)** | No new permission (the write token is needed anyway). The token is written in the same PATCH as the ledger. A refresh token alone is useless without `client_secret`, and the ciphertext is useless without `client_secret` as well | Ciphertext lands in gist revision history (it is harmless, and rotated tokens are dead anyway). Every device downloads the file, which `parseWeekFile` ignores |

**Mechanics:**
- The key is `HKDF-SHA256(ikm = STRAVA_CLIENT_SECRET, salt = "ironman-2027", info = "strava-rt-v1", 32 bytes)`.
- Encryption is AES-256-GCM, with a random 12-byte IV and AAD `"ironman-2027-strava-rt-v1"`. Fields are base64url.
- `base` = the first 16 hex characters of `sha256(STRAVA_REFRESH_TOKEN)`. It records which seed the stored token descends from.
- **Choosing the token:** if `state.base === fp(secret)` and decryption succeeds, use the stored token; otherwise use the secret. A re-auth changes the secret, so `base` no longer matches and the new seed wins automatically.
- **Fallback:** if the stored token gets a 400/401 and it differs from the secret, retry once with the secret.
- **Persist immediately:** when the returned `refresh_token` differs from the token that was used (or `base` changed), PATCH `_strava.json` straight away, before fetching activities, with 3 attempts. If that fails: `::error::` and status `error` (alert), because the next run may need a re-auth.
- In Actions (`GITHUB_ACTIONS=true`), run `::add-mask::` on the access token and on any new refresh token as soon as they are received.

### 2.3 `_strava.json` (in the progress gist; only CI writes it)

```json
{"format":"ironman-2027-strava","v":1,
 "rt":{"iv":"…","ct":"…","tag":"…"},"base":"3f9a…16hex",
 "seen":{"12345678901":{"d":"2026-11-24","w":"u05","k":"1-0"}}}
```

- `seen` is the activity ledger: activity id → the session it was written to.
- Entries older than `today − 30 d` are pruned when the file is written.
- The file is written **only when something changed** (a new match, a heal, rotation or pruning). An idle run makes 0 gist writes, so device ETags stay valid.
- A file that is corrupt or has the wrong `format`/`v` is treated as empty state (`seen = {}`, no stored token). It is overwritten on the next write. Log a warning.
- Existing readers already ignore it: `parseWeekFile` only accepts `u\d\d.json`. `GistStore` and `fetch-progress` stay unchanged.

---

## 3. `scripts/strava-sync.mjs` (CI)

**Inputs:**
- Env: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`, `GIST_ID`, `GIST_WRITE_TOKEN`, `STRAVA_LOOKBACK_DAYS` (default 3, integer 1–30; anything else falls back to 3 with a warning).
- Test overrides `GIST_API`, `STRAVA_API` (default `https://www.strava.com/api/v3`) and `STRAVA_OAUTH` (default `https://www.strava.com/oauth`). Each must be https, or http only for `127.0.0.1`/`localhost`, as in `fetch-progress.mjs`.
- Flag `--dry-run`: does everything except the progress PATCH. It **still persists a rotated token**, otherwise the token would be lost. Outside CI it may print per-session detail.

**Output:**
- `status=<ok|skipped|unavailable|auth|error>` goes to `$GITHUB_OUTPUT`, when that is set.
- Exit code 0 for every handled outcome. A non-zero exit means a bug only.
- A top-level `catch` writes `status=error` and exits 1.

**Steps, in this order:**
1. **Configured?**
   - None of the three `STRAVA_*` set: `::notice::Strava er ikke sat op`, status `skipped`.
   - Some set but not all, or `GIST_ID`/`GIST_WRITE_TOKEN` missing: a `::warning::` that names the missing *names*, status `skipped`.
   - `GIST_ID` must match `/^[A-Za-z0-9]{1,64}$/`.
2. **GET the gist** (with `GIST_WRITE_TOKEN`; 3 attempts, 0/1/4 s).
   - Failure: warning, status `unavailable`. **Strava is not called**, so no token can rotate without a place to save it.
   - Missing `META_FILE`: warning, status `error`.
   - Parse the `u??.json` files with `parseWeekFile` into `remote` Progress, and parse `_strava.json` into the state.
3. **Refresh**: `POST {STRAVA_OAUTH}/token` with `grant_type=refresh_token` (token chosen per §2.2).
   - 400/401: the fallback from §2.2, then status `auth` with the warning "Strava-adgangen er udløbet eller tilbagekaldt – kør `node scripts/strava-auth.mjs`".
   - 429, 5xx or a network error: 3 attempts, then status `unavailable`.
   - Persist a rotation now (§2.2).
4. **List activities**: `GET {STRAVA_API}/athlete/activities?after=<now_s − (L+2)·86400>&per_page=100&page=n`.
   - At most 3 pages; stop when a page has fewer than 100 items.
   - Never call the per-activity detail endpoints.
   - 429, 5xx or network error (after retries): status `unavailable`.
   - 401: status `auth`.
5. **Whitelist at once**: `pickActivity(raw)` (§4.1). The raw objects are never stored, logged or passed on.
6. **Match**: `matchActivities(...)` (§4.3), which returns `{ writes, ledger, stats }`.
7. **Write** if `writes` or the ledger changed: one `PATCH /gists/{id}` that contains **only** the changed `uNN.json` files plus `_strava.json`.
   - Each week file is `serializeWeek(w, mergeWeek(remote[w], ourWrites[w]))`, so the base is always the freshly fetched remote week, never a partial file.
8. **Verify**: wait 3 s, GET again, and check `mergeWeek(remote2[w], ourWrites[w]) ≡ remote2[w]` for every written week.
   - If a device's PATCH overwrote ours (lost update, architecture §3.5), merge into the fresh remote and PATCH again, at most 2 extra rounds.
   - If it still fails, warn. The ledger heal (§4.4) repairs it on the next run.
9. **Log counts only** (§6), and set status `ok`.

**Rate limits:** Strava allows per app 100 read requests per 15 min and 1,000 per day; the overall limits are 200 per 15 min and 2,000 per day. A run uses 1 token POST plus 1–3 list GETs. Two scheduled runs plus pushes come to about 10 requests a day. A 429 is never retried within the run; the next scheduled run tries again. GitHub use is 2–4 gist calls per run.

---

## 4. Matching

### 4.1 Activity whitelist (`pickActivity`)

```js
{ id: String(raw.id),                       // /^\d{1,20}$/ else drop
  group: sportGroup(raw.sport_type ?? raw.type),
  startMs: Date.parse(raw.start_date),      // UTC; start_date_local is ignored
  endMs: startMs + raw.elapsed_time * 1000,
  date: cphDate(startMs),                   // Intl 'en-CA', timeZone 'Europe/Copenhagen' → 'YYYY-MM-DD' (TZ-independent)
  min,                                      // round(sec/60), clamp 0..900: elapsed_time for swim/str, moving_time otherwise
  dist?,                                    // round(distance) m, only swim/bike/run and > 0
  hr? }                                     // round(average_heartrate), only if has_heartrate and 30..250
```

Every other field is dropped: `name`, `description`, `map`/polylines, `start_latlng`/`end_latlng`, location, `gear_id`, `device_name`, `athlete`, photos and so on.

### 4.2 Sport groups

| Strava `sport_type` | Group |
|---|---|
| `Swim` | swim |
| `Ride`, `VirtualRide`, `GravelRide`, `MountainBikeRide` | bike |
| `Run`, `TrailRun`, `VirtualRun` | run |
| `WeightTraining`, `Crossfit`, `Workout` | str |
| anything else (`EBikeRide`, `Walk`, `Hike`, `Yoga`, `Rowing`, …) | `null`: never matched to a session; saved as an extra with sport `other` |

| Planned `s.s` | Group |
|---|---|
| `swim` / `bike` / `run` / `str` | same |
| `race` and `/svøm/i.test(s.d)` | `tri` (Køge Jernmand, IRONMAN) |
| `race` otherwise | `run` (10 km-løb, Halvmaraton) |
| `rest`, or `m === 0` | never matched |

A test pins the classification of all four race sessions in `plan()`.

### 4.3 `matchActivities({ weeks, progress, activities, ledger, today, lookbackDays })`

- Days in scope are the Copenhagen dates in `[today − L, today]` that fall inside the plan (`START` … `RACE`). A `date → { weekId, di, sessions[] }` index is built from `plan()` with `isoDate(addDays(w.start, di))`. The session key is `${di}-${si}`.

**Consumed activities** are skipped: the id is in `ledger`, or it occurs in any remote entry's `extId` (split on `,`).

**Eligibility of session key `k` for activity `a`**, judged against the remote entry `e`:
- `e` absent → **writable**.
- `e.done === false && e.updatedAt < a.start` → **writable**. A tick-and-untick before the workout must not block it.
- otherwise → **occupied**: a done entry of any `src`, or a tombstone newer than the activity, which means an un-check that sticks.

**Per day, per group** (swim, bike, run, str):
- S = all sessions in the group, writable and occupied alike, in `si` order.
- A = unconsumed activities in the group with `min ≥ 5`, in start order (at most 6; any beyond that are extras).
- A pair (s, a) is admissible when `a.min ≥ 0.25 · s.m`.
- Choose the assignment by exhaustive search (the sets are tiny). Criteria, in order:
  1. maximise the number of pairs;
  2. minimise Σ|a.min − s.m|;
  3. tie-break to chronological pairing (the k-th activity goes to the k-th session).
- Pairs on **occupied** sessions *absorb* their activity. Nothing is written and nothing goes in the ledger, so a manually ticked or un-checked session never pushes its activity onto a sibling session.
- Pairs on writable sessions produce a write. Unpaired activities (and any beyond 6 in a group) are saved as **extras** (below). Activities under 5 minutes are skipped.

**Bricks** need no special case: the bike and the run are different groups (Saturday `Lang cykeltur` + `Brick-løb`).

**Triathlon race (`tri`):**
- All unconsumed swim, bike and run activities on that date go to the race session.
- `min` = Σ elapsed (clamped to 900), `dist` = Σ distance, no `hr`.
- `at` = earliest start, end = latest end.
- `extId` = the ids in start order joined by `,`. If that exceeds 64 characters, keep the 3 longest.
- The race counts as done when Σ elapsed ≥ 0.25 · planned. Every id goes in the ledger.

**Extras.** An unpaired activity (including unknown sports and activities under 25 % of every planned session) is written as `x-s<base36 of the activity id>` in the week of its Copenhagen date, through `stampExtra`:

```js
stampExtra({ day: di, sport: group ?? 'other', min, dist, hr, source: 'strava', activityId: a.id },
           null, { now: new Date(a.endMs), dev: 'strava' })       // updatedAt = activity end, as for sessions
```

The key is derived from the id, so the same activity can never make a duplicate, and a tombstone written by the app (the user deleted it) is final: an existing entry at the key, tombstone included, is never overwritten. The ledger records `{ d, w, k: 'x-s…' }` as for sessions. The remote scan for consumed ids also reads `activityId`. A lost extra is written again (`healed`) while its activity is still fetched. No extra is written to a week whose file is unreadable, for activities outside the plan, or under 5 minutes.

**Entry written** (pure; through `stampEntry` so validation is shared):

```js
stampEntry({ done: true, at: iso(a.startMs), min: a.min, src: 'strava', extId: a.id, sig: sessionSig(s), dist, hr },
           e /* absent or old tombstone */, { now: new Date(a.endMs), dev: 'strava' })
// → updatedAt = max(activity end, e.updatedAt + 1 ms) = activity end
```

Why `updatedAt = activity end` and not the time of the CI run: a manual tick made after the workout, on a phone that was offline while CI wrote, still beats the Strava entry under LWW (architecture §3.3). Manual input wins even inside the race window.

### 4.4 Ledger and self-heal

- After a write: `ledger[a.id] = { d: a.date, w, k }`.
- Ledgered id whose target `remote[w][k]` is **absent** (a lost write; devices never delete keys): write it again, from the activity if it is still in the fetched window, and count it as `healed`. If the activity is no longer fetched, drop the ledger entry.
- Ledgered id whose target has any entry (done or tombstone): leave it. A tombstone there is the user's un-check, and it sticks.
- Second run with the same data: 0 writes (a test checks this).

---

## 5. Changes outside the new scripts

**`src/progress.js`:**
- Add `dist` and `hr` to `KNOWN`, the `Entry` typedef and `normalizeEntry`:
  - `dist` must be an integer 0..1,000,000 (m);
  - `hr` must be an integer 30..250;
  - anything else drops the field.
- Tombstones drop them, as they drop every other detail.
- No other contract changes.

**`src/app.js` (sheet only):**
- When `e.src === 'strava'`, show one line under the facts: `Fra Strava · 10,2 km · ⌀ 148 bpm`, built with `esc()`/number formatting only.
- Add a link `Se på Strava` → `https://www.strava.com/activities/<first id>`. Link only when the id matches `/^\d{1,20}$/`, and use `target=_blank rel="noopener noreferrer"`. A navigation is not affected by the CSP.
- On submit, an edited entry whose previous entry had `src:'strava'` keeps `src, extId, dist, hr`, and the user's `min/rpe/note` override.
- Pace (see architecture §3.8): for an entry with `dist` and `min` but no `pace`, the sheet and the card show a derived average (`⌀ 6:03 /km`), computed by `derivePace` in `src/pace.js` and used for display only. It is never written to the entry or the gist, and the importer's stored fields are unchanged. For swimming `min` is elapsed time, so the figure includes rests. A typed `pace` wins over the derived one and is kept when the entry is edited.

**`src/ics.js`:** unchanged. It reads only `done` and `min`.

**Docs:**
- `docs/architecture.md`: §0 gets a Strava row, §3.1 gets `dist`/`hr`, §3.7 points here, and §5.1/§5.2 list the new step and secrets.
- `docs/guides/strava.md`: a Danish user guide (the checklist in §11, expanded).
- One link each from `docs/guides/opsaetning.md` and `README.md`.

---

## 6. Privacy and logging rules

**Public repo: Actions logs and step summaries are world-readable.**

- **Never** in logs, annotations, `$GITHUB_STEP_SUMMARY`, error messages or the gist:
  - tokens (access, refresh, client secret, `GIST_WRITE_TOKEN`) or the gist id;
  - Strava athlete id or name;
  - activity ids, names or descriptions;
  - polylines, lat/lng, city, gear or device;
  - raw response bodies, and request URLs with their query strings.
- The gist receives only the §4.3 entry fields and `_strava.json`, which holds ciphertext and the ledger (activity ids, dates and session keys only).
- Logs carry counts only, for example: `Strava: 6 aktiviteter i vinduet · 3 nye pas · 1 genskabt · 1 optaget (manuel/fjernet) · 1 ekstra · 1 ignoreret`.
- No per-session lines in CI: which sessions were done is private, even though the plan is public.
- Error text is our own Danish sentence plus the HTTP status. Strava's error JSON is never echoed.
- Use `::add-mask::` for the access token and new refresh tokens (§2.2). No `set -x`, and no env dumps.
- The `.ics` still exposes only `done` and `min`. `dist` and `hr` never leave the gist (tested).

---

## 7. Workflow changes (`.github/workflows/pages.yml`)

```yaml
on:
  push:
    branches: [main]
  schedule:
    - cron: '17 2 * * *'   # 04:17 CEST / 03:17 CET
    - cron: '17 20 * * *'  # 22:17 CEST / 21:17 CET: dagens Strava-pas samme aften
  workflow_dispatch:
    inputs:
      strava_days: { description: 'Strava: dage tilbage (1–30)', required: false, default: '3' }
jobs:
  build:
    outputs:
      strava: ${{ steps.strava.outputs.status || steps.strava.outcome }}
    steps:
      # … checkout, setup-node, Test …
      - name: Strava sync
        id: strava
        continue-on-error: true
        timeout-minutes: 3
        env:
          STRAVA_CLIENT_ID: ${{ secrets.STRAVA_CLIENT_ID }}
          STRAVA_CLIENT_SECRET: ${{ secrets.STRAVA_CLIENT_SECRET }}
          STRAVA_REFRESH_TOKEN: ${{ secrets.STRAVA_REFRESH_TOKEN }}
          GIST_ID: ${{ secrets.GIST_ID }}
          GIST_WRITE_TOKEN: ${{ secrets.GIST_WRITE_TOKEN }}
          STRAVA_LOOKBACK_DAYS: ${{ inputs.strava_days || '3' }}
        run: node scripts/strava-sync.mjs
      - name: Fetch progress (secret gist)   # unchanged, now reads the Strava entries too
      # … Build, Leak guard, upload …
  cleanup:
    steps:
      # … delete artifact, keep cron alive …
      - name: Strava alert (siden er udrullet; fejler kørslen, så GitHub sender en mail)
        if: contains(fromJSON('["auth","error","failure"]'), needs.build.outputs.strava)
        run: |
          echo "::error::Strava-synk fejlede (${{ needs.build.outputs.strava }}). Kør node scripts/strava-auth.mjs ved 'auth'; se docs/guides/strava.md"
          exit 1
```

- `inputs.strava_days` reaches the script only as env, never interpolated into a `run:` script, so it cannot inject. The script validates it.
- The `concurrency: pages` group already serialises runs, so two CI writers never race on `_strava.json`.

---

## 8. Failure behaviour

| Situation | Status | Gist writes | Deploy | User sees |
|---|---|---|---|---|
| Strava not configured | skipped | none | yes | notice |
| Partially configured | skipped | none | yes | warning naming the missing secrets |
| Gist unreachable or 5xx | unavailable | none (Strava not called) | yes (`fetch-progress` then retries or skips the deploy as today) | warning |
| Strava 5xx, network error or 429 | unavailable | rotation only | yes | warning; the next run catches up (3-day window) |
| Refresh 400/401, or list 401 | auth | none | yes | red run + e-mail: rerun `strava-auth.mjs` |
| Rotation could not be persisted | error | none | yes | red run + e-mail |
| Lost update after 3 PATCH rounds | ok + warning | partial | yes | healed by the next run (§4.4) |
| Script bug (exception) | error / failure | possibly none | yes | red run + e-mail |

---

## 9. Tests (`node --test`, no network, synthetic fixtures)

The fixtures under `test/fixtures/strava/` are recorded-shape fakes:
- `token.json`, `token-rotated.json`, `activities-*.json`;
- every activity carries the decoys `name: "HEMMELIG-AKTIVITET"`, `map.summary_polyline: "POLYLINE-XYZ"` and `start_latlng: [55.6761, 12.5683]`;
- the athlete is `"HEMMELIG-ATLET"`.

**`test/strava-match.test.mjs`** (pure):
- **Sports and minutes:**
  - VirtualRide on Friday → `Cykel med intervaller`;
  - Swim uses `elapsed_time`, Run uses `moving_time`, WeightTraining → `str`;
  - unknown types are extras;
  - the classification of all four race sessions.
- **Entry shape:** the exact fields, `updatedAt` = activity end, `dev:'strava'`, `sig`. The entry is a fixed point of `normalizeEntry` and serialises with `serializeWeek`.
- **Matching:**
  - brick Saturday (Ride + Run) → both sessions;
  - two same-group sessions (custom `weeks` fixture) → the Σ|Δ|-optimal pairing, and chronological pairing on ties;
  - 3-minute and < 25 % activities are ignored;
  - a triathlon race aggregates 3 legs with a joined `extId`;
  - Halvmaraton is matched by its run.
- **Dates:** `2026-11-24T23:30Z` → 25 Nov in Copenhagen; DST days 2027-03-28 and 2026-10-25; outside the window, or before `START`, is ignored.
- **Who wins:**
  - a manual done entry is never overwritten, and its activity is absorbed (not moved to a sibling);
  - a tombstone newer than the start blocks, while one older than the start allows the write;
  - after un-checking a Strava entry, a rerun writes nothing.
- **Idempotency and heal:** a second run gives 0 writes; with a ledgered target absent, the entry is written again (`healed`).
- **LWW:** `mergeEntry(strava, manualTickAfterWorkout)` → manual, whichever order they are merged in.

**`test/strava-sync.test.mjs`**: the CLI against `node:http` fakes for the Gist and Strava APIs, as in `fetch-progress.test.mjs`, plus unit calls with an injected `fetchImpl`.
- **Writes and rotation:**
  - the happy path PATCHes only the changed week files plus `_strava.json`, and verify-GETs;
  - rotation: `_strava.json.rt` decrypts to the new token, and the next run sends it to the token endpoint;
  - a changed seed secret (`base` mismatch) → the secret is used;
  - a dead stored token → retry with the secret.
- **Outcomes and status:**
  - Strava 503×3 → `unavailable`, exit 0, no progress PATCH;
  - refresh 400 → `auth`, exit 0;
  - 429 → a single attempt;
  - missing secrets → no fetch at all, and the right `status`;
  - gist 404 → **no** Strava call.
- **Lost update:** the fake overwrites the week between GET and PATCH → the verify round restores both edits.
- **Privacy:** over captured stdout, stderr, `$GITHUB_OUTPUT`/summary files and every PATCH body, none of these appear: the decoys, any token, the client secret, the gist id, or an activity id outside `_strava.json`/`extId`.
- **Hosts:** a token is only ever sent to the configured Strava or Gist host, and `STRAVA_API`/`GIST_API` validation rejects other hosts.
- **`--dry-run`:** no week PATCH.

**`test/strava-auth.test.mjs`:**
- the authorize URL contains the scope, the redirect, `approval_prompt=force` and `state`;
- the callback rejects a wrong `state`, `error=access_denied`, a missing code or a missing scope;
- the code exchange goes through a fake fetch;
- `setSecrets` passes the values through stdin, with no token in argv, and stdout holds no token;
- the server binds loopback only.

**Edits to existing tests:**
- `workflow.test.mjs`:
  - two crons and the dispatch input;
  - the order Test → Strava sync → Fetch progress → Build;
  - the secret allowlist gets the 4 new names, and `GIST_WRITE_TOKEN`/`STRAVA_*` appear only in the Strava step;
  - `continue-on-error`, and the alert step is last in `cleanup`.
- `progress.test.mjs`: `dist`/`hr` validation, and that tombstones drop them.
- `ics-marks.test.mjs`: the fixture values `dist: 98765`, `hr: 187` never appear in the `.ics`.

---

## 10. Files the implementer owns

**New:**
- `scripts/strava-auth.mjs`, `scripts/strava-sync.mjs`;
- `scripts/lib/strava.mjs`: pure code (`sportGroup`, `sessionGroup`, `pickActivity`, `cphDate`, `matchActivities`) plus thin HTTP helpers (`refreshToken`, `exchangeCode`, `listActivities`, all with injected `fetchImpl`);
- `test/strava-match.test.mjs`, `test/strava-sync.test.mjs`, `test/strava-auth.test.mjs`, `test/fixtures/strava/*.json`;
- `docs/guides/strava.md`.

**Modified:**
- `.github/workflows/pages.yml`, `src/progress.js`, `src/app.js` (sheet only);
- `test/workflow.test.mjs`, `test/progress.test.mjs`, `test/ics-marks.test.mjs`;
- `docs/architecture.md` (§0, §3.1, §3.7, §5.1, §5.2), `docs/guides/opsaetning.md`, `README.md`.

**Not touched:** `src/store/*`, `scripts/fetch-progress.mjs`, `src/ics.js`, `build/*`.

**Acceptance:**
- `node --test` is green, and `node build.mjs` is green.
- `actionlint` is clean if it is installed.
- Live, after the user's steps: `gh workflow run pages.yml -f strava_days=7 && gh run watch --exit-status` logs `… nye pas`, the app shows the ticks within 60 s, and a second run logs `0 nye pas`.

**Known limitations (accepted):**
- An activity done on a different day than planned is not matched; the user ticks it manually.
- Split recordings of one session are not summed, except on a triathlon race day.
- Deleting an activity or changing its type on Strava after import does not update the entry.
- Manual entries are never enriched with Strava data.

---

## 11. Manuelle trin (bruger)

- [ ] **Opret Strava-appen** på strava.com/settings/api:
  - navn `IM2027 Sync`, kategori Training;
  - hjemmeside `https://emilberntsen-ui.github.io/ironman-2027/`;
  - **Authorization Callback Domain: `localhost`**;
  - upload `assets/icons/icon-512.png` som ikon;
  - notér Client ID og Client Secret.
- [ ] **Lav et nyt GitHub-token** "IM2027 CI write" (fine-grained): Gists → Read and write, "Public repositories", udløb 2027-09-30. Gem det med `gh secret set GIST_WRITE_TOKEN`.
- [ ] **Hent Strava-tokenet** fra roden af repoet på din Mac:
  1. `read -rs STRAVA_CLIENT_SECRET && export STRAVA_CLIENT_SECRET`
  2. `STRAVA_CLIENT_ID=<id> node scripts/strava-auth.mjs`
  3. Godkend i browseren. Lad fluebenet for aktiviteter være sat. **Står dine aktiviteter på "Kun dig" (Only You) i Strava, så kør trin 2 med `--read-all` bagest** (`STRAVA_CLIENT_ID=<id> node scripts/strava-auth.mjs --read-all`). Uden `--read-all` ser synken kun aktiviteter, der er synlige for dine følgere eller alle.
  4. Scriptet gemmer selv de tre `STRAVA_*`-secrets.
  5. `unset STRAVA_CLIENT_SECRET`
- [ ] **Første kørsel:** `gh workflow run pages.yml -f strava_days=7 && gh run watch --exit-status`. Tjek at loggen skriver "Strava: … nye pas", og at appen viser fluebenene.
- [ ] **Får du en mail om en fejlet kørsel** med "Strava-synk fejlede (auth)": kør `strava-auth.mjs` igen.
- [ ] **Stop Strava-synk:** tilbagekald appen på strava.com/settings/apps, og slet de fire secrets med `gh secret delete`.

## 12. Decision (was: open question)

- **Q1: Scope.** Decided: the default is `activity:read`, which does not see activities set to "Kun dig" (Only You), and Strava applies privacy zones. If such activities are leaked, home-area GPS stays hidden. If you record training as "Kun dig", run `node scripts/strava-auth.mjs --read-all` instead, which asks for `activity:read_all`. The code is the same, and GPS is still never stored or logged. The Danish checklist (§11) and `docs/guides/strava.md` say so.

## 13. Implementation notes (deviations from the design above)

- **Extras (changed after the first implementation).** Unmatched activities are no longer only counted: they are stored as extras (see §4.3, §0 and architecture §3.10). `stats` gained `skipped` (and `extras` now counts stored ones); the log line says `N ekstra` and, when something was not saved, `N ignoreret`. The ledger keys may be `x-s…`. `scripts/fetch-progress.mjs` and `src/ics.js` ignore `x-` keys, so the calendar still shows the plan only.
- `strava-auth.mjs` has `--read-all` instead of `--scope`. Any other flag is a usage error (exit 2).
- A 401/403/404 from the gist itself (a dead or expired `GIST_WRITE_TOKEN`, a wrong `GIST_ID`) gives status `error` (red run, e-mail), not `unavailable`: it never heals by itself. Network errors, 5xx and rate limits stay `unavailable`. Strava is still not called.
- The `cleanup` alert step receives the status through `env:` (`STRAVA_STATUS`) instead of interpolating it into the `run:` script.
- The rotation (§2.2) is also persisted when no usable stored token existed (first run, a new seed, an unreadable file), not only when the returned token differs. A stored token that was dead and replaced by the seed is persisted too.
- For a triathlon race below 25 % of the planned time nothing is written, and the ids go in the ledger only when the session is written. A later run, with more legs uploaded, can still complete it.
- `pickActivity` also keeps `elapsedSec` (an integer), because the race sums elapsed time. An unparseable week file in the gist blocks only that week (a warning, no writes to it).
- The log line gets ` · N allerede hentet` when some activities were already imported. Counts only, as before.
- Test-only env overrides in `strava-sync.mjs`: `STRAVA_NOW`, `STRAVA_DELAYS_MS`, `STRAVA_VERIFY_WAIT_MS` (next to `GIST_API`, `STRAVA_API`, `STRAVA_OAUTH`).
- `test/app.test.mjs` gets four tests for the sheet changes in §5, and `test/fixtures/progress.v2.json` carries `dist`/`hr` on one entry.
