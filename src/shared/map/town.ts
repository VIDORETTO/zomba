import { SIGHTS } from '../weapons';
import { createBuilder, type BSpec, type Face, type QRect, type Quad } from './builder';
import type { MapDef, MaterialId, Vec3 } from './types';

// "Cidade": um cruzamento de duas ruas com uma fenda de lava no meio,
// quatro quarteirões com becos e quintais que formam voltas para "treinar" zumbis.
//
// Cada quarteirão é descrito em coordenadas locais (u, v):
//   u = distância da rua principal (eixo Z), v = distância da rua transversal (eixo X).
// O quarteirão é espelhado para os quatro cantos por (sx, sz).

const HALF = 48;
const NW: Quad = { sx: -1, sz: -1 };
const NE: Quad = { sx: 1, sz: -1 };
const SW: Quad = { sx: -1, sz: 1 };
const SE: Quad = { sx: 1, sz: 1 };

export function buildTown(): MapDef {
  const B = createBuilder(20121);
  const { rnd, rr, blocks, lights, signs, fires, lava, zombieSpawns, doors, boxSpots, interactables, entries } = B;
  const { box, qbox, qp, faceSlab, doorUse, building, car, lamp, barrel, crate, rubble, zombieEntry, machine, ammoCrate, wallBuy, woodDoor, debris, boxSpot } = B;
  // cada quarteirão tem uma área atrás dos becos; os zumbis só surgem nela depois que ela abre
  const areaOf = (q: Quad) => (q === NW ? 'q-no' : q === NE ? 'q-ne' : q === SW ? 'q-so' : 'cemiterio');
  const addSpawn = (q: Quad, u: number, v: number) => {
    const [x, z] = qp(q, u, v);
    zombieSpawns.push({ x, z, area: areaOf(q) });
  };

  // ---------- prédios em que se entra ----------
  // Porta paga para a rua, janelas com tábuas (só viram entrada de zumbis depois que o prédio abre)
  // e um ponto de surgir lá dentro. As janelas viram entradas no fim, depois das barricadas das ruas.
  const T = 0.35;
  const windowsLater: { x: number; z: number; nx: number; nz: number; area: string }[] = [];
  const ritualCandles: Vec3[] = [];
  // locais da Caixa dentro dos prédios: entram depois dos quatro antigos (a Caixa começa no Banco)
  const boxLater: { name: string; x: number; z: number; nx: number; nz: number }[] = [];
  // ponto na face de dentro da parede (a = posição ao longo da face) e a direção para dentro do prédio
  const inner = (q: Quad, r: QRect, f: Face, a: number, off = 0) => {
    const [u, v, nu, nv] =
      f === 'u0' ? [r.u0 + T + off, a, 1, 0]
      : f === 'u1' ? [r.u1 - T - off, a, -1, 0]
      : f === 'v0' ? [a, r.v0 + T + off, 0, 1]
      : [a, r.v1 - T - off, 0, -1];
    const [x, z] = qp(q, u, v);
    return { x, z, nx: nu * q.sx, nz: nv * q.sz };
  };
  function interior(
    q: Quad, id: string, spec: Omit<BSpec, 'enter'>, doorsAt: { face: Face; at: number; w: number }[],
    wins: { face: Face; at: number }[], floor: MaterialId, light: number, spawn: [number, number], doorMat: MaterialId = 'woodDark',
  ) {
    const r = spec.r;
    building(q, { ...spec, enter: { doors: [...doorsAt, ...wins.map((w) => ({ face: w.face, at: w.at, w: 1.6 }))], floor, light } });
    for (const d of doorsAt) {
      const a0 = d.at - d.w / 2, a1 = d.at + d.w / 2;
      const [u0, u1, v0, v1, uu, uv] =
        d.face === 'u0' ? [r.u0, r.u0 + T, a0, a1, r.u0 - 0.9, d.at]
        : d.face === 'u1' ? [r.u1 - T, r.u1, a0, a1, r.u1 + 0.9, d.at]
        : d.face === 'v0' ? [a0, a1, r.v0, r.v0 + T, d.at, r.v0 - 0.9]
        : [a0, a1, r.v1 - T, r.v1, d.at, r.v1 + 0.9];
      qbox(q, u0, u1, 0, 2.7, v0, v1, doorMat, true, { door: id });
      doorUse(id, ...qp(q, uu, uv));
    }
    const wallX = spec.wallTint !== undefined ? { tint: spec.wallTint } : {};
    for (const w of wins) {
      // peitoril e verga: o vão vira uma janela de 0,45 a 2,3 m
      faceSlab(q, r, w.face, w.at - 0.8, w.at + 0.8, 0, 0.45, -T, 0, spec.wall, false, wallX);
      faceSlab(q, r, w.face, w.at - 0.8, w.at + 0.8, 2.3, 2.7, -T, 0, spec.wall, true, wallX);
      windowsLater.push({ ...inner(q, r, w.face, w.at, -T / 2), area: id });
    }
    const [sx, sz] = qp(q, spawn[0], spawn[1]);
    zombieSpawns.push({ x: sx, z: sz, area: id });
  }
  // fileira de caixinhas coloridas numa prateleira (só enfeite)
  const goods = (q: Quad, u0: number, u1: number, y: number, v0: number, v1: number) => {
    const tints = [0xb84a3a, 0xd8c070, 0x4a7ab0, 0x6a9a5a, 0xe0d8c8, 0x8a4a8a];
    for (let u = u0; u < u1 - 0.3; u += rr(0.3, 0.5)) {
      qbox(q, u, u + rr(0.2, 0.32), y, y + rr(0.2, 0.42), v0, v1, 'plaster', false, { tint: tints[Math.floor(rnd() * tints.length)] });
    }
  };

  // ---------- chão e ruas ----------

  box(-9, -0.5, -HALF, 9, 0, HALF, 'asphalt', false);
  box(-HALF, -0.5, -9, -9, 0, 9, 'asphalt', false);
  box(9, -0.5, -9, HALF, 0, 9, 'asphalt', false);

  for (const q of [NW, NE, SW, SE]) {
    qbox(q, 9, HALF, -0.5, 0, 9, HALF, 'dirt', false);
    // calçadas (0,15 m; dá para subir sem pular)
    qbox(q, 6, 9, 0, 0.15, 6, HALF, 'sidewalk', true);
    qbox(q, 9, HALF, 0, 0.15, 6, 9, 'sidewalk', true);
    // muro dos fundos
    qbox(q, 47.6, 48, 0, 3.2, 9, 48, 'brickDark', true);
    qbox(q, 9, 47.6, 0, 3.2, 47.6, 48, 'brickDark', true);
    // silhuetas de prédios distantes, para a névoa parecer uma cidade maior
    for (let i = 0; i < 5; i++) {
      const u = rr(10, 60);
      const v = 52 + rr(0, 10);
      const w = rr(5, 12);
      qbox(q, u, u + w, 0, rr(7, 18), v, v + rr(5, 10), 'concrete', false, { tint: 0x6a625a });
      qbox(q, v, v + rr(5, 10), 0, rr(7, 18), u, u + w, 'concrete', false, { tint: 0x5c5650 });
    }
  }

  // faixas de pintura
  for (let p = -42; p <= 42; p += 6) {
    if (Math.abs(p) < 11) continue;
    box(-0.08, 0.002, p, 0.08, 0.012, p + 3, 'paintYellow', false);
    box(p, 0.002, -0.08, p + 3, 0.012, 0.08, 'paintYellow', false);
  }
  for (const s of [-1, 1]) {
    for (let a = -5.5; a <= 5.0; a += 1.1) {
      box(a, 0.002, s * 6.5, a + 0.55, 0.012, s * 8.6, 'paintWhite', false);
      box(s * 6.5, 0.002, a, s * 8.6, 0.012, a + 0.55, 'paintWhite', false);
    }
  }

  // ---------- fenda de lava no cruzamento ----------

  const crack: [number, number, number, number][] = [
    [-4.6, -1.6, -2.6, -0.4],
    [-3.0, -1.1, -0.9, 0.3],
    [-1.2, -0.6, 1.0, 0.8],
    [0.7, -0.1, 2.7, 1.2],
    [2.3, 0.5, 4.4, 1.6],
  ];
  for (const [x0, z0, x1, z1] of crack) {
    lava.push({ minX: x0, minZ: z0, maxX: x1, maxZ: z1 });
    box(x0, 0, z0, x1, 0.025, z1, 'lava', false);
  }
  for (let i = 0; i < 26; i++) {
    const t = rnd();
    const cx = -4.6 + t * 9;
    const cz = -1.0 + t * 2.4 + (rnd() < 0.5 ? -1 : 1) * rr(0.9, 1.6);
    const s = rr(0.5, 1.3);
    box(cx - s / 2, -0.08, cz - s / 2, cx + s / 2, rr(0.08, 0.22), cz + s / 2, 'asphalt', false, {
      rot: [rr(-0.25, 0.25), rr(0, Math.PI), rr(-0.25, 0.25)],
    });
  }
  lights.push({ pos: [0, 0.8, 0], color: 0xff5a14, intensity: 70, distance: 16, kind: 'lava' });

  // ---------- quarteirão NO: Banco ----------
  {
    const q = NW;
    building(q, {
      r: { u0: 9, u1: 25, v0: 9, v1: 25 },
      h: 7.2,
      floors: 2,
      wall: 'plaster',
      wallTint: 0xd8cbb0,
      trim: 'concrete',
      windows: ['u0', 'v0'],
      enter: {
        doors: [
          { face: 'u0', at: 17, w: 2.6 },
          { face: 'v0', at: 17, w: 2.6 },
        ],
        floor: 'tile',
        light: 0xffc890,
      },
      sign: { face: 'u0', text: 'BANCO', fg: '#efe3c4', bg: '#2a2620' },
    });
    qbox(q, 12, 22, 0.15, 1.15, 19, 20, 'woodDark');
    qbox(q, 11.9, 22.1, 1.15, 1.22, 18.9, 20.1, 'stone', false);
    qbox(q, 19.5, 24.65, 0.15, 3.4, 21.6, 24.65, 'metal');
    qbox(q, 20.6, 23.6, 0.6, 3.0, 21.48, 21.6, 'rust', false);
    qbox(q, 12, 14.2, 0.15, 0.95, 22.2, 23.4, 'wood');
    qbox(q, 15.5, 17.7, 0.15, 0.95, 22.2, 23.4, 'wood');
    for (const v of [14.9, 18.4]) qbox(q, 7.6, 8.3, 0.15, 6.8, v, v + 0.7, 'concrete', true, { tint: 0xd8d0c0 });
    rubble(-15, -18, 6, 3, ['plaster', 'wood']);

    // Hotel: saguão com recepção e sofás; a escada desaba no primeiro lance
    const hotel = { u0: 9, u1: 22, v0: 31, v1: 46 };
    interior(q, 'hotel', {
      r: hotel,
      h: 11,
      floors: 3,
      wall: 'brick',
      trim: 'concrete',
      windows: ['u0', 'v0', 'v1'],
      lit: 0.12,
      boarded: 0.25,
      sign: { face: 'u0', text: 'HOTEL', fg: '#f3e2b0', bg: '#3a1e18' },
    }, [{ face: 'u0', at: 38.5, w: 2.6 }], [{ face: 'v0', at: 14.8 }, { face: 'v0', at: 19.6 }, { face: 'u1', at: 41 }], 'floorWood', 0xffd8a0, [15, 38]);
    qbox(q, 11.2, 12.0, 0.15, 1.15, 32.6, 36.4, 'woodDark');
    qbox(q, 11.1, 12.1, 1.15, 1.22, 32.5, 36.5, 'stone', false);
    qbox(q, 9.35, 9.42, 1.4, 2.4, 33.2, 35.8, 'wood', false, { tint: 0x6a4a2e });
    for (let i = 0; i < 12; i++) qbox(q, 9.42, 9.45, 1.55 + Math.floor(i / 4) * 0.28, 1.65 + Math.floor(i / 4) * 0.28, 33.5 + (i % 4) * 0.6, 33.6 + (i % 4) * 0.6, 'metal', false, { tint: 0xc8a050 });
    qbox(q, 13, 20, 0.15, 0.17, 33.2, 40.5, 'awning', false, { tint: 0x6a2020 });
    qbox(q, 16.3, 18.6, 0.15, 0.6, 31.9, 32.8, 'carPaint', true, { tint: 0x5a1e1e });
    qbox(q, 16.3, 18.6, 0.6, 1.15, 31.4, 31.9, 'carPaint', false, { tint: 0x4a1818 });
    qbox(q, 16.7, 18.2, 0.15, 0.55, 33.7, 34.5, 'wood');
    for (const v of [32.2, 38.2]) qbox(q, 21.58, 21.65, 0.15, 2.4, v - 0.6, v + 0.6, 'woodDark', false);
    for (let i = 0; i < 4; i++) qbox(q, 13 + i, 21.65, 0.15, 0.45 + i * 0.3, 43.8, 45.65, 'woodDark');
    qbox(q, 13, 21.65, 1.35, 1.42, 43.6, 43.8, 'woodDark', false);
    // teto caído no alto da escada: não dá para subir
    qbox(q, 19.4, 21.65, 1.35, 3.4, 43.8, 45.65, 'plaster', true, { tint: 0x9a8a78 });
    qbox(q, 14.5, 21.6, 2.6, 2.8, 42.6, 45.6, 'ceiling', false, { rot: [0.32, 0, 0.12] });
    rubble(...qp(q, 18.5, 42.5), 7, 1.2, ['plaster', 'wood']);
    {
      const c = inner(q, hotel, 'u1', 35, 0.4);
      boxLater.push({ name: 'Hotel', ...c });
    }

    // Armazém: prateleiras de metal e caixotes
    const armazem = { u0: 31, u1: 46, v0: 9, v1: 22 };
    interior(q, 'armazem', {
      r: armazem,
      h: 6.5,
      wall: 'wood',
      wallTint: 0x9b7b5a,
      trim: 'woodDark',
      windows: ['v0', 'u0'],
      boarded: 0.5,
      sign: { face: 'v0', text: 'ARMAZÉM', fg: '#e9d9b8', bg: '#3b2a1c', at: 38.5, w: 5 },
    }, [{ face: 'v0', at: 38.5, w: 3 }], [{ face: 'u0', at: 15.5 }, { face: 'v1', at: 35 }, { face: 'v1', at: 42.5 }], 'concrete', 0xe8d0a0, [40, 17]);
    // estantes de metal (colisão numa caixa só; por fora, colunas, prateleiras e caixotes)
    for (const u of [33.4, 42.6]) {
      qbox(q, u - 0.5, u + 0.5, 0.15, 3.4, 11.5, 19.5, 'metal', true, { hidden: true });
      for (const v of [11.5, 15.5, 19.5]) {
        for (const s of [-1, 1]) qbox(q, u + s * 0.5 - 0.05, u + s * 0.5 + 0.05, 0.15, 3.4, v - 0.05, v + 0.05, 'metal', false, { tint: 0xd07a20 });
      }
      for (const y of [0.4, 1.4, 2.4, 3.3]) {
        qbox(q, u - 0.5, u + 0.5, y, y + 0.06, 11.5, 19.5, 'metal', false, { tint: 0x5a6a7a });
        if (y > 3) continue;
        for (let v = 11.7; v < 18.9; v += rr(0.95, 1.4)) qbox(q, u - 0.4, u + 0.4, y + 0.06, y + 0.06 + rr(0.45, 0.85), v, v + rr(0.6, 0.85), 'wood', false, { tint: 0x9a7a52 });
      }
    }
    const [x0, z0] = qp(q, 38, 18.5);
    crate(x0, z0, 1.2);
    crate(x0 + q.sx * 1.25, z0, 1.0);
    crate(x0 + q.sx * 0.5, z0, 0.9, 1.2);
    {
      const c = inner(q, armazem, 'u1', 15);
      wallBuy('lmg', c.x, c.z, c.nx, c.nz);
    }
    let [x, z] = qp(q, 34, 30);
    crate(x, z, 1.1);
    crate(x + q.sx * 1.15, z, 1.1);
    crate(x + q.sx * 0.5, z, 0.9, 1.1);
    [x, z] = qp(q, 28, 37);
    box(x - 1, 0, z - 0.6, x + 1, 1.3, z + 0.6, 'metal', true, { tint: 0x3d5a40 });
    [x, z] = qp(q, 38, 38);
    barrel(x, z, 'light');
    [x, z] = qp(q, 40, 27.5);
    car(x, z, true, 0, true);
    [x, z] = qp(q, 7.7, 12);
    barrel(x, z, 'none');
    for (const [u, v] of [[44, 44], [30, 44], [44, 26.5], [27.5, 28], [16, 28]] as [number, number][]) {
      addSpawn(q, u, v);
    }
  }

  // ---------- quarteirão NE: Bar ----------
  {
    const q = NE;
    building(q, {
      r: { u0: 9, u1: 25, v0: 9, v1: 25 },
      h: 6.4,
      floors: 1,
      wall: 'brickDark',
      trim: 'woodDark',
      windows: ['u0', 'v0'],
      enter: {
        doors: [
          { face: 'u0', at: 15, w: 2.4 },
          { face: 'v0', at: 20, w: 2.4 },
        ],
        floor: 'floorWood',
        light: 0xff9a50,
      },
      sign: { face: 'u0', text: 'BAR', fg: '#ff3b3b', bg: '#140808', glow: true, at: 15, w: 3 },
    });
    qbox(q, 19, 20, 0.15, 1.15, 12, 22.5, 'woodDark');
    qbox(q, 18.9, 20.1, 1.15, 1.22, 11.9, 22.6, 'wood', false);
    qbox(q, 23.6, 24.65, 0.15, 2.6, 12, 22.5, 'wood');
    for (const [u, v] of [[12.5, 11.4], [15.5, 22.6], [12.4, 21]] as [number, number][]) {
      qbox(q, u - 0.55, u + 0.55, 0.15, 0.9, v - 0.55, v + 0.55, 'wood');
    }
    qbox(q, 13.5, 16, 0.15, 0.9, 17.4, 18.8, 'woodDark');
    qbox(q, 13.6, 15.9, 0.9, 0.93, 17.5, 18.7, 'plaster', false, { tint: 0x1f5a2e });

    // Barbearia: três cadeiras diante do espelho e um banco de espera
    const barbearia = { u0: 9, u1: 22, v0: 31, v1: 46 };
    interior(q, 'barbearia', {
      r: barbearia,
      h: 5.2,
      wall: 'plaster',
      wallTint: 0x8aa3b5,
      trim: 'trim',
      windows: ['u0', 'v0', 'v1'],
      awning: { faces: ['u0'], tint: 0x7a2a2a },
      sign: { face: 'u0', text: 'BARBEARIA', fg: '#f0ece0', bg: '#4a1c1c' },
    }, [{ face: 'u0', at: 36, w: 1.8 }], [{ face: 'v0', at: 16 }, { face: 'u1', at: 40 }], 'tile', 0xfff0d8, [16, 39]);
    qbox(q, 10.5, 19.5, 1.2, 2.4, 45.6, 45.65, 'glass', false);
    qbox(q, 10.5, 19.5, 0.15, 0.95, 45.1, 45.65, 'woodDark');
    for (const u of [12, 15, 18]) {
      qbox(q, u - 0.4, u + 0.4, 0.15, 0.75, 43.4, 44.2, 'carPaint', true, { tint: 0x7a1a1a });
      qbox(q, u - 0.4, u + 0.4, 0.75, 1.5, 44.1, 44.3, 'carPaint', false, { tint: 0x6a1616 });
    }
    qbox(q, 20.9, 21.65, 0.15, 0.6, 32.5, 37.5, 'wood');
    for (const k of [0, 1, 2, 3]) qbox(q, 8.75, 8.85, 0.6 + k * 0.45, 0.8 + k * 0.45, 34.2, 34.4, 'neon', false, { tint: k % 2 ? 0xe8e8e8 : 0xc02020 });
    {
      const c = inner(q, barbearia, 'u0', 42);
      wallBuy('burstpistol', c.x, c.z, c.nx, c.nz);
    }

    // Oficina: carro no elevador, bancada e pneus; a porta é a de enrolar
    const oficina = { u0: 31, u1: 46, v0: 9, v1: 22 };
    interior(q, 'garagem', {
      r: oficina,
      h: 6.5,
      wall: 'metal',
      wallTint: 0x6d7270,
      trim: 'rust',
      windows: ['u0'],
      boarded: 0.3,
      sign: { face: 'v0', text: 'OFICINA', fg: '#f2c14e', bg: '#1d1d1d', at: 38, w: 5 },
    }, [{ face: 'v0', at: 38, w: 3.4 }], [{ face: 'u0', at: 15.5 }, { face: 'v1', at: 44.2 }], 'concrete', 0xd8e0ff, [41.5, 14], 'rust');
    qbox(q, 36.2, 39.8, 2.7, 3.5, 8.85, 9.0, 'rust', false);
    {
      const [cx, cz] = qp(q, 38.5, 16);
      car(cx, cz, false, 0x3a5a7a);
      for (const s of [-1, 1]) qbox(q, 38.5 + s * 1.5 - 0.12, 38.5 + s * 1.5 + 0.12, 0.15, 2.4, 13.4, 13.6, 'metal', true, { tint: 0xc8a020 });
    }
    qbox(q, 44.9, 45.65, 0.15, 1.0, 10.5, 13.5, 'woodDark');
    qbox(q, 44.9, 45.65, 0.15, 1.0, 16.5, 20.5, 'woodDark');
    qbox(q, 45.6, 45.65, 1.1, 2.4, 10.5, 13.5, 'wood', false, { tint: 0xb59a74 });
    for (const [u, v] of [[33, 20.5], [33.9, 20.5], [33.45, 19.6]] as [number, number][]) {
      const [tx, tz] = qp(q, u, v);
      box(tx - 0.4, 0.15, tz - 0.4, tx + 0.4, 1.1, tz + 0.4, 'tire', true);
    }
    {
      const c = inner(q, oficina, 'u1', 15);
      wallBuy('dmr', c.x, c.z, c.nx, c.nz);
    }
    let [x, z] = qp(q, 34, 36);
    barrel(x, z, 'light');
    qbox(q, 40, 46, 0, 3, 40, 46, 'wood', true, { tint: 0x8a6a4a });
    qbox(q, 39.6, 46.4, 3, 3.25, 39.6, 46.4, 'roof', false);
    for (const [u, v] of [[29, 34], [30, 34.4], [29.5, 35.4]] as [number, number][]) {
      [x, z] = qp(q, u, v);
      box(x - 0.4, 0, z - 0.4, x + 0.4, 1.0, z + 0.4, 'tire', true);
    }
    qbox(q, 36, 39, 0, 0.9, 27, 27.8, 'sandbag');
    [x, z] = qp(q, 7.7, 12);
    barrel(x, z, 'light');
    for (const [u, v] of [[44, 30], [32, 44], [27.5, 28], [44, 38], [15, 28]] as [number, number][]) {
      addSpawn(q, u, v);
    }
  }

  // ---------- quarteirão SO: Mercearia e Cinema ----------
  {
    const q = SW;
    // Mercearia: corredores de prateleiras, caixa perto da porta e geladeiras no fundo
    const mercearia = { u0: 9, u1: 25, v0: 9, v1: 25 };
    interior(q, 'mercearia', {
      r: mercearia,
      h: 5.6,
      floors: 1,
      wall: 'brick',
      trim: 'trim',
      windows: ['u0', 'v0'],
      lit: 0.3,
      awning: { faces: ['u0', 'v0'], tint: 0x2f5d3a },
      sign: { face: 'u0', text: 'MERCEARIA', fg: '#f4ead2', bg: '#24402c' },
    }, [{ face: 'u0', at: 17, w: 1.8 }, { face: 'v0', at: 15, w: 1.8 }], [{ face: 'u1', at: 14 }, { face: 'v1', at: 19 }], 'tile', 0xf0ffe0, [19, 21.5]);
    for (const v of [14.5, 19.2]) {
      qbox(q, 13, 20, 0.15, 2.0, v, v + 0.8, 'wood', true, { tint: 0x8a6a48 });
      for (const y of [0.55, 1.05, 1.55, 2.0]) {
        goods(q, 13.1, 19.9, y, v - 0.02, v + 0.25);
        goods(q, 13.1, 19.9, y, v + 0.55, v + 0.82);
      }
    }
    qbox(q, 10.5, 11.3, 0.15, 1.0, 11, 14, 'woodDark');
    qbox(q, 10.6, 11.2, 1.0, 1.35, 12, 12.7, 'metal', false, { tint: 0x2a2a2a });
    qbox(q, 10, 16, 0.15, 2.2, 24.0, 24.65, 'metal', true, { tint: 0xd8dcd8 });
    qbox(q, 10.1, 15.9, 0.4, 2.0, 23.97, 24.0, 'glassLit', false);
    {
      const c = inner(q, mercearia, 'u1', 20.5);
      wallBuy('revolver', c.x, c.z, c.nx, c.nz);
    }

    // Cinema: poltronas viradas para o palco e a tela acesa
    const cinema = { u0: 9, u1: 22, v0: 31, v1: 46 };
    interior(q, 'cinema', {
      r: cinema,
      h: 9.5,
      floors: 2,
      wall: 'plaster',
      wallTint: 0xc9b48f,
      trim: 'trim',
      windows: ['u0', 'v0'],
      sign: { face: 'u0', text: 'CINEMA', fg: '#ffd27a', bg: '#3b0d0d', glow: true, w: 7 },
    }, [{ face: 'u0', at: 38.5, w: 3 }], [{ face: 'v0', at: 10.6 }, { face: 'u1', at: 36 }, { face: 'u1', at: 43 }], 'floorWood', 0xff9a70, [18.6, 38.5]);
    qbox(q, 7.0, 9, 3.0, 3.22, 34, 43, 'metal', false);
    qbox(q, 19.6, 21.65, 0.15, 0.55, 31.35, 45.65, 'woodDark');
    qbox(q, 21.55, 21.65, 3.0, 7.6, 32.6, 44.4, 'glassLit', false, { tint: 0xb8c8e8 });
    for (const [v0, v1] of [[31.4, 32.6], [44.4, 45.6]]) qbox(q, 21.2, 21.6, 0.55, 8.2, v0, v1, 'awning', false, { tint: 0x7a1414 });
    for (const u of [12.4, 14.0, 15.6, 17.2]) {
      for (const [v0, v1] of [[32.2, 37.6], [39.4, 44.8]]) {
        qbox(q, u - 0.3, u + 0.3, 0.15, 0.6, v0, v1, 'carPaint', true, { tint: 0x6a1a1a });
        qbox(q, u - 0.38, u - 0.26, 0.6, 1.1, v0, v1, 'carPaint', false, { tint: 0x581414 });
      }
    }
    {
      const c = inner(q, cinema, 'v1', 10.8, 0.4);
      boxLater.push({ name: 'Cinema', ...c });
    }

    // Farmácia: balcão de vidro e prateleiras de remédio
    const farmacia = { u0: 31, u1: 46, v0: 9, v1: 22 };
    interior(q, 'farmacia', {
      r: farmacia,
      h: 5,
      wall: 'plaster',
      wallTint: 0x9db59a,
      trim: 'trim',
      windows: ['v0', 'u0'],
      sign: { face: 'v0', text: 'FARMÁCIA', fg: '#e8fff0', bg: '#1d5b3a', at: 38, w: 5 },
    }, [{ face: 'v0', at: 38, w: 1.8 }], [{ face: 'u0', at: 15.5 }, { face: 'v1', at: 43.5 }], 'tile', 0xe8fff0, [36, 18.5]);
    qbox(q, 34, 43, 0.15, 1.0, 15.5, 16.3, 'woodDark');
    qbox(q, 34, 43, 1.0, 1.05, 15.45, 16.35, 'glass', false);
    qbox(q, 33, 42, 0.15, 2.4, 21.1, 21.65, 'wood', true, { tint: 0xd8d0c0 });
    for (const y of [0.6, 1.2, 1.8]) goods(q, 33.1, 41.9, y, 21.12, 21.4);
    qbox(q, 31.4, 34, 0.15, 2.2, 9.4, 10.0, 'wood', true, { tint: 0xd8d0c0 });
    {
      const c = inner(q, farmacia, 'u1', 13);
      wallBuy('machinepistol', c.x, c.z, c.nx, c.nz);
    }
    let [x, z] = qp(q, 37, 28);
    car(x, z, true, 0, true);
    [x, z] = qp(q, 30, 40);
    barrel(x, z, 'fx');
    [x, z] = qp(q, 42, 36);
    crate(x, z, 1.2);
    crate(x + q.sx * 0.2, z + q.sz * 1.3, 1.0);
    rubble(...qp(q, 35, 42), 10, 3, ['brick', 'concrete', 'wood']);
    [x, z] = qp(q, 7.7, 12);
    barrel(x, z, 'light');
    for (const [u, v] of [[44, 44], [28, 42], [44, 26.5], [36, 35], [15.5, 28]] as [number, number][]) {
      addSpawn(q, u, v);
    }
  }

  // ---------- quarteirão SE: Correio, Lanchonete, Igreja e cemitério ----------
  {
    const q = SE;
    // Correio: balcão comprido, caixas postais e a mesa de separar cartas
    const correio = { u0: 9, u1: 25, v0: 9, v1: 25 };
    interior(q, 'correio', {
      r: correio,
      h: 7.5,
      floors: 2,
      wall: 'concrete',
      wallTint: 0xb8b2a6,
      trim: 'stone',
      windows: ['u0', 'v0'],
      boarded: 0.35,
      sign: { face: 'u0', text: 'CORREIO', fg: '#e9e4d4', bg: '#26324a' },
    }, [{ face: 'u0', at: 17, w: 2 }, { face: 'v0', at: 17, w: 1.8 }], [{ face: 'u1', at: 13 }, { face: 'u1', at: 21 }, { face: 'v1', at: 14 }], 'tile', 0xe0e8ff, [19, 20]);
    qbox(q, 13, 13.8, 0.15, 1.1, 11, 21, 'woodDark');
    qbox(q, 12.9, 13.9, 1.1, 1.17, 10.9, 21.1, 'stone', false);
    qbox(q, 16, 23, 0.6, 2.6, 24.4, 24.65, 'metal', false, { tint: 0x8a7a4a });
    for (let u = 16.2; u < 22.9; u += 0.5) qbox(q, u, u + 0.04, 0.6, 2.6, 24.36, 24.4, 'metal', false, { tint: 0x4a4030 });
    qbox(q, 17, 21, 0.15, 0.95, 15, 17, 'wood');
    for (const [u, v] of [[17.6, 15.5], [19.2, 16.4], [20.3, 15.4]] as [number, number][]) qbox(q, u, u + 0.5, 0.95, 1.2, v, v + 0.35, 'plaster', false, { tint: 0xc8b48a });
    for (const [u, v] of [[22.8, 11], [23.6, 11.4], [23.2, 12.3]] as [number, number][]) qbox(q, u, u + 0.7, 0.15, 0.75, v, v + 0.6, 'sandbag', true, { tint: 0xa89870 });
    {
      const c = inner(q, correio, 'u1', 17);
      wallBuy('autoshotgun', c.x, c.z, c.nx, c.nz);
    }

    // Lanchonete: balcão com banquinhos, cozinha atrás e mesas na janela
    const lanchonete = { u0: 9, u1: 21, v0: 31, v1: 45 };
    interior(q, 'lanchonete', {
      r: lanchonete,
      h: 4.6,
      floors: 1,
      wall: 'metal',
      wallTint: 0xa9b3b8,
      trim: 'trim',
      windows: ['u0', 'v0', 'v1'],
      lit: 0.6,
      sign: { face: 'u0', text: 'LANCHONETE', fg: '#7ff7ff', bg: '#0b1e26', glow: true },
    }, [{ face: 'u0', at: 38, w: 1.8 }], [{ face: 'v0', at: 15 }, { face: 'u1', at: 41.5 }], 'tile', 0xd0fff8, [17, 37]);
    qbox(q, 11, 18, 0.15, 1.05, 42.2, 43.0, 'carPaint', true, { tint: 0xb8c0c4 });
    qbox(q, 10.9, 18.1, 1.05, 1.12, 42.1, 43.1, 'stone', false, { tint: 0xd8d0c0 });
    for (let u = 11.6; u < 17.8; u += 1.2) qbox(q, u - 0.18, u + 0.18, 0.15, 0.75, 41.3, 41.66, 'metal', false, { tint: 0xa02020 });
    qbox(q, 11, 15, 0.15, 0.95, 44.0, 44.65, 'metal', true, { tint: 0x5a5a5a });
    qbox(q, 15.2, 18, 0.15, 1.9, 44.0, 44.65, 'metal', true, { tint: 0xd8dcd8 });
    for (const u of [12, 18]) {
      qbox(q, u - 0.6, u + 0.6, 0.15, 0.85, 31.6, 32.6, 'stone', true, { tint: 0xd8d0c0 });
      for (const v of [31.45, 32.75]) qbox(q, u - 0.6, u + 0.6, 0.15, 0.5, v - 0.05, v + 0.25, 'carPaint', false, { tint: 0x2a8a8a });
    }
    {
      const c = inner(q, lanchonete, 'u1', 35, 0.4);
      boxLater.push({ name: 'Lanchonete', ...c });
    }

    // Igreja: entra-se pela torre do sino; bancos, altar e a cruz no fundo
    const igreja = { u0: 32, u1: 44, v0: 10, v1: 22 };
    interior(q, 'igreja', {
      r: igreja,
      h: 9,
      floors: 1,
      wall: 'plaster',
      wallTint: 0xd6d0c4,
      trim: 'stone',
      windows: ['u0', 'u1'],
    }, [{ face: 'v0', at: 38, w: 2 }], [{ face: 'u0', at: 12 }, { face: 'u1', at: 12.5 }], 'stone', 0xffd8a8, [38, 17.9]);
    // torre oca: frente com a porta, laterais e um arco para a nave
    const tw = { plaster: 'plaster' as MaterialId, tint: { tint: 0xcfc8bb } };
    qbox(q, 35.5, 37.0, 0, 15, 9.6, 9.95, tw.plaster, true, tw.tint);
    qbox(q, 39.0, 40.5, 0, 15, 9.6, 9.95, tw.plaster, true, tw.tint);
    qbox(q, 37.0, 39.0, 3.2, 15, 9.6, 9.95, tw.plaster, true, tw.tint);
    qbox(q, 35.5, 35.85, 0, 15, 9.95, 14.6, tw.plaster, true, tw.tint);
    qbox(q, 40.15, 40.5, 0, 15, 9.95, 14.6, tw.plaster, true, tw.tint);
    qbox(q, 35.85, 36.6, 0, 15, 14.25, 14.6, tw.plaster, true, tw.tint);
    qbox(q, 39.4, 40.15, 0, 15, 14.25, 14.6, tw.plaster, true, tw.tint);
    qbox(q, 36.6, 39.4, 3.4, 15, 14.25, 14.6, tw.plaster, true, tw.tint);
    qbox(q, 35.85, 40.15, 4.4, 4.6, 9.95, 14.25, 'ceiling', false);
    qbox(q, 35.3, 40.7, 14.6, 15.2, 9.4, 14.8, 'stone', false);
    qbox(q, 36.2, 39.8, 15.2, 17.2, 10.3, 13.9, 'roof', false);
    qbox(q, 37.0, 39.0, 17.2, 19.6, 11.1, 13.1, 'roof', false);
    qbox(q, 37.9, 38.1, 19.6, 21.2, 12.0, 12.2, 'metal', false);
    qbox(q, 37.4, 38.6, 20.4, 20.6, 12.0, 12.2, 'metal', false);
    qbox(q, 37.0, 39.0, 0, 3.2, 9.48, 9.6, 'woodDark', false, { door: 'igreja' });
    qbox(q, 37.2, 38.8, 9, 11.5, 9.5, 9.6, 'glassLit', false);
    for (const v of [15.6, 17.0, 18.4]) {
      for (const [u0, u1] of [[32.9, 37.0], [39.0, 43.1]]) {
        qbox(q, u0, u1, 0.15, 0.6, v - 0.25, v + 0.25, 'wood', true, { tint: 0x6a4a30 });
        qbox(q, u0, u1, 0.6, 1.15, v + 0.2, v + 0.3, 'wood', false, { tint: 0x5a3e28 });
      }
    }
    qbox(q, 34.5, 41.5, 0.15, 0.5, 19.9, 21.65, 'stone', true, { tint: 0xb8b0a0 });
    qbox(q, 37, 39, 0.5, 1.45, 20.6, 21.2, 'stone', true, { tint: 0xe0d8c8 });
    qbox(q, 36.9, 39.1, 1.45, 1.5, 20.5, 21.3, 'awning', false, { tint: 0x8a1a1a });
    qbox(q, 37.9, 38.1, 2.4, 5.6, 21.6, 21.65, 'woodDark', false);
    qbox(q, 37.1, 38.9, 4.4, 4.6, 21.6, 21.65, 'woodDark', false);
    // velas pretas do ritual no altar: só pegam fogo depois que a Forja acende (e chamam o Bispo)
    for (let i = 0; i < 3; i++) {
      const [cx, cz] = qp(q, 37.3 + i * 0.7, 20.9);
      box(cx - 0.045, 1.5, cz - 0.045, cx + 0.045, 1.8, cz + 0.045, 'trim', false, { tint: 0x141012 });
      ritualCandles.push([cx, 1.82, cz]);
      const [ux, uz] = qp(q, 37.3 + i * 0.7, 19.3);
      interactables.push({ id: 'ritual-' + i, kind: 'ritual', candle: i, use: [ux, uz], y: 0.15 });
    }
    {
      const c = inner(q, igreja, 'u1', 19.5);
      wallBuy('sniper', c.x, c.z, c.nx, c.nz);
    }

    // cemitério nos fundos
    for (let u = 30; u <= 45; u += 2.5) {
      for (let v = 27; v <= 41; v += 2.8) {
        if (rnd() < 0.2) continue;
        const [gx, gz] = qp(q, u + rr(-0.3, 0.3), v + rr(-0.3, 0.3));
        if (rnd() < 0.65) {
          box(gx - 0.35, 0, gz - 0.1, gx + 0.35, rr(0.75, 1.05), gz + 0.1, 'stone', true);
        } else {
          box(gx - 0.35, -0.2, gz - 0.1, gx + 0.35, rr(0.6, 0.9), gz + 0.1, 'stone', false, {
            rot: [rr(-0.35, 0.35), rr(-0.3, 0.3), rr(-0.25, 0.25)],
          });
        }
        box(gx - 0.4, 0, gz + q.sz * 0.15, gx + 0.4, 0.07, gz + q.sz * 1.4, 'dirt', false, { tint: 0x5a4632 });
      }
    }
    let [x, z] = qp(q, 28, 44);
    box(x - 0.25, 0, z - 0.25, x + 0.25, 4.5, z + 0.25, 'woodDark', true);
    for (let i = 0; i < 4; i++) {
      const a = rr(0, Math.PI * 2);
      box(x - 0.08, 3 + i * 0.4, z - 1.1, x + 0.08, 3.2 + i * 0.4, z + 1.1, 'woodDark', false, {
        rot: [rr(-0.7, 0.7), a, rr(-0.5, 0.5)],
      });
    }
    for (const [u, v] of [[34, 30], [40, 34], [44, 40], [30, 44], [38, 45], [27.5, 28]] as [number, number][]) {
      addSpawn(q, u, v);
    }
  }

  // ---------- postes de luz ----------
  for (const q of [NW, NE, SW, SE]) {
    const [ax, az] = qp(q, 7.7, 34);
    lamp(ax, az, -q.sx, 0, q === NE ? 'lit' : q === SW ? 'broken' : 'dim');
    const [bx, bz] = qp(q, 34, 7.7);
    lamp(bx, bz, 0, -q.sz, q === SE ? 'broken' : 'dim');
  }

  // ---------- carros na rua ----------
  car(-3.4, -22, false, 0x7a1f1a);
  car(3.6, 22, false, 0, true);
  fires.push([3.6, 1.65, 21.2]);
  lights.push({ pos: [3.6, 2.4, 21.2], color: 0xff7a2a, intensity: 35, distance: 16, kind: 'fire' });
  car(-20, 3.3, true, 0x2a4a6a);
  car(24, -3.4, true, 0xb9ab8a);
  car(-36, -3.3, true, 0, true);
  car(3.5, -34, false, 0x4a5a3a);

  // ---------- barricadas nas pontas das ruas, cada uma com uma entrada de zumbis ----------


  // norte: caminhão tombado, com o vão entre a carroceria e a cabine
  box(-8.6, 0, -45.6, 1.5, 3.0, -42.8, 'rust');
  box(3.3, 0, -45.4, 8.8, 2.5, -43.0, 'carPaint', true, { tint: 0x5a2420 });
  box(4.4, 1.2, -45.45, 7.0, 2.2, -42.95, 'glass', false);
  zombieEntry(2.4, -43.0, 0, 1);
  rubble(-3, -41.6, 8, 3, ['concrete', 'rust']);
  // sul: sacos de areia e barreiras de concreto
  box(-8.8, 0, 43, -0.95, 1.7, 44.2, 'sandbag');
  box(0.95, 0, 43, 8.8, 1.7, 44.2, 'sandbag');
  for (const x of [-8, -4.8, 2.0, 5.2]) box(x, 0, 41.6, x + 2.8, 1.0, 42.3, 'concrete', true, { tint: 0xc8c2b4 });
  zombieEntry(0, 43.6, 0, -1);
  rubble(-5, 44.8, 6, 3, ['sandbag', 'wood']);
  // leste: ônibus destruído
  box(42.2, 0.3, -7.2, 44.9, 3.3, 3.3, 'carPaint', true, { tint: 0x8a6a22 });
  box(42.15, 1.9, -6.6, 44.95, 2.7, 2.7, 'glass', false);
  for (const zz of [-5, 2.4]) {
    box(42.0, 0, zz - 0.4, 42.3, 0.8, zz + 0.4, 'tire', false);
    box(44.8, 0, zz - 0.4, 45.1, 0.8, zz + 0.4, 'tire', false);
  }
  box(42.2, 0, 5.1, 44.9, 1.6, 8.9, 'sandbag');
  box(42.2, 0, -8.9, 44.9, 1.6, -7.2, 'sandbag');
  zombieEntry(43.55, 4.2, -1, 0);
  // oeste: barreiras e caminhonete
  box(-44.9, 0, -8.9, -42.3, 1.7, -1.0, 'sandbag');
  box(-44.9, 0, 0.6, -42.3, 1.7, 8.9, 'sandbag');
  zombieEntry(-43.6, -0.2, 1, 0);
  // janelas dos prédios (depois das ruas, para as entradas das ruas manterem os números 0 a 3)
  for (const w of windowsLater) zombieEntry(w.x, w.z, w.nx, w.nz, 1.6, w.area);
  car(-40.5, -4.5, false, 0x34302c);
  rubble(-41, 4, 8, 2.5, ['concrete', 'brick']);

  // ---------- máquinas de bebida e caixotes de munição ----------




  machine('couraca', 8.4, -21.5, -1, 0);
  machine('folego', 21.5, -24.25, 0, 1);
  machine('reflexo', 47.2, -33, -1, 0);
  machine('gatilho', -47.2, 31, 1, 0);
  machine('passo', -40, 47.2, 0, -1);
  machine('mula', 32.8, 9.6, 0, -1);

  ammoCrate(8.3, 18.5, -1, 0);

  // ---------- armas de parede (desenho a giz), granadas e faca pesada ----------

  wallBuy('carbine', 9, 12.2, -1, 0, 1.75);
  wallBuy('doublebarrel', -9, 21.8, 1, 0, 1.75);
  wallBuy('smg', 13, -24.65, 0, 1);
  wallBuy('rifle', -24.65, -13, 1, 0);
  wallBuy('pump', 36, -22, 0, -1);

  // bancada de miras encostada na Oficina, ao lado da escopeta de repetição (parede em z = -22)
  {
    const x0 = 38.2, x1 = 41.4, zw = -22, zf = -22.85;
    box(x0, 0, zf, x1, 0.88, zw, 'woodDark', true);
    box(x0 - 0.05, 0.88, zf - 0.05, x1 + 0.05, 0.94, zw, 'metal', false, { tint: 0x8a8f94 });
    // painel de ferramentas na parede
    box(x0 + 0.1, 1.1, zw - 0.04, x1 - 0.1, 2.35, zw, 'wood', false, { tint: 0xb59a74 });
    // morsa no canto
    box(x1 - 0.42, 0.94, zf + 0.1, x1 - 0.12, 1.08, zf + 0.34, 'metal', false, { tint: 0x3a4a5a });
    // em exposição: ponto vermelho (esquerda) e luneta (direita)
    const xr = x0 + 0.8, xs = x1 - 1.1, zc = zf + 0.42;
    box(xr - 0.08, 0.94, zc - 0.07, xr + 0.08, 1.06, zc + 0.07, 'metal', false, { tint: 0x1c1c1c });
    box(xr - 0.035, 1.0, zc - 0.075, xr + 0.035, 1.04, zc - 0.07, 'neon', false, { tint: 0xff2a1a });
    box(xs - 0.22, 1.0, zc - 0.04, xs + 0.22, 1.08, zc + 0.04, 'metal', false, { tint: 0x1c1c1c });
    box(xs - 0.26, 0.98, zc - 0.055, xs - 0.18, 1.1, zc + 0.055, 'metal', false, { tint: 0x1c1c1c });
    box(xs + 0.18, 0.98, zc - 0.055, xs + 0.26, 1.1, zc + 0.055, 'metal', false, { tint: 0x1c1c1c });
    box(xs - 0.06, 0.94, zc - 0.02, xs + 0.06, 1.0, zc + 0.02, 'metal', false, { tint: 0x3a3a3a });
    signs.push({ pos: [xr, 1.75, zw - 0.06], w: 1.3, h: 0.34, normal: [0, -1], text: `${SIGHTS.red.name} · ${SIGHTS.red.cost}`, fg: '#f2c14e', bg: '#1d1d1d' });
    signs.push({ pos: [xs, 1.75, zw - 0.06], w: 1.3, h: 0.34, normal: [0, -1], text: `${SIGHTS.scope.name} · ${SIGHTS.scope.cost}`, fg: '#f2c14e', bg: '#1d1d1d' });
    signs.push({ pos: [(x0 + x1) / 2, 2.2, zw - 0.06], w: 1.6, h: 0.3, normal: [0, -1], text: 'MIRAS', fg: '#f3e6c4', bg: '#3b3226' });
    lights.push({ pos: [(x0 + x1) / 2, 2.4, zf - 0.4], color: 0xffd9a0, intensity: 3, distance: 5, kind: 'machine' });
    interactables.push({ id: 'sight-red', kind: 'sight', sight: 'red', use: [xr, zf - 0.7], y: 0 });
    interactables.push({ id: 'sight-scope', kind: 'sight', sight: 'scope', use: [xs, zf - 0.7], y: 0 });
  }
  wallBuy('knife', 38, 22, 0, 1);
  // fundos da Farmácia, de frente para o Quintal Sudoeste
  wallBuy('burstrifle', -38, 22, 0, 1);
  // banca de jornal das granadas, na calçada ao lado do Banco
  box(-8.4, 0, -23.7, -7.0, 2.1, -22.3, 'wood', true, { tint: 0x3f5a3a });
  box(-8.55, 2.1, -23.85, -6.85, 2.25, -22.15, 'metal', false, { tint: 0x2a3a28 });
  signs.push({ pos: [-6.98, 1.85, -23], w: 1.2, h: 0.3, normal: [1, 0], text: 'JORNAIS', fg: '#f3e6c4', bg: '#22301e' });
  wallBuy('grenade', -7.0, -23, 1, 0, 1.0);
  ammoCrate(40, -30, 0, 1);
  ammoCrate(27.5, 36, -1, 0);

  // ---------- portas e entulhos que abrem áreas ----------




  doors.push(
    { id: 'banco', name: 'Banco', cost: 750, kind: 'door' },
    { id: 'bar', name: 'Bar', cost: 750, kind: 'door' },
    { id: 'q-no', name: 'Quintal Noroeste', cost: 1000, kind: 'debris' },
    { id: 'q-ne', name: 'Pátio da Oficina', cost: 1000, kind: 'debris' },
    { id: 'q-so', name: 'Quintal Sudoeste', cost: 1000, kind: 'debris' },
    { id: 'cemiterio', name: 'Cemitério', cost: 1250, kind: 'debris' },
    // prédios em que se entra (cada um com a sua porta para a rua)
    { id: 'hotel', name: 'Hotel', cost: 1000, kind: 'door' },
    { id: 'armazem', name: 'Armazém', cost: 1000, kind: 'door' },
    { id: 'barbearia', name: 'Barbearia', cost: 750, kind: 'door' },
    { id: 'garagem', name: 'Oficina', cost: 1000, kind: 'door' },
    { id: 'mercearia', name: 'Mercearia', cost: 750, kind: 'door' },
    { id: 'cinema', name: 'Cinema', cost: 1250, kind: 'door' },
    { id: 'farmacia', name: 'Farmácia', cost: 750, kind: 'door' },
    { id: 'correio', name: 'Correio', cost: 1000, kind: 'door' },
    { id: 'lanchonete', name: 'Lanchonete', cost: 750, kind: 'door' },
    { id: 'igreja', name: 'Igreja', cost: 1250, kind: 'door' },
  );
  // Banco (NO): portas para a rua principal e para a transversal
  woodDoor(NW, 'banco', 9.0, 9.35, 15.7, 18.3, 8.1, 17);
  woodDoor(NW, 'banco', 15.7, 18.3, 9.0, 9.35, 17, 8.1);
  // Bar (NE)
  woodDoor(NE, 'bar', 9.0, 9.35, 13.8, 16.2, 8.1, 15);
  woodDoor(NE, 'bar', 18.8, 21.2, 9.0, 9.35, 20, 8.1);
  // becos dos quintais: um entulho em cada boca (abrem juntos)
  for (const [q, id] of [[NW, 'q-no'], [NE, 'q-ne'], [SW, 'q-so'], [SE, 'cemiterio']] as [Quad, string][]) {
    debris(q, id, 9.3, 10.4, 25, 31, 'u0');
    debris(q, id, 25, q === SE ? 32 : 31, 9.3, 10.4, 'v0');
  }

  boxSpot('Banco', -24.3, -17, 1, 0);
  boxSpot('Quintal Noroeste', -47.25, -36, 1, 0);
  boxSpot('Bar', 9.7, -20.8, 1, 0);
  boxSpot('Igreja', 34.5, 22.35, 0, 1);
  for (const b of boxLater) boxSpot(b.name, b.x, b.z, b.nx, b.nz);

  // ---------- guichês do Banco (depositar e sacar pontos entre partidas) ----------
  for (const [u, label, kind] of [[14, 'DEPÓSITO', 'deposit'], [20, 'SAQUE', 'withdraw']] as [number, string, 'deposit' | 'withdraw'][]) {
    qbox(NW, u - 1, u + 1, 1.22, 2.2, 19.9, 20, 'woodDark', false);
    const [x, z] = qp(NW, u, 19.86);
    signs.push({ pos: [x, 1.85, z], w: 1.6, h: 0.42, normal: [0, 1], text: label, fg: '#efe3c4', bg: '#22301e' });
    const [ux, uz] = qp(NW, u, 18.2);
    interactables.push({ id: `bank-${kind}`, kind: 'bank', bank: kind, use: [ux, uz], y: 0.15 });
  }

  // ---------- Forja (fundos da Igreja) e as velas do ritual ----------
  box(43.0, 0, 23.0, 44.6, 1.8, 25.4, 'brickDark', true);
  box(42.9, 1.8, 22.9, 44.7, 2.0, 25.5, 'stone', false);
  box(43.5, 2.0, 23.6, 44.3, 4.6, 24.4, 'brickDark', true);
  box(42.1, 0, 23.85, 42.7, 0.45, 24.55, 'metal', true, { tint: 0x2a2a2a });
  box(41.95, 0.45, 23.75, 42.85, 0.72, 24.65, 'metal', true, { tint: 0x3a3a3a });
  signs.push({ pos: [42.97, 1.55, 24.2], w: 1.1, h: 0.3, normal: [-1, 0], text: 'FORJA', fg: '#f3c27a', bg: '#1e1410' });
  interactables.push({ id: 'forge', kind: 'forge', use: [41.3, 24.2], y: 0 });
  const candles: Vec3[] = [[31.2, 0, 26], [39.0, 0, 26], [46.6, 0, 36]];
  candles.forEach((c, i) => {
    box(c[0] - 0.15, 0, c[2] - 0.15, c[0] + 0.15, 0.12, c[2] + 0.15, 'stone', false);
    box(c[0] - 0.05, 0.12, c[2] - 0.05, c[0] + 0.05, 0.38, c[2] + 0.05, 'trim', false, { tint: 0xe8e0cc });
    interactables.push({ id: `candle-${i}`, kind: 'candle', candle: i, use: [c[0], c[2]], y: 0 });
  });

  // ---------- limites invisíveis ----------
  box(-HALF - 1, 0, -HALF - 1, HALF + 1, 30, -HALF, 'concrete', true, { hidden: true });
  box(-HALF - 1, 0, HALF, HALF + 1, 30, HALF + 1, 'concrete', true, { hidden: true });
  box(-HALF - 1, 0, -HALF, -HALF, 30, HALF, 'concrete', true, { hidden: true });
  box(HALF, 0, -HALF, HALF + 1, 30, HALF, 'concrete', true, { hidden: true });

  // spawn de zumbis nas pontas das ruas

  return {
    id: 'cidade',
    name: 'Cidade',
    bounds: { minX: -HALF, minZ: -HALF, maxX: HALF, maxZ: HALF },
    blocks,
    lights,
    signs,
    fires,
    lava,
    playerSpawns: [
      [-3, 11.5],
      [3, 11.5],
      [-3, -11.5],
      [3, -11.5],
    ],
    zombieSpawns,
    interactables,
    entries,
    doors,
    boxSpots,
    forge: {
      anvil: [42.4, 0.72, 24.2],
      mouth: [42.98, 0.9, 24.2],
      mouthNormal: [-1, 0],
      candles: [[31.2, 0.38, 26], [39.0, 0.38, 26], [46.6, 0.38, 36]],
    },
    // o Bispo sobe da fenda de lava do cruzamento; ao trocar de fase reaparece numa das ruas
    ritual: { candles: ritualCandles, arena: [[0, 0], [0, -30], [0, 30], [-30, 0], [30, 0]] },
  };
}
