import pkg from '/home/z/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const base = process.env.BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 500));
});
page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e.message).slice(0, 800)));
page.on('requestfailed', (r) => errors.push('[requestfailed] ' + r.url() + ' ' + (r.failure()?.errorText || '')));

await page.goto(base, { waitUntil: 'load', timeout: 45000 }).catch((e) => errors.push('[goto] ' + e.message));
await page.waitForTimeout(5000);
const text = await page.evaluate(() => document.body.innerText.slice(0, 600));
console.log('=== BODY TEXT (first 600 chars) ===');
console.log(text);
console.log('=== ERRORS (' + errors.length + ') ===');
console.log(errors.length ? errors.join('\n') : '(none)');
await page.screenshot({ path: '/tmp/prod-check.png' });
await browser.close();
