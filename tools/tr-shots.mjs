// Capturas da camada "mundo" da Trincheira. Uso: node tools/tr-shots.mjs <pasta> [cena...]  (com npx vite --port 5201 ligado)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] ?? '.';
const only = process.argv.slice(3);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1169/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://localhost:5201/tools/tr-harness.html');
await page.waitForFunction(() => window.__h?.ready, null, { timeout: 60000 });
const h = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name, wait = 700) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('ok ', name);
};
const scene = async (name, setup, fn) => {
  if (only.length && !only.includes(name)) return;
  await h(setup[0], setup[1]);
  await shot(name, fn ?? 900);
};

// geradores
await scene('geradores', [({ }) => {
  const H = window.__h; const g = H.map.trincheira.gens[0];
  H.tr.gens[0].on = true; H.tr.gens[1].capturing = true; H.tr.gens[1].progress = 0.55; H.tr.gens[2].attacked = true; H.tr.gens[3].on = true;
  H.look(g.x - 9, 4, g.z + 8, g.x, 3, g.z);
}, {}]);
// Fonte da Sorte
await scene('fonte', [() => {
  const H = window.__h; const s = H.map.fizzSpots[0]; H.tr.gens[0].on = true;
  H.look(s.x + s.nx * 3.2 + s.nz * 1.5, 2.4, s.z + s.nz * 3.2 - s.nx * 1.5, s.x, 1.3, s.z);
}, {}]);
// tanque + alavanca
await scene('tanque', [() => {
  const H = window.__h; const p = H.tr.tank; H.tr.tank.yaw = 0.6;
  H.look(p.x - 7, 7, p.z + 9, p.x, 0.8, p.z);
}, {}]);
// tanque andando (lança-chamas)
await scene('tanque-chamas', [() => {
  const H = window.__h; const p = H.tr.tank; H.tr.tank.state = 'volta'; H.tr.tank.x += 1;
  H.look(p.x - 12, 3, p.z - 12, p.x, 1, p.z);
  let k = 0; const iv = setInterval(() => { H.tr.tank.x += 0.25; H.tr.tank.z -= 0.0; if (++k > 200) clearInterval(iv); }, 50);
}, {}], 1500);
// Forja subindo
await scene('forja-sobe', [() => {
  const H = window.__h; const [cx, cz] = H.map.trincheira.ring.c;
  H.tr.forjaUp = true; H.event({ e: 'forjaSobe' });
  H.look(cx - 6, 5, cz + 8, cx, 1.5, cz);
}, {}], 3000);
await scene('forja-pronta', [() => {
  const H = window.__h; const [cx, cz] = H.map.trincheira.ring.c;
  H.look(cx - 5, 6, cz + 9, cx, 1.8, cz);
}, {}], 4500);
// montes e pás
await scene('montes', [() => {
  const H = window.__h; const m = H.map.trincheira.mounds[19];
  H.tr.weather = 'neve';
  H.look(m[0] - 3, 4, m[1] + 4, m[0], 0.3, m[1]);
}, {}], 3500);
// colossos
for (const [id, step, sub, t, dir] of [['atlas', 1, 'move', 0.5, 1], ['golias', 0, 'desce', 0.5, 1], ['tita', 2, 'sobe', 0.6, 1]]) {
  await scene('colosso-' + id, [([id, step, sub, t, dir]) => {
    const H = window.__h; const feet = H.map.trincheira.feet.filter((f) => f.robot === id);
    H.tr.robot = { id, phase: 'passos', warn: 0, step, sub, t, dir };
    const f = feet[Math.min(step, feet.length - 1)]; const cx = (f.r[0] + f.r[2]) / 2, cz = (f.r[1] + f.r[3]) / 2;
    H.look(cx + 35, 8, cz + 40, cx, 14, cz - 10);
  }, [id, step, sub, t, dir]], 1200);
}
// chuva e neve
await scene('chuva', [() => {
  const H = window.__h; H.tr.robot = null; H.tr.weather = 'chuva';
  H.cam(100, 1.7, 45, 1.2, 0.05);
}, {}], 4500);
await scene('neve', [() => {
  const H = window.__h; H.tr.weather = 'neve';
  H.cam(100, 1.7, 45, 1.2, 0.05);
}, {}], 6500);
await scene('clima-limpo', [() => { window.__h.tr.weather = 'limpo'; }, {}], 100);
// peças, caixotes e bancada
await scene('pecas', [() => {
  const H = window.__h; const it = H.map.interactables.find((i) => i.id === 'part:escudo-rodas:0');
  H.tr.pick = ['part:escudo-rodas:0', 'part:gramofone:0', 'part:disco:0', 'part:tabua:0', 'part:fogo-1:0'];
  H.look(it.use[0] + 2.5, 3.5, it.use[1] + 2.5, it.use[0], 1, it.use[1]);
}, {}]);
await scene('caixotes-vento', [() => {
  const H = window.__h; const c = H.map.trincheira.windCrates[0];
  H.tr.pick = ['part:vento-1:0']; H.tr.windOpen = false;
  H.look(c[0] + 3, 4, c[1] + 3, c[0], 0.6, c[1]);
}, {}]);
await scene('caixotes-vento-abertos', [() => { window.__h.tr.windOpen = true; }, {}], 1500);
await scene('bancada', [() => {
  const H = window.__h; const b = H.map.trincheira.benches[0];
  H.tr.team = ['escudo-rodas', 'escudo-trava', 'escudo-armacao', 'drone-cerebro'];
  H.tr.build.escudo.built = true; H.tr.build.escudo.bench = 0; H.tr.build.drone.built = true; H.tr.build.drone.bench = 0; H.tr.build.drone.state = 'banco';
  H.look(b[0] + 2, 3.5, b[1] + 2.5, b[0], 1.2, b[1]);
}, {}]);
// mesa dos cajados + missão + painel de equipe
await scene('mesa-cajados', [() => {
  const H = window.__h; const [cx, cz] = H.map.trincheira.ring.c;
  H.tr.forjaUp = true;
  H.tr.staffs.forEach((s, i) => { s.st = i === 3 ? 'faltando' : 'pedestal'; s.awake = i === 0; });
  H.tr.team = ['raio-1', 'raio-2', 'cristal-raio', 'gelo-3', 'gramofone'];
  H.tr.missao = { step: 2, count: 40, t: 0 };
  H.look(cx + 11, 8, cz + 11, cx, 1.4, cz);
}, {}], 1500);
// baús de almas / lápides / domos
await scene('baus', [() => {
  const H = window.__h; const c = H.map.trincheira.chests[0];
  H.tr.staffs[0].st = 'mao'; H.tr.staffs[0].puzzle = [6, 3, 0, 1];
  H.look(c[0] + 4, 6, c[1] + 4, c[0], 0.8, c[1]);
}, {}]);
await scene('domos', [() => {
  const H = window.__h; const c = H.map.trincheira.domes[0];
  H.tr.staffs[2].puzzle = [0, 1, 0];
  H.look(c[0] + 5, 6, c[1] + 5, c[0], 1.5, c[1]);
}, {}], 2500);
// portais e câmara
await scene('tunel-fechado', [() => {
  const H = window.__h; const p = H.map.trincheira.portals[0];
  H.look(p.slab[0] - 3, 4, p.slab[1] + 5, p.slab[0], 1.5, p.slab[1]);
}, {}]);
await scene('tunel-aberto', [() => { window.__h.tr.portals = [true, true, true, true]; }, {}], 1500);
await scene('camara', [() => {
  const H = window.__h; const [cx, cz] = H.map.trincheira.chamber.center;
  H.tr.staffs[3].st = 'mao'; H.tr.staffs[3].seq = [2, 5, 3];
  H.look(cx - 2, 12, cz + 14, cx, 1.5, cz - 4);
}, {}], 1500);
await scene('altar-camara', [() => {
  const H = window.__h; const a = H.map.trincheira.chamber.alcoves.find((x) => x.el === 'fogo');
  H.tr.staffs[0].st = 'altar'; H.tr.staffs[0].charge = 0.6;
  H.look(a.altar[0] - 4, 5, a.altar[1] + 5, a.altar[0], 1.5, a.altar[1]);
}, {}], 1500);
// HUD
await scene('hud', [() => {
  const H = window.__h; const c = H.map.trincheira.challengeChests[0];
  H.tr.robot = { id: 'atlas', phase: 'aviso', warn: 6, step: 0, sub: 'sobe', t: 0, dir: 1 };
  H.tr.recapture = true; H.tr.gens[4].attacked = true;
  H.me.zblood = 12; H.me.shield = 900; H.me.artilharia = 3; H.me.punho = true;
  H.cam(c[0] - 2, 1.7, c[1], -Math.PI / 2, 0);
}, {}], 1200);
await browser.close();
console.log(errs.length ? 'ERROS:\n' + [...new Set(errs)].join('\n') : 'sem erros no console');
