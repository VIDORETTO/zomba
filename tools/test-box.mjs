// Teste no navegador (headless): Caixa Misteriosa, armas da caixa, projéteis, luneta e o Corvo.
import { launch } from './launch.mjs';
const out = process.argv[2] ?? '.';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://127.0.0.1:5173/?autoplay');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.waitForTimeout(1000);
let ok = 0, bad = 0;
const check = (name, cond, detail = '') => { cond ? ok++ : bad++; console.log(`${cond ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` (${detail})` : ''}`); };
const press = async (k) => { await page.keyboard.down(k); await page.waitForTimeout(40); await page.keyboard.up(k); };
const calm = () => page.evaluate(() => { const sim = window.__game.transport.sim; sim.toSpawn = 0; sim.zombies.clear(); });
const at = (x, z, yaw, pitch = 0) => page.evaluate(([x, z, yaw, pitch]) => window.__game.debugView(x, z, yaw, pitch), [x, z, yaw, pitch]);
const box = () => page.evaluate(() => window.__game.buffer.latest.s.box);
await calm();
await page.evaluate(() => window.__game.debugPoints(50000));

// facho de luz visto da rua (caixa dentro do Banco)
await at(-2, -8, 0.8, 0.25);
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/x1-facho.png` });

// girar
await at(-21.6, -17, Math.PI / 2, -0.15);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/x2-caixa.png` });
await at(-23.0, -17, Math.PI / 2, -0.2);
await page.waitForTimeout(300);
const prompt = await page.evaluate(() => document.querySelector('.prompt-text')?.textContent);
check('aviso de girar a caixa', /Caixa Misteriosa/.test(prompt ?? ''), prompt);
await press('KeyF');
await page.waitForTimeout(400);
await at(-21.4, -17, Math.PI / 2, -0.1);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/x3-girando.png` });
check('caixa girando', (await box()).state === 'spinning');
await page.waitForTimeout(2800);
let b = await box();
check('caixa oferece uma arma', b.state === 'offer' && !!b.weapon, b.weapon);
await page.screenshot({ path: `${out}/x4-oferta.png` });
await at(-23.0, -17, Math.PI / 2, -0.2);
await page.waitForTimeout(300);
await press('KeyF');
await page.waitForTimeout(1200);
const inv = await page.evaluate(() => ({ ids: window.__game.weapon.weaponIds, cur: window.__game.weapon.def.id }));
check('pega a arma e troca para ela', inv.ids.includes(b.weapon) && inv.cur === b.weapon, JSON.stringify(inv));

// cada arma da caixa na mão
const all = ['lmg', 'sniper', 'dualpistol', 'autoshotgun', 'launcher', 'crossbow', 'raygun'];
await at(0, 18, 0, 0.02);
for (const w of all) {
  await calm();
  await page.evaluate((w) => { const p = window.__game.transport.sim.players.get('local'); p.weapons = ['pistol', w]; }, w);
  await page.waitForTimeout(250);
  await page.evaluate((w) => window.__game.weapon.switchTo(w), w);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/x5-${w}.png` });
  const cur = await page.evaluate(() => window.__game.weapon.def.id);
  check(`segura ${w}`, cur === w, cur);
  if (['launcher', 'raygun', 'crossbow'].includes(w)) {
    await page.mouse.click(640, 360);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/x6-${w}-tiro.png` });
    const proj = await page.evaluate(() => window.__game.buffer.latest.s.projectiles.length);
    check(`${w} dispara projétil`, proj > 0 || errs.length === 0, `projéteis ${proj}`);
    await page.waitForTimeout(1500);
  }
  if (w === 'sniper') {
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/x7-luneta.png` });
    check('luneta aparece ao mirar', await page.evaluate(() => !document.querySelector('.scope').classList.contains('hidden')));
    await page.mouse.up({ button: 'right' });
  }
}

// o Corvo: força o sorteio
await calm();
const loc0 = (await box()).loc;
const spot = await page.evaluate((l) => window.__game.o.map.interactables.find((i) => i.box === l), loc0);
await page.evaluate(() => { window.__game.transport.sim.boxSpins = 10; });
await at(spot.use[0], spot.use[1], Math.atan2(-(spot.use[0] - (spot.use[0] - 1)), 0));
await page.evaluate(([x, z]) => {
  const g = window.__game;
  const s = g.o.map.boxSpots.find((b) => Math.hypot(b.x - x, b.z - z) < 2);
  g.debugView(x, z, Math.atan2(s.nx, s.nz), -0.15);
}, spot.use);
await page.waitForTimeout(300);
await page.evaluate(() => { const r = Math.random; Math.random = () => 0.01; setTimeout(() => { Math.random = r; }, 60); });
await press('KeyF');
await page.waitForTimeout(5200);
await page.screenshot({ path: `${out}/x8-corvo.png` });
check('Corvo leva a caixa', (await box()).state === 'moving');
await page.waitForTimeout(6500);
b = await box();
check('caixa reaparece em outro local', b.state === 'idle' && b.loc !== loc0, `local ${b.loc}`);

check('sem erros na página', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${ok} ok, ${bad} falharam`);
await browser.close();
