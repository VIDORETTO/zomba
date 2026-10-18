// Teste de resistência: joga sozinho por vários minutos (atirando no zumbi mais perto, trocando de arma,
// com rodada infernal e Carrasco) e mede erros, memória, objetos na cena e FPS ao longo do tempo.
// Uso: node tools/soak.mjs [cidade|rota] [segundos] [pasta]
import { chromium } from 'playwright-core';
const map = process.argv[2] ?? 'cidade';
const secs = Number(process.argv[3] ?? 240);
const out = process.argv[4] ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${m.type()}] ${m.text()}`); });
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click(`#map-choice [data-map="${map}"]`);
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
await page.waitForTimeout(1500);

// jogador imortal, rico e com o primeiro intervalo curto; infernal na rodada 3 e Carrasco na 5
await page.evaluate(() => {
  const s = window.__game.transport.sim;
  s.stateTimer = 1;
  s.nextHellRound = 3;
  s.nextBossRound = 5;
  s.power = true;
});
const GUNS = ['smg', 'pump', 'rocket', 'drum_pap', 'crossbow', 'launcher_pap', 'raygun', 'blade', 'burstrifle_pap', 'revolver', 'lmg', 'dmr', 'autoshotgun_pap', 'sniper', 'dualpistol', 'machinepistol_pap'];
const sample = () => page.evaluate(() => {
  const g = window.__game;
  const r = g.renderer;
  let objs = 0;
  g.scene.traverse(() => objs++);
  const s = g.transport.sim;
  return {
    heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
    geo: r.info.memory.geometries, tex: r.info.memory.textures, calls: r.info.render.calls, tris: r.info.render.triangles,
    objs, round: s.round, state: s.state, zombies: s.zombies.size, hell: s.hell,
  };
});
const fps = () => page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); };
  requestAnimationFrame(f);
}));

const rows = [];
const t0 = Date.now();
let gi = 0, lastSwap = 0, lastRow = -999;
while ((Date.now() - t0) / 1000 < secs) {
  const el = (Date.now() - t0) / 1000;
  if (el - lastSwap > 15) {
    lastSwap = el;
    const a = GUNS[gi++ % GUNS.length], b = GUNS[gi++ % GUNS.length];
    await page.evaluate(([a, b]) => {
      const p = window.__game.transport.sim.players.get('local');
      p.weapons = [a, b];
    }, [a, b]);
  }
  await page.evaluate((el) => {
    const g = window.__game;
    const s = g.transport.sim;
    const p = s.players.get('local');
    p.health = p.maxHealth = 99999;
    p.points = 50000;
    if (p.life !== 'alive') p.life = 'alive';
    g.weapon.refillAll();
    // de vez em quando troca a arma da mão e joga uma granada
    if (Math.random() < 0.03) g.weapon.switchTo(g.weapon.weaponIds[Math.floor(Math.random() * g.weapon.weaponIds.length)]);
    g.lookAtNearestZombie(1.0 + Math.random() * 0.6);
    g.debugShoot();
  }, el);
  await page.waitForTimeout(90);
  if (el - lastRow >= 20) {
    lastRow = el;
    const row = { t: Math.round(el), fps: await fps(), ...(await sample()) };
    rows.push(row);
    console.log(JSON.stringify(row));
    await page.screenshot({ path: `${out}/soak-${map}-${row.t}.png` });
  }
}
const first = rows[1] ?? rows[0], last = rows[rows.length - 1];
console.log(`\nrodadas: ${last.round}, geometrias ${first.geo} -> ${last.geo}, texturas ${first.tex} -> ${last.tex}, objetos ${first.objs} -> ${last.objs}, heap ${first.heap} -> ${last.heap} MB`);
console.log(`FPS mínimo ${Math.min(...rows.map((r) => r.fps))}`);
console.log(`erros: ${errs.length}`);
for (const e of [...new Set(errs)].slice(0, 15)) console.log('  ', e.slice(0, 300));
await browser.close();
