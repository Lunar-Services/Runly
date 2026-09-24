/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node browser audit. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ headless:true, channel:'msedge' });
  const page = await browser.newPage({ viewport:{ width:1440, height:900 } });
  const results=[];
  for (const theme of ['light','dark']) {
    await page.context().addCookies([{name:'runly-theme',value:theme,url:'http://localhost:3000'}]);
    for (const route of ['/', '/login','/signup','/verify-email','/forgot-password','/reset-password','/pricing','/privacy','/terms','/dashboard','/settings','/cowork','/admin','/project/new']) {
      await page.goto('http://localhost:3000'+route);
      await page.waitForLoadState('networkidle');
      results.push(await page.evaluate(({route,theme})=>({route,theme,url:location.pathname,applied:document.documentElement.dataset.theme,overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('button,.button')].filter(e=>e.getBoundingClientRect().height>0).map(e=>({label:e.textContent.trim()||e.getAttribute('aria-label'),background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}))}),{route,theme}));
    }
    await page.goto('http://localhost:3000/');
    await page.locator('.site-header').waitFor();
    await page.waitForLoadState('networkidle');
    await page.screenshot({path:`theme-${theme}-desktop.png`});
    await page.evaluate(()=>scrollTo(0,650));
    await page.waitForTimeout(250);
    results.push({theme,header:await page.locator('.site-header').evaluate(e=>({background:getComputedStyle(e).backgroundColor,blur:getComputedStyle(e).backdropFilter}))});
    await page.setViewportSize({width:390,height:844});
    await page.goto('http://localhost:3000/');
    await page.locator('.site-header').waitFor();
    await page.getByRole('button',{name:'Open navigation'}).click();
    await page.waitForTimeout(250);
    await page.screenshot({path:`theme-${theme}-mobile-menu.png`});
    results.push({theme,mobileMenu:await page.locator('#main-navigation').evaluate(e=>({width:e.getBoundingClientRect().width,visible:getComputedStyle(e).visibility,background:getComputedStyle(e).backgroundColor}))});
    await page.setViewportSize({width:1440,height:900});
  }
  fs.writeFileSync('theme-audit-results.json',JSON.stringify(results,null,2));
  await browser.close();
  console.log(JSON.stringify({checks:results.length,overflows:results.filter(r=>r.overflow),protectedRedirects:results.filter(r=>r.route&&r.route!==r.url).map(r=>r.route)}));
})().catch(e=>{console.error(e);process.exit(1)});
