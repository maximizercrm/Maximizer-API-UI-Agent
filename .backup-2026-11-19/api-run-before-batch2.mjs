// Runs ONE folder of a Postman collection with Newman against the story's build.
// Credentials come from .env only (never printed, never saved in reports or in Postman).
//
// Usage:
//   node api-run.mjs <user> "<story URL>" --collection <uid> --folder "<folder name>"
//                    [--api-base <url>] [--base-env <environment uid>] [--out <dir>] [--dry-run]
//
//   <user>        .env prefix: qa, abrown, staging, staging_nonadmin (<NAME>_USERNAME / <NAME>_PASSWORD)
//   <story URL>   web URL from the work item, e.g. https://qa1.maximizercrmlive.com/web12715wme/<32-char database id>
//                 Host must be a test host in .env. The last path segment is used as {{Database}}.
//   --collection  Postman collection UID to run (the FORK for story work, never the original while editing)
//   --folder      folder name inside it to run (e.g. "AB#186076"); omit only to run everything
//   --api-base    API base URL ({{BaseURL}}), e.g. https://qa1.maximizercrmlive.com/apimain
//                 If omitted it is derived as web<X> -> api<X>. The agent must confirm it with the user,
//                 because builds don't always follow that pattern (e.g. Staging web2026M11 -> api2025M9).
//   --base-env    Postman environment UID whose other variables (keys etc.) are used as a starting point
//   --out         report folder (default api-results/<folder>/<timestamp>)
//   --dry-run     validate inputs and print what would run; no network calls
//
// Overrides injected at run time: BaseURL, Database, UID, Password. Needs POSTMAN_API_KEY in .env.
// Writes: summary.md, summary.json, junit.xml (passwords/tokens redacted). Prints counts only.
// Exit codes: 0 all passed · 1 bad config/arguments · 3 test failures · 5 host not allowed · 6 Postman API error · 7 newman missing
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(root, '.env');
process.loadEnvFile(envFile);

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const flag = (name) => argv.includes(`--${name}`);
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && !['--dry-run'].includes(argv[i - 1])));
const fail = (code, msg) => { console.error(msg); process.exit(code); };

const who = (positional[0] || '').toUpperCase();
const storyUrl = positional[1];
const collection = opt('collection');
const folder = opt('folder');
const baseEnv = opt('base-env');
const dryRun = flag('dry-run');
if (!who || !storyUrl || !collection) {
  fail(1, 'Usage: node api-run.mjs <user> "<story URL>" --collection <uid> --folder "<name>" [--api-base <url>] [--base-env <uid>] [--out <dir>] [--dry-run]');
}

const uid = process.env[`${who}_USERNAME`];
const pwd = process.env[`${who}_PASSWORD`];
if (!uid || !pwd) fail(1, `Missing ${who}_USERNAME / ${who}_PASSWORD in .env`);
const apiKey = process.env.POSTMAN_API_KEY;
if (!apiKey && !dryRun) fail(1, 'Missing POSTMAN_API_KEY in .env');

// Allowed hosts = hosts of *_URL keys in .env (test hosts only).
const knownHosts = new Set();
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+_URL)\s*=/);
  if (m && process.env[m[1]]) { try { knownHosts.add(new URL(process.env[m[1]]).host); } catch {} }
}

let story;
try { story = new URL(storyUrl); } catch { fail(1, `Not a valid URL: ${storyUrl}`); }
if (story.protocol !== 'https:' || !knownHosts.has(story.host)) {
  fail(5, `Host not allowed: ${story.host} is not a test host in .env (allowed: ${[...knownHosts].join(', ')}).`);
}
const segs = story.pathname.split('/').filter(Boolean);
const webSeg = segs[0] || '';
const database = segs[1] || '';
if (!/^[0-9a-f]{32}$/i.test(database)) fail(1, `Could not read the database id from the story URL (expected /<web path>/<32-char id>).`);

let apiBase = opt('api-base');
let apiBaseSource = 'given';
if (!apiBase) {
  if (!/^web/i.test(webSeg)) fail(1, `Cannot derive the API base from /${webSeg}/; pass --api-base.`);
  apiBase = `${story.origin}/${webSeg.replace(/^web/i, 'api')}`;
  apiBaseSource = 'derived (web -> api) - confirm with the user';
}
let api;
try { api = new URL(apiBase); } catch { fail(1, `Not a valid --api-base: ${apiBase}`); }
if (api.host !== story.host) fail(5, `--api-base host ${api.host} differs from the story host ${story.host}.`);
apiBase = apiBase.replace(/\/+$/, '');

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const safeFolder = (folder || 'all').replace(/[^A-Za-z0-9#_-]+/g, '_');
const out = path.resolve(root, opt('out') || path.join('api-results', safeFolder, stamp));

console.log(`User: ${who} (from .env) · Host: ${story.host} · Database: ${database.slice(0, 6)}…`);
console.log(`API base: ${apiBase}  [${apiBaseSource}]`);
console.log(`Collection: ${collection} · Folder: ${folder || '(whole collection)'} · Base env: ${baseEnv || '(none)'}`);
console.log(`Report folder: ${path.relative(root, out)}`);
if (dryRun) { console.log('Dry run: nothing executed.'); process.exit(0); }

// ---- Postman API ----
async function pm(pathname) {
  const r = await fetch(`https://api.getpostman.com${pathname}`, { headers: { 'X-Api-Key': apiKey } });
  if (!r.ok) throw new Error(`Postman API ${pathname.split('?')[0]} -> HTTP ${r.status}`);
  return r.json();
}
let coll, envValues = [];
try {
  coll = (await pm(`/collections/${collection}`)).collection;
  if (baseEnv) envValues = (await pm(`/environments/${baseEnv}`)).environment.values || [];
} catch (e) { fail(6, e.message); }

const set = (key, value, type = 'default') => {
  const i = envValues.findIndex((v) => v.key === key);
  const v = { key, value, type, enabled: true };
  if (i >= 0) envValues[i] = v; else envValues.push(v);
};
set('BaseURL', apiBase);
set('Database', database);
set('UID', uid);
set('Password', pwd, 'secret');

let newman;
try { newman = (await import('newman')).default; } catch { fail(7, 'newman is not installed. Run: npm install'); }

fs.mkdirSync(out, { recursive: true });
const secrets = [pwd];
const redact = (s) => {
  let t = String(s ?? '');
  for (const x of secrets) if (x && x.length >= 4) t = t.split(x).join('<redacted>');
  return t.replace(/("?(Password|Token)"?\s*[:=]\s*")[^"]*"/gi, '$1<redacted>"');
};

const results = [];
newman.run({
  collection: coll,
  environment: { name: `api-run ${who}`, values: envValues },
  folder: folder || undefined,
  reporters: ['junit'],
  reporter: { junit: { export: path.join(out, 'junit.xml') } },
  timeoutRequest: 60000,
}).on('request', (err, a) => {
  const tok = a?.response?.json?.()?.Data?.Token; // never store tokens
  if (tok) secrets.push(tok);
}).on('assertion', (err, a) => {
  results.push({ request: a.item?.name, assertion: a.assertion, passed: !err, error: err ? redact(err.message) : undefined });
}).on('done', (err, summary) => {
  if (err) { console.error(`Run error: ${redact(err.message)}`); }
  const reqs = summary.run.executions.map((e) => ({ request: e.item.name, status: e.response?.code, timeMs: e.response?.responseTime }));
  const failures = results.filter((r) => !r.passed);
  const s = summary.run.stats;
  const data = {
    when: new Date().toISOString(), user: who, host: story.host, apiBase, collection, folder: folder || null,
    requests: { total: s.requests.total, failed: s.requests.failed },
    assertions: { total: s.assertions.total, failed: s.assertions.failed, passed: s.assertions.total - s.assertions.failed },
    runErrors: summary.run.failures.filter((f) => f.error && f.error.name !== 'AssertionError').map((f) => redact(`${f.source?.name}: ${f.error.message}`)),
    executions: reqs, failures,
  };
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(data, null, 2));
  const md = [
    `# API run — ${folder || 'whole collection'}`,
    `- When: ${data.when}`, `- User: ${who} · Host: ${story.host} · API base: ${apiBase}`, `- Collection: ${collection}`,
    `- Requests: ${s.requests.total} (${s.requests.failed} failed) · Assertions: ${data.assertions.passed} passed / ${s.assertions.failed} failed of ${s.assertions.total}`,
    '', '| Request | HTTP | ms |', '|---|---|---|', ...reqs.map((r) => `| ${r.request} | ${r.status ?? '—'} | ${r.timeMs ?? '—'} |`),
    '', failures.length ? '## Failed assertions' : '## No failed assertions',
    ...failures.map((f) => `- **${f.request}** — ${f.assertion}: ${f.error}`),
    ...(data.runErrors.length ? ['', '## Run errors', ...data.runErrors.map((e) => `- ${e}`)] : []),
  ].join('\n');
  fs.writeFileSync(path.join(out, 'summary.md'), redact(md));
  // junit may contain response snippets: redact it too
  try { const j = path.join(out, 'junit.xml'); fs.writeFileSync(j, redact(fs.readFileSync(j, 'utf8'))); } catch {}
  console.log(`Requests: ${s.requests.total} (${s.requests.failed} failed) · Assertions: ${data.assertions.passed} passed, ${s.assertions.failed} failed`);
  console.log(`Report: ${path.relative(root, path.join(out, 'summary.md'))}`);
  process.exit(err || s.assertions.failed || data.runErrors.length ? 3 : 0);
});
