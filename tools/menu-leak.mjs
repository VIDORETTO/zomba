// Troca o mapa do menu várias vezes e mede o que o fundo 3D deixa preso na placa de vídeo.
// Uso: node tools/menu-leak.mjs [vezes]
import { chromium } from 'playwright-core';
const n = Number(process.argv[2] ?? 6);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
for (let i = 0; i < n; i++) {
  const map = i % 2 ? 'cidade' : 'rota';
  await page.click(`#map-choice [data-map="${map}"]`);
  await (await page.waitForFunction((m) => window.__menu?.map.id === m, map, { timeout: 60000 })).dispose();
  await page.waitForTimeout(1500);
  const mem = await page.evaluate(() => {
    const r = window.__menu.renderer.info;
    return { geo: r.memory.geometries, tex: r.memory.textures, progs: r.programs.length };
  });
  console.log(`menu ${i + 1} (${map}):`, JSON.stringify(mem));
}
console.log('erros:', errs.length, errs.slice(0, 3).join(' | '));
await browser.close();
