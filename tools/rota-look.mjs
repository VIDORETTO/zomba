// Fotos da estrada do Rota: névoa, vegetação, milharal, ruínas e um item no chão visto de longe.
// Uso: node tools/rota-look.mjs <pasta>
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click('#map-choice [data-map="rota"]');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const s = window.__game.transport.sim;
  s.toSpawn = 0;
  s.zombies.clear();
  s.players.get('local').health = s.players.get('local').maxHealth = 99999;
  s.world.map.fogCreatures = false;
});
// [nome, x, z, yaw, pitch]  (yaw 0 = olhando para -z)
const shots = [
  ['r1-estrada', -60, -30, 2.2, 0.02],
  ['r2-mata', -150, -115, -2.4, 0.04],
  ['r3-milharal', -238, 30, -1.6, 0.02],
  ['r4-estrada-fazenda', -240, 140, 2.8, 0.03],
  ['r5-ruina', -40, -60, 1.5, 0.02],
  ['r6-usina-estrada', 40, 245, -1.3, 0.03],
  ['r7-parada', 0, 14, 0, 0.1],
];
for (const [name, x, z, yaw, pitch] of shots) {
  await page.evaluate(([x, z, yaw, pitch]) => { window.__game.transport.sim.zombies.clear(); window.__game.debugView(x, z, yaw, pitch); }, [x, z, yaw, pitch]);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${name}.png` });
}
// item no chão na estrada, visto a 35 m
await page.evaluate(() => {
  const s = window.__game.transport.sim;
  s.powerups.push({ id: 900, kind: 'insta', x: -95, y: 0, z: -62, t: 0 });
  window.__game.debugView(-75, -32, 0.59, 0.02);
});
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/r8-item-longe.png` });
// e atrás do jogador: marcador na borda da tela
await page.evaluate(() => window.__game.debugView(-75, -32, 0.59 + Math.PI * 0.75, 0.02));
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/r9-item-atras.png` });
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); };
  requestAnimationFrame(f);
}));
const info = await page.evaluate(() => ({ calls: window.__game.renderer.info.render.calls, tris: window.__game.renderer.info.render.triangles }));
console.log('FPS', fps, info, 'erros:', errs.slice(0, 3));
await browser.close();
