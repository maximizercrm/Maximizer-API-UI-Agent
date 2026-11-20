async (page) => {
  const WANT = 'RIMD'; // letters from R,I,M,D that must be ON for Action Plan Library / Workflow Templates; '' = none
  const ok = { Read: WANT.includes('R'), Insert: WANT.includes('I'), Modify: WANT.includes('M'), Delete: WANT.includes('D') };
  await page.goto('https://staging1.maximizercrmlive.com/web2026M11/Content/ContentPage.aspx');
  await page.waitForTimeout(6000);
  for (const p of page.context().pages()) if (p !== page) await p.close();
  await page.getByRole('listitem', { name: 'Administration' }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('listitem', { name: 'Administration' }).locator('iframe').contentFrame().getByRole('link', { name: 'Administrator', exact: true }).click();
  await page.waitForTimeout(6000);
  const ap = page.context().pages().find(p => p.url().includes('admin2026M11'));
  await ap.getByRole('link', { name: 'Users' }).first().click();
  await ap.waitForTimeout(4000);
  await ap.frames().find(x => x.url().includes('Users.aspx')).getByText('ABROWN', { exact: true }).first().click();
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
  { const del = F().locator('input[id$="txtDelRights"]'); if (await del.count() && await del.first().isVisible().catch(() => false)) { await del.first().fill('DELETE'); await F().locator('a[id$="btnDelOK"]').first().click(); await ap.waitForTimeout(4500); } }
  const postSame = await grid();
  // re-open from scratch to read what is really stored
  await ap.getByRole('link', { name: 'Users' }).first().click();
  await ap.waitForTimeout(4000);
  await ap.frames().find(x => x.url().includes('Users.aspx')).getByText('ABROWN', { exact: true }).first().click();
  await ap.waitForTimeout(4000);
  await F().getByText('Access Rights', { exact: true }).first().click();
  await ap.waitForTimeout(3000);
  const post = await grid();
  const pick = a => a.filter(r => /Leads|Action Plan|User-defined/.test(r));
  return JSON.stringify({ want: WANT, rightAfterSave: pick(postSame), reopened: pick(post) });
}
