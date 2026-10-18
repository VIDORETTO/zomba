// Confere que editar um arquivo NÃO recarrega a página aberta.
import { chromium } from 'playwright-core';
import { utimesSync } from 'node:fs';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:5173/');
await page.evaluate(() => { window.__marca = 42; });
const now = new Date();
utimesSync('src/client/hud.ts', now, now);
utimesSync('src/shared/sim.ts', now, now);
await page.waitForTimeout(2500);
const marca = await page.evaluate(() => window.__marca).catch(() => 'página recarregou');
console.log(marca === 42 ? 'OK: a página não recarregou' : 'FALHA: a página recarregou');
await browser.close();
