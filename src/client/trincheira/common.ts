import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Element } from '../../shared/protocol';

// Som da Trincheira: o dono do áudio cria estes métodos no AudioEngine; aqui só chamamos (se faltar, não faz nada).
export interface TrAudio {
  trSound(name: string, pos?: THREE.Vector3, vol?: number): void;
  setWeather(w: 'limpo' | 'chuva' | 'neve'): void;
}

export class Snd {
  private readonly a: Partial<TrAudio>;
  constructor(audio: unknown) {
    this.a = (audio ?? {}) as Partial<TrAudio>;
  }
  play(name: string, pos?: THREE.Vector3, vol?: number) {
    try {
      this.a.trSound?.(name, pos, vol);
    } catch {
      // sem som: segue só com a imagem
    }
  }
  weather(w: 'limpo' | 'chuva' | 'neve') {
    try {
      this.a.setWeather?.(w);
    } catch {
      // idem
    }
  }
}

// cores por elemento em THREE.Color (linear)
export const EL_COLOR: Record<Element, THREE.Color> = {
  fogo: new THREE.Color(0xff7a2a),
  gelo: new THREE.Color(0x6ab8ff),
  vento: new THREE.Color(0xffe14a),
  raio: new THREE.Color(0xb06aff),
};

// ---------- texturas pequenas em canvas (uma vez só) ----------
const cache = new Map<string, THREE.Texture>();
function once(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

export function glowTex(): THREE.Texture {
  return once('glow', () => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  });
}

// coluna de luz que some para cima
export function beamTex(): THREE.Texture {
  return once('beam', () => {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 128, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0.05)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 128);
    return new THREE.CanvasTexture(c);
  });
}

// anel suave
export function ringTex(): THREE.Texture {
  return once('ring', () => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 40, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.8)');
    g.addColorStop(0.88, 'rgba(255,255,255,0.3)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  });
}

// texto num quadrado (número das placas, letras)
export function labelTex(text: string, color = '#e8e0d0', bg = 'rgba(20,18,16,0.85)', size = 128): THREE.Texture {
  return once(`label:${text}:${color}:${bg}`, () => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = color;
    ctx.lineWidth = size * 0.04;
    ctx.strokeRect(size * 0.06, size * 0.06, size * 0.88, size * 0.88);
    ctx.fillStyle = color;
    ctx.font = `900 ${size * 0.62}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, size / 2 + size * 0.04);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

// ---------- materiais ----------
const matCache = new Map<string, THREE.Material>();

export function basic(color: number | THREE.Color, opts: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  const c = new THREE.Color(color);
  const k = `b:${c.getHexString()}:${JSON.stringify(opts, (_, v) => (v && v.isTexture ? v.id : v))}`;
  let m = matCache.get(k) as THREE.MeshBasicMaterial | undefined;
  if (!m) matCache.set(k, (m = new THREE.MeshBasicMaterial({ color: c, ...opts })));
  return m;
}

export function additive(color: number | THREE.Color, opts: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  return basic(color, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, ...opts });
}

// material "de pedra/metal" com a textura do mapa (tex.rune, tex.rivet, tex.stone...) e cor
export function solid(tex: Record<string, THREE.Texture>, name: string, color: number, simple: boolean, rough = 0.85, metal = 0): THREE.Material {
  const map = tex[name] ?? null;
  if (map) {
    // as texturas do mapa repetem a cada "scale" m; aqui os objetos são pequenos, repete 1x
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
  }
  const k = `s:${name}:${color}:${simple}:${rough}:${metal}`;
  let m = matCache.get(k);
  if (!m) {
    m = simple
      ? new THREE.MeshLambertMaterial({ color, map })
      : new THREE.MeshStandardMaterial({ color, map, roughness: rough, metalness: metal });
    matCache.set(k, m);
  }
  return m;
}

// caixa já posicionada (centro), com geometria reaproveitada
const boxes = new Map<string, THREE.BoxGeometry>();
export function boxMesh(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const k = `${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)}`;
  let g = boxes.get(k);
  if (!g) boxes.set(k, (g = new THREE.BoxGeometry(w, h, d)));
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  return m;
}

const cyls = new Map<string, THREE.CylinderGeometry>();
export function cylMesh(rt: number, rb: number, h: number, mat: THREE.Material, seg = 12, x = 0, y = 0, z = 0): THREE.Mesh {
  const k = `${rt.toFixed(3)},${rb.toFixed(3)},${h.toFixed(3)},${seg}`;
  let g = cyls.get(k);
  if (!g) cyls.set(k, (g = new THREE.CylinderGeometry(rt, rb, h, seg)));
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  return m;
}

export function glowSprite(color: THREE.Color | number, scale: number, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false }));
  s.scale.setScalar(scale);
  return s;
}

export function beamMesh(color: THREE.Color | number, radius: number, height: number, opacity = 0.5): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radius, radius, height, 14, 1, true).translate(0, height / 2, 0);
  const mat = new THREE.MeshBasicMaterial({ map: beamTex(), color: new THREE.Color(color), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, opacity });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  m.frustumCulled = false;
  return m;
}

export function flatRing(color: THREE.Color | number, radius: number, opacity = 0.8): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: ringTex(), color: new THREE.Color(color), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = 0.06;
  m.renderOrder = 1;
  return m;
}

export function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh || (c as THREE.Sprite).isSprite) {
      // geometrias e materiais compartilhados (cache) não são descartados aqui: a cena inteira morre junto
    }
  });
  o.removeFromParent();
}

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (k: number) => k * k * (3 - 2 * k);
export function angLerp(a: number, b: number, k: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

// material "de peça": mais claro e com brilho próprio, para se ver de longe na névoa e na sombra
export function glowy(tex: Record<string, THREE.Texture>, color: number, simple: boolean): THREE.Material {
  const k = `g:${color}:${simple}`;
  let m = matCache.get(k);
  if (!m) {
    const em = new THREE.Color(color).multiplyScalar(0.35);
    m = simple
      ? new THREE.MeshLambertMaterial({ color, emissive: em })
      : new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.5, emissive: em, map: tex.rivet ?? null });
    matCache.set(k, m);
  }
  return m;
}

// junta caixas e cilindros em uma malha por material
export class Merger {
  private readonly parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();

  private add(mat: THREE.Material, geo: THREE.BufferGeometry, x: number, y: number, z: number, rx: number, ry: number, rz: number) {
    this.e.set(rx, ry, rz, 'YXZ');
    this.q.setFromEuler(this.e);
    this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(this.m);
    let list = this.parts.get(mat);
    if (!list) this.parts.set(mat, (list = []));
    list.push(geo);
  }

  // caixa centrada em (x, y, z)
  box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) {
    this.add(mat, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  }

  // caixa pelos dois cantos opostos (mais fácil para tábuas e vigas)
  span(mat: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    this.box(mat, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  }

  // viga entre dois pontos
  beam(mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, th: number) {
    const len = a.distanceTo(b);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const g = new THREE.BoxGeometry(th, th, len);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize());
    this.m.compose(mid, q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(this.m);
    let list = this.parts.get(mat);
    if (!list) this.parts.set(mat, (list = []));
    list.push(g);
  }

  cyl(mat: THREE.Material, rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number, rx = 0, rz = 0, open = false) {
    this.add(mat, new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), x, y, z, rx, 0, rz);
  }

  geo(mat: THREE.Material, g: THREE.BufferGeometry) {
    let list = this.parts.get(mat);
    if (!list) this.parts.set(mat, (list = []));
    list.push(g);
  }

  build(name: string, shadow = true): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    for (const [mat, list] of this.parts) {
      const merged = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
}
