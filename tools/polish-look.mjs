// Fotos para revisar o acabamento: menu, HUD em combate, zumbis de perto, caixa, máquina, Forja, pausa e fim de jogo.
// Uso: node tools/polish-look.mjs <pasta> [cidade|rota]
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const map = process.argv[3] ?? 'cidade';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click(`#map-choice [data-map="${map}"]`);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/${map}-p0-menu.png` });
await page.click('#btn-solo');
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/${map}-p1-carregando.png` });
await (await page.waitForFunction(() => window.__game, null, { timeout: 90000 })).dispose();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/${map}-p2-inicio.png` });
// rodada 6 com zumbis vindo
await page.evaluate(() => {
  const s = window.__game.transport.sim;
  s.stateTimer = 0.1;
  s.round = 5;
  const p = s.players.get('local');
  p.health = p.maxHealth = 99999;
  p.points = 12345;
  p.weapons = ['pistol', 'smg'];
  p.perks = ['couraca', 'reflexo'];
});
await page.waitForTimeout(9000);
await page.evaluate(() => window.__game.lookAtNearestZombie(1.2));
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/${map}-p3-combate.png` });
for (let i = 0; i < 12; i++) {
  await page.evaluate(() => { window.__game.lookAtNearestZombie(1.5); window.__game.debugShoot(); });
  await page.waitForTimeout(120);
}
await page.screenshot({ path: `${out}/${map}-p4-tiros.png` });
// zumbi de perto
await page.evaluate(() => {
  const g = window.__game;
  const z = [...g.transport.sim.zombies.values()].find((z) => z.anim === 'move');
  if (z) {
    z.speed = 0;
    g.debugView(z.x + Math.sin(0.4) * 2.2, z.z + Math.cos(0.4) * 2.2, 0.4, 0.05);
  }
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/${map}-p5-zumbi-perto.png` });
// mira (ADS)
await page.mouse.down({ button: 'right' });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/${map}-p6-mira.png` });
await page.mouse.up({ button: 'right' });
// caixa e uma máquina de bebida de perto
const spots = await page.evaluate(() => {
  const m = window.__game.o.map;
  const b = m.interactables.find((i) => i.kind === 'box' && i.box === 0);
  const perk = m.interactables.find((i) => i.kind === 'perk');
  const wall = m.interactables.find((i) => i.kind === 'weapon');
  return { b: b.use, perk: perk.use, wall: wall.use, bs: m.boxSpots[0], ps: perk };
});
await page.evaluate(({ b, bs }) => {
  window.__game.transport.sim.zombies.clear();
  window.__game.transport.sim.toSpawn = 0;
  window.__game.debugView(b[0] + bs.nx * 1.2, b[1] + bs.nz * 1.2, Math.atan2(bs.nx, bs.nz), -0.25);
}, spots);
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/${map}-p7-caixa.png` });
await page.evaluate(({ perk }) => {
  const m = window.__game.o.map;
  const it = m.interactables.find((i) => i.kind === 'perk');
  // olha para a máquina: ela fica 0.9 m atrás do ponto de uso
  const mach = m.blocks.find((b) => b.mat === 'carPaint' && Math.hypot((b.min[0] + b.max[0]) / 2 - it.use[0], (b.min[2] + b.max[2]) / 2 - it.use[1]) < 1.6);
  const cx = mach ? (mach.min[0] + mach.max[0]) / 2 : perk[0], cz = mach ? (mach.min[2] + mach.max[2]) / 2 : perk[1];
  const dx = perk[0] - cx, dz = perk[1] - cz, l = Math.hypot(dx, dz) || 1;
  window.__game.debugView(cx + (dx / l) * 2.4, cz + (dz / l) * 2.4, Math.atan2(dx, dz), 0.05);
}, spots);
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/${map}-p8-maquina.png` });
// pausa
await page.evaluate(() => window.__game.showPause());
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/${map}-p9-pausa.png` });
await page.evaluate(() => { window.__game.hud.hideOverlay(); window.__game.transport.paused = false; });
// fim de jogo
await page.evaluate(() => {
  const s = window.__game.transport.sim;
  const p = s.players.get('local');
  p.health = p.maxHealth = 100;
  p.perks = [];
  s.damagePlayer(p, 999, p.x, p.z, false);
});
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}/${map}-p10-fim.png` });
console.log('erros:', errs.slice(0, 3));
await browser.close();
