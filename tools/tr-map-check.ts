// Confere o mapa da Trincheira: tempo de montagem, interações alcançáveis e o corpo do tanque ao longo da rota. Uso: npx tsx tools/tr-map-check.ts
import { buildTrincheira } from '../src/shared/map/trincheira';
import { GameSim } from '../src/shared/sim';
import { TRINCHEIRA } from '../src/shared/constants';

const t0 = Date.now();
const map = buildTrincheira();
console.log(`mapa montado em ${Date.now() - t0} ms: ${map.blocks.length} blocos, ${map.interactables.length} interações, ${map.zombieSpawns.length} nascimentos`);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const s = new GameSim(map, true) as any;
s.addPlayer('a', 'A', 0);
s.start();
for (const d of map.doors) s.world.openDoors.add(d.id);
for (const f of map.trincheira!.feet) s.world.openDoors.add(`pe-${f.id}`);
for (let i = 0; i < 6; i++) s.world.openDoors.add(`fizz-spot-${i}`);
for (let i = 1; i < 6; i++) s.world.openDoors.add(`box-spot-${i}`);
s.nav.rebuild();
s.nav.update([{ x: map.playerSpawns[0][0], z: map.playerSpawns[0][1] }]);
const reach = (x: number, z: number) => s.nav.distanceAt(x, z) < 0xffff;
const near = (x: number, z: number, r: number) => { if (reach(x, z)) return true; for (let a = 0; a < 24; a++) if (reach(x + Math.cos((a / 24) * 6.283) * r, z + Math.sin((a / 24) * 6.283) * r)) return true; return false; };
const bad = map.interactables.filter((i) => !near(i.use[0], i.use[1], Math.min(1.6, (i.reach ?? 1.9) * 0.85)) && i.use[0] < 135);
console.log('interações fora de alcance (mapa principal):', bad.map((i) => `${i.id}@${i.use.map((v) => v.toFixed(1))}`).join(' ') || 'nenhuma');
const T = map.trincheira!;
const solidAt = (x: number, z: number) => s.world.query(x - 0.05, z - 0.05, x + 0.05, z + 0.05).some((b: { max: number[]; min: number[] }) => b.max[1] > 0.6 && b.min[1] < 1.2 && x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2]);
// corpo do tanque nos pontos da rota: quantos pontos da pegada batem em parede
let worst = 0;
for (let i = 0; i < T.tank.path.length; i++) {
  const [x, z] = T.tank.path[i];
  const [nx, nz] = T.tank.path[(i + 1) % T.tank.path.length];
  const yaw = Math.atan2(nx - x, nz - z);
  const sn = Math.sin(yaw), cs = Math.cos(yaw);
  let hit = 0, tot = 0;
  for (let lx = -TRINCHEIRA.tankHalfWidth; lx <= TRINCHEIRA.tankHalfWidth; lx += 0.5) for (let lz = -TRINCHEIRA.tankHalfLen; lz <= TRINCHEIRA.tankHalfLen; lz += 0.5) {
    tot++;
    if (solidAt(x + lx * cs + lz * sn, z - lx * sn + lz * cs)) hit++;
  }
  if (hit) console.log(`tanque no ponto ${i} (${x},${z}): ${hit}/${tot} amostras em parede`);
  worst = Math.max(worst, hit);
}
console.log('pior sobreposição do tanque:', worst);
console.log('alavanca', T.tank.lever, 'alcançável (ao lado)', reach(T.tank.lever[0] + 1.2, T.tank.lever[1]) || reach(T.tank.lever[0] - 1.2, T.tank.lever[1]));
for (const g of T.gens) console.log('gerador', g.name, reach(g.x + 2.5, g.z) || reach(g.x - 2.5, g.z) || reach(g.x, g.z + 2.5) ? 'ok' : 'FORA');
console.log('Câmara: grupos', T.chamberRect);
console.log('pontos da rota alcançáveis:', T.tank.path.map((p, i) => (reach(p[0], p[1]) ? '' : `#${i}`)).filter(Boolean).join(' ') || 'todos');
const gi = (x: number, z: number) => { const cx = Math.floor(x - T.groups.ox), cz = Math.floor(z - T.groups.oz); return T.groups.data[cz * T.groups.w + cx]; };
console.log('grupo em cada ponto da rota:', T.tank.path.map((p) => gi(p[0], p[1])).join(''));
// busca um ponto melhor para a parada da Igreja (índice 16)
{
  const [px, pz] = T.tank.path[16];
  const [ax, az] = T.tank.path[15], [bx, bz] = T.tank.path[17];
  const yaw = Math.atan2(bx - ax, bz - az);
  const sn = Math.sin(yaw), cs = Math.cos(yaw);
  const over = (x: number, z: number) => {
    let hit = 0;
    for (let lx = -TRINCHEIRA.tankHalfWidth - 0.5; lx <= TRINCHEIRA.tankHalfWidth + 0.5; lx += 0.5) for (let lz = -TRINCHEIRA.tankHalfLen; lz <= TRINCHEIRA.tankHalfLen; lz += 0.5) if (solidAt(x + lx * cs + lz * sn, z - lx * sn + lz * cs)) hit++;
    return hit;
  };
  let best: [number, number, number] = [px, pz, over(px, pz)];
  for (let dx = -3; dx <= 3; dx += 0.5) for (let dz = -3; dz <= 3; dz += 0.5) {
    const o = over(px + dx, pz + dz);
    if (o < best[2] || (o === best[2] && Math.hypot(dx, dz) < Math.hypot(best[0] - px, best[1] - pz))) best = [px + dx, pz + dz, o];
  }
  console.log('melhor parada Igreja:', best.map((v) => +v.toFixed(1)));
}
if (process.env.ASCII) {
  const [x0, z0, x1, z1] = process.env.ASCII.split(',').map(Number);
  for (let z = z0; z <= z1; z += 1) {
    let row = '';
    for (let x = x0; x <= x1; x += 1) row += s.nav.blocked[Math.floor((z - map.bounds.minZ) / 0.5) * s.nav.w + Math.floor((x - map.bounds.minX) / 0.5)] ? '#' : reach(x, z) ? '.' : 'o';
    console.log(String(z).padStart(4), row);
  }
}
