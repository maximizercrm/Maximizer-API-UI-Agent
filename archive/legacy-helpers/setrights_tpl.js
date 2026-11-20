async (page) => {
  // __W__ is replaced by letters among R,I,M,D that should be GRANTED for ABROWN's Workflow Templates right.
  const W = '__W__';
  const WANT = { Read: W.includes('R') ? 2 : 1, Insert: W.includes('I') ? 2 : 1, Modify: W.includes('M') ? 2 : 1, Delete: W.includes('D') ? 2 : 1 };
  const ctx = page.context();
  await page.goto('https://qa1.maximizercrmlive.com/webMain/Content/ContentPage.aspx');
  await page.waitForTimeout(4000);
  await page.getByText('Administration', { exact: true }).first().click();
  await page.waitForTimeout(1000);
  const [adm] = await Promise.all([ctx.waitForEvent('page', { timeout: 20000 }), page.mouse.click(310, 639)]);
  await adm.waitForLoadState('networkidle'); await adm.waitForTimeout(3000);
  await adm.goto('https://qa1.maximizercrmlive.com/adminMain/Content/UserDetails.aspx?CID=User&Key=VXNlcglBQlJPV04%3d&flag=0');
  await adm.getByText('Access Rights', { exact: true }).click();
  await adm.getByText('Modify User Access Settings').click();
  await adm.waitForLoadState('networkidle');
  const log = [];
  for (const k of ['Read', 'Insert', 'Modify', 'Delete']) {
    for (let i = 0; i < 4; i++) {
      const inp = adm.locator(`input[id$="ctl16$tchPer${k}"]`);
      if (!(await inp.count())) { await adm.waitForTimeout(1500); continue; }
      const v = Number(await inp.inputValue());
      if ((WANT[k] === 2 && v === 2) || (WANT[k] !== 2 && v !== 2)) { log.push(k + '=' + v); break; }
      await inp.locator('xpath=following-sibling::span[1]').click();
      await adm.waitForLoadState('networkidle');
      await adm.waitForTimeout(500);
    }
  }
  await adm.getByText('Save Settings').click();
  await adm.waitForTimeout(1500);
  if (W.includes('D')) {
    const box = adm.locator('input[type="text"]').first();
    if (await box.isVisible().catch(() => false)) {
      await box.fill('DELETE');
      await adm.getByText('OK', { exact: true }).click();
    }
  }
  await adm.waitForLoadState('networkidle');
  await adm.waitForTimeout(1500);
  await adm.screenshot({ path: '.playwright-mcp/rights-last.png', fullPage: true });
  await adm.close();
  return { W, log };
}
