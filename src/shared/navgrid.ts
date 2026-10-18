import type { World } from './world';

const UNREACHED = 0xffff;
const N8: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

// Campo de fluxo: uma busca em largura a partir de todos os jogadores.
// Cada zumbi só precisa olhar os vizinhos da sua célula para saber para onde ir.
export class NavGrid {
  readonly cell = 0.5;
  readonly w: number;
  readonly h: number;
  private readonly ox: number;
  private readonly oz: number;
  private readonly blocked: Uint8Array;
  private readonly dist: Uint16Array;
  private readonly queue: Int32Array;
  // células visitadas na última busca (só elas são limpas na próxima)
  private touched = 0;

  constructor(private readonly world: World, private readonly agentRadius: number) {
    const b = world.map.bounds;
    this.ox = b.minX;
    this.oz = b.minZ;
    this.w = Math.ceil((b.maxX - b.minX) / this.cell);
    this.h = Math.ceil((b.maxZ - b.minZ) / this.cell);
    const n = this.w * this.h;
    this.blocked = new Uint8Array(n);
    this.dist = new Uint16Array(n).fill(UNREACHED);
    this.queue = new Int32Array(n);
    this.rebuild();
  }

  // Recalcula as células bloqueadas (chamado quando uma porta abre).
  rebuild() {
    const { world, agentRadius } = this;
    this.blocked.fill(0);
    for (const s of world.solids) {
      // ignora o que dá para pisar e o que fica acima da cabeça de um zumbi (vigas sobre portas)
      if (s.max[1] <= 0.5 || s.min[1] >= 2.0 || !world.isSolid(s)) continue;
      const x0 = Math.floor((s.min[0] - agentRadius - this.ox) / this.cell);
      const x1 = Math.floor((s.max[0] + agentRadius - this.ox) / this.cell);
      const z0 = Math.floor((s.min[2] - agentRadius - this.oz) / this.cell);
      const z1 = Math.floor((s.max[2] + agentRadius - this.oz) / this.cell);
      for (let cx = Math.max(0, x0); cx <= Math.min(this.w - 1, x1); cx++) {
        for (let cz = Math.max(0, z0); cz <= Math.min(this.h - 1, z1); cz++) {
          this.blocked[cz * this.w + cx] = 1;
        }
      }
    }
  }

  private idx(x: number, z: number): number {
    const cx = Math.floor((x - this.ox) / this.cell);
    const cz = Math.floor((z - this.oz) / this.cell);
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return -1;
    return cz * this.w + cx;
  }

  // maxDist: até quantas células a busca vai (mapas grandes não precisam do mapa inteiro)
  update(targets: { x: number; z: number }[], maxDist = UNREACHED - 1) {
    const { dist, queue, blocked, w, h } = this;
    for (let k = 0; k < this.touched; k++) dist[queue[k]] = UNREACHED;
    let head = 0;
    let tail = 0;
    for (const t of targets) {
      const i = this.idx(t.x, t.z);
      if (i < 0 || dist[i] === 0) continue;
      dist[i] = 0;
      queue[tail++] = i;
    }
    while (head < tail) {
      const i = queue[head++];
      const cx = i % w;
      const cz = (i - cx) / w;
      const nd = dist[i] + 1;
      if (nd > maxDist) continue;
      for (let k = 0; k < 8; k++) {
        const [dx, dz] = N8[k];
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        const j = nz * w + nx;
        if (blocked[j] || dist[j] <= nd) continue;
        // diagonal só se as duas células laterais estiverem livres (não corta quina)
        if (k >= 4 && (blocked[cz * w + nx] || blocked[nz * w + cx])) continue;
        dist[j] = nd;
        queue[tail++] = j;
      }
    }
    this.touched = tail;
  }

  // Direção normalizada para o jogador mais próximo pelo caminho, ou null.
  direction(x: number, z: number): [number, number] | null {
    const { dist, w, h } = this;
    const i = this.idx(x, z);
    if (i < 0) return null;
    const cx = i % w;
    const cz = (i - cx) / w;
    let best = dist[i];
    let bx = 0;
    let bz = 0;
    // procura num raio maior se a própria célula estiver dentro de uma parede inflada
    const radius = best === UNREACHED ? 3 : 1;
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        const d = dist[nz * w + nx];
        if (d < best) {
          best = d;
          bx = dx;
          bz = dz;
        }
      }
    }
    if (!bx && !bz) return null;
    const l = Math.hypot(bx, bz);
    return [bx / l, bz / l];
  }

  distanceAt(x: number, z: number): number {
    const i = this.idx(x, z);
    return i < 0 ? UNREACHED : this.dist[i];
  }
}
