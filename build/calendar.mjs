// Kalenderfeed: skriver dist/site/cal/<CAL_TOKEN>/ironman-2027.ics (docs/architecture.md §1.4, §5.4).
// Tokenet og skemaet er secrets: de logges aldrig, og fejlbeskeder indeholder aldrig deres værdier.
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildIcs, parseSchedule } from '../src/ics.js';
import { ROOT } from './bundle.mjs';

export const CAL_TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;
export const LOCAL_SCHEDULE_FILE = 'cal-schedule.local.json';

// Starttider: først env CAL_SCHEDULE (GitHub-secret med JSON), ellers den valgfri, gitignorerede cal-schedule.local.json.
// null = ingen tider (heldagsbegivenheder). Ugyldigt skema kaster, så en fejlkonfiguration aldrig stille ændrer alle begivenheder.
export function loadSchedule({ env = process.env, file = join(ROOT, LOCAL_SCHEDULE_FILE) } = {}) {
  const fromEnv = env.CAL_SCHEDULE?.trim();
  let text, origin;
  if (fromEnv) { text = fromEnv; origin = 'CAL_SCHEDULE'; }
  else if (existsSync(file)) { text = readFileSync(file, 'utf8'); origin = LOCAL_SCHEDULE_FILE; }
  else return null;
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error(`${origin} er ikke gyldig JSON`); } // JSON.parse citerer ellers brudstykker af teksten
  try { return parseSchedule(raw); } catch (e) { throw new Error(`${origin}: ${e.message}`); }
}

// schedule: undefined = loadSchedule(); null = tvungen heldagsvisning (bruges af tests).
export async function writeCalendar({ outDir, weeks, progress = null, calToken, now = new Date(), schedule }) {
  if (typeof calToken !== 'string' || !CAL_TOKEN_RE.test(calToken)) {
    const why = 'CAL_TOKEN mangler eller er ugyldig (32–128 tegn: A–Z, a–z, 0–9, _ og -)';
    if (process.env.CI === 'true') throw new Error(why);
    console.warn(`${why}; kalenderfeedet springes over`);
    return { written: false };
  }
  const sched = schedule === undefined ? loadSchedule() : schedule;
  const ics = buildIcs(weeks, now, { progress, schedule: sched });
  const dir = join(outDir, 'cal', calToken);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'ironman-2027.ics'), ics);

  const events = (ics.match(/BEGIN:VEVENT/g) || []).length;
  const done = (ics.match(/^SUMMARY:✅/gm) || []).length;
  console.log(`dist/site/cal/<redacted>/ironman-2027.ics  ${events} begivenheder, ${sched ? 'med' : 'uden'} starttider, ${progress ? `${done} gennemført` : 'uden mærker'}`);
  return { written: true };
}
