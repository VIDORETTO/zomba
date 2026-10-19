// Números do mapa Rota: blocos, vegetação por tipo, tempo para montar e o que ficou perto demais da estrada.
// Uso: npx tsx tools/rota-stats.ts
import { buildRota } from '../src/shared/map/rota';
const t0 = performance.now();
const m = buildRota();
const ms = performance.now() - t0;
const by: Record<string, number> = {};
for (const f of m.foliage ?? []) by[f.kind] = (by[f.kind] ?? 0) + 1;
console.log(`montado em ${ms.toFixed(0)} ms; blocos ${m.blocks.length}, sólidos ${m.blocks.filter((b) => b.solid).length}`);
console.log('vegetação', by);
const p = m.bus!.path;
const roadDist = (x: number, z: number) => {
  let best = Infinity;
  for (let i = 0; i < p.length; i++) {
    const [ax, az] = p[i], [bx, bz] = p[(i + 1) % p.length];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
};
const inZone = (x: number, z: number) => (m.zones ?? []).some((zn) => x > zn.rect.minX && x < zn.rect.maxX && z > zn.rect.minZ && z < zn.rect.maxZ);
const onRoad = m.blocks.filter((b) => b.solid && !inZone(b.min[0], b.min[2]) && !b.door && b.max[1] > 0.3 && roadDist((b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2) < 4.6);
console.log('sólidos em cima da estrada:', onRoad.length, onRoad.slice(0, 8).map((b) => `${b.mat} ${b.min.map((v) => v.toFixed(0))}`));
