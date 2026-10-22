// owned by 2a
// Site-målet (docs/architecture.md §1.2, §6): fuldt dokument + hashet app-JS + service worker + manifest, ikoner og skrifter.
// Rydder outDir og skriver alt undtagen cal/ (det skriver writeCalendar bagefter). Ingen tidsstempler: samme kilde giver byte-identisk output.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, posix, resolve } from 'node:path';
import { ROOT, TARGETS, bundleCss, bundleJs, readText, render, sha256, versionOf } from './bundle.mjs';

const SHELL_LINKS = ['icons/icon.svg', 'icons/apple-touch-icon.png']; // linket fra shell.site.html (§6.1)

// Almindelige filer i en mappe (ikke skjulte som .DS_Store), sorteret; tom liste hvis mappen mangler.
async function filesIn(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(err => { if (err.code === 'ENOENT') return []; throw err; });
  return entries.filter(e => e.isFile() && !e.name.startsWith('.')).map(e => e.name).sort();
}

// Returnerer { version, precache }: version er cache-versionen (hash over alt der precaches), precache er sw.js' liste ('./' = index.html).
// ci: manglende manifest/ikoner er en fejl (true) eller en advarsel (false). Standard følger miljøet (CI=true), men kan sættes
// eksplicit, så tests ikke afhænger af hvor de kører.
export async function buildSite({ outDir, assetsDir = resolve(ROOT, 'assets'), warn = console.warn, ci = process.env.CI === 'true' }) {
  const t = TARGETS.site;
  const buildVersion = versionOf(t.js, 'site'); // BUILD.version i appen: hash af JS-bundlen alene
  const js = bundleJs(t.js, { target: 'site', version: buildVersion });
  const appJs = `app.${sha256(js).slice(0, 8)}.js`;
  const styles = bundleCss(t.css);
  const html = render(t.shell, { body: readText('src/app.html').trim(), styles, appJs });

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  // Precache er en eksplicit tilladelsesliste: kun det, der skrives herunder (aldrig en mappescanning, aldrig cal/).
  const shipped = new Map(); // sti relativt til outDir ('./' = index.html) → bytes
  const put = async (rel, bytes) => {
    const file = join(outDir, rel === './' ? 'index.html' : rel);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, bytes);
    shipped.set(rel, bytes);
  };
  const copy = async rel => put(rel, await readFile(join(assetsDir, rel)));

  await put('./', html);
  await put(appJs, js);

  const problems = [];
  if ((await filesIn(assetsDir)).includes('manifest.webmanifest')) await copy('manifest.webmanifest');
  else problems.push('assets/manifest.webmanifest mangler');
  for (const dir of ['icons', 'fonts']) for (const name of await filesIn(join(assetsDir, dir))) await copy(`${dir}/${name}`);

  // Skrifter er vores egne og skal findes (fonts.css peger på dem): hård fejl. Manifest og ikoner leveres af en anden opgave og må
  // mangle under udvikling (advarsel), men ikke i CI, hvor en udrullning uden dem ville være en ødelagt PWA.
  for (const m of styles.matchAll(/url\(\s*["']?([^)"']+)["']?\s*\)/g)) {
    if (/^(#|data:|https?:)/.test(m[1])) continue;
    if (!shipped.has(posix.normalize(m[1]))) throw new Error(`CSS peger på ${m[1]}, som ikke findes i assets/`);
  }
  if (shipped.has('manifest.webmanifest')) {
    const manifest = JSON.parse(shipped.get('manifest.webmanifest').toString('utf8'));
    for (const icon of manifest.icons ?? []) if (!shipped.has(posix.normalize(icon.src))) problems.push(`manifestet peger på ${icon.src}, som mangler`);
  }
  for (const rel of SHELL_LINKS) if (!shipped.has(rel)) problems.push(`shell.site.html linker til ${rel}, som mangler`);
  if (problems.length) {
    const msg = `site-build: ${problems.join('; ')}`;
    if (ci) throw new Error(msg);
    warn(`ADVARSEL ${msg}`);
  }

  // Cache-version = hash over (sti, indhold) for alt der precaches. Uændret kilde giver uændret sw.js, så natbygget ikke udløser en opdatering.
  const precache = [...shipped.keys()].sort();
  const hash = createHash('sha256');
  for (const rel of precache) hash.update(rel).update('\0').update(shipped.get(rel)).update('\0');
  const version = hash.digest('hex').slice(0, 12);

  const template = readText('src/sw.js');
  for (const token of ['__VERSION__', '__PRECACHE__']) {
    if (template.split(token).length !== 2) throw new Error(`src/sw.js skal indeholde ${token} præcis én gang`);
  }
  const sw = template.replace('__VERSION__', () => version).replace('__PRECACHE__', () => JSON.stringify(precache, null, 2));
  await writeFile(join(outDir, 'sw.js'), sw);

  return { version, precache };
}
