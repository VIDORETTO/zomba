// Teste no navegador (headless): jogador caído rasteja com W e saca a pistola; ao levantar volta para a arma da mão.
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
await page.evaluate(() => window.__game.debugView(0, 20, 0, 0));
// Segundo Fôlego e uma submetralhadora na mão; depois cai
await page.evaluate(() => {
  const sim = window.__game.transport.sim;
  const p = sim.players.get('local');
  p.perks.push('folego');
  p.weapons = ['pistol', 'smg'];
});
await page.waitForTimeout(300);
await page.keyboard.press('Digit2');
await page.waitForTimeout(900);
const held = await page.evaluate(() => window.__game.weapon.def.id);
await page.evaluate(() => {
  const sim = window.__game.transport.sim;
  sim.damagePlayer(sim.players.get('local'), 999, 0, 0, false);
});
await page.waitForTimeout(900);
const st = await page.evaluate(() => ({ life: window.__game.me?.life, w: window.__game.weapon.def.id, z: window.__game.pc.pos.z }));
check('caído saca a pistola', st.life === 'downed' && st.w === 'pistol', `${held} -> ${st.w} (${st.life})`);
await page.keyboard.down('KeyW');
await page.waitForTimeout(1200);
await page.keyboard.up('KeyW');
const z1 = await page.evaluate(() => window.__game.pc.pos.z);
const simZ = await page.evaluate(() => window.__game.transport.sim.players.get('local').z);
check('caído rasteja devagar com W', st.z - z1 > 0.4 && st.z - z1 < 1.6, `${(st.z - z1).toFixed(2)} m`);
check('simulação acompanha o rastejar', Math.abs(simZ - z1) < 0.3, `${simZ.toFixed(2)} vs ${z1.toFixed(2)}`);
await page.screenshot({ path: `${out}/crawl.png` });
// Segundo Fôlego levanta sozinho: volta para a submetralhadora
await page.waitForFunction(() => window.__game.me?.life === 'alive', null, { timeout: 15000 });
await page.waitForTimeout(1200);
const back = await page.evaluate(() => window.__game.weapon.def.id);
check('ao levantar volta para a arma da mão', back === 'smg', back);
check('sem erros no navegador', errs.length === 0, errs.slice(0, 2).join(' | '));
console.log(`\n${ok} ok, ${bad} falharam`);
await browser.close();
process.exit(bad ? 1 : 0);
