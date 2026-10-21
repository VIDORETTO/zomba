// Testes visuais da Trincheira no navegador (cena, luminância e desempenho).
// Uso: node tools/test-trincheira-visual.mjs [pasta-de-capturas] [--gravar]
// --gravar: grava a linha de base do orçamento de desempenho (docs/trincheira/orcamento.json)   (com o Vite em 127.0.0.1:5173)
// Em renderização por software (VPS) a luminância é confiável; o FPS não. Por isso o desempenho é medido em
// chamadas de desenho e triângulos por quadro, não em FPS (ticket F3).
import { launch } from './launch.mjs';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const GRAVAR = args.includes('--gravar');
const out = args.find((a) => !a.startsWith('--')) ?? '';
if (out) mkdirSync(out, { recursive: true });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
let ok = 0, bad = 0;
const check = (name, cond, detail = '') => { cond ? ok++ : bad++; console.log(`${cond ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` (${detail})` : ''}`); };
const G = (fn, arg) => page.evaluate(fn, arg);

await page.goto('http://127.0.0.1:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click('#map-choice [data-map="trincheira"]');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
await page.waitForTimeout(1500);
// sem zumbis nem dano; HUD escondido para medir só a cena
await G(() => {
  const g = window.__game;
  const s = g.transport.sim;
  s.toSpawn = 0;
  s.zombies.clear();
  s.spawnZombie = () => undefined;
  const p = s.players.get('local');
  p.health = p.maxHealth = 99999;
  // congela a rodada (o clima e as rodadas mudariam o que é desenhado entre uma medida e outra) e esconde o HUD
  s.state = 'intermission';
  s.stateTimer = 1e9;
  s.tr.weather = 'limpo';
  document.querySelectorAll('.hud, #hud').forEach((e) => (e.style.visibility = 'hidden'));
});

const view = async (x, z, yaw, pitch, wait = 1500) => {
  await G(([x, z, yaw, pitch]) => window.__game.debugView(x, z, yaw, pitch), [x, z, yaw, pitch]);
  await page.waitForTimeout(wait);
};

// luminância (0 a 1) de cada pixel da tela, em Float32
const luma = async () => {
  const buf = await page.screenshot();
  const b64 = await G(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const y = new Uint8Array(c.width * c.height);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) y[j] = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    let s = '';
    for (let i = 0; i < y.length; i += 8192) s += String.fromCharCode(...y.subarray(i, i + 8192));
    return { w: c.width, h: c.height, data: btoa(s) };
  }, buf.toString('base64'));
  const raw = Buffer.from(b64.data, 'base64');
  return { w: b64.w, h: b64.h, at: (x, y) => raw[Math.round(y) * b64.w + Math.round(x)] / 255 };
};
const project = (x, y, z) => G(([x, y, z]) => {
  const g = window.__game;
  g.camera.updateMatrixWorld(true);
  const v = g.camera.position.clone().set(x, y, z).project(g.camera);
  return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight, v.z];
}, [x, y, z]);
const mean = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const median = (a) => { const b = [...a].sort((p, q) => p - q); return b[Math.floor(b.length / 2)] ?? 0; };
const shot = async (name) => { if (out) await page.screenshot({ path: `${out}/${name}.png` }); };

// ---------------------------------------------------------------------------
// A2: feixe do gerador
// ---------------------------------------------------------------------------
await G(() => window.__game.debugTr('gens'));
const gens = await G(() => window.__game.o.map.trincheira.gens.map((g) => [g.x, g.z]));
const [gx, gz] = gens[0];

// 1. de perto o feixe não estoura a tela (quatro posições a 1,5 e 2 m; vale a pior)
{
  let pior = 0;
  for (const [d, off, pitch] of [[1.5, 0.5, 0.3], [1.5, -0.5, 0.3], [1.5, 0.5, 0.6], [2, 0.5, 0.3]]) {
    await view(gx + d, gz + off, Math.PI / 2, pitch, 1800);
    const L = await luma();
    const px = [];
    for (let y = 260; y < 460; y += 2) for (let x = 540; x < 740; x += 2) px.push(L.at(x, y));
    pior = Math.max(pior, mean(px));
    if (d === 1.5 && off === 0.5 && pitch === 0.3) await shot('a2-perto');
  }
  check('feixe de perto não estoura (centro da tela, 200x200 px, a 1,5 m)', pior < 0.65, `pior luminância média ${pior.toFixed(3)}`);
}

// o feixe na tela, linha a linha (a perspectiva o afunila): para cada altura de 3,6 m (acima da máquina) a 30 m,
// a linha da tela e o trecho central (70%) entre as bordas do cilindro
const beamRows = async () => {
  const rows = [];
  for (let h = 3.6; h <= 30; h += 0.6) {
    const [xa, ya] = await project(gx, h, gz - 0.7);
    const [xb] = await project(gx, h, gz + 0.7);
    const w = Math.abs(xb - xa);
    const cx = (xa + xb) / 2;
    if (ya < 2 || ya > 700 || w < 3) continue;
    rows.push({ y: Math.round(ya), x0: Math.round(cx - w * 0.35), x1: Math.round(cx + w * 0.35), w });
  }
  return rows;
};

// 2. sem mancha preta dentro do feixe: nenhum pixel escuro demais em relação à sua linha
const manchas = async (dist, pitch) => {
  await view(gx + dist, gz, Math.PI / 2, pitch, 2500);
  const L = await luma();
  const rows = await beamRows();
  let total = 0, escuros = 0;
  for (const r of rows) {
    const row = [];
    for (let x = r.x0; x <= r.x1; x++) row.push(L.at(x, r.y));
    const med = median(row);
    if (med < 0.25) continue; // linha em que o feixe já sumiu na altura
    for (const v of row) { total++; if (v < med * 0.5) escuros++; }
  }
  await shot(`a2-feixe-${dist}m`);
  return { frac: total ? escuros / total : 0, total, w: rows[0]?.w ?? 0 };
};
for (const [dist, pitch] of [[8, 0.4], [25, 0.15]]) {
  const r = await manchas(dist, pitch);
  check(`sem mancha preta no feixe a ${dist} m`, r.total > 30 && r.frac < 0.005, `${(r.frac * 100).toFixed(1)}% de pixels escuros em ${r.total} (largura ${r.w.toFixed(0)} px)`);
}

// 3. de longe o feixe continua bem visível (mais claro que o céu ao redor)
{
  await view(gx + 120, gz, Math.PI / 2, 0.1, 2500);
  const L = await luma();
  const [xa] = await project(gx, 20, gz - 0.7);
  const [xb] = await project(gx, 20, gz + 0.7);
  const cx = (xa + xb) / 2;
  const dentro = [], fora = [];
  for (let y = 100; y < 300; y += 4) {
    for (let x = cx - 2; x <= cx + 2; x++) dentro.push(L.at(x, y));
    for (const off of [-40, -30, 30, 40]) fora.push(L.at(cx + off, y));
  }
  await shot('a2-feixe-120m');
  check('feixe visível de longe (120 m): mais claro que o céu ao redor', mean(dentro) > mean(fora) + 0.05, `feixe ${mean(dentro).toFixed(3)} · céu ${mean(fora).toFixed(3)}`);
}

// ---------------------------------------------------------------------------
// Cena: objetos esperados existem (por nome)
// ---------------------------------------------------------------------------
const nomes = (lista) => G((lista) => {
  const g = window.__game;
  const cont = {};
  g.scene.traverse((o) => { if (o.name) cont[o.name] = (cont[o.name] ?? 0) + 1; });
  return lista.map((n) => [n, cont[n] ?? 0]);
}, lista);
const existem = async (titulo, lista, minimos = {}) => {
  const r = await nomes(lista);
  const falta = r.filter(([n, c]) => c < (minimos[n] ?? 1)).map(([n]) => n);
  check(titulo, falta.length === 0, falta.length ? `faltam: ${falta.join(', ')}` : r.map(([n, c]) => `${n}×${c}`).join(' '));
};

// B1: Escavação
await existem('Escavação: poço, andaimes, guindaste, lonas, runas, anéis e pedestais existem na cena',
  ['escavacao-poco', 'escavacao-andaime', 'escavacao-guindaste', 'escavacao-lona', 'escavacao-runas', 'escavacao-aneis', 'escavacao-pedestais'],
  { 'escavacao-andaime': 2, 'escavacao-lona': 2 });
{
  const info = await G(() => {
    const g = window.__game;
    const rings = [], lonas = [];
    g.scene.traverse((o) => { if (/^escavacao-anel-\d$/.test(o.name)) rings.push(o.name); });
    return { rings: rings.length, ring: g.o.map.trincheira.ring };
  });
  check('Escavação: 4 anéis de pedra desenhados (parados)', info.rings === 4, `${info.rings}`);
}
// pulsa: a opacidade das runas varia com o tempo (6 medidas, de 300 em 300 ms)
{
  const v = [];
  for (let i = 0; i < 6; i++) {
    v.push(await G(() => { let m = null; window.__game.scene.traverse((o) => { if (o.name === 'escavacao-runas') m = o.children[0]; }); return m.material.opacity; }));
    await page.waitForTimeout(300);
  }
  check('Escavação: as runas do chão pulsam', Math.max(...v) - Math.min(...v) > 0.05, v.map((x) => x.toFixed(2)).join(' '));
}
{
  const [px, pz] = await G(() => window.__game.o.map.trincheira.ring.c);
  await view(px, pz + 7, 0, -0.35, 2000);
  await shot('b1-escavacao-poco');
  await view(px, pz + 8.5, 0, 0.08, 2000);
  await shot('b1-escavacao');
}

// B2: céu e clima
await existem('Céu: nuvens, colunas de fumaça e sinalizador existem na cena', ['ceu-nuvens', 'fumaca-colunas', 'sinalizador']);
{
  const r = await G(() => {
    const tr = window.__game.tr;
    const cam = window.__game.camera.position;
    const toques = [];
    const play = tr.snd.play.bind(tr.snd);
    tr.snd.play = (n, p, v) => { toques.push(n); play(n, p, v); };
    const out = {};
    // 60 s de relógio de teste, em passos de 0,1 s
    const roda = (clima, seg) => {
      const a = { ...tr.sky.stats };
      for (let i = 0; i < seg * 10; i++) tr.sky.update(0.1, 1000 + i * 0.1, cam, clima);
      const b = tr.sky.stats;
      return { lightning: b.lightning - a.lightning, shells: b.shells - a.shells, flares: b.flares - a.flares };
    };
    out.limpo = roda('limpo', 60);
    out.chuva = roda('chuva', 60);
    // o trovão e o estrondo chegam atrasados pela distância: depois de mais 8 s os sons já tocaram
    roda('limpo', 8);
    out.sons = { trovao: toques.filter((n) => n === 'trovao').length, artilharia: toques.filter((n) => n === 'artilharia-longe').length };
    return out;
  });
  check('Relâmpago: em 60 s de tempo limpo acontece ao menos 1', r.limpo.lightning >= 1, `${r.limpo.lightning}`);
  check('Relâmpago: na chuva é mais frequente (6 a 15 s)', r.chuva.lightning >= 3, `${r.chuva.lightning} em 60 s`);
  check('Artilharia ao longe: clarão no horizonte e estrondo, em 60 s', r.limpo.shells >= 1 && r.sons.artilharia >= r.limpo.shells, `${r.limpo.shells} clarões, ${r.sons.artilharia} estrondos`);
  check('Trovão chega atrasado: tocou em todos os relâmpagos', r.sons.trovao >= r.limpo.lightning + r.chuva.lightning - 1, `${r.sons.trovao} trovões para ${r.limpo.lightning + r.chuva.lightning} relâmpagos`);
  check('Sinalizador: aparece de 30 a 60 s', r.limpo.flares >= 1, `${r.limpo.flares}`);
}
{
  // clarão de 0,15 s: quando o relâmpago cai, o clarão sobe a 1 e volta a 0 em ~0,15 s
  const r = await G(() => {
    const sky = window.__game.tr.sky, cam = window.__game.camera.position;
    sky.update(0.01, 2000, cam, 'limpo');
    sky.strike(cam);
    const vals = [];
    for (let i = 0; i < 25; i++) { sky.update(0.01, 2000 + i * 0.01, cam, 'limpo'); vals.push(sky.flash); }
    return { pico: Math.max(...vals), fim: vals[vals.length - 1], duracao: vals.filter((v) => v > 0.05).length * 0.01 };
  });
  check('Clarão do relâmpago: pico 1 e dura ~0,15 s', r.pico > 0.95 && r.fim < 0.05 && r.duracao > 0.1 && r.duracao < 0.2, JSON.stringify(r));
}
{
  // neve: a mistura no chão sobe devagar durante a rodada de neve
  const r = await G(() => {
    const w = window.__game.tr.weather, cam = window.__game.camera.position;
    w.setWeather('neve');
    const v = [w.snowGround];
    for (let i = 1; i <= 600; i++) { w.update(0.1, 3000 + i * 0.1, cam); if (i % 200 === 0) v.push(w.snowGround); }
    return v;
  });
  check('Neve: o chão vai de 0 a mais de 0,5 em 60 s, aos poucos', r[0] < 0.01 && r[1] > 0.1 && r[1] < r[2] && r[3] > 0.5, r.map((x) => x.toFixed(2)).join(' → '));
  await G(() => { const w = window.__game.tr.weather; w.setWeather('limpo'); const cam = window.__game.camera.position; for (let i = 1; i <= 900; i++) w.update(0.1, 4000 + i * 0.1, cam); });
}
await view(-15, 20, Math.PI, 0.5, 2500);
await shot('b2-ceu');
await G(() => { window.__game.tr.sky.strike(window.__game.camera.position); });
await page.waitForTimeout(60);
await shot('b2-relampago');

// B9: anel de progresso e cordões de lâmpadas dos geradores
await existem('Geradores: anel de progresso e cordões de lâmpadas existem na cena', ['gerador-progresso-0', 'gerador-progresso-5', 'gerador-lampadas']);
{
  const r = await G(() => {
    const gv = window.__game.tr.gens, cam = window.__game.camera.position;
    const fake = (i, over) => Array.from({ length: 6 }, (_, k) => ({ on: false, progress: 0, capturing: false, attacked: false, ...(k === i ? over : {}) }));
    const ring = () => { let m = null; window.__game.scene.traverse((o) => { if (o.name === 'gerador-progresso-0') m = o; }); return m.material.uniforms; };
    const out = {};
    gv.update(fake(0, { capturing: true, progress: 0.5 }), 0.016, 1, cam);
    out.meio = { p: ring().uP.value, voltando: ring().uBack.value, visivel: ring() && true };
    gv.update(fake(0, { capturing: true, progress: 0.8 }), 0.016, 1.1, cam);
    out.subindo = ring().uBack.value;
    // sem ninguém no círculo o progresso volta: o anel fica vermelho
    gv.update(fake(0, { capturing: false, progress: 0.7 }), 0.016, 1.2, cam);
    out.volta = ring().uBack.value;
    // lâmpadas: apagadas, depois acendem em sequência ao longo de 1,5 s
    gv.update(fake(0, {}), 0.016, 2, cam);
    out.apagadas = gv.lampsLit(0);
    out.total = gv.lampsTotal(0);
    const ligado = fake(0, { on: true });
    gv.update(ligado, 0.016, 3, cam);
    for (let i = 0; i < 5; i++) gv.update(ligado, 0.1, 3.1 + i * 0.1, cam); // 0,5 s
    out.aos05 = gv.lampsLit(0);
    for (let i = 0; i < 15; i++) gv.update(ligado, 0.1, 4 + i * 0.1, cam); // 2 s no total
    out.aos2 = gv.lampsLit(0);
    return out;
  });
  check('Anel de progresso: com progress = 0,5 o anel está em 50%', Math.abs(r.meio.p - 0.5) < 0.02, `${r.meio.p}`);
  check('Anel de progresso: sobe em ciano e fica vermelho quando o progresso volta', r.subindo < 0.5 && r.volta > 0.5, `subindo ${r.subindo}, voltando ${r.volta}`);
  check('Lâmpadas: apagadas com o gerador desligado', r.apagadas === 0 && r.total >= 12, `${r.apagadas} de ${r.total}`);
  check('Lâmpadas: acendem em sequência (parte aos 0,5 s, todas depois de 2 s)', r.aos05 > 0 && r.aos05 < r.total && r.aos2 === r.total, `${r.aos05} aos 0,5 s, ${r.aos2} aos 2 s de ${r.total}`);
  // devolve o estado real
  await G(() => window.__game.debugTr('gens'));
}
await view(gx + 7, gz + 3, Math.PI / 2 + 0.5, 0.25, 2500);
await shot('b9-lampadas');

// B7: Blindado com cara de armadura a vapor
{
  await G(() => { const s = window.__game.transport.sim; s.zombies.clear(); s.tr.robot = null; s.state = 'intermission'; s.stateTimer = 1e9; window.__game.debugTr('blindado'); });
  await page.waitForTimeout(4500);
  await existem('Blindado: visor, mochila, lança-chamas, garra e as 3 placas existem na cena', ['blindado-visor', 'blindado-mochila', 'blindado-lancachamas', 'blindado-garra', 'blindado-placa-75', 'blindado-placa-50', 'blindado-placa-25']);
  const vis = (n) => G((n) => { let r = null; window.__game.scene.traverse((o) => { if (o.name === n) r = o; }); if (!r) return null; let v = true; for (let o = r; o; o = o.parent) if (!o.visible) v = false; return v; }, n);
  check('Blindado: o visor está inteiro e visível antes do golpe', (await vis('blindado-visor')) === true);
  // olha o Blindado de perto, a partir do primeiro ângulo (a partir de `ang`) com linha de visão livre
  const olhar = (ang, dist) => G(([ang, dist]) => {
    const s = window.__game.transport.sim, z = [...s.zombies.values()].find((q) => q.kind === 7);
    z.speed = 0; z.panzer.flameCD = 99; z.panzer.clawCD = 99;
    for (let k = 0; k < 16; k++) {
      const a = ang + (k * Math.PI) / 8;
      const px = z.x + Math.cos(a) * dist, pz = z.z + Math.sin(a) * dist;
      if (!s.world.lineOfSight(px, 1.5, pz, z.x, 1.8, z.z) || !s.world.lineOfSight(px, 0.5, pz, px + 0.01, 1.7, pz)) continue;
      window.__game.debugView(px, pz, Math.atan2(-(z.x - px), -(z.z - pz)), 0.1);
      return;
    }
  }, [ang, dist]);
  await olhar(3.1, 6);
  await page.waitForTimeout(1200);
  await shot('b7-blindado');
  const antes = await G(() => { let n = 0; window.__game.scene.traverse((o) => { if (o.name === 'blindado-cacos') n++; }); return n; });
  // quebra o visor: 21% da vida em tiros na cabeça (o mesmo caminho das regras)
  await G(() => {
    const s = window.__game.transport.sim, p = s.players.get('local');
    const z = [...s.zombies.values()].find((q) => q.kind === 7);
    z.speed = 0; z.panzer.flameCD = 99; z.panzer.clawCD = 99;
    s.damageZombie(z, z.panzer.maxHp * 0.21, p, 'head', false);
  });
  await page.waitForTimeout(700);
  const depois = await G(() => { let n = 0; window.__game.scene.traverse((o) => { if (o.name === 'blindado-cacos') n++; }); return n; });
  check('Blindado: depois do evento visor, o visor some e aparecem cacos', (await vis('blindado-visor')) === false && depois > antes, `cacos ${antes} → ${depois}`);
  // as placas caem aos 75%, 50% e 25% da vida (só visual)
  const placas = [];
  for (const [pct, nome] of [[0.7, 'blindado-placa-75'], [0.45, 'blindado-placa-50'], [0.2, 'blindado-placa-25']]) {
    const antesP = await vis(nome);
    await G((pct) => {
      const s = window.__game.transport.sim, z = [...s.zombies.values()].find((q) => q.kind === 7);
      z.hp = z.panzer.maxHp * pct;
    }, pct);
    await page.waitForTimeout(700);
    placas.push([nome, antesP, await vis(nome)]);
  }
  check('Blindado: as placas caem uma a uma aos 75%, 50% e 25% da vida', placas.every(([, a, b]) => a === true && b === false), JSON.stringify(placas));
  await olhar(3.1, 6);
  await page.waitForTimeout(1200);
  await shot('b7-blindado-sem-placas');
  await G(() => { const s = window.__game.transport.sim; s.zombies.clear(); });
  await page.waitForTimeout(500);
}

// B4: interior da Igreja
await existem('Igreja: bancos, vitrais, vigas, escombros e o sino caído existem na cena', ['igreja-bancos', 'igreja-vitral', 'igreja-vigas', 'igreja-escombros', 'igreja-sino', 'igreja-raios']);
{
  await view(-81.3, -8, Math.PI, 0.12, 2500);
  await shot('b4-igreja');
  await view(-81.3, 9, Math.PI, 0.2, 2500);
  await shot('b4-igreja-altar');
  await view(-84, 2, Math.PI, 0.45, 2500);
  await shot('b4-igreja-teto');
}

// B5: texturas novas
{
  const r = await G(() => { const t = window.__game.o.tex; return ['rotWood', 'crackConcrete', 'rivet'].map((n) => [n, !!t[n] && !!t[n].image]); });
  check('B5: madeira podre, concreto rachado e aço rebitado existem no conjunto de texturas', r.every(([, ok]) => ok), JSON.stringify(r));
}
await view(46, 16, 0, 0.05, 2200);
await shot('b5-oficina');
await view(68, -9, 0, 0.05, 2200);
await shot('b5-casamata');

// B3: lama molhada
await existem('Lama: poças, crateras com água e tábuas jogadas existem na cena', ['lama-pocas', 'lama-crateras', 'lama-tabuas', 'lama-respingos']);
{
  const r = await G(() => {
    const w = window.__game.tr.weather, cam = window.__game.camera.position;
    const splash = () => { let o = null; window.__game.scene.traverse((x) => { if (x.name === 'lama-respingos') o = x; }); return o; };
    w.setWeather('limpo');
    for (let i = 0; i < 400; i++) w.update(0.1, 5000 + i * 0.1, cam);
    const seco = splash().visible;
    w.setWeather('chuva');
    for (let i = 0; i < 400; i++) w.update(0.1, 5100 + i * 0.1, cam);
    const chuva = splash().visible;
    w.setWeather('limpo');
    for (let i = 0; i < 900; i++) w.update(0.1, 5200 + i * 0.1, cam);
    return { seco, chuva, depois: splash().visible };
  });
  check('Lama: os respingos só aparecem na chuva', r.seco === false && r.chuva === true && r.depois === false, JSON.stringify(r));
  // as poças refletem o céu: de longe (ângulo raso) o tom puxa para o horizonte, de cima puxa para o alto
  await view(30, 27, Math.PI / 2, -0.35, 2200);
  await shot('b3-lama-poca');
  await view(30, 27, Math.PI / 2, 0.02, 2200);
  await shot('b3-lama-sul');
}

// B6: colossos sempre visíveis ao longe
{
  await G(() => { const s = window.__game.transport.sim; s.zombies.clear(); s.tr.robot = null; s.tr.robotPause = 9999; s.state = 'intermission'; s.stateTimer = 1e9; });
  await page.waitForTimeout(1500);
  const far = () => G(() => window.__game.tr.colossus.farInfo());
  const f0 = await far();
  const vis = f0.filter((x) => x.visible);
  check('Colossos ao longe: sem colosso em cena, 2 silhuetas visíveis a mais de 150 m do centro', vis.length === 2 && vis.every((x) => x.dist > 150), JSON.stringify(f0));
  await existem('Colossos ao longe: as silhuetas existem na cena', ['colosso-silhueta-atlas', 'colosso-silhueta-golias', 'colosso-silhueta-tita']);
  const draws = await G(() => window.__game.tr.colossus.farDrawCalls());
  check('Colossos ao longe: no máximo 4 chamadas de desenho por silhueta', draws <= 4, `${draws}`);
  // as silhuetas andam: a posição muda com o tempo
  const p0 = await G(() => window.__game.tr.colossus.farInfo().filter((x) => x.visible).map((x) => [x.x, x.z]));
  await G(() => { const t = window.__game.tr; for (let i = 0; i < 100; i++) t.colossus.update(window.__game.buffer.latest.s.tr, 0.1, 100 + i * 0.1); });
  const p1 = await G(() => window.__game.tr.colossus.farInfo().filter((x) => x.visible).map((x) => [x.x, x.z]));
  check('Colossos ao longe: as silhuetas caminham (posição muda em 10 s)', p0.some((a, i) => Math.hypot(a[0] - p1[i][0], a[1] - p1[i][1]) > 5), JSON.stringify([p0[0], p1[0]]));
  // passagem: o colosso que entra sai do laço e vira o modelo completo
  const proximo = f0.find((x) => !x.visible)?.id ?? 'atlas';
  await G((id) => window.__game.debugTr('colosso', id), proximo);
  await page.waitForTimeout(4000);
  const aviso = await far();
  check('Colossos ao longe: no aviso a silhueta do próximo anda para a borda do mapa', aviso.find((x) => x.id === proximo)?.visible === true, JSON.stringify(aviso.find((x) => x.id === proximo)));
  await page.waitForTimeout(7500);
  const passando = await G(() => ({ fase: window.__game.transport.sim.tr.robot?.phase, info: window.__game.tr.colossus.farInfo(), cheio: window.__game.tr.colossus.fullVisible() }));
  const meu = passando.info.find((x) => x.id === proximo);
  check('Colossos ao longe: na passagem a silhueta do colosso em cena some e o modelo completo aparece', passando.fase === 'passos' && meu.visible === false && passando.cheio === proximo, JSON.stringify(passando));
  await G(() => { const s = window.__game.transport.sim; s.tr.robot = null; s.tr.robotPause = 9999; });
  // mira a câmera (no Posto) na primeira silhueta visível para a captura
  await G(() => { const f = window.__game.tr.colossus.farInfo().find((x) => x.visible); const px = 103, pz = 50; window.__game.debugView(px, pz, Math.atan2(-(f.x - px), -(f.z - pz)), 0.09); });
  await page.waitForTimeout(1800);
  await shot('b6-colossos-ao-longe');
}

// B8: Câmara Antiga detalhada
await existem('Câmara: pedras com borda, portais de volta, colunas de luz, runas e pilares quebrados existem na cena',
  ['camara-pedras', 'camara-pedras-borda', 'camara-portal-fogo', 'camara-portal-gelo', 'camara-portal-vento', 'camara-portal-raio', 'camara-luz', 'camara-runas', 'camara-pilares']);
{
  // as pedras brilham na cor da alcova mais perto: com uma pedra perto da alcova do Fogo a borda dela é laranja
  await view(165, 6, Math.PI / 2, 0.35, 2000);
  const r = await G(() => window.__game.tr.camara.stoneRimColors());
  check('Câmara: a borda de cada pedra tem a cor de uma das 4 alcovas', r.length >= 12 && r.every((c) => ['ff7a2a', '6ab8ff', 'ffe14a', 'b06aff'].includes(c)), JSON.stringify(r.slice(0, 4)));
  await view(165, 6, Math.PI / 2, 0.35, 2600);
  await G(() => window.__game.debugTr('portais'));
  await view(165, 6, Math.PI / 2, 0.35, 2600);
  await shot('b8-camara');
  await view(165, -2, 0, 0.3, 2200);
  await shot('b8-camara-raio');
}

// ---------------------------------------------------------------------------
// F3: orçamento de desempenho (chamadas de desenho e triângulos por quadro, nos 6 pontos da tour)
// ---------------------------------------------------------------------------
const ORC = new URL('../docs/trincheira/orcamento.json', import.meta.url);
const PONTOS = [
  ['Posto (103, 50)', 103, 50, 0, 0.05],
  ['Lama sul (30, 27)', 30, 27, Math.PI / 2, 0.02],
  ['Escavação (-15, -22)', -15, -22, Math.PI, 0.12],
  ['Igreja (-84, 18)', -84, 18, 0, 0.1],
  ['Quartel (2, -64)', 2, -64, Math.PI / 2, 0.05],
  ['Câmara (165, 6)', 165, 6, Math.PI / 2, 0.05],
];
const medir = async () => {
  // média de 10 quadros (as partículas e o relâmpago variam um pouco de quadro em quadro)
  const v = await G(() => new Promise((res) => {
    const a = [];
    const f = () => { a.push({ ...window.__game.perf }); a.length < 10 ? requestAnimationFrame(f) : res(a); };
    requestAnimationFrame(f);
  }));
  return { calls: Math.round(mean(v.map((x) => x.calls))), tris: Math.round(mean(v.map((x) => x.tris))) };
};
{
  const medidas = {};
  for (const [nome, x, z, yaw, pitch] of PONTOS) {
    await view(x, z, yaw, pitch, 2200);
    medidas[nome] = await medir();
    console.log(`     ${nome}: ${medidas[nome].calls} chamadas · ${medidas[nome].tris} triângulos`);
  }
  if (GRAVAR) {
    writeFileSync(ORC, JSON.stringify({ gravadoEm: new Date().toISOString().slice(0, 10), margem: 0.1, pontos: medidas }, null, 2) + '\n');
    console.log('     linha de base gravada em docs/trincheira/orcamento.json');
  }
  const base = existsSync(ORC) ? JSON.parse(readFileSync(ORC, 'utf8')) : null;
  if (!base) check('chamadas de desenho dentro do orçamento nos 6 pontos', false, 'sem linha de base: rode com --gravar');
  else {
    const fora = [];
    for (const [nome] of PONTOS) {
      const b = base.pontos[nome], m = medidas[nome];
      if (!b) { fora.push(`${nome}: sem base`); continue; }
      if (m.calls > b.calls * (1 + base.margem)) fora.push(`${nome}: ${m.calls} chamadas > ${Math.round(b.calls * (1 + base.margem))}`);
      if (m.tris > b.tris * (1 + base.margem)) fora.push(`${nome}: ${m.tris} triângulos > ${Math.round(b.tris * (1 + base.margem))}`);
    }
    check('chamadas de desenho e triângulos dentro do orçamento nos 6 pontos (base + 10%)', fora.length === 0, fora.join(' | '));
  }
}

check('sem erros no navegador', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${ok} ok, ${bad} falharam`);
await browser.close();
process.exit(bad ? 1 : 0);
