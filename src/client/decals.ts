import * as THREE from 'three';
import { entryPoints, type MapDef } from '../shared/map/types';
import { mulberry32 } from '../shared/rng';
import type { World } from '../shared/world';

// Marcas coladas nas superfícies: furos de bala, sangue, poças, queimado de explosão (somem com o tempo)
// e a bagunça fixa do mapa (papéis, manchas de óleo, sangue seco) espalhada ao abrir a partida.

// dried = sangue seco da bagunça fixa do mapa (não some)
export type DecalKind = 'bullet' | 'blood' | 'pool' | 'scorch' | 'paper' | 'stain' | 'dried';

// quantas de cada tipo ficam ao mesmo tempo e quanto duram (s); 0 = fixa
const CAP: Record<DecalKind, number> = { bullet: 160, blood: 90, pool: 30, scorch: 20, paper: 320, stain: 160, dried: 160 };
const LIFE: Record<DecalKind, number> = { bullet: 30, blood: 40, pool: 45, scorch: 40, paper: 0, stain: 0, dried: 0 };

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rnd: () => number, k = 0.35) {
  ctx.beginPath();
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 - k / 2 + rnd() * k);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.fill();
}

function texture(kind: DecalKind): THREE.Texture {
  const rnd = mulberry32(kind.length * 977 + 13);
  let c: HTMLCanvasElement, ctx: CanvasRenderingContext2D;
  switch (kind) {
    case 'bullet': {
      [c, ctx] = canvas(64);
      // fuligem em volta, borda lascada e o furo escuro
      const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
      g.addColorStop(0, 'rgba(20,18,16,0.9)');
      g.addColorStop(0.35, 'rgba(40,36,32,0.45)');
      g.addColorStop(1, 'rgba(40,36,32,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      ctx.strokeStyle = 'rgba(25,22,20,0.7)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 7; i++) {
        const a = rnd() * Math.PI * 2, l = 8 + rnd() * 14;
        ctx.beginPath();
        ctx.moveTo(32 + Math.cos(a) * 5, 32 + Math.sin(a) * 5);
        ctx.lineTo(32 + Math.cos(a + 0.2) * l, 32 + Math.sin(a + 0.2) * l);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(8,7,6,1)';
      blob(ctx, 32, 32, 5.5, rnd, 0.5);
      break;
    }
    case 'blood':
    case 'dried':
    case 'pool': {
      [c, ctx] = canvas(128);
      ctx.fillStyle = kind === 'pool' ? 'rgba(70,4,4,0.92)' : kind === 'dried' ? 'rgba(52,14,8,0.8)' : 'rgba(95,6,6,0.85)';
      blob(ctx, 64, 64, kind === 'pool' ? 46 : 26, rnd, 0.5);
      // respingos em volta
      for (let i = 0; i < (kind === 'pool' ? 10 : 26); i++) {
        const a = rnd() * Math.PI * 2, d = 28 + rnd() * 32;
        blob(ctx, 64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1.5 + rnd() * 5, rnd, 0.4);
      }
      if (kind !== 'pool') {
        // escorridos
        for (let i = 0; i < 5; i++) {
          const x = 44 + rnd() * 40;
          ctx.fillRect(x, 64, 2 + rnd() * 3, 20 + rnd() * 40);
        }
      }
      break;
    }
    case 'scorch': {
      [c, ctx] = canvas(128);
      const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
      g.addColorStop(0, 'rgba(6,5,4,0.95)');
      g.addColorStop(0.55, 'rgba(14,12,10,0.7)');
      g.addColorStop(1, 'rgba(14,12,10,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = 'rgba(6,5,4,0.6)';
      for (let i = 0; i < 12; i++) {
        const a = rnd() * Math.PI * 2;
        blob(ctx, 64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40, 6 + rnd() * 8, rnd);
      }
      break;
    }
    case 'paper': {
      // folha de jornal amassada: colunas de texto e uma foto
      [c, ctx] = canvas(64);
      ctx.fillStyle = 'rgba(205,198,178,0.95)';
      ctx.beginPath();
      ctx.moveTo(8, 6);
      ctx.lineTo(56, 9);
      ctx.lineTo(58, 56);
      ctx.lineTo(10, 58);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(60,56,50,0.75)';
      ctx.fillRect(14, 12, 34, 5);
      for (let y = 21; y < 52; y += 4) {
        ctx.fillRect(14, y, 15, 1.5);
        if (y < 36) continue;
        ctx.fillRect(32, y, 18, 1.5);
      }
      ctx.fillStyle = 'rgba(60,56,50,0.5)';
      ctx.fillRect(32, 21, 18, 13);
      ctx.fillStyle = 'rgba(90,70,40,0.25)';
      blob(ctx, 22, 44, 8, rnd);
      break;
    }
    case 'stain': {
      [c, ctx] = canvas(128);
      ctx.fillStyle = 'rgba(14,12,10,0.55)';
      blob(ctx, 64, 64, 40, rnd, 0.6);
      ctx.fillStyle = 'rgba(14,12,10,0.35)';
      for (let i = 0; i < 6; i++) blob(ctx, 30 + rnd() * 68, 30 + rnd() * 68, 8 + rnd() * 14, rnd);
      break;
    }
  }
  const t = new THREE.CanvasTexture(c!);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

interface Item {
  born: number;
  m: THREE.Matrix4;
  size: number;
  grow: boolean;
}

class Layer {
  readonly mesh: THREE.InstancedMesh;
  private readonly items: (Item | null)[];
  private next = 0;
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scl = new THREE.Vector3();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(readonly kind: DecalKind, geo: THREE.BufferGeometry, mat: THREE.Material) {
    this.mesh = new THREE.InstancedMesh(geo, mat, CAP[kind]);
    this.items = new Array(CAP[kind]).fill(null);
    for (let i = 0; i < CAP[kind]; i++) this.mesh.setMatrixAt(i, this.zero);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  add(m: THREE.Matrix4, size: number, t: number, grow: boolean) {
    const i = this.next;
    this.next = (this.next + 1) % this.items.length;
    this.items[i] = { born: t, m, size, grow };
    this.write(i, t);
  }

  private write(i: number, t: number) {
    const it = this.items[i];
    if (!it) return;
    const life = LIFE[this.kind];
    const age = t - it.born;
    let k = 1;
    if (it.grow) k *= Math.min(1, 0.25 + age / 1.6);
    // nos últimos 3 s encolhe até sumir
    if (life > 0) k *= Math.max(0, Math.min(1, (life - age) / 3));
    if (k <= 0) {
      this.items[i] = null;
      this.mesh.setMatrixAt(i, this.zero);
    } else {
      it.m.decompose(this.pos, this.quat, this.scl);
      this.scl.setScalar(it.size * k);
      this.mesh.setMatrixAt(i, new THREE.Matrix4().compose(this.pos, this.quat, this.scl));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(t: number) {
    const life = LIFE[this.kind];
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (!it) continue;
      const age = t - it.born;
      if ((it.grow && age < 1.7) || (life > 0 && age > life - 3)) this.write(i, t);
    }
  }
}

export class Decals {
  private readonly group = new THREE.Group();
  private readonly layers = new Map<DecalKind, Layer>();
  private readonly geo = new THREE.PlaneGeometry(1, 1);
  private readonly mats: THREE.Material[] = [];
  private readonly up = new THREE.Vector3(0, 0, 1);
  private t = 0;
  private updT = 0;

  constructor(scene: THREE.Scene, private readonly world: World, simple: boolean) {
    for (const kind of Object.keys(CAP) as DecalKind[]) {
      const map = texture(kind);
      const params = { map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 };
      const mat = simple ? new THREE.MeshLambertMaterial(params) : new THREE.MeshStandardMaterial({ ...params, roughness: kind === 'pool' ? 0.25 : 0.9 });
      this.mats.push(mat);
      const layer = new Layer(kind, this.geo, mat);
      this.layers.set(kind, layer);
      this.group.add(layer.mesh);
    }
    scene.add(this.group);
    this.scatter(world.map);
  }

  // marca na superfície em p, virada para a normal n; size em metros
  add(kind: DecalKind, p: THREE.Vector3, n: THREE.Vector3, size: number, roll = Math.random() * Math.PI * 2, grow = false) {
    const q = new THREE.Quaternion().setFromUnitVectors(this.up, n.clone().normalize());
    q.multiply(new THREE.Quaternion().setFromAxisAngle(this.up, roll));
    const pos = p.clone().addScaledVector(n, 0.012 + Math.random() * 0.004);
    const m = new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1));
    this.layers.get(kind)!.add(m, size, this.t, grow);
  }

  // marca no chão (acha a altura do piso em x, z)
  floor(kind: DecalKind, x: number, z: number, size: number, feetY = 0.4, grow = false) {
    const y = this.world.groundHeight(x, z, 0.05, feetY);
    this.add(kind, new THREE.Vector3(x, y, z), new THREE.Vector3(0, 1, 0), size, Math.random() * Math.PI * 2, grow);
  }

  // bagunça fixa: papéis e manchas nas ruas e pátios, sangue e papéis dentro dos prédios e sob as janelas
  private scatter(map: MapDef) {
    const rnd = mulberry32(map.id.length * 7919 + map.blocks.length);
    const inLava = (x: number, z: number) => map.lava.some((r) => x > r.minX - 1 && x < r.maxX + 1 && z > r.minZ - 1 && z < r.maxZ + 1);
    const put = (kind: DecalKind, x: number, z: number, size: number) => {
      if (inLava(x, z)) return;
      const y = this.world.groundHeight(x, z, 0.05, 0.3);
      if (y > 0.3) return;
      this.add(kind, new THREE.Vector3(x, y, z), new THREE.Vector3(0, 1, 0), size, rnd() * Math.PI * 2);
    };
    const areas = map.zones?.map((z) => z.rect) ?? [map.bounds];
    for (const r of areas) {
      const n = Math.round(((r.maxX - r.minX) * (r.maxZ - r.minZ)) / (map.zones ? 70 : 45));
      for (let i = 0; i < n; i++) {
        const x = r.minX + rnd() * (r.maxX - r.minX), z = r.minZ + rnd() * (r.maxZ - r.minZ);
        const k = rnd();
        put(k < 0.6 ? 'paper' : k < 0.88 ? 'stain' : 'dried', x, z, k < 0.6 ? 0.35 + rnd() * 0.15 : 0.9 + rnd() * 1.4);
      }
    }
    // dentro dos prédios (a luz interna marca o centro de cada um)
    for (const l of map.lights) {
      if (l.kind !== 'interior') continue;
      const [cx, , cz] = l.pos;
      for (let i = 0; i < 7; i++) {
        const a = rnd() * Math.PI * 2, d = rnd() * 3.2;
        const k = rnd();
        put(k < 0.55 ? 'paper' : k < 0.8 ? 'dried' : 'stain', cx + Math.cos(a) * d, cz + Math.sin(a) * d, k < 0.55 ? 0.35 + rnd() * 0.12 : 0.8 + rnd());
      }
    }
    // rastro de sangue no chão de dentro de cada barricada
    for (const e of map.entries) {
      const [x, z] = entryPoints(e).inside;
      put('dried', x + e.nx * 0.3, z + e.nz * 0.3, 0.9 + rnd() * 0.5);
    }
  }

  update(dt: number) {
    this.t += dt;
    this.updT -= dt;
    if (this.updT > 0) return;
    this.updT = 0.1;
    for (const l of this.layers.values()) l.update(this.t);
  }

  dispose() {
    this.group.removeFromParent();
    for (const l of this.layers.values()) l.mesh.dispose();
    for (const m of this.mats) {
      (m as THREE.MeshLambertMaterial).map?.dispose();
      m.dispose();
    }
    this.geo.dispose();
  }
}
