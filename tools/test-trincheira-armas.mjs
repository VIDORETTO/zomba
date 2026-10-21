// Teste no navegador (headless): sons da Trincheira, cajados, Punho, carga do gatilho, Granada de Artilharia,
// soldados de 1918, Blindado, Cruzado e status de queima/gelo. Gera capturas na pasta indicada.
// Uso: node tools/test-trincheira-armas.mjs <pasta> [porta]   (com o Vite ligado; porta padrão 5173)
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const port = process.argv[3] ?? '5173';
const exe = process.env.CHROME_BIN ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1169/chrome-linux/chrome`;
const browser = await chromium.launch({
  executablePath: exe, headless: true,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
const errs = [];
// o aviso de F do game.ts ainda não conhece as interações novas da Trincheira (integração do outro dono): ignora esse erro
const known = (t) => t.includes("reading 'id'");
page.on('pageerror', (e) => { if (!known(e.message)) errs.push(e.message); });
page.on('console', (m) => { if (m.type() === 'error' && !known(m.text())) errs.push(m.text()); });
let ok = 0, bad = 0;
const check = (name, cond, detail = '') => { cond ? ok++ : bad++; console.log(`${cond ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` (${detail})` : ''}`); };

await page.goto(`http://localhost:${port}/?autoplay`);
await page.waitForLoadState('networkidle');
await page.click('#map-choice [data-map="trincheira"]');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const g = window.__game;
  const s = g.transport.sim;
  s.toSpawn = 0;
  s.zombies.clear();
  const p = s.players.get('local');
  p.health = p.maxHealth = 99999;
  g.zombies.era = 'ww1';
  g.debugView(30, 27, 0, 0);
});

// ---------- sons ----------
const names = await page.evaluate(async () => {
  const a = window.__game.audio;
  const { TR_SOUNDS } = await import('/src/client/trSound.ts');
  return TR_SOUNDS;
});
// a lista cresce com o polimento (vinhetas, passos, cantil, rádio...): confere os de sempre e que não há nome repetido
check('sons da lista: os de sempre existem e não há repetidos', ['vinheta-inicio', 'passo-distante', 'cantil-1', 'radio'].every((n) => names.includes(n)) && new Set(names).size === names.length && names.length >= 51, String(names.length));
const levels = await page.evaluate(async (names) => {
  const a = window.__game.audio;
  await a.ctx.resume();
  const an = a.ctx.createAnalyser();
  an.fftSize = 2048;
  a.master.connect(an);
  const buf = new Float32Array(an.fftSize);
  const res = {};
  a.trSound('achou-peca');
  await new Promise((r) => setTimeout(r, 500));
  for (const n of names) {
    let peak = 0;
    a.trSound(n, undefined, 1);
    const t0 = performance.now();
    while (performance.now() - t0 < 160) {
      an.getFloatTimeDomainData(buf);
      for (const v of buf) peak = Math.max(peak, Math.abs(v));
      await new Promise((r) => setTimeout(r, 8));
    }
    res[n] = peak;
    // limpa o que sobrou do som antes do próximo
    await new Promise((r) => setTimeout(r, 40));
  }
  return res;
}, names);
const silent = Object.entries(levels).filter(([, v]) => v < 0.002).map(([k]) => k);
check('todos os sons produzem sinal', silent.length === 0, silent.join(', '));
const loud = Object.entries(levels).filter(([, v]) => v > 2.2).map(([k, v]) => `${k}:${v.toFixed(2)}`);
check('nenhum som estoura demais', loud.length === 0, loud.join(', '));
console.log('níveis:', Object.entries(levels).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(' '));
await page.evaluate(async () => {
  const a = window.__game.audio;
  for (const w of ['chuva', 'neve', 'limpo']) a.setWeather(w);
  a.startTrincheira();
  a.trUpdate(30);
  a.trUpdate(30);
  a.footstep('mud', 1);
  a.stopTrincheira();
});
check('ambiente, clima e passo na lama sem erro', errs.length === 0, errs.slice(0, 2).join(' | '));

// ---------- cajados ----------
const STAFFS = ['cajado-fogo', 'cajado-gelo', 'cajado-vento', 'cajado-raio', 'cajado-fogo-d', 'cajado-gelo-d', 'cajado-vento-d', 'cajado-raio-d'];
await page.mouse.move(512, 288);
for (const id of STAFFS) {
  await page.evaluate((id) => {
    const g = window.__game;
    const s = g.transport.sim;
    s.players.get('local').weapons = ['pistol', id];
    g.debugView(30, 27, 0, 0);
  }, id);
  await page.waitForTimeout(250);
  await page.evaluate((id) => window.__game.weapon.switchTo(id), id);
  await page.waitForTimeout(900);
  const cur = await page.evaluate(() => window.__game.weapon.def.id);
  check(`${id} na mão`, cur === id, cur);
  await page.screenshot({ path: `${out}/a-${id}-1parada.png` });
  if (id === 'cajado-fogo-d' || id === 'cajado-raio') {
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/a-${id}-2mira.png` });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(300);
  }
}

// ---------- carga do gatilho ----------
for (const id of ['cajado-fogo-d', 'cajado-gelo-d']) {
  await page.evaluate((id) => {
    const g = window.__game;
    g.transport.sim.players.get('local').weapons = ['pistol', id];
    g.debugView(30, 27, 0, 0);
    window.__fires = [];
    g.weapon.cb = { ...g.weapon.cb, fire: (spread, charged) => window.__fires.push(!!charged) };
  }, id);
  await page.waitForTimeout(250);
  await page.evaluate((id) => window.__game.weapon.switchTo(id), id);
  await page.waitForTimeout(900);
  // aperto rápido = disparo comum
  await page.evaluate(() => { window.__fires = []; });
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
  await page.waitForTimeout(500);
  const quick = await page.evaluate(() => window.__fires.slice());
  check(`${id}: aperto rápido dispara sem carga`, quick.length >= 1 && quick.every((c) => !c), JSON.stringify(quick));
  // segurar até encher
  await page.evaluate(() => { window.__fires = []; });
  await page.mouse.down();
  await page.waitForTimeout(700);
  const mid = await page.evaluate(() => window.__game.weapon.chargeFrac);
  check(`${id}: anel de carga enche aos poucos`, mid > 0.15 && mid < 0.95, mid.toFixed(2));
  await page.screenshot({ path: `${out}/c-${id}-carga.png` });
  await page.waitForTimeout(1400);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const long = await page.evaluate(() => window.__fires.slice());
  check(`${id}: segurar dá o ataque carregado`, long.includes(true), JSON.stringify(long.slice(-4)));
}

// ---------- Punho de Ferro ----------
await page.evaluate(() => {
  const g = window.__game;
  g.transport.sim.players.get('local').weapons = ['pistol'];
  g.debugView(30, 27, 0, 0);
  // o jogo copia o Punho do estado do jogador a cada quadro: liga no estado de verdade
  const sim = g.transport.sim;
  sim.tr.P(sim.players.get('local')).punho = true;
});
await page.waitForTimeout(800);
await page.keyboard.down('KeyV');
await page.waitForTimeout(60);
await page.keyboard.up('KeyV');
// congela a animação no instante do soco para a captura
await page.evaluate(() => { window.__hold = setInterval(() => { window.__game.weapon.stateT = 0.17; }, 5); });
await page.waitForTimeout(300);
const punhoInfo = await page.evaluate(() => { const w = window.__game.weapon; return { fist: w.fistRig.visible, knife: w.knifeRig.visible, state: w.state, punho: w.punho }; });
check('soco do Punho mostra a luva', punhoInfo.fist && punhoInfo.knife, JSON.stringify(punhoInfo));
await page.screenshot({ path: `${out}/p-punho.png` });
await page.evaluate(() => clearInterval(window.__hold));
await page.waitForTimeout(900);
await page.evaluate(() => { const sim = window.__game.transport.sim; sim.tr.P(sim.players.get('local')).punho = false; window.__game.weapon.punho = false; });

// ---------- Granada de Artilharia ----------
const thrown = await page.evaluate(async () => {
  const g = window.__game;
  let n = 0;
  g.weapon.cb = { ...g.weapon.cb, throwArtillery: () => { n++; } };
  const started = g.weapon.throwArtillery();
  window.__hold = setInterval(() => { if (g.weapon.stateT > 0.3) g.weapon.stateT = 0.3; else if (g.weapon.stateT < 0.3) g.weapon.stateT = Math.min(0.3, g.weapon.stateT); }, 5);
  await new Promise((r) => setTimeout(r, 300));
  window.__nArt = () => n;
  return { started, n };
});
check('granada de artilharia na mão (esfera vermelha)', await page.evaluate(() => window.__game.weapon.grenadeHand.visible && window.__game.weapon.nadeMesh.material === window.__game.weapon.artMat));
await page.screenshot({ path: `${out}/ar-arremesso.png` });
await page.evaluate(() => clearInterval(window.__hold));
await page.waitForTimeout(1200);
const after = await page.evaluate(() => ({ busy: window.__game.weapon.busy, n: window.__nArt() }));
check('arremesso de artilharia começa', thrown.started === true);
check('arremesso de artilharia dispara o callback uma vez', after.n === 1, String(after.n));
check('mãos livres depois do arremesso', after.busy === false);

// ---------- soldados de 1918, Blindado, Cruzado ----------
const spawn = (kinds) => page.evaluate((kinds) => {
  const g = window.__game;
  const s = g.transport.sim;
  s.zombies.clear();
  s.toSpawn = 0;
  const p = s.players.get('local');
  g.debugView(p.x, p.z, 0, -0.05);
  kinds.forEach(([kind, dx, dz, yaw, anim], i) => {
    s.spawnZombie([p.x + dx, p.z + dz]);
    const z = [...s.zombies.values()].at(-1);
    z.kind = kind;
    z.hp = 1e9;
    z.speed = 0;
    z.anim = anim ?? 'move';
    z.yaw = yaw ?? Math.PI;
    z.look = 1000 + i * 7919;
    z.x = p.x + dx;
    z.z = p.z + dz;
  });
}, kinds);
await spawn([[0, -2.2, -4.5], [0, 0, -4.5], [1, 2.2, -4.5], [2, -1.1, -7], [0, 1.1, -7], [0, 3.5, -7], [0, -3.5, -7]]);
await page.waitForTimeout(1800);
await page.screenshot({ path: `${out}/z-ww1.png` });
check('soldados de 1918 desenhados', await page.evaluate(() => window.__game.zombies.views.size >= 7));

await spawn([[8, -2.5, -5], [8, 0, -6.5], [8, 2.5, -5], [8, -1.2, -9], [8, 1.2, -9]]);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/z-cruzado.png` });
check('Cruzados criados', await page.evaluate(() => [...window.__game.zombies.views.values()].filter((v) => v.kind === 8).length === 5));

// o Blindado desta captura é só um boneco: a IA dele (simulação da Trincheira) fica desligada
await page.evaluate(() => { const t = window.__game.transport.sim.tr; if (t) t.updatePanzer = () => {}; });
await spawn([[7, 0, -6, Math.PI, 'move']]);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/z-blindado-1parado.png` });
check('Blindado criado', await page.evaluate(() => [...window.__game.zombies.views.values()].some((v) => v.kind === 7)));
// poses: lança-chamas, garra, salto, descida, visor
for (const [name, anim] of [['2fogo', 'attack'], ['3garra', 'chain'], ['4salto', 'charge'], ['5desce', 'rise']]) {
  await page.evaluate((anim) => {
    const z = [...window.__game.transport.sim.zombies.values()][0];
    window.__keep = setInterval(() => { z.anim = anim; z.attackT = 0.2; z.hp = 1e9; z.speed = 0; z.t = 0; }, 20);
    const v = [...window.__game.zombies.views.values()][0];
    v.animT = anim === 'charge' ? 0.9 : anim === 'chain' ? 0.9 : anim === 'rise' ? 0.9 : 1;
    v.chain = { pid: 'local' };
  }, anim);
  await page.waitForTimeout(anim === 'rise' ? 500 : 650);
  await page.screenshot({ path: `${out}/z-blindado-${name}.png` });
  await page.evaluate(() => clearInterval(window.__keep));
}
await page.evaluate(() => {
  window.__game.zombies.onEvent({ e: 'blindado', phase: 'visor', zid: [...window.__game.zombies.views.keys()][0], x: 0, z: 0 });
  const z = [...window.__game.transport.sim.zombies.values()][0];
  z.anim = 'move';
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/z-blindado-6visor.png` });
check('visor do Blindado quebra (placa sai da cabeça)', await page.evaluate(() => {
  const v = [...window.__game.zombies.views.values()][0];
  return v.rig.helmet.visible === false;
}));

// ---------- status ----------
await spawn([[0, -2, -4.5], [0, 2, -4.5], [0, 0, -7]]);
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const ids = [...window.__game.zombies.views.keys()];
  window.__game.zombies.setStatus(ids[0], 'queima', 6);
  window.__game.zombies.setStatus(ids[1], 'congela', 6);
});
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/z-status.png` });
check('status aplicados', await page.evaluate(() => window.__game.zombies.statuses.size === 2));
await page.evaluate(() => {
  const ids = [...window.__game.zombies.views.keys()];
  window.__game.zombies.setStatus(ids[0], null);
});
check('status removido', await page.evaluate(() => window.__game.zombies.statuses.size === 1));

check('sem erros no navegador', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(`${ok} ok, ${bad} falhas`);
process.exit(bad ? 1 : 0);
