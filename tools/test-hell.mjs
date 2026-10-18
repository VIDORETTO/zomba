// Teste no navegador (headless): rodada infernal com Cães Infernais.
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
// a rodada 1 vira infernal; o jogador fica no cruzamento
await page.evaluate(() => {
  const g = window.__game;
  g.transport.sim.nextHellRound = 1;
  g.transport.sim.players.get('local').health = 9999;
  g.debugView(0, 8, 0, 0);
});
const fogBefore = await page.evaluate(() => window.__game.scene.fog.color.getHexString());
await page.waitForTimeout(4200);
await page.screenshot({ path: `${out}/h1-anuncio.png` });
const start = await page.evaluate(() => ({
  hell: window.__game.buffer.latest.s.hell,
  banner: document.querySelector('.banner')?.textContent,
  hudHell: document.querySelector('.hud').classList.contains('hell'),
}));
check('rodada 1 é infernal', start.hell && start.banner === 'RODADA INFERNAL' && start.hudHell, JSON.stringify(start));

// espera os raios e congela um cão para fotografar
await page.waitForFunction(() => [...window.__game.transport.sim.zombies.values()].some((z) => z.kind === 3 && z.anim !== 'rise'), null, { timeout: 15000 });
const fogHell = await page.evaluate(() => window.__game.scene.fog.color.getHexString());
const fogRgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
const [r0, g0] = fogRgb(fogBefore);
const [r1, g1] = fogRgb(fogHell);
check('névoa fica vermelha', r1 / Math.max(1, g1) > (r0 / Math.max(1, g0)) * 1.4, `${fogBefore} -> ${fogHell}`);
await page.evaluate(() => {
  const sim = window.__game.transport.sim;
  for (const z of sim.zombies.values()) z.speed = 0;
  window.__game.lookAtNearestZombie(0.4);
});
await page.waitForTimeout(500);
await page.evaluate(() => window.__game.lookAtNearestZombie(0.4));
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/h2-cao.png` });
const dogs = await page.evaluate(() => window.__game.buffer.latest.s.zombies.filter((z) => z.kind === 3).length);
check('cães aparecem na tela do jogador', dogs > 0, `${dogs} cães`);

// tiro de verdade no cão mais perto (mira no corpo)
const shot = await page.evaluate(async () => {
  const g = window.__game;
  const sim = g.transport.sim;
  const before = sim.players.get('local').kills;
  let hits = 0;
  for (let i = 0; i < 12; i++) {
    g.lookAtNearestZombie(0.55);
    g.debugShoot();
    await new Promise((r) => setTimeout(r, 160));
    hits = sim.players.get('local').kills - before;
    if (hits > 0) break;
  }
  return hits;
});
check('tiro mata o cão', shot > 0, `${shot} abatido(s)`);
await page.waitForTimeout(120);
await page.screenshot({ path: `${out}/h3-explosao.png` });

// acaba com os cães: a rodada termina e cai Munição Cheia
await page.evaluate(async () => {
  const sim = window.__game.transport.sim;
  const p = sim.players.get('local');
  for (let i = 0; i < 80 && (sim.toSpawn > 0 || sim.zombies.size > 0); i++) {
    for (const z of [...sim.zombies.values()]) sim.damageZombie(z, 99999, p, 'body', false);
    await new Promise((r) => setTimeout(r, 120));
  }
});
await page.waitForTimeout(600);
const end = await page.evaluate(() => ({ state: window.__game.buffer.latest.s.state, hell: window.__game.buffer.latest.s.hell, pu: window.__game.buffer.latest.s.powerups.map((p) => p.kind) }));
check('rodada infernal acaba com Munição Cheia', end.state === 'intermission' && !end.hell && end.pu.includes('maxammo'), JSON.stringify(end));
await page.waitForTimeout(4500);
const fogAfter = await page.evaluate(() => window.__game.scene.fog.color.getHexString());
await page.screenshot({ path: `${out}/h4-depois.png` });
check('névoa volta ao normal', fogAfter === fogBefore, `${fogHell} -> ${fogAfter}`);
check('contador da rodada sai do modo infernal', await page.evaluate(() => !document.querySelector('.round').classList.contains('hell')));

check('sem erros na página', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${ok} ok, ${bad} falharam`);
await browser.close();
