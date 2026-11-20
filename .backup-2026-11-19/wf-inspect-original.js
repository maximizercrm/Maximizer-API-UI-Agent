async (page) => {
  const MAXROWS = 24;
  await page.goto('https://staging1.maximizercrmlive.com/web2026M11/Content/ContentPage.aspx');
  await page.waitForTimeout(6000);
  for (const p of page.context().pages()) if (p !== page) await p.close();
  const nav = await page.getByText('Workflows', { exact: true }).first().isVisible().catch(() => false);
  if (!nav) return JSON.stringify({ workflowsModuleVisible: false, note: 'Workflows module hidden in left nav' });
  await page.getByText('Workflows', { exact: true }).first().click();
  await page.waitForTimeout(5000);
  await page.getByText('Manage Workflow Template').first().click();
  await page.waitForTimeout(5000);
  const header = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button, a')).filter(x => /new workflow/i.test(x.innerText || '') && x.getBoundingClientRect().width > 0);
    return b.map(x => (x.innerText || '').trim() + ':' + ((x.disabled || /disabled/.test(x.className || '')) ? 'disabled' : 'enabled'));
  });
  const total = await page.locator('kendo-menu.k-dots-menu').count();
  const out = [];
  for (let i = 0; i < Math.min(total, MAXROWS); i++) {
    const rec = { i };
    rec.name = await page.evaluate((i) => { const r = document.querySelectorAll('tr.k-master-row')[i]; return r ? r.innerText.replace(/\s+/g, ' ').trim().slice(0, 50) : ''; }, i);
    await page.locator('td.k-hierarchy-cell').nth(i).click().catch(() => {});
    await page.waitForTimeout(1800);
    const d = await page.evaluate((i) => {
      const dr = document.querySelectorAll('tr.k-detail-row')[0];
      if (!dr) return null;
      const t = dr.innerText.replace(/\s+/g, ' ');
      const btns = Array.from(dr.querySelectorAll('button')).map(b => ((b.innerText || b.title || b.getAttribute('aria-label') || '').trim() || 'icon') + ':' + (b.disabled ? 'dis' : 'en'));
      return { inUse: /in use and cannot/i.test(t), btns };
    }, i);
    rec.detail = d;
    await page.locator('td.k-hierarchy-cell').nth(i).click().catch(() => {});
    await page.waitForTimeout(800);
    await page.locator('kendo-menu.k-dots-menu').nth(i).click().catch(() => {});
    await page.waitForTimeout(900);
    rec.menu = await page.evaluate(() => Array.from(document.querySelectorAll('.k-menu-popup .k-item, .k-animation-container [role=menuitem]')).filter(e => e.getBoundingClientRect().width > 0).map(e => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 5);
    await page.waitForTimeout(400);
    out.push(rec.i + '|' + rec.name.slice(0, 40) + '|' + (rec.detail ? (rec.detail.inUse ? 'INUSE' : 'free') + ':' + rec.detail.btns.map(b => b.replace(':en', '+').replace(':dis', '-')).join(',') : 'nodetail') + '|menu=' + rec.menu.join('/'));
  }
  return JSON.stringify({ workflowsModuleVisible: true, header, totalTemplates: total, templates: out });
}
