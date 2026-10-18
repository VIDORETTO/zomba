import * as THREE from 'three';
import { BOSS } from '../shared/constants';
import { clamp, lerp } from '../shared/rng';
import { buildHumanoid, flatMat, part, type Humanoid } from './humanoid';
import type { TexSet } from './textures';

// Carrasco: zumbi de 3 m com placas de ferro, capacete de balde com espinhos e corrente com gancho.

export interface BossRig {
  h: Humanoid;
  helmet: THREE.Group;
  // corrente enrolada na mão direita (some quando o gancho é lançado)
  coil: THREE.Group;
  // corrente esticada até o alvo, no espaço do mundo
  line: THREE.Group;
  lineBody: THREE.Mesh;
  hook: THREE.Group;
}

export const BOSS_SCALE = 1.62;

export function buildBoss(tex: TexSet): BossRig {
  const iron = flatMat(0x575a5e, tex.grime);
  const rust = flatMat(0x5a3a26, tex.grime);
  const hits: THREE.Mesh[] = [];
  const h = buildHumanoid({
    skin: flatMat(0x7f8a72, tex.grime),
    shirt: flatMat(0x3a2a20, tex.grime),
    sleeves: flatMat(0x7f8a72, tex.grime),
    pants: flatMat(0x2a2620, tex.grime),
    shoes: flatMat(0x1a1714),
    hair: null,
    eyes: flatMat(0x000000, null, 0xff3010, 4),
    jaw: flatMat(0x4a2a24, tex.grime),
    scale: BOSS_SCALE,
    bulk: 1.45,
  });
  const b = 1.45;
  // couraça na frente e nas costas, cinto e ombreiras
  part(h.torso, 0.64, 0.4, 0.06, 0, 0.36, 0.2, iron, 'body', hits);
  part(h.torso, 0.62, 0.42, 0.05, 0, 0.32, -0.2, iron, 'body', hits);
  for (let i = 0; i < 3; i++) part(h.torso, 0.03, 0.03, 0.02, -0.2 + i * 0.2, 0.5, 0.235, rust, null, hits);
  part(h.hips, 0.4 * b, 0.09, 0.26 * b, 0, 0.07, 0, rust, 'body', hits);
  for (const arm of [h.armL, h.armR]) {
    part(arm.upper, 0.22, 0.13, 0.22, 0, 0.02, 0, iron, 'body', hits);
    part(arm.lower, 0.14, 0.14, 0.14, 0, -0.24, 0, iron, 'limb', hits);
  }
  for (const leg of [h.legL, h.legR]) part(leg.lower, 0.16, 0.2, 0.08, 0, -0.12, 0.07, iron, 'limb', hits);

  // capacete de balde: fenda nos olhos e espinhos em cima
  const helmet = new THREE.Group();
  h.head.add(helmet);
  part(helmet, 0.3, 0.2, 0.32, 0, 0.21, 0, iron, 'head', hits);
  part(helmet, 0.3, 0.07, 0.32, 0, 0.055, 0, iron, 'head', hits);
  part(helmet, 0.3, 0.03, 0.04, 0, 0.11, 0.15, flatMat(0x0a0606), null, hits);
  for (const x of [-0.08, 0, 0.08]) part(helmet, 0.035, 0.12, 0.035, x, 0.36, 0, rust, null, hits);
  for (const m of hits) h.hitMeshes.push(m);

  // corrente enrolada pendurada na mão direita, com o gancho na ponta
  const coil = new THREE.Group();
  coil.position.set(0, -0.36, 0.03);
  h.armR.lower.add(coil);
  const link = flatMat(0x62666c);
  for (let i = 0; i < 7; i++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(i % 2 ? 0.02 : 0.05, 0.07, i % 2 ? 0.05 : 0.02), link);
    l.position.set(0, -0.05 - i * 0.06, 0);
    coil.add(l);
  }
  const hookAt = (g: THREE.Group, y: number) => {
    const shank = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), iron);
    shank.position.y = y;
    const bend = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.12), iron);
    bend.position.set(0, y - 0.07, 0.045);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.03), iron);
    tip.position.set(0, y - 0.035, 0.1);
    g.add(shank, bend, tip);
  };
  hookAt(coil, -0.5);

  // corrente lançada: caixa fina com origem numa ponta (escala em Z = comprimento) e o gancho
  const line = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.065, 0.065, 1);
  geo.translate(0, 0, 0.5);
  const lineBody = new THREE.Mesh(geo, link);
  line.add(lineBody);
  const hook = new THREE.Group();
  hookAt(hook, 0);
  hook.rotation.x = Math.PI / 2;
  line.add(hook);
  line.visible = false;

  return { h, helmet, coil, line, lineBody, hook };
}

const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

export interface BossPose {
  phase: number;
  speed: number;
  t: number;
  anim: string;
  // tempo desde o começo da animação atual
  animT: number;
}

// Andar pesado, golpe, golpe no chão, corrente, investida e subida da terra.
export function animateBoss(r: BossRig, o: BossPose) {
  const h = r.h;
  const norm = clamp(o.speed / 2.2, 0, 1.6);
  const s = Math.sin(o.phase);
  const c = Math.cos(o.phase);
  const amp = 0.5 * Math.min(1, norm);

  h.legL.upper.rotation.x = s * amp;
  h.legR.upper.rotation.x = -s * amp;
  h.legL.lower.rotation.x = Math.max(0, -c) * amp * 1.3 + 0.05;
  h.legR.lower.rotation.x = Math.max(0, c) * amp * 1.3 + 0.05;
  h.hips.position.y = 0.92 - Math.abs(s) * 0.05 * norm;
  h.hips.rotation.y = s * 0.1 * norm;
  h.body.position.y = 0;
  h.body.position.z = 0;
  let lean = 0.15 + 0.1 * norm;
  let armL = -0.2 + s * 0.35 * norm;
  let armR = -0.35 - s * 0.2 * norm;
  let armLz = -0.2;
  let armRz = 0.2;
  let elbowL = -0.3;
  let elbowR = -0.5;
  let neck = -0.1;
  r.coil.visible = true;

  const a = o.animT;
  if (o.anim === 'attack') {
    // corrente girando por cima e descendo na frente
    const S = BOSS.swing;
    const up = smooth(a / S.windup);
    const down = smooth((a - S.windup) / 0.18);
    const back = smooth((a - S.windup - 0.3) / (S.recover - 0.3));
    armR = lerp(lerp(armR, -2.8, up), -0.5, down);
    armR = lerp(armR, -0.35, back);
    armRz = lerp(0.2, 0.6, up * (1 - down));
    elbowR = lerp(-0.5, -1.2, up * (1 - down));
    lean = lerp(lean, 0.55, down * (1 - back));
  } else if (o.anim === 'slam') {
    // ergue os dois braços e bate no chão
    const S = BOSS.slam;
    const up = smooth(a / S.windup);
    const down = smooth((a - S.windup + 0.12) / 0.14);
    const back = smooth((a - S.windup - 0.4) / (S.recover - 0.4));
    const arms = lerp(lerp(-0.2, -3.0, up), -0.6, down);
    armL = lerp(arms, armL, back);
    armR = lerp(arms, armR, back);
    armLz = armRz = 0;
    elbowL = elbowR = lerp(-0.2, -0.9, up * (1 - down));
    lean = lerp(lerp(lean, -0.2, up), 0.9, down);
    lean = lerp(lean, 0.15, back);
    const crouch = down * (1 - back);
    h.hips.position.y -= 0.25 * crouch;
    h.legL.upper.rotation.x = -0.9 * crouch;
    h.legR.upper.rotation.x = -0.4 * crouch;
    h.legL.lower.rotation.x = 1.2 * crouch;
    h.legR.lower.rotation.x = 0.8 * crouch;
    neck = -0.4 * up * (1 - down);
  } else if (o.anim === 'chain') {
    // gira o braço para trás e lança o gancho
    const S = BOSS.chain;
    const wind = smooth(a / S.windup);
    const thr = smooth((a - S.windup) / 0.12);
    const back = smooth((a - S.windup - S.fly) / S.recover);
    armR = lerp(lerp(-0.35, -2.4, wind), -1.45, thr);
    armR = lerp(armR, -0.35, back);
    armRz = lerp(0.2, 0.9 * (1 - thr), wind);
    elbowR = lerp(-0.5, -1.4 * (1 - thr), wind);
    lean = lerp(lean, -0.1, wind * (1 - thr)) + 0.25 * thr * (1 - back);
    r.coil.visible = a < S.windup || back > 0.9;
  } else if (o.anim === 'charge') {
    const S = BOSS.charge;
    if (a < S.windup) {
      // rugido: peito para trás, braços abertos, cabeça para cima
      const k = smooth(a / (S.windup * 0.6));
      lean = lerp(lean, -0.25, k);
      armL = armR = lerp(-0.3, -1.2, k);
      armLz = -0.9 * k;
      armRz = 0.9 * k;
      neck = -0.6 * k;
    } else if (a < S.windup + S.run) {
      // correndo curvado
      lean = 0.75;
      armL = 0.5 + s * 0.6;
      armR = 0.5 - s * 0.6;
      elbowL = elbowR = -1.0;
      const run = 0.95;
      h.legL.upper.rotation.x = s * run;
      h.legR.upper.rotation.x = -s * run;
      h.legL.lower.rotation.x = Math.max(0, -c) * 1.4;
      h.legR.lower.rotation.x = Math.max(0, c) * 1.4;
      neck = 0.3;
    } else {
      // tonto depois da investida
      const k = 1 - smooth((a - S.windup - S.run) / S.recover);
      lean = lerp(0.15, 0.4, k) + Math.sin(o.t * 6) * 0.05 * k;
      neck = 0.4 * k;
    }
  } else if (o.anim === 'rise') {
    const e = smooth(a / BOSS.riseTime);
    h.body.position.y = -3.0 * (1 - e);
    armL = armR = -2.7 + Math.sin(o.t * 5) * 0.2;
    lean = 0.3 * (1 - e);
  }

  h.armL.upper.rotation.x = armL;
  h.armR.upper.rotation.x = armR;
  h.armL.upper.rotation.z = armLz;
  h.armR.upper.rotation.z = armRz;
  h.armL.lower.rotation.x = elbowL;
  h.armR.lower.rotation.x = elbowR;
  h.torso.rotation.x = lean;
  h.neck.rotation.x = neck;
  h.head.rotation.y = Math.sin(o.t * 0.5) * 0.15;
}
