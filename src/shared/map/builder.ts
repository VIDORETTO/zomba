import { PERKS, type PerkId } from '../perks';
import { GRENADE, KNIFE, WEAPONS } from '../weapons';
import { mulberry32 } from '../rng';
import type { Block, BoxSpot, DoorDef, Entry, Interactable, LightDef, MaterialId, Rect, SignDef, SpawnPoint, Vec3 } from './types';

// Ajudantes para montar mapas com blocos: prédios, carros, postes, máquinas, armas de parede, portas e entradas.
// Os prédios usam coordenadas (u, v) de um "quarteirão" espelhado por (sx, sz); com IDENT = mundo.

export type Face = 'u0' | 'u1' | 'v0' | 'v1';
export interface Quad {
  sx: number;
  sz: number;
}
export interface QRect {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}
export interface Extra {
  rot?: Vec3;
  tint?: number;
  shade?: number;
  hidden?: boolean;
  bulletThrough?: boolean;
  door?: string;
}
export interface Door {
  face: Face;
  at: number;
  w: number;
}
export interface BSpec {
  r: QRect;
  h: number;
  wall: MaterialId;
  wallTint?: number;
  trim: MaterialId;
  trimTint?: number;
  floors?: number;
  windows: Face[];
  boarded?: number;
  lit?: number;
  enter?: { doors: Door[]; floor: MaterialId; light: number };
  decoDoors?: Door[];
  sign?: { face: Face; text: string; fg: string; bg: string; glow?: boolean; at?: number; w?: number };
  awning?: { faces: Face[]; tint: number };
}

export const IDENT: Quad = { sx: 1, sz: 1 };

export function createBuilder(seed: number) {
  const rnd = mulberry32(seed);
  const blocks: Block[] = [];
  const lights: LightDef[] = [];
  const signs: SignDef[] = [];
  const fires: Vec3[] = [];
  const lava: Rect[] = [];
  const zombieSpawns: SpawnPoint[] = [];
  const doors: DoorDef[] = [];
  const boxSpots: BoxSpot[] = [];
  const interactables: Interactable[] = [];
  const entries: Entry[] = [];

  const rr = (a: number, b: number) => a + rnd() * (b - a);

  const qp = (q: Quad, u: number, v: number): [number, number] => [q.sx * u, q.sz * v];

  const faceRange = (r: QRect, f: Face): [number, number] =>
    f === 'u0' || f === 'u1' ? [r.v0, r.v1] : [r.u0, r.u1];

  const doorUse = (id: string, x: number, z: number) =>
    interactables.push({ id: `door-${id}-${interactables.length}`, kind: 'door', door: id, use: [x, z], y: 0 });


  function box(
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number,
    mat: MaterialId, solid = true, extra: Extra = {},
  ) {
    blocks.push({
      min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
      max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
      mat,
      solid,
      ...extra,
    });
  }
  function qbox(
    q: Quad, u0: number, u1: number, y0: number, y1: number, v0: number, v1: number,
    mat: MaterialId, solid = true, extra: Extra = {},
  ) {
    const e = { ...extra };
    if (e.rot) e.rot = [e.rot[0], e.rot[1] * q.sx * q.sz, e.rot[2]];
    box(q.sx * u0, y0, q.sz * v0, q.sx * u1, y1, q.sz * v1, mat, solid, e);
  }
  function faceNormal(q: Quad, f: Face): [number, number] {
    switch (f) {
      case 'u0': return [-q.sx, 0];
      case 'u1': return [q.sx, 0];
      case 'v0': return [0, -q.sz];
      case 'v1': return [0, q.sz];
    }
  }
  // Placa fina numa face do retângulo, de "out0" a "out1" metros para fora da face.
  function faceSlab(
    q: Quad, r: QRect, f: Face, a0: number, a1: number, y0: number, y1: number,
    out0: number, out1: number, mat: MaterialId, solid = false, extra: Extra = {},
  ) {
    switch (f) {
      case 'u0': qbox(q, r.u0 - out1, r.u0 - out0, y0, y1, a0, a1, mat, solid, extra); break;
      case 'u1': qbox(q, r.u1 + out0, r.u1 + out1, y0, y1, a0, a1, mat, solid, extra); break;
      case 'v0': qbox(q, a0, a1, y0, y1, r.v0 - out1, r.v0 - out0, mat, solid, extra); break;
      case 'v1': qbox(q, a0, a1, y0, y1, r.v1 + out0, r.v1 + out1, mat, solid, extra); break;
    }
  }
  function facePoint(q: Quad, r: QRect, f: Face, a: number, y: number, out: number): Vec3 {
    let u: number, v: number;
    switch (f) {
      case 'u0': u = r.u0 - out; v = a; break;
      case 'u1': u = r.u1 + out; v = a; break;
      case 'v0': u = a; v = r.v0 - out; break;
      case 'v1': u = a; v = r.v1 + out; break;
    }
    const [x, z] = qp(q, u, v);
    return [x, y, z];
  }
  function building(q: Quad, b: BSpec) {
    const { r, h } = b;
    const floors = b.floors ?? Math.max(1, Math.floor((h - 0.8) / 3.4));
    const doors = b.enter?.doors ?? [];
    const deco = b.decoDoors ?? [];
    const trimX: Extra = b.trimTint !== undefined ? { tint: b.trimTint } : {};
    const wallX: Extra = b.wallTint !== undefined ? { tint: b.wallTint } : {};

    if (!b.enter) {
      qbox(q, r.u0, r.u1, 0, h, r.v0, r.v1, b.wall, true, wallX);
      qbox(q, r.u0 - 0.08, r.u1 + 0.08, 0, 0.55, r.v0 - 0.08, r.v1 + 0.08, b.trim, false, trimX);
    } else {
      const t = 0.35;
      // concreto no chão vira piso (placas com juntas), não a textura escorrida das paredes
      qbox(q, r.u0 + t, r.u1 - t, 0, 0.15, r.v0 + t, r.v1 - t, b.enter.floor === 'concrete' ? 'pavement' : b.enter.floor, true);
      qbox(q, r.u0 + t, r.u1 - t, h - 0.3, h, r.v0 + t, r.v1 - t, 'ceiling', false);
      for (const f of ['u0', 'u1', 'v0', 'v1'] as Face[]) {
        let [a0, a1] = faceRange(r, f);
        if (f === 'v0' || f === 'v1') {
          a0 += t;
          a1 -= t;
        }
        const gaps = doors.filter((d) => d.face === f).sort((x, y) => x.at - y.at);
        let cur = a0;
        for (const d of gaps) {
          const d0 = d.at - d.w / 2;
          const d1 = d.at + d.w / 2;
          faceSlab(q, r, f, cur, d0, 0, h, -t, 0, b.wall, true, wallX);
          faceSlab(q, r, f, d0, d1, 2.7, h, -t, 0, b.wall, true, wallX);
          faceSlab(q, r, f, d0 - 0.16, d0, 0, 2.86, 0, 0.07, b.trim, false, trimX);
          faceSlab(q, r, f, d1, d1 + 0.16, 0, 2.86, 0, 0.07, b.trim, false, trimX);
          faceSlab(q, r, f, d0 - 0.16, d1 + 0.16, 2.7, 2.86, 0, 0.07, b.trim, false, trimX);
          cur = d1;
        }
        faceSlab(q, r, f, cur, a1, 0, h, -t, 0, b.wall, true, wallX);
      }
      const [cx, cz] = qp(q, (r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2);
      lights.push({ pos: [cx, h - 1.5, cz], color: b.enter.light, intensity: 28, distance: 18, kind: 'interior' });
    }

    // cornija no topo e faixas entre andares
    qbox(q, r.u0 - 0.25, r.u1 + 0.25, h - 0.25, h + 0.35, r.v0 - 0.25, r.v1 + 0.25, b.trim, false, trimX);

    const allDoors = [...doors, ...deco];
    for (const f of b.windows) {
      const [a0, a1] = faceRange(r, f);
      const len = a1 - a0;
      const n = Math.max(1, Math.floor(len / 3.2));
      for (let k = 0; k < floors; k++) {
        const y0 = k === 0 ? 0.95 : 1.0 + k * 3.4;
        const y1 = k === 0 ? 2.55 : y0 + 1.6;
        if (y1 > h - 0.5) continue;
        if (k > 0) faceSlab(q, r, f, a0 - 0.05, a1 + 0.05, k * 3.4 - 0.1, k * 3.4 + 0.1, 0, 0.06, b.trim, false, trimX);
        for (let i = 0; i < n; i++) {
          const c = a0 + ((i + 0.5) * len) / n;
          const hw = k === 0 ? 0.85 : 0.6;
          if (k === 0 && allDoors.some((d) => d.face === f && Math.abs(d.at - c) < d.w / 2 + hw + 0.3)) continue;
          if (k === 0 && b.sign?.face === f && b.sign.glow && Math.abs((b.sign.at ?? (a0 + a1) / 2) - c) < 0.5) continue;
          const roll = rnd();
          const mat: MaterialId =
            roll < (b.boarded ?? 0) ? 'boards' : roll < (b.boarded ?? 0) + (b.lit ?? 0) ? 'glassLit' : 'glass';
          faceSlab(q, r, f, c - hw - 0.12, c + hw + 0.12, y0 - 0.12, y1 + 0.12, 0, 0.05, b.trim, false, trimX);
          faceSlab(q, r, f, c - hw, c + hw, y0, y1, 0, 0.075, mat, false);
          faceSlab(q, r, f, c - hw - 0.2, c + hw + 0.2, y0 - 0.22, y0 - 0.1, 0, 0.16, b.trim, false, trimX);
        }
      }
    }

    for (const d of deco) {
      faceSlab(q, r, d.face, d.at - d.w / 2, d.at + d.w / 2, 0, 2.4, 0, 0.06, 'woodDark', false);
      faceSlab(q, r, d.face, d.at - d.w / 2 - 0.15, d.at + d.w / 2 + 0.15, 2.4, 2.56, 0, 0.09, b.trim, false, trimX);
    }

    if (b.awning) {
      for (const f of b.awning.faces) {
        const [a0, a1] = faceRange(r, f);
        faceSlab(q, r, f, a0 + 0.6, a1 - 0.6, 2.95, 3.08, 0, 1.7, 'awning', false, { tint: b.awning.tint });
        faceSlab(q, r, f, a0 + 0.6, a1 - 0.6, 2.6, 3.08, 1.62, 1.7, 'awning', false, { tint: b.awning.tint });
      }
    }

    if (b.sign) {
      const s = b.sign;
      const [a0, a1] = faceRange(r, s.face);
      const at = s.at ?? (a0 + a1) / 2;
      const w = s.w ?? Math.min(7, (a1 - a0) * 0.55);
      const y = b.awning ? 3.75 : 3.35;
      const sh = 0.95;
      faceSlab(q, r, s.face, at - w / 2 - 0.1, at + w / 2 + 0.1, y - sh / 2 - 0.1, y + sh / 2 + 0.1, 0, 0.11, 'woodDark', false);
      signs.push({
        pos: facePoint(q, r, s.face, at, y, 0.125),
        w,
        h: sh,
        normal: faceNormal(q, s.face),
        text: s.text,
        fg: s.fg,
        bg: s.bg,
        glow: s.glow,
      });
    }
  }
  function car(x: number, z: number, alongX: boolean, tint: number, burned = false) {
    const L = 4.4, W = 1.9;
    const hx = alongX ? L / 2 : W / 2;
    const hz = alongX ? W / 2 : L / 2;
    const mat: MaterialId = burned ? 'rust' : 'carPaint';
    const ex: Extra = burned ? {} : { tint };
    box(x - hx, 0.32, z - hz, x + hx, 1.05, z + hz, mat, true, ex);
    const cL = 2.3, cW = 1.62;
    const off = -0.25;
    const cx = alongX ? x + off : x;
    const cz = alongX ? z : z + off;
    const chx = alongX ? cL / 2 : cW / 2;
    const chz = alongX ? cW / 2 : cL / 2;
    box(cx - chx, 1.05, cz - chz, cx + chx, 1.6, cz + chz, mat, true, ex);
    const gx = alongX ? chx - 0.12 : chx + 0.015;
    const gz = alongX ? chz + 0.015 : chz - 0.12;
    box(cx - gx, 1.1, cz - gz, cx + gx, 1.54, cz + gz, burned ? 'metal' : 'glass', false);
    for (const s of [-1, 1]) {
      for (const t of [-1, 1]) {
        const wx = alongX ? x + s * (L / 2 - 0.85) : x + t * (W / 2 - 0.12);
        const wz = alongX ? z + t * (W / 2 - 0.12) : z + s * (L / 2 - 0.85);
        const ax = alongX ? 0.33 : 0.13;
        const az = alongX ? 0.13 : 0.33;
        box(wx - ax, 0, wz - az, wx + ax, 0.66, wz + az, 'tire', false);
      }
    }
    const bx = alongX ? hx + 0.08 : hx - 0.05;
    const bz = alongX ? hz - 0.05 : hz + 0.08;
    box(x - bx, 0.38, z - bz, x + bx, 0.58, z + bz, burned ? 'rust' : 'metal', false);
  }
  function lamp(x: number, z: number, dx: number, dz: number, state: 'lit' | 'dim' | 'broken') {
    box(x - 0.09, 0, z - 0.09, x + 0.09, 5.2, z + 0.09, 'metal', true);
    const ax = x + dx * 1.3;
    const az = z + dz * 1.3;
    box(Math.min(x, ax) - 0.05, 5.05, Math.min(z, az) - 0.05, Math.max(x, ax) + 0.05, 5.15, Math.max(z, az) + 0.05, 'metal', false);
    box(ax - 0.28, 4.88, az - 0.2, ax + 0.28, 5.08, az + 0.2, state === 'broken' ? 'metal' : 'lamp', false);
    if (state === 'lit') {
      lights.push({ pos: [ax, 4.6, az], color: 0xffd6a0, intensity: 40, distance: 20, kind: 'lamp' });
    }
  }
  function barrel(x: number, z: number, fire: 'none' | 'fx' | 'light') {
    box(x - 0.3, 0, z - 0.3, x + 0.3, 0.92, z + 0.3, 'rust', true);
    if (fire !== 'none') {
      fires.push([x, 0.95, z]);
      if (fire === 'light') lights.push({ pos: [x, 1.6, z], color: 0xff7a2a, intensity: 30, distance: 15, kind: 'fire' });
    }
  }
  function crate(x: number, z: number, s = 1, y = 0) {
    box(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2, 'wood', true);
  }
  function rubble(x: number, z: number, n: number, spread: number, mats: MaterialId[]) {
    for (let i = 0; i < n; i++) {
      const px = x + rr(-spread, spread);
      const pz = z + rr(-spread, spread);
      const s = rr(0.25, 0.8);
      const hgt = rr(0.15, 0.5);
      box(px - s / 2, -0.05, pz - s / 2, px + s / 2, hgt, pz + s / 2, mats[Math.floor(rnd() * mats.length)], false, {
        rot: [rr(-0.35, 0.35), rr(0, Math.PI), rr(-0.35, 0.35)],
      });
    }
  }
  // Vão com moldura de madeira; as tábuas são desenhadas pelo jogo conforme o estado.
  // A barreira invisível impede o jogador de passar, mas deixa os tiros passarem.
  function zombieEntry(cx: number, cz: number, nx: number, nz: number, w = 1.6, area?: string) {
    const lx = Math.abs(nz);
    const lz = Math.abs(nx);
    for (const s of [-1, 1]) {
      const p = facing(cx + lx * s * (w / 2 + 0.08), cz + lz * s * (w / 2 + 0.08), nx, nz, 0.16, 0.4);
      box(p.x0, 0, p.z0, p.x1, 2.45, p.z1, 'woodDark', true);
    }
    const top = facing(cx, cz, nx, nz, w + 0.32, 0.36);
    box(top.x0, 2.3, top.z0, top.x1, 2.5, top.z1, 'woodDark', false);
    const bar = facing(cx, cz, nx, nz, w, 0.3);
    box(bar.x0, 0, bar.z0, bar.x1, 3, bar.z1, 'concrete', true, { hidden: true, bulletThrough: true });
    entries.push(area ? { id: entries.length, x: cx, z: cz, nx, nz, w, area } : { id: entries.length, x: cx, z: cz, nx, nz, w });
  }
  // Bloco alinhado aos eixos com frente virada para (nx, nz): largura ao longo da parede, profundidade para a frente.
  function facing(x: number, z: number, nx: number, nz: number, width: number, depth: number) {
    const hx = nx !== 0 ? depth / 2 : width / 2;
    const hz = nx !== 0 ? width / 2 : depth / 2;
    return { x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz, fx: x + nx * (depth / 2), fz: z + nz * (depth / 2) };
  }
  // Máquina de bebida: corpo escuro (a cor só aparece no brilho, para não estourar), faixas verticais e vitrine acesas na
  // cor da bebida, e uma coroa no alto com a letra da bebida bem grande, que se lê de longe no escuro.
  function machine(perk: PerkId, x: number, z: number, nx: number, nz: number) {
    const def = PERKS[perk];
    const color = parseInt(def.color.slice(1), 16);
    const shade = (k: number) => (((((color >> 16) & 255) * k) << 16) | ((((color >> 8) & 255) * k) << 8) | ((color & 255) * k)) >>> 0;
    const dark = shade(0.32);
    const f = facing(x, z, nx, nz, 1.2, 0.8);
    box(f.x0, 0, f.z0, f.x1, 2.2, f.z1, 'carPaint', true, { tint: dark });
    box(f.x0 - 0.05, 0, f.z0 - 0.05, f.x1 + 0.05, 0.14, f.z1 + 0.05, 'metal', false, { tint: 0x1c1c1c });
    box(f.x0 - 0.04, 2.2, f.z0 - 0.04, f.x1 + 0.04, 2.3, f.z1 + 0.04, 'metal', false, { tint: 0x1c1c1c });
    // cabeça mais alta com a coroa
    box(f.x0 - 0.02, 2.3, f.z0 - 0.02, f.x1 + 0.02, 3.0, f.z1 + 0.02, 'carPaint', false, { tint: dark });
    box(f.x0 - 0.05, 3.0, f.z0 - 0.05, f.x1 + 0.05, 3.1, f.z1 + 0.05, 'trim', false, { tint: color });
    // vitrine acesa e as duas faixas de luz nas laterais da frente
    const g = facing(f.fx, f.fz, nx, nz, 0.84, 0.04);
    box(g.x0, 0.55, g.z0, g.x1, 1.2, g.z1, 'neon', false, { tint: shade(0.8) });
    const ax = Math.abs(nz);
    const az = Math.abs(nx);
    for (const side of [-1, 1]) {
      const st = facing(f.fx + side * 0.54 * ax, f.fz + side * 0.54 * az, nx, nz, 0.07, 0.05);
      box(st.x0, 0.2, st.z0, st.x1, 2.2, st.z1, 'neon', false, { tint: color });
    }
    const l = facing(f.fx, f.fz, nx, nz, 1.0, 0.06);
    box(l.x0, 2.02, l.z0, l.x1, 2.1, l.z1, 'neon', false, { tint: color });
    // nome da bebida (placa escura com letras na cor dela) e a letra grande na coroa
    signs.push({
      pos: [f.fx + nx * 0.035, 1.58, f.fz + nz * 0.035],
      w: 1.04, h: 0.36, normal: [nx, nz], text: def.name.toUpperCase(),
      fg: def.color, bg: '#0b0b0e', glow: true,
    });
    signs.push({
      pos: [f.fx + nx * 0.04, 2.65, f.fz + nz * 0.04],
      w: 1.04, h: 0.66, normal: [nx, nz], text: def.icon,
      fg: def.color, bg: '#0b0b0e', glow: true,
    });
    lights.push({ pos: [f.fx + nx * 0.7, 1.9, f.fz + nz * 0.7], color, intensity: 14, distance: 8, kind: 'machine', perk: true });
    interactables.push({ id: `perk-${perk}`, kind: 'perk', perk, use: [f.fx + nx * 0.9, f.fz + nz * 0.9], y: 0 });
  }
  function ammoCrate(x: number, z: number, nx: number, nz: number) {
    const f = facing(x, z, nx, nz, 1.1, 0.7);
    box(f.x0, 0, f.z0, f.x1, 0.72, f.z1, 'wood', true);
    box(f.x0 - 0.03, 0.72, f.z0 - 0.03, f.x1 + 0.03, 0.8, f.z1 + 0.03, 'woodDark', false);
    box(x - 0.07, 0.8, z - 0.07, x + 0.07, 1.0, z + 0.07, 'neon', false, { tint: 0xffb050 });
    box(x - 0.11, 1.04, z - 0.11, x + 0.11, 1.08, z + 0.11, 'metal', false);
    signs.push({
      pos: [f.fx + nx * 0.012, 0.42, f.fz + nz * 0.012],
      w: 0.86, h: 0.3, normal: [nx, nz], text: 'MUNIÇÃO', fg: '#f3e6c4', bg: '#3b3226',
    });
    lights.push({ pos: [x + nx * 0.4, 1.2, z + nz * 0.4], color: 0xffc070, intensity: 4, distance: 4, kind: 'machine' });
    interactables.push({ id: `ammo-${interactables.filter((i) => i.kind === 'ammo').length}`, kind: 'ammo', use: [f.fx + nx * 0.8, f.fz + nz * 0.8], y: 0 });
  }
  // (x, z) = ponto na parede; (nx, nz) = para onde a parede olha (lado do jogador)
  function wallBuy(item: string, x: number, z: number, nx: number, nz: number, y = 1.6) {
    const price = item === 'grenade' ? GRENADE.cost : item === 'knife' ? KNIFE.heavyCost : WEAPONS[item].cost;
    const label = item === 'grenade' ? 'Granadas' : item === 'knife' ? 'Faca pesada' : WEAPONS[item].name;
    signs.push({
      pos: [x + nx * 0.1, y, z + nz * 0.1], w: 1.5, h: 0.75, normal: [nx, nz],
      text: `${label} · ${price}`, fg: '#f2efe6', bg: 'transparent', chalk: item,
    });
    const kind = item === 'grenade' ? 'grenade' : item === 'knife' ? 'knife' : 'weapon';
    interactables.push({
      id: kind === 'weapon' ? `wall-${item}` : item === 'grenade' ? 'grenades' : 'knife',
      kind, weapon: kind === 'weapon' ? item : undefined,
      use: [x + nx * 1.0, z + nz * 1.0], y: 0,
    });
  }
  // porta de madeira fechando um vão de prédio (local u0..u1, v0..v1), comprada pelo lado da rua
  function woodDoor(q: Quad, id: string, u0: number, u1: number, v0: number, v1: number, useU: number, useV: number) {
    qbox(q, u0, u1, 0, 2.7, v0, v1, 'woodDark', true, { door: id });
    doorUse(id, ...qp(q, useU, useV));
  }
  // pilha de entulho bloqueando a boca de um beco, com placa de preço virada para a rua
  function debris(q: Quad, id: string, u0: number, u1: number, v0: number, v1: number, face: 'u0' | 'v0') {
    qbox(q, u0, u1, 0, 1.9, v0, v1, 'wood', true, { tint: 0x7a5c44, door: id });
    const cu = (u0 + u1) / 2;
    const cv = (v0 + v1) / 2;
    for (let i = 0; i < 9; i++) {
      const pu = face === 'u0' ? cu + rr(-0.6, 0.6) : rr(u0, u1);
      const pv = face === 'u0' ? rr(v0, v1) : cv + rr(-0.6, 0.6);
      const sz = rr(0.5, 1.2);
      const [x, z] = qp(q, pu, pv);
      const mats: MaterialId[] = ['concrete', 'woodDark', 'brick', 'rust'];
      box(x - sz / 2, rr(0.8, 1.9), z - sz / 4, x + sz / 2, rr(2.0, 2.5), z + sz / 4, mats[Math.floor(rnd() * mats.length)], false, {
        rot: [rr(-0.5, 0.5), rr(0, Math.PI), rr(-0.5, 0.5)], door: id,
      });
    }
    const d = doors.find((x) => x.id === id)!;
    const [sx, sz] = face === 'u0' ? qp(q, u0 - 0.04, cv) : qp(q, cu, v0 - 0.04);
    signs.push({
      pos: [sx, 1.3, sz], w: 2.2, h: 0.5, normal: face === 'u0' ? [-q.sx, 0] : [0, -q.sz],
      text: `${d.name.toUpperCase()} · ${d.cost}`, fg: '#f3e6c4', bg: '#2a201a', door: id,
    });
    doorUse(id, ...(face === 'u0' ? qp(q, u0 - 1.1, cv) : qp(q, cu, v0 - 1.1)));
  }
  // ---------- locais da Caixa Misteriosa ----------
  // O bloco de colisão de cada local só vale quando a caixa está ali (a simulação "abre" os outros).
  function boxSpot(name: string, x: number, z: number, nx: number, nz: number) {
    const i = boxSpots.length;
    const f = facing(x, z, nx, nz, 1.6, 0.7);
    box(f.x0, 0, f.z0, f.x1, 0.9, f.z1, 'wood', true, { hidden: true, door: `box-spot-${i}` });
    boxSpots.push({ x, z, nx, nz, name });
    interactables.push({ id: `box-${i}`, kind: 'box', box: i, use: [x + nx * 1.3, z + nz * 1.3], y: 0 });
  }
  return {
    rnd, rr, blocks, lights, signs, fires, lava, zombieSpawns, doors, boxSpots, interactables, entries,
    box, qbox, qp, faceRange, faceSlab, facePoint, faceNormal, building, car, lamp, barrel, crate, rubble,
    zombieEntry, facing, machine, ammoCrate, wallBuy, doorUse, woodDoor, debris, boxSpot,
  };
}

export type Builder = ReturnType<typeof createBuilder>;
