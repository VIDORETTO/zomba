// Mede, arma por arma, se o tiro acerta um zumbi parado à frente (dano na simulação e marcador na tela).
// Uso: node tools/probe-hits.mjs [armas separadas por vírgula] [distância]
import { chromium } from 'playwright-core';
const only = process.argv[2]?.split(',');
const dist = Number(process.argv[3] ?? 8);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.waitForTimeout(3500);
// conta os marcadores de acerto que aparecem na tela
await page.evaluate(() => {
  window.__marks = 0;
  const hud = window.__game.hud;
  const orig = hud.hitmarker.bind(hud);
  hud.hitmarker = (k) => { window.__marks++; orig(k); };
});
const ids = only ?? await page.evaluate(() => Object.keys(window.__game.constructor.WEAPON_IDS ?? {}));
const results = [];
for (const id of ids) {
  const r = await page.evaluate(async ({ id, dist }) => {
    const g = window.__game;
    const sim = g.transport.sim;
    sim.toSpawn = 0;
    sim.zombies.clear();
    const p = sim.players.get('local');
    p.weapons = ['pistol', id];
    p.health = p.maxHealth = 99999;
    await new Promise((r) => setTimeout(r, 300));
    g.weapon.switchTo(id);
    await new Promise((r) => setTimeout(r, 800));
    // zumbi parado no meio da rua, com muita vida
    g.debugView(0, 24, 0, 0);
    sim.spawnZombie();
    const z = [...sim.zombies.values()].pop();
    Object.assign(z, { x: 0, z: 24 - dist, y: 0, anim: 'move', speed: 0, hp: 1e7, entry: -1, phase: 'none' });
    await new Promise((r) => setTimeout(r, 500));
    const hp0 = z.hp;
    window.__marks = 0;
    let shots = 0;
    for (let i = 0; i < 3; i++) {
      g.lookAtNearestZombie(1.2);
      const w = g.weapon;
      w.slots[w.cur].ammo = w.def.mag;
      g.debugShoot();
      shots++;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return { id, dmg: Math.round(hp0 - z.hp), marks: window.__marks, shots };
  }, { id, dist });
  results.push(r);
  console.log(`${r.id.padEnd(14)} dano ${String(r.dmg).padStart(7)}  marcadores ${r.marks}/${r.shots}`);
}
console.log('erros:', errs.length ? errs.slice(0, 3).join(' | ') : 'nenhum');
await browser.close();
