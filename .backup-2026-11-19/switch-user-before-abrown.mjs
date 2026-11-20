// Logs OUT the current user and logs IN as another one, inside the browser the Playwright MCP is driving.
// Credentials are read from .env by this script only (Claude never sees them).
//
// Usage: node switch-user.mjs <name> [ticket-url]
//   <name>        .env prefix: qa, abrown, staging, staging_nonadmin
//                 needs <NAME>_URL, <NAME>_USERNAME, <NAME>_PASSWORD in .env (no fallback to QA_URL).
//   [ticket-url]  optional login URL taken from a work item comment, e.g.
//                 https://qa1.maximizercrmlive.com/web12715wme/ef43a2f5001a41169e90b580c399b004
//                 Its host must be one of the hosts already in .env AND the same host as <NAME>_URL,
//                 so the script can never log in to production or an unknown site.
//
// Exit codes: 0 ok · 1 missing config / bad arguments · 2 login rejected · 4 browser not open · 5 URL not allowed
// The Playwright MCP browser must already be open (e.g. after one browser_navigate call).
import { chromium } from 'playwright';
import fs from 'node:fs';

const envFile = new URL('./.env', import.meta.url);
process.loadEnvFile(envFile);

const who = (process.argv[2] || '').toUpperCase();
const ticketUrl = process.argv[3];
if (!who) {
  console.error('Usage: node switch-user.mjs <name> [ticket-url]   (e.g. qa, abrown, staging, staging_nonadmin)');
  process.exit(1);
}
const user = process.env[`${who}_USERNAME`];
const pass = process.env[`${who}_PASSWORD`];
const baseUrl = process.env[`${who}_URL`];
if (!baseUrl || !user || !pass) {
  console.error(`Missing ${who}_URL / ${who}_USERNAME / ${who}_PASSWORD in .env`);
  process.exit(1);
}

// Hosts configured in .env (read from the file's *_URL keys only, never printed with credentials).
const knownHosts = new Set();
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+_URL)\s*=/);
  if (m && process.env[m[1]]) { try { knownHosts.add(new URL(process.env[m[1]]).host); } catch {} }
}

let url = baseUrl;
if (ticketUrl) {
  let t;
  try { t = new URL(ticketUrl); } catch {
    console.error(`Not a valid URL: ${ticketUrl}`);
    process.exit(1);
  }
  if (t.protocol !== 'https:' || !knownHosts.has(t.host)) {
    console.error(`URL not allowed: ${t.host} is not a test host in .env (allowed: ${[...knownHosts].join(', ')}). Add it to .env first.`);
    process.exit(5);
  }
  const userHost = new URL(baseUrl).host;
  if (t.host !== userHost) {
    console.error(`URL not allowed: ${who} belongs to ${userHost}, but the ticket URL is on ${t.host}. Use a user configured for ${t.host}.`);
    process.exit(5);
  }
  url = t.href;
}

const port = process.env.CDP_PORT || '9222';
let browser;
try {
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
} catch {
  console.error(`Cannot reach the Playwright browser on port ${port}. Open any page with Playwright first (browser_navigate), then retry.`);
  process.exit(4);
}
const ctx = browser.contexts()[0];

// 1) Logout: drop every cookie of the shared browser session.
await ctx.clearCookies();

// 2) Login as the requested user on a helper tab in the same browser session.
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
await page.reload({ waitUntil: 'domcontentloaded' });

const passField = page.locator('input[type="password"]:visible').first();
await passField.waitFor({ timeout: 30000 });
const userField = page
  .locator('input[type="text"]:visible, input[type="email"]:visible, input:not([type]):visible')
  .first();
await userField.fill(user);
await passField.fill(pass);
await passField.press('Enter');
await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});

if (await page.locator('input[type="password"]:visible').count()) {
  console.error(`Login as ${who} failed: login form still showing (check ${who}_USERNAME / ${who}_PASSWORD).`);
  await page.close();
  process.exit(2);
}

// Home page of this deployment: https://<host>/<first path segment>/Content/ContentPage.aspx
const u = new URL(url);
const seg = u.pathname.split('/').filter(Boolean)[0] || 'webMain';
const home = `${u.origin}/${seg}/Content/ContentPage.aspx`;
console.log(`Logged out and logged in as ${who} on ${u.host} (deployment /${seg}/).`);
console.log(`Landed on: ${page.url()}`);
console.log(`Home URL: ${home}`);
console.log('Next: browser_navigate to the Home URL and confirm the user in the header.');
await page.close();
process.exit(0);
