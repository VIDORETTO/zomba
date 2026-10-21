import { TRINCHEIRA } from '../constants';
import type { PerkId } from '../perks';
import { DEFAULT_POOL } from '../powerups';
import { ELEMENTS, ELEMENT_LIST } from '../trincheira-info';
import { createBuilder } from './builder';
import { LAYOUT } from './trincheira-layout';
import type { P2 } from './trincheira-types';
import { ids } from '../trincheira-info';
import type { BoxSpot, Element4, Foliage, MapDef, MaterialId, R4, Rect, SpawnPoint, TrincheiraData, Vec3 } from './types';

// "Trincheira": frente de batalha de 1918, com lama, seis áreas de gerador e uma escavação antiga no centro
// (recriação do mapa Origins; planta e regras em docs/trincheira).
//
// O chão andável vem da planta (áreas, faixas de lama, anel da Escavação e pegadas dos colossos) e é
// rasterizado numa grade de 1 m. A colisão são as células vizinhas ao chão (blocos escondidos, alinhados
// aos eixos) e as paredes que se vê seguem o contorno dessa grade, em blocos girados só de enfeite.

const OX = -130;
const OZ = -86;
const GW = 260;
const GH = 172;
const BOUNDS: Rect = { minX: OX, minZ: OZ, maxX: OX + GW, maxZ: OZ + GH };
// limites jogáveis: a Câmara Antiga fica a leste, fora da grade do mapa principal
const LIMITS: Rect = { minX: OX, minZ: OZ, maxX: 200, maxZ: OZ + GH };

// borda de cada lugar: trincheira de tábuas, sacos de areia baixos (lama e Escavação) ou prédio
type Style = 'trench' | 'low' | 'brick' | 'concrete' | 'crypt' | 'house' | 'church';
type Surf = 'd' | 'h' | 'w' | 'm';
interface Zone {
  id: string;
  // porta que libera (posto = início, lama = Terra de Ninguém, entry = vão de barricada)
  group: string;
  style: Style;
  floor: MaterialId;
  tint?: number;
  surf: Surf;
}

const STYLE_OF: Record<string, Style> = {
  posto: 'trench', 'trinch-leste-anel': 'trench', 'trinch-leste-diag': 'trench', 'trinch-leste-sobe': 'trench',
  'casamata-norte': 'trench', estacao: 'trench', vala: 'trench', 'vala-portao-leste': 'trench', 'quartel-desce': 'trench', 'oeste-liga': 'trench',
  casamata: 'concrete', oeste: 'concrete',
  bunker: 'crypt', 'bunker-lajes': 'crypt',
  'oficina-galpao': 'brick', 'oficina-liga': 'brick', oficina: 'brick',
  quartel: 'house',
  igreja: 'church',
};
// chão por borda: material, cor e som dos passos
const FLOOR: Record<Style, [MaterialId, number | undefined, Surf]> = {
  trench: ['floorWood', 0x8a7660, 'w'],
  low: ['dirt', 0x9a8466, 'd'],
  brick: ['pavement', 0x9a948a, 'h'],
  concrete: ['pavement', 0x8e8a82, 'h'],
  crypt: ['stone', 0x7a756c, 'h'],
  house: ['floorWood', 0x9a8064, 'w'],
  church: ['stone', 0x8f897e, 'h'],
};
// altura das paredes de prédio (o telhado fica em cima) e chance de um pedaço do telhado ter caído
const ROOF: Partial<Record<Style, [number, number]>> = {
  brick: [4.6, 0.22], house: [4.2, 0.2], church: [8, 0.3], crypt: [4.2, 0.08], concrete: [3.2, 0.1],
};

// porta que precisa estar aberta para os zumbis surgirem numa área
const SPAWN_AREA: Record<string, string | string[] | null> = {
  posto: null, lama: ['casamata', 'estacao'], casamata: ['casamata', 'estacao'], estacao: ['casamata', 'estacao'], oficina: 'oficina',
  vala: 'vala', quartel: 'quartel', igreja: 'igreja',
};
// a lama é de graça a partir da Casamata ou da Estação; o resto é separado por parede ou portão
const FREE = new Set(['casamata|lama', 'estacao|lama', 'lama|casamata', 'lama|estacao']);
const LETTER: Record<string, string> = { posto: 'p', casamata: 'c', estacao: 'e', oficina: 'o', vala: 'v', quartel: 'q', igreja: 'i', lama: 'l' };
const rank = (g: string) => (g === 'lama' ? 0 : g === 'posto' ? 1 : 2);

function inPoly(x: number, z: number, poly: P2[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function segDist(x: number, z: number, a: P2, b: P2) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}

export function buildTrincheira(): MapDef {
  const L = LAYOUT;
  const P = L.points;
  const B = createBuilder(1918);
  const { rnd, rr, blocks, lights, signs, fires, zombieSpawns, doors, boxSpots, interactables, entries } = B;
  const { box, machine, ammoCrate, wallBuy, boxSpot, zombieEntry, crate, facing } = B;
  const foliage: Foliage[] = [];
  // embaralha sempre igual em qualquer navegador (o servidor e o Firefox montam o mesmo mapa)
  const shuffle = <T>(list: T[]) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  const hash = (a: number, b: number, c: number) => {
    let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  // ---------- grade de 1 m ----------
  const N = GW * GH;
  const DIRS: P2[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const zoneOf = new Int16Array(N).fill(-1);
  const zones: Zone[] = [];
  const idx = (cx: number, cz: number) => cz * GW + cx;
  const cellAt = (x: number, z: number) => {
    const cx = Math.floor(x - OX), cz = Math.floor(z - OZ);
    return cx < 0 || cz < 0 || cx >= GW || cz >= GH ? -1 : idx(cx, cz);
  };
  const addZone = (id: string, group: string, style: Style, floor?: [MaterialId, number | undefined, Surf]) => {
    const [mat, tint, surf] = floor ?? FLOOR[style];
    zones.push({ id, group, style, floor: mat, tint, surf });
    return zones.length - 1;
  };
  // pinta as células cujo centro passa no teste, dentro do retângulo dado
  const fill = (x0: number, z0: number, x1: number, z1: number, zi: number, test: (x: number, z: number) => boolean) => {
    for (let cz = Math.max(0, Math.floor(z0 - OZ)); cz <= Math.min(GH - 1, Math.floor(z1 - OZ)); cz++) {
      for (let cx = Math.max(0, Math.floor(x0 - OX)); cx <= Math.min(GW - 1, Math.floor(x1 - OX)); cx++) {
        if (test(OX + cx + 0.5, OZ + cz + 0.5)) zoneOf[idx(cx, cz)] = zi;
      }
    }
  };
  const bboxOf = (pts: P2[], pad = 0) => {
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
    return [Math.min(...xs) - pad, Math.min(...zs) - pad, Math.max(...xs) + pad, Math.max(...zs) + pad] as const;
  };

  // lama, anel da Escavação e plataforma norte do tanque; depois as áreas e as pegadas por cima
  for (const m of L.mud) {
    const zi = addZone(m.id, 'lama', 'low', ['mud', undefined, 'm']);
    const [x0, z0, x1, z1] = bboxOf(m.path, m.width);
    fill(x0, z0, x1, z1, zi, (x, z) => m.path.some((a, i) => i > 0 && segDist(x, z, m.path[i - 1], a) <= m.width / 2));
  }
  const [rcx, rcz] = L.ring.c;
  const ringZ = addZone('anel', 'lama', 'low', ['stone', 0xa49c8c, 'h']);
  fill(rcx - L.ring.r, rcz - L.ring.r, rcx + L.ring.r, rcz + L.ring.r, ringZ, (x, z) => Math.hypot(x - rcx, z - rcz) <= L.ring.r);
  const areaZone = new Map<string, number>();
  // plataformas do tanque: só se chega de tanque (sem zumbis surgindo nelas)
  const platforms = new Set<number>();
  for (const a of L.areas) {
    const group = a.area === null ? 'posto' : a.area;
    const style = a.kind === 'tanque' ? 'low' : STYLE_OF[a.id] ?? 'low';
    const zi = addZone(a.id, group, style, a.kind === 'tanque' ? ['wood', 0x6e5a48, 'w'] : undefined);
    areaZone.set(a.id, zi);
    if (a.kind === 'tanque') platforms.add(zi);
    const [x0, z0, x1, z1] = bboxOf(a.poly);
    fill(x0, z0, x1, z1, zi, (x, z) => inPoly(x, z, a.poly));
  }
  const tankN = addZone('norte-plat', 'lama', 'low', ['wood', 0x6e5a48, 'w']);
  {
    const [x0, z0, x1, z1] = bboxOf(L.tankNorth.poly);
    fill(x0, z0, x1, z1, tankN, (x, z) => inPoly(x, z, L.tankNorth.poly));
  }
  for (const f of L.feet) {
    const zi = addZone(`pe-${f.id}`, f.area, f.area === 'lama' ? 'low' : 'trench', ['dirt', 0x5e4a38, 'd']);
    const [x0, z0, x1, z1] = f.r;
    fill(x0, z0, x1, z1, zi, () => true);
  }
  // pilar no meio do anel da Trincheira Leste e o poço da Escavação: não se anda
  for (const a of L.areas) if (a.pillar) fill(a.pillar[0], a.pillar[1], a.pillar[2], a.pillar[3], -1, () => true);
  const hole = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const cx = i % GW, cz = (i - cx) / GW;
    if (Math.hypot(OX + cx + 0.5 - rcx, OZ + cz + 0.5 - rcz) <= L.ring.hole + 0.2) {
      hole[i] = 1;
      zoneOf[i] = -1;
    }
  }

  // ---------- paredes entre áreas que só se ligam por portão ----------
  // a parede fica do lado da área mais "cara" (uma célula de espessura); o portão recorta essa parede depois
  const groupOf = (i: number) => (zoneOf[i] < 0 ? '' : zones[zoneOf[i]].group);
  const walk = new Uint8Array(N);
  for (let i = 0; i < N; i++) walk[i] = zoneOf[i] >= 0 ? 1 : 0;
  for (let cz = 1; cz < GH - 1; cz++) {
    for (let cx = 1; cx < GW - 1; cx++) {
      const i = idx(cx, cz);
      if (zoneOf[i] < 0) continue;
      const g = groupOf(i);
      let wall = false;
      for (let dz = -1; dz <= 1 && !wall; dz++) {
        for (let dx = -1; dx <= 1 && !wall; dx++) {
          const h = groupOf(idx(cx + dx, cz + dz));
          if (!h || h === g || FREE.has(`${g}|${h}`)) continue;
          if (rank(g) > rank(h) || (rank(g) === rank(h) && g > h)) wall = true;
        }
      }
      if (wall) walk[i] = 0;
    }
  }

  // ---------- portões: recortam a parede entre as áreas ----------
  // as células de parede da área fechada que encostam no lado de quem compra, dentro da largura do vão,
  // voltam a ser chão; o bloco da porta cobre exatamente esse recorte (some quando a porta abre)
  const gateCut = new Uint8Array(N);
  const gates: { id: string; name: string; cost: number; x0: number; z0: number; x1: number; z1: number; n: P2 }[] = [];
  for (const d of L.doors) {
    for (const g of d.gates) {
      const [nx] = g.n;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      const ha = g.w / 2 + 0.3;
      for (let cz = Math.floor(g.at[1] - 4 - OZ); cz <= Math.floor(g.at[1] + 4 - OZ); cz++) {
        for (let cx = Math.floor(g.at[0] - 4 - OX); cx <= Math.floor(g.at[0] + 4 - OX); cx++) {
          if (cx < 1 || cz < 1 || cx >= GW - 1 || cz >= GH - 1) continue;
          const i = idx(cx, cz);
          const x = OX + cx + 0.5, z = OZ + cz + 0.5;
          const off = nx !== 0 ? Math.abs(z - g.at[1]) : Math.abs(x - g.at[0]);
          if (off > ha || walk[i] || zoneOf[i] < 0 || groupOf(i) !== d.id) continue;
          // encosta (4 vizinhos) num chão de outra área
          const touches = DIRS.some(([dx, dz]) => {
            const j = idx(cx + dx, cz + dz);
            return walk[j] && groupOf(j) !== d.id && groupOf(j) !== 'entry';
          });
          if (!touches) continue;
          gateCut[i] = 1;
          walk[i] = 1;
          x0 = Math.min(x0, OX + cx); z0 = Math.min(z0, OZ + cz);
          x1 = Math.max(x1, OX + cx + 1); z1 = Math.max(z1, OZ + cz + 1);
        }
      }
      if (x0 === Infinity) throw new Error(`portão sem parede para recortar: ${d.id} em ${g.at}`);
      gates.push({ id: d.id, name: d.name, cost: d.cost, x0, z0, x1, z1, n: g.n });
    }
  }

  // ---------- barricadas: vão na parede e um bolsão do lado de fora para os zumbis subirem ----------
  const pocketZ = addZone('bolsao', 'entry', 'trench', ['dirt', 0x5a4838, 'd']);
  const entryGroup = (a: string) => (a === 'oeste' ? 'igreja' : a);
  for (const e of L.entries) {
    const [nx, nz] = e.n;
    const grp = entryGroup(e.area);
    // anda para dentro até achar o chão da área: a borda da grade é onde fica a janela
    let edge = 0;
    for (let t = -2; t <= 5; t += 0.25) {
      const i = cellAt(e.at[0] + nx * t, e.at[1] + nz * t);
      if (i >= 0 && walk[i] && groupOf(i) === grp) {
        const cx = i % GW, cz = (i - cx) / GW;
        edge = nx > 0 ? OX + cx : nx < 0 ? OX + cx + 1 : nz > 0 ? OZ + cz : OZ + cz + 1;
        break;
      }
    }
    const along = Math.round(nx !== 0 ? e.at[1] : e.at[0]);
    const [wx, wz] = nx !== 0 ? [edge, along] : [along, edge];
    for (const s of [-0.5, 0.5]) {
      for (let k = 1; k <= 4; k++) {
        const px = wx - nx * (k - 0.5) + (nx !== 0 ? 0 : s);
        const pz = wz - nz * (k - 0.5) + (nx !== 0 ? s : 0);
        const i = cellAt(px, pz);
        if (i < 0 || walk[i]) continue;
        walk[i] = 1;
        zoneOf[i] = pocketZ;
      }
    }
    zombieEntry(wx, wz, nx, nz, 1.6, e.area === 'posto' ? undefined : grp);
  }

  // ---------- colisão: tudo o que não é chão, até 2 m do chão ----------
  const solid = new Uint8Array(N);
  // dono de cada célula de parede: a área de chão mais perto (decide estilo, chão por baixo e telhado)
  const owner = new Int16Array(N).fill(-1);
  for (let cz = 0; cz < GH; cz++) {
    for (let cx = 0; cx < GW; cx++) {
      const i = idx(cx, cz);
      if (walk[i]) continue;
      let best = -1, bd = 9;
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = cx + dx, z = cz + dz;
          if (x < 0 || z < 0 || x >= GW || z >= GH) continue;
          const j = idx(x, z);
          const d = dx * dx + dz * dz;
          if (walk[j] && d < bd) {
            bd = d;
            best = zoneOf[j];
          }
        }
      }
      if (best >= 0 || hole[i]) {
        solid[i] = 1;
        owner[i] = best;
      }
    }
  }
  // blocos escondidos de colisão, juntando as células de cada linha; nas bordas baixas o tiro passa
  for (let cz = 0; cz < GH; cz++) {
    let start = -1, low = false;
    for (let cx = 0; cx <= GW; cx++) {
      const i = cx < GW ? idx(cx, cz) : -1;
      const on = i >= 0 && solid[i] === 1;
      const l = on && !hole[i] && owner[i] >= 0 && zones[owner[i]].style === 'low';
      if (start >= 0 && (!on || l !== low)) {
        box(OX + start, 0, OZ + cz, OX + cx, 3, OZ + cz + 1, 'concrete', true, { hidden: true, bulletThrough: low });
        start = -1;
      }
      if (on && start < 0) {
        start = cx;
        low = l;
      }
    }
  }

  // ---------- paredes visíveis: contorno entre chão e parede ----------
  // cada aresta de célula entre chão e parede vira um traço com a parede à esquerda; os traços viram
  // linhas, que são simplificadas e desenhadas no estilo da área do lado do chão
  type Edge = { a: P2; b: P2; style: Style; used: boolean };
  const out = new Map<number, Edge[]>();
  const vkey = (p: P2) => p[1] * (GW + 1) + p[0];
  for (let cz = 0; cz < GH; cz++) {
    for (let cx = 0; cx < GW; cx++) {
      const i = idx(cx, cz);
      if (!walk[i]) continue;
      for (const [dx, dz] of DIRS) {
        const x = cx + dx, z = cz + dz;
        // o poço da Escavação tem borda própria
        if (x < 0 || z < 0 || x >= GW || z >= GH || !solid[idx(x, z)] || hole[idx(x, z)]) continue;
        const mx = cx + 0.5 + dx * 0.5, mz = cz + 0.5 + dz * 0.5;
        const ddx = -dz, ddz = dx;
        const e: Edge = { a: [mx - ddx * 0.5, mz - ddz * 0.5], b: [mx + ddx * 0.5, mz + ddz * 0.5], style: zones[zoneOf[i]].style, used: false };
        const k = vkey(e.a);
        let list = out.get(k);
        if (!list) out.set(k, (list = []));
        list.push(e);
      }
    }
  }
  const runs: { pts: P2[]; style: Style }[] = [];
  for (const list of out.values()) {
    for (const e0 of list) {
      if (e0.used) continue;
      const chain: Edge[] = [];
      let e: Edge | undefined = e0;
      while (e && !e.used) {
        e.used = true;
        chain.push(e);
        const next: Edge[] = out.get(vkey(e.b)) ?? [];
        e = next.find((x) => !x.used);
      }
      // começa num ponto onde o estilo muda (se mudar), para cada trecho ter um estilo só
      const closed = chain.length > 2 && vkey(chain[chain.length - 1].b) === vkey(chain[0].a);
      let rot = 0;
      if (closed) {
        const k = chain.findIndex((x, j) => x.style !== chain[(j + chain.length - 1) % chain.length].style);
        rot = Math.max(0, k);
      }
      const ordered = closed ? [...chain.slice(rot), ...chain.slice(0, rot)] : chain;
      let cur: { pts: P2[]; style: Style } | null = null;
      for (const x of ordered) {
        if (!cur || cur.style !== x.style) {
          cur = { pts: [x.a], style: x.style };
          runs.push(cur);
        }
        cur.pts.push(x.b);
      }
    }
  }
  // Douglas-Peucker (pontos da grade -> poucos segmentos)
  const simplify = (pts: P2[], tol: number): P2[] => {
    if (pts.length < 3) return pts;
    const a = pts[0], b = pts[pts.length - 1];
    let far = 0, fd = -1;
    const closedRun = a[0] === b[0] && a[1] === b[1];
    for (let i = 1; i < pts.length - 1; i++) {
      const d = closedRun ? Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1]) : segDist(pts[i][0], pts[i][1], a, b);
      if (d > fd) {
        fd = d;
        far = i;
      }
    }
    if (!closedRun && fd <= tol) return [a, b];
    const left = simplify(pts.slice(0, far + 1), tol);
    const right = simplify(pts.slice(far), tol);
    return [...left.slice(0, -1), ...right];
  };

  // bloco girado ao longo de a->b: off0..off1 = distância para dentro da parede, ext = estica nas pontas
  const seg = (a: P2, b: P2, off0: number, off1: number, y0: number, y1: number, mat: MaterialId, tint?: number, ext = 0) => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return;
    const nx = dz / len, nz = -dx / len;
    const o = (off0 + off1) / 2, w = (off1 - off0) / 2;
    const cx = (a[0] + b[0]) / 2 + nx * o, cz = (a[1] + b[1]) / 2 + nz * o;
    const hl = len / 2 + ext;
    box(cx - w, y0, cz - hl, cx + w, y1, cz + hl, mat, false, { rot: [0, Math.atan2(dx, dz), 0], ...(tint !== undefined ? { tint } : {}) });
  };
  const along = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  // estacas e postes a cada "step" metros ao longo do segmento
  const every = (a: P2, b: P2, step: number, fn: (p: P2, q: P2) => void) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.floor(len / step);
    for (let k = 1; k <= n; k++) {
      const t = (k * step - 0.1) / len, u = (k * step + 0.1) / len;
      if (u < 1) fn(along(a, b, t), along(a, b, u));
    }
  };
  function wallPiece(style: Style, a: P2, b: P2) {
    switch (style) {
      case 'trench':
        seg(a, b, 0, 0.22, 0, 2.05, 'woodDark', 0x7a6650, 0.15);
        seg(a, b, -0.05, 0.75, 2.0, 2.45, 'sandbag', 0x9a8a6a, 0.3);
        every(a, b, 2.4, (p, q) => seg(p, q, -0.12, 0.12, 0, 2.6, 'wood', 0x6a5440));
        break;
      case 'low':
        seg(a, b, 0, 0.8, 0, 1.05, 'sandbag', 0x8e7e60, 0.3);
        every(a, b, 3.2, (p, q) => seg(p, q, 1.35, 1.45, 0, 1.35, 'woodDark'));
        seg(a, b, 1.38, 1.42, 0.55, 0.58, 'metal', 0x2a2622);
        seg(a, b, 1.38, 1.42, 1.0, 1.03, 'metal', 0x2a2622);
        break;
      case 'brick':
        seg(a, b, 0, 0.45, 0, 4.6, 'brick', undefined, 0.2);
        seg(a, b, -0.06, 0.55, 4.45, 4.75, 'trim', 0x8a8070, 0.25);
        break;
      case 'concrete':
        seg(a, b, 0, 0.5, 0, 3.2, 'concrete', 0x9a958c, 0.25);
        seg(a, b, -0.1, 0.6, 3.1, 3.4, 'concrete', 0x8a857c, 0.3);
        break;
      case 'crypt':
        seg(a, b, 0, 0.6, 0, 4.2, 'stone', 0x7c766c, 0.3);
        break;
      case 'house':
        seg(a, b, 0, 0.42, 0, 0.6, 'stone', 0x857e72, 0.2);
        seg(a, b, 0, 0.35, 0.6, 4.2, 'plaster', 0xb3a891, 0.2);
        seg(a, b, -0.04, 0.38, 2.9, 3.1, 'woodDark', undefined, 0.2);
        break;
      case 'church':
        seg(a, b, 0, 0.7, 0, 8, 'stone', 0xa29a8a, 0.35);
        seg(a, b, -0.08, 0.8, 7.7, 8.1, 'stone', 0x8a8274, 0.4);
        every(a, b, 4.5, (p, q) => seg(p, along(p, q, 4), 0.7, 1.5, 0, 6, 'stone', 0x958d7e));
        break;
    }
  }
  for (const r of runs) {
    const pts = simplify(r.pts, 0.4).map(([x, z]) => [OX + x, OZ + z] as P2);
    for (let k = 1; k < pts.length; k++) wallPiece(r.style, pts[k - 1], pts[k]);
  }

  // ---------- chão de cada lugar (por baixo das paredes também) e telhados ----------
  box(BOUNDS.minX, -0.5, BOUNDS.minZ, BOUNDS.maxX, 0, BOUNDS.maxZ, 'dirt', false, { tint: 0x4a3c2e });
  const floorZone = (i: number) => (walk[i] ? zoneOf[i] : solid[i] ? owner[i] : -1);
  for (let cz = 0; cz < GH; cz++) {
    let start = -1, key = '';
    for (let cx = 0; cx <= GW; cx++) {
      const zi = cx < GW ? floorZone(idx(cx, cz)) : -1;
      const k = zi >= 0 ? `${zones[zi].floor}:${zones[zi].tint ?? ''}` : '';
      if (start >= 0 && k !== key) {
        const z0 = zones[floorZone(idx(start, cz))];
        const top = z0.floor === 'mud' ? 0.015 : 0.025;
        box(OX + start, -0.06, OZ + cz, OX + cx, top, OZ + cz + 1, z0.floor, false, z0.tint !== undefined ? { tint: z0.tint } : {});
        start = -1;
      }
      if (k && start < 0) {
        start = cx;
        key = k;
      }
    }
  }
  // telhado em placas de 5 x 5 m; algumas caíram (dá para ver o céu)
  const roofOf = (i: number) => {
    const zi = walk[i] ? zoneOf[i] : solid[i] ? owner[i] : -1;
    return zi >= 0 && ROOF[zones[zi].style] ? zi : -1;
  };
  for (let cz = 0; cz < GH; cz++) {
    let start = -1, cur = -1;
    for (let cx = 0; cx <= GW; cx++) {
      let zi = cx < GW ? roofOf(idx(cx, cz)) : -1;
      if (zi >= 0) {
        const [, holeP] = ROOF[zones[zi].style]!;
        if (hash(Math.floor(cx / 5), Math.floor(cz / 5), zi) < holeP) zi = -1;
      }
      if (start >= 0 && zi !== cur) {
        const [y] = ROOF[zones[cur].style]!;
        const mat: MaterialId = zones[cur].style === 'concrete' ? 'concrete' : zones[cur].style === 'crypt' ? 'stone' : 'roof';
        box(OX + start, y, OZ + cz, OX + cx, y + 0.25, OZ + cz + 1, mat, false, { tint: mat === 'roof' ? 0x6a5a4c : 0x7a756c });
        start = -1;
      }
      if (zi >= 0 && start < 0) {
        start = cx;
        cur = zi;
      }
    }
  }

  // ---------- portões comprados ----------
  // o bloco cobre o recorte da parede; a placa e o ponto de compra ficam na face de quem compra
  for (const d of L.doors) doors.push({ id: d.id, name: d.name, cost: d.cost, kind: 'door' });
  for (const g of gates) {
    const [nx, nz] = g.n;
    const cx = (g.x0 + g.x1) / 2, cz = (g.z0 + g.z1) / 2;
    // face de quem compra e meia largura ao longo da parede
    const face = nx > 0 ? g.x1 : nx < 0 ? g.x0 : nz > 0 ? g.z1 : g.z0;
    const fc: P2 = nx !== 0 ? [face, cz] : [cx, face];
    const hw = nx !== 0 ? (g.z1 - g.z0) / 2 : (g.x1 - g.x0) / 2;
    // de que lado se compra: lama/Escavação = entulho de sacos de areia; trincheira = portão de tábuas
    const buyer = cellAt(fc[0] + nx * 1.5, fc[1] + nz * 1.5);
    const lowSide = buyer >= 0 && zoneOf[buyer] >= 0 && zones[zoneOf[buyer]].style === 'low';
    if (lowSide) {
      box(g.x0, 0, g.z0, g.x1, 2.2, g.z1, 'woodDark', true, { door: g.id, tint: 0x6a5444 });
      for (let k = 0; k < 12; k++) {
        const t = rr(-hw + 0.4, hw - 0.4);
        const px = nx !== 0 ? fc[0] + nx * rr(-0.2, 0.4) : cx + t, pz = nx !== 0 ? cz + t : fc[1] + nz * rr(-0.2, 0.4);
        const s = rr(0.7, 1.2);
        box(px - s / 2, rr(0, 1.4), pz - s / 3, px + s / 2, rr(1.6, 2.5), pz + s / 3, k % 3 ? 'sandbag' : 'woodDark', false, {
          rot: [rr(-0.3, 0.3), rr(0, Math.PI), rr(-0.3, 0.3)], door: g.id, tint: 0x8e7e60,
        });
      }
    } else {
      box(g.x0, 0, g.z0, g.x1, 2.6, g.z1, 'woodDark', true, { door: g.id, tint: 0x5e4a38 });
      // travessas na face de quem compra
      for (const y of [0.5, 1.9]) {
        const [bx, bz] = nx !== 0 ? [0.08, hw - 0.2] : [hw - 0.2, 0.08];
        box(fc[0] + nx * 0.08 - bx, y, fc[1] + nz * 0.08 - bz, fc[0] + nx * 0.08 + bx, y + 0.18, fc[1] + nz * 0.08 + bz, 'wood', false, { door: g.id, tint: 0x7a6248 });
      }
    }
    signs.push({
      pos: [fc[0] + nx * 0.2, lowSide ? 1.4 : 2.0, fc[1] + nz * 0.2], w: 2.4, h: 0.5, normal: [nx, nz],
      text: `${g.name.toUpperCase()} · ${g.cost}`, fg: '#f3e6c4', bg: '#2a201a', door: g.id,
    });
    B.doorUse(g.id, fc[0] + nx * 1.1, fc[1] + nz * 1.1);
  }

  // ---------- coisas encostadas na parede ----------
  // a parede mais perto nas 4 direções: ponto na borda e a direção de quem está de frente para ela
  const wallNear = (x: number, z: number, max = 6): { x: number; z: number; nx: number; nz: number } => {
    let best = { x, z, nx: 0, nz: 1 }, bd = Infinity;
    for (const [dx, dz] of DIRS) {
      for (let t = 0; t <= max; t += 0.25) {
        const i = cellAt(x + dx * t, z + dz * t);
        if (i < 0 || walk[i]) continue;
        const cx = i % GW, cz = (i - cx) / GW;
        const ex = dx > 0 ? OX + cx : dx < 0 ? OX + cx + 1 : x;
        const ez = dz > 0 ? OZ + cz : dz < 0 ? OZ + cz + 1 : z;
        const d = Math.hypot(ex - x, ez - z);
        if (d < bd) {
          bd = d;
          best = { x: ex, z: ez, nx: -dx, nz: -dz };
        }
        break;
      }
    }
    return best;
  };
  // afasta da parede (o contorno simplificado pode avançar até 0,4 m)
  const offWall = (x: number, z: number, off: number) => {
    const w = wallNear(x, z);
    return { x: w.x + w.nx * off, z: w.z + w.nz * off, nx: w.nx, nz: w.nz };
  };
  // tábua encostada na parede com o desenho a giz da arma
  const chalkBoard = (item: string, x: number, z: number) => {
    const w = offWall(x, z, 0.5);
    const lx = Math.abs(w.nz), lz = Math.abs(w.nx);
    box(w.x - lx * 1.0 - w.nx * 0.08, 0.3, w.z - lz * 1.0 - w.nz * 0.08, w.x + lx * 1.0, 2.5, w.z + lz * 1.0, 'woodDark', true, { tint: 0x4a3a2c });
    wallBuy(item, w.x, w.z, w.nx, w.nz);
  };
  const atWall = (x: number, z: number, off: number) => offWall(x, z, off);

  // bebidas fixas: cada uma só vende com o gerador da sua área ligado (a luz da máquina também apaga)
  const PERK_GEN: Partial<Record<PerkId, number>> = { folego: 0, reflexo: 2, couraca: 3, gatilho: 4 };
  for (const [perk, p] of Object.entries(P.perk) as [PerkId, P2][]) {
    const w = atWall(p[0], p[1], 0.85);
    machine(perk, w.x, w.z, w.nx, w.nz);
    const lt = lights[lights.length - 1];
    if (lt.perk) lt.gen = PERK_GEN[perk];
  }
  // Caixa Misteriosa: o primeiro local é o inicial (Posto de Comando)
  const boxNames: [keyof typeof P.box, string][] = [['G1', 'Posto de Comando'], ['G2', 'Casamata'], ['G3', 'Oficina'], ['G4', 'Vala Sul'], ['G5', 'Quartel Norte'], ['G6', 'Igreja']];
  for (const [g, name] of boxNames) {
    const w = atWall(P.box[g][0], P.box[g][1], 0.8);
    boxSpot(name, w.x, w.z, w.nx, w.nz);
  }
  // armas de parede (desenho a giz em tábuas) e caixotes de munição
  const WALL: [string, number, number][] = [
    ['carbine', 96, 44], ['doublebarrel', 104, 40], ['grenade', 108, 60],
    ['smg', 64, -9], ['revolver', 60, 34], ['rifle', 37, 3], ['burstrifle', 5, -31],
    ['pump', -24, 50], ['lmg', 0, -76], ['sniper', -88, -8], ['knife', -91, 0],
  ];
  for (const [item, x, z] of WALL) chalkBoard(item, x, z);
  for (const [x, z] of [[100, 60], [50, 20], [-8, 58], [-78, 22], [-14, -76]] as P2[]) {
    const w = atWall(x, z, 0.6);
    ammoCrate(w.x, w.z, w.nx, w.nz);
  }

  // ---------- Escavação: runas, borda do poço e a Forja ----------
  const ring = (r: number, n: number, fn: (a: P2, b: P2) => void) => {
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      fn([rcx + Math.cos(a0) * r, rcz + Math.sin(a0) * r], [rcx + Math.cos(a1) * r, rcz + Math.sin(a1) * r]);
    }
  };
  ring(6.5, 28, (a, b) => seg(a, along(a, b, 0.6), -0.07, 0.07, 0.026, 0.04, 'neon', 0x4fb8ff));
  ring(9.2, 36, (a, b) => seg(along(a, b, 0.2), along(a, b, 0.8), -0.06, 0.06, 0.026, 0.04, 'neon', 0x3a90d0));
  ring(L.ring.hole + 0.35, 14, (a, b) => seg(a, b, -0.35, 0.35, 0, 0.55, 'stone', 0x6e685e, 0.1));
  // o vão do poço fica aberto: o navegador desenha o poço em degraus lá dentro (escavacaoView.ts); a colisão é a dos blocos escondidos
  // a coluna da Forja sobe do poço quando os 6 geradores ligam: o navegador a desenha (aqui só o ponto de uso)
  interactables.push({ id: 'forge', kind: 'forge', use: [rcx, rcz + 2.9], y: 0 });
  lights.push({ pos: [rcx, 1.2, rcz + 1.6], color: 0x6ab8ff, intensity: 14, distance: 9, kind: 'interior' });
  // andaimes, mesas de arqueólogo e postes de luz em volta do anel
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const px = rcx + Math.cos(a) * 9.6, pz = rcz + Math.sin(a) * 9.6;
    box(px - 0.1, 0, pz - 0.1, px + 0.1, 3.4, pz + 0.1, 'woodDark', true);
    box(px - 0.2, 3.2, pz - 0.2, px + 0.2, 3.5, pz + 0.2, 'lamp', false);
    lights.push({ pos: [px, 3.1, pz], color: 0xffcf8a, intensity: 26, distance: 15, kind: 'lamp' });
  }
  // mesa do gramofone
  {
    const [gx, gz] = P.gramofone;
    box(gx - 0.7, 0, gz - 0.4, gx + 0.7, 0.8, gz + 0.4, 'wood', true, { tint: 0x7a5a3c });
  }
  crate(rcx + 6, rcz - 7.5, 0.9);
  crate(rcx + 6.9, rcz - 7.3, 0.7);
  crate(rcx - 7.5, rcz + 6.5, 0.9);

  // ---------- enfeites da planta (os enigmas usam depois) ----------
  for (const [x, z] of P.carroca) {
    // carroça tombada pegando fogo
    box(x - 1.2, 0.5, z - 0.7, x + 1.2, 1.2, z + 0.7, 'wood', false, { tint: 0x5a4030, rot: [0, 0.4, 0.12] });
    for (const s of [-1, 1]) box(x - 0.5, 0, z + s * 0.75 - 0.05, x + 0.5, 1.0, z + s * 0.75 + 0.05, 'woodDark', false, { rot: [0, 0.4, 0] });
    fires.push([x, 1.25, z]);
    lights.push({ pos: [x, 2.2, z], color: 0xff7a2a, intensity: 34, distance: 16, kind: 'fire' });
  }
  for (const [x, z] of P.lapide) {
    box(x - 0.4, 0, z - 0.12, x + 0.4, 1.0, z + 0.12, 'stone', true, { tint: 0x9a968e });
    box(x - 0.3, 1.0, z - 0.12, x + 0.3, 1.15, z + 0.12, 'stone', false, { tint: 0x9a968e });
  }
  for (const [x, z] of P.domo) {
    for (let k = 0; k < 3; k++) {
      const r = 1.1 - k * 0.32;
      box(x - r, k * 0.35, z - r, x + r, (k + 1) * 0.35, z + r, 'metal', true, { tint: 0x4a4640 });
    }
    box(x - 0.12, 1.05, z - 0.12, x + 0.12, 1.6, z + 0.12, 'rust', false);
  }
  for (const [x, z] of P.bau) {
    const w = wallNear(x, z, 3);
    const along = w.nx !== 0;
    const [hx, hz] = along ? [0.45, 1.0] : [1.0, 0.45];
    box(x - hx, 0, z - hz, x + hx, 0.7, z + hz, 'stone', true, { tint: 0x6a655c });
    box(x - hx - 0.05, 0.7, z - hz - 0.05, x + hx + 0.05, 0.82, z + hz + 0.05, 'stone', false, { tint: 0x5a554c, rot: [0, 0.25, 0] });
  }
  // lajes de pedra da Cripta (onde fica a Tábua)
  {
    const a = L.areas.find((x) => x.id === 'bunker-lajes')!;
    const [, z0, x1, z1] = bboxOf(a.poly);
    for (let z = z0 + 1.5; z < z1 - 1; z += 3.2) box(x1 - 1.4, 0, z, x1 - 0.2, 2.2, z + 2.6, 'stone', true, { tint: 0x8a857c });
  }

  // ---------- sistemas da Trincheira: geradores, Fonte, pás, peças, bancadas, portais, Mesa dos Cajados ----------
  const GN = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'] as const;
  const GEN_AREA = ['Posto de Comando', 'Casamata', 'Oficina', 'Vala Sul', 'Quartel Norte', 'Posto Oeste'];
  // plataforma octogonal (dois quadrados, um girado em 45°) com raio de circunferência r
  const octagon = (cx: number, cz: number, r: number, y0: number, y1: number, mat: MaterialId, tint: number) => {
    const h = r / Math.SQRT2;
    box(cx - h, y0, cz - h, cx + h, y1, cz + h, mat, false, { tint });
    box(cx - h, y0, cz - h, cx + h, y1, cz + h, mat, false, { tint, rot: [0, Math.PI / 4, 0] });
  };
  const circleSeg = (cx: number, cz: number, r: number, n: number, fn: (a: P2, b: P2) => void) => {
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      fn([cx + Math.cos(a0) * r, cz + Math.sin(a0) * r], [cx + Math.cos(a1) * r, cz + Math.sin(a1) * r]);
    }
  };
  // lado aberto (chão) mais perto de um ponto: direção unitária entre as 4 cardeais
  const openSide = (x: number, z: number): P2 => {
    for (const [dx, dz] of DIRS) {
      const i = cellAt(x + dx * 1.6, z + dz * 1.6);
      const j = cellAt(x + dx * 0.9, z + dz * 0.9);
      if (i >= 0 && walk[i] && j >= 0 && walk[j]) return [dx, dz];
    }
    return [0, 1];
  };

  // células andáveis ligadas ao início (com todos os portões abertos): o que fica em ilhas (dentro dos prédios cheios) não serve
  const linked = new Uint8Array(N);
  {
    const start = cellAt(P.spawn[0][0], P.spawn[0][1]);
    const queue = [start];
    linked[start] = 1;
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      const cx = i % GW, cz = (i - cx) / GW;
      for (const [dx, dz] of DIRS) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= GW || nz >= GH) continue;
        const j = idx(nx, nz);
        if (!walk[j] || linked[j]) continue;
        linked[j] = 1;
        queue.push(j);
      }
    }
  }
  // leva um ponto da planta para o chão livre mais perto (3 x 3 células andáveis e ligadas), sem sair da área
  const snap = (p: P2): P2 => {
    const ok = (x: number, z: number) => {
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const i = cellAt(x + dx, z + dz);
        if (i < 0 || !walk[i] || !linked[i]) return false;
      }
      return true;
    };
    if (ok(p[0], p[1])) return [p[0], p[1]];
    for (let r = 0.5; r <= 12; r += 0.5) {
      for (let a = 0; a < 24; a++) {
        const x = p[0] + Math.cos((a / 24) * Math.PI * 2) * r, z = p[1] + Math.sin((a / 24) * Math.PI * 2) * r;
        if (ok(x, z)) return [x, z];
      }
    }
    return [p[0], p[1]];
  };

  // geradores: plataforma redonda de 3,5 m, motor no meio, aro de metal
  const gens: TrincheiraData['gens'] = [];
  GN.forEach((g, i) => {
    const [gx, gz] = P.gen[g];
    const R = TRINCHEIRA.genRadius;
    octagon(gx, gz, R, 0, 0.035, 'metal', 0x34322e);
    circleSeg(gx, gz, R - 0.1, 24, (a, b) => seg(a, b, -0.12, 0.12, 0, 0.09, 'metal', 0x58544c));
    box(gx - 0.95, 0.035, gz - 0.7, gx + 0.95, 1.5, gz + 0.7, 'metal', true, { tint: 0x4a4640 });
    box(gx - 1.05, 1.5, gz - 0.8, gx + 1.05, 1.62, gz + 0.8, 'rust', false, { tint: 0x6a4a30 });
    box(gx + 0.45, 1.62, gz - 0.2, gx + 0.7, 3.1, gz + 0.05, 'rust', false, { tint: 0x4a3a2c });
    box(gx - 0.8, 0.5, gz + 0.71, gx + 0.8, 1.2, gz + 0.74, 'glassLit', false);
    lights.push({ pos: [gx, 2.4, gz + 1.4], color: 0xff8a40, intensity: 10, distance: 11, kind: 'lamp' });
    interactables.push({ id: ids.gen(i), kind: 'generator', ref: String(i), use: [gx, gz], y: 0, reach: R });
    gens.push({ x: gx, z: gz, r: R, name: GEN_AREA[i] });
  });

  // locais da Fonte da Sorte: um por gerador; o corpo só tem colisão onde ela está agora
  const fizzSpots: BoxSpot[] = [];
  GN.forEach((g, i) => {
    const w = atWall(P.fizz[g][0], P.fizz[g][1], 0.85);
    const f = facing(w.x, w.z, w.nx, w.nz, 1.2, 0.8);
    fizzSpots.push({ x: w.x, z: w.z, nx: w.nx, nz: w.nz, name: GEN_AREA[i] });
    box(f.x0, 0, f.z0, f.x1, 2.3, f.z1, 'metal', true, { hidden: true, door: `fizz-spot-${i}` });
    box(f.x0 - 0.12, 0, f.z0 - 0.12, f.x1 + 0.12, 0.12, f.z1 + 0.12, 'stone', false, { tint: 0x4a463e });
    interactables.push({ id: ids.fizz(i), kind: 'fizz', ref: String(i), use: [f.fx + w.nx * 0.9, f.fz + w.nz * 0.9], y: 0 });
  });

  // caixotes trancados com as peças do Vento (as pás e peças ficam longe deles)
  const windCrates = P.peca_vento.map((p) => snap(p));
  const awayFromCrates = (p: P2): P2 => {
    for (const c of windCrates) {
      const d = Math.hypot(p[0] - c[0], p[1] - c[1]);
      if (d < 2.6) {
        const k = (2.6 - d + 0.1) / (d || 1);
        p = snap([p[0] + (p[0] - c[0]) * k, p[1] + (p[1] - c[1]) * k]);
      }
    }
    return p;
  };
  // pás e montes de terra (18 comuns, depois os 3 de gelo)
  const shovels: P2[] = P.pa.map((p) => snap(awayFromCrates(snap(p))));
  shovels.forEach((p, i) => interactables.push({ id: ids.shovel(i), kind: 'shovel', ref: String(i), use: p, y: 0, reach: 1.7 }));
  const mounds: P2[] = [...P.monte, ...P.peca_gelo].map((p) => snap(p));
  mounds.forEach((p, i) => interactables.push({ id: ids.mound(i), kind: 'mound', ref: String(i), use: p, y: 0, reach: 1.7 }));

  // bancadas: mesa de trabalho encostada na parede
  const benches: P2[] = [];
  P.bancada.forEach((p, i) => {
    const w = atWall(p[0], p[1], 0.7);
    const f = facing(w.x, w.z, w.nx, w.nz, 2.0, 1.0);
    box(f.x0, 0, f.z0, f.x1, 0.9, f.z1, 'wood', true, { tint: 0x6a5238 });
    box(f.x0 - 0.05, 0.9, f.z0 - 0.05, f.x1 + 0.05, 0.98, f.z1 + 0.05, 'woodDark', false);
    box(f.x0 + 0.1, 0, f.z0 + 0.1, f.x0 + 0.2, 0.9, f.z0 + 0.2, 'metal', false, { tint: 0x2a2a2a });
    benches.push([w.x + w.nx * 0.7, w.z + w.nz * 0.7]);
    interactables.push({ id: ids.bench(i), kind: 'bench', ref: String(i), use: [f.fx + w.nx * 0.9, f.fz + w.nz * 0.9], y: 0 });
    signs.push({ pos: [f.fx + w.nx * 0.02, 0.55, f.fz + w.nz * 0.02], w: 1.1, h: 0.3, normal: [w.nx, w.nz], text: 'BANCADA', fg: '#f3e6c4', bg: '#3b3226' });
  });

  // desafios: baús de madeira reforçada
  const challengeChests: P2[] = P.desafio.map((p) => [p[0], p[1]] as P2);
  P.desafio.forEach((p, i) => {
    const w = atWall(p[0], p[1], 0.75);
    const f = facing(w.x, w.z, w.nx, w.nz, 1.4, 0.8);
    box(f.x0, 0, f.z0, f.x1, 0.75, f.z1, 'woodDark', true, { tint: 0x5a4430 });
    box(f.x0 - 0.04, 0.75, f.z0 - 0.04, f.x1 + 0.04, 0.9, f.z1 + 0.04, 'metal', false, { tint: 0x3a3630 });
    signs.push({ pos: [f.fx + w.nx * 0.02, 0.45, f.fz + w.nz * 0.02], w: 1.1, h: 0.3, normal: [w.nx, w.nz], text: 'DESAFIOS', fg: '#ffd23a', bg: '#2a201a' });
    lights.push({ pos: [w.x + w.nx * 0.8, 1.4, w.z + w.nz * 0.8], color: 0xffd070, intensity: 4, distance: 5, kind: 'machine' });
    challengeChests[i] = [w.x + w.nx * 0.75, w.z + w.nz * 0.75];
    interactables.push({ id: ids.challenge(i), kind: 'challenge', ref: String(i), use: [f.fx + w.nx * 0.9, f.fz + w.nz * 0.9], y: 0 });
  });

  // altar da Tábua na Igreja
  const tabuaAltar: P2 = [P.altar_igreja[0], P.altar_igreja[1]];
  {
    const w = atWall(tabuaAltar[0], tabuaAltar[1], 0.8);
    const f = facing(w.x, w.z, w.nx, w.nz, 1.8, 0.9);
    box(f.x0, 0, f.z0, f.x1, 0.95, f.z1, 'stone', true, { tint: 0x8a857c });
    box(f.x0 - 0.06, 0.95, f.z0 - 0.06, f.x1 + 0.06, 1.05, f.z1 + 0.06, 'stone', false, { tint: 0x6e695f });
    tabuaAltar[0] = w.x + w.nx * 0.8;
    tabuaAltar[1] = w.z + w.nz * 0.8;
    interactables.push({ id: ids.tabuaAltar, kind: 'tabuaAltar', use: [f.fx + w.nx * 0.9, f.fz + w.nz * 0.9], y: 0 });
  }

  // Mesa dos Cajados: 4 pedestais de pedra a 6 m do poço (norte, leste, sul, oeste)
  const staffTable: TrincheiraData['staffTable'] = [];
  const TABLE: [Element4, number, number][] = [['raio', 0, -1], ['fogo', 1, 0], ['vento', 0, 1], ['gelo', -1, 0]];
  for (const [el, dx, dz] of TABLE) {
    const x = rcx + dx * 6, z = rcz + dz * 6;
    const col = ELEMENTS[el].hex;
    box(x - 0.6, 0, z - 0.6, x + 0.6, 0.85, z + 0.6, 'stone', true, { tint: 0x6e685e });
    box(x - 0.72, 0.85, z - 0.72, x + 0.72, 0.97, z + 0.72, 'stone', false, { tint: 0x5a554c });
    box(x - 0.3, 0.97, z - 0.02, x + 0.3, 0.99, z + 0.02, 'neon', false, { tint: col });
    box(x - 0.02, 0.97, z - 0.3, x + 0.02, 0.99, z + 0.3, 'neon', false, { tint: col });
    staffTable.push({ el, x, z });
    interactables.push({ id: ids.staff(el), kind: 'staffPedestal', ref: el, use: [x + dx * 1.4, z + dz * 1.4], y: 0 });
  }
  // poço: a defesa final começa aqui
  interactables.push({ id: ids.poco, kind: 'missao', use: [rcx - 3.2, rcz - 0.6], y: 0 });

  // peças: uma ou mais posições por chave (a simulação sorteia onde fica cada uma)
  const pickups: Record<string, P2[]> = {};
  const pl = (list: P2[]) => list.map((p) => snap(p));
  pickups['escudo-rodas'] = pl(P.escudo_rodas);
  pickups['escudo-trava'] = pl(P.escudo_trava);
  pickups['escudo-armacao'] = pl(P.escudo_armacao);
  pickups['drone-cerebro'] = pl([P.drone_cerebro]);
  pickups['drone-helice'] = pl([P.drone_helice]);
  pickups['drone-corpo'] = pl(P.drone_corpo);
  pickups.gramofone = [[P.gramofone[0], P.gramofone[1] + 0.9]];
  pickups.disco = pl(P.disco);
  pickups.tabua = pl([P.tabua]);
  pickups['fogo-1'] = pl([P.peca_fogo[0]]);
  pickups['fogo-2'] = pl([P.peca_fogo[1]]);
  // a 3ª peça de Fogo cai do primeiro Blindado (sem local fixo); as de Gelo saem dos montes de gelo
  // Raio: a primeira fica sobre a rota do tanque (só se pega de cima dele)
  const tankPath: P2[] = L.tankPath.map((p) => [p[0], p[1]] as P2);
  const tankStops = L.tankPath.map((p, i) => (p.length === 3 ? { at: i, zone: p[2] as 'estacao' | 'igreja' | 'norte' } : null)).filter((x): x is { at: number; zone: 'estacao' | 'igreja' | 'norte' } => !!x);
  let tankPart: P2 = [P.peca_raio[0][0], P.peca_raio[0][1]];
  {
    let best = Infinity;
    for (let i = 0; i < tankPath.length; i++) {
      const a = tankPath[i], b2 = tankPath[(i + 1) % tankPath.length];
      const dx = b2[0] - a[0], dz = b2[1] - a[1];
      const t = Math.max(0, Math.min(1, ((P.peca_raio[0][0] - a[0]) * dx + (P.peca_raio[0][1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      const q: P2 = [a[0] + dx * t, a[1] + dz * t];
      const d = Math.hypot(q[0] - P.peca_raio[0][0], q[1] - P.peca_raio[0][1]);
      if (d < best) {
        best = d;
        tankPart = q;
      }
    }
  }
  pickups['raio-1'] = [tankPart];
  pickups['raio-2'] = pl([P.peca_raio[1]]);
  pickups['raio-3'] = pl([P.peca_raio[2]]);
  windCrates.forEach((p, i) => {
    // caixote trancado: o jogador pega do lado aberto mais livre
    let [ox, oz] = openSide(p[0], p[1]);
    let bestFree = -1;
    for (const [dx, dz] of DIRS) {
      const i1 = cellAt(p[0] + dx * 1.6, p[1] + dz * 1.6), j1 = cellAt(p[0] + dx * 0.9, p[1] + dz * 0.9);
      if (i1 < 0 || !walk[i1] || j1 < 0 || !walk[j1]) continue;
      const free = Math.min(...interactables.map((it) => Math.hypot(it.use[0] - (p[0] + dx * 1.2), it.use[1] - (p[1] + dz * 1.2))));
      if (free > bestFree) {
        bestFree = free;
        [ox, oz] = [dx, dz];
      }
    }
    box(p[0] - 0.55, 0, p[1] - 0.55, p[0] + 0.55, 1.0, p[1] + 0.55, 'wood', true, { tint: 0x6a5a40 });
    box(p[0] - 0.58, 0.45, p[1] - 0.58, p[0] + 0.58, 0.55, p[1] + 0.58, 'metal', false, { tint: 0x3a3630 });
    pickups[`vento-${i + 1}`] = [[p[0] + ox * 1.2, p[1] + oz * 1.2]];
  });
  // cada peça vira uma interação (id part:<chave>:<local>) que só vale quando a simulação a põe em tr.pick
  const keyOrder = Object.keys(pickups);
  for (const key of keyOrder) {
    pickups[key].forEach((p, loc) => {
      interactables.push({
        id: ids.part(key, loc), kind: 'part', ref: key, use: p, y: 0,
        ...(key === 'raio-1' ? { reach: 4.5, minY: TRINCHEIRA.tankDeck - 0.3 } : { reach: 1.8 }),
      });
    });
  }

  // lápides, domos e baús de almas (alvos e contagem dos enigmas) já foram desenhados acima
  const chests: P2[] = P.bau.map((p) => [p[0], p[1]] as P2);
  const tombstones: P2[] = P.lapide.map((p) => [p[0], p[1]] as P2);
  const domes: P2[] = P.domo.map((p) => [p[0], p[1]] as P2);

  // portais: túnel de pedra encostado na parede com uma laje rúnica que afunda quando o disco toca
  const portals: TrincheiraData['portals'] = [];
  for (const el of ELEMENT_LIST) {
    const p = P.portal[el];
    const w = wallNear(p[0], p[1], 6);
    const [nx, nz] = [w.nx, w.nz];
    const lx = Math.abs(nz), lz = Math.abs(nx);
    const cx = w.x + nx * 0.5, cz = w.z + nz * 0.5;
    const col = ELEMENTS[el].hex;
    const slab = facing(cx, cz, nx, nz, 3, 1.0);
    box(slab.x0, 0, slab.z0, slab.x1, 2.7, slab.z1, 'rune', true, { door: `portal-${el}`, tint: 0x4a4650 });
    // runa do elemento na face da laje
    const rn = facing(slab.fx, slab.fz, nx, nz, 1.7, 0.06);
    box(rn.x0 + nx * 0.03, 0.5, rn.z0 + nz * 0.03, rn.x1 + nx * 0.03, 2.2, rn.z1 + nz * 0.03, 'neon', false, { door: `portal-${el}`, tint: col });
    // moldura de pedra e vigas
    for (const s2 of [-1, 1]) {
      const pp = facing(cx + lx * s2 * 1.85, cz + lz * s2 * 1.85, nx, nz, 0.5, 1.2);
      box(pp.x0, 0, pp.z0, pp.x1, 3.1, pp.z1, 'stone', true, { tint: 0x7a756c });
    }
    const lt = facing(cx, cz, nx, nz, 4.2, 1.2);
    box(lt.x0, 2.7, lt.z0, lt.x1, 3.2, lt.z1, 'woodDark', false, { tint: 0x5a4430 });
    lights.push({ pos: [cx + nx * 1.6, 2.0, cz + nz * 1.6], color: col, intensity: 6, distance: 7, kind: 'machine' });
    const use: P2 = [cx + nx * 2.0, cz + nz * 2.0];
    interactables.push({ id: ids.portal(el), kind: 'portal', ref: el, use, y: 0 });
    portals.push({ el, mouth: [cx, cz], slab: use, exit: [cx + nx * 2.8, cz + nz * 2.8], r: 1.3 });
  }

  // ---------- Câmara Antiga: salão redondo de 10 m e 4 alcovas de 9 x 9 m, longe do mapa principal ----------
  const CC: P2 = [165, 0];
  const HALL = 10;
  const ALC = 17.5;
  const ALCOVES: { el: Element4; d: P2 }[] = [{ el: 'raio', d: [0, -1] }, { el: 'fogo', d: [1, 0] }, { el: 'vento', d: [0, 1] }, { el: 'gelo', d: [-1, 0] }];
  const inAlcove = (x: number, z: number, d: P2) => {
    const ax = CC[0] + d[0] * ALC, az = CC[1] + d[1] * ALC;
    if (Math.abs(x - ax) <= 4.5 && Math.abs(z - az) <= 4.5) return true;
    // corredor de 3 m entre o salão (raio 10) e a alcova
    const u = (x - CC[0]) * d[0] + (z - CC[1]) * d[1];
    const v = Math.abs((x - CC[0]) * d[1] - (z - CC[1]) * d[0]);
    return v <= 1.5 && u >= HALL - 1 && u <= ALC;
  };
  const chamberWalk = (x: number, z: number) => Math.hypot(x - CC[0], z - CC[1]) <= HALL || ALCOVES.some((a) => inAlcove(x, z, a.d));
  const CX0 = 134, CZ0 = -30, CW = 62, CH = 60;
  const cw = new Uint8Array(CW * CH);
  for (let cz = 0; cz < CH; cz++) for (let cx = 0; cx < CW; cx++) cw[cz * CW + cx] = chamberWalk(CX0 + cx + 0.5, CZ0 + cz + 0.5) ? 1 : 0;
  const cSolid = new Uint8Array(CW * CH);
  for (let cz = 0; cz < CH; cz++) {
    for (let cx = 0; cx < CW; cx++) {
      if (cw[cz * CW + cx]) continue;
      let near = false;
      for (let dz = -2; dz <= 2 && !near; dz++) for (let dx = -2; dx <= 2 && !near; dx++) {
        const x = cx + dx, z = cz + dz;
        if (x >= 0 && z >= 0 && x < CW && z < CH && cw[z * CW + x]) near = true;
      }
      if (near) cSolid[cz * CW + cx] = 1;
    }
  }
  const gridRuns = (grid: Uint8Array, fn: (x0: number, x1: number, z: number) => void) => {
    for (let cz = 0; cz < CH; cz++) {
      let st = -1;
      for (let cx = 0; cx <= CW; cx++) {
        const on = cx < CW && grid[cz * CW + cx] === 1;
        if (!on && st >= 0) {
          fn(CX0 + st, CX0 + cx, CZ0 + cz);
          st = -1;
        }
        if (on && st < 0) st = cx;
      }
    }
  };
  gridRuns(cw, (x0, x1, z) => box(x0, -0.06, z, x1, 0.02, z + 1, 'rune', false, { tint: 0x4e4a5e }));
  gridRuns(cSolid, (x0, x1, z) => box(x0, 0, z, x1, 7, z + 1, 'stone', true, { tint: 0x3a3646 }));
  // runas no chão: anel do salão e um círculo em cada alcova, na cor do elemento
  circleSeg(CC[0], CC[1], 7.2, 32, (a, b) => seg(a, along(a, b, 0.7), -0.08, 0.08, 0.025, 0.045, 'neon', 0x8a6cff));
  circleSeg(CC[0], CC[1], 4.0, 24, (a, b) => seg(a, along(a, b, 0.6), -0.06, 0.06, 0.025, 0.045, 'neon', 0x6a5cc0));
  // pilares quebrados em volta do salão
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const px = CC[0] + Math.cos(a) * 8.2, pz = CC[1] + Math.sin(a) * 8.2;
    const hgt = 1.4 + hash(k, 3, 7) * 3.2;
    box(px - 0.45, 0, pz - 0.45, px + 0.45, hgt, pz + 0.45, 'stone', true, { tint: 0x5a566a });
    box(px - 0.55, hgt, pz - 0.5, px + 0.5, hgt + 0.25, pz + 0.5, 'stone', false, { tint: 0x4a4658, rot: [0.2, a, 0.15] });
  }
  const alcoveData: TrincheiraData['chamber']['alcoves'] = [];
  const plates: [number, number, number][] = [];
  for (const { el, d } of ALCOVES) {
    const ax = CC[0] + d[0] * ALC, az = CC[1] + d[1] * ALC;
    // eixo lateral (v) e eixo para o fundo (u)
    const lat: P2 = [-d[1], d[0]];
    const at = (u: number, v: number): P2 => [ax + d[0] * u + lat[0] * v, az + d[1] * u + lat[1] * v];
    const col = ELEMENTS[el].hex;
    const back = at(0, -3.9);
    const crystal = at(0, 3.6);
    const altar = at(2.6, 0);
    circleSeg(ax, az, 2.6, 20, (a, b) => seg(a, along(a, b, 0.7), -0.07, 0.07, 0.025, 0.045, 'neon', col));
    // pedestal do cristal, altar e a pedra do portal de volta
    const ped = (p: P2, w: number, h: number, tint: number) => box(p[0] - w, 0, p[1] - w, p[0] + w, h, p[1] + w, 'stone', true, { tint });
    ped(crystal, 0.5, 0.9, 0x5a566a);
    ped(altar, 0.8, 0.95, 0x6a6678);
    box(altar[0] - 0.9, 0.95, altar[1] - 0.9, altar[0] + 0.9, 1.04, altar[1] + 0.9, 'stone', false, { tint: 0x4a4658 });
    for (const s2 of [-1, 1]) {
      const px = back[0] + lat[0] * s2 * 1.1, pz = back[1] + lat[1] * s2 * 1.1;
      box(px - 0.25, 0, pz - 0.25, px + 0.25, 2.8, pz + 0.25, 'stone', true, { tint: 0x6a6678 });
    }
    box(back[0] - 1.35, 2.6, back[1] - 1.35, back[0] + 1.35, 3.0, back[1] + 1.35, 'stone', false, { tint: 0x5a566a });
    lights.push({ pos: [ax, 3.2, az], color: col, intensity: 12, distance: 12, kind: 'interior' });
    alcoveData.push({ el, c: [ax, az], back, crystal, altar });
    interactables.push({ id: ids.altar(el), kind: 'altar', ref: el, use: [altar[0] - d[0] * 1.3, altar[1] - d[1] * 1.3], y: 0 });
    pickups[`cristal-${el}`] = [crystal];
    if (el === 'raio') {
      // 6 placas numeradas na parede do fundo (alvos do enigma do Raio)
      for (let k = 0; k < 6; k++) {
        const pp = at(4.35, -3.75 + k * 1.5);
        plates.push([pp[0], 1.7, pp[1]]);
        signs.push({
          pos: [pp[0] - d[0] * 0.04, 1.7, pp[1] - d[1] * 0.04], w: 0.9, h: 0.9, normal: [-d[0], -d[1]], text: String(k + 1), fg: '#e8e0ff', bg: '#3a2c5a', glow: true,
        });
      }
    }
  }
  lights.push({ pos: [CC[0], 3.5, CC[1]], color: 0x8a6cff, intensity: 18, distance: 16, kind: 'interior' });
  for (const { el } of ALCOVES) {
    const key = `cristal-${el}`;
    pickups[key].forEach((p, loc) => interactables.push({ id: ids.part(key, loc), kind: 'part', ref: key, use: [p[0], p[1]], y: 0, reach: 1.8 }));
  }
  const chamberRect: R4 = [CX0 + 2, CZ0 + 2, CX0 + CW - 2, CZ0 + CH - 2];
  // nascimento na Câmara: 4 no salão e 2 por alcova (só valem com alguém dentro)
  const chamberSpawns: P2[] = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    chamberSpawns.push([CC[0] + Math.cos(a) * 6, CC[1] + Math.sin(a) * 6]);
  }
  for (const { d } of ALCOVES) {
    const ax = CC[0] + d[0] * ALC, az = CC[1] + d[1] * ALC;
    const lat: P2 = [-d[1], d[0]];
    chamberSpawns.push([ax + d[0] * 1.5 + lat[0] * 2.4, az + d[1] * 1.5 + lat[1] * 2.4], [ax + d[0] * 1.5 - lat[0] * 2.4, az + d[1] * 1.5 - lat[1] * 2.4]);
  }

  // pegadas dos colossos: bloco escondido que só tem colisão enquanto o pé está no chão (a simulação o fecha e abre)
  for (const f of L.feet) box(f.r[0], 0, f.r[1], f.r[2], 12, f.r[3], 'concrete', true, { hidden: true, door: `pe-${f.id}` });

  // tanque: laço fechado; a alavanca fica ao lado da vaga da Estação
  const homeYaw = (() => {
    const [ax, az] = tankPath[0], [bx, bz] = tankPath[1];
    return Math.atan2(bx - ax, bz - az);
  })();
  let lever: P2 = [tankPath[0][0], tankPath[0][1]];
  let leverN: P2 = [0, 1];
  {
    const [hx, hz] = tankPath[0];
    const fx = Math.sin(homeYaw), fz = Math.cos(homeYaw);
    let best = Infinity;
    for (let r = 4.5; r <= 9; r += 0.5) {
      for (let a = 0; a < 24; a++) {
        const x = hx + Math.cos((a / 24) * Math.PI * 2) * r, z = hz + Math.sin((a / 24) * Math.PI * 2) * r;
        const lxv = (x - hx) * fz - (z - hz) * fx, lzv = (x - hx) * fx + (z - hz) * fz;
        if (Math.abs(lxv) < TRINCHEIRA.tankHalfWidth + 1 && Math.abs(lzv) < TRINCHEIRA.tankHalfLen + 1) continue;
        let ok = true;
        for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1 && ok; dx++) {
          const i = cellAt(x + dx, z + dz);
          if (i < 0 || !walk[i] || groupOf(i) !== 'estacao') ok = false;
        }
        if (!ok) continue;
        // perto da traseira
        const d = Math.hypot(x - (hx - fx * 5.5), z - (hz - fz * 5.5));
        if (d < best) {
          best = d;
          lever = [x, z];
        }
      }
    }
    leverN = [-fx, -fz];
    box(lever[0] - 0.12, 0, lever[1] - 0.12, lever[0] + 0.12, 1.2, lever[1] + 0.12, 'metal', true, { tint: 0x3a3630 });
    box(lever[0] - 0.05, 1.2, lever[1] - 0.05, lever[0] + 0.05, 1.7, lever[1] + 0.05, 'rust', false, { rot: [0.5, homeYaw, 0], tint: 0x8a3a2a });
    signs.push({ pos: [lever[0] + 0.14, 1.0, lever[1]], w: 0.9, h: 0.4, normal: [1, 0], text: `TANQUE · ${TRINCHEIRA.tankCost}`, fg: '#f3e6c4', bg: '#2a201a' });
    signs.push({ pos: [lever[0] - 0.14, 1.0, lever[1]], w: 0.9, h: 0.4, normal: [-1, 0], text: `TANQUE · ${TRINCHEIRA.tankCost}`, fg: '#f3e6c4', bg: '#2a201a' });
    interactables.push({ id: ids.tank, kind: 'tank', use: lever, y: 0 });
  }

  const trincheira: TrincheiraData = {
    gens, fizzGen: [0, 1, 2, 3, 4, 5],
    groups: { ox: OX, oz: OZ, w: GW, h: GH, data: '' },
    groupDoor: {
      p: null, c: ['casamata', 'estacao'], e: ['casamata', 'estacao'], o: 'oficina', v: 'vala', q: 'quartel', i: 'igreja', l: ['casamata', 'estacao'], m: null,
    },
    feet: L.feet.map((f) => ({ id: f.id, robot: f.robot, r: f.r })),
    mounds, shovels, benches,
    tank: { path: tankPath, stops: tankStops, lever, leverNormal: leverN },
    ring: { c: [rcx, rcz], r: L.ring.r, hole: L.ring.hole },
    portals,
    chamber: { center: CC, hall: HALL, alcoves: alcoveData, plates },
    staffTable, chests, tombstones, domes, tabuaAltar, challengeChests, pickups, tankPart, windCrates, chamberRect,
  };

  // ---------- luz de cada área ----------
  const lampSpots = new Map<number, P2[]>();
  for (let i = 0; i < N; i++) {
    const zi = zoneOf[i];
    if (zi < 0 || !walk[i] || zones[zi].style === 'low' || zones[zi].id.startsWith('pe-') || zi === pocketZ) continue;
    const cx = i % GW, cz = (i - cx) / GW;
    // longe das paredes (2 células livres em volta)
    let ok = true;
    for (let dz = -2; dz <= 2 && ok; dz++) for (let dx = -2; dx <= 2 && ok; dx++) if (!walk[idx(cx + dx, cz + dz)]) ok = false;
    if (!ok) continue;
    let list = lampSpots.get(zi);
    if (!list) lampSpots.set(zi, (list = []));
    list.push([OX + cx + 0.5, OZ + cz + 0.5]);
  }
  for (const [zi, cells] of lampSpots) {
    const z = zones[zi];
    // o Posto de Comando (onde se começa) é mais iluminado
    const want = Math.max(1, Math.round(cells.length / (z.id === 'posto' ? 45 : 95)));
    const picked: P2[] = [];
    for (const c of shuffle(cells)) {
      if (picked.length >= want) break;
      if (picked.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < (z.id === 'posto' ? 6 : 10))) continue;
      // poste não fica onde o jogador nasce nem na frente de máquina, Caixa ou porta
      if ([...P.spawn, ...interactables.map((i) => i.use as P2)].some((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < 2.5)) continue;
      picked.push(c);
    }
    const roof = ROOF[z.style]?.[0];
    for (const [x, zz] of picked) {
      if (roof) {
        // lampião pendurado no telhado
        box(x - 0.015, 2.6, zz - 0.015, x + 0.015, roof, zz + 0.015, 'metal', false, { tint: 0x222222 });
        box(x - 0.16, 2.35, zz - 0.16, x + 0.16, 2.6, zz + 0.16, 'lamp', false);
        lights.push({ pos: [x, 2.3, zz], color: 0xffc27a, intensity: 26, distance: 15, kind: 'interior' });
      } else {
        // lampião num poste de madeira
        box(x - 0.08, 0, zz - 0.08, x + 0.08, 2.7, zz + 0.08, 'woodDark', true);
        box(x - 0.15, 2.5, zz - 0.15, x + 0.15, 2.75, zz + 0.15, 'lamp', false);
        lights.push({ pos: [x, 2.45, zz], color: 0xffc27a, intensity: 24, distance: 14, kind: 'lamp' });
      }
    }
  }

  // ---------- pontos onde os zumbis sobem da terra ----------
  const avoid: P2[] = [
    ...interactables.map((i) => i.use as P2),
    ...L.doors.flatMap((d) => d.gates.map((g) => g.at)),
    ...L.entries.map((e) => e.at),
  ];
  // coisas sólidas à vista (postes, máquinas, mesas, caixotes): nascimentos ficam longe delas
  const obst = new Uint8Array(N);
  for (const bk of blocks) {
    if (!bk.solid || bk.hidden || bk.max[1] < 0.5 || bk.min[1] > 2) continue;
    if (bk.max[0] - bk.min[0] > 12 || bk.max[2] - bk.min[2] > 12) continue;
    const x0 = Math.floor(bk.min[0] - 1 - OX), x1 = Math.floor(bk.max[0] + 1 - OX);
    const z0 = Math.floor(bk.min[2] - 1 - OZ), z1 = Math.floor(bk.max[2] + 1 - OZ);
    for (let cz = Math.max(0, z0); cz <= Math.min(GH - 1, z1); cz++) for (let cx = Math.max(0, x0); cx <= Math.min(GW - 1, x1); cx++) obst[idx(cx, cz)] = 1;
  }
  const byZone = new Map<number, P2[]>();
  for (let cz = 2; cz < GH - 2; cz++) {
    for (let cx = 2; cx < GW - 2; cx++) {
      const i = idx(cx, cz);
      const zi = zoneOf[i];
      if (!walk[i] || zi < 0 || zi === pocketZ || gateCut[i] || platforms.has(zi) || obst[i]) continue;
      let ok = true;
      for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1 && ok; dx++) if (!walk[idx(cx + dx, cz + dz)]) ok = false;
      if (!ok) continue;
      const p: P2 = [OX + cx + 0.5, OZ + cz + 0.5];
      if (avoid.some((a) => Math.hypot(a[0] - p[0], a[1] - p[1]) < 5)) continue;
      let list = byZone.get(zi);
      if (!list) byZone.set(zi, (list = []));
      list.push(p);
    }
  }
  const accepted: P2[] = [];
  for (const [zi, cells] of byZone) {
    const z = zones[zi];
    const isMud = z.floor === 'mud';
    const want = isMud ? Math.max(2, Math.round(cells.length / 90)) : Math.max(1, Math.min(6, Math.round(cells.length / 80)));
    let got = 0;
    for (const c of shuffle(cells)) {
      if (got >= want) break;
      if (accepted.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < 11)) continue;
      accepted.push(c);
      got++;
      const sp: SpawnPoint = { x: c[0], z: c[1], area: SPAWN_AREA[z.group] ?? null, zone: LETTER[z.group] ?? '.' };
      zombieSpawns.push(sp);
    }
  }

  for (const [x, z] of chamberSpawns) zombieSpawns.push({ x, z, area: 'camara', zone: 'm' });

  // ---------- campo de crateras em volta (fora do mapa) ----------
  const nearWalk = (x: number, z: number, r: number) => {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const i = cellAt(x + dx, z + dz);
      if (i >= 0 && (walk[i] || solid[i])) return true;
    }
    return false;
  };
  for (let k = 0; k < 2600; k++) {
    const x = rr(BOUNDS.minX + 2, BOUNDS.maxX - 2), z = rr(BOUNDS.minZ + 2, BOUNDS.maxZ - 2);
    if (nearWalk(x, z, 2)) continue;
    const roll = rnd();
    if (roll < 0.05 && !nearWalk(x, z, 4)) {
      // cratera: borda de terra em volta de um buraco escuro
      const r = rr(1.6, 3.4);
      for (let s = 0; s < 8; s++) {
        const a = (s / 8) * Math.PI * 2;
        box(x + Math.cos(a) * r - 0.8, -0.2, z + Math.sin(a) * r - 0.5, x + Math.cos(a) * r + 0.8, rr(0.3, 0.6), z + Math.sin(a) * r + 0.5, 'dirt', false, {
          tint: 0x4e4032, rot: [rr(-0.2, 0.2), -a, rr(-0.2, 0.2)],
        });
      }
      box(x - r * 0.7, -0.05, z - r * 0.7, x + r * 0.7, 0.01, z + r * 0.7, 'mud', false, { rot: [0, rr(0, 3), 0] });
    } else if (roll < 0.09) {
      // árvore seca
      const h = rr(3.5, 7);
      box(x - 0.18, 0, z - 0.18, x + 0.18, h, z + 0.18, 'woodDark', false, { tint: 0x3a3028, rot: [rr(-0.12, 0.12), rr(0, 3), rr(-0.12, 0.12)] });
      for (let b = 0; b < 3; b++) {
        const y = rr(h * 0.5, h * 0.9);
        box(x - 0.06, y, z - 0.9, x + 0.06, y + 0.12, z + 0.9, 'woodDark', false, { tint: 0x3a3028, rot: [rr(-0.7, 0.7), rr(0, 3), 0] });
      }
    } else if (roll < 0.16) {
      // estacas com arame
      const yaw = rr(0, Math.PI);
      for (const s of [-1.2, 0, 1.2]) {
        const px = x + Math.sin(yaw) * s, pz = z + Math.cos(yaw) * s;
        box(px - 0.05, 0, pz - 0.05, px + 0.05, rr(0.9, 1.4), pz + 0.05, 'woodDark', false, { rot: [rr(-0.2, 0.2), 0, rr(-0.2, 0.2)] });
      }
      box(x - 0.01, 0.8, z - 1.3, x + 0.01, 0.83, z + 1.3, 'metal', false, { tint: 0x2a2622, rot: [0, yaw, 0] });
    } else if (roll < 0.3) {
      foliage.push({ kind: rnd() < 0.5 ? 'rock' : 'stump', x, z, s: rr(0.5, 1.2), r: rr(0, 6.3) });
    } else if (roll < 0.62) {
      foliage.push({ kind: 'grass', x, z, s: rr(0.6, 1.2), r: rr(0, Math.PI) });
    }
  }

  // ---------- limites ----------
  const b = LIMITS;
  box(b.minX - 1, 0, b.minZ - 1, b.maxX + 1, 30, b.minZ, 'concrete', true, { hidden: true });
  box(b.minX - 1, 0, b.maxZ, b.maxX + 1, 30, b.maxZ + 1, 'concrete', true, { hidden: true });
  box(b.minX - 1, 0, b.minZ, b.minX, 30, b.maxZ, 'concrete', true, { hidden: true });
  box(b.maxX, 0, b.minZ, b.maxX + 1, 30, b.maxZ, 'concrete', true, { hidden: true });

  // chão de cada célula para o som dos passos
  let data = '';
  for (let i = 0; i < N; i++) {
    const zi = walk[i] ? zoneOf[i] : -1;
    data += zi >= 0 ? zones[zi].surf : 'd';
  }

  // grupo (área) de cada célula, para "área ocupada" e a lama
  let gdata = '';
  for (let i = 0; i < N; i++) gdata += walk[i] && zoneOf[i] >= 0 ? (LETTER[zones[zoneOf[i]].group] ?? '.') : '.';
  trincheira.groups.data = gdata;

  const forgeMouth: Vec3 = [rcx, 0.9, rcz + 0.34];
  return {
    id: 'trincheira',
    name: 'Trincheira',
    bounds: b,
    blocks,
    lights,
    signs,
    fires,
    lava: [],
    playerSpawns: P.spawn,
    zombieSpawns,
    interactables,
    entries,
    doors,
    boxSpots,
    forge: { anvil: [rcx, 0.72, rcz + 1.15], mouth: forgeMouth, mouthNormal: [0, 1], candles: [] },
    fogDensity: 0.014,
    fogColor: 0x6b6458,
    foliage,
    navRange: 110,
    boss: 'blindado',
    hellRounds: false,
    powerupPool: [...DEFAULT_POOL, 'sangue'],
    boxExclude: ['wind', 'arc', 'vortex'],
    forgeNeedsGenerators: true,
    perkGen: PERK_GEN,
    fizzSpots,
    trincheira,
    place: 'Norte da França, 1918',
    sky: { top: 0x34373b, sun: 0xd8782e, warm: 0x6a2a10 },
    surface: { ox: OX, oz: OZ, w: GW, h: GH, data },
  };
}
