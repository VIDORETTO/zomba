// Teste no navegador (headless) do ritual e do Bispo: velas pretas, chegada, fases, pilares e recompensa.
// Uso: node tools/test-bispo.mjs <pasta>
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
let ok = 0, bad = 0;
const check = (name, cond, detail = '') => { cond ? ok++ : bad++; console.log(`${cond ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` (${detail})` : ''}`); };
const press = async (k) => { await page.keyboard.down(k); await page.waitForTimeout(40); await page.keyboard.up(k); };
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click('#map-choice [data-map="cidade"]');
await page.click('#btn-solo');
await (await page.waitForFunction(() => window.__game, null, { timeout: 90000 })).dispose();
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const s = window.__game.transport.sim;
  s.toSpawn = 0;
  s.zombies.clear();
  s.round = 12;
  const p = s.players.get('local');
  p.health = p.maxHealth = 99999;
  s.world.openDoors.add('igreja');
});
const goCandle = (i) => page.evaluate((i) => {
  const g = window.__game;
  const it = g.o.map.interactables.find((x) => x.id === `ritual-${i}`);
  // de frente para o altar (que fica para +z)
  g.debugView(it.use[0], it.use[1], Math.PI, 0.25);
}, i);

await goCandle(0);
await page.waitForTimeout(700);
const cold = await page.evaluate(() => document.querySelector('.prompt-text')?.textContent ?? '');
check('vela preta fria antes da Forja', /fria/.test(cold), cold);
await page.screenshot({ path: `${out}/b0-altar.png` });
await page.evaluate(() => { window.__game.transport.sim.forge.on = true; });
await page.waitForTimeout(300);
for (const i of [0, 1, 2]) {
  await goCandle(i);
  await page.waitForTimeout(500);
  await press('KeyF');
  await page.waitForTimeout(400);
}
await page.screenshot({ path: `${out}/b1-velas.png` });
const st = await page.evaluate(() => ({ r: window.__game.buffer.latest.s.ritual, banner: document.querySelector('.banner')?.textContent }));
check('três velas acendem o ritual', st.r.state === 'summoning' && st.banner === 'O RITUAL', JSON.stringify(st));

// vê o cruzamento de longe: o Bispo sobe da lava
await page.evaluate(() => window.__game.debugView(0, 14, 0, 0.12));
await page.waitForFunction(() => !!window.__game.buffer.latest.s.bispo, null, { timeout: 8000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/b2-subindo.png` });
await page.waitForTimeout(2200);
await page.screenshot({ path: `${out}/b3-bispo.png` });
const bar = await page.evaluate(() => ({ hidden: document.querySelector('.bossbar').classList.contains('hidden'), name: document.querySelector('.bossname').textContent }));
check('barra de vida do Bispo', !bar.hidden && bar.name === 'O BISPO', JSON.stringify(bar));

// fase 2: escudo de fogo e teletransporte
await page.evaluate(() => {
  const s = window.__game.transport.sim;
  const b = [...s.zombies.values()].find((z) => z.kind === 6);
  s.damageZombie(b, b.bispo.maxHp * 0.4, s.players.get('local'), 'body', false);
});
await page.waitForTimeout(700);
const sh = await page.evaluate(() => window.__game.buffer.latest.s.bispo);
await page.evaluate(() => {
  const s = window.__game.transport.sim;
  const b = [...s.zombies.values()].find((z) => z.kind === 6);
  window.__game.debugView(b.x, b.z + 9, 0, 0.15);
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/b4-escudo.png` });
check('fase 2 com escudo de fogo', sh?.phase === 2 && sh.shield, JSON.stringify(sh));

// pilares: aviso no chão debaixo do jogador
await page.waitForTimeout(5000);
await page.evaluate(() => {
  const s = window.__game.transport.sim;
  const b = [...s.zombies.values()].find((z) => z.kind === 6);
  b.bispo.pillarT = 0;
  b.bispo.orbT = 99;
  b.bispo.summonT = 99;
  window.__game.debugView(b.x, b.z + 9, 0, -0.35);
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/b5-pilar-aviso.png` });
const warns = await page.evaluate(() => window.__game.warns.length);
check('pilar de fogo marcado no chão', warns >= 1, `${warns} avisos`);
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/b6-pilar.png` });

// fase 3 e morte: recompensa
await page.evaluate(() => {
  const s = window.__game.transport.sim;
  const b = [...s.zombies.values()].find((z) => z.kind === 6);
  s.damageZombie(b, b.bispo.maxHp, s.players.get('local'), 'body', false);
});
await page.waitForTimeout(5600);
await page.evaluate(() => {
  const s = window.__game.transport.sim;
  const b = [...s.zombies.values()].find((z) => z.kind === 6);
  s.players.get('local').perks = [];
  s.damageZombie(b, b.bispo.maxHp, s.players.get('local'), 'body', false);
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/b7-morte.png` });
const end = await page.evaluate(() => ({ perks: window.__game.me.perks.length, banner: document.querySelector('.banner')?.textContent, ritual: window.__game.buffer.latest.s.ritual.state }));
check('Bispo morto: ritual completo e todas as bebidas', end.perks === 6 && end.banner === 'RITUAL COMPLETO' && end.ritual === 'done', JSON.stringify(end));
check('sem erros na página', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${ok} ok, ${bad} falharam`);
await browser.close();
