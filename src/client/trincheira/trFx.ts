import * as THREE from 'three';
import { ringTex } from './common';

// Partículas em lote da Trincheira: duas camadas (brilho aditivo e fumaça/poeira), anéis no chão,
// raios (cadeia de pontos) e almas voando. Nada aqui cria luz.

interface Layer {
  points: THREE.Points;
  cap: number;
  n: number;
  head: number;
  pos: Float32Array;
  vel: Float32Array;
  col: Float32Array;
  size: Float32Array;
  life: Float32Array;
  max: Float32Array;
  grav: Float32Array;
  drag: Float32Array;
  grow: Float32Array;
  a0: Float32Array;
  attrColor: THREE.BufferAttribute;
  attrSize: THREE.BufferAttribute;
  attrPos: THREE.BufferAttribute;
}

export interface Puff {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  color: THREE.ColorRepresentation;
  alpha?: number;
  grav?: number;
  drag?: number;
  grow?: number;
  // fumaça/poeira: mistura normal em vez de brilho
  dull?: boolean;
}

const VERT = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  uniform float uScale;
  varying vec4 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float d = max(0.5, -mv.z);
    gl_PointSize = clamp(aSize * uScale / d, 0.0, 220.0);
    vColor = aColor;
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */ `
  varying vec4 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = (1.0 - d); a *= a * (3.0 - 2.0 * d);
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  }`;

function makeLayer(cap: number, additive: boolean): Layer {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(cap * 3);
  const col = new Float32Array(cap * 4);
  const size = new Float32Array(cap);
  const attrPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const attrColor = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  const attrSize = new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', attrPos);
  geo.setAttribute('aColor', attrColor);
  geo.setAttribute('aSize', attrSize);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uScale: { value: 600 } },
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = additive ? 4 : 3;
  return {
    points, cap, n: 0, head: 0, pos, col, size, attrPos, attrColor, attrSize,
    vel: new Float32Array(cap * 3), life: new Float32Array(cap), max: new Float32Array(cap),
    grav: new Float32Array(cap), drag: new Float32Array(cap), grow: new Float32Array(cap), a0: new Float32Array(cap),
  };
}

interface Soul {
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  color: THREE.Color;
  arc: number;
  done?: () => void;
}
interface RingFx {
  mesh: THREE.Mesh;
  t: number;
  dur: number;
  r0: number;
  r1: number;
  op: number;
  active: boolean;
}

const tmpC = new THREE.Color();

export class TrFx {
  readonly group = new THREE.Group();
  private readonly add: Layer;
  private readonly dull: Layer;
  private readonly souls: Soul[] = [];
  private readonly columns: { x: number; z: number; color: THREE.Color; t: number; dur: number }[] = [];
  private readonly rings: RingFx[] = [];
  private readonly acc = new Map<string, number>();
  private scale = 600;
  private readonly density: number;

  constructor(scene: THREE.Scene, density: number) {
    this.density = Math.max(0.25, density);
    this.add = makeLayer(Math.round(1400 * this.density) + 200, true);
    this.dull = makeLayer(Math.round(900 * this.density) + 150, false);
    this.group.add(this.add.points, this.dull.points);
    const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: ringTex(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, fog: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 1;
      this.group.add(mesh);
      this.rings.push({ mesh, t: 0, dur: 1, r0: 1, r1: 2, op: 1, active: false });
    }
    scene.add(this.group);
  }

  // altura da imagem em pixels e campo de visão (para o tamanho dos pontos)
  resize(pxHeight: number, fovDeg: number) {
    this.scale = pxHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
    (this.add.points.material as THREE.ShaderMaterial).uniforms.uScale.value = this.scale;
    (this.dull.points.material as THREE.ShaderMaterial).uniforms.uScale.value = this.scale;
  }

  emit(p: Puff) {
    const L = p.dull ? this.dull : this.add;
    const i = L.head;
    L.head = (L.head + 1) % L.cap;
    if (L.n < L.cap) L.n = Math.max(L.n, i + 1);
    const c = tmpC.set(p.color as THREE.ColorRepresentation);
    L.pos[i * 3] = p.x;
    L.pos[i * 3 + 1] = p.y;
    L.pos[i * 3 + 2] = p.z;
    L.vel[i * 3] = p.vx ?? 0;
    L.vel[i * 3 + 1] = p.vy ?? 0;
    L.vel[i * 3 + 2] = p.vz ?? 0;
    L.col[i * 4] = c.r;
    L.col[i * 4 + 1] = c.g;
    L.col[i * 4 + 2] = c.b;
    L.a0[i] = p.alpha ?? 1;
    L.col[i * 4 + 3] = L.a0[i];
    L.size[i] = p.size;
    L.life[i] = L.max[i] = p.life;
    L.grav[i] = p.grav ?? 0;
    L.drag[i] = p.drag ?? 0;
    L.grow[i] = p.grow ?? 0;
  }

  // explosão de pontos
  burst(x: number, y: number, z: number, n: number, speed: number, color: THREE.ColorRepresentation, life = 0.8, size = 0.25, opts: { grav?: number; up?: number; dull?: boolean; alpha?: number; grow?: number } = {}) {
    n = Math.max(1, Math.round(n * this.density));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const u = (Math.random() * 2 - 1);
      const r = Math.sqrt(1 - u * u);
      const s = speed * (0.4 + Math.random() * 0.8);
      this.emit({
        x, y, z, vx: Math.cos(a) * r * s, vy: u * s + (opts.up ?? 0), vz: Math.sin(a) * r * s,
        life: life * (0.6 + Math.random() * 0.7), size: size * (0.6 + Math.random() * 0.8), color,
        grav: opts.grav ?? 0, drag: 1.5, dull: opts.dull, alpha: opts.alpha, grow: opts.grow,
      });
    }
  }

  // emissor contínuo: `rate` partículas por segundo (acumula a fração entre quadros)
  stream(key: string, dt: number, rate: number, make: () => Puff) {
    let a = (this.acc.get(key) ?? 0) + dt * rate * this.density;
    let guard = 0;
    while (a >= 1 && guard++ < 12) {
      a -= 1;
      this.emit(make());
    }
    this.acc.set(key, a);
  }

  flame(key: string, x: number, y: number, z: number, dt: number, rate = 14, size = 0.5, color: THREE.ColorRepresentation = 0xff7a20) {
    this.stream(key, dt, rate, () => ({
      x: x + (Math.random() - 0.5) * size * 0.5, y, z: z + (Math.random() - 0.5) * size * 0.5,
      vx: (Math.random() - 0.5) * 0.4, vy: 0.9 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.4,
      life: 0.5 + Math.random() * 0.35, size: size * (0.6 + Math.random() * 0.6), color, alpha: 0.8, grow: -0.6,
    }));
  }

  smoke(key: string, x: number, y: number, z: number, dt: number, rate = 6, size = 0.9, color: THREE.ColorRepresentation = 0x6a6660, rise = 1.4) {
    this.stream(key, dt, rate, () => ({
      x: x + (Math.random() - 0.5) * 0.3, y, z: z + (Math.random() - 0.5) * 0.3,
      vx: (Math.random() - 0.5) * 0.5 + 0.3, vy: rise * (0.7 + Math.random() * 0.6), vz: (Math.random() - 0.5) * 0.5,
      life: 2.2 + Math.random() * 1.4, size, color, alpha: 0.4, grow: 0.7, dull: true,
    }));
  }

  dust(x: number, y: number, z: number, n = 16, spread = 3, color: THREE.ColorRepresentation = 0xb8a68c, size = 1.2) {
    n = Math.max(2, Math.round(n * this.density));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = spread * (0.3 + Math.random() * 0.8);
      this.emit({
        x: x + Math.cos(a) * s * 0.3, y: y + Math.random() * 0.3, z: z + Math.sin(a) * s * 0.3,
        vx: Math.cos(a) * s, vy: 0.4 + Math.random() * 1.4, vz: Math.sin(a) * s,
        life: 1.2 + Math.random() * 1.2, size: size * (0.7 + Math.random() * 0.8), color, alpha: 0.5, grow: 1.1, drag: 1.2, dull: true,
      });
    }
  }

  // raio entre dois pontos: cadeia de pontos brilhantes com desvio aleatório
  bolt(a: THREE.Vector3, b: THREE.Vector3, color: THREE.ColorRepresentation, life = 0.25, size = 0.35) {
    const len = a.distanceTo(b);
    const n = Math.max(4, Math.round(len * 2.5));
    const jx = (Math.random() - 0.5), jz = (Math.random() - 0.5);
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const w = Math.sin(k * Math.PI) * Math.min(1.2, len * 0.08);
      this.emit({
        x: a.x + (b.x - a.x) * k + (Math.random() - 0.5) * w + jx * w,
        y: a.y + (b.y - a.y) * k + (Math.random() - 0.5) * w,
        z: a.z + (b.z - a.z) * k + (Math.random() - 0.5) * w + jz * w,
        life: life * (0.6 + Math.random() * 0.6), size: size * (0.7 + Math.random() * 0.6), color, alpha: 1,
      });
    }
  }

  // anel que cresce no chão
  ring(x: number, y: number, z: number, r0: number, r1: number, color: THREE.ColorRepresentation, dur = 0.8, opacity = 0.9) {
    const r = this.rings.find((q) => !q.active) ?? this.rings[0];
    r.active = true;
    r.t = 0;
    r.dur = dur;
    r.r0 = r0;
    r.r1 = r1;
    r.op = opacity;
    r.mesh.position.set(x, y + 0.08, z);
    (r.mesh.material as THREE.MeshBasicMaterial).color.set(color as THREE.ColorRepresentation);
    r.mesh.visible = true;
  }

  // alma voando de um ponto a outro (arco suave)
  soul(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation, dur = 0.9, arc = 2) {
    if (this.souls.length > 24) this.souls.shift();
    this.souls.push({ from: from.clone(), to: to.clone(), t: 0, dur, color: new THREE.Color(color as THREE.ColorRepresentation), arc });
  }

  // rastro de projétil entre dois quadros: fogo (brasas e chama), orbRaio (faíscas elétricas), artilharia (fumaça cinza)
  trail(kind: 'fogo' | 'orbRaio' | 'artilharia', a: THREE.Vector3, b: THREE.Vector3) {
    const len = a.distanceTo(b);
    const n = Math.max(1, Math.min(8, Math.round(len * 2)));
    for (let i = 0; i < n; i++) {
      const k = (i + Math.random()) / n;
      const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k, z = a.z + (b.z - a.z) * k;
      if (kind === 'fogo') this.emit({ x, y, z, vx: (Math.random() - 0.5) * 0.6, vy: 0.4 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.6, life: 0.5, size: 0.55, color: Math.random() < 0.5 ? 0xff6a14 : 0xffb030, alpha: 0.9, grow: -0.7 });
      else if (kind === 'orbRaio') {
        this.emit({ x, y, z, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2, life: 0.35, size: 0.3, color: 0xc89aff, alpha: 1 });
      } else this.emit({ x, y, z, vy: 0.5, life: 1.8, size: 0.5, color: 0x8a867e, alpha: 0.5, grow: 0.8, dull: true });
    }
  }

  // raio do Cajado de Gelo (chamar a cada disparo): cristais ao longo do raio e brilho no fim
  iceBeam(origin: THREE.Vector3, dir: THREE.Vector3, len: number) {
    const n = Math.max(3, Math.min(14, Math.round(len * 0.6)));
    for (let i = 0; i < n; i++) {
      const d = (i + Math.random()) / n * len;
      this.emit({
        x: origin.x + dir.x * d + (Math.random() - 0.5) * 0.25, y: origin.y + dir.y * d + (Math.random() - 0.5) * 0.25, z: origin.z + dir.z * d + (Math.random() - 0.5) * 0.25,
        vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8, vz: (Math.random() - 0.5) * 0.8,
        life: 0.35, size: 0.2 + 0.18 * (i / n), color: Math.random() < 0.6 ? 0x9fd8ff : 0xffffff, alpha: 0.9, grow: -0.4,
      });
    }
  }

  // clarão curto na boca de um cajado
  muzzle(pos: THREE.Vector3, dir: THREE.Vector3, color: THREE.ColorRepresentation) {
    this.burst(pos.x + dir.x * 0.4, pos.y + dir.y * 0.4, pos.z + dir.z * 0.4, 8, 2.5, color, 0.3, 0.3);
  }

  // coluna de fumaça colorida que sobe por `dur` segundos (marca da artilharia)
  smokeColumn(x: number, z: number, color: THREE.ColorRepresentation, dur: number) {
    this.columns.push({ x, z, color: new THREE.Color(color), t: 0, dur });
  }

  update(dt: number, cam: THREE.Vector3) {
    for (let i = this.columns.length - 1; i >= 0; i--) {
      const c = this.columns[i];
      c.t += dt;
      if (c.t > c.dur) {
        this.columns.splice(i, 1);
        continue;
      }
      this.stream(`col${i}`, dt, 40, () => ({
        x: c.x + (Math.random() - 0.5) * 0.4, y: 0.2, z: c.z + (Math.random() - 0.5) * 0.4,
        vx: (Math.random() - 0.5) * 0.8 + 0.4, vy: 5 + Math.random() * 3, vz: (Math.random() - 0.5) * 0.8,
        life: 2.4, size: 1.1, color: c.color, alpha: 0.7, grow: 0.5, dull: true,
      }));
    }
    // almas
    for (let i = this.souls.length - 1; i >= 0; i--) {
      const s = this.souls[i];
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      const e = k * k * (3 - 2 * k);
      const x = s.from.x + (s.to.x - s.from.x) * e;
      const z = s.from.z + (s.to.z - s.from.z) * e;
      const y = s.from.y + (s.to.y - s.from.y) * e + Math.sin(k * Math.PI) * s.arc;
      this.emit({ x, y, z, life: 0.4, size: 0.5, color: s.color, alpha: 1 });
      this.emit({ x: x + (Math.random() - 0.5) * 0.3, y: y + (Math.random() - 0.5) * 0.3, z: z + (Math.random() - 0.5) * 0.3, vy: 0.5, life: 0.6, size: 0.25, color: s.color, alpha: 0.7 });
      if (k >= 1) {
        this.burst(s.to.x, s.to.y, s.to.z, 8, 1.6, s.color, 0.5, 0.25);
        this.souls.splice(i, 1);
      }
    }
    // anéis
    for (const r of this.rings) {
      if (!r.active) continue;
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k));
      r.mesh.scale.set(rad, 1, rad);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = r.op * (1 - k);
    }
    this.step(this.add, dt, cam);
    this.step(this.dull, dt, cam);
  }

  private step(L: Layer, dt: number, cam: THREE.Vector3) {
    let live = 0;
    for (let i = 0; i < L.n; i++) {
      let life = L.life[i];
      if (life <= 0) {
        L.size[i] = 0;
        L.col[i * 4 + 3] = 0;
        continue;
      }
      live++;
      life -= dt;
      L.life[i] = life;
      if (life <= 0) {
        L.size[i] = 0;
        L.col[i * 4 + 3] = 0;
        continue;
      }
      const i3 = i * 3;
      const drag = Math.max(0, 1 - L.drag[i] * dt);
      L.vel[i3] *= drag;
      L.vel[i3 + 1] = L.vel[i3 + 1] * drag - L.grav[i] * dt;
      L.vel[i3 + 2] *= drag;
      L.pos[i3] += L.vel[i3] * dt;
      L.pos[i3 + 1] += L.vel[i3 + 1] * dt;
      L.pos[i3 + 2] += L.vel[i3 + 2] * dt;
      const k = life / L.max[i];
      // some devagar no fim, e some de longe (já perde a graça atrás da névoa)
      const dx = L.pos[i3] - cam.x, dz = L.pos[i3 + 2] - cam.z;
      const far = Math.max(0, 1 - Math.hypot(dx, dz) / 140);
      L.col[i * 4 + 3] = L.a0[i] * Math.min(1, k * 2.2) * far;
      if (L.grow[i] !== 0) L.size[i] = Math.max(0, L.size[i] * (1 + L.grow[i] * dt));
    }
    L.points.visible = live > 0;
    if (live > 0) {
      L.attrPos.needsUpdate = true;
      L.attrColor.needsUpdate = true;
      L.attrSize.needsUpdate = true;
      L.points.geometry.setDrawRange(0, L.n);
    }
  }

  dispose() {
    this.group.removeFromParent();
    for (const L of [this.add, this.dull]) {
      L.points.geometry.dispose();
      (L.points.material as THREE.Material).dispose();
    }
    for (const r of this.rings) (r.mesh.material as THREE.Material).dispose();
  }
}
