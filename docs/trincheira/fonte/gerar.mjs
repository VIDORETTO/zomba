// Uso: node gerar.mjs <pasta de saída> [planta-de-referencia.jpg]
// Gera: planta.svg (desenho próprio em metros), layout.json (metros) e, com a imagem, overlay.html (traçado sobre a planta original, para conferir)
import { readFileSync, writeFileSync } from 'node:fs';
import { AREAS, FEET, MUD, RING, TANK_N, TANK_PATH, POINTS, DOORS, ENTRIES, SCALE, ORIGIN } from './layout-src.mjs';

const [outDir, planJpg] = process.argv.slice(2);
const m = ([px, py]) => [+(((px - ORIGIN[0]) * SCALE).toFixed(1)), +(((py - ORIGIN[1]) * SCALE).toFixed(1))];
const mr = (r) => [...m([r[0], r[1]]), ...m([r[2], r[3]])];

const COL = { chao: '#8d8a80', pe: '#5a3d2e', tanque: '#7a3aa0', lama: '#3b3530' };

// ---------- layout.json (metros) ----------
const conv = (v) => (Array.isArray(v) && typeof v[0] === 'number' ? m(v) : Array.isArray(v) ? v.map(conv) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, conv(x)])));
const layout = {
  _leia: 'Coordenadas em metros. x = leste(+)/oeste(-); z = sul(+)/norte(-), como na planta (norte para cima). Não edite à mão: gerado por docs/trincheira/fonte/gerar.mjs a partir de fonte/layout-src.mjs.',
  areas: AREAS.map((a) => ({ id: a.id, name: a.name, area: a.area, kind: a.kind, poly: a.poly.map(m), ...(a.pillar ? { pillar: mr([...a.pillar[0], ...a.pillar[1]]) } : {}) })),
  feet: FEET.map((f) => ({ ...f, r: mr(f.r) })),
  mud: MUD.map((x) => ({ id: x.id, width: +(x.w * SCALE).toFixed(1), path: x.path.map(m) })),
  ring: { c: m(RING.c), r: +(RING.r * SCALE).toFixed(1), hole: +(RING.hole * SCALE).toFixed(1) },
  tankNorth: { poly: TANK_N.poly.map(m) },
  tankPath: TANK_PATH.map(([x, y, s]) => (s ? [...m([x, y]), s] : m([x, y]))),
  doors: DOORS.map((d) => ({ ...d, gates: d.gates.map((x) => ({ at: m(x.at), n: x.n, w: +(x.w * SCALE).toFixed(1) })) })),
  entries: ENTRIES.map((e) => ({ area: e.area, at: m(e.at), n: e.n })),
  points: conv(POINTS),
};
const json = JSON.stringify(layout, null, 1)
  .replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, '[$1, $2]')
  .replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, '[$1, $2, $3, $4]')
  .replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+),\s+("[a-z]+")\s+\]/g, '[$1, $2, $3]');
writeFileSync(`${outDir}/layout.json`, json);
// cópia em TypeScript que o jogo importa (src/shared/map/trincheira-layout.ts)
const tsOut = new URL('../../../src/shared/map/trincheira-layout.ts', import.meta.url);
writeFileSync(tsOut, `// Gerado por docs/trincheira/fonte/gerar.mjs a partir de fonte/layout-src.mjs. Não edite à mão.
import type { TrincheiraLayout } from './trincheira-types';

export const LAYOUT: TrincheiraLayout = ${json};
`);

// ---------- desenho comum (recebe função de projeção) ----------
function draw(P, k, labels) {
  const pts = (poly) => poly.map((p) => P(p).join(',')).join(' ');
  const out = [];
  for (const r of MUD) out.push(`<polyline points="${pts(r.path)}" fill="none" stroke="${COL.lama}" stroke-width="${r.w * k}" stroke-linejoin="round" stroke-linecap="round"/>`);
  for (const a of AREAS) out.push(`<polygon points="${pts(a.poly)}" fill="${COL[a.kind]}" stroke="#ddd" stroke-width="${1.2 * k}"/>`);
  const [cx, cy] = P(RING.c);
  out.push(`<circle cx="${cx}" cy="${cy}" r="${RING.r * k}" fill="${COL.chao}" stroke="#ddd" stroke-width="${1.2 * k}"/>`);
  out.push(`<circle cx="${cx}" cy="${cy}" r="${RING.hole * k}" fill="#111"/>`);
  out.push(`<polygon points="${pts(TANK_N.poly)}" fill="${COL.tanque}"/>`);
  for (const a of AREAS) if (a.pillar) {
    const [x0, y0] = P(a.pillar[0]); const [x1, y1] = P(a.pillar[1]);
    out.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#111"/>`);
  }
  for (const f of FEET) {
    const [x0, y0] = P([f.r[0], f.r[1]]); const [x1, y1] = P([f.r[2], f.r[3]]);
    out.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${COL.pe}" stroke="#ddd" stroke-width="${1.2 * k}"/>`);
    if (labels) out.push(`<text x="${(x0 + x1) / 2}" y="${(y0 + y1) / 2}" font-size="${16 * k}" fill="#e8c9a8" text-anchor="middle" dominant-baseline="middle">${f.id}</text>`);
  }
  out.push(`<polyline points="${pts(TANK_PATH.map(([x, y]) => [x, y]))}" fill="none" stroke="#c070ff" stroke-width="${2 * k}" stroke-dasharray="${8 * k} ${6 * k}"/>`);
  const dot = (p, c, r = 7, t = '') => {
    const [x, y] = P(p);
    out.push(`<circle cx="${x}" cy="${y}" r="${r * k}" fill="${c}" stroke="#000" stroke-width="${1 * k}"/>`);
    if (t && labels) out.push(`<text x="${x}" y="${y + 0.5 * k}" font-size="${10 * k}" font-weight="700" fill="#000" text-anchor="middle" dominant-baseline="middle">${t}</text>`);
  };
  const Pn = POINTS;
  for (const [g, p] of Object.entries(Pn.gen)) dot(p, '#3fe0ff', 11, g);
  for (const p of Object.values(Pn.box)) dot(p, '#ffd84a', 6, '?');
  for (const p of Object.values(Pn.fizz)) dot(p, '#ffffff', 6, 'W');
  for (const p of Object.values(Pn.perk)) dot(p, '#ff6ad5', 6, 'B');
  for (const p of Pn.disco) dot(p, '#222', 6);
  for (const p of Pn.peca_fogo) dot(p, '#ff4a2a', 6);
  for (const p of Pn.peca_gelo) dot(p, '#3a8bff', 6);
  for (const p of Pn.peca_raio) dot(p, '#b04aff', 6);
  for (const p of Pn.peca_vento) dot(p, '#ffe23a', 6);
  for (const p of Object.values(Pn.portal)) dot(p, '#00ffa0', 9, 'P');
  for (const p of Pn.bau) dot(p, '#999', 7, 'b');
  for (const p of Pn.lapide) dot(p, '#cfe', 6, 'L');
  for (const p of Pn.domo) dot(p, '#ee0', 6, 'D');
  for (const p of Pn.carroca) dot(p, '#f80', 6, 'c');
  for (const p of Pn.monte) dot(p, '#e22', 4);
  for (const p of [...Pn.escudo_rodas, ...Pn.escudo_trava, ...Pn.escudo_armacao]) dot(p, '#9ab', 5, 'e');
  for (const p of [Pn.drone_cerebro, Pn.drone_helice, ...Pn.drone_corpo]) dot(p, '#5f5', 5, 'd');
  for (const p of Pn.pa) dot(p, '#c96', 5, 'p');
  for (const p of Pn.bancada) dot(p, '#fa5', 6, 'T');
  for (const p of Pn.desafio) dot(p, '#f90', 7, '!');
  // portões (laranja, com preço do lado de quem compra) e barricadas (tracejado bege)
  const bar = (at, n, hw, color, width, dash = '') => {
    const [x, y] = P(at);
    const v = n[0] !== 0;
    out.push(`<line x1="${v ? x : x - hw}" y1="${v ? y - hw : y}" x2="${v ? x : x + hw}" y2="${v ? y + hw : y}" stroke="${color}" stroke-width="${width}" ${dash}/>`);
  };
  for (const d of DOORS) for (const g of d.gates) {
    bar(g.at, g.n, (g.w / 2) * k, '#ffb000', 4 * k);
    const [x, y] = P(g.at);
    if (labels) out.push(`<text x="${x + g.n[0] * 16 * k}" y="${y + g.n[1] * 16 * k}" font-size="${10 * k}" font-weight="700" fill="#ffb000" text-anchor="middle" dominant-baseline="middle" stroke="#000" stroke-width="${2 * k}" paint-order="stroke">${d.cost}</text>`);
  }
  for (const e of ENTRIES) bar(e.at, e.n, 6 * k, '#e8c9a8', 3 * k, `stroke-dasharray="${2 * k} ${1.5 * k}"`);
  dot(Pn.tabua, '#bbb', 6, 't'); dot(Pn.altar_igreja, '#bbb', 6, 'A'); dot(Pn.gramofone, '#da5', 6, 'g'); dot(Pn.forja, '#f0f', 6, 'F');
  return out.join('\n');
}

// overlay sobre a planta (em px da planta exibida em 2000x1125), só se a imagem for passada
if (planJpg) {
  const b64 = readFileSync(planJpg).toString('base64');
  const overlay = `<!doctype html><body style="margin:0;background:#000"><svg width="2000" height="1125" viewBox="0 0 2000 1125">
<image href="data:image/jpeg;base64,${b64}" width="2000" height="1125"/>
<g opacity="0.55">${draw((p) => p, 1, true)}</g></svg></body>`;
  writeFileSync(`${outDir}/overlay.html`, overlay);
}

// planta própria em metros (1 m = 5 px), com grade de 10 m e legenda
const S = 5;
const minX = -128, maxX = 128, minZ = -84, maxZ = 84;
const W = (maxX - minX) * S, H = (maxZ - minZ) * S;
const PM = (p) => { const [x, z] = m(p); return [+((x - minX) * S).toFixed(1), +((z - minZ) * S).toFixed(1)]; };
const grid = [];
for (let x = Math.ceil(minX / 10) * 10; x <= maxX; x += 10) {
  const gx = (x - minX) * S;
  grid.push(`<line x1="${gx}" y1="0" x2="${gx}" y2="${H}" stroke="${x === 0 ? '#555' : '#2a2a2a'}" stroke-width="1"/>`);
  if (x % 20 === 0) grid.push(`<text x="${gx + 2}" y="12" font-size="10" fill="#666">x ${x}</text>`);
}
for (let z = Math.ceil(minZ / 10) * 10; z <= maxZ; z += 10) {
  const gz = (z - minZ) * S;
  grid.push(`<line x1="0" y1="${gz}" x2="${W}" y2="${gz}" stroke="${z === 0 ? '#555' : '#2a2a2a'}" stroke-width="1"/>`);
  if (z % 20 === 0) grid.push(`<text x="2" y="${gz - 2}" font-size="10" fill="#666">z ${z}</text>`);
}
const names = [
  ['Posto de Comando', [1690, 800]], ['Casamata', [1430, 420]], ['Oficina', [1270, 700]], ['Estação', [1400, 965]],
  ['Escavação', [900, 600]], ['Vala Sul', [930, 1040]], ['Quartel Norte', [960, 30]], ['Igreja', [440, 770]], ['Posto Oeste', [250, 610]],
  ['Terra de Ninguém', [1250, 225]], ['Terra de Ninguém', [700, 890]], ['Cripta', [1580, 400]],
];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + 70}" viewBox="0 0 ${W} ${H + 70}" font-family="sans-serif">
<rect width="${W}" height="${H + 70}" fill="#141414"/>
${grid.join('\n')}
${draw(PM, S * SCALE, true)}
${names.map(([t, p]) => { const [x, y] = PM(p); return `<text x="${x}" y="${y}" font-size="15" font-weight="700" fill="#f2efe6" text-anchor="middle" stroke="#000" stroke-width="3" paint-order="stroke">${t}</text>`; }).join('\n')}
<g font-size="12" fill="#ddd">
<text x="10" y="${H + 20}">Trincheira — planta de trabalho (metros; norte para cima; grade de 10 m). Laranja: portão (preço) · tracejado bege: barricada · cinza: piso firme · marrom: pegada de colosso · roxo: plataforma do tanque · faixa escura: lama</text>
<text x="10" y="${H + 40}">Tracejado roxo: rota do tanque · G1–G6 geradores · ? Caixa · W Fonte da Sorte · B bebida fixa · P portal · F Forja · g gramofone · discos pretos · peças: vermelho fogo, azul gelo, roxo raio, amarelo vento</text>
<text x="10" y="${H + 60}">b baú de almas · L lápide · D domo · c carroça em chamas · e peça do escudo · d peça do drone · p pá · T bancada · ! baú de desafios · t tábua · A altar · pontinhos vermelhos: montes para cavar</text>
</g></svg>`;
writeFileSync(`${outDir}/planta.svg`, svg);
console.log('ok', W, H);
