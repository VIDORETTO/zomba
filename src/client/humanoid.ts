import * as THREE from 'three';
import type { HitPart } from '../shared/weapons';

// Boneco articulado feito de caixas. O modelo olha para +Z.
// Hierarquia: root > hips > (torso > neck > head, ombros > cotovelos), (quadris > joelhos)

export interface Limb {
  upper: THREE.Group;
  lower: THREE.Group;
}

export interface Humanoid {
  root: THREE.Group;
  body: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  armL: Limb;
  armR: Limb;
  legL: Limb;
  legR: Limb;
  hitMeshes: THREE.Mesh[];
}

export interface HumanoidLook {
  skin: THREE.Material;
  shirt: THREE.Material;
  sleeves?: THREE.Material;
  pants: THREE.Material;
  shoes: THREE.Material;
  hair?: THREE.Material | null;
  eyes?: THREE.Material | null;
  jaw?: THREE.Material;
  scale?: number;
  bulk?: number;
}

// Sombra difusa no chão debaixo do personagem. O mapa de sombra do sol é calculado uma vez só
// (o cenário não se mexe), então quem anda leva a própria mancha escura.
let blobGeo: THREE.PlaneGeometry | null = null;
let blobMat: THREE.MeshBasicMaterial | null = null;
export function blobShadow(radius: number): THREE.Mesh {
  if (!blobGeo) {
    blobGeo = new THREE.PlaneGeometry(1, 1);
    blobGeo.rotateX(-Math.PI / 2);
  }
  if (!blobMat) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.85)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    blobMat = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }
  const m = new THREE.Mesh(blobGeo, blobMat);
  m.scale.set(radius * 2, 1, radius * 2);
  m.position.y = 0.025;
  m.renderOrder = -1;
  m.name = 'blob';
  return m;
}

const boxCache = new Map<string, THREE.BoxGeometry>();
function boxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const k = `${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)}`;
  let g = boxCache.get(k);
  if (!g) boxCache.set(k, (g = new THREE.BoxGeometry(w, h, d)));
  return g;
}

export function part(
  parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number,
  mat: THREE.Material, hit: HitPart | null, list: THREE.Mesh[],
): THREE.Mesh {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat);
  m.position.set(x, y, z);
  if (hit) {
    m.userData.part = hit;
    list.push(m);
  }
  parent.add(m);
  return m;
}

export function buildHumanoid(look: HumanoidLook): Humanoid {
  const hitMeshes: THREE.Mesh[] = [];
  const b = look.bulk ?? 1;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(look.scale ?? 1);
  root.add(body);
  root.add(blobShadow(0.48 * (look.scale ?? 1) * Math.sqrt(b)));

  const hips = new THREE.Group();
  hips.position.y = 0.92;
  body.add(hips);
  part(hips, 0.36 * b, 0.2, 0.22 * b, 0, 0, 0, look.pants, 'body', hitMeshes);

  const torso = new THREE.Group();
  torso.position.y = 0.06;
  hips.add(torso);
  part(torso, 0.42 * b, 0.5, 0.24 * b, 0, 0.28, 0, look.shirt, 'body', hitMeshes);

  const neck = new THREE.Group();
  neck.position.y = 0.55;
  torso.add(neck);
  part(neck, 0.1, 0.08, 0.1, 0, 0.03, 0, look.skin, 'head', hitMeshes);
  const head = new THREE.Group();
  head.position.y = 0.06;
  neck.add(head);
  part(head, 0.24, 0.25, 0.26, 0, 0.12, 0, look.skin, 'head', hitMeshes);
  part(head, 0.2, 0.06, 0.2, 0, -0.01, 0.03, look.jaw ?? look.skin, 'head', hitMeshes);
  if (look.hair) part(head, 0.26, 0.07, 0.28, 0, 0.27, -0.01, look.hair, 'head', hitMeshes);
  if (look.eyes) {
    part(head, 0.055, 0.03, 0.02, -0.058, 0.15, 0.131, look.eyes, null, hitMeshes);
    part(head, 0.055, 0.03, 0.02, 0.058, 0.15, 0.131, look.eyes, null, hitMeshes);
  }

  const arm = (side: number): Limb => {
    const upper = new THREE.Group();
    upper.position.set(side * (0.27 * b), 0.48, 0);
    torso.add(upper);
    part(upper, 0.12, 0.3, 0.12, 0, -0.14, 0, look.sleeves ?? look.shirt, 'limb', hitMeshes);
    const lower = new THREE.Group();
    lower.position.y = -0.29;
    upper.add(lower);
    part(lower, 0.105, 0.27, 0.105, 0, -0.13, 0, look.skin, 'limb', hitMeshes);
    part(lower, 0.09, 0.1, 0.11, 0, -0.31, 0.01, look.skin, 'limb', hitMeshes);
    return { upper, lower };
  };

  const leg = (side: number): Limb => {
    const upper = new THREE.Group();
    upper.position.set(side * 0.105 * b, -0.02, 0);
    hips.add(upper);
    part(upper, 0.16, 0.45, 0.17, 0, -0.22, 0, look.pants, 'limb', hitMeshes);
    const lower = new THREE.Group();
    lower.position.y = -0.44;
    upper.add(lower);
    part(lower, 0.13, 0.42, 0.14, 0, -0.21, 0, look.pants, 'limb', hitMeshes);
    part(lower, 0.13, 0.07, 0.26, 0, -0.44, 0.05, look.shoes, 'limb', hitMeshes);
    return { upper, lower };
  };

  return {
    root, body, hips, torso, neck, head,
    armL: arm(-1), armR: arm(1), legL: leg(-1), legR: leg(1),
    hitMeshes,
  };
}

// Na qualidade baixa os personagens usam Lambert (mais barato que o material PBR).
let simple = false;
export function setSimpleMaterials(v: boolean) {
  simple = v;
}

const matCache = new Map<string, THREE.Material>();
export function flatMat(color: number, map: THREE.Texture | null = null, emissive = 0, emissiveIntensity = 0): THREE.Material {
  const k = `${simple}:${color}:${map?.id ?? ''}:${emissive}:${emissiveIntensity}`;
  let m = matCache.get(k);
  if (!m) {
    const p = { color, map, emissive: new THREE.Color(emissive), emissiveIntensity };
    m = simple ? new THREE.MeshLambertMaterial(p) : new THREE.MeshStandardMaterial({ ...p, roughness: 0.9, metalness: 0 });
    matCache.set(k, m);
  }
  return m;
}
