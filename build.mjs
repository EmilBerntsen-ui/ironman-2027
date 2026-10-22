// node build.mjs [--target=artifact|site|all]   (standard: all)
// → dist/artifact/index.html, dist/site/** og dist/ironman-2027.ics (kun planen, til manuel import)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plan } from './src/plan.js';
import { buildIcs } from './src/ics.js';
import { parseAny } from './src/progress.js';
import { buildArtifact } from './build/artifact.mjs';
import { buildSite } from './build/site.mjs';
import { loadSchedule, writeCalendar } from './build/calendar.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const TARGET_NAMES = ['artifact', 'site', 'all'];
const target = (process.argv.find(a => a.startsWith('--target=')) ?? '--target=all').slice(9);
if (!TARGET_NAMES.includes(target)) {
  console.error(`Ukendt mål '${target}'. Brug: node build.mjs [--target=${TARGET_NAMES.join('|')}]`);
  process.exit(2);
}

// null hvis stien ikke er sat eller filen mangler; ellers parseAny() (kaster ved ukendt format, så en ødelagt fil aldrig ligner "intet gennemført").
function readProgressFile(file) {
  if (!file || !existsSync(file)) return null;
  return parseAny(readFileSync(file, 'utf8'));
}

const kB = n => (n / 1024).toFixed(1) + ' kB';
const weeks = plan();
mkdirSync(resolve(ROOT, 'dist'), { recursive: true });

if (target === 'artifact' || target === 'all') {
  const { version, bytes } = await buildArtifact({ outDir: resolve(ROOT, 'dist/artifact') });
  console.log(`dist/artifact/index.html  ${kB(bytes)}  version ${version}`);
}
const ics = buildIcs(weeks, new Date(), { schedule: loadSchedule() }); // kun planen; starttider kun fra CAL_SCHEDULE eller cal-schedule.local.json
writeFileSync(resolve(ROOT, 'dist/ironman-2027.ics'), ics);
console.log(`dist/ironman-2027.ics  ${(ics.match(/BEGIN:VEVENT/g) || []).length} begivenheder`);
if (target === 'site' || target === 'all') {
  const outDir = resolve(ROOT, 'dist/site');
  const { version, precache } = await buildSite({ outDir });
  console.log(`dist/site/  version ${version}  ${precache.length} precache-filer`);
  const progress = readProgressFile(process.env.PROGRESS_FILE);
  await writeCalendar({ outDir, weeks, progress, calToken: process.env.CAL_TOKEN, now: new Date() }); // logger selv (aldrig tokenet)
}
