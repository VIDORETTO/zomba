import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Foliage, FoliageKind, MapDef } from '../shared/map/types';
import type { QualityConfig } from './quality';

// Vegetação do mapa (pinheiros, árvores, moitas, capim, milharal, pedras e tocos): uma malha instanciada por tipo
// em pedaços de 96 m, para a placa de vídeo pular o que está longe. O capim, o milho e as copas balançam com o vento.

const CHUNK = 96;
// até onde cada tipo é desenhado (além disso a névoa já esconde)
const CULL: Record<FoliageKind, number> = { pine: 150, oak: 150, bush: 90, grass: 60, corn: 90, rock: 110, stump: 80 };
// quanto o topo balança (m por metro de altura)
const SWAY: Record<FoliageKind, number> = { pine: 0.012, oak: 0.016, bush: 0.03, grass: 0.12, corn: 0.07, rock: 0, stump: 0 };

function paint(g: THREE.BufferGeometry, color: number, jitter = 0): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const n = ng.attributes.position.count;
  const c = new THREE.Color(color);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    // cada triângulo com um tom um pouco diferente: as copas ficam com aspecto de folhagem
    const k = 1 + (Math.random() - 0.5) * jitter;
    for (let v = 0; v < 3 && i + v < n; v++) {
      arr[(i + v) * 3] = c.r * k;
      arr[(i + v) * 3 + 1] = c.g * k;
      arr[(i + v) * 3 + 2] = c.b * k;
    }
  }
  ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  ng.deleteAttribute('uv');
  return ng;
}

// sacode os vértices de uma esfera baixa para não parecer uma bola perfeita
function lumpy(g: THREE.BufferGeometry, amount: number) {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + Math.sin(x * 5.3 + z * 3.1) * amount + Math.cos(y * 4.7 + x * 2.3) * amount;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function solidGeometry(kind: FoliageKind): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, color: number, x: number, y: number, z: number, jitter = 0.12) => {
    g.translate(x, y, z);
    parts.push(paint(g, color, jitter));
  };
  switch (kind) {
    case 'pine':
      add(new THREE.CylinderGeometry(0.16, 0.26, 2.6, 6), 0x4a3626, 0, 1.3, 0, 0.05);
      add(new THREE.ConeGeometry(2.3, 3.4, 8), 0x2c4329, 0, 3.6, 0);
      add(new THREE.ConeGeometry(1.8, 3.0, 8), 0x324d2e, 0, 5.4, 0);
      add(new THREE.ConeGeometry(1.2, 2.6, 7), 0x38552f, 0, 7.1, 0);
      break;
    case 'oak':
      add(new THREE.CylinderGeometry(0.22, 0.34, 3.2, 7), 0x463428, 0, 1.6, 0, 0.05);
      add(new THREE.CylinderGeometry(0.08, 0.12, 1.6, 5).rotateZ(0.7), 0x463428, 0.5, 3.0, 0, 0.05);
      add(lumpy(new THREE.IcosahedronGeometry(2.1, 1), 0.08), 0x56602c, 0, 4.4, 0, 0.22);
      add(lumpy(new THREE.IcosahedronGeometry(1.6, 1), 0.08), 0x6a6430, 1.3, 3.9, 0.6, 0.22);
      add(lumpy(new THREE.IcosahedronGeometry(1.5, 1), 0.08), 0x4c5a2a, -1.1, 4.0, -0.7, 0.22);
      break;
    case 'bush':
      add(lumpy(new THREE.IcosahedronGeometry(0.9, 0), 0.1).scale(1, 0.75, 1), 0x3d5130, 0, 0.55, 0, 0.25);
      add(lumpy(new THREE.IcosahedronGeometry(0.7, 0), 0.1).scale(1, 0.8, 1), 0x4a5a32, 0.65, 0.45, 0.3, 0.25);
      add(lumpy(new THREE.IcosahedronGeometry(0.6, 0), 0.1).scale(1, 0.8, 1), 0x56542e, -0.5, 0.4, -0.35, 0.25);
      break;
    case 'rock':
      add(lumpy(new THREE.DodecahedronGeometry(0.75, 0), 0.12).scale(1, 0.62, 1), 0x6a665e, 0, 0.3, 0, 0.18);
      break;
    case 'stump':
      add(new THREE.CylinderGeometry(0.3, 0.38, 0.6, 8), 0x4a3828, 0, 0.3, 0, 0.08);
      add(new THREE.CylinderGeometry(0.29, 0.29, 0.02, 8), 0x9a8060, 0, 0.61, 0, 0.05);
      break;
    default:
      throw new Error(kind);
  }
  return mergeGeometries(parts, false)!;
}

// capim e milho: planos cruzados com textura recortada
function cardGeometry(w: number, h: number, planes: number, bottom: number, top: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < planes; i++) {
    const g = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0).rotateY((i / planes) * Math.PI);
    // mais escuro embaixo, mais claro em cima
    const p = g.attributes.position;
    const c = new Float32Array(p.count * 3);
    const lo = new THREE.Color(bottom), hi = new THREE.Color(top);
    for (let v = 0; v < p.count; v++) {
      const k = p.getY(v) / h;
      c[v * 3] = lo.r + (hi.r - lo.r) * k;
      c[v * 3 + 1] = lo.g + (hi.g - lo.g) * k;
      c[v * 3 + 2] = lo.b + (hi.b - lo.b) * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    parts.push(g);
  }
  return mergeGeometries(parts, false)!;
}

function grassTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < 22; i++) {
    const x = 4 + Math.random() * 56;
    const lean = (Math.random() - 0.5) * 22;
    const h = 30 + Math.random() * 32;
    ctx.strokeStyle = `rgb(${200 + Math.random() * 55},${200 + Math.random() * 55},${180 + Math.random() * 60})`;
    ctx.lineWidth = 1.5 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(x, 64);
    ctx.quadraticCurveTo(x + lean * 0.3, 64 - h * 0.6, x + lean, 64 - h);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function cornTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < 3; i++) {
    const x = 14 + i * 18 + (Math.random() - 0.5) * 6;
    // talo
    ctx.strokeStyle = '#e8e0b0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, 128);
    ctx.lineTo(x + (Math.random() - 0.5) * 6, 8 + Math.random() * 10);
    ctx.stroke();
    // folhas compridas caindo para os lados
    ctx.strokeStyle = '#f0e8c0';
    ctx.lineWidth = 3.5;
    for (let k = 0; k < 6; k++) {
      const y = 100 - k * 15 - Math.random() * 6;
      const s = k % 2 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + s * 14, y - 12, x + s * (20 + Math.random() * 8), y + 6);
      ctx.stroke();
    }
    // espiga
    ctx.fillStyle = '#ffe9a0';
    ctx.fillRect(x + 1, 55 + Math.random() * 15, 5, 14);
    // pendão no topo
    ctx.strokeStyle = '#fff4c8';
    ctx.lineWidth = 1.5;
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.moveTo(x, 14);
      ctx.lineTo(x + k * 4, 2);
      ctx.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class FoliageView {
  private readonly group = new THREE.Group();
  private readonly meshes: { mesh: THREE.InstancedMesh; cull: number }[] = [];
  private readonly time = { value: 0 };
  private readonly disposables: { dispose(): void }[] = [];

  constructor(scene: THREE.Scene, map: MapDef, q: QualityConfig) {
    const list = map.foliage ?? [];
    if (!list.length) return;
    // baixa qualidade: só um terço do capim e metade das moitas
    const keep = (f: Foliage, i: number) => q.level !== 'baixa' || (f.kind === 'grass' ? i % 3 === 0 : f.kind === 'bush' ? i % 2 === 0 : true);
    const byKind = new Map<FoliageKind, Map<string, Foliage[]>>();
    list.forEach((f, i) => {
      if (!keep(f, i)) return;
      let chunks = byKind.get(f.kind);
      if (!chunks) byKind.set(f.kind, (chunks = new Map()));
      const k = `${Math.floor(f.x / CHUNK)},${Math.floor(f.z / CHUNK)}`;
      let l = chunks.get(k);
      if (!l) chunks.set(k, (l = []));
      l.push(f);
    });

    const m4 = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const tint = new THREE.Color();
    for (const [kind, chunks] of byKind) {
      const card = kind === 'grass' || kind === 'corn';
      const geo = kind === 'grass'
        ? cardGeometry(1.1, 0.75, 3, 0x3a4424, 0x8a8a52)
        : kind === 'corn'
          ? cardGeometry(1.3, 2.4, 2, 0x5a5a2a, 0xb0a058)
          : solidGeometry(kind);
      const map = kind === 'grass' ? grassTexture() : kind === 'corn' ? cornTexture() : null;
      const mat = new THREE.MeshLambertMaterial({
        vertexColors: true,
        map,
        alphaTest: card ? 0.45 : 0,
        side: card ? THREE.DoubleSide : THREE.FrontSide,
        flatShading: !card,
      });
      const amp = SWAY[kind];
      if (amp > 0) {
        mat.onBeforeCompile = (sh) => {
          sh.uniforms.uTime = this.time;
          sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            #ifdef USE_INSTANCING
              float ph = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
            #else
              float ph = 0.0;
            #endif
            float sway = max(0.0, position.y) * ${amp.toFixed(3)};
            transformed.x += (sin(uTime * 1.3 + ph) + 0.4 * sin(uTime * 3.1 + ph * 2.0)) * sway;
            transformed.z += cos(uTime * 1.1 + ph * 1.3) * sway * 0.6;`,
          );
        };
      }
      this.disposables.push(geo, mat);
      if (map) this.disposables.push(map);
      for (const items of chunks.values()) {
        const mesh = new THREE.InstancedMesh(geo, mat, items.length);
        items.forEach((f, i) => {
          quat.setFromAxisAngle(up, f.r);
          pos.set(f.x, kind === 'rock' ? -0.05 : 0, f.z);
          // pedras e moitas um pouco achatadas ou esticadas, ao acaso
          const sx = f.s * (kind === 'rock' || kind === 'bush' ? 0.85 + ((i * 7) % 5) * 0.08 : 1);
          scl.set(sx, f.s, f.s);
          m4.compose(pos, quat, scl);
          mesh.setMatrixAt(i, m4);
          // cada planta com um tom levemente diferente
          const v = 0.82 + (((i * 2654435761) >>> 0) % 1000) / 1000 * 0.36;
          tint.setRGB(v, v * (0.96 + ((i * 97) % 9) * 0.01), v * 0.95);
          mesh.setColorAt(i, tint);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = q.shadows && (kind === 'pine' || kind === 'oak' || kind === 'rock');
        mesh.receiveShadow = q.shadows && !card;
        mesh.matrixAutoUpdate = false;
        this.group.add(mesh);
        this.meshes.push({ mesh, cull: CULL[kind] });
      }
    }
    scene.add(this.group);
  }

  update(t: number, cam: THREE.Vector3) {
    this.time.value = t;
    for (const { mesh, cull } of this.meshes) {
      const s = mesh.boundingSphere!;
      mesh.visible = Math.hypot(s.center.x - cam.x, s.center.z - cam.z) - s.radius < cull;
    }
  }

  dispose() {
    this.group.removeFromParent();
    for (const { mesh } of this.meshes) mesh.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

// Bancos de névoa rasteiros que passam devagar com o vento perto do jogador (só fora das paradas).
export class FogBanks {
  private readonly group = new THREE.Group();
  private readonly sprites: { s: THREE.Sprite; vx: number; vz: number }[] = [];
  private readonly mat: THREE.SpriteMaterial;
  private readonly tex: THREE.Texture;
  private k = 0;

  constructor(scene: THREE.Scene, count: number) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    // várias manchas macias juntas: nuvem irregular, não um círculo
    // manchas longe das bordas (a borda de baixo nunca marca uma linha no chão)
    for (let i = 0; i < 9; i++) {
      const x = 34 + Math.random() * 60, y = 52 + Math.random() * 24, r = 16 + Math.random() * 14;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
    this.tex = new THREE.CanvasTexture(c);
    this.mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, opacity: 0, fog: true });
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(this.mat);
      s.visible = false;
      this.group.add(s);
      this.sprites.push({ s, vx: 0, vz: 0 });
    }
    scene.add(this.group);
  }

  private place(it: { s: THREE.Sprite; vx: number; vz: number }, cam: THREE.Vector3, near: boolean) {
    const a = Math.random() * Math.PI * 2;
    const d = near ? 6 + Math.random() * 34 : 30 + Math.random() * 12;
    const w = 9 + Math.random() * 10;
    const h = w * (0.3 + Math.random() * 0.14);
    // a mancha mais baixa da textura fica a ~30% da altura: o centro sobe o bastante para não entrar no chão
    it.s.position.set(cam.x + Math.cos(a) * d, h * 0.42 + Math.random() * 0.6, cam.z + Math.sin(a) * d);
    it.s.scale.set(w, h, 1);
    it.vx = 0.7 + Math.random() * 0.5;
    it.vz = 0.25 + Math.random() * 0.3;
    it.s.visible = true;
  }

  // k: 0 = parada (sem bancos), 1 = estrada na névoa; color: cor atual da névoa
  update(dt: number, cam: THREE.Vector3, k: number, color: THREE.Color) {
    const was = this.k;
    this.k = k;
    this.mat.opacity = 0.42 * k;
    this.mat.color.copy(color).lerp(new THREE.Color(1, 1, 1), 0.12);
    this.group.visible = k > 0.01;
    if (!this.group.visible) return;
    for (const it of this.sprites) {
      if (!it.s.visible || was <= 0.01) {
        this.place(it, cam, true);
        continue;
      }
      it.s.position.x += it.vx * dt;
      it.s.position.z += it.vz * dt;
      const d = Math.hypot(it.s.position.x - cam.x, it.s.position.z - cam.z);
      // longe demais ou colado na câmera (cobriria a tela): volta para a borda
      if (d > 44 || d < 3.5) this.place(it, cam, false);
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.mat.dispose();
    this.tex.dispose();
  }
}
