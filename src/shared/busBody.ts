import { BUS } from './constants';

// Corpo do ônibus para colisão: piso, paredes com portas dos dois lados (perto da frente) e frente/fundo.
// Espaço local: +z = para onde o ônibus anda; yaw = atan2(dx, dz) da direção.

export interface BusPose {
  x: number;
  z: number;
  yaw: number;
}

// paredes em espaço local: [x0, x1, z0, z1, topo]
const HW = BUS.halfWidth, HL = BUS.halfLen;
const DOOR0 = 2.3, DOOR1 = 3.8;
const T = 0.12;
export const BUS_WALLS: [number, number, number, number, number][] = [
  [-HW, -HW + T, -HL, DOOR0, 3],
  [-HW, -HW + T, DOOR1, HL, 3],
  [HW - T, HW, -HL, DOOR0, 3],
  [HW - T, HW, DOOR1, HL, 3],
  [-HW, HW, HL - T, HL, 3],
  [-HW, HW, -HL, -HL + T, 3],
];
export const BUS_DOOR = { z0: DOOR0, z1: DOOR1 };

export function toLocal(b: BusPose, x: number, z: number): [number, number] {
  const dx = x - b.x, dz = z - b.z;
  const s = Math.sin(b.yaw), c = Math.cos(b.yaw);
  return [dx * c - dz * s, dx * s + dz * c];
}

export function toWorld(b: BusPose, lx: number, lz: number): [number, number] {
  const s = Math.sin(b.yaw), c = Math.cos(b.yaw);
  return [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
}

// piso do ônibus sob o círculo (ou -Infinity fora dele)
export function busGround(b: BusPose, x: number, z: number, r: number, feetY: number, step: number): number {
  const [lx, lz] = toLocal(b, x, z);
  if (Math.abs(lx) > HW + r * 0.7 || Math.abs(lz) > HL + r * 0.7) return -Infinity;
  return feetY + step >= BUS.floorY ? BUS.floorY : -Infinity;
}

// empurra um cilindro (jogador) para fora das paredes do ônibus
export function busCollide(b: BusPose, pos: { x: number; y: number; z: number }, r: number) {
  let [lx, lz] = toLocal(b, pos.x, pos.z);
  if (Math.abs(lx) > HW + r + 0.5 || Math.abs(lz) > HL + r + 0.5) return;
  let moved = false;
  for (const [x0, x1, z0, z1, top] of BUS_WALLS) {
    if (pos.y >= top) continue;
    const cx = Math.max(x0, Math.min(lx, x1));
    const cz = Math.max(z0, Math.min(lz, z1));
    const dx = lx - cx, dz = lz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      lx = cx + (dx / d) * r;
      lz = cz + (dz / d) * r;
    } else {
      // centro dentro da parede: sai pelo lado mais curto
      const pushes: [number, number][] = [[x0 - r - lx, 0], [x1 + r - lx, 0], [0, z0 - r - lz], [0, z1 + r - lz]];
      pushes.sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) - Math.abs(b[0]) - Math.abs(b[1]));
      lx += pushes[0][0];
      lz += pushes[0][1];
    }
    moved = true;
  }
  if (moved) [pos.x, pos.z] = toWorld(b, lx, lz);
}

// está em pé dentro do ônibus (é carregado junto quando ele anda)
export function standingIn(b: BusPose, x: number, y: number, z: number): boolean {
  const [lx, lz] = toLocal(b, x, z);
  return Math.abs(lx) < HW && Math.abs(lz) < HL && Math.abs(y - BUS.floorY) < 0.12;
}
