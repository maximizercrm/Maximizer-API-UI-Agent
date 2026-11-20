// HELPER (setup/teardown only) - run with browser_run_code ONLY after the user approved the rights change.
// Sets R/I/M/D on "Action Plan Library / Workflow Templates" for ONE test user and returns the grid
// before/after, so the agent can record it in runs/<date>/run.md and restore it at the end.
// Edit the CONFIG block only. Never use it on MASTER or an admin user.
async (page) => {
  // ---- CONFIG ----
  const HOME = 'https://staging1.maximizercrmlive.com/web2026M11/Content/ContentPage.aspx'; // Home URL printed by switch-user.mjs
  const ADMIN_TAB_MATCH = 'admin2026M11'; // part of the Administrator tab URL (e.g. 'adminMain' on QA main)
  const TARGET_USER = 'ABROWN';           // non-admin test user only
  const WANT = 'RIMD';                    // letters from R,I,M,D that must be ON; '' = none
  const CONFIRM_DELETE = false;           // true ONLY after the user approved removing Delete rights
  // ----------------
  if (/^master$/i.test(TARGET_USER)) return 'ABORT: this helper must not modify MASTER';
  const ok = { Read: WANT.includes('R'), Insert: WANT.includes('I'), Modify: WANT.includes('M'), Delete: WANT.includes('D') };
  await page.goto(HOME);
  await page.waitForTimeout(6000);
  for (const p of page.context().pages()) if (p !== page) await p.close();
  await page.getByRole('listitem', { name: 'Administration' }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('listitem', { name: 'Administration' }).locator('iframe').contentFrame().getByRole('link', { name: 'Administrator', exact: true }).click();
  await page.waitForTimeout(6000);
  const ap = page.context().pages().find(p => p.url().includes(ADMIN_TAB_MATCH));
  await ap.getByRole('link', { name: 'Users' }).first().click();
  await ap.waitForTimeout(4000);
  await ap.frames().find(x => x.url().includes('Users.aspx')).getByText(TARGET_USER, { exact: true }).first().click();
  await ap.waitForTimeout(4000);
  const F = () => ap.frames().find(x => x.url().includes('UserDetails.aspx'));
  await F().getByText('Access Rights', { exact: true }).first().click();
  await ap.waitForTimeout(3000);
  await F().getByText('Modify User Access Settings').first().click();
  await ap.waitForTimeout(3000);
  const names = await F().evaluate(() => Array.from(document.querySelectorAll('tr')).filter(tr => tr.querySelectorAll('img[src*="TriStateCheckBox"]').length === 4 && tr.querySelectorAll('tr').length === 0).map(tr => ((tr.querySelector('td') || {}).innerText || '').trim()));
  const row = names.findIndex(n => n === 'Action Plan Library / Workflow Templates');
  if (row < 0) return 'ABORT: workflow row not found';
  const state = async (col) => { const s = (await F().locator(`img[id$="tchPer${col}_image"]`).nth(row).getAttribute('src')).split('/').pop(); return s.includes('unchecked') ? 'U' : s.includes('half') ? 'H' : 'C'; };
  for (const col of ['Read', 'Insert', 'Modify', 'Delete']) {
    for (let i = 0; i < 4; i++) {
      const s = await state(col);
      if ((s === 'C') === ok[col] && s !== 'H') break;
      await F().locator(`img[id$="tchPer${col}_image"]`).nth(row).click();
      await ap.waitForTimeout(400);
    }
  }
  const grid = async () => F().evaluate(() => Array.from(document.querySelectorAll('tr')).filter(tr => tr.querySelectorAll('img[src*="TriStateCheckBox"]').length === 4 && tr.querySelectorAll('tr').length === 0).map(tr => ((tr.querySelector('td') || {}).innerText || '').trim().slice(0, 14) + ':' + Array.from(tr.querySelectorAll('img[src*="TriStateCheckBox"]')).map(i => { const s = (i.src || '').split('/').pop(); return s.includes('unchecked') ? 'U' : s.includes('half') ? 'H' : 'C'; }).join('')));
  const pre = await grid();
  const leads = pre.find(r => r.startsWith('Leads'));
  if (leads !== 'Leads:CCCU') return 'ABORT before save: Leads row is ' + leads + ' ; grid=' + JSON.stringify(pre);
  await F().locator('a[id$="ImageLinkButton1"]').first().click();
  await ap.waitForTimeout(4000);
  { const del = F().locator('input[id$="txtDelRights"]'); if (await del.count() && await del.first().isVisible().catch(() => false)) {
    if (!CONFIRM_DELETE) return 'STOP: a "type DELETE to confirm" rights dialog is open. Ask the user, then re-run with CONFIRM_DELETE = true. grid before save=' + JSON.stringify(pre);
    await del.first().fill('DELETE'); await F().locator('a[id$="btnDelOK"]').first().click(); await ap.waitForTimeout(4500); } }
  const postSame = await grid();
  // re-open from scratch to read what is really stored
  await ap.getByRole('link', { name: 'Users' }).first().click();
  await ap.waitForTimeout(4000);
  await ap.frames().find(x => x.url().includes('Users.aspx')).getByText(TARGET_USER, { exact: true }).first().click();
  await ap.waitForTimeout(4000);
  await F().getByText('Access Rights', { exact: true }).first().click();
  await ap.waitForTimeout(3000);
  const post = await grid();
  const pick = a => a.filter(r => /Leads|Action Plan|User-defined/.test(r));
  return JSON.stringify({ user: TARGET_USER, want: WANT, before: pick(pre), rightAfterSave: pick(postSame), reopened: pick(post) });
}
