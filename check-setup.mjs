// Checks everything the QA agent needs, WITHOUT printing any secret values.
// Usage: node check-setup.mjs            (run at the start of every session)
// Exit code: 0 = ready (warnings allowed) · 1 = something required is missing
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let failed = 0;
const ok = (m) => console.log(`  OK    ${m}`);
const bad = (m) => { failed++; console.log(`  FAIL  ${m}`); };
const warn = (m) => console.log(`  WARN  ${m}`);

console.log('Local setup');
const [maj, min] = process.versions.node.split('.').map(Number);
(maj > 20 || (maj === 20 && min >= 12)) ? ok(`Node ${process.versions.node}`) : bad(`Node ${process.versions.node} is too old (need 20.12+)`);

const envPath = path.join(root, '.env');
let env = {};
if (!fs.existsSync(envPath)) bad('.env file missing');
else {
  const counts = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) { counts[m[1]] = (counts[m[1]] || 0) + 1; env[m[1]] = m[2].trim(); }
  }
  const dups = Object.keys(counts).filter((k) => counts[k] > 1);
  dups.length ? bad(`.env has duplicate keys: ${dups.join(', ')}`) : ok('.env has no duplicate keys');
  for (const u of ['QA', 'ABROWN', 'STAGING', 'STAGING_NONADMIN']) {
    const miss = ['URL', 'USERNAME', 'PASSWORD'].filter((s) => !env[`${u}_${s}`]);
    if (miss.length) { (u === 'STAGING_NONADMIN' ? warn : bad)(`${u}: missing ${miss.map((s) => `${u}_${s}`).join(', ')}`); continue; }
    try { const h = new URL(env[`${u}_URL`]).host; ok(`${u}: URL (${h}), username, password present`); }
    catch { bad(`${u}_URL is not a valid URL`); }
  }
  env.POSTMAN_API_KEY ? ok('POSTMAN_API_KEY present') : warn('POSTMAN_API_KEY missing (needed for API testing)');
}

for (const pkg of ['playwright', 'newman']) {
  try { const v = require(`${pkg}/package.json`).version; ok(`${pkg} ${v} installed`); }
  catch { (pkg === 'newman' ? warn : bad)(`${pkg} not installed - run: npm install`); }
}

try {
  const c = JSON.parse(fs.readFileSync(path.join(root, 'playwright-mcp.config.json'), 'utf8'));
  (c.browser?.launchOptions?.args || []).some((a) => a.includes('--remote-debugging-port=9222'))
    ? ok('playwright-mcp.config.json opens the browser on port 9222') : bad('playwright-mcp.config.json lacks --remote-debugging-port=9222');
  c.outputDir ? ok(`Playwright outputDir = ${c.outputDir}`) : warn('Playwright outputDir not set');
} catch { bad('playwright-mcp.config.json missing or invalid'); }

for (const f of ['switch-user.mjs', 'api-run.mjs', 'tidy-screenshots.mjs', '.claude/settings.json', '.claude/commands/api-story.md', 'api/collections/conventions.md']) {
  fs.existsSync(path.join(root, f)) ? ok(`${f} present`) : bad(`${f} missing`);
}

console.log('\nConnections');
async function reach(label, url, opts = {}, required = false) {
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(10000) });
    (r.ok || (opts.anyStatus && r.status < 500)) ? ok(`${label} (HTTP ${r.status})`) : (required ? bad : warn)(`${label} answered HTTP ${r.status}`);
  } catch (e) { (required ? bad : warn)(`${label} not reachable (${e.cause?.code || e.name})`); }
}
await reach('Playwright browser on 127.0.0.1:9222', 'http://127.0.0.1:9222/json/version');
for (const u of ['QA', 'STAGING']) if (env[`${u}_URL`]) await reach(`${u} host ${new URL(env[`${u}_URL`]).host}`, new URL(env[`${u}_URL`]).origin, { anyStatus: true });
if (env.POSTMAN_API_KEY) await reach('Postman API with POSTMAN_API_KEY', 'https://api.getpostman.com/me', { headers: { 'X-Api-Key': env.POSTMAN_API_KEY } });

console.log('\nThe agent must also check, with its own tools:');
console.log('  - ado: one read call works (e.g. get one assigned work item)');
console.log('  - postman: getEnabledTools shows the FULL tool set (createCollectionFolder, updateCollectionRequest, getCollectionFolder) and the Claude fork 34291118-70db2f8a-2142-47ca-a9b4-e1ad6326437d exists');
console.log(failed ? `\nNOT READY: ${failed} required item(s) failed.` : '\nREADY (warnings, if any, only affect the features named).');
process.exit(failed ? 1 : 0);
