// Teste no navegador (headless) das portas: compra, porta afunda, jogador entra.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/?autoplay');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.waitForTimeout(1000);
let ok = 0, bad = 0;
const check = (name, cond, detail = '') => { cond ? ok++ : bad++; console.log(`${cond ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` (${detail})` : ''}`); };
const press = async (k) => { await page.keyboard.down(k); await page.waitForTimeout(40); await page.keyboard.up(k); };
await page.evaluate(() => { const sim = window.__game.transport.sim; sim.toSpawn = 0; sim.zombies.clear(); window.__game.debugPoints(5000); });

// entulho do quintal noroeste visto da rua
await page.evaluate(() => window.__game.debugView(-5, -28, Math.PI / 2, 0));
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/d1-entulho.png` });

// porta do Banco (lado da rua principal)
await page.evaluate(() => window.__game.debugView(-8.1, -17, Math.PI / 2, 0));
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/d2-porta-banco.png` });
const prompt = await page.evaluate(() => document.querySelector('.prompt-text')?.textContent);
check('aviso de abrir o Banco', /abrir Banco/.test(prompt ?? ''), prompt);
const blockedBefore = await page.evaluate(() => { const g = window.__game; return g.world.query(-9.4, -17.1, -8.9, -16.9).some((b) => b.door === 'banco'); });
check('porta fechada bloqueia', blockedBefore);
await press('KeyF');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/d3-abrindo.png` });
await page.waitForTimeout(1200);
const st = await page.evaluate(() => { const g = window.__game; return { pts: g.me.points, open: [...g.world.openDoors], vis: g.mapView.group.children.length }; });
check('Banco aberto por 750', st.open.includes('banco') && st.pts === 4250, JSON.stringify(st));
await page.keyboard.down('KeyW');
await page.waitForTimeout(1300);
await page.keyboard.up('KeyW');
const pos = await page.evaluate(() => ({ x: window.__game.pc.pos.x, z: window.__game.pc.pos.z }));
check('jogador entra no Banco andando', pos.x < -10.5, JSON.stringify(pos));
await page.screenshot({ path: `${out}/d4-dentro.png` });

// Cinema (quarteirão SO): porta para a rua principal, entra andando
await page.evaluate(() => { window.__game.debugPoints(10000); window.__game.debugView(-8.1, 38.5, Math.PI / 2, 0); });
await page.waitForTimeout(600);
const pc = await page.evaluate(() => document.querySelector('.prompt-text')?.textContent);
check('aviso de abrir o Cinema por 1250', /abrir Cinema/.test(pc ?? '') && /1250/.test(pc ?? ''), pc);
await press('KeyF');
await page.waitForTimeout(1200);
await page.keyboard.down('KeyW');
await page.waitForTimeout(1300);
await page.keyboard.up('KeyW');
const pcin = await page.evaluate(() => ({ x: window.__game.pc.pos.x, pts: window.__game.me.points, open: window.__game.world.openDoors.has('cinema') }));
check('Cinema aberto e jogador lá dentro', pcin.open && pcin.x < -10.5 && pcin.pts === 8750, JSON.stringify(pcin));
await page.screenshot({ path: `${out}/d5-cinema.png` });

// Armazém (NO): abre pela rua transversal e a Metralhadora leve está na parede de dentro
await page.evaluate(() => window.__game.debugView(-38.5, -8.1, 0, 0));
await page.waitForTimeout(600);
await press('KeyF');
await page.waitForTimeout(1200);
const lmg = await page.evaluate(() => {
  const g = window.__game;
  const it = g.o.map.interactables.find((i) => i.id === 'wall-lmg');
  g.debugView(it.use[0], it.use[1], Math.PI / 2, 0);
  return g.world.openDoors.has('armazem');
});
await page.waitForTimeout(600);
const pl = await page.evaluate(() => document.querySelector('.prompt-text')?.textContent);
check('Armazém aberto, Metralhadora leve à venda por 2500', lmg && /Metralhadora leve/.test(pl ?? '') && /2500/.test(pl ?? ''), pl);
await press('KeyF');
await page.waitForTimeout(1500);
const ws = await page.evaluate(() => window.__game.me.weapons);
check('comprou a Metralhadora leve', ws.includes('lmg'), ws.join(','));
await page.screenshot({ path: `${out}/d6-armazem.png` });
check('sem erros na página', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${ok} ok, ${bad} falharam`);
await browser.close();
