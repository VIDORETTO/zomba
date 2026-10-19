import * as THREE from 'three';
import type { MaterialId, Rect, Vec3 } from '../shared/map/types';
import { lerp } from '../shared/rng';
import { FOG_COLOR, FOG_DENSITY } from './mapView';

interface Spawn {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  size: number; size1?: number;
  r: number; g: number; b: number;
  r1?: number; g1?: number; b1?: number;
  alpha?: number; alpha1?: number;
  gravity?: number;
  drag?: number;
}


class ParticlePool {
  private n = 0;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly s0: Float32Array;
  private readonly s1: Float32Array;
  private readonly c0: Float32Array;
  private readonly c1: Float32Array;
  private readonly a0: Float32Array;
  private readonly a1: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly geo = new THREE.BufferGeometry();
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;

  constructor(private readonly max: number, additive: boolean, map: THREE.Texture) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.a0 = new Float32Array(max);
    this.a1 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    const dyn = (arr: Float32Array, k: number) => new THREE.BufferAttribute(arr, k).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', dyn(this.pos, 3));
    this.geo.setAttribute('pcolor', dyn(this.col, 3));
    this.geo.setAttribute('psize', dyn(this.size, 1));
    this.geo.setAttribute('palpha', dyn(this.alpha, 1));
    this.geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        map: { value: map },
        scale: { value: 600 },
        fogColor: { value: new THREE.Color(FOG_COLOR) },
        fogDensity: { value: FOG_DENSITY },
        additive: { value: additive ? 1 : 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 pcolor; attribute float psize; attribute float palpha;
        uniform float scale; uniform float fogDensity;
        varying vec3 vColor; varying float vAlpha; varying float vFog;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * scale / max(-mv.z, 0.05);
          gl_Position = projectionMatrix * mv;
          vColor = pcolor; vAlpha = palpha;
          float d = -mv.z * fogDensity;
          vFog = 1.0 - exp(-d * d);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform vec3 fogColor; uniform float additive;
        varying vec3 vColor; varying float vAlpha; varying float vFog;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          float a = t.a * vAlpha;
          vec3 c = vColor;
          if (additive > 0.5) a *= 1.0 - vFog; else c = mix(c, fogColor, vFog);
          if (a < 0.003) discard;
          gl_FragColor = vec4(c, a);
        }`,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
  }

  spawn(p: Spawn) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const i3 = i * 3;
    this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
    this.vel[i3] = p.vx; this.vel[i3 + 1] = p.vy; this.vel[i3 + 2] = p.vz;
    this.c0[i3] = p.r; this.c0[i3 + 1] = p.g; this.c0[i3 + 2] = p.b;
    this.c1[i3] = p.r1 ?? p.r; this.c1[i3 + 1] = p.g1 ?? p.g; this.c1[i3 + 2] = p.b1 ?? p.b;
    this.life[i] = 0;
    this.maxLife[i] = p.life;
    this.s0[i] = p.size;
    this.s1[i] = p.size1 ?? p.size;
    this.a0[i] = p.alpha ?? 1;
    this.a1[i] = p.alpha1 ?? 0;
    this.grav[i] = p.gravity ?? 0;
    this.drag[i] = p.drag ?? 0;
  }

  private copy(from: number, to: number) {
    const f3 = from * 3, t3 = to * 3;
    for (let k = 0; k < 3; k++) {
      this.pos[t3 + k] = this.pos[f3 + k];
      this.vel[t3 + k] = this.vel[f3 + k];
      this.c0[t3 + k] = this.c0[f3 + k];
      this.c1[t3 + k] = this.c1[f3 + k];
    }
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.s0[to] = this.s0[from];
    this.s1[to] = this.s1[from];
    this.a0[to] = this.a0[from];
    this.a1[to] = this.a1[from];
    this.grav[to] = this.grav[from];
    this.drag[to] = this.drag[from];
  }

  update(dt: number) {
    let i = 0;
    while (i < this.n) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) {
        this.n--;
        if (i !== this.n) this.copy(this.n, i);
        continue;
      }
      const i3 = i * 3;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= k;
      this.vel[i3 + 1] = this.vel[i3 + 1] * k - this.grav[i] * dt;
      this.vel[i3 + 2] *= k;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.grav[i] > 0 && this.pos[i3 + 1] < 0.02) {
        this.pos[i3 + 1] = 0.02;
        this.vel[i3] *= 0.3;
        this.vel[i3 + 1] = 0;
        this.vel[i3 + 2] *= 0.3;
      }
      const t = this.life[i] / this.maxLife[i];
      for (let c = 0; c < 3; c++) this.col[i3 + c] = this.c0[i3 + c] + (this.c1[i3 + c] - this.c0[i3 + c]) * t;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const fadeIn = Math.min(1, this.life[i] * 12);
      this.alpha[i] = (this.a0[i] + (this.a1[i] - this.a0[i]) * t) * fadeIn;
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    // envia para a placa só a parte do buffer que está em uso
    for (const [name, size] of [['position', 3], ['pcolor', 3], ['psize', 1], ['palpha', 1]] as const) {
      const a = this.geo.attributes[name] as THREE.BufferAttribute;
      a.clearUpdateRanges();
      if (this.n > 0) a.addUpdateRange(0, this.n * size);
      a.needsUpdate = true;
    }
  }

  dispose() {
    this.geo.dispose();
    (this.material.uniforms.map.value as THREE.Texture | null)?.dispose();
    this.material.dispose();
  }
}

const R = (a: number, b: number) => a + Math.random() * (b - a);

// como cada material reage a um tiro
type ImpactKind = 'metal' | 'wood' | 'brick' | 'dust' | 'glass' | 'dirt';
const IMPACT: Partial<Record<MaterialId | 'ground', ImpactKind>> = {
  metal: 'metal', rust: 'metal', carPaint: 'metal', lamp: 'metal', neon: 'metal', tire: 'dust',
  wood: 'wood', woodDark: 'wood', boards: 'wood', floorWood: 'wood', awning: 'wood',
  brick: 'brick', brickDark: 'brick', roof: 'brick',
  glass: 'glass', glassLit: 'glass',
  dirt: 'dirt', ground: 'dirt', sandbag: 'dirt',
};

export class FX {
  private readonly add: ParticlePool;
  private readonly norm: ParticlePool;
  private fires: Vec3[] = [];
  private lava: Rect[] = [];
  private mist: Rect[] = [];
  private acc = new Map<string, number>();
  // raios de fogo dos Cães Infernais: o chão queima onde o raio caiu
  private bolts: { x: number; z: number; t: number }[] = [];

  // density: 1 = completo; menor reduz a quantidade de partículas (qualidade baixa)
  constructor(private readonly scene: THREE.Scene, tex: THREE.Texture, public density = 1) {
    this.add = new ParticlePool(3000, true, tex);
    this.norm = new ParticlePool(3000, false, tex);
    this.norm.points.renderOrder = 1;
    this.add.points.renderOrder = 2;
    scene.add(this.norm.points, this.add.points);
  }

  // cor da névoa das partículas (muda na rodada infernal)
  setFog(color: THREE.Color, density: number) {
    for (const p of [this.add, this.norm]) {
      p.material.uniforms.fogColor.value.copy(color);
      p.material.uniforms.fogDensity.value = density;
    }
  }

  // Raio de fogo caindo do céu: um traço em zigue-zague de brasas que somem em instantes.
  lightning(x: number, z: number) {
    let px = x + R(-1.5, 1.5);
    let pz = z + R(-1.5, 1.5);
    let py = 26;
    const segs = 14;
    for (let s = 0; s < segs; s++) {
      const k = (s + 1) / segs;
      const ny = 26 * (1 - k);
      // converge para o ponto de impacto
      const nx = s === segs - 1 ? x : lerp(px, x, k * 0.5) + R(-0.7, 0.7);
      const nz = s === segs - 1 ? z : lerp(pz, z, k * 0.5) + R(-0.7, 0.7);
      const len = Math.hypot(nx - px, ny - py, nz - pz);
      const n = Math.ceil(len / 0.22);
      for (let i = 0; i < n; i++) {
        const u = i / n;
        this.add.spawn({
          x: px + (nx - px) * u, y: py + (ny - py) * u, z: pz + (nz - pz) * u,
          vx: 0, vy: 0, vz: 0,
          life: R(0.16, 0.3), size: R(0.32, 0.45), size1: 0.1,
          r: 4, g: 2.6, b: 1.6, r1: 3, g1: 0.7, b1: 0.15, alpha: 1, alpha1: 0,
        });
      }
      // galhos
      if (s > 2 && s < segs - 2 && Math.random() < 0.35) {
        const bx = nx + R(-2, 2), bz = nz + R(-2, 2), by = ny - R(1, 3);
        for (let i = 0; i < 10; i++) {
          const u = i / 10;
          this.add.spawn({
            x: nx + (bx - nx) * u, y: ny + (by - ny) * u, z: nz + (bz - nz) * u,
            vx: 0, vy: 0, vz: 0, life: R(0.1, 0.2), size: 0.22, size1: 0.05,
            r: 3.5, g: 1.6, b: 0.6, alpha: 0.9, alpha1: 0,
          });
        }
      }
      px = nx;
      py = ny;
      pz = nz;
    }
    // estouro no chão
    this.fireBurst(new THREE.Vector3(x, 0.3, z));
    for (let i = 0; i < 24; i++) {
      this.add.spawn({
        x, y: 0.1, z,
        vx: R(-4, 4), vy: R(2, 6), vz: R(-4, 4),
        life: R(0.5, 1), size: 0.05, r: 4, g: 1.8, b: 0.4, alpha: 1, alpha1: 0, gravity: 9.8,
      });
    }
    this.bolts.push({ x, z, t: 0 });
  }

  setWorld(fires: Vec3[], lava: Rect[], mist: Rect[] = []) {
    this.fires = fires;
    this.lava = lava;
    this.mist = mist;
  }

  resize(viewHeight: number, fov: number) {
    const s = viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    this.add.material.uniforms.scale.value = s;
    this.norm.material.uniforms.scale.value = s;
  }

  // quantas partículas emitir neste quadro para uma taxa por segundo
  private rate(key: string, perSec: number, dt: number): number {
    const v = (this.acc.get(key) ?? 0) + perSec * this.density * dt;
    const n = Math.floor(v);
    this.acc.set(key, v - n);
    return n;
  }

  update(dt: number, cam: THREE.Vector3) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      if (b.t > 1.4) {
        this.bolts.splice(i, 1);
        continue;
      }
      for (let k = this.rate('bolt' + i, 70 * (1 - b.t / 1.4), dt); k > 0; k--) {
        const a = Math.random() * Math.PI * 2;
        const d = R(0, 0.6);
        this.add.spawn({
          x: b.x + Math.cos(a) * d, y: 0.05, z: b.z + Math.sin(a) * d,
          vx: R(-0.2, 0.2), vy: R(1.2, 2.6), vz: R(-0.2, 0.2),
          life: R(0.35, 0.7), size: R(0.35, 0.6), size1: 0.1,
          r: 3.4, g: 1.4, b: 0.35, r1: 1.2, g1: 0.18, b1: 0.03, alpha: 0.9, alpha1: 0,
        });
      }
    }
    for (let f = 0; f < this.fires.length; f++) {
      const [x, y, z] = this.fires[f];
      if (Math.hypot(x - cam.x, z - cam.z) > 55) continue;
      for (let i = this.rate(`f${f}`, 40, dt); i > 0; i--) {
        this.add.spawn({
          x: x + R(-0.22, 0.22), y: y + R(0, 0.1), z: z + R(-0.22, 0.22),
          vx: R(-0.2, 0.2), vy: R(1.1, 2.1), vz: R(-0.2, 0.2),
          life: R(0.45, 0.85), size: R(0.45, 0.65), size1: 0.12,
          r: 3.2, g: 1.6, b: 0.45, r1: 1.3, g1: 0.22, b1: 0.04, alpha: 0.85, alpha1: 0,
        });
      }
      for (let i = this.rate(`s${f}`, 5, dt); i > 0; i--) {
        this.norm.spawn({
          x: x + R(-0.2, 0.2), y: y + 0.9, z: z + R(-0.2, 0.2),
          vx: R(-0.2, 0.3), vy: R(0.9, 1.4), vz: R(-0.2, 0.3),
          life: R(2.5, 3.5), size: 0.7, size1: 2.6,
          r: 0.05, g: 0.045, b: 0.04, alpha: 0.32, alpha1: 0, drag: 0.2,
        });
      }
      for (let i = this.rate(`k${f}`, 3, dt); i > 0; i--) {
        this.add.spawn({
          x, y: y + 0.3, z,
          vx: R(-0.6, 0.6), vy: R(1.5, 3), vz: R(-0.6, 0.6),
          life: R(1, 2), size: 0.05, r: 3, g: 1.2, b: 0.3, alpha: 1, alpha1: 0, drag: 0.5,
        });
      }
    }

    for (const l of this.lava) {
      for (let i = this.rate(`l${l.minX}`, 4, dt); i > 0; i--) {
        this.add.spawn({
          x: R(l.minX, l.maxX), y: 0.05, z: R(l.minZ, l.maxZ),
          vx: R(-0.2, 0.2), vy: R(0.6, 1.6), vz: R(-0.2, 0.2),
          life: R(1, 2.2), size: R(0.04, 0.08), r: 3, g: 1.1, b: 0.2, alpha: 1, alpha1: 0, drag: 0.3,
        });
      }
    }

    // névoa rasteira: tufos baixos e lentos (só perto do jogador)
    for (let m = 0; m < this.mist.length; m++) {
      const r = this.mist[m];
      const cx = Math.max(r.minX, Math.min(cam.x, r.maxX)), cz = Math.max(r.minZ, Math.min(cam.z, r.maxZ));
      if (Math.hypot(cx - cam.x, cz - cam.z) > 40) continue;
      for (let i = this.rate(`mist${m}`, 9, dt); i > 0; i--) {
        this.norm.spawn({
          x: R(r.minX, r.maxX), y: R(0.1, 0.5), z: R(r.minZ, r.maxZ),
          vx: R(0.1, 0.35), vy: R(0, 0.04), vz: R(-0.1, 0.1),
          life: R(6, 9), size: R(1.6, 2.6), size1: R(3, 4.5),
          r: 0.5, g: 0.48, b: 0.46, alpha: 0.09, alpha1: 0,
        });
      }
    }

    // brasas e cinzas no ar ao redor do jogador
    for (let i = this.rate('ember', 18, dt); i > 0; i--) {
      const a = Math.random() * Math.PI * 2;
      const d = R(2, 22);
      this.add.spawn({
        x: cam.x + Math.cos(a) * d, y: R(0, 5), z: cam.z + Math.sin(a) * d,
        vx: R(0.2, 0.8), vy: R(0.15, 0.6), vz: R(-0.3, 0.3),
        life: R(3, 6), size: R(0.03, 0.06), r: 2.6, g: 0.9, b: 0.2, alpha: 0.9, alpha1: 0,
      });
    }
    for (let i = this.rate('ash', 14, dt); i > 0; i--) {
      const a = Math.random() * Math.PI * 2;
      const d = R(1, 18);
      this.norm.spawn({
        x: cam.x + Math.cos(a) * d, y: R(2, 7), z: cam.z + Math.sin(a) * d,
        vx: R(0.2, 0.6), vy: R(-0.6, -0.25), vz: R(-0.2, 0.2),
        life: R(5, 8), size: R(0.03, 0.05), r: 0.35, g: 0.33, b: 0.32, alpha: 0.7, alpha1: 0,
      });
    }

    this.add.update(dt);
    this.norm.update(dt);
  }

  flame(key: string, p: THREE.Vector3, dt: number, rate: number, size = 0.45) {
    for (let i = this.rate(key, rate, dt); i > 0; i--) {
      this.add.spawn({
        x: p.x + R(-0.04, 0.04) * size * 4, y: p.y, z: p.z + R(-0.04, 0.04) * size * 4,
        vx: R(-0.1, 0.1), vy: R(0.5, 1.1) * size * 2, vz: R(-0.1, 0.1),
        life: R(0.3, 0.6), size: size, size1: size * 0.2,
        r: 3.2, g: 1.6, b: 0.45, r1: 1.3, g1: 0.22, b1: 0.04, alpha: 0.85, alpha1: 0,
      });
    }
  }

  sparks(key: string, p: THREE.Vector3, dt: number) {
    for (let i = this.rate(key, 50, dt); i > 0; i--) {
      this.add.spawn({
        x: p.x, y: p.y, z: p.z,
        vx: R(-2.5, 2.5), vy: R(1, 4), vz: R(-2.5, 2.5),
        life: R(0.3, 0.7), size: 0.04, r: 3.5, g: 2, b: 0.6, alpha: 1, alpha1: 0, gravity: 9.8,
      });
    }
  }

  fireBurst(p: THREE.Vector3) {
    for (let i = 0; i < 18; i++) {
      this.add.spawn({
        x: p.x, y: p.y, z: p.z,
        vx: R(-2.5, 2.5), vy: R(-0.5, 2.5), vz: R(-2.5, 2.5),
        life: R(0.2, 0.45), size: R(0.3, 0.6), size1: 0.05,
        r: 3.6, g: 1.2, b: 0.25, alpha: 1, alpha1: 0, drag: 3,
      });
    }
  }

  blood(p: THREE.Vector3, dir: THREE.Vector3, amount = 1) {
    const n = Math.round(14 * amount * Math.max(0.5, this.density));
    for (let i = 0; i < n; i++) {
      this.norm.spawn({
        x: p.x, y: p.y, z: p.z,
        vx: dir.x * R(0.5, 2.5) + R(-1.2, 1.2), vy: dir.y * R(0.5, 2) + R(0, 2), vz: dir.z * R(0.5, 2.5) + R(-1.2, 1.2),
        life: R(0.5, 0.9), size: R(0.05, 0.12), size1: 0.06,
        r: 0.32, g: 0.015, b: 0.01, alpha: 0.95, alpha1: 0.6, gravity: 9.8,
      });
    }
    for (let i = 0; i < 3 * amount; i++) {
      this.norm.spawn({
        x: p.x, y: p.y, z: p.z,
        vx: dir.x * 0.6 + R(-0.3, 0.3), vy: R(0, 0.4), vz: dir.z * 0.6 + R(-0.3, 0.3),
        life: R(0.25, 0.45), size: 0.25, size1: 0.7,
        r: 0.4, g: 0.02, b: 0.02, alpha: 0.5, alpha1: 0,
      });
    }
  }

  // Impacto de bala: fagulhas e poeira com a cara do material (metal solta faísca, madeira lasca, tijolo e
  // concreto levantam pó, vidro brilha, terra espirra para cima)
  impact(p: THREE.Vector3, nx: number, ny: number, nz: number, mat: MaterialId | 'ground' = 'concrete') {
    const kind = IMPACT[mat] ?? 'dust';
    const sparks = kind === 'metal' ? 14 : kind === 'glass' ? 6 : kind === 'dust' ? 4 : 2;
    for (let i = 0; i < sparks; i++) {
      this.add.spawn({
        x: p.x, y: p.y, z: p.z,
        vx: nx * R(1, 4) + R(-1.5, 1.5), vy: ny * R(1, 4) + R(0, 2), vz: nz * R(1, 4) + R(-1.5, 1.5),
        life: R(0.15, kind === 'metal' ? 0.5 : 0.3), size: kind === 'glass' ? 0.03 : 0.035,
        r: kind === 'glass' ? 2.4 : 3, g: kind === 'glass' ? 2.6 : 2, b: kind === 'glass' ? 2.8 : 0.8, alpha: 1, alpha1: 0, gravity: 9.8,
      });
    }
    // pó (cor do material), mais forte no tijolo, concreto e terra
    const [dr, dg, db] = kind === 'brick' ? [0.42, 0.24, 0.18] : kind === 'wood' ? [0.32, 0.24, 0.16] : kind === 'dirt' ? [0.3, 0.24, 0.17] : [0.3, 0.28, 0.25];
    const puffs = kind === 'metal' || kind === 'glass' ? 2 : kind === 'dirt' ? 6 : 5;
    for (let i = 0; i < puffs; i++) {
      this.norm.spawn({
        x: p.x + nx * 0.05, y: p.y + ny * 0.05, z: p.z + nz * 0.05,
        vx: nx * R(0.3, 1.2) + R(-0.3, 0.3), vy: ny * R(0.3, 1.2) + R(0, kind === 'dirt' ? 1.4 : 0.4), vz: nz * R(0.3, 1.2) + R(-0.3, 0.3),
        life: R(0.6, 1.1), size: 0.12, size1: kind === 'dirt' ? 0.7 : 0.55,
        r: dr, g: dg, b: db, alpha: 0.6, alpha1: 0, drag: 2,
      });
    }
    // pedaços que caem: lascas de madeira, cacos de tijolo e de concreto, torrões de terra
    const chunks = kind === 'metal' || kind === 'glass' ? 0 : 5;
    for (let i = 0; i < chunks; i++) {
      this.norm.spawn({
        x: p.x, y: p.y, z: p.z,
        vx: nx * R(1, 3) + R(-1.2, 1.2), vy: ny * R(1, 3) + R(0.5, 2.5), vz: nz * R(1, 3) + R(-1.2, 1.2),
        life: R(0.5, 0.9), size: R(0.025, 0.05), r: dr * 0.8, g: dg * 0.8, b: db * 0.8, alpha: 1, alpha1: 1, gravity: 9.8,
      });
    }
  }

  explosion(p: THREE.Vector3) {
    for (let i = 0; i < 40; i++) {
      this.add.spawn({
        x: p.x, y: p.y + 0.2, z: p.z,
        vx: R(-6, 6), vy: R(1, 7), vz: R(-6, 6),
        life: R(0.3, 0.7), size: R(0.6, 1.2), size1: 0.1,
        r: 4, g: 2.2, b: 0.6, r1: 1.4, g1: 0.25, b1: 0.05, alpha: 1, alpha1: 0, drag: 3,
      });
    }
    for (let i = 0; i < 24; i++) {
      this.norm.spawn({
        x: p.x + R(-0.6, 0.6), y: p.y + R(0.2, 1), z: p.z + R(-0.6, 0.6),
        vx: R(-1.5, 1.5), vy: R(0.5, 2.5), vz: R(-1.5, 1.5),
        life: R(1.5, 2.8), size: 1, size1: 3.5, r: 0.12, g: 0.1, b: 0.09, alpha: 0.6, alpha1: 0, drag: 1.2,
      });
    }
    for (let i = 0; i < 20; i++) {
      this.norm.spawn({
        x: p.x, y: p.y + 0.2, z: p.z,
        vx: R(-5, 5), vy: R(3, 8), vz: R(-5, 5),
        life: R(0.8, 1.4), size: R(0.06, 0.12), r: 0.15, g: 0.12, b: 0.1, alpha: 1, alpha1: 0.8, gravity: 9.8,
      });
    }
  }

  // rastro do foguete: fogo atrás e fumaça que fica no ar
  rocketTrail(a: THREE.Vector3, b: THREE.Vector3) {
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / 0.25));
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u, z = a.z + (b.z - a.z) * u;
      this.add.spawn({ x, y, z, vx: R(-0.3, 0.3), vy: R(-0.2, 0.3), vz: R(-0.3, 0.3), life: R(0.1, 0.2), size: R(0.25, 0.4), size1: 0.05, r: 4, g: 2, b: 0.5, alpha: 1, alpha1: 0 });
      if (Math.random() < this.density) this.norm.spawn({ x, y, z, vx: R(-0.3, 0.3), vy: R(0.1, 0.5), vz: R(-0.3, 0.3), life: R(1.2, 2.2), size: 0.3, size1: 1.4, r: 0.32, g: 0.3, b: 0.28, alpha: 0.5, alpha1: 0, drag: 1 });
    }
  }

  // Forja terminou: coluna de fogo, chafariz de brasas e anel de chamas no chão
  forgeBurst(p: THREE.Vector3) {
    for (let i = 0; i < 42; i++) {
      this.add.spawn({
        x: p.x + R(-0.25, 0.25), y: p.y, z: p.z + R(-0.25, 0.25),
        vx: R(-0.6, 0.6), vy: R(3.5, 8), vz: R(-0.6, 0.6),
        life: R(0.35, 0.8), size: R(0.3, 0.6), size1: 0.06,
        r: 2.6, g: 1.1, b: 0.3, r1: 1.4, g1: 0.25, b1: 0.05, alpha: 1, alpha1: 0, drag: 1.2,
      });
    }
    for (let i = 0; i < 50; i++) {
      this.add.spawn({
        x: p.x, y: p.y + 0.3, z: p.z,
        vx: R(-3, 3), vy: R(3, 8), vz: R(-3, 3),
        life: R(1, 2), size: R(0.04, 0.07), r: 4, g: 1.6, b: 0.4, alpha: 1, alpha1: 0, gravity: 6, drag: 0.4,
      });
    }
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      this.add.spawn({
        x: p.x, y: p.y - 0.5, z: p.z,
        vx: Math.cos(a) * 4, vy: R(0.2, 0.8), vz: Math.sin(a) * 4,
        life: R(0.4, 0.7), size: 0.45, size1: 0.1, r: 3.6, g: 1.2, b: 0.25, alpha: 0.9, alpha1: 0, drag: 2.5,
      });
    }
  }

  // arma forjada atirando: rastro de brasa até onde o tiro bate, com uma chama no impacto
  emberTracer(a: THREE.Vector3, b: THREE.Vector3, hit: boolean) {
    const len = a.distanceTo(b);
    const n = Math.min(60, Math.ceil(len / 0.45));
    for (let i = 0; i < n; i++) {
      const u = (i + Math.random()) / n;
      this.add.spawn({
        x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u,
        vx: R(-0.1, 0.1), vy: R(0, 0.3), vz: R(-0.1, 0.1),
        life: R(0.08, 0.18), size: 0.09, size1: 0.02, r: 4, g: 1.3, b: 0.3, alpha: 1, alpha1: 0,
      });
    }
    if (hit) {
      for (let i = 0; i < 8; i++) {
        this.add.spawn({
          x: b.x, y: b.y, z: b.z, vx: R(-1.5, 1.5), vy: R(0, 2), vz: R(-1.5, 1.5),
          life: R(0.15, 0.35), size: R(0.15, 0.3), size1: 0.03, r: 4, g: 1.5, b: 0.3, alpha: 1, alpha1: 0, drag: 3,
        });
      }
    }
  }

  rayTrail(a: THREE.Vector3, b: THREE.Vector3) {
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / 0.3));
    for (let i = 0; i < n; i++) {
      const u = i / n;
      this.add.spawn({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, vx: 0, vy: 0, vz: 0, life: R(0.12, 0.22), size: 0.22, size1: 0.04, r: 0.5, g: 3, b: 0.8, alpha: 0.9, alpha1: 0 });
    }
  }

  rayBurst(p: THREE.Vector3) {
    for (let i = 0; i < 36; i++) {
      this.add.spawn({
        x: p.x, y: p.y, z: p.z,
        vx: R(-4, 4), vy: R(-1, 4), vz: R(-4, 4),
        life: R(0.3, 0.6), size: R(0.25, 0.6), size1: 0.05,
        r: 0.6, g: 3.2, b: 0.9, alpha: 1, alpha1: 0, drag: 3,
      });
    }
  }

  // Canhão de Vento: lufada de poeira e ar claro saindo em cone, mais um anel de choque na boca
  windGust(o: THREE.Vector3, d: THREE.Vector3, range: number) {
    const side = new THREE.Vector3(-d.z, 0, d.x).normalize();
    const up = new THREE.Vector3().crossVectors(side, d).normalize();
    const n = Math.round(140 * Math.max(0.5, this.density));
    for (let i = 0; i < n; i++) {
      const sp = R(0.55, 1) * range * 1.8;
      const a = R(0, Math.PI * 2), spread = R(0, 0.38);
      const vx = d.x + (side.x * Math.cos(a) + up.x * Math.sin(a)) * spread;
      const vy = d.y + (side.y * Math.cos(a) + up.y * Math.sin(a)) * spread;
      const vz = d.z + (side.z * Math.cos(a) + up.z * Math.sin(a)) * spread;
      const dust = i % 3 === 0;
      // começa a 1,8 m da boca (perto da câmera as partículas viram um clarão branco)
      const s0 = R(1.8, 3);
      (dust ? this.norm : this.add).spawn({
        x: o.x + vx * s0, y: o.y + vy * s0 - 0.1, z: o.z + vz * s0,
        vx: vx * sp, vy: vy * sp, vz: vz * sp,
        life: R(0.35, 0.6), size: R(0.1, 0.2), size1: R(0.9, 1.6), drag: 2.2,
        ...(dust ? { r: 0.42, g: 0.36, b: 0.3, alpha: 0.45, alpha1: 0 } : { r: 0.7, g: 0.8, b: 0.9, alpha: 0.18, alpha1: 0 }),
      });
    }
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const vx = side.x * Math.cos(a) + up.x * Math.sin(a);
      const vy = side.y * Math.cos(a) + up.y * Math.sin(a);
      const vz = side.z * Math.cos(a) + up.z * Math.sin(a);
      this.add.spawn({
        x: o.x + d.x * 1.6, y: o.y + d.y * 1.6 - 0.1, z: o.z + d.z * 1.6,
        vx: vx * 5 + d.x * 6, vy: vy * 5 + d.y * 6, vz: vz * 5 + d.z * 6,
        life: 0.25, size: 0.1, size1: 0.3, r: 1.0, g: 1.1, b: 1.3, alpha: 0.4, alpha1: 0, drag: 4,
      });
    }
  }

  // Arpão Elétrico: raio azul em zigue-zague de ponto em ponto, com faíscas em cada zumbi
  arcBolt(pts: THREE.Vector3[]) {
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      const len = a.distanceTo(b);
      const segs = Math.max(3, Math.ceil(len / 0.8));
      let p = a.clone();
      for (let s = 1; s <= segs; s++) {
        const q = s === segs ? b.clone() : a.clone().lerp(b, s / segs).add(new THREE.Vector3(R(-0.35, 0.35), R(-0.35, 0.35), R(-0.35, 0.35)));
        const n = Math.max(1, Math.ceil(p.distanceTo(q) / 0.12));
        for (let i = 0; i < n; i++) {
          const u = i / n;
          this.add.spawn({
            x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u, z: p.z + (q.z - p.z) * u,
            vx: 0, vy: 0, vz: 0, life: R(0.12, 0.24), size: R(0.08, 0.15), size1: 0.03,
            r: 1.0, g: 1.8, b: 3.4, r1: 0.4, g1: 0.7, b1: 2.4, alpha: 0.9, alpha1: 0,
          });
        }
        p = q;
      }
      for (let i = 0; i < 12; i++) {
        this.add.spawn({
          x: b.x, y: b.y, z: b.z, vx: R(-3, 3), vy: R(-1, 3), vz: R(-3, 3),
          life: R(0.15, 0.35), size: R(0.06, 0.12), r: 2.4, g: 3, b: 4.2, alpha: 1, alpha1: 0, gravity: 6, drag: 1,
        });
      }
    }
  }

  // Vórtice aberto: partículas roxas girando em espiral para dentro e um núcleo escuro
  vortexSwirl(c: THREE.Vector3, r: number, dt: number, k: number) {
    const rate = 160 * Math.max(0.4, this.density) * k;
    const n = Math.floor(rate * dt + Math.random());
    for (let i = 0; i < n; i++) {
      const a = R(0, Math.PI * 2);
      const rr = R(0.5, 1) * r;
      const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr, y = c.y + R(-1.2, 1.4) * (rr / r);
      // velocidade tangente + para o centro
      const tx = -Math.sin(a), tz = Math.cos(a);
      const s = R(4, 7);
      this.add.spawn({
        x, y, z,
        vx: (tx * s - Math.cos(a) * s * 0.8), vy: (c.y - y) * 0.9, vz: (tz * s - Math.sin(a) * s * 0.8),
        life: R(0.5, 0.9), size: R(0.12, 0.3), size1: 0.05,
        r: 1.6, g: 0.4, b: 2.8, r1: 0.4, g1: 0.1, b1: 1.2, alpha: 0.9, alpha1: 0, drag: 0.4,
      });
    }
  }

  vortexBurst(c: THREE.Vector3, inward: boolean) {
    for (let i = 0; i < 60; i++) {
      const a = R(0, Math.PI * 2), e = R(-0.6, 0.9);
      const dx = Math.cos(a) * Math.cos(e), dy = Math.sin(e), dz = Math.sin(a) * Math.cos(e);
      const s = R(3, 7);
      const r0 = inward ? 3.5 : 0.2;
      this.add.spawn({
        x: c.x + dx * r0, y: c.y + dy * r0, z: c.z + dz * r0,
        vx: dx * s * (inward ? -1 : 1), vy: dy * s * (inward ? -1 : 1), vz: dz * s * (inward ? -1 : 1),
        life: R(0.3, 0.55), size: R(0.2, 0.45), size1: 0.05, r: 2, g: 0.6, b: 3.4, alpha: 1, alpha1: 0, drag: 2,
      });
    }
  }

  // aviso no chão de onde vai subir um pilar de fogo (k = 0..1, cada vez mais forte)
  warnRing(x: number, z: number, r: number, k: number, dt: number) {
    const n = Math.floor(60 * dt * (0.5 + k) * Math.max(0.5, this.density) + Math.random());
    for (let i = 0; i < n; i++) {
      const a = R(0, Math.PI * 2);
      const rr = r * R(0.85, 1.05);
      this.add.spawn({
        x: x + Math.cos(a) * rr, y: 0.08, z: z + Math.sin(a) * rr,
        vx: 0, vy: R(0.3, 1.2) * (0.5 + k), vz: 0,
        life: R(0.25, 0.45), size: R(0.12, 0.22), size1: 0.04,
        r: 3, g: 0.9 * (1 - k * 0.5), b: 0.15, alpha: 0.9, alpha1: 0,
      });
    }
  }

  dirt(x: number, z: number) {
    for (let i = 0; i < 18; i++) {
      this.norm.spawn({
        x: x + R(-0.4, 0.4), y: 0.1, z: z + R(-0.4, 0.4),
        vx: R(-1.2, 1.2), vy: R(1.5, 4), vz: R(-1.2, 1.2),
        life: R(0.6, 1.1), size: R(0.06, 0.12), r: 0.16, g: 0.11, b: 0.07, alpha: 1, alpha1: 0.8, gravity: 9.8,
      });
    }
    for (let i = 0; i < 8; i++) {
      this.norm.spawn({
        x: x + R(-0.5, 0.5), y: 0.2, z: z + R(-0.5, 0.5),
        vx: R(-0.4, 0.4), vy: R(0.2, 0.6), vz: R(-0.4, 0.4),
        life: R(1.2, 2), size: 0.4, size1: 1.4, r: 0.22, g: 0.17, b: 0.12, alpha: 0.4, alpha1: 0, drag: 1,
      });
    }
  }

  dispose() {
    this.scene.remove(this.add.points, this.norm.points);
    this.add.dispose();
    this.norm.dispose();
  }
}
