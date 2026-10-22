// Artifact-målet: én fil, ingen doctype/html/head/body (claude.ai-reglen), inline CSS og JS (docs/architecture.md §1.2).
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TARGETS, bundleCss, bundleJs, readText, render, versionOf } from './bundle.mjs';

// Præcist mønster: `<header` er tilladt, `<head>` er ikke.
const FORBIDDEN_TAG = /<(?:!doctype|html|head|body)[\s>]/i;

export function assertArtifactContract(html) {
  if (!html.startsWith('<title>')) throw new Error('artifact skal starte med <title>');
  const m = FORBIDDEN_TAG.exec(html);
  if (m) throw new Error(`artifact må ikke indeholde ${m[0].trim()}`);
}

export async function buildArtifact({ outDir }) {
  const t = TARGETS.artifact;
  const version = versionOf(t.js, 'artifact');
  const script = bundleJs(t.js, { target: 'artifact', version });
  const html = render(t.shell, { body: readText('src/app.html').trim(), styles: bundleCss(t.css), script });
  assertArtifactContract(html);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'index.html'), html);
  return { version, bytes: Buffer.byteLength(html) };
}
