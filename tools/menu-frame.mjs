// Fotografa um instante de um plano do fundo do menu, sem os botões por cima.
// Uso: node tools/menu-frame.mjs <saida.png> <mapa> <plano> <instante 0..1> [espera ms]
import { chromium } from 'playwright-core';
const [out, map = 'cidade', shot = '0', k = '0.5', wait = '3000'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click(`#map-choice [data-map="${map}"]`);
await (await page.waitForFunction((m) => window.__menu?.map.id === m, map, { timeout: 60000 })).dispose();
await page.evaluate(([i, k]) => window.__menu.debugShot(i, k), [Number(shot), Number(k)]);
await page.waitForTimeout(Number(wait));
await page.evaluate(() => (document.getElementById('menu').style.visibility = 'hidden'));
await page.screenshot({ path: out });
await browser.close();
