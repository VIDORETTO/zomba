// Teste no navegador (solo) das fases 2 a 9 da Trincheira. Uso: node tools/test-trincheira-jogo.mjs <pasta>  (com o Vite em 127.0.0.1:5173)
import { launch } from './launch.mjs';
const out = process.argv[2] ?? '.';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
let ok = 0, bad = 0;
const check = (name, cond, detail = '') => { cond ? ok++ : bad++; console.log(`${cond ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` (${detail})` : ''}`); };
const press = async (k, ms = 60) => { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); };
const G = (fn, arg) => page.evaluate(fn, arg);
await page.goto('http://127.0.0.1:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click('#map-choice [data-map="trincheira"]');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
await page.waitForTimeout(2000);
// A3: depois de 4 s do começo, as três linhas do título aparecem inteiras
await page.waitForFunction(() => document.querySelector('.intro-line')?.textContent === 'TRINCHEIRA', null, { timeout: 60000 });
await page.waitForTimeout(4000);
{
  const intro = await G(() => [...document.querySelectorAll('.intro-line')].map((d) => d.textContent));
  check('título de entrada completo depois de 4 s', intro.length === 3 && intro[0] === 'TRINCHEIRA' && intro[1] === 'Norte da França, 1918' && /^.+, \d\d:\d\d$/.test(intro[2]), JSON.stringify(intro));
}
// sem zumbis nem dano: os testes controlam o que aparece
await G(() => { const s = window.__game.transport.sim; s.toSpawn = 0; s.zombies.clear(); s.spawnZombie = () => undefined; const p = s.players.get('local'); p.health = p.maxHealth = 99999; window.__game.debugPoints(90000); });
const at = (id) => G((id) => { const g = window.__game; const it = g.o.map.interactables.find((i) => i.id === id); g.debugView(it.use[0], it.use[1], 0, 0.05); return it.use; }, id);
const prompt = () => G(() => document.querySelector('.prompt-text')?.textContent ?? '');
const sim = (fn, arg) => page.evaluate(([f, a]) => { const s = window.__game.transport.sim; return eval(f)(s, a); }, [fn.toString(), arg]);

// 1. todas as interações mostram aviso sem erro
const all = await G(() => window.__game.o.map.interactables.filter((i) => i.use[0] < 135).map((i) => i.id));
let noPrompt = [];
for (const id of all) {
  await at(id);
  await page.waitForTimeout(90);
  const t = await prompt();
  if (/^(gen|fizz|pa|monte|bench|portal|staff|desafio|tank|tabua|poco|part)/.test(id) && !t && !/^(fizz|monte|part)/.test(id)) noPrompt.push(id);
}
check('interações novas mostram aviso de F (as ativas)', noPrompt.length === 0, noPrompt.join(' '));
check('sem erro depois de passar por todas as interações', errs.length === 0, errs.slice(0, 2).join(' | '));

// 2. gerador pelo teclado
await at('gen-0');
await page.waitForTimeout(300);
const gp = await prompt();
check('aviso do gerador com preço', /gerador|Posto de Comando/i.test(gp) && /200/.test(gp), gp);
await press('KeyF');
await page.waitForTimeout(3500);
const gprog = await sim((s) => s.tr.gens[0].progress);
check('F no gerador começa a captura', gprog > 0.05, String(gprog));
await page.screenshot({ path: `${out}/j1-gerador.png` });

// 3. lama deixa mais lento
const speedAt = async (x, z) => {
  await G(([x, z]) => window.__game.debugView(x, z, Math.PI / 2, 0), [x, z]);
  await page.waitForTimeout(400);
  const a = await G(() => ({ x: window.__game.pc.pos.x, z: window.__game.pc.pos.z }));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyW');
  const b = await G(() => ({ x: window.__game.pc.pos.x, z: window.__game.pc.pos.z }));
  return Math.hypot(b.x - a.x, b.z - a.z);
};
const dMud = await speedAt(18, 28.2);
const dDry = await speedAt(103, 58);
check('na lama o jogador anda ~30% mais devagar', dMud < dDry * 0.85 && dMud > dDry * 0.5, `lama ${dMud.toFixed(1)} m, seco ${dDry.toFixed(1)} m`);

// 4. cavar com a pá segurando F
await G(() => { window.__game.debugTr('montes'); });
const mid = await sim((s) => [...s.tr.mounds][0]);
await at(`monte-${mid}`);
await page.waitForTimeout(300);
const dp = await prompt();
check('aviso de cavar', /cavar|Cavar/.test(dp), dp);
await page.keyboard.down('KeyF');
await page.waitForTimeout(1600);
await page.keyboard.up('KeyF');
await page.waitForTimeout(400);
check('segurar F cava o monte', await sim((s, i) => !s.tr.mounds.has(i), mid));

// 5. tanque: alavanca, subir e ser carregado
await G(() => { const g = window.__game; const it = g.o.map.interactables.find((i) => i.id === 'tank-lever'); g.debugView(it.use[0] - 1.1, it.use[1], 0, 0.05); });
await page.waitForTimeout(400);
await press('KeyF');
await page.waitForTimeout(1500);
check('alavanca chama o tanque', (await sim((s) => s.tr.tank.state)) === 'volta');
await page.waitForTimeout(2500);
const before = await G(() => { const g = window.__game; const t = g.tr.tankPose(); g.pc.pos.set(t.x, 1.16, t.z); g.pc.vel.set(0, 0, 0); return { x: t.x, z: t.z }; });
await page.waitForTimeout(3500);
const after = await G(() => ({ x: window.__game.pc.pos.x, z: window.__game.pc.pos.z, y: window.__game.pc.pos.y, onTank: window.__game.pc.onTank }));
check('quem está em cima do tanque é levado junto', after.onTank && Math.hypot(after.x - before.x, after.z - before.z) > 6, JSON.stringify(after));
await page.screenshot({ path: `${out}/j2-tanque.png` });

// 6. colosso
await G(() => { window.__game.debugTr('colosso', 'atlas'); window.__game.debugView(-22, 20, Math.PI, 0.25); });
await page.waitForTimeout(8500);
const rb = await sim((s) => s.tr.robot && s.tr.robot.phase);
check('colosso entra em cena depois do aviso', rb === 'passos');
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/j3-colosso.png` });

// 7. cajados: pega, atira e ataque carregado
await G(() => { window.__game.debugTr('cajados'); const s = window.__game.transport.sim; s.tr.robot = null; });
await at('staff-fogo');
await page.waitForTimeout(300);
await press('KeyF');
await page.waitForTimeout(1200);
const hasStaff = await G(() => window.__game.me.weapons.includes('cajado-fogo-d'));
check('F no pedestal pega o cajado desperto', hasStaff);
await G(() => { const g = window.__game; g.debugView(-30, 28.2, -Math.PI / 2, 0.05); g.weapon.switchTo('cajado-fogo-d'); });
await page.waitForTimeout(1200);
await page.mouse.down();
await page.waitForTimeout(1900);
const cf = await G(() => window.__game.weapon.chargeFrac);
await page.screenshot({ path: `${out}/j4-carga.png` });
await page.mouse.up();
await page.waitForTimeout(900);
const area = await sim((s) => s.tr.areas.length);
check('segurar o gatilho do cajado desperto faz o ataque carregado (pilar)', cf > 0.5 && area >= 1, `carga ${cf}, áreas ${area}`);
await page.screenshot({ path: `${out}/j5-pilar.png` });

// 8. portal e Câmara
await G(() => { window.__game.debugTr('portais'); const p = window.__game.o.map.trincheira.portals[0]; window.__game.debugView(p.mouth[0], p.mouth[1], 0, 0); });
await page.waitForTimeout(2200);
const inCh = await G(() => window.__game.pc.pos.x > 136);
check('entrar no túnel aberto leva à Câmara Antiga', inCh);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/j6-camara.png` });

// 9. artilharia
await G(() => { window.__game.debugTr('tp:100,52'); window.__game.debugTr('artilharia'); window.__game.debugView(100, 52, 0, 0.3); });
await page.waitForTimeout(800);
await press('Digit4');
await page.waitForTimeout(1500);
check('tecla 4 arremessa a Granada de Artilharia', await sim((s) => s.tr.P(s.players.get('local')).artilharia === 2 || s.tr.strikes.length > 0));
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/j7-artilharia.png` });

// 10. E1: pilha de avisos no topo (barra de chefe fixa; no máximo 2 avisos embaixo, por prioridade)
{
  await G(() => { const s = window.__game.transport.sim; s.tr.robot = null; s.toSpawn = 0; s.zombies.clear(); window.__game.debugTr('tp:100,52'); });
  await G(() => { window.__game.debugTr('blindado'); window.__game.debugTr('colosso', 'tita'); window.__game.debugTr('cruzados'); });
  await page.waitForTimeout(2500);
  const info = await G(() => {
    const vis = (e) => e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none';
    const alerts = [...document.querySelectorAll('.tr-alerts .tr-alert')].filter(vis).map((e) => ({ id: e.dataset.id, top: e.getBoundingClientRect().top, text: e.textContent }));
    const boss = document.querySelector('.bossbar');
    return { alerts, bossVisible: vis(boss), bossBottom: boss ? boss.getBoundingClientRect().bottom : 0, old: !!document.querySelector('.tr-robot, .tr-recap') };
  });
  check('Blindado + colosso perto + Cruzados: no máximo 2 avisos abaixo da barra', info.bossVisible && info.alerts.length >= 1 && info.alerts.length <= 2, JSON.stringify(info.alerts.map((a) => a.id)));
  check('o aviso do colosso perto vem primeiro, depois os Cruzados', info.alerts[0]?.id === 'colosso' && info.alerts[1]?.id === 'cruzados', JSON.stringify(info.alerts.map((a) => a.id)));
  check('os avisos ficam abaixo da barra de chefe (sem se sobrepor)', info.alerts.every((a) => a.top >= info.bossBottom - 1), `barra termina em ${Math.round(info.bossBottom)}, avisos em ${info.alerts.map((a) => Math.round(a.top)).join(',')}`);
  check('os painéis antigos (um em cima do outro) não existem mais', !info.old);
  await page.screenshot({ path: `${out}/e1-avisos.png` });
  // prioridade e excedente: 4 avisos falsos → mostra os 2 de maior prioridade e um ícone "+2"
  const fake = await G(() => {
    const hud = window.__game.hud.tr;
    const mk = (id, prio) => ({ id, prio, text: id, color: '#fff', angle: null, dist: null });
    hud.setAlerts([mk('d', 4), mk('b', 2), mk('a', 1), mk('c', 3)]);
    const shown = [...document.querySelectorAll('.tr-alerts .tr-alert')].filter((e) => !e.classList.contains('hidden')).map((e) => e.dataset.id);
    const more = document.querySelector('.tr-alerts .tr-more');
    return { shown, more: more && !more.classList.contains('hidden') ? more.textContent : '' };
  });
  check('com 4 avisos: mostra os 2 de maior prioridade, em ordem', fake.shown.join() === 'a,b', fake.shown.join());
  check('o que não cabe vira um ícone pequeno com a contagem', /\+2/.test(fake.more), fake.more);
  await G(() => { const s = window.__game.transport.sim; s.tr.robot = null; });
}

const fpsv = await G(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000))); }; requestAnimationFrame(f); }));
console.log('FPS (renderização por software):', fpsv);
check('sem erros no navegador do começo ao fim', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${ok} ok, ${bad} falharam`);
await browser.close();
process.exit(bad ? 1 : 0);
