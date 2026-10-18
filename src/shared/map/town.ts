import { SIGHTS } from '../weapons';
import { createBuilder, type Quad } from './builder';
import type { MapDef, Vec3 } from './types';

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
  const { box, qbox, qp, building, car, lamp, barrel, crate, rubble, zombieEntry, machine, ammoCrate, wallBuy, woodDoor, debris, boxSpot } = B;
  // cada quarteirão tem uma área atrás dos becos; os zumbis só surgem nela depois que ela abre
  const areaOf = (q: Quad) => (q === NW ? 'q-no' : q === NE ? 'q-ne' : q === SW ? 'q-so' : 'cemiterio');
  const addSpawn = (q: Quad, u: number, v: number) => {
    const [x, z] = qp(q, u, v);
    zombieSpawns.push({ x, z, area: areaOf(q) });
  };



  // ---------- helpers em coordenadas de quarteirão ----------








  // ---------- adereços em coordenadas de mundo ----------






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

    building(q, {
      r: { u0: 9, u1: 22, v0: 31, v1: 46 },
      h: 11,
      floors: 3,
      wall: 'brick',
      trim: 'concrete',
      windows: ['u0', 'v0', 'v1'],
      lit: 0.12,
      boarded: 0.25,
      decoDoors: [{ face: 'u0', at: 38.5, w: 1.6 }],
      sign: { face: 'u0', text: 'HOTEL', fg: '#f3e2b0', bg: '#3a1e18' },
    });
    building(q, {
      r: { u0: 31, u1: 46, v0: 9, v1: 22 },
      h: 6.5,
      wall: 'wood',
      wallTint: 0x9b7b5a,
      trim: 'woodDark',
      windows: ['v0', 'u0'],
      boarded: 0.5,
      decoDoors: [{ face: 'v0', at: 38.5, w: 3 }],
      sign: { face: 'v0', text: 'ARMAZÉM', fg: '#e9d9b8', bg: '#3b2a1c', at: 38.5, w: 5 },
    });
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

    building(q, {
      r: { u0: 9, u1: 22, v0: 31, v1: 46 },
      h: 5.2,
      wall: 'plaster',
      wallTint: 0x8aa3b5,
      trim: 'trim',
      windows: ['u0', 'v0', 'v1'],
      decoDoors: [{ face: 'u0', at: 36, w: 1.4 }],
      awning: { faces: ['u0'], tint: 0x7a2a2a },
      sign: { face: 'u0', text: 'BARBEARIA', fg: '#f0ece0', bg: '#4a1c1c' },
    });
    building(q, {
      r: { u0: 31, u1: 46, v0: 9, v1: 22 },
      h: 6.5,
      wall: 'metal',
      wallTint: 0x6d7270,
      trim: 'rust',
      windows: ['u0'],
      boarded: 0.3,
      sign: { face: 'v0', text: 'OFICINA', fg: '#f2c14e', bg: '#1d1d1d', at: 38, w: 5 },
    });
    qbox(q, 34.5, 41.5, 0, 3.8, 8.9, 9, 'rust', false);
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
    building(q, {
      r: { u0: 9, u1: 25, v0: 9, v1: 25 },
      h: 5.6,
      floors: 1,
      wall: 'brick',
      trim: 'trim',
      windows: ['u0', 'v0'],
      lit: 0.3,
      decoDoors: [
        { face: 'u0', at: 17, w: 1.6 },
        { face: 'v0', at: 15, w: 1.6 },
      ],
      awning: { faces: ['u0', 'v0'], tint: 0x2f5d3a },
      sign: { face: 'u0', text: 'MERCEARIA', fg: '#f4ead2', bg: '#24402c' },
    });
    building(q, {
      r: { u0: 9, u1: 22, v0: 31, v1: 46 },
      h: 9.5,
      floors: 2,
      wall: 'plaster',
      wallTint: 0xc9b48f,
      trim: 'trim',
      windows: ['u0', 'v0'],
      decoDoors: [{ face: 'u0', at: 38.5, w: 3 }],
      sign: { face: 'u0', text: 'CINEMA', fg: '#ffd27a', bg: '#3b0d0d', glow: true, w: 7 },
    });
    qbox(q, 7.0, 9, 3.0, 3.22, 34, 43, 'metal', false);
    building(q, {
      r: { u0: 31, u1: 46, v0: 9, v1: 22 },
      h: 5,
      wall: 'plaster',
      wallTint: 0x9db59a,
      trim: 'trim',
      windows: ['v0', 'u0'],
      decoDoors: [{ face: 'v0', at: 38, w: 1.6 }],
      sign: { face: 'v0', text: 'FARMÁCIA', fg: '#e8fff0', bg: '#1d5b3a', at: 38, w: 5 },
    });
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
    building(q, {
      r: { u0: 9, u1: 25, v0: 9, v1: 25 },
      h: 7.5,
      floors: 2,
      wall: 'concrete',
      wallTint: 0xb8b2a6,
      trim: 'stone',
      windows: ['u0', 'v0'],
      boarded: 0.35,
      decoDoors: [
        { face: 'u0', at: 17, w: 2 },
        { face: 'v0', at: 17, w: 1.6 },
      ],
      sign: { face: 'u0', text: 'CORREIO', fg: '#e9e4d4', bg: '#26324a' },
    });
    building(q, {
      r: { u0: 9, u1: 21, v0: 31, v1: 45 },
      h: 4.6,
      floors: 1,
      wall: 'metal',
      wallTint: 0xa9b3b8,
      trim: 'trim',
      windows: ['u0', 'v0', 'v1'],
      lit: 0.6,
      decoDoors: [{ face: 'u0', at: 38, w: 1.6 }],
      sign: { face: 'u0', text: 'LANCHONETE', fg: '#7ff7ff', bg: '#0b1e26', glow: true },
    });
    building(q, {
      r: { u0: 32, u1: 44, v0: 10, v1: 22 },
      h: 9,
      floors: 1,
      wall: 'plaster',
      wallTint: 0xd6d0c4,
      trim: 'stone',
      windows: ['u0', 'u1'],
    });
    qbox(q, 35.5, 40.5, 0, 15, 9.6, 14.6, 'plaster', true, { tint: 0xcfc8bb });
    qbox(q, 35.3, 40.7, 14.6, 15.2, 9.4, 14.8, 'stone', false);
    qbox(q, 36.2, 39.8, 15.2, 17.2, 10.3, 13.9, 'roof', false);
    qbox(q, 37.0, 39.0, 17.2, 19.6, 11.1, 13.1, 'roof', false);
    qbox(q, 37.9, 38.1, 19.6, 21.2, 12.0, 12.2, 'metal', false);
    qbox(q, 37.4, 38.6, 20.4, 20.6, 12.0, 12.2, 'metal', false);
    qbox(q, 37.0, 39.0, 0, 3.2, 9.48, 9.6, 'woodDark', false);
    qbox(q, 37.2, 38.8, 9, 11.5, 9.5, 9.6, 'glassLit', false);

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
  car(-40.5, -4.5, false, 0x34302c);
  rubble(-41, 4, 8, 2.5, ['concrete', 'brick']);

  // ---------- máquinas de bebida e caixotes de munição ----------




  machine('couraca', 8.4, -21.5, -1, 0);
  machine('folego', 21.5, -24.25, 0, 1);
  machine('reflexo', 47.2, -33, -1, 0);
  machine('gatilho', -47.2, 31, 1, 0);
  machine('passo', -40, 47.2, 0, -1);
  machine('mula', 42.5, 8.4, 0, -1);

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
    { id: 'q-ne', name: 'Oficina', cost: 1000, kind: 'debris' },
    { id: 'q-so', name: 'Quintal Sudoeste', cost: 1000, kind: 'debris' },
    { id: 'cemiterio', name: 'Cemitério', cost: 1250, kind: 'debris' },
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
  };
}
