import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { plan } from '../src/plan.js';
import { parseAny } from '../src/progress.js';
import { CAL_TOKEN_RE, loadSchedule, writeCalendar } from '../build/calendar.mjs';

const weeks = plan();
const now = new Date('2026-11-02T12:00:00Z');
const TOKEN = 'Kz3_testTOKEN-0123456789abcdefghij'; // 34 tegn, syntetisk
const progress = parseAny(readFileSync(new URL('./fixtures/progress.v2.json', import.meta.url), 'utf8'));
const SCHEDULE = { days: [['06:15'], ['06:15', '06:40'], ['13:00'], ['06:15', '18:20'], ['12:30'], ['09:45'], ['10:15']], race: '06:30' };

let tmp;
before(() => { tmp = mkdtempSync(join(tmpdir(), 'im2027-cal-')); });
after(() => { rmSync(tmp, { recursive: true, force: true }); });

// Kør fn med CI sat/fjernet og opsaml console-output.
async function withEnv(vars, fn) {
  const saved = {}, out = [];
  for (const [k, v] of Object.entries(vars)) { saved[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  const log = console.log, warn = console.warn;
  console.log = (...a) => out.push(a.join(' '));
  console.warn = (...a) => out.push(a.join(' '));
  try { return { result: await fn(), out }; }
  catch (error) { return { error, out }; }
  finally {
    console.log = log; console.warn = warn;
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

test('CAL_TOKEN_RE: 32–128 tegn A–Z a–z 0–9 _ -', () => {
  assert.ok(CAL_TOKEN_RE.test(TOKEN));
  assert.ok(CAL_TOKEN_RE.test('a'.repeat(32)) && CAL_TOKEN_RE.test('a'.repeat(128)));
  for (const bad of ['', 'a'.repeat(31), 'a'.repeat(129), '../' + 'a'.repeat(40), 'a'.repeat(31) + '/', 'a'.repeat(31) + ' ', 'a'.repeat(31) + 'æ', 'a'.repeat(32) + '\n']) assert.ok(!CAL_TOKEN_RE.test(bad), JSON.stringify(bad));
});

test('writeCalendar skriver cal/<token>/ironman-2027.ics og logger aldrig tokenet', async () => {
  const outDir = join(tmp, 'ok');
  const { result, out } = await withEnv({ CI: undefined }, () => writeCalendar({ outDir, weeks, progress, calToken: TOKEN, now, schedule: null }));
  assert.deepEqual(result, { written: true });
  const file = join(outDir, 'cal', TOKEN, 'ironman-2027.ics');
  assert.ok(existsSync(file));
  const ics = readFileSync(file, 'utf8');
  assert.equal((ics.match(/^SUMMARY:✅/gm) || []).length, 4);
  assert.ok(!ics.includes(TOKEN), 'tokenet står kun i stien, ikke i filen');
  assert.ok(out.length > 0 && out.every(l => !l.includes(TOKEN)), 'log uden token');
  assert.match(out.join('\n'), /cal\/<redacted>\/ironman-2027\.ics/);
});

test('writeCalendar uden fremdrift giver ingen mærker; uden skema giver heldagsbegivenheder, med skema timede', async () => {
  const plain = await withEnv({ CI: undefined }, () => writeCalendar({ outDir: join(tmp, 'plain'), weeks, progress: null, calToken: TOKEN, now, schedule: null }));
  const ics = readFileSync(join(tmp, 'plain', 'cal', TOKEN, 'ironman-2027.ics'), 'utf8');
  assert.ok(!ics.includes('✅') && !ics.includes('VTIMEZONE') && ics.includes('DTSTART;VALUE=DATE:'));
  assert.match(plain.out.join('\n'), /uden starttider, uden mærker/);
  await withEnv({ CI: undefined }, () => writeCalendar({ outDir: join(tmp, 'timed'), weeks, progress: null, calToken: TOKEN, now, schedule: SCHEDULE }));
  const timed = readFileSync(join(tmp, 'timed', 'cal', TOKEN, 'ironman-2027.ics'), 'utf8');
  assert.ok(timed.includes('BEGIN:VTIMEZONE') && timed.includes('DTSTART;TZID=Europe/Copenhagen:'));
});

test('writeCalendar uden gyldigt token: kaster i CI, advarer og springer over lokalt (uden at nævne tokenet)', async () => {
  for (const calToken of [undefined, '', 'for-kort', 'a'.repeat(40) + '/..']) {
    const ci = await withEnv({ CI: 'true' }, () => writeCalendar({ outDir: join(tmp, 'ci'), weeks, progress: null, calToken, now, schedule: null }));
    assert.match(ci.error?.message ?? '', /CAL_TOKEN/, String(calToken));
    assert.ok(!(ci.error.message).includes('for-kort'));
    const local = await withEnv({ CI: undefined }, () => writeCalendar({ outDir: join(tmp, 'local'), weeks, progress: null, calToken, now, schedule: null }));
    assert.deepEqual(local.result, { written: false });
    assert.match(local.out.join('\n'), /CAL_TOKEN/);
  }
  assert.ok(!existsSync(join(tmp, 'ci')) && !existsSync(join(tmp, 'local')), 'ingen filer skrevet');
});

test('loadSchedule: env CAL_SCHEDULE først, så lokal fil, ellers null', () => {
  const file = join(tmp, 'cal-schedule.local.json');
  assert.equal(loadSchedule({ env: {}, file }), null);
  assert.equal(loadSchedule({ env: { CAL_SCHEDULE: '   ' }, file }), null);
  writeFileSync(file, JSON.stringify({ days: [['05:55'], [], [], [], [], [], []] }));
  assert.equal(loadSchedule({ env: {}, file }).days[0][0], '05:55');
  assert.equal(loadSchedule({ env: { CAL_SCHEDULE: JSON.stringify(SCHEDULE) }, file }).days[0][0], '06:15', 'env vinder over filen');
  assert.equal(loadSchedule({ env: { CAL_SCHEDULE: JSON.stringify(SCHEDULE) }, file }).race, '06:30');
});

test('loadSchedule: ugyldig JSON eller skema kaster uden at citere indholdet', () => {
  const file = join(tmp, 'ingen.json');
  const secret = 'HEMMELIG-TID';
  for (const CAL_SCHEDULE of [`{"days": [["${secret}`, `{"days": 7, "x": "${secret}"}`, JSON.stringify({ days: Array(7).fill([]), race: secret })]) {
    assert.throws(() => loadSchedule({ env: { CAL_SCHEDULE }, file }), e => e.message.startsWith('CAL_SCHEDULE') && !e.message.includes(secret), CAL_SCHEDULE);
  }
  const local = join(tmp, 'daarlig.json');
  writeFileSync(local, '{ikke json');
  assert.throws(() => loadSchedule({ env: {}, file: local }), /cal-schedule\.local\.json er ikke gyldig JSON/);
});
