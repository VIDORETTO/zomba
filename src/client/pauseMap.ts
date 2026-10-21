import type { MapDef } from '../shared/map/types';
import type { Snapshot } from '../shared/protocol';
import { ELEMENTS } from '../shared/trincheira-info';

// Planta da Trincheira no menu de pausa, desenhada com os dados do próprio mapa (grade de áreas, geradores, Fonte, Caixa, tanque,
// portais, quem joga e os aliados). Áreas abertas em cor, fechadas em cinza.

const S = 2;
const COLORS: Record<string, string> = {
  p: '#c9a24a', c: '#8ea0b0', e: '#7fae8e', o: '#c0805e', v: '#7f90b0', q: '#a888b8', i: '#c4b08a', l: '#6e5c48', m: '#5a4a78',
};
const CLOSED = '#3d3a37';

export interface PlantaInfo {
  snap: Snapshot;
  eu: { x: number; z: number; yaw: number } | null;
  aliados: { x: number; z: number; name: string }[];
}

export function plantaSize(map: MapDef) {
  const b = map.bounds;
  return { w: Math.round((b.maxX - b.minX) * S), h: Math.round((b.maxZ - b.minZ) * S) };
}

// letras de área abertas (porta aberta, ou sempre aberta)
function abertas(map: MapDef, doors: string[]): Set<string> {
  const T = map.trincheira!;
  const open = new Set(doors);
  const out = new Set<string>();
  for (const [letra, d] of Object.entries(T.groupDoor)) {
    if (d === null || (Array.isArray(d) ? d.some((x) => open.has(x)) : open.has(d))) out.add(letra);
  }
  return out;
}

// desenha a planta no canvas; devolve os pontos dos ícones (para os testes)
export function drawPlanta(canvas: HTMLCanvasElement, map: MapDef, info: PlantaInfo) {
  const T = map.trincheira;
  const ctx = canvas.getContext('2d');
  if (!T || !ctx) return;
  const b = map.bounds;
  const px = (x: number) => (x - b.minX) * S;
  const pz = (z: number) => (z - b.minZ) * S;
  const tr = info.snap.tr;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#14110f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // áreas: uma célula de 1 m por quadradinho de 2 px
  const open = abertas(map, info.snap.doors);
  const g = T.groups;
  for (let cz = 0; cz < g.h; cz++) {
    for (let cx = 0; cx < g.w; cx++) {
      const ch = g.data[cz * g.w + cx];
      if (ch === '.' || !ch) continue;
      ctx.fillStyle = open.has(ch) ? COLORS[ch] ?? '#888' : CLOSED;
      ctx.fillRect(px(g.ox + cx), pz(g.oz + cz), S, S);
    }
  }
  // Escavação (anel e poço)
  ctx.strokeStyle = 'rgba(160,220,255,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(px(T.ring.c[0]), pz(T.ring.c[1]), T.ring.r * S, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(px(T.ring.c[0]), pz(T.ring.c[1]), T.ring.hole * S, 0, Math.PI * 2);
  ctx.fill();
  // Câmara Antiga (fora da grade): salão e as 4 alcovas
  const [cx, cz] = T.chamber.center;
  ctx.fillStyle = tr && tr.portals.some(Boolean) ? '#5a4a78' : CLOSED;
  ctx.beginPath();
  ctx.arc(px(cx), pz(cz), T.chamber.hall * S, 0, Math.PI * 2);
  ctx.fill();
  for (const a of T.chamber.alcoves) {
    ctx.fillStyle = ELEMENTS[a.el].color;
    ctx.beginPath();
    ctx.arc(px(a.c[0]), pz(a.c[1]), 3.5 * S, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#d8d0e8';
  ctx.font = '12px sans-serif';
  ctx.fillText('Câmara Antiga', px(cx) - 38, pz(cz) + 4);
  // portais abertos: anel da cor do elemento na boca do túnel
  if (tr) {
    T.portals.forEach((p, i) => {
      const el = (['fogo', 'gelo', 'vento', 'raio'] as const)[i];
      const aberto = !!tr.portals[i];
      ctx.strokeStyle = aberto ? ELEMENTS[p.el].color : '#555';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px(p.mouth[0]), pz(p.mouth[1]), 5, 0, Math.PI * 2);
      ctx.stroke();
      void el;
    });
  }
  // rota do tanque e o tanque
  if (tr) {
    ctx.fillStyle = '#d8c89a';
    ctx.fillRect(px(tr.tank.x) - 4, pz(tr.tank.z) - 3, 8, 6);
  }
  // Caixa e Fonte
  const box = map.boxSpots[info.snap.box.loc];
  if (box) {
    ctx.fillStyle = '#e8c070';
    ctx.fillRect(px(box.x) - 4, pz(box.z) - 4, 8, 8);
  }
  const fonte = tr ? map.fizzSpots?.[tr.fizz.loc] : undefined;
  if (fonte) {
    ctx.fillStyle = '#ffe9b0';
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 3 : 6.5, a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(px(fonte.x) + Math.cos(a) * r, pz(fonte.z) + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
  // geradores: cinza (desligado), ciano (ligado) ou vermelho (atacado), com o número
  const pontos: [number, number][] = [];
  T.gens.forEach((gen, i) => {
    const s = tr?.gens[i];
    const x = px(gen.x), y = pz(gen.z);
    pontos.push([Math.round(x), Math.round(y)]);
    ctx.fillStyle = s?.attacked ? '#ff4a3a' : s?.on ? '#5fe6ff' : s?.capturing ? '#ffd890' : '#8a8680';
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText(String(i + 1), x - 3, y + 3.5);
  });
  // aliados e você (seta)
  for (const a of info.aliados) {
    ctx.fillStyle = '#7ae08a';
    ctx.beginPath();
    ctx.arc(px(a.x), pz(a.z), 4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (info.eu) {
    const x = px(info.eu.x), y = pz(info.eu.z);
    // frente = (-sen yaw, -cos yaw) na planta (norte para cima)
    const dx = -Math.sin(info.eu.yaw), dz = -Math.cos(info.eu.yaw);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + dx * 9, y + dz * 9);
    ctx.lineTo(x - dz * 5 - dx * 5, y + dx * 5 - dz * 5);
    ctx.lineTo(x + dz * 5 - dx * 5, y - dx * 5 - dz * 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    canvas.dataset.eu = '1';
  } else delete canvas.dataset.eu;
  if (fonte) canvas.dataset.fonte = '1';
  canvas.dataset.gens = JSON.stringify(pontos);
}
