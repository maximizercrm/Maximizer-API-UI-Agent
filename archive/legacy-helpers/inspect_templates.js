async (page) => {
  await page.waitForTimeout(5000);
  const no = page.getByRole('button', { name: 'No' });
  if (await no.count()) await no.first().click().catch(() => {});
  await page.getByText('Flux de travail', { exact: true }).first().click();
  await page.waitForTimeout(3000);
  const hdr = await page.evaluate(() => [...document.querySelectorAll('button,a,span,div')].filter(e => /Manage Workflow Template|G.rer|mod.le/i.test(e.textContent) && e.children.length < 2 && e.offsetParent).map(e => e.textContent.trim()).slice(0, 4));
  await page.getByText('Manage Workflow Template').click();
  await page.waitForTimeout(4000);
  const out = { header: hdr };
  out.newWorkflowBtn = await page.evaluate(() => [...document.querySelectorAll('button,a')].filter(e => /New Workflow|Nouveau flux|Nouveau mod/i.test(e.textContent)).map(e => ({ t: e.textContent.trim(), dis: e.disabled || /disabled/.test(e.className) })));
  const names = ['QA186076 staged template', 'Guide task workflow 41', 'Guide task workflow 818'];
  out.templates = [];
  for (const n of names) {
    const row = page.getByText(n, { exact: false }).first().locator('xpath=ancestor::tr[1]');
    if (!(await row.count())) { out.templates.push({ n, missing: true }); continue; }
    const t = { n };
    await row.locator('td').first().click();
    await page.waitForTimeout(1200);
    await row.locator('td').last().click();
    await page.waitForTimeout(800);
    t.menu = await page.evaluate(() => [...document.querySelectorAll('.k-menu-popup .k-item, .k-popup li, .k-menu-item, [role=menuitem]')].filter(e => e.offsetParent).map(e => e.textContent.trim() + (/disabled/.test(e.className) ? ' [disabled]' : '')));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    out.templates.push(t);
  }
  out.addBtns = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => /Ajouter une t|Ajouter une .tape|Add Task|Add Stage/i.test(b.textContent)).map(b => b.textContent.trim() + ':' + (b.disabled || /disabled/.test(b.className) ? 'disabled' : 'enabled')));
  out.taskIcons = await page.evaluate(() => [...document.querySelectorAll('.icon-trash, .icon-edit, .icon-pencil, [class*=icon-edit]')].map(e => { const b = e.closest('button'); return (e.className.match(/icon-\w+/) || [''])[0] + ':' + (b ? (/disabled/.test(b.className) ? 'disabled' : 'enabled') : '?'); }));
  out.inUseMsg = await page.evaluate(() => (document.body.innerText.match(/Ce mod.le est en cours[^\n]*/g) || []).length);
  await page.screenshot({ path: '.playwright-mcp/templates-last.png', fullPage: false });
  return out;
}
