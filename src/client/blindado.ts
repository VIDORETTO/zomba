import * as THREE from 'three';
import { BOSS } from '../shared/constants';
import { clamp, lerp } from '../shared/rng';
import { buildHumanoid, flatMat, part, type Humanoid } from './humanoid';
import type { TexSet } from './textures';

// Blindado: soldado dentro de uma armadura mecânica a vapor (sem insígnias). Lança-chamas no braço esquerdo,
// garra com corrente no direito, mochila-foguete nas costas e um visor de ferro que quebra.

export interface BlindadoRig {
  h: Humanoid;
  // placa do visor (sai voando quando o visor quebra, como o capacete do Carrasco)
  helmet: THREE.Group;
  // corrente enrolada na mão direita (some quando a garra é lançada)
  coil: THREE.Group;
  // corrente esticada até o alvo, no espaço do mundo
  line: THREE.Group;
  lineBody: THREE.Mesh;
  hook: THREE.Group;
  // jato do lança-chamas (cones no antebraço esquerdo, apontando para -Y do antebraço)
  flame: THREE.Group;
  // jatos da mochila-foguete
  pack: THREE.Group;
}

export const BLINDADO_SCALE = 1.5;

const flameMat = () => new THREE.MeshBasicMaterial({
  color: new THREE.Color(2.2, 0.85, 0.18), transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending,
});

export function buildBlindado(tex: TexSet): BlindadoRig {
  const steel = flatMat(0x5f646a, tex.grime);
  const dark = flatMat(0x2b2d30, tex.grime);
  const brass = flatMat(0x9a7a34, null, 0x2a1c06, 0.4);
  const rust = flatMat(0x5a3a26, tex.grime);
  const hits: THREE.Mesh[] = [];
  const b = 1.5;
  const h = buildHumanoid({
    skin: flatMat(0x3a3836, tex.grime),
    shirt: steel,
    sleeves: dark,
    pants: dark,
    shoes: flatMat(0x1a1714),
    hair: null,
    eyes: null,
    jaw: dark,
    scale: BLINDADO_SCALE,
    bulk: b,
  });
  // couraça, ombreiras largas, cinto e rebites
  part(h.torso, 0.66, 0.44, 0.07, 0, 0.34, 0.2, steel, 'body', hits);
  part(h.torso, 0.64, 0.46, 0.06, 0, 0.32, -0.2, steel, 'body', hits);
  for (let i = 0; i < 4; i++) part(h.torso, 0.035, 0.035, 0.02, -0.24 + i * 0.16, 0.52, 0.24, brass, null, hits);
  part(h.hips, 0.42 * b, 0.1, 0.28 * b, 0, 0.07, 0, rust, 'body', hits);
  for (const arm of [h.armL, h.armR]) {
    part(arm.upper, 0.26, 0.15, 0.26, 0, 0.03, 0, steel, 'body', hits);
    part(arm.upper, 0.2, 0.05, 0.2, 0, 0.11, 0, brass, null, hits);
  }
  for (const leg of [h.legL, h.legR]) {
    part(leg.upper, 0.2, 0.3, 0.2, 0, -0.2, 0, steel, 'limb', hits);
    part(leg.lower, 0.2, 0.24, 0.1, 0, -0.12, 0.08, steel, 'limb', hits);
    part(leg.lower, 0.17, 0.08, 0.3, 0, -0.44, 0.06, dark, 'limb', hits);
  }
  // canos de vapor ao longo da coluna
  for (const x of [-0.16, 0.16]) part(h.torso, 0.05, 0.5, 0.05, x, 0.3, -0.27, brass, null, hits);

  // elmo fechado: o visor (placa que quebra) tem a fenda dos olhos acesa
  part(h.head, 0.3, 0.26, 0.32, 0, 0.16, 0, steel, 'head', hits);
  part(h.head, 0.3, 0.05, 0.32, 0, 0.3, 0, dark, 'head', hits);
  const helmet = new THREE.Group();
  h.head.add(helmet);
  part(helmet, 0.28, 0.16, 0.05, 0, 0.15, 0.17, dark, 'head', hits);
  part(helmet, 0.22, 0.035, 0.02, 0, 0.17, 0.2, flatMat(0x000000, null, 0xffa020, 5), null, hits);
  part(helmet, 0.03, 0.14, 0.02, 0, 0.15, 0.2, brass, null, hits);

  // braço esquerdo: lança-chamas (tubo, tanque e bico)
  const nozzle = new THREE.Group();
  nozzle.position.set(0, -0.3, 0.02);
  h.armL.lower.add(nozzle);
  part(nozzle, 0.1, 0.22, 0.1, 0, -0.04, 0, dark, 'limb', hits);
  part(nozzle, 0.07, 0.1, 0.07, 0, -0.18, 0, brass, null, hits);
  part(h.armL.lower, 0.16, 0.2, 0.16, -0.1, -0.1, 0, rust, null, hits);
  const flame = new THREE.Group();
  flame.position.set(0, -0.26, 0.02);
  nozzle.add(flame);
  const fm = flameMat();
  for (let i = 0; i < 3; i++) {
    // cone com a ponta no bico e a base larga longe dele (-Y é a direção do braço esticado)
    const len = 2.4 + i * 0.6;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.34 - i * 0.08, len, 10, 1, true), fm);
    c.position.y = -len / 2;
    flame.add(c);
  }
  flame.visible = false;

  // braço direito: garra de três dedos e a corrente enrolada
  const claw = new THREE.Group();
  claw.position.set(0, -0.36, 0.03);
  h.armR.lower.add(claw);
  part(claw, 0.14, 0.08, 0.14, 0, 0, 0, dark, 'limb', hits);
  for (const x of [-0.05, 0, 0.05]) {
    const f = part(claw, 0.03, 0.14, 0.03, x, -0.1, 0.03, steel, null, hits);
    f.rotation.x = -0.4;
  }
  const coil = new THREE.Group();
  coil.position.set(0.12, -0.2, 0);
  h.armR.lower.add(coil);
  const link = flatMat(0x62666c);
  for (let i = 0; i < 7; i++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(i % 2 ? 0.02 : 0.05, 0.07, i % 2 ? 0.05 : 0.02), link);
    l.position.set(0, -0.05 - i * 0.06, 0);
    coil.add(l);
  }
  const hookAt = (g: THREE.Group, y: number) => {
    for (const x of [-0.05, 0, 0.05]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), steel);
      f.position.set(x, y, 0.03);
      f.rotation.x = -0.4;
      g.add(f);
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.07), dark);
    base.position.set(0, y + 0.08, 0);
    g.add(base);
  };
  hookAt(coil, -0.5);

  const line = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.07, 0.07, 1);
  geo.translate(0, 0, 0.5);
  const lineBody = new THREE.Mesh(geo, link);
  line.add(lineBody);
  const hook = new THREE.Group();
  hookAt(hook, 0);
  hook.rotation.x = Math.PI / 2;
  line.add(hook);
  line.visible = false;

  // mochila-foguete: dois cilindros com bico e o jato
  const pack = new THREE.Group();
  pack.position.set(0, 0.34, -0.3);
  h.torso.add(pack);
  const pm = flameMat();
  for (const x of [-0.14, 0.14]) {
    part(h.torso, 0.14, 0.42, 0.14, x, 0.32, -0.34, steel, null, hits);
    part(h.torso, 0.1, 0.06, 0.1, x, 0.08, -0.34, brass, null, hits);
    const jet = new THREE.Mesh(new THREE.ConeGeometry(0.1, 1.0, 8, 1, true), pm);
    jet.position.set(x, -0.5, -0.04);
    pack.add(jet);
  }
  pack.visible = false;

  for (const m of hits) h.hitMeshes.push(m);
  return { h, helmet, coil, line, lineBody, hook, flame, pack };
}

const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

export interface BlindadoPose {
  phase: number;
  speed: number;
  t: number;
  anim: string;
  // tempo desde o começo da animação atual
  animT: number;
}

// duração da descida do céu e do salto (a simulação manda a animação; o tempo fica por conta daqui)
const FALL = 2.4;
const JUMP = { crouch: 0.5, air: 1.2 };

// Andar pesado, lança-chamas, garra, salto com a mochila e descida do céu.
export function animateBlindado(r: BlindadoRig, o: BlindadoPose) {
  const h = r.h;
  const norm = clamp(o.speed / 2.0, 0, 1.6);
  const s = Math.sin(o.phase);
  const c = Math.cos(o.phase);
  const amp = 0.42 * Math.min(1, norm);

  h.legL.upper.rotation.x = s * amp;
  h.legR.upper.rotation.x = -s * amp;
  h.legL.lower.rotation.x = Math.max(0, -c) * amp * 1.3 + 0.05;
  h.legR.lower.rotation.x = Math.max(0, c) * amp * 1.3 + 0.05;
  h.hips.position.y = 0.92 - Math.abs(s) * 0.04 * norm;
  h.hips.rotation.y = s * 0.08 * norm;
  h.body.position.y = 0;
  h.body.position.z = 0;
  let lean = 0.1 + 0.08 * norm;
  let armL = -0.3 + s * 0.2 * norm;
  let armR = -0.3 - s * 0.25 * norm;
  let armLz = -0.15;
  let armRz = 0.15;
  let elbowL = -0.25;
  let elbowR = -0.45;
  let neck = -0.05;
  r.coil.visible = true;
  r.flame.visible = false;
  r.pack.visible = false;
  const a = o.animT;

  if (o.anim === 'attack') {
    // braço esticado à frente, jato de fogo tremendo
    const up = smooth(a / 0.25);
    armL = lerp(armL, -1.5, up);
    armLz = lerp(armLz, 0, up);
    elbowL = lerp(elbowL, -0.05, up);
    lean = lerp(lean, 0.2, up);
    r.flame.visible = up > 0.6;
    const k = 0.85 + Math.sin(o.t * 40) * 0.12 + Math.sin(o.t * 23) * 0.08;
    r.flame.scale.set(1 + Math.sin(o.t * 31) * 0.1, k, 1 + Math.cos(o.t * 27) * 0.1);
  } else if (o.anim === 'chain') {
    // gira o braço para trás e lança a garra
    const S = BOSS.chain;
    const wind = smooth(a / S.windup);
    const thr = smooth((a - S.windup) / 0.12);
    const back = smooth((a - S.windup - S.fly) / S.recover);
    armR = lerp(lerp(-0.3, -2.4, wind), -1.45, thr);
    armR = lerp(armR, -0.3, back);
    armRz = lerp(0.15, 0.9 * (1 - thr), wind);
    elbowR = lerp(-0.45, -1.4 * (1 - thr), wind);
    lean = lerp(lean, -0.1, wind * (1 - thr)) + 0.25 * thr * (1 - back);
    r.coil.visible = a < S.windup || back > 0.9;
  } else if (o.anim === 'charge') {
    // salto com a mochila: agacha, impulsiona e voa em arco
    const C = JUMP;
    if (a < C.crouch) {
      const k = smooth(a / C.crouch);
      h.hips.position.y -= 0.25 * k;
      h.legL.upper.rotation.x = -0.9 * k;
      h.legR.upper.rotation.x = -0.9 * k;
      h.legL.lower.rotation.x = 1.5 * k;
      h.legR.lower.rotation.x = 1.5 * k;
      lean = 0.5 * k;
      armL = armR = -0.4 * k;
      r.pack.visible = k > 0.7;
    } else if (a < C.crouch + C.air) {
      const k = (a - C.crouch) / C.air;
      h.body.position.y = Math.sin(Math.PI * k) * 1.6;
      h.legL.upper.rotation.x = -0.5;
      h.legR.upper.rotation.x = -0.3;
      h.legL.lower.rotation.x = 0.8;
      h.legR.lower.rotation.x = 0.6;
      lean = 0.45;
      armL = armR = -0.8;
      r.pack.visible = true;
    } else {
      // pousa: amortece
      const k = 1 - smooth((a - C.crouch - C.air) / 0.5);
      h.hips.position.y -= 0.2 * k;
      lean = 0.3 * k;
    }
    if (r.pack.visible) r.pack.scale.set(1, 0.8 + Math.sin(o.t * 45) * 0.2, 1);
  } else if (o.anim === 'rise') {
    // desce do céu de mochila: começa no alto e pousa
    const e = smooth(a / FALL);
    h.body.position.y = 18 * (1 - e) * (1 - e);
    armL = armR = -0.7;
    lean = 0.15;
    r.pack.visible = e < 0.97;
    r.pack.scale.set(1, 1 + Math.sin(o.t * 40) * 0.2, 1);
    h.legL.upper.rotation.x = -0.2;
    h.legR.upper.rotation.x = 0.1;
  }

  h.armL.upper.rotation.x = armL;
  h.armR.upper.rotation.x = armR;
  h.armL.upper.rotation.z = armLz;
  h.armR.upper.rotation.z = armRz;
  h.armL.lower.rotation.x = elbowL;
  h.armR.lower.rotation.x = elbowR;
  h.torso.rotation.x = lean;
  h.neck.rotation.x = neck;
  h.head.rotation.y = Math.sin(o.t * 0.5) * 0.12;
}
