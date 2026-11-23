// Token Radar, radar-2 (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), scores
// every rankable pre-token protocol with the model in lib/model.ts, writes the ranked board to
// /output/board.json, writes the dashboard's data into /output/dashboard/data.js, copies this
// repository's dashboard/ and screenshots/ to /output, and writes /output/dossier.json with the
// vendored make.fun library.
//
// The dashboard is a static page, no framework and no network: dashboard/index.html,
// dashboard/app.css and dashboard/app.js read dashboard/data.js, which this program writes from the
// same board, so the page the judge sees and the board the gate reads are the same data.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot, validateBoard, validateSnapshot } from './lib/model.ts';
import type { BoardRow, RadarData, Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
/** Wall-clock start: the diagnostics summary reports the run's own runtime. */
const startedAt = Date.now();

/** The scorer's own caps (RULES.txt, The gate): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

/**
 * --explain <slug>: print one protocol's full model breakdown to stdout — its rank, its
 * four multipliers, the implied-value arithmetic, and its farm plan — then stop before any
 * output is written. A diagnostic only: it never touches /output.
 */
function printExplain(board: BoardRow[], slug: string): void {
  const row = board.find((r) => r.slug === slug);
  if (row === undefined) {
    process.stderr.write(`token radar: --explain ${slug}: no board row carries that slug\n`);
    process.exit(2);
  }
  const usd = (n: number): string => `$${n.toLocaleString('en-US')}`;
  const lines: string[] = [];
  lines.push(`token radar: ${row.name} (${row.slug})`);
  lines.push(`  rank: #${row.rank} of ${board.length} — ${row.token_status}`);
  lines.push(`  category: ${row.category ?? 'Other'} — chains: ${row.chains.length > 0 ? row.chains.join(', ') : 'none recorded'}`);
  lines.push(`  TVL: ${usd(row.tvl_usd)} — 7d change: ${row.change_7d === null ? 'not recorded' : `${row.change_7d.toFixed(2)}%`} — age: ${row.age_days === null ? 'not recorded' : `${row.age_days} days`}`);
  lines.push(`  model:`);
  lines.push(`    category multiple: ${row.model.category_multiple} (median mcap/TVL of live-token protocols in ${row.category ?? 'Other'})`);
  lines.push(`    growth: ${row.model.growth_pct}% over 7d -> multiplier ${row.model.growth_multiplier}`);
  lines.push(`    maturity multiplier: ${row.model.maturity_multiplier} (age ${row.model.age_days === null ? 'unknown, 365 days assumed' : `${row.model.age_days} days`})`);
  lines.push(`    breadth multiplier: ${row.model.breadth_multiplier} (${row.chains.length} chain${row.chains.length === 1 ? '' : 's'})`);
  lines.push(`  implied value: ${usd(row.tvl_usd)} x ${row.model.category_multiple} x ${row.model.growth_multiplier} x ${row.model.maturity_multiplier} x ${row.model.breadth_multiplier} = ${usd(row.implied_value_usd)}`);
  lines.push(`  farm plan (${row.farm_steps.length} steps):`);
  for (let i = 0; i < row.farm_steps.length; i++) {
    lines.push(`    ${i + 1}. ${row.farm_steps[i]}`);
  }
  const ahead = board.filter((r) => r.implied_value_usd > row.implied_value_usd).length;
  const behind = board.filter((r) => r.implied_value_usd < row.implied_value_usd).length;
  lines.push(`  board position: ${ahead} row${ahead === 1 ? '' : 's'} above, ${behind} below`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
validateSnapshot(snapshot);
const { board, radar } = buildRadar(snapshot);
const explainSlug = arg('explain', '');
if (explainSlug !== '') {
  printExplain(board, explainSlug);
  process.exit(0);
}
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}
validateBoard(board, snapshot);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
writeFileSync(join(out, 'dashboard', 'data.js'), dataScript(radar));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// A screenshot the gate refuses must fail here, not after the dossier is written: each must
// be a real PNG (magic bytes) and no larger than the gate's 512 KiB cap.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
for (const name of shots) {
  const bytes = readFileSync(join(out, 'screenshots', name));
  if (bytes.length > SCREENSHOT_CAPS.max_bytes) {
    process.stderr.write(`token radar: screenshots/${name} is ${bytes.length} bytes: the gate caps a screenshot at ${SCREENSHOT_CAPS.max_bytes}\n`);
    process.exit(1);
  }
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    process.stderr.write(`token radar: screenshots/${name} is not a PNG file\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

/**
 * The run's diagnostics summary, to stderr after a successful run: the board's category mix,
 * watchlist coverage, the implied-value distribution in deciles, and the wall-clock runtime.
 * Diagnostics only: nothing here touches /output or the board's bytes.
 */
function printDiagnostics(board: BoardRow[], radar: RadarData, snapshot: Snapshot, elapsedMs: number): void {
  const lines: string[] = [];
  const byCategory = new Map<string, number>();
  for (const row of board) {
    const key = row.category ?? 'Other';
    byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
  }
  const rankedCats = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const shownCats = rankedCats.slice(0, 8);
  const otherCats = rankedCats.slice(8).reduce((n, [, c]) => n + c, 0);
  const catParts = shownCats.map(([cat, count]) => `${cat} ${count} (${((count / board.length) * 100).toFixed(1)}%)`);
  if (otherCats > 0) catParts.push(`other ${otherCats} (${((otherCats / board.length) * 100).toFixed(1)}%)`);
  lines.push(`token radar: categories: ${catParts.join(', ')}`);
  const watchlist = new Set(snapshot.watchlist);
  const covered = board.filter((r) => watchlist.has(r.slug)).length;
  lines.push(`token radar: watchlist coverage: ${covered} of ${snapshot.watchlist.length} slugs on the board (${((covered / snapshot.watchlist.length) * 100).toFixed(1)}%)`);
  const values = board.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const at = (q: number): number => values[Math.min(values.length - 1, Math.floor(q * (values.length - 1)))]!;
  const usd = (n: number): string => `$${n.toLocaleString('en-US')}`;
  lines.push(`token radar: implied value deciles: min ${usd(values[0]!)} — p10 ${usd(at(0.1))} — p25 ${usd(at(0.25))} — median ${usd(at(0.5))} — p75 ${usd(at(0.75))} — p90 ${usd(at(0.9))} — max ${usd(values[values.length - 1]!)}`);
  lines.push(`token radar: total implied value ${usd(radar.total_implied_usd)} across ${board.length} rows (${radar.early_size} early radar, ${radar.live_size} live set aside)`);
  lines.push(`token radar: run time ${elapsedMs} ms (budget 120000 ms)`);
  process.stderr.write(`${lines.join('\n')}\n`);
}

const top = board.slice(0, 5).map((r) => `#${r.rank} ${r.name} $${r.implied_value_usd.toLocaleString('en-US')}`).join(', ');
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: top 5: ${top}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'dashboard')} (${dashFiles.length + 1} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
printDiagnostics(board, radar, snapshot, Date.now() - startedAt);
