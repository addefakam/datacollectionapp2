import pkg from '/home/z/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const base = process.env.BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 600));
});
page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e.message).slice(0, 1000)));

await page.goto(base, { waitUntil: 'load', timeout: 45000 });
await page.waitForTimeout(2500);

// Login
await page.fill('#username', 'admin');
await page.fill('#password', 'admin123');
await page.click('button[type=submit]');
await page.waitForTimeout(6000);

const text1 = await page.evaluate(() => document.body.innerText.slice(0, 500));
console.log('=== AFTER LOGIN (body snippet) ===');
console.log(text1);

// Navigate to Analytics (the new recharts page)
const clicked = await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('aside button')).find((x) => x.textContent.trim() === 'Analytics');
  if (!b) return 'ANALYTICS BTN NOT FOUND';
  b.click();
  return 'CLICKED';
});
console.log('=== NAV ===', clicked);
await page.waitForTimeout(6000);
const text2 = await page.evaluate(() => document.body.innerText.slice(0, 400));
console.log('=== ANALYTICS VIEW (body snippet) ===');
console.log(text2);

console.log('=== ERRORS (' + errors.length + ') ===');
console.log(errors.length ? errors.join('\n') : '(none)');
await page.screenshot({ path: '/tmp/prod-auth-check.png' });
await browser.close();
