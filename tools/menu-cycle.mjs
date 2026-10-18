// Entra e sai de partidas várias vezes (alternando os mapas) e mede o que fica preso na placa de vídeo.
// Uso: node tools/menu-cycle.mjs [vezes]
import { chromium } from 'playwright-core';
const times = Number(process.argv[2] ?? 4);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
for (let i = 0; i < times; i++) {
  const map = i % 2 ? 'rota' : 'cidade';
  await page.click(`#map-choice [data-map="${map}"]`);
  await page.click('#btn-solo');
  await (await page.waitForFunction(() => window.__game, null, { timeout: 90000 })).dispose();
  await page.waitForTimeout(2500);
  // compra uma arma e gira a caixa para criar modelos novos
  await page.evaluate(() => {
    const p = window.__game.transport.sim.players.get('local');
    p.weapons = ['pistol', 'smg_pap'];
  });
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => {
    window.gc?.();
    const r = window.__game.renderer;
    return { geo: r.info.memory.geometries, tex: r.info.memory.textures, progs: r.info.programs?.length ?? -1, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1 };
  });
  console.log(`partida ${i + 1} (${map}):`, JSON.stringify(info));
  await page.evaluate(() => {
    const g = window.__game;
    g.o.onExit();
    window.__game = null;
  });
  await page.waitForTimeout(1200);
}
console.log('erros:', errs.length, errs.slice(0, 5).join(' | '));
await browser.close();
