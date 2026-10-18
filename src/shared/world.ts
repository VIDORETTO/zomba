import { PLAYER } from './constants';
import type { Block, MapDef } from './map/types';

export interface Pos {
  x: number;
  y: number;
  z: number;
}

export interface RayHit {
  t: number;
  nx: number;
  ny: number;
  nz: number;
}

const CELL = 4;

// Colisão contra os blocos sólidos do mapa, com uma grade espacial simples.
export class World {
  readonly solids: Block[];
  private readonly cells = new Map<number, number[]>();
  private readonly stamp: Uint32Array;
  private stampId = 0;
  private readonly tmp: Block[] = [];
  // portas compradas: seus blocos deixam de colidir
  readonly openDoors = new Set<string>();

  constructor(readonly map: MapDef) {
    this.solids = map.blocks.filter((b) => b.solid);
    this.stamp = new Uint32Array(this.solids.length);
    this.solids.forEach((b, i) => {
      const cx0 = Math.floor(b.min[0] / CELL);
      const cx1 = Math.floor(b.max[0] / CELL);
      const cz0 = Math.floor(b.min[2] / CELL);
      const cz1 = Math.floor(b.max[2] / CELL);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const k = key(cx, cz);
          let list = this.cells.get(k);
          if (!list) this.cells.set(k, (list = []));
          list.push(i);
        }
      }
    });
  }

  query(minX: number, minZ: number, maxX: number, maxZ: number): Block[] {
    const out = this.tmp;
    out.length = 0;
    this.stampId++;
    const cx0 = Math.floor(minX / CELL);
    const cx1 = Math.floor(maxX / CELL);
    const cz0 = Math.floor(minZ / CELL);
    const cz1 = Math.floor(maxZ / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const list = this.cells.get(key(cx, cz));
        if (!list) continue;
        for (const i of list) {
          if (this.stamp[i] === this.stampId) continue;
          this.stamp[i] = this.stampId;
          const b = this.solids[i];
          if (b.door && this.openDoors.has(b.door)) continue;
          out.push(b);
        }
      }
    }
    return out;
  }

  // Altura do chão sob um círculo: o bloco mais alto que dá para pisar (degrau).
  groundHeight(x: number, z: number, r: number, feetY: number, step = PLAYER.stepHeight): number {
    let g = 0;
    for (const b of this.query(x - r, z - r, x + r, z + r)) {
      const top = b.max[1];
      if (top <= g || top > feetY + step) continue;
      if (circleOverlapsXZ(x, z, r * 0.7, b)) g = top;
    }
    return g;
  }

  // Empurra um cilindro (círculo em XZ, altura h) para fora das paredes.
  collideCylinder(p: Pos, r: number, h: number, step = PLAYER.stepHeight): boolean {
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this.query(p.x - r, p.z - r, p.x + r, p.z + r)) {
        if (b.max[1] <= p.y + step) continue;
        if (b.min[1] >= p.y + h) continue;
        const cx = clampN(p.x, b.min[0], b.max[0]);
        const cz = clampN(p.z, b.min[2], b.max[2]);
        const dx = p.x - cx;
        const dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const push = r - d;
          p.x += (dx / d) * push;
          p.z += (dz / d) * push;
        } else {
          const l = p.x - b.min[0];
          const rt = b.max[0] - p.x;
          const f = p.z - b.min[2];
          const bk = b.max[2] - p.z;
          const m = Math.min(l, rt, f, bk);
          if (m === l) p.x = b.min[0] - r;
          else if (m === rt) p.x = b.max[0] + r;
          else if (m === f) p.z = b.min[2] - r;
          else p.z = b.max[2] + r;
        }
      }
    }
    return hit;
  }

  // Bloqueia a cabeça ao pular contra um teto.
  ceiling(x: number, z: number, r: number, feetY: number, h: number): number {
    let c = Infinity;
    for (const b of this.query(x - r, z - r, x + r, z + r)) {
      if (b.min[1] < feetY + h - 0.05 || b.min[1] >= c) continue;
      if (circleOverlapsXZ(x, z, r * 0.7, b)) c = b.min[1];
    }
    return c;
  }

  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): RayHit | null {
    let best: RayHit | null = null;
    let bestT = maxT;
    if (dy < -1e-6) {
      const t = -oy / dy;
      if (t >= 0 && t < bestT) {
        bestT = t;
        best = { t, nx: 0, ny: 1, nz: 0 };
      }
    }
    const ix = 1 / (dx || 1e-12);
    const iy = 1 / (dy || 1e-12);
    const iz = 1 / (dz || 1e-12);
    for (const b of this.solids) {
      if (b.bulletThrough || (b.door && this.openDoors.has(b.door))) continue;
      let t0 = (b.min[0] - ox) * ix;
      let t1 = (b.max[0] - ox) * ix;
      let tmin = Math.min(t0, t1);
      let tmax = Math.max(t0, t1);
      let axis = 0;
      t0 = (b.min[1] - oy) * iy;
      t1 = (b.max[1] - oy) * iy;
      const ymin = Math.min(t0, t1);
      tmax = Math.min(tmax, Math.max(t0, t1));
      if (ymin > tmin) {
        tmin = ymin;
        axis = 1;
      }
      t0 = (b.min[2] - oz) * iz;
      t1 = (b.max[2] - oz) * iz;
      const zmin = Math.min(t0, t1);
      tmax = Math.min(tmax, Math.max(t0, t1));
      if (zmin > tmin) {
        tmin = zmin;
        axis = 2;
      }
      if (tmax < Math.max(tmin, 0) || tmin >= bestT || tmin < 0) continue;
      bestT = tmin;
      best = {
        t: tmin,
        nx: axis === 0 ? -Math.sign(dx) : 0,
        ny: axis === 1 ? -Math.sign(dy) : 0,
        nz: axis === 2 ? -Math.sign(dz) : 0,
      };
    }
    return best;
  }

  lineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return true;
    return this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len) === null;
  }

  isSolid(b: Block): boolean {
    return !(b.door && this.openDoors.has(b.door));
  }

  inLava(x: number, z: number): boolean {
    for (const r of this.map.lava) {
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return true;
    }
    return false;
  }
}

function key(cx: number, cz: number): number {
  return (cx + 1000) * 4096 + (cz + 1000);
}

function clampN(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function circleOverlapsXZ(x: number, z: number, r: number, b: Block): boolean {
  const cx = clampN(x, b.min[0], b.max[0]);
  const cz = clampN(z, b.min[2], b.max[2]);
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r * r;
}
