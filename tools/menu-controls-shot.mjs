// Fotografa o painel de controles do menu principal. Uso: node tools/menu-controls-shot.mjs <pasta>
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await (await page.waitForFunction(() => window.__menu, null, { timeout: 60000 })).dispose();
await page.click('#btn-controls');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/menu-controles.png` });
console.log('cabe:', await page.evaluate(() => { const b = document.querySelector('#panel-controls [data-back]').getBoundingClientRect(); return b.bottom <= innerHeight; }));
await browser.close();
