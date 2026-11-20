async (page) => {
  // Usage: edit WANT below. 2 = granted, 1 = denied. Operates on ABROWN's Access Rights tab in Administrator.
  const WANT = { Read: 1, Insert: 1, Modify: 1, Delete: 1 };
  const base = 'https://qa1.maximizercrmlive.com/adminMain/Content/UserDetails.aspx?CID=User&Key=VXNlcglBQlJPV04%3d&flag=0';
  await page.goto(base);
  await page.getByText('Access Rights', { exact: true }).click();
  await page.getByText('Modify User Access Settings').click();
  await page.waitForLoadState('networkidle');
  const log = [];
  for (const k of ['Read', 'Insert', 'Modify', 'Delete']) {
    for (let i = 0; i < 4; i++) {
      const inp = page.locator(`input[id$="ctl16$tchPer${k}"]`);
      const v = Number(await inp.inputValue());
      if ((WANT[k] === 2 && v === 2) || (WANT[k] !== 2 && v !== 2)) { log.push(k + '=' + v); break; }
      await inp.locator('xpath=following-sibling::span[1]').click();
      await page.waitForLoadState('networkidle');
    }
  }
  await page.getByText('Save Settings').click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  const row = await page.locator('tr:has-text("Workflow Templates")').last().locator('img').evaluateAll(els => els.map(e => e.getAttribute('src').split('_').pop()));
  return { log, row, url: page.url() };
}
