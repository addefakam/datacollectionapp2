import pkg from '/home/z/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const base = process.env.BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 400));
});
page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e.message).slice(0, 600)));

await page.goto(base, { waitUntil: 'load', timeout: 45000 });
await page.waitForTimeout(4000);

const swInfo = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  const keys = await caches.keys();
  return {
    scope: reg.scope,
    cacheNames: keys,
    controlled: !!navigator.serviceWorker.controller,
  };
});
console.log('=== SW STATE ===', JSON.stringify(swInfo));

await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(3500);
const text = await page.evaluate(() => document.body.innerText.slice(0, 200));
console.log('=== AFTER RELOAD ===');
console.log(text.replace(/\n/g, ' | '));

// Offline fallback check: cached shell should still render the branded page
await context.setOffline(true);
await page.reload({ waitUntil: 'load' }).catch(() => {});
await page.waitForTimeout(3500);
const offlineText = await page.evaluate(() => document.body.innerText.slice(0, 150));
console.log('=== OFFLINE RELOAD ===');
console.log(offlineText.replace(/\n/g, ' | '));
await context.setOffline(false);

console.log('=== ERRORS (' + errors.length + ') ===');
console.log(errors.length ? errors.join('\n') : '(none)');
await page.screenshot({ path: '/tmp/sw-check.png' });
await browser.close();
