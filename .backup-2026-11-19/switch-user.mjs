// Logs OUT the current user and logs IN as another one, inside the browser the Playwright MCP is driving.
// Credentials are read from .env by this script only (Claude never sees them).
// Usage: node switch-user.mjs <qa|testing|abrown|...>
//   needs <NAME>_USERNAME and <NAME>_PASSWORD in .env; <NAME>_URL falls back to QA_URL.
// The Playwright MCP browser must already be open (e.g. after one browser_navigate call).
import { chromium } from 'playwright';

process.loadEnvFile(new URL('./.env', import.meta.url));

const who = (process.argv[2] || '').toUpperCase();
if (!who) {
  console.error('Usage: node switch-user.mjs <name>   (e.g. qa, testing, abrown)');
  process.exit(1);
}
const user = process.env[`${who}_USERNAME`];
const pass = process.env[`${who}_PASSWORD`];
const url = process.env[`${who}_URL`] || process.env.QA_URL;
if (!url || !user || !pass) {
  console.error(`Missing ${who}_USERNAME / ${who}_PASSWORD (or QA_URL fallback) in .env`);
  process.exit(1);
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
const home = page.url();
console.log(`Logged out and logged in as ${who}. Home URL: ${home}`);
console.log('Next: navigate the test tab to the home URL (or reload) to continue as this user.');
await page.close();
process.exit(0);
