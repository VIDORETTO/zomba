// Teste no navegador (headless): mapa Trincheira (menu, portões, paredes, arma de parede, bebida, Caixa, zumbis, FPS).
// Uso: node tools/test-trincheira.mjs <pasta>   (com npm run dev ligado)
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
const walk = async (k, ms) => { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); };
const fps = () => page.evaluate(() => new Promise((res) => {
  let n = 0;
  const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000))); };
  requestAnimationFrame(f);
}));
// fica no ponto de uso da interação, olhando para a coisa (yaw 0 = norte, -z)
const face = (id, look) => page.evaluate(([id, look]) => {
  const g = window.__game;
  const it = g.o.map.interactables.find((i) => i.id === id);
  const [lx, lz] = look ?? [it.use[0], it.use[1] - 1];
  g.debugView(it.use[0], it.use[1], Math.atan2(-(lx - it.use[0]), -(lz - it.use[1])), 0.05);
  return it.use;
}, [id, look]);
const pos = () => page.evaluate(() => ({ x: window.__game.pc.pos.x, z: window.__game.pc.pos.z }));

await page.goto('http://127.0.0.1:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click('#map-choice [data-map="trincheira"]');
check('menu mostra a Trincheira', await page.evaluate(() => document.querySelector('#map-choice [data-map="trincheira"]').classList.contains('on') && /escavação/.test(document.querySelector('#map-desc').textContent)));
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
await page.waitForTimeout(1500);
const start = await page.evaluate(() => ({ map: window.__game.o.map.id, place: window.__game.o.map.place, x: window.__game.pc.pos.x, z: window.__game.pc.pos.z }));
check('começa no Posto de Comando', start.map === 'trincheira' && start.x > 94 && start.x < 112 && start.z > 39 && start.z < 62, JSON.stringify(start));
await page.evaluate(() => { const s = window.__game.transport.sim; s.toSpawn = 0; s.zombies.clear(); s.players.get('local').health = s.players.get('local').maxHealth = 99999; window.__game.debugPoints(6000); });
await page.screenshot({ path: `${out}/tt1-posto.png` });

// parede: andar contra a parede oeste do Posto (fora do portão) não atravessa
await page.evaluate(() => window.__game.debugView(97, 44, Math.PI / 2, 0));
await page.waitForTimeout(300);
await walk('KeyW', 1500);
const wall = await pos();
check('parede do Posto segura o jogador', wall.x > 95.1, JSON.stringify(wall));

// portão da Casamata (norte do Posto)
const door = await page.evaluate(() => window.__game.o.map.interactables.find((i) => i.door === 'casamata'));
await face(door.id, [door.use[0], door.use[1] - 2]);
await page.waitForTimeout(500);
const prompt = await page.evaluate(() => document.querySelector('.prompt-text')?.textContent);
check('aviso de abrir a Casamata por 750', /Casamata/.test(prompt ?? '') && /750/.test(prompt ?? ''), prompt);
await page.screenshot({ path: `${out}/tt2-portao.png` });
await press('KeyF');
await page.waitForTimeout(1500);
const st = await page.evaluate(() => ({ pts: window.__game.me.points, open: window.__game.world.openDoors.has('casamata') }));
check('Casamata aberta por 750', st.open && st.pts === 5250, JSON.stringify(st));
await walk('KeyW', 1600);
const p1 = await pos();
check('jogador passa pelo portão andando', p1.z < door.use[1] - 3, JSON.stringify(p1));
await page.screenshot({ path: `${out}/tt3-trincheira-leste.png` });

// arma de parede (Carabina) e bebida (Segundo Fôlego) no Posto
const sign = await page.evaluate(() => window.__game.o.map.signs.find((s) => s.chalk === 'ferrolho').pos);
await face('wall-ferrolho', [sign[0], sign[2]]);
await page.waitForTimeout(400);
await press('KeyF');
await page.waitForTimeout(600);
const w = await page.evaluate(() => window.__game.me.weapons);
check('compra o Fuzil de Ferrolho na tábua da parede', w.includes('ferrolho'), JSON.stringify(w));
await page.evaluate(() => window.__game.debugTr('gens'));
const perk = await page.evaluate(() => window.__game.o.map.interactables.find((i) => i.id === 'perk-folego'));
await face('perk-folego');
await page.evaluate(([x, z]) => { const g = window.__game; const ms = g.o.map.signs.find((s) => s.text === 'SEGUNDO FÔLEGO'); g.debugView(x, z, Math.atan2(-(ms.pos[0] - x), -(ms.pos[2] - z)), 0); }, perk.use);
await page.waitForTimeout(400);
await press('KeyF');
await page.waitForTimeout(3500);
const perks = await page.evaluate(() => window.__game.me.perks);
check('bebe o Segundo Fôlego (com o gerador ligado)', perks.includes('folego'), JSON.stringify(perks));

// Caixa Misteriosa começa no Posto
const box = await page.evaluate(() => { const g = window.__game; const s = g.o.map.boxSpots[0]; return { name: s.name, loc: g.transport.sim.box.loc }; });
check('Caixa começa no Posto de Comando', box.loc === 0 && box.name === 'Posto de Comando', JSON.stringify(box));
await page.evaluate(() => { const g = window.__game; const s = g.o.map.boxSpots[0]; g.debugView(s.x + s.nx * 1.3, s.z + s.nz * 1.3, Math.atan2(s.nx, s.nz), 0.1); });
await page.waitForTimeout(400);
await press('KeyF');
await page.waitForTimeout(700);
check('Caixa gira', await page.evaluate(() => window.__game.transport.sim.box.state === 'spinning'));
await page.screenshot({ path: `${out}/tt4-caixa.png` });

// Forja acesa no meio da Escavação
await page.evaluate(() => { const s = window.__game.transport.sim; for (const d of window.__game.o.map.doors) s.world.openDoors.add(d.id); });
await face('forge', [-15, -7]);
await page.waitForTimeout(800);
const fp = await page.evaluate(() => document.querySelector('.prompt-text')?.textContent);
check('Forja acesa na Escavação', /Forja/i.test(fp ?? ''), fp);
await page.screenshot({ path: `${out}/tt5-forja.png` });

// zumbis sobem e acham o jogador pela lama
await page.evaluate(() => { const g = window.__game; g.debugView(20, 27, Math.PI / 2, 0); g.transport.sim.toSpawn = 6; });
await page.waitForTimeout(6000);
const z1 = await page.evaluate(() => { const g = window.__game; const p = g.pc.pos; return [...g.transport.sim.zombies.values()].map((z) => Math.hypot(z.x - p.x, z.z - p.z)); });
await page.waitForTimeout(5000);
const z2 = await page.evaluate(() => { const g = window.__game; const p = g.pc.pos; return [...g.transport.sim.zombies.values()].map((z) => Math.hypot(z.x - p.x, z.z - p.z)); });
const avg = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
check('zumbis surgem e vêm na direção do jogador', z1.length > 0 && avg(z2) < avg(z1), `${z1.length} zumbis, ${avg(z1).toFixed(1)} m -> ${avg(z2).toFixed(1)} m`);
await page.screenshot({ path: `${out}/tt6-zumbis.png` });
const f = await fps();
check('FPS bom na lama com zumbis (50+ em GPU real; ~20 em renderização por software)', f >= (process.env.TR_SOFT ? 15 : 50), `${f} FPS`);
check('sem erros no navegador', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${ok} ok, ${bad} falharam`);
await browser.close();
process.exit(bad ? 1 : 0);
