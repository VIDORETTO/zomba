// Teste no navegador (headless): compra de bebidas e munição com a tecla F.
// Uso: node tools/test-buy.mjs <pasta> [chrome|firefox]
import { chromium, firefox } from 'playwright-core';
const out = process.argv[2] ?? '.';
const engine = process.argv[3] ?? 'chrome';
const browser = engine === 'firefox' ? await firefox.launch({ headless: true }) : await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://localhost:5173/?autoplay');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.waitForTimeout(800);
let ok = 0, bad = 0;
const check = (name, cond, detail = '') => { cond ? ok++ : bad++; console.log(`${cond ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` (${detail})` : ''}`); };
const me = () => page.evaluate(() => { const m = window.__game.me; return { pts: m.points, perks: m.perks, hp: m.health, max: m.maxHealth }; });
const YAW = { 'perk-couraca': -Math.PI / 2, 'perk-folego': 0, 'perk-reflexo': -Math.PI / 2, 'perk-gatilho': Math.PI / 2, 'perk-passo': Math.PI, 'perk-mula': Math.PI, 'ammo-0': -Math.PI / 2, 'ammo-1': 0, 'ammo-2': -Math.PI / 2 };
const goTo = (id, back = 0) => page.evaluate(([id, yaw, back]) => {
  const g = window.__game;
  const it = g.o.map.interactables.find((i) => i.id === id);
  g.debugView(it.use[0] - Math.sin(yaw) * -back, it.use[1] - Math.cos(yaw) * -back, yaw, -0.05);
}, [id, YAW[id], back]);
const press = async (k) => { await page.keyboard.down(k); await page.waitForTimeout(40); await page.keyboard.up(k); };

await page.evaluate(() => window.__game.debugPoints(20000));
await page.waitForTimeout(200);

// Couraça
await goTo('perk-couraca', 1.6);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/b1-couraca.png` });
await goTo('perk-couraca');
await page.waitForTimeout(300);
const prompt = await page.evaluate(() => document.querySelector('.prompt-text')?.textContent);
check('aviso de compra aparece', /Couraça/.test(prompt ?? ''), prompt);
await press('KeyF');
await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/b2-bebendo.png` });
await page.waitForTimeout(1500);
let m = await me();
check('Couraça comprada (-2500)', m.perks.includes('couraca') && m.pts === 17500, JSON.stringify(m));
check('vida máxima 250', m.max === 250);
await press('KeyF');
await page.waitForTimeout(500);
check('não compra de novo', (await me()).pts === 17500);

// demais bebidas (até o limite de 4)
for (const id of ['perk-reflexo', 'perk-gatilho', 'perk-passo']) {
  await goTo(id, 1.6);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/b3-${id}.png` });
  await goTo(id);
  await page.waitForTimeout(300);
  await press('KeyF');
  await page.waitForTimeout(2600);
}
m = await me();
check('4 bebidas compradas', m.perks.length === 4, m.perks.join(','));
const icons = await page.evaluate(() => document.querySelectorAll('.perk-icon').length);
check('4 ícones no HUD', icons === 4);
const mods = await page.evaluate(() => ({ r: window.__game.weapon.mods.reload, f: window.__game.weapon.mods.fire, s: window.__game.pc.mods.sprintSpeed }));
check('efeitos de Reflexo/Gatilho/Passo aplicados', mods.r === 0.5 && mods.f === 0.75 && mods.s === 1.1, JSON.stringify(mods));
await goTo('perk-mula', 1.6);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/b4-mula.png` });
await goTo('perk-mula');
await page.waitForTimeout(300);
check('aviso de limite de 4', /Limite/.test(await page.evaluate(() => document.querySelector('.prompt-text')?.textContent ?? '')));
await goTo('perk-folego', 1.6);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/b5-folego.png` });

// munição: gasta 3 tiros e enche no caixote
await goTo('ammo-0', 1.4);
await page.waitForTimeout(300);
for (let i = 0; i < 3; i++) { await page.mouse.click(640, 360); await page.waitForTimeout(250); }
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/b6-caixote.png` });
const before = await page.evaluate(() => [window.__game.weapon.ammo, window.__game.weapon.reserve, window.__game.me.points]);
await goTo('ammo-0');
await page.waitForTimeout(300);
await press('KeyF');
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/b7-enchendo.png` });
await page.waitForTimeout(1300);
const after = await page.evaluate(() => [window.__game.weapon.ammo, window.__game.weapon.reserve, window.__game.me.points]);
check('caixote enche a munição', after[0] === 8 && after[1] === 80, `antes ${before} depois ${after}`);
check('munição custou 150', before[2] - after[2] === 150);
check('caixote cheio não vende', /cheia/.test(await page.evaluate(() => document.querySelector('.prompt-text')?.textContent ?? '')));

check('sem erros na página', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${ok} ok, ${bad} falharam`);
await browser.close();
