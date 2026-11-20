// Logs in headlessly using credentials from .env and saves the session to auth/state.json.
// The Playwright MCP loads that file (--storage-state), so tests start already logged in.
// Usage: node login.mjs                 -> asks which environment (QA / STAGING / TESTING)
//        node login.mjs qa [URL override] -> skips the question
// Reads <ENV>_URL, <ENV>_USERNAME, <ENV>_PASSWORD from .env.
// Sessions from different environments are merged into the same state file.
import { chromium } from 'playwright';
import fs from 'node:fs';

process.loadEnvFile(new URL('./.env', import.meta.url));

// Environments available = every <NAME>_URL key in .env.
const available = Object.keys(process.env)
  .filter((k) => k.endsWith('_URL'))
  .map((k) => k.slice(0, -4));

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const debug = process.argv.includes('--debug'); // visible browser + diagnostics (no secrets printed)
let choice = args[0];
if (!choice) {
  if (!process.stdin.isTTY) {
    console.error(`Pass an environment: node login.mjs <${available.join('|').toLowerCase()}>`);
    process.exit(1);
  }
  const rl = (await import('node:readline/promises')).createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  console.log('Which environment do you want to start testing on?');
  available.forEach((n, i) => console.log(`  ${i + 1}) ${n}  (${new URL(process.env[`${n}_URL`]).host})`));
  const answer = (await rl.question('Enter number or name: ')).trim();
  rl.close();
  choice = available[Number(answer) - 1] || answer;
}
const env = choice.toUpperCase();
if (!available.includes(env)) {
  console.error(`Unknown environment "${choice}". Available: ${available.join(', ')}`);
  process.exit(1);
}
const url = args[1] || process.env[`${env}_URL`]; // optional 3rd arg overrides the URL
const user = process.env[`${env}_USERNAME`];
const pass = process.env[`${env}_PASSWORD`];
if (!url || !user || !pass) {
  console.error(`Missing ${env}_URL, ${env}_USERNAME or ${env}_PASSWORD in .env`);
  process.exit(1);
}

fs.mkdirSync(new URL('./auth/', import.meta.url), { recursive: true });
const out = new URL('./auth/state.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const browser = await chromium.launch({ headless: !debug, slowMo: debug ? 300 : 0 });
const page = await (await browser.newContext()).newPage();
await page.goto(url, { waitUntil: 'domcontentloaded' });

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
  console.error('Login form still showing - check credentials or selectors.');
  await browser.close();
  process.exit(2);
}
if (debug) {
  const ss = await page.evaluate(() => ({
    session: Object.keys(sessionStorage),
    local: Object.keys(localStorage),
  }));
  console.log('[debug] URL after login:', page.url());
  console.log('[debug] page title:', await page.title());
  console.log('[debug] sessionStorage keys:', ss.session.join(', ') || '(none)');
  console.log('[debug] localStorage keys:', ss.local.join(', ') || '(none)');
  for (const c of await page.context().cookies()) {
    console.log(`[debug] cookie ${c.name} domain=${c.domain} path=${c.path} secure=${c.secure} httpOnly=${c.httpOnly} sameSite=${c.sameSite} expires=${c.expires}`);
  }
  await page.screenshot({ path: out.replace(/state\.json$/, 'debug-after-login.png') });
}
const homeUrl = page.url(); // the page the app lands on after login (NOT the login-entry URL)
const fresh = await page.context().storageState();
await browser.close();

// Only ONE environment/user is active at a time (same host + cookie name would collide),
// so state.json holds just the environment chosen now. A per-environment copy is kept too.
fs.writeFileSync(out, JSON.stringify(fresh, null, 2));
fs.writeFileSync(out.replace(/state\.json$/, `${env.toLowerCase()}.json`), JSON.stringify(fresh, null, 2));

// Verify the saved session really works in a brand-new browser context.
const check = await chromium.launch({ headless: true });
const vpage = await (await check.newContext({ storageState: out })).newPage();
await vpage.goto(homeUrl, { waitUntil: 'domcontentloaded' });
await vpage.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
const stillLogin = (await vpage.locator('input[type="password"]:visible').count()) > 0;
if (debug) {
  console.log('[debug] verify URL:', vpage.url());
  await vpage.screenshot({ path: out.replace(/state\.json$/, 'debug-verify.png') });
}
await check.close();
if (stillLogin) {
  console.error('Session was saved but a fresh browser is NOT logged in with it (server rejected the saved cookies).');
  process.exit(3);
}
console.log('Verified: a fresh browser opens the app already logged in.');
console.log(`Home URL (use this, not the login URL, to start testing): ${homeUrl}`);
console.log(`Logged in to ${env}. Session saved to auth/state.json`);
console.log(`Landed on host: ${new URL(page.url()).host} (expected: ${new URL(url).host})`);
