// Fotografa um Cão Infernal de perto: parado, correndo, mordendo e chegando no raio.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.evaluate(() => {
  const g = window.__game;
  g.transport.sim.nextHellRound = 1;
  g.transport.sim.players.get('local').health = 99999;
  g.debugView(0, 8, 0, 0);
});
await page.waitForFunction(() => [...window.__game.transport.sim.zombies.values()].some((z) => z.kind === 3 && z.anim !== 'rise'), null, { timeout: 20000 });

// um cão parado de lado, a 2,5 m; os outros somem
const pose = (o) => page.evaluate((o) => {
  const g = window.__game;
  const sim = g.transport.sim;
  sim.toSpawn = 0;
  const p = sim.players.get('local');
  const dogs = [...sim.zombies.values()].filter((z) => z.kind === 3);
  for (const z of dogs.slice(1)) sim.zombies.delete(z.id);
  const d = dogs[0];
  d.x = p.x + o.dx;
  d.z = p.z + o.dz;
  d.yaw = o.yaw;
  d.speed = o.speed;
  d.anim = o.anim;
  d.attackT = 0;
  d.t = 0;
  g.debugView(p.x, p.z, 0, -0.2);
  return d.id;
}, o);

await pose({ dx: 0, dz: -2.6, yaw: Math.PI / 2, speed: 0, anim: 'move' });
await page.evaluate(() => { const sim = window.__game.transport.sim; sim.zombies.forEach((z) => { z.speed = 0; }); });
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/d1-parado-lado.png` });

// de frente
await page.evaluate(() => { const sim = window.__game.transport.sim; sim.zombies.forEach((z) => { z.yaw = 0; }); });
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/d2-frente.png` });

// correndo de lado (o cão corre em círculo, perto do jogador)
await page.evaluate(() => {
  const g = window.__game;
  const sim = g.transport.sim;
  const p = sim.players.get('local');
  const d = [...sim.zombies.values()][0];
  let a = 0;
  window.__runDog = setInterval(() => {
    a += 0.05;
    d.x = p.x + Math.sin(a) * 3.2 - 0;
    d.z = p.z - 3.2 + Math.cos(a) * 0.01 - 0;
    d.x = p.x - 3 + ((a * 6) % 6);
    d.yaw = Math.PI / 2;
    d.anim = 'move';
  }, 50);
});
await page.waitForTimeout(450);
await page.screenshot({ path: `${out}/d3-correndo-a.png` });
await page.waitForTimeout(130);
await page.screenshot({ path: `${out}/d4-correndo-b.png` });
await page.evaluate(() => clearInterval(window.__runDog));

// mordendo, vindo na direção do jogador
await page.evaluate(() => {
  const sim = window.__game.transport.sim;
  const p = sim.players.get('local');
  const d = [...sim.zombies.values()][0];
  d.x = p.x + 0.4;
  d.z = p.z - 1.6;
  d.yaw = Math.PI;
  d.speed = 0;
});
await page.waitForTimeout(300);
await page.evaluate(() => {
  const d = [...window.__game.transport.sim.zombies.values()][0];
  d.anim = 'attack';
  d.attackT = 0;
  d.attackHit = true;
});
await page.waitForTimeout(260);
await page.screenshot({ path: `${out}/d5-mordida.png` });

// chegando no raio
await page.evaluate(() => {
  const sim = window.__game.transport.sim;
  const p = sim.players.get('local');
  const d = [...sim.zombies.values()][0];
  d.x = p.x;
  d.z = p.z - 6;
  d.anim = 'rise';
  d.t = 0;
  sim.emit({ e: 'dogspawn', zid: d.id, x: d.x, z: d.z });
});
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/d6-raio.png` });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/d7-chegou.png` });
await browser.close();
