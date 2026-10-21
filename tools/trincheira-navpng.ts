// Desenha a grade de navegação da Trincheira num PNG (preto = bloqueado, verde = alcançável a partir do início,
// vermelho = livre mas fora de alcance; pontos brancos = nascimentos). Uso: npx tsx tools/trincheira-navpng.ts <saida.png> [portas,...]
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { buildTrincheira } from '../src/shared/map/trincheira';
import { GameSim } from '../src/shared/sim';

// recorte opcional em metros: x0 z0 x1 z1, com 4 px por célula
const [outPath = 'nav.png', doorArg = '', ...cropArg] = process.argv.slice(2);
const map = buildTrincheira();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const s = new GameSim(map, true) as any;
s.addPlayer('a', 'A', 0);
s.start();
const nav = s.nav;
for (const id of doorArg.split(',').filter(Boolean)) s.world.openDoors.add(id === 'all' ? '' : id);
if (doorArg === 'all') for (const d of map.doors) s.world.openDoors.add(d.id);
nav.rebuild();
nav.update([{ x: map.playerSpawns[0][0], z: map.playerSpawns[0][1] }]);
const W = nav.w, H = nav.h;
const px = new Uint8Array(W * H * 3);
for (let i = 0; i < W * H; i++) {
  const blocked = nav.blocked[i];
  const d = nav.dist[i];
  const [r, g, b] = blocked ? [20, 20, 20] : d < 0xffff ? [60, 170, 70] : [200, 50, 40];
  px[i * 3] = r; px[i * 3 + 1] = g; px[i * 3 + 2] = b;
}
const dot = (x: number, z: number, c: [number, number, number]) => {
  const cx = Math.floor((x - map.bounds.minX) / nav.cell), cz = Math.floor((z - map.bounds.minZ) / nav.cell);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const i = (cz + dz) * W + cx + dx;
    if (i >= 0 && i < W * H) px.set(c, i * 3);
  }
};
for (const p of map.zombieSpawns) dot(p.x, p.z, [255, 255, 255]);
for (const it of map.interactables) dot(it.use[0], it.use[1], [80, 160, 255]);

// PNG mínimo (RGB 8 bits)
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
let [cx0, cz0, cw, ch, k] = [0, 0, W, H, 1];
if (cropArg.length === 4) {
  const [x0, z0, x1, z1] = cropArg.map(Number);
  cx0 = Math.floor((x0 - map.bounds.minX) / nav.cell);
  cz0 = Math.floor((z0 - map.bounds.minZ) / nav.cell);
  cw = Math.floor((x1 - x0) / nav.cell);
  ch = Math.floor((z1 - z0) / nav.cell);
  k = 4;
}
const OW = cw * k, OH = ch * k;
const raw = Buffer.alloc((OW * 3 + 1) * OH);
for (let y = 0; y < OH; y++) {
  raw[y * (OW * 3 + 1)] = 0;
  for (let x = 0; x < OW; x++) {
    const sx = cx0 + Math.floor(x / k), sz = cz0 + Math.floor(y / k);
    const i = (sz * W + sx) * 3;
    raw.set([px[i], px[i + 1], px[i + 2]], y * (OW * 3 + 1) + 1 + x * 3);
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(OW, 0);
ihdr.writeUInt32BE(OH, 4);
ihdr[8] = 8;
ihdr[9] = 2;
writeFileSync(outPath, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('ok', W, H);
