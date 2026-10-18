// Captura a recarga de cada arma em vários momentos (câmera lenta), para conferir as animações.
// Uso: node tools/reload.mjs <pasta> [arma,arma...]
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const only = process.argv[3]?.split(',');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.evaluate(() => { const sim = window.__game.transport.sim; sim.toSpawn = 0; sim.zombies.clear(); });
await page.evaluate(() => window.__game.debugView(0, 20, 0, 0));
await page.waitForTimeout(800);

const guns = only ?? ['pistol', 'carbine', 'doublebarrel', 'smg', 'rifle', 'pump', 'lmg', 'sniper', 'dualpistol', 'autoshotgun', 'launcher', 'crossbow', 'raygun'];
const moments = [0.1, 0.22, 0.36, 0.5, 0.6, 0.75, 0.9];
for (const id of guns) {
  await page.evaluate(() => { const sim = window.__game.transport.sim; sim.toSpawn = 0; sim.zombies.clear(); const p = sim.players.get('local'); p.health = p.maxHealth; });
  await page.evaluate((id) => { const p = window.__game.transport.sim.players.get('local'); p.weapons = ["pistol", id]; }, id);
  await page.waitForTimeout(300);
  await page.evaluate((id) => window.__game.weapon.switchTo(id), id);
  await page.waitForTimeout(900);
  for (const empty of [true, false]) {
    if (!empty && ['doublebarrel', 'launcher', 'crossbow'].includes(id)) continue;
    // arma vazia (ou com metade) e recarga 20x mais lenta
    const len = await page.evaluate((empty) => {
      const w = window.__game.weapon;
      const s = w.slots[w.cur];
      s.ammo = empty ? 0 : Math.floor(s.def.mag / 2);
      s.reserve = s.def.reserve;
      w.slideLocked = empty && s.def.cls === 'pistol';
      w.startReload();
      w.reloadScale *= 20;
      w.reloadLen *= 20;
      return w.reloadLen;
    }, empty);
    for (const u of moments) {
      await page.evaluate((u) => { const w = window.__game.weapon; w.stateT = u * w.reloadLen; }, u);
      await page.waitForTimeout(120);
      await page.screenshot({ path: `${out}/r-${id}-${empty ? 'vazia' : 'meia'}-${Math.round(u * 100)}.png` });
    }
    const st = await page.evaluate(() => {
      const w = window.__game.weapon;
      w.stateT = w.reloadLen;
      return null;
    });
    await page.waitForTimeout(150);
    const res = await page.evaluate(() => { const w = window.__game.weapon; return [w.ammo, w.def.mag, w.state]; });
    console.log(id, empty ? 'vazia' : 'meia', 'duração', (len / 20).toFixed(2), 's → munição', res[0], '/', res[1], res[2]);
  }
}
console.log('erros:', errs.length ? errs.slice(0, 3).join(' | ') : 'nenhum');
await browser.close();
