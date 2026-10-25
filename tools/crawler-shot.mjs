// Fotografa o Rastejador de perto: arrastando-se, mordendo, armando o salto, no ar e escalando.
// Uso: node tools/crawler-shot.mjs <pasta> [porta]
import { launch } from './launch.mjs';
const out = process.argv[2] ?? '.';
const port = process.argv[3] ?? '5173';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/?autoplay`);
await page.waitForLoadState('networkidle');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.evaluate(() => {
  const g = window.__game;
  const sim = g.transport.sim;
  sim.players.get('local').health = 99999;
  sim.toSpawn = 0;
  sim.zombies.clear();
  // a simulação não mexe mais nos zumbis: a pose é a que o script pôs
  sim.updateZombies = () => {};
  const p = sim.players.get('local');
  const z = sim.makeZombie(9, p.x + 100, p.z, 9999, 0, {});
  z.anim = 'move';
  window.__cid = z.id;
  g.debugView(p.x, p.z, 0, -0.25);
});
await page.waitForTimeout(500);
const pose = (o) => page.evaluate((o) => {
  const g = window.__game;
  const sim = g.transport.sim;
  const p = sim.players.get('local');
  const z = sim.zombies.get(window.__cid);
  z.x = p.x + o.dx;
  z.z = p.z + o.dz;
  z.y = o.y ?? 0;
  z.yaw = o.yaw;
  z.anim = o.anim;
  z.speed = 0;
  z.attackT = 0;
  z.attackHit = true;
  g.debugView(p.x, p.z, 0, o.pitch ?? -0.25);
}, o);
// parado, de lado e de frente
await pose({ dx: -1.1, dz: -2.4, yaw: Math.PI / 2, anim: 'move' });
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/c1-lado.png` });
await pose({ dx: 0, dz: -2.2, yaw: 0, anim: 'move' });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/c2-frente.png` });
// arrastando-se de lado
await page.evaluate(() => {
  const sim = window.__game.transport.sim;
  const p = sim.players.get('local');
  const z = sim.zombies.get(window.__cid);
  let a = 0;
  window.__run = setInterval(() => {
    a += 0.05;
    z.x = p.x - 1.5 + ((a * 3) % 3);
    z.z = p.z - 2.4;
    z.yaw = Math.PI / 2;
    z.anim = 'move';
  }, 50);
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/c3-arrastando-a.png` });
await page.waitForTimeout(160);
await page.screenshot({ path: `${out}/c4-arrastando-b.png` });
await page.evaluate(() => clearInterval(window.__run));
// mordida
await pose({ dx: 0.3, dz: -1.5, yaw: Math.PI, anim: 'move' });
await page.waitForTimeout(300);
await page.evaluate(() => { const z = window.__game.transport.sim.zombies.get(window.__cid); z.anim = 'attack'; });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/c5-mordida.png` });
// salto: armando e no ar
await pose({ dx: -1.2, dz: -2.6, yaw: Math.PI / 2, anim: 'leap' });
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/c6-salto-arma.png` });
await pose({ dx: -1.2, dz: -2.6, yaw: Math.PI / 2, anim: 'leap', y: 0.7 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/c7-salto-ar.png` });
// escalando
await pose({ dx: -1.2, dz: -2.6, yaw: Math.PI / 2, anim: 'wall', y: 1.2 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/c8-escalando.png` });
await browser.close();
