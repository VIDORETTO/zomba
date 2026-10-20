// Fotografa o menu e cada plano de câmera do fundo 3D, nos dois mapas, e a tela de carregamento.
// Uso: node tools/menu-shots.mjs <pasta> [largura] [altura]
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const width = Number(process.argv[3] ?? 1280);
const height = Number(process.argv[4] ?? 720);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width, height } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
for (const map of ['cidade', 'rota']) {
  await page.click(`#map-choice [data-map="${map}"]`);
  await (await page.waitForFunction((m) => window.__menu?.map.id === m, map, { timeout: 60000 })).dispose();
  for (let i = 0; i < 3; i++) {
    await page.evaluate((i) => window.__menu.debugShot(i, 0.15), i);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/menu-${map}-${i}.png` });
  }
}
// tela de carregamento (fotografada logo depois do clique)
await page.click('#btn-solo');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/menu-carregando.png` });
await (await page.waitForFunction(() => window.__game, null, { timeout: 90000 })).dispose();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/menu-entrou.png` });
console.log('erros:', JSON.stringify(errs));
await browser.close();
