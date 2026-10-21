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
