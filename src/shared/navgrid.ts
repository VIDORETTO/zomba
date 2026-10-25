import type { World } from './world';

const UNREACHED = 0xffff;
// até quantas células a busca anda por dentro de obstáculos para sair do bolsão onde o alvo está
const POCKET_MAX = 16;
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
  // de qual alvo (posição na lista de update) cada célula recebe o caminho
  private readonly src: Uint8Array;
  // 1 = célula bloqueada alcançada só por dentro do bolsão onde o alvo está (jogador em cima de um caixote)
  private readonly esc: Uint8Array;
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
    this.src = new Uint8Array(n);
    this.esc = new Uint8Array(n);
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
    const { dist, queue, blocked, esc, w, h } = this;
    for (let k = 0; k < this.touched; k++) {
      dist[queue[k]] = UNREACHED;
      esc[queue[k]] = 0;
    }
    let head = 0;
    let tail = 0;
    for (let k = 0; k < targets.length && k < 255; k++) {
      const t = targets[k];
      const i = this.idx(t.x, t.z);
      if (i < 0 || dist[i] === 0) continue;
      dist[i] = 0;
      this.src[i] = k;
      esc[i] = blocked[i];
      queue[tail++] = i;
    }
    while (head < tail) {
      const i = queue[head++];
      const cx = i % w;
      const cz = (i - cx) / w;
      const nd = dist[i] + 1;
      if (nd > maxDist) continue;
      // alvo sobre um obstáculo: a busca sai do bolsão bloqueado pelas células vizinhas até achar chão livre
      const inPocket = esc[i] === 1 && nd <= POCKET_MAX;
      for (let k = 0; k < 8; k++) {
        const [dx, dz] = N8[k];
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        const j = nz * w + nx;
        if (dist[j] <= nd) continue;
        if (blocked[j]) {
          if (!inPocket) continue;
        } else if (!inPocket && k >= 4 && (blocked[cz * w + nx] || blocked[nz * w + cx])) {
          // diagonal só se as duas células laterais estiverem livres (não corta quina)
          continue;
        }
        dist[j] = nd;
        this.src[j] = this.src[i];
        esc[j] = blocked[j];
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
    // dentro de uma parede engordada (ou sobre um degrau que o mapa marca como parede): procura em anéis cada vez
    // maiores a célula com caminho mais curta
    const maxR = best === UNREACHED ? 10 : 1;
    for (let r = 1; r <= maxR; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
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
      if (best !== UNREACHED) break;
    }
    if (!bx && !bz) return null;
    const l = Math.hypot(bx, bz);
    return [bx / l, bz / l];
  }

  // Posição (na lista passada ao update) do alvo para o qual o caminho dessa célula leva, ou -1.
  sourceAt(x: number, z: number): number {
    const i = this.idx(x, z);
    return i < 0 || this.dist[i] === UNREACHED ? -1 : this.src[i];
  }

  isBlockedAt(x: number, z: number): boolean {
    const i = this.idx(x, z);
    return i < 0 || this.blocked[i] === 1;
  }

  // O segmento (ax,az) -> (bx,bz) passa só por células livres? (as paredes já vêm engordadas pelo raio do corpo)
  clear(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const n = Math.ceil(len / (this.cell * 0.5));
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      const i = this.idx(ax + dx * u, az + dz * u);
      if (i < 0 || this.blocked[i]) return false;
    }
    return true;
  }

  // Direção de caminhada suave: desce o campo por até `steps` células e mira na mais distante que dá para ir
  // em linha reta (sem zigue-zague de oito direções e sem raspar nas quinas).
  steer(x: number, z: number, steps = 9): [number, number] | null {
    const { dist, w, h } = this;
    const i = this.idx(x, z);
    if (i < 0) return null;
    if (dist[i] === UNREACHED) return this.direction(x, z);
    let cx = i % w;
    let cz = (i - cx) / w;
    let cur = dist[i];
    let pdx = 0;
    let pdz = 0;
    const chain: number[] = [];
    for (let s = 0; s < steps && cur > 0; s++) {
      let best = cur;
      let bk = -1;
      for (let k = 0; k < 8; k++) {
        const nx = cx + N8[k][0];
        const nz = cz + N8[k][1];
        if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        const j = nz * w + nx;
        const inside = this.blocked[cz * w + cx] === 1;
        if (!inside && this.blocked[j]) continue;
        if (!inside && k >= 4 && (this.blocked[cz * w + nx] || this.blocked[nz * w + cx])) continue;
        const d = dist[j];
        // empate: continua na mesma direção
        if (d < best || (d === best && bk >= 0 && N8[k][0] === pdx && N8[k][1] === pdz)) {
          best = d;
          bk = k;
        }
      }
      if (bk < 0 || best >= cur) break;
      pdx = N8[bk][0];
      pdz = N8[bk][1];
      cx += pdx;
      cz += pdz;
      cur = best;
      chain.push(cz * w + cx);
    }
    if (!chain.length) return this.direction(x, z);
    for (let k = chain.length - 1; k >= 0; k--) {
      const c = chain[k];
      const tx = this.ox + ((c % w) + 0.5) * this.cell;
      const tz = this.oz + (Math.floor(c / w) + 0.5) * this.cell;
      if (k === 0 || this.clear(x, z, tx, tz)) {
        const l = Math.hypot(tx - x, tz - z);
        if (l < 1e-4) return this.direction(x, z);
        return [(tx - x) / l, (tz - z) / l];
      }
    }
    return null;
  }

  distanceAt(x: number, z: number): number {
    const i = this.idx(x, z);
    return i < 0 ? UNREACHED : this.dist[i];
  }
}
