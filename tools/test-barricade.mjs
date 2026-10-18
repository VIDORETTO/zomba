// Teste no navegador (headless) das barricadas: zumbi arranca tábuas, entra, e o jogador conserta com F.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/?autoplay');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
let ok = 0, bad = 0;
const check = (name, cond, detail = '') => { cond ? ok++ : bad++; console.log(`${cond ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` (${detail})` : ''}`); };
await page.waitForTimeout(1000);
// só a entrada norte: sem pontos de surgir da terra, e o jogador perto dela
await page.evaluate(() => { const g = window.__game; g.o.map.zombieSpawns.length = 0; g.debugView(2.4, -30, 0, 0.05); });
const state = () => page.evaluate(() => ({ boards: window.__game.buffer.latest?.s.boards, anims: window.__game.buffer.latest?.s.zombies.map((z) => z.anim) }));
await page.waitForFunction(() => window.__game.buffer.latest?.s.zombies.some((z) => z.anim === 'tear'), null, { timeout: 40000 });
await page.evaluate(() => window.__game.debugView(2.4, -38.5, 0, 0.12));
await page.waitForTimeout(1800);
await page.screenshot({ path: `${out}/r1-arrancando.png` });
let s = await state();
check('zumbi arrancando tábuas', s.anims.includes('tear') && s.boards[0] < 6, JSON.stringify(s));
const planks = await page.evaluate(() => window.__game.barricades.views[0].planks.filter((p) => p.visible).length);
check('tábuas visíveis acompanham a simulação', planks === s.boards[0], `visíveis ${planks}`);
await page.waitForFunction(() => window.__game.buffer.latest?.s.zombies.some((z) => z.anim === 'climb'), null, { timeout: 20000 });
await page.waitForTimeout(350);
await page.screenshot({ path: `${out}/r2-pulando.png` });
check('zumbi pula a janela', true);
// mata o zumbi e conserta
for (let i = 0; i < 12; i++) {
  await page.evaluate(() => { window.__game.lookAtNearestZombie(1.55); window.__game.debugShoot(); });
  await page.waitForTimeout(120);
}
await page.evaluate(() => { const sim = window.__game.transport.sim; sim.toSpawn = 0; sim.zombies.clear(); });
await page.evaluate(() => window.__game.debugView(2.4, -41.2, Math.PI, 0.15));
await page.waitForTimeout(400);
const prompt = await page.evaluate(() => document.querySelector('.prompt-text')?.textContent);
check('aviso de consertar aparece', /consertar/.test(prompt ?? ''), prompt);
const b0 = (await state()).boards[0];
const pts0 = await page.evaluate(() => window.__game.me.points);
await page.keyboard.down('KeyF');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/r3-consertando.png` });
await page.waitForTimeout(800);
await page.keyboard.up('KeyF');
await page.waitForTimeout(300);
const b1 = (await state()).boards[0];
const pts1 = await page.evaluate(() => window.__game.me.points);
check('segurar F repõe tábuas', b1 > b0, `${b0} -> ${b1}`);
check('ganha +10 por tábua', pts1 - pts0 === (b1 - b0) * 10, `+${pts1 - pts0}`);
check('sem erros na página', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${ok} ok, ${bad} falharam`);
await browser.close();
