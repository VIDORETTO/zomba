import { SIGHTS } from '../weapons';
import { IDENT, createBuilder } from './builder';
import type { MapDef, MaterialId, Rect, Vec3, Zone } from './types';

// "Rota": cinco paradas ligadas por uma estrada em anel no meio da névoa (estilo TranZit).
// Rodoviária (início) -> Lanchonete -> Fazenda -> Usina (energia) -> Cidade (Forja) -> Rodoviária.
// Tudo em coordenadas de mundo (o quarteirão IDENT não espelha nada).

const BOUNDS: Rect = { minX: -300, minZ: -190, maxX: 270, maxZ: 320 };

export function buildRota(): MapDef {
  const B = createBuilder(7031);
  const { rnd, rr, blocks, lights, signs, fires, lava, zombieSpawns, doors, boxSpots, interactables, entries } = B;
  const { box, building, car, lamp, barrel, crate, rubble, zombieEntry, machine, ammoCrate, wallBuy, woodDoor, boxSpot } = B;
  const q = IDENT;

  // ---------- caminho do ônibus (e da estrada) ----------
  // marcadores: 'R', 'L', 'F', 'U', 'C' = ponto de parada
  const route: [number, number, string?][] = [
    [35, 0], [0, 0, 'rodoviaria'], [-35, 0], [-80, -40], [-120, -100],
    [-145, -120], [-170, -120, 'lanchonete'], [-195, -120], [-225, -90], [-240, -20],
    [-240, 70], [-240, 100, 'fazenda'], [-240, 130], [-220, 190], [-160, 235],
    [-70, 250], [-40, 250, 'usina'], [-10, 250], [60, 240], [140, 210],
    [190, 160], [190, 130, 'cidade'], [190, 100], [160, 50], [90, 15],
  ];
  const path = route.map(([x, z]) => [x, z] as [number, number]);
  const stops = route.flatMap(([, , zone], i) => (zone ? [{ at: i, zone }] : []));

  // distância de um ponto até a estrada (para não pôr árvores no caminho)
  const roadDist = (x: number, z: number) => {
    let best = Infinity;
    for (let i = 0; i < path.length; i++) {
      const [ax, az] = path[i];
      const [bx, bz] = path[(i + 1) % path.length];
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
    }
    return best;
  };

  // ---------- paradas (fora delas é névoa) ----------
  const zones: Zone[] = [
    { id: 'rodoviaria', name: 'Rodoviária', rect: { minX: -32, minZ: -32, maxX: 32, maxZ: 22 } },
    { id: 'lanchonete', name: 'Lanchonete', rect: { minX: -202, minZ: -152, maxX: -140, maxZ: -88 } },
    { id: 'fazenda', name: 'Fazenda', rect: { minX: -278, minZ: 70, maxX: -195, maxZ: 136 } },
    { id: 'usina', name: 'Usina', rect: { minX: -78, minZ: 214, maxX: 8, maxZ: 292 } },
    { id: 'cidade', name: 'Cidade', rect: { minX: 160, minZ: 94, maxX: 228, maxZ: 168 } },
  ];
  const inZone = (x: number, z: number, pad = 0) =>
    zones.some((zn) => x > zn.rect.minX - pad && x < zn.rect.maxX + pad && z > zn.rect.minZ - pad && z < zn.rect.maxZ + pad);

  // ---------- chão, estrada e pátios ----------
  box(BOUNDS.minX, -0.5, BOUNDS.minZ, BOUNDS.maxX, 0, BOUNDS.maxZ, 'dirt', false, { tint: 0x4e4234 });
  // estrada: trechos girados, com a altura alternando um pouco para não piscar onde se sobrepõem
  for (let i = 0; i < path.length; i++) {
    const [ax, az] = path[i];
    const [bx, bz] = path[(i + 1) % path.length];
    const len = Math.hypot(bx - ax, bz - az);
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const yaw = Math.atan2(bx - ax, bz - az);
    const top = 0.02 + (i % 2) * 0.004;
    box(cx - 4.2, -0.3, cz - len / 2 - 4, cx + 4.2, top, cz + len / 2 + 4, 'asphalt', false, { rot: [0, yaw, 0] });
    // faixa amarela tracejada no meio
    for (let s = 3; s < len - 3; s += 7) {
      const px = ax + ((bx - ax) * s) / len, pz = az + ((bz - az) * s) / len;
      box(px - 0.08, top, pz - 1.5, px + 0.08, top + 0.01, pz + 1.5, 'paintYellow', false, { rot: [0, yaw, 0] });
    }
  }
  // pátio de cada parada
  const pads: [number, number, number, number][] = [
    [-24, -26, 24, 16], [-196, -146, -146, -96], [-262, 80, -206, 124], [-70, 222, 0, 280], [164, 100, 222, 160],
  ];
  for (const [x0, z0, x1, z1] of pads) box(x0, -0.2, z0, x1, 0.03, z1, 'concrete', false, { tint: 0x8a8378 });

  // ---------- ajudantes deste mapa ----------

  // abrigo de ponto de ônibus virado para a estrada (n = lado da estrada)
  function busShelter(x: number, z: number, nx: number, nz: number, name: string) {
    const along = nx !== 0;
    const hx = along ? 0.8 : 2.2, hz = along ? 2.2 : 0.8;
    box(x - hx, 2.5, z - hz, x + hx, 2.62, z + hz, 'metal', false, { tint: 0x3a4a5a });
    box(x - hx + (along ? -nx * 0.7 : 0) - (along ? 0.05 : 0), 0, z - hz + (along ? 0 : -nz * 0.7) - (along ? 0 : 0.05),
      x + hx + (along ? -nx * 0.7 : 0) + (along ? 0.05 : 0) - (along ? 1.5 : 0), 2.5, z + hz + (along ? 0 : -nz * 0.7) + (along ? 0 : 0.05) - (along ? 0 : 1.5), 'glass', false);
    for (const s of [-1, 1]) {
      const px = along ? x : x + s * 2.1, pz = along ? z + s * 2.1 : z;
      box(px - 0.06, 0, pz - 0.06, px + 0.06, 2.5, pz + 0.06, 'metal', true, { tint: 0x3a4a5a });
    }
    box(x - (along ? 0.25 : 1.6), 0.45, z - (along ? 1.6 : 0.25), x + (along ? 0.25 : 1.6), 0.55, z + (along ? 1.6 : 0.25), 'wood', false);
    // placa de parada no poste, de frente para a estrada
    const sx = x + nx * 1.4 + (along ? 0 : 2.6), sz = z + nz * 1.4 + (along ? 2.6 : 0);
    box(sx - 0.05, 0, sz - 0.05, sx + 0.05, 3.1, sz + 0.05, 'metal', true);
    signs.push({ pos: [sx + nx * 0.07, 2.75, sz + nz * 0.07], w: 1.5, h: 0.5, normal: [nx, nz], text: `PONTO · ${name.toUpperCase()}`, fg: '#f4f0e0', bg: '#1f4a7a' });
    lights.push({ pos: [x, 2.3, z], color: 0xcfe0ff, intensity: 12, distance: 9, kind: 'lamp' });
  }

  function deadTree(x: number, z: number) {
    const h = rr(4, 8);
    box(x - 0.22, 0, z - 0.22, x + 0.22, h, z + 0.22, 'woodDark', true, { tint: 0x2e2620 });
    for (let i = 0; i < 3; i++) {
      const y = h * rr(0.45, 0.9);
      box(x - 0.07, y, z - rr(0.8, 1.6), x + 0.07, y + 0.14, z + rr(0.8, 1.6), 'woodDark', false, {
        tint: 0x2e2620, rot: [rr(-0.8, 0.8), rr(0, Math.PI), rr(-0.4, 0.4)],
      });
    }
  }

  function lavaPit(x: number, z: number, w: number, d: number) {
    lava.push({ minX: x - w / 2, minZ: z - d / 2, maxX: x + w / 2, maxZ: z + d / 2 });
    box(x - w / 2, 0, z - d / 2, x + w / 2, 0.035, z + d / 2, 'lava', false);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const s = rr(0.5, 1.1);
      const px = x + Math.cos(a) * (w / 2 + 0.3), pz = z + Math.sin(a) * (d / 2 + 0.3);
      box(px - s / 2, -0.1, pz - s / 2, px + s / 2, rr(0.1, 0.3), pz + s / 2, 'stone', false, { rot: [rr(-0.3, 0.3), rr(0, 3), rr(-0.3, 0.3)] });
    }
    fires.push([x, 0.1, z]);
    lights.push({ pos: [x, 0.8, z], color: 0xff5a14, intensity: 45, distance: 14, kind: 'lava' });
  }

  // cerca de madeira alinhada a um eixo
  function fence(x0: number, z0: number, x1: number, z1: number) {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    for (let s = 0; s <= len; s += 2.5) {
      const px = alongX ? Math.min(x0, x1) + s : x0, pz = alongX ? z0 : Math.min(z0, z1) + s;
      box(px - 0.08, 0, pz - 0.08, px + 0.08, 1.2, pz + 0.08, 'woodDark', true);
    }
    for (const y of [0.45, 0.95]) {
      if (alongX) box(Math.min(x0, x1), y, z0 - 0.04, Math.max(x0, x1), y + 0.12, z0 + 0.04, 'wood', true);
      else box(x0 - 0.04, y, Math.min(z0, z1), x0 + 0.04, y + 0.12, Math.max(z0, z1), 'wood', true);
    }
  }

  // bancada de miras (frente para -z, parede em zw)
  function sightBench(x0: number, x1: number, zw: number) {
    const zf = zw - 0.85;
    box(x0, 0, zf, x1, 0.88, zw, 'woodDark', true);
    box(x0 - 0.05, 0.88, zf - 0.05, x1 + 0.05, 0.94, zw, 'metal', false, { tint: 0x8a8f94 });
    box(x0 + 0.1, 1.1, zw - 0.04, x1 - 0.1, 2.35, zw, 'wood', false, { tint: 0xb59a74 });
    const xr = x0 + 0.8, xs = x1 - 1.1, zc = zf + 0.42;
    box(xr - 0.08, 0.94, zc - 0.07, xr + 0.08, 1.06, zc + 0.07, 'metal', false, { tint: 0x1c1c1c });
    box(xr - 0.035, 1.0, zc - 0.075, xr + 0.035, 1.04, zc - 0.07, 'neon', false, { tint: 0xff2a1a });
    box(xs - 0.22, 1.0, zc - 0.04, xs + 0.22, 1.08, zc + 0.04, 'metal', false, { tint: 0x1c1c1c });
    signs.push({ pos: [xr, 1.75, zw - 0.06], w: 1.3, h: 0.34, normal: [0, -1], text: `${SIGHTS.red.name} · ${SIGHTS.red.cost}`, fg: '#f2c14e', bg: '#1d1d1d' });
    signs.push({ pos: [xs, 1.75, zw - 0.06], w: 1.3, h: 0.34, normal: [0, -1], text: `${SIGHTS.scope.name} · ${SIGHTS.scope.cost}`, fg: '#f2c14e', bg: '#1d1d1d' });
    lights.push({ pos: [(x0 + x1) / 2, 2.4, zf - 0.4], color: 0xffd9a0, intensity: 3, distance: 5, kind: 'machine' });
    interactables.push({ id: 'sight-red', kind: 'sight', sight: 'red', use: [xr, zf - 0.7], y: 0 });
    interactables.push({ id: 'sight-scope', kind: 'sight', sight: 'scope', use: [xs, zf - 0.7], y: 0 });
  }

  const spawn = (x: number, z: number) => zombieSpawns.push({ x, z, area: null });

  doors.push(
    { id: 'oficina', name: 'Oficina', cost: 750, kind: 'door' },
    { id: 'celeiro', name: 'Celeiro', cost: 1000, kind: 'door' },
    { id: 'cofre', name: 'Cofre', cost: 0, kind: 'power' },
  );

  // ========== 1. RODOVIÁRIA (rua ao longo de X, em z = 0) ==========
  building(q, {
    r: { u0: -16, u1: 16, v0: -22, v1: -8 },
    h: 6, wall: 'brick', wallTint: 0x9a8a78, trim: 'trim', windows: ['v1', 'u0', 'u1'], lit: 0.4,
    enter: { doors: [{ face: 'v1', at: -6, w: 2.4 }, { face: 'v1', at: 6, w: 2.4 }, { face: 'v0', at: -8, w: 1.6 }, { face: 'v0', at: 8, w: 1.6 }], floor: 'tile', light: 0xffe0b0 },
    awning: { faces: ['v1'], tint: 0x2a4a6a },
    sign: { face: 'v1', text: 'RODOVIÁRIA', fg: '#f4f0e0', bg: '#1f3a5a', w: 9 },
  });
  // guichês e bancos dentro do terminal
  box(-14, 0, -16, -4, 1.1, -15.4, 'woodDark', true);
  box(-14, 1.1, -16.1, -4, 1.18, -15.3, 'metal', false);
  signs.push({ pos: [-9, 1.6, -15.35], w: 2.2, h: 0.4, normal: [0, 1], text: 'PASSAGENS', fg: '#f4f0e0', bg: '#1f3a5a' });
  for (const x of [3, 9]) {
    box(x - 2, 0.15, -13.2, x + 2, 0.6, -12.6, 'wood', true);
    box(x - 2, 0.6, -13.25, x + 2, 1.15, -13.1, 'wood', false);
  }
  zombieEntry(-8, -22, 0, 1);
  zombieEntry(8, -22, 0, 1);
  wallBuy('carbine', 16, -15, 1, 0, 1.75);
  wallBuy('doublebarrel', 2, -21.65, 0, 1, 1.75);
  boxSpot('Rodoviária', -12, -20.9, 0, 1);
  // garagem dos ônibus (galpão aberto) do outro lado da rua
  for (const x of [-18, -6, 6, 18]) for (const z of [8, 18]) box(x - 0.2, 0, z - 0.2, x + 0.2, 5, z + 0.2, 'metal', true, { tint: 0x5a5e62 });
  box(-19, 5, 7.5, 19, 5.3, 18.5, 'metal', false, { tint: 0x4a4e52 });
  // ônibus abandonado no galpão
  box(8, 0.3, 10, 18, 3.2, 12.8, 'carPaint', true, { tint: 0x8a6a22 });
  box(7.95, 1.9, 10.4, 18.05, 2.7, 12.4, 'glass', false);
  ammoCrate(-16, 12, 1, 0);
  busShelter(-6, 6.2, 0, -1, 'Rodoviária');
  for (const [x, z, s] of [[-22, -3, 'lit'], [22, -3, 'lit'], [-22, 24, 'dim']] as [number, number, 'lit' | 'dim'][]) lamp(x, z, 0, 1, s);
  barrel(20, -24, 'light');
  barrel(-24, 14, 'fx');
  car(25, 8, false, 0x4a5a3a, true);
  for (const [x, z] of [[-26, -26], [26, -26], [-28, 16], [28, 18], [0, -30], [-14, 20]] as [number, number][]) spawn(x, z);

  // ========== 2. LANCHONETE (rua ao longo de X, em z = -120) ==========
  building(q, {
    r: { u0: -186, u1: -160, v0: -138, v1: -126 },
    h: 4.6, wall: 'plaster', wallTint: 0xd8cfc0, trim: 'trim', trimTint: 0xb83a2a, windows: ['v1', 'u1'], lit: 0.7,
    enter: { doors: [{ face: 'v1', at: -173, w: 2.2 }, { face: 'v0', at: -178, w: 1.6 }], floor: 'tile', light: 0xffd8b0 },
    awning: { faces: ['v1'], tint: 0xb83a2a },
    sign: { face: 'v1', text: 'LANCHONETE', fg: '#ff6a5a', bg: '#1a0a08', glow: true, w: 8 },
  });
  // balcão com banquetas
  box(-184, 0, -133.2, -176, 1.05, -132.4, 'trim', true, { tint: 0xb83a2a });
  box(-184.1, 1.05, -133.3, -175.9, 1.12, -132.3, 'metal', false);
  for (let x = -183; x <= -177; x += 1.5) box(x - 0.2, 0.15, -131.6, x + 0.2, 0.75, -131.2, 'metal', false);
  machine('reflexo', -161.05, -134, -1, 0);
  zombieEntry(-178, -138, 0, 1);
  wallBuy('smg', -160, -129.5, 1, 0);
  // posto de gasolina: cobertura e bombas
  for (const x of [-186, -172]) for (const z of [-112, -102]) box(x - 0.2, 0, z - 0.2, x + 0.2, 4.5, z + 0.2, 'metal', true, { tint: 0xd0c8b8 });
  box(-188, 4.5, -114, -170, 5.0, -100, 'trim', false, { tint: 0xb83a2a });
  for (const x of [-182, -176]) {
    box(x - 0.45, 0, -107.4, x + 0.45, 1.6, -106.6, 'carPaint', true, { tint: 0xb83a2a });
    box(x - 0.3, 1.0, -107.45, x + 0.3, 1.4, -106.55, 'glassLit', false);
  }
  lights.push({ pos: [-179, 4.2, -107], color: 0xfff0d0, intensity: 30, distance: 16, kind: 'lamp' });
  // oficina com a bancada de miras (porta de 750)
  building(q, {
    r: { u0: -166, u1: -150, v0: -112, v1: -97 },
    h: 5, wall: 'metal', wallTint: 0x6d7270, trim: 'rust', windows: ['u1'],
    enter: { doors: [{ face: 'v0', at: -158, w: 3 }], floor: 'concrete', light: 0xffe8c0 },
    sign: { face: 'v0', text: 'OFICINA', fg: '#f2c14e', bg: '#1d1d1d', at: -158, w: 4 },
  });
  woodDoor(q, 'oficina', -159.5, -156.5, -112, -111.65, -158, -113.3);
  signs.push({ pos: [-161.5, 1.3, -112.05], w: 2.2, h: 0.5, normal: [0, -1], text: 'OFICINA · 750', fg: '#f3e6c4', bg: '#2a201a', door: 'oficina' });
  sightBench(-164, -160.8, -97.35);
  wallBuy('grenade', -166, -104, -1, 0, 1.2);
  boxSpot('Lanchonete', -150.6, -104, -1, 0);
  ammoCrate(-190, -124.5, 0, 1);
  busShelter(-166, -126.2, 0, 1, 'Lanchonete');
  for (const [x, z] of [[-196, -127], [-144, -127], [-196, -113]] as [number, number][]) lamp(x, z, 0, 1, rnd() < 0.7 ? 'lit' : 'dim');
  car(-192, -98, false, 0x2a4a6a);
  car(-146, -142, true, 0, true);
  for (const [x, z] of [[-198, -148], [-142, -148], [-200, -92], [-142, -92], [-170, -146], [-188, -96]] as [number, number][]) spawn(x, z);

  // ========== 3. FAZENDA (rua ao longo de Z, em x = -240) ==========
  building(q, {
    r: { u0: -262, u1: -248, v0: 86, v1: 104 },
    h: 6.6, floors: 2, wall: 'wood', wallTint: 0xd8cdb4, trim: 'trim', windows: ['u1', 'v0', 'v1'], lit: 0.3,
    enter: { doors: [{ face: 'u1', at: 96, w: 2 }, { face: 'u0', at: 95, w: 1.6 }], floor: 'floorWood', light: 0xffd2a0 },
    awning: { faces: ['u1'], tint: 0x5a4a3a },
  });
  machine('couraca', -261.25, 100, 1, 0);
  machine('folego', -246.4, 108, 1, 0);
  zombieEntry(-262, 95, 1, 0);
  // celeiro vermelho (porta de 1000) com a Caixa e a escopeta de repetição
  building(q, {
    r: { u0: -232, u1: -210, v0: 90, v1: 116 },
    h: 8, wall: 'wood', wallTint: 0x8a2a20, trim: 'trim', trimTint: 0xe8e0d0, windows: ['v0', 'v1'],
    enter: { doors: [{ face: 'u0', at: 103, w: 3.2 }, { face: 'u1', at: 103, w: 1.6 }], floor: 'dirt', light: 0xffc890 },
  });
  woodDoor(q, 'celeiro', -232, -231.65, 101.4, 104.6, -233.3, 103);
  signs.push({ pos: [-232.05, 3.3, 103], w: 2.4, h: 0.5, normal: [-1, 0], text: 'CELEIRO · 1000', fg: '#f3e6c4', bg: '#2a201a', door: 'celeiro' });
  zombieEntry(-210, 103, -1, 0);
  wallBuy('pump', -220, 115.65, 0, -1);
  boxSpot('Fazenda', -228, 92.3, 0, 1);
  for (const [x, z] of [[-214, 94], [-216, 96], [-214, 112]] as [number, number][]) box(x - 0.9, 0.15, z - 0.6, x + 0.9, 1.15, z + 0.6, 'wood', true, { tint: 0xc8a850 });
  // silo, campos e cercas
  box(-206, 0, 74, -200, 13, 80, 'concrete', true, { tint: 0xb8b0a4 });
  box(-206.4, 13, 73.6, -199.6, 13.6, 80.4, 'roof', false);
  for (let x = -272; x < -266; x += 1.2) box(x, 0, 74, x + 0.6, 0.3, 84, 'dirt', false, { tint: 0x3a2c1e });
  fence(-275, 72, -265, 72);
  fence(-275, 72, -275, 132);
  fence(-205, 120, -196, 120);
  // trator
  box(-252, 0.5, 118, -248, 1.8, 121, 'carPaint', true, { tint: 0x3a6a2a });
  box(-251.5, 1.8, 118.4, -249.5, 3.0, 120.6, 'glass', false);
  box(-252.4, 0, 117.6, -251.6, 1.4, 118.2, 'tire', false);
  box(-252.4, 0, 120.8, -251.6, 1.4, 121.4, 'tire', false);
  ammoCrate(-236.5, 84, 1, 0);
  busShelter(-243.8, 100, 1, 0, 'Fazenda');
  for (const [x, z] of [[-246, 76], [-234, 124], [-246, 130]] as [number, number][]) lamp(x, z, 1, 0, rnd() < 0.6 ? 'lit' : 'dim');
  barrel(-256, 112, 'light');
  for (const [x, z] of [[-272, 112], [-270, 92], [-200, 104], [-204, 128], [-258, 128], [-224, 76]] as [number, number][]) spawn(x, z);

  // ========== 4. USINA (rua ao longo de X, em z = 250): alavanca da energia ==========
  building(q, {
    r: { u0: -62, u1: -24, v0: 222, v1: 244 },
    h: 10, wall: 'concrete', wallTint: 0x8a8a84, trim: 'rust', windows: ['v1', 'u0'], boarded: 0.3,
    enter: { doors: [{ face: 'v1', at: -52, w: 3 }, { face: 'v1', at: -34, w: 3 }, { face: 'v0', at: -30, w: 1.6 }], floor: 'concrete', light: 0xc8e0ff },
    sign: { face: 'v1', text: 'USINA', fg: '#e8f0ff', bg: '#1a2430', w: 6 },
  });
  // turbinas
  for (const x of [-54, -44]) {
    box(x - 2.5, 0.15, 226, x + 2.5, 3.6, 232, 'metal', true, { tint: 0x4a5a6a });
    box(x - 1.8, 3.6, 227, x + 1.8, 4.6, 231, 'metal', false, { tint: 0x3a4a5a });
    box(x - 0.4, 1.2, 232.02, x + 0.4, 1.6, 232.06, 'neon', false, { tint: 0x60b0ff });
  }
  // alavanca da energia na parede do fundo
  box(-39, 0.9, 222.35, -35, 2.6, 222.6, 'metal', true, { tint: 0x2a2e32 });
  box(-37.1, 1.3, 222.6, -36.9, 2.0, 222.9, 'metal', false, { tint: 0xc8302a });
  signs.push({ pos: [-37, 2.95, 222.66], w: 2.2, h: 0.45, normal: [0, 1], text: 'ENERGIA', fg: '#ffd060', bg: '#1a1410' });
  interactables.push({ id: 'power', kind: 'power', use: [-37, 223.8], y: 0.15 });
  // salão grande: mais luz, e uma lâmpada vermelha em cima da alavanca
  lights.push({ pos: [-54, 7, 236], color: 0xc8e0ff, intensity: 30, distance: 20, kind: 'interior' });
  lights.push({ pos: [-32, 7, 236], color: 0xc8e0ff, intensity: 30, distance: 20, kind: 'interior' });
  box(-37.3, 3.2, 222.35, -36.7, 3.5, 222.7, 'neon', false, { tint: 0xff3020 });
  lights.push({ pos: [-37, 3.0, 223.4], color: 0xff4a2a, intensity: 8, distance: 7, kind: 'machine' });
  machine('gatilho', -61.25, 238, 1, 0);
  wallBuy('rifle', -61.65, 230, 1, 0);
  boxSpot('Usina', -26.3, 238, -1, 0);
  zombieEntry(-30, 222, 0, 1);
  wallBuy('knife', -24, 236, 1, 0);
  // pátio dos transformadores, torre de resfriamento e uma poça de lava
  for (const x of [-56, -46, -36]) {
    box(x - 1.6, 0, 262, x + 1.6, 2.8, 266, 'metal', true, { tint: 0x5a6a5a });
    box(x - 0.2, 2.8, 263.8, x + 0.2, 3.8, 264.2, 'metal', false);
  }
  fence(-62, 258, -30, 258);
  box(-18, 0, 262, -4, 18, 276, 'concrete', true, { tint: 0x9a968e });
  box(-17, 18, 263, -5, 20, 275, 'concrete', false, { tint: 0x8a867e });
  lavaPit(-26, 272, 5, 3.5);
  ammoCrate(-66, 246, 1, 0);
  busShelter(-46, 255.8, 0, -1, 'Usina');
  for (const [x, z] of [[-68, 256], [0, 256], [-20, 244]] as [number, number][]) lamp(x, z, 0, -1, rnd() < 0.6 ? 'lit' : 'dim');
  for (const [x, z] of [[-74, 220], [4, 218], [-74, 286], [2, 286], [-44, 284], [-14, 230]] as [number, number][]) spawn(x, z);

  // ========== 5. CIDADE (rua ao longo de Z, em x = 190): Forja no cofre do banco ==========
  building(q, {
    r: { u0: 168, u1: 184, v0: 110, v1: 126 },
    h: 6, wall: 'brick', trim: 'trim', windows: ['u1'], lit: 0.5,
    enter: { doors: [{ face: 'u1', at: 118, w: 2.2 }, { face: 'u0', at: 118, w: 1.6 }], floor: 'floorWood', light: 0xffb070 },
    sign: { face: 'u1', text: 'BAR', fg: '#ffd27a', bg: '#3b0d0d', glow: true, w: 3 },
  });
  machine('mula', 168.75, 122, 1, 0);
  zombieEntry(168, 118, 1, 0);
  // banco: o cofre dos fundos guarda a Forja e só abre com a energia
  building(q, {
    r: { u0: 166, u1: 184, v0: 132, v1: 150 },
    h: 7, wall: 'stone', trim: 'trim', windows: ['u1', 'v1'],
    enter: { doors: [{ face: 'u1', at: 141, w: 2.4 }], floor: 'tile', light: 0xffe6c0 },
    sign: { face: 'u1', text: 'BANCO', fg: '#efe3c4', bg: '#22301e', w: 5 },
  });
  box(173.65, 0, 132.35, 174, 7, 140, 'stone', true);
  box(173.65, 0, 142, 174, 7, 149.65, 'stone', true);
  box(173.65, 2.7, 140, 174, 7, 142, 'stone', true);
  box(173.75, 0, 140, 173.95, 2.7, 142, 'metal', true, { tint: 0x8a8a7a, door: 'cofre' });
  signs.push({ pos: [174.05, 3.1, 141], w: 1.6, h: 0.4, normal: [1, 0], text: 'COFRE', fg: '#f3c27a', bg: '#1e1410' });
  box(166.35, 0, 139.8, 167.95, 1.8, 142.2, 'brickDark', true);
  box(166.3, 1.8, 139.7, 168.05, 2.0, 142.3, 'stone', false);
  box(166.6, 2.0, 140.6, 167.4, 4.6, 141.4, 'brickDark', true);
  box(168.55, 0, 140.65, 169.15, 0.45, 141.35, 'metal', true, { tint: 0x2a2a2a });
  box(168.4, 0.45, 140.55, 169.3, 0.72, 141.45, 'metal', true, { tint: 0x3a3a3a });
  signs.push({ pos: [167.97, 1.55, 141], w: 1.1, h: 0.3, normal: [1, 0], text: 'FORJA', fg: '#f3c27a', bg: '#1e1410' });
  interactables.push({ id: 'forge', kind: 'forge', use: [170.4, 141], y: 0.15 });
  machine('passo', 199.25, 140, 1, 0);
  // praça com a fenda de lava e lojas fechadas
  building(q, {
    r: { u0: 198, u1: 214, v0: 104, v1: 120 },
    h: 5.5, wall: 'plaster', wallTint: 0x9db59a, trim: 'trim', windows: ['u0', 'v1'], boarded: 0.5,
    sign: { face: 'u0', text: 'ARMAZÉM', fg: '#e8fff0', bg: '#1d5b3a', w: 5 },
  });
  wallBuy('burstrifle', 198, 112, -1, 0);
  building(q, {
    r: { u0: 198, u1: 218, v0: 144, v1: 160 },
    h: 9.5, floors: 2, wall: 'plaster', wallTint: 0xc9b48f, trim: 'trim', windows: ['u0', 'v0'],
    sign: { face: 'u0', text: 'HOTEL', fg: '#ffd27a', bg: '#3b0d0d', glow: true, w: 4 },
  });
  for (const [x0, z0, x1, z1] of [[203, 127, 206, 129], [205.5, 128.5, 208.5, 130.5], [208, 130, 211, 131.6]] as [number, number, number, number][]) {
    lava.push({ minX: x0, minZ: z0, maxX: x1, maxZ: z1 });
    box(x0, 0.03, z0, x1, 0.06, z1, 'lava', false);
  }
  lights.push({ pos: [207, 0.8, 129.5], color: 0xff5a14, intensity: 60, distance: 15, kind: 'lava' });
  boxSpot('Cidade', 216, 132, -1, 0);
  ammoCrate(194.5, 124, 1, 0);
  busShelter(186.2, 126, -1, 0, 'Cidade');
  for (const [x, z] of [[186, 104], [194, 156], [218, 124]] as [number, number][]) lamp(x, z, -1, 0, 'lit');
  car(200, 98, true, 0x7a1f1a);
  car(214, 166, true, 0, true);
  for (const [x, z] of [[162, 100], [162, 160], [224, 100], [224, 140], [200, 166], [176, 96]] as [number, number][]) spawn(x, z);

  // ========== estrada: postes, carcaças, lava e mata morta na névoa ==========
  for (let i = 0; i < path.length; i++) {
    const [ax, az] = path[i];
    const [bx, bz] = path[(i + 1) % path.length];
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    for (let s = 20; s < len - 10; s += 45) {
      const px = ax + dx * s, pz = az + dz * s;
      if (inZone(px, pz, 4)) continue;
      // poste do lado da estrada; os da névoa quase todos apagados
      const side = (i + Math.floor(s)) % 2 ? 1 : -1;
      lamp(px - dz * 6 * side, pz + dx * 6 * side, dz * side, -dx * side, rnd() < 0.25 ? 'dim' : 'broken');
    }
    if (len > 40 && !inZone(ax + dx * len * 0.5, az + dz * len * 0.5, 6) && rnd() < 0.7) {
      const s = len * rr(0.3, 0.7);
      const px = ax + dx * s - dz * 5.5, pz = az + dz * s + dx * 5.5;
      car(px, pz, Math.abs(dx) > Math.abs(dz), 0, rnd() < 0.6);
    }
  }
  // poças de lava na beira da estrada (marcam o caminho na névoa)
  for (const [x, z, w, d] of [[-60, -18, 4, 3], [-226, 30, 3, 5], [-185, 216, 4, 3], [105, 228, 4, 3], [130, 36, 3, 4]] as [number, number, number, number][]) lavaPit(x, z, w, d);
  // mata morta: árvores secas espalhadas fora da estrada e das paradas
  for (let x = BOUNDS.minX + 8; x < BOUNDS.maxX - 8; x += 17) {
    for (let z = BOUNDS.minZ + 8; z < BOUNDS.maxZ - 8; z += 17) {
      const px = x + rr(-6, 6), pz = z + rr(-6, 6);
      if (roadDist(px, pz) < 10 || inZone(px, pz, 6)) continue;
      if (rnd() < 0.75) deadTree(px, pz);
      else rubble(px, pz, 3, 1.5, ['stone', 'dirt'] as MaterialId[]);
    }
  }
  crate(-90, -52, 1.2);
  crate(-89, -50.6, 0.9);

  // limites invisíveis
  const b = BOUNDS;
  box(b.minX - 1, 0, b.minZ - 1, b.maxX + 1, 30, b.minZ, 'concrete', true, { hidden: true });
  box(b.minX - 1, 0, b.maxZ, b.maxX + 1, 30, b.maxZ + 1, 'concrete', true, { hidden: true });
  box(b.minX - 1, 0, b.minZ, b.minX, 30, b.maxZ, 'concrete', true, { hidden: true });
  box(b.maxX, 0, b.minZ, b.maxX + 1, 30, b.maxZ, 'concrete', true, { hidden: true });

  const anvil: Vec3 = [168.85, 0.72, 141];
  return {
    id: 'rota',
    name: 'Rota',
    bounds: b,
    blocks,
    lights,
    signs,
    fires,
    lava,
    playerSpawns: [[-4, 9], [4, 9], [-10, 9], [10, 9]],
    zombieSpawns,
    interactables,
    entries,
    doors,
    boxSpots,
    forge: { anvil, mouth: [167.97, 0.9, 141], mouthNormal: [1, 0], candles: [] },
    zones,
    bus: { path, stops },
    perksNeedPower: true,
    forgeNeedsPower: true,
    fogCreatures: true,
    fogDensity: 0.03,
    fogRoad: 0.06,
    navRange: 75,
  };
}
