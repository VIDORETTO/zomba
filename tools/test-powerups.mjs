// Teste no navegador (headless): itens que caem dos zumbis.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://localhost:5173/?autoplay');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.waitForTimeout(1000);
let ok = 0, bad = 0;
const check = (name, cond, detail = '') => { cond ? ok++ : bad++; console.log(`${cond ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` (${detail})` : ''}`); };
await page.evaluate(() => { const sim = window.__game.transport.sim; sim.toSpawn = 0; sim.zombies.clear(); });
await page.evaluate(() => window.__game.debugView(0, 20, 0, -0.15));
// os seis itens numa fileira à frente
await page.evaluate(() => {
  const sim = window.__game.transport.sim;
  ['maxammo', 'insta', 'double', 'bomb', 'carpenter', 'firesale'].forEach((kind, i) => sim.powerups.push({ id: 100 + i, kind, x: -3.75 + i * 1.5, y: 0, z: 16.5, t: 0 }));
});
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/p1-itens.png` });
const shown = await page.evaluate(() => window.__game.powerupView.items.size);
check('6 itens aparecem no chão', shown === 6, String(shown));

// gasta munição e pega Munição Cheia
await page.mouse.click(640, 360);
await page.waitForTimeout(250);
await page.evaluate(() => window.__game.debugView(-3.75, 16.5, 0, -0.1));
await page.waitForTimeout(400);
check('Munição Cheia enche a arma', await page.evaluate(() => window.__game.weapon.ammo === window.__game.weapon.def.mag));
// pega os de efeito
for (const x of [-2.25, -0.75]) {
  await page.evaluate((x) => window.__game.debugView(x, 16.5, 0, -0.1), x);
  await page.waitForTimeout(350);
}
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/p2-efeitos.png` });
const fx = await page.evaluate(() => [...document.querySelectorAll('.effect')].length);
check('HUD mostra Golpe Fatal e Pontos em Dobro', fx === 2, String(fx));
// Bomba
await page.evaluate(() => {
  const sim = window.__game.transport.sim;
  sim.toSpawn = 3;
  sim.spawnTimer = 0;
});
await page.waitForTimeout(3000);
const before = await page.evaluate(() => window.__game.buffer.latest.s.zombies.length);
// nenhum zumbi novo depois da bomba (senão o teste conta um que nasceu depois)
await page.evaluate(() => { window.__game.transport.sim.toSpawn = 0; });
await page.evaluate(() => window.__game.debugView(0.75, 16.5, 0, -0.1));
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/p3-bomba.png` });
await page.waitForTimeout(400);
const after = await page.evaluate(() => window.__game.buffer.latest.s.zombies.length);
check('Bomba limpa os zumbis', before > 0 && after === 0, `${before} -> ${after}`);
check('sem erros na página', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${ok} ok, ${bad} falharam`);
await browser.close();
