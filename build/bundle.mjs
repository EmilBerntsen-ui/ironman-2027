// Mini-bundler: modullister pr. mål, JS-/CSS-sammenskrivning og skal-rendering (docs/architecture.md §1.3).
// Ingen tidsstempler eller tilfældighed: samme kilde giver byte-identisk output.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

export const readText = file => readFileSync(resolve(ROOT, file), 'utf8');
export const sha256 = data => createHash('sha256').update(data).digest('hex');

const IMPORT_START = /^import(?=[\s{*'"])/;
const IMPORT_LINE = /^import\s+[^'"\n]*?\s+from\s+['"][^'"\n]+['"]\s*;?[ \t]*\r?$/;
const EXPORT_START = /^export\b/;
const EXPORT_DECL = /^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([\w$]+)/;

// Fjern `import`-linjer (de findes kun til Node-tests og editorer), fjern `export` og saml navnene.
// Linjenumre bevares, så stakspor peger på kildefilen. Alt andet end de understøttede former kaster.
function transformModule(file, src) {
  const names = [];
  const lines = src.split('\n').map((line, i) => {
    const at = `${file}:${i + 1}`;
    if (IMPORT_START.test(line)) {
      if (IMPORT_LINE.test(line)) return '';
      throw new Error(`${at}: kun import på én linje (import … from '…';) understøttes`);
    }
    if (EXPORT_START.test(line)) {
      const m = EXPORT_DECL.exec(line);
      if (!m) throw new Error(`${at}: kun 'export function|const|let|class NAVN' understøttes (ingen default, { … }, * eller var)`);
      names.push(m[1]);
      return line.replace(/^export\s+/, '');
    }
    return line;
  });
  return { names, code: lines.join('\n') };
}

// Eksporterede navne i en kildetekst, efter bundlerens regler. Bruges af tests til at sammenligne med Nodes egne exports.
export function exportNames(src, file = '<src>') { return transformModule(file, src).names; }

export function bundleJs(files, { target, version } = {}) {
  if (typeof target !== 'string' || !target) throw new TypeError('bundleJs: target mangler');
  if (typeof version !== 'string') throw new TypeError('bundleJs: version mangler');
  const owner = new Map(); // eksportnavn → fil
  const parts = files.map(file => {
    const { names, code } = transformModule(file, readFileSync(resolve(ROOT, file), 'utf8'));
    for (const n of names) {
      if (n === 'BUILD') throw new Error(`${file}: 'BUILD' er reserveret til bundleren`);
      if (owner.has(n)) throw new Error(`dobbelt eksport '${n}': ${owner.get(n)} og ${file}`);
      owner.set(n, file);
    }
    const list = names.join(', ');
    return `// ---- ${file} ----\n` + (names.length
      ? `const { ${list} } = (() => {\n${code}\nreturn { ${list} };\n})();`
      : `(() => {\n${code}\n})();`);
  });
  const out = `(() => {\n'use strict';\nconst BUILD = Object.freeze({ target: ${JSON.stringify(target)}, version: ${JSON.stringify(version)} });\n${parts.join('\n')}\n})();\n`;
  if (target === 'artifact' && /<\/script/i.test(out)) throw new Error('scriptet indeholder </script');
  return out;
}

// version = sha256 af bundlen (med tom version indsat, så hashen ikke afhænger af sig selv), 12 hex-tegn.
export const versionOf = (files, target) => sha256(bundleJs(files, { target, version: '' })).slice(0, 12);

export function bundleCss(files) {
  const css = files.map(f => readText(f)).join('\n');
  if (/<\/style/i.test(css)) throw new Error('CSS indeholder </style');
  return css;
}

const PLACEHOLDER = /<!--BODY-->|\/\*STYLES\*\/|\/\*SCRIPT\*\/|__APP_JS__/g;
const SLOT = { '<!--BODY-->': 'body', '/*STYLES*/': 'styles', '/*SCRIPT*/': 'script', '__APP_JS__': 'appJs' };

// Udfyld skallens pladsholdere i ét gennemløb (indsat indhold scannes ikke igen, og `$&` mv. tolkes ikke).
// Hver pladsholder i skallen skal have en værdi, og hver værdi en pladsholder.
export function render(shellFile, values) {
  const shell = readText(shellFile);
  const used = new Set();
  const out = shell.replace(PLACEHOLDER, p => {
    const k = SLOT[p];
    if (typeof values[k] !== 'string') throw new Error(`${shellFile}: ingen værdi til ${p}`);
    used.add(k);
    return values[k];
  });
  for (const k of Object.keys(values)) {
    if (values[k] !== undefined && !used.has(k)) throw new Error(`${shellFile}: mangler pladsholder til '${k}'`);
  }
  return out;
}
