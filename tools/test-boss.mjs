// Teste no navegador (headless): chefão Carrasco (chegada, capacete, corrente, golpe no chão e morte).
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
await page.evaluate(() => { const r = document.querySelector('#in-round'); r.value = '12'; r.dispatchEvent(new Event('input')); });
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
const sim = 'window.__game.transport.sim';
await page.evaluate(() => {
  const s = window.__game.transport.sim;
  s.nextHellRound = 99;
  s.nextBossRound = 12;
  s.players.get('local').health = 99999;
  s.players.get('local').maxHealth = 99999;
});
await page.waitForFunction(() => window.__game.transport.sim.state === 'active', null, { timeout: 15000 });
// sem zumbis comuns: o Carrasco vem na hora, na rua de baixo
await page.evaluate(() => {
  const s = window.__game.transport.sim;
  s.toSpawn = 0;
  s.zombies.clear();
  window.__game.debugView(0, 24, 0, 0);
});
await page.waitForFunction(() => [...window.__game.transport.sim.zombies.values()].some((z) => z.kind === 4), null, { timeout: 5000 });
const bossId = await page.evaluate(() => {
  const z = [...window.__game.transport.sim.zombies.values()].find((z) => z.kind === 4);
  z.x = 0; z.z = 13; z.y = 0;
  z.boss.chainCD = z.boss.chargeCD = z.boss.slamCD = 99;
  z.speed = 0;
  return z.id;
});
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/b1-subindo.png` });
const arrive = await page.evaluate(() => ({ banner: document.querySelector('.banner').textContent, bar: !document.querySelector('.bossbar').classList.contains('hidden'), armored: document.querySelector('.bossbar').classList.contains('armored') }));
check('Carrasco chega com letreiro e barra de vida', arrive.banner === 'O CARRASCO' && arrive.bar && arrive.armored, JSON.stringify(arrive));
await page.waitForTimeout(2600);
await page.evaluate(() => window.__game.debugView(0, 21, 0, -0.05));
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/b2-carrasco.png` });

// tiro de verdade
const hp = await page.evaluate(async () => {
  const g = window.__game;
  for (let i = 0; i < 6; i++) {
    g.lookAtNearestZombie(1.6);
    g.debugShoot();
    await new Promise((r) => setTimeout(r, 150));
  }
  return g.buffer.latest.s.boss.hp;
});
check('tiros tiram vida do Carrasco', hp < 1, `vida ${hp}`);

// capacete
await page.evaluate((id) => {
  const s = window.__game.transport.sim;
  const z = s.zombies.get(id);
  s.damageZombie(z, z.boss.maxHp * 0.31, s.players.get('local'), 'body', false);
}, bossId);
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/b3-capacete.png` });
const helm = await page.evaluate((id) => ({ helmet: window.__game.zombies.view(id).rig.helmet.visible, armored: document.querySelector('.bossbar').classList.contains('armored') }), bossId);
check('capacete sai voando e a barra muda', !helm.helmet && !helm.armored, JSON.stringify(helm));

// corrente: o jogador é arrastado até perto dele
await page.evaluate((id) => {
  const s = window.__game.transport.sim;
  const z = s.zombies.get(id);
  z.x = 0; z.z = 13; z.anim = 'move';
  z.boss.chainCD = 0;
  window.__game.debugView(0, 25, 0, -0.02);
}, bossId);
await page.waitForFunction(() => window.__game.transport.sim.zombies.size && [...window.__game.transport.sim.zombies.values()][0].anim === 'chain', null, { timeout: 5000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/b4-corrente.png` });
await page.waitForTimeout(1300);
const dist = await page.evaluate((id) => { const z = window.__game.transport.sim.zombies.get(id); const p = window.__game.pc.pos; return Math.hypot(z.x - p.x, z.z - p.z); }, bossId);
check('corrente arrasta o jogador até perto', dist < 5, `${dist.toFixed(1)} m`);

// golpe no chão
await page.evaluate((id) => {
  const s = window.__game.transport.sim;
  const z = s.zombies.get(id);
  z.anim = 'move';
  z.boss.chainCD = 99;
  z.boss.slamCD = 0;
  window.__game.debugView(z.x, z.z + 3.6, 0, 0.1);
}, bossId);
await page.waitForFunction(() => [...window.__game.transport.sim.zombies.values()][0]?.anim === 'slam', null, { timeout: 5000 });
await page.waitForTimeout(650);
await page.screenshot({ path: `${out}/b5-golpe-chao.png` });

// morte
await page.waitForTimeout(1500);
await page.evaluate((id) => {
  const s = window.__game.transport.sim;
  const z = s.zombies.get(id);
  window.__game.debugView(z.x, z.z + 6, 0, -0.1);
  s.damageZombie(z, 1e9, s.players.get('local'), 'head', false);
}, bossId);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/b6-morte.png` });
const end = await page.evaluate(() => ({ bar: document.querySelector('.bossbar').classList.contains('hidden'), pu: window.__game.buffer.latest.s.powerups.length, state: window.__game.buffer.latest.s.state }));
check('morte some com a barra, deixa item e encerra a rodada', end.bar && end.pu >= 1 && end.state === 'intermission', JSON.stringify(end));

check('sem erros na página', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${ok} ok, ${bad} falharam`);
await browser.close();
