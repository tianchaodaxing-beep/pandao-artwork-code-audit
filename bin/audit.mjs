#!/usr/bin/env node
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve, basename, dirname, join } from 'node:path';
import { runAudit } from '../docs/engine.mjs';
import { packetFiles, packetZip } from '../docs/packet.mjs';
import { LIMITS } from '../docs/core.mjs';
const args = process.argv.slice(2);
const help = 'Artwork Code Audit 0.1.1\n\nUsage: artwork-code-audit --manifest approved.csv --artwork proof.pdf [--artwork image.png] --out review-folder [--fail-on-review]\n\nExit codes: 0 completed; 1 input/runtime error; 2 review required when --fail-on-review is set.\nOutput folders must not already exist. Files are processed locally.\nContact: tianchaodaxing@gmail.com\n';
async function main() {
  if (!args.length || args.includes('--help') || args.includes('-h')) { console.log(help); return; }
  let manifest, out, fail = false; const artwork = [];
  for (let i = 0; i < args.length; i++) {
    const key = args[i]; if (key === '--fail-on-review') { fail = true; continue; }
    if (!['--manifest', '--out', '--artwork'].includes(key) || !args[i + 1] || args[i + 1].startsWith('--')) throw Error('Unknown option or missing value: ' + key);
    const value = args[++i]; if (key === '--artwork') artwork.push(resolve(value)); else if (key === '--manifest') { if (manifest) throw Error('Supply one approved CSV.'); manifest = resolve(value); } else { if (out) throw Error('Supply one output folder.'); out = resolve(value); }
  }
  if (!manifest || !out || !artwork.length) throw Error('Supply --manifest, at least one --artwork and --out.');
  const ms = await stat(manifest); if (ms.size > LIMITS.manifestBytes) throw Error('The approved CSV must be under 1 MB.');
  let total = 0;
  for (const p of artwork) { const s = await stat(p); total += s.size; if (!s.isFile() || s.size > LIMITS.fileBytes) throw Error('Each artwork file must be at most 100 MB.'); }
  if (total > LIMITS.totalBytes) throw Error('Split artwork batches larger than 300 MB.');
  try { await stat(out); throw Error('The output folder already exists. Choose a new folder.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const { adapter } = await import('./node-adapter.mjs');
  const files = await Promise.all(artwork.map(async p => ({ name: basename(p), bytes: new Uint8Array(await readFile(p)) })));
  const result = await runAudit(await readFile(manifest, 'utf8'), files, adapter, p => console.error('Reading ' + p.file + ' page ' + p.page));
  await mkdir(dirname(out), { recursive: true }); await mkdir(out);
  for (const file of packetFiles(result.report, result.previews)) { const p = join(out, file.name); await mkdir(dirname(p), { recursive: true }); await writeFile(p, file.bytes ?? file.text); }
  await writeFile(join(out, 'artwork-review.zip'), packetZip(result.report, result.previews));
  console.log(JSON.stringify({ ...result.report.summary, output: out })); if (fail && result.report.summary.review) process.exitCode = 2;
}
try { await main(); } catch (error) { console.error('Audit failed: ' + error.message); process.exitCode = 1; }
