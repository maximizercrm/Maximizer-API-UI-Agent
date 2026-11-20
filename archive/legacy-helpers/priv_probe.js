async (page) => {
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
  const html = await adm.locator('tr:has-text("Allow private entries")').last().evaluate(e => e.outerHTML);
  return html.slice(0, 1800);
}
