// Teste no navegador (headless) das armas maravilha: Canhão de Vento, Arpão Elétrico e Vórtice.
// Uso: node tools/test-wonder.mjs <pasta>
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
await page.click('#map-choice [data-map="cidade"]');
await page.click('#btn-solo');
await (await page.waitForFunction(() => window.__game, null, { timeout: 90000 })).dispose();
await page.waitForTimeout(1500);

// zumbis parados nos pontos dados (vida alta, para só a arma maravilha matar)
const setup = (weapon, pts) => page.evaluate(([weapon, pts]) => {
  const g = window.__game;
  const s = g.transport.sim;
  s.toSpawn = 0;
  s.zombies.clear();
  s.round = 20;
  const p = s.players.get('local');
  p.health = p.maxHealth = 99999;
  p.weapons = ['pistol', weapon];
  window.__ids = [];
  for (const [x, z] of pts) {
    s.spawnZombie();
    const zb = [...s.zombies.values()].pop();
    Object.assign(zb, { x, z, y: 0, anim: 'move', speed: 0, hp: 50000, entry: -1, phase: 'none' });
    window.__ids.push(zb.id);
  }
  g.debugView(0, 24, 0, -0.03);
}, [weapon, pts]);
// quantos dos zumbis colocados continuam vivos (a rodada pode soltar outros)
const kills = () => page.evaluate(() => window.__ids.filter((id) => window.__game.transport.sim.zombies.has(id)).length);
const ready = async (weapon) => {
  await page.waitForFunction((w) => window.__game.weapon.def.id === w || (window.__game.weapon.switchTo(w), false), weapon, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(900);
};

// Canhão de Vento
await setup('wind', [[0, 18], [1.4, 16], [-1.4, 15.5], [0, 13]]);
await ready('wind');
await page.screenshot({ path: `${out}/w0-vento-arma.png` });
await page.evaluate(() => window.__game.debugShoot());
await page.waitForTimeout(260);
await page.screenshot({ path: `${out}/w1-vento.png` });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/w2-vento-voando.png` });
check('Canhão de Vento mata os 4 zumbis à frente', (await kills()) === 0, `sobraram ${await kills()}`);

// Arpão Elétrico
const line = [];
for (let i = 0; i < 8; i++) line.push([(i % 2) * 1.5, 18 - i * 2.5]);
await setup('arc', line);
await ready('arc');
await page.screenshot({ path: `${out}/w3-arpao-arma.png` });
await page.evaluate(() => window.__game.debugShoot());
await page.waitForTimeout(80);
await page.screenshot({ path: `${out}/w4-arpao.png` });
check('Arpão Elétrico salta e mata os 8', (await kills()) === 0, `sobraram ${await kills()}`);

// Vórtice
await setup('vortex', [[0, 12], [3, 13], [-3, 11], [1.5, 9]]);
await ready('vortex');
await page.screenshot({ path: `${out}/w5-vortice-arma.png` });
await page.evaluate(() => { window.__game.pc.pitch = -0.12; window.__game.debugShoot(); });
await page.waitForTimeout(1600);
const open = await page.evaluate(() => window.__game.buffer.latest.s.vortices.length);
await page.screenshot({ path: `${out}/w6-vortice.png` });
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}/w7-vortice-fim.png` });
check('Vórtice abre e engole os 4 zumbis', open === 1 && (await kills()) === 0, `abertos ${open}, sobraram ${await kills()}`);
await page.waitForTimeout(2500);
check('Vórtice fecha sozinho', (await page.evaluate(() => window.__game.buffer.latest.s.vortices.length)) === 0);

// recarga de cada uma sem erro
for (const w of ['wind', 'arc', 'vortex']) {
  await page.evaluate((w) => {
    const g = window.__game;
    g.transport.sim.players.get('local').weapons = ['pistol', w];
  }, w);
  await ready(w);
  await page.evaluate(() => window.__game.debugShoot());
  await page.waitForTimeout(1200);
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `${out}/w8-recarga-${w}.png` });
  await page.waitForTimeout(2000);
}
check('sem erros na página', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${ok} ok, ${bad} falharam`);
await browser.close();
