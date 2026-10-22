#!/usr/bin/env node
// Opretter den hemmelige gist til synk fra terminalen, så GIST_ID kan sættes, før appen er forbundet (docs/guides/opsaetning.md).
//   GITHUB_TOKEN=github_pat_… node scripts/create-gist.mjs
// Gør præcis det samme som appen ved første forbindelse: GistStore.findOrCreate leder efter en gist med markørfilen og beskrivelsen
// og opretter først en (hemmelig, kun markørfilen), hvis ingen findes. Koden er den samme, så de to kan ikke glide fra hinanden.
// Tokenet læses kun fra miljøvariablen GITHUB_TOKEN (aldrig fra argumenter, så det ikke havner i skallens historik) og skal have
// Gists: Read and write. Stdout er kun gist-id'et, så det kan pipes: node scripts/create-gist.mjs | gh secret set GIST_ID
// Findes der allerede en gist med markørfilen, oprettes der ikke en ny: id'et på den eksisterende udskrives i stedet, og en besked
// på stderr fortæller det.
// Exit: 0 = id udskrevet (oprettet eller fundet), 1 = GitHub afviste eller kunne ikke nås, 2 = brug (GITHUB_TOKEN mangler).
// Logger aldrig tokenet.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GistStore } from '../src/store/gist.js';

class UsageError extends Error {}

// findOrCreate rører ikke lageret, men en tom stub sikrer, at Node's (eksperimentelle) localStorage aldrig forsøges brugt.
const NO_STORAGE = { getItem: () => null, setItem() {}, removeItem() {} };

// → { gistId, login, created }. Kaster UsageError uden token, ellers GistError (med en dansk, token-fri besked).
export async function createGist({ env = process.env, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const token = (env.GITHUB_TOKEN ?? '').trim();
  if (!token) throw new UsageError('GITHUB_TOKEN er ikke sat. Brug: GITHUB_TOKEN=github_pat_… node scripts/create-gist.mjs (tokenet skal have Gists: Read and write)');
  return GistStore.findOrCreate(token, { fetch: fetchImpl, storage: NO_STORAGE, now });
}

// → exit-kode. Kun gist-id'et går til stdout.
export async function run({ env = process.env, fetchImpl, now, out = s => process.stdout.write(s), err = s => process.stderr.write(s) } = {}) {
  try {
    const { gistId, created } = await createGist({ env, fetchImpl, now });
    out(`${gistId}\n`);
    err(created
      ? 'Gisten er oprettet (hemmelig). Gem id\'et som secret: gh secret set GIST_ID\n'
      : 'Der findes allerede en gist med markørfilen, så der er ikke oprettet en ny. Id\'et ovenfor er den eksisterende.\n');
    return 0;
  } catch (e) {
    if (e instanceof UsageError) { err(`${e.message}\n`); return 2; }
    err(`Fejl: ${e && e.message ? e.message : 'ukendt fejl'}\n`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) process.exitCode = await run();
