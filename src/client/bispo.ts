import * as THREE from 'three';
import { BISPO } from '../shared/constants';
import { clamp, lerp } from '../shared/rng';
import { buildHumanoid, flatMat, part, type Humanoid } from './humanoid';
import type { TexSet } from './textures';

// Bispo: sacerdote morto-vivo de 3 m que flutua, de batina vinho, mitra, rosto de osso e cajado em brasa.

export interface BispoRig {
  h: Humanoid;
  // brasa no alto do cajado (pulsa ao lançar fogo)
  orb: THREE.Mesh;
  // esfera de fogo em volta enquanto troca de fase (imune)
  shield: THREE.Mesh;
  robe: THREE.Group;
}

export const BISPO_SCALE = 1.72;

export function buildBispo(tex: TexSet): BispoRig {
  const robe = flatMat(0x4a0c12, tex.grime);
  const robeDark = flatMat(0x26060a, tex.grime);
  const gold = flatMat(0xb08a30, null, 0x4a3008, 0.5);
  const bone = flatMat(0xd2c6aa, tex.grime);
  const cream = flatMat(0xddd2b8, tex.grime);
  const hits: THREE.Mesh[] = [];
  const h = buildHumanoid({
    skin: bone,
    shirt: robe,
    sleeves: robe,
    pants: robeDark,
    shoes: robeDark,
    hair: null,
    eyes: flatMat(0x000000, null, 0xffb030, 7),
    jaw: flatMat(0x1a0e0a),
    scale: BISPO_SCALE,
    bulk: 1.0,
  });
  // as pernas ficam escondidas na batina, que desce até o chão alargando
  h.legL.upper.visible = false;
  h.legR.upper.visible = false;
  const robeG = new THREE.Group();
  h.hips.add(robeG);
  for (let i = 0; i < 5; i++) {
    const w = 0.44 + i * 0.08, d = 0.32 + i * 0.06;
    part(robeG, w, 0.22, d, 0, -0.06 - i * 0.19, 0, i % 2 ? robe : robeDark, 'body', hits);
  }
  // barra rasgada embaixo
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    part(robeG, 0.12, 0.14, 0.04, Math.sin(a) * 0.36, -0.98, Math.cos(a) * 0.3, robeDark, null, hits).rotation.y = a;
  }
  // estola dourada na frente
  part(h.torso, 0.09, 0.62, 0.02, 0, 0.3, 0.165, gold, null, hits);
  part(robeG, 0.09, 0.8, 0.02, 0, -0.45, 0.2, gold, null, hits);
  part(h.torso, 0.5, 0.06, 0.34, 0, 0.6, 0, gold, null, hits);
  // mitra: alta, creme com cruz dourada
  part(h.head, 0.26, 0.08, 0.25, 0, 0.27, 0, gold, 'head', hits);
  part(h.head, 0.24, 0.2, 0.22, 0, 0.41, 0, cream, 'head', hits);
  part(h.head, 0.18, 0.14, 0.17, 0, 0.58, 0, cream, 'head', hits);
  part(h.head, 0.1, 0.1, 0.11, 0, 0.7, 0, cream, 'head', hits);
  part(h.head, 0.02, 0.16, 0.01, 0, 0.44, 0.112, gold, null, hits);
  part(h.head, 0.1, 0.02, 0.01, 0, 0.47, 0.112, gold, null, hits);
  for (const m of hits) h.hitMeshes.push(m);

  // cajado na mão direita: vara comprida, gancho dourado e a brasa
  const staff = new THREE.Group();
  staff.position.set(0, -0.36, 0.05);
  h.armR.lower.add(staff);
  const wood = flatMat(0x2a1a10, tex.grime);
  part(staff, 0.04, 1.9, 0.04, 0, 0.25, 0, wood, null, []);
  part(staff, 0.12, 0.04, 0.04, 0, 1.15, 0, gold, null, []);
  part(staff, 0.04, 0.16, 0.04, 0.06, 1.25, 0, gold, null, []);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.2, 0.3) }));
  orb.position.set(0, 1.27, 0);
  staff.add(orb);

  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(1.7, 24, 16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.28, 0.06), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide }),
  );
  shield.position.y = 1.7;
  shield.visible = false;
  h.root.add(shield);
  return { h, orb, shield, robe: robeG };
}

const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

export interface BispoPose {
  speed: number;
  t: number;
  anim: string;
  animT: number;
  shield: boolean;
}

// Flutua balançando; ergue os braços para lançar fogo e chamar zumbis; varre com o cajado de perto.
export function animateBispo(r: BispoRig, o: BispoPose) {
  const h = r.h;
  const hover = 0.3 + Math.sin(o.t * 1.6) * 0.08;
  h.body.position.y = hover;
  h.body.position.z = 0;
  h.hips.position.y = 0.92;
  const norm = clamp(o.speed / 2.4, 0, 1);
  let lean = 0.08 + 0.12 * norm;
  let armL = -0.35 + Math.sin(o.t * 1.3) * 0.08;
  let armR = -0.55;
  let armLz = -0.15;
  let armRz = 0.12;
  let elbowL = -0.5;
  let elbowR = -0.7;
  let neck = -0.05;
  let glow = 1 + Math.sin(o.t * 4) * 0.15;
  const a = o.animT;
  if (o.anim === 'cast') {
    // braços para o alto, a brasa do cajado ferve
    const up = smooth(a / 0.3);
    armL = lerp(armL, -2.6, up);
    armR = lerp(armR, -2.3, up);
    armLz = lerp(armLz, -0.5, up);
    armRz = lerp(armRz, 0.4, up);
    elbowL = elbowR = lerp(-0.5, -0.2, up);
    lean = lerp(lean, -0.25, up);
    neck = -0.35 * up;
    glow = 1.6 + Math.sin(o.t * 22) * 0.4;
  } else if (o.anim === 'attack') {
    // varrida com o cajado
    const S = BISPO.swing;
    const up = smooth(a / S.windup);
    const down = smooth((a - S.windup) / 0.18);
    const back = smooth((a - S.windup - 0.25) / (S.recover - 0.25));
    armR = lerp(lerp(armR, -2.5, up), -0.3, down);
    armR = lerp(armR, -0.55, back);
    armRz = lerp(0.12, 0.9, up * (1 - down));
    lean = lerp(lean, 0.45, down * (1 - back));
    h.torso.rotation.y = lerp(0.5 * up, -0.4, down) * (1 - back);
  } else if (o.anim === 'rise') {
    const e = smooth(a / BISPO.riseTime);
    h.body.position.y = -3.6 * (1 - e) + hover * e;
    armL = armR = -2.8 + Math.sin(o.t * 4) * 0.2;
    glow = 2;
  }
  if (o.anim !== 'attack') h.torso.rotation.y = 0;
  h.armL.upper.rotation.x = armL;
  h.armR.upper.rotation.x = armR;
  h.armL.upper.rotation.z = armLz;
  h.armR.upper.rotation.z = armRz;
  h.armL.lower.rotation.x = elbowL;
  h.armR.lower.rotation.x = elbowR;
  h.torso.rotation.x = lean;
  h.neck.rotation.x = neck;
  h.head.rotation.y = Math.sin(o.t * 0.6) * 0.2;
  r.robe.rotation.x = -lean * 0.6 + Math.sin(o.t * 2.1) * 0.03;
  r.orb.scale.setScalar(glow);
  r.shield.visible = o.shield;
  if (o.shield) {
    r.shield.scale.setScalar(1 + Math.sin(o.t * 9) * 0.05);
    (r.shield.material as THREE.MeshBasicMaterial).opacity = 0.09 + Math.sin(o.t * 13) * 0.04;
  }
}
