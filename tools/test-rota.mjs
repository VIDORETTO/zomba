// Teste no navegador (headless): mapa Rota (escolha no menu, ônibus levando o jogador, energia, névoa com Vultos, FPS).
import { launch } from './launch.mjs';
const out = process.argv[2] ?? '.';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
let ok = 0, bad = 0;
const check = (name, cond, detail = '') => { cond ? ok++ : bad++; console.log(`${cond ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` (${detail})` : ''}`); };
const press = async (k) => { await page.keyboard.down(k); await page.waitForTimeout(40); await page.keyboard.up(k); };
// FPS médio medido por quadros desenhados em 2 s
const fps = () => page.evaluate(() => new Promise((res) => {
  let n = 0;
  const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000))); };
  requestAnimationFrame(f);
}));

await page.goto('http://127.0.0.1:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click('#map-choice [data-map="rota"]');
check('menu mostra o mapa Rota escolhido', await page.evaluate(() => document.querySelector('#map-choice [data-map="rota"]').classList.contains('on') && /ônibus/.test(document.querySelector('#map-desc').textContent)));
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
await page.waitForTimeout(1500);
const start = await page.evaluate(() => ({ map: window.__game.o.map.id, banner: document.querySelector('.banner').textContent, bus: window.__game.buffer.latest.s.bus }));
check('começa na Rodoviária com o ônibus parado', start.map === 'rota' && start.banner === 'RODOVIÁRIA' && start.bus?.stop === 'rodoviaria', JSON.stringify(start));
await page.evaluate(() => { const s = window.__game.transport.sim; s.toSpawn = 0; s.zombies.clear(); s.players.get('local').health = s.players.get('local').maxHealth = 99999; window.__game.debugView(-4, 14, Math.PI, 0.05); });
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/rt1-rodoviaria.png` });
const fpsStop = await fps();

// entra no ônibus pela porta e espera ele sair
await page.evaluate(() => {
  const g = window.__game;
  const b = g.busView.pose;
  // centro do ônibus, olhando para a frente dele
  g.debugView(b.x, b.z, Math.PI - b.yaw + Math.PI, 0);
  g.pc.yaw = -b.yaw + Math.PI;
  g.transport.sim.bus.wait = 6;
});
await page.waitForTimeout(800);
const inside = await page.evaluate(() => ({ y: window.__game.pc.pos.y, on: window.__game.onBusNow() }));
check('jogador fica em pé dentro do ônibus', inside.on && Math.abs(inside.y - 0.42) < 0.05, JSON.stringify(inside));
await page.screenshot({ path: `${out}/rt2-dentro.png` });
const p0 = await page.evaluate(() => ({ x: window.__game.pc.pos.x, z: window.__game.pc.pos.z }));
await page.waitForTimeout(12000);
const ride = await page.evaluate(() => ({ x: window.__game.pc.pos.x, z: window.__game.pc.pos.z, on: window.__game.onBusNow(), bus: window.__game.buffer.latest.s.bus }));
const moved = Math.hypot(ride.x - p0.x, ride.z - p0.z);
check('ônibus leva o jogador junto pela estrada', moved > 15 && ride.on, `andou ${moved.toFixed(0)} m, dentro=${ride.on}`);
await page.screenshot({ path: `${out}/rt3-viajando.png` });
const fpsRide = await fps();
// chega na Lanchonete
await page.waitForFunction(() => window.__game.buffer.latest.s.bus?.stop === 'lanchonete', null, { timeout: 40000 });
await page.waitForTimeout(800);
const arrive = await page.evaluate(() => ({ zone: window.__game.zone, on: window.__game.onBusNow(), banner: document.querySelector('.banner').textContent }));
check('chega na Lanchonete dentro do ônibus', arrive.zone === 'lanchonete' && arrive.on && arrive.banner === 'LANCHONETE', JSON.stringify(arrive));
await page.screenshot({ path: `${out}/rt4-lanchonete.png` });

// energia na Usina
await page.evaluate(() => {
  const g = window.__game;
  const it = g.o.map.interactables.find((i) => i.id === 'power');
  g.debugView(it.use[0], it.use[1], Math.PI, 0.1);
});
await page.waitForTimeout(600);
const promptP = await page.evaluate(() => document.querySelector('.prompt')?.textContent ?? '');
await page.screenshot({ path: `${out}/rt5-alavanca.png` });
await press('KeyF');
await page.waitForTimeout(600);
const power = await page.evaluate(() => window.__game.buffer.latest.s.power);
check('alavanca da Usina liga a energia', /energia/.test(promptP) && power, promptP);

// névoa: Vultos aparecem na estrada
await page.evaluate(() => window.__game.debugView(-80, -40, 0, 0));
await page.waitForTimeout(6500);
const fog = await page.evaluate(() => ({ vultos: window.__game.buffer.latest.s.zombies.filter((z) => z.kind === 5).length, density: window.__game.mapView.fogDensity }));
check('na névoa a visibilidade cai e os Vultos vêm', fog.vultos > 0 && fog.density > 0.045, JSON.stringify(fog));
await page.evaluate(() => window.__game.lookAtNearestZombie(0.6));
await page.waitForTimeout(150);
await page.screenshot({ path: `${out}/rt6-vulto.png` });
const fpsFog = await fps();

console.log(`FPS: parada ${fpsStop}, ônibus ${fpsRide}, névoa ${fpsFog}`);
check('FPS bom no mapa grande (headless)', Math.min(fpsStop, fpsRide, fpsFog) >= 50, `${fpsStop}/${fpsRide}/${fpsFog}`);
check('sem erros na página', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${ok} ok, ${bad} falharam`);
await browser.close();
