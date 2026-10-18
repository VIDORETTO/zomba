// Teste no navegador (headless): recargas animadas de todas as armas.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
let ok = 0, bad = 0;
const check = (name, cond, detail = '') => { cond ? ok++ : bad++; console.log(`${cond ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` (${detail})` : ''}`); };

await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
const calm = () => page.evaluate(() => { const sim = window.__game.transport.sim; sim.toSpawn = 0; sim.zombies.clear(); const p = sim.players.get('local'); p.health = p.maxHealth; });
await calm();
await page.evaluate(() => window.__game.debugView(0, 20, 0, 0));
await page.waitForTimeout(800);

const hold = async (id) => {
  await calm();
  await page.evaluate((id) => { const p = window.__game.transport.sim.players.get('local'); p.weapons = ['pistol', id]; }, id);
  await page.waitForTimeout(300);
  await page.evaluate((id) => window.__game.weapon.switchTo(id), id);
  await page.waitForTimeout(800);
};

// cada arma termina a recarga cheia (vazia e pela metade), 4x mais rápido
const guns = ['pistol', 'carbine', 'doublebarrel', 'smg', 'rifle', 'pump', 'lmg', 'sniper', 'dualpistol', 'autoshotgun', 'launcher', 'crossbow', 'raygun',
  'burstrifle', 'revolver', 'burstpistol', 'machinepistol', 'dmr', 'rocket', 'blade', 'drum'];
for (const id of guns) {
  await hold(id);
  for (const empty of [true, false]) {
    const start = await page.evaluate((empty) => {
      const w = window.__game.weapon;
      const s = w.slots[w.cur];
      s.ammo = empty ? 0 : Math.max(0, Math.floor(s.def.mag / 2));
      s.reserve = s.def.reserve;
      if (s.ammo === s.def.mag) return null;
      w.startReload();
      w.reloadScale /= 4;
      w.reloadLen /= 4;
      return { id: w.def.id, state: w.state, len: w.reloadLen };
    }, empty);
    if (!start) continue;
    await page.waitForTimeout(start.len * 1000 + 400);
    const end = await page.evaluate(() => { const w = window.__game.weapon; return { id: w.def.id, ammo: w.ammo, mag: w.def.mag, state: w.state, hand: w.slots[w.cur].model.left?.position.distanceTo(w.slots[w.cur].model.leftRest) ?? 0 }; });
    check(`${id} ${empty ? 'vazia' : 'pela metade'} recarrega cheia`, start.state === 'reload' && end.id === id && end.ammo === end.mag && end.state === 'idle' && end.hand < 0.001, JSON.stringify(end));
  }
}

// escopeta de repetição: cartucho por cartucho, e o tiro interrompe
await hold('pump');
await page.evaluate(() => { const w = window.__game.weapon; const s = w.slots[w.cur]; s.ammo = 0; s.reserve = 30; w.startReload(); });
await page.waitForTimeout(1050);
const mid = await page.evaluate(() => { const w = window.__game.weapon; return { ammo: w.ammo, state: w.state }; });
check('repetição põe um cartucho por vez', mid.state === 'reload' && mid.ammo >= 1 && mid.ammo < 6, JSON.stringify(mid));
await page.mouse.move(640, 360);
await page.mouse.down();
await page.waitForTimeout(60);
await page.mouse.up();
await page.waitForTimeout(150);
const after = await page.evaluate(() => { const w = window.__game.weapon; return { ammo: w.ammo, state: w.state }; });
check('atirar interrompe a recarga e dispara', after.state === 'idle' && after.ammo === mid.ammo - 1, `${JSON.stringify(mid)} -> ${JSON.stringify(after)}`);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/rl-pump-tiro.png` });

// cápsulas voam ao atirar com o fuzil
await hold('rifle');
await page.mouse.down();
await page.waitForTimeout(120);
const casings = await page.evaluate(() => window.__game.weapon.debris.length);
await page.screenshot({ path: `${out}/rl-capsulas.png` });
await page.mouse.up();
check('cápsulas saltam do fuzil', casings > 0, `${casings} no ar`);

// Reflexo: a recarga inteira fica mais rápida
await page.evaluate(() => { const w = window.__game.weapon; const s = w.slots[w.cur]; s.ammo = 0; s.reserve = 100; });
await page.waitForTimeout(300);
const normal = await page.evaluate(() => { const w = window.__game.weapon; w.startReload(); const l = w.reloadLen; w.stateT = l; return l; });
await page.waitForTimeout(300);
const fast = await page.evaluate(() => { const w = window.__game.weapon; const s = w.slots[w.cur]; s.ammo = 0; w.mods.reload = 0.5; w.startReload(); return w.reloadLen; });
check('Reflexo encurta a recarga pela metade', Math.abs(fast - normal / 2) < 0.01, `${normal.toFixed(2)} s -> ${fast.toFixed(2)} s`);

// desenho do Fuzil de rajada nos fundos da Farmácia
await page.evaluate(() => { window.__game.transport.sim.zombies.clear(); window.__game.debugView(-38, 24.2, 0, 0.05); });
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/rl-parede-rajada.png` });
check('sem erros na página', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${ok} ok, ${bad} falharam`);
await browser.close();
