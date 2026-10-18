// Fotografa o Carrasco de perto: parado, golpe, corrente (de lado) e investida.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.evaluate(() => { const r = document.querySelector('#in-round'); r.value = '12'; r.dispatchEvent(new Event('input')); });
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.evaluate(() => {
  const s = window.__game.transport.sim;
  s.nextHellRound = 99;
  s.nextBossRound = 12;
  s.players.get('local').health = s.players.get('local').maxHealth = 99999;
});
await page.waitForFunction(() => window.__game.transport.sim.state === 'active', null, { timeout: 15000 });
await page.evaluate(() => { const s = window.__game.transport.sim; s.toSpawn = 0; s.zombies.clear(); window.__game.debugView(0, 24, 0, 0); });
await page.waitForFunction(() => [...window.__game.transport.sim.zombies.values()].some((z) => z.kind === 4 && z.anim === 'move'), null, { timeout: 8000 });
const set = (o) => page.evaluate((o) => {
  const s = window.__game.transport.sim;
  const z = [...s.zombies.values()].find((z) => z.kind === 4);
  Object.assign(z, { x: o.x, z: o.z, y: 0, yaw: o.yaw ?? z.yaw, speed: o.speed ?? 0 });
  z.boss.chainCD = z.boss.chargeCD = z.boss.slamCD = 99;
  if (o.anim) { z.anim = o.anim; z.attackT = 0; z.attackHit = false; z.boss.target = 'local'; }
  if (o.cam) window.__game.debugView(o.cam[0], o.cam[1], o.cam[2] ?? 0, o.cam[3] ?? 0.12);
}, o);

await set({ x: 0, z: 18.5, cam: [0, 24, 0, 0.16] });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/c1-perto.png` });

// corrente de lado: o alvo é um ponto à esquerda da câmera
await page.evaluate(() => { const g = window.__game; g.zombies.locate = () => g.camera.position.clone().set(-7, 1.2, 17); });
await set({ x: 3, z: 17, cam: [0, 24.5, 0, 0.1], anim: 'chain' });
await page.evaluate(() => {
  const g = window.__game;
  const z = [...g.transport.sim.zombies.values()].find((z) => z.kind === 4);
  g.zombies.view(z.id).chain = { pid: 'x' };
});
await page.waitForTimeout(950);
await page.screenshot({ path: `${out}/c2-corrente.png` });

await set({ x: 0, z: 18.5, cam: [0, 24, 0, 0.16], anim: 'attack' });
await page.waitForTimeout(650);
await page.screenshot({ path: `${out}/c3-golpe.png` });

await page.waitForTimeout(1200);
await set({ x: 0, z: 17, cam: [0, 24, 0, 0.12], anim: 'charge' });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/c4-rugido.png` });
await browser.close();
