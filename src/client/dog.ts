import * as THREE from 'three';
import { DOGS } from '../shared/constants';
import { clamp, lerp, mulberry32 } from '../shared/rng';
import { flatMat, part, blobShadow } from './humanoid';
import type { TexSet } from './textures';

// Cão Infernal: corpo carbonizado com rachaduras em brasa, feito de caixas. Frente para +Z.

export interface DogLeg {
  upper: THREE.Group;
  lower: THREE.Group;
  // pernas de trás dobram o "joelho" (jarrete) para o outro lado
  back: boolean;
  // defasagem no galope
  off: number;
}

export interface DogRig {
  root: THREE.Group;
  body: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  jaw: THREE.Group;
  tail: THREE.Group;
  legs: DogLeg[];
  hitMeshes: THREE.Mesh[];
}

export function buildDog(look: number, tex: TexSet): DogRig {
  const r = mulberry32(look);
  // couro queimado com uma brasa fraca por dentro (aparece na névoa vermelha)
  const hide = flatMat(r() < 0.5 ? 0x5a3428 : 0x4e2e2a, tex.grime, 0x2a0600, 0.35);
  const dark = flatMat(0x2a1812, tex.grime, 0x140300, 0.3);
  const glow = flatMat(0x3a1004, null, 0xff4a10, 2.2);
  const mouth = flatMat(0x1a0302, null, 0x9a1404, 0.6);
  const eyes = flatMat(0x000000, null, 0xffb030, 2.4);
  const hits: THREE.Mesh[] = [];

  const root = new THREE.Group();
  root.add(blobShadow(0.55));
  const body = new THREE.Group();
  root.add(body);
  root.scale.setScalar(1.15 + r() * 0.13);

  // tronco: peito largo, costelas e quadril
  part(body, 0.3, 0.28, 0.6, 0, 0.62, -0.03, hide, 'body', hits);
  part(body, 0.36, 0.38, 0.3, 0, 0.64, 0.24, hide, 'body', hits);
  part(body, 0.28, 0.28, 0.22, 0, 0.63, -0.31, hide, 'body', hits);
  part(body, 0.2, 0.08, 0.5, 0, 0.47, 0.0, dark, null, hits);
  // rachaduras em brasa: espinha e costelas
  for (let i = 0; i < 4; i++) part(body, 0.05, 0.02, 0.1, 0, 0.775, 0.22 - i * 0.16, glow, null, hits);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) part(body, 0.01, 0.16, 0.025, side * 0.151, 0.6, 0.1 - i * 0.09, glow, null, hits);
  }

  // pescoço e cabeça
  const neck = new THREE.Group();
  neck.position.set(0, 0.72, 0.36);
  neck.rotation.x = -0.45;
  body.add(neck);
  part(neck, 0.17, 0.17, 0.24, 0, 0, 0.08, hide, 'body', hits);
  const head = new THREE.Group();
  head.position.set(0, 0.03, 0.24);
  head.rotation.x = 0.45;
  neck.add(head);
  part(head, 0.24, 0.21, 0.24, 0, 0, 0, hide, 'head', hits);
  part(head, 0.15, 0.11, 0.2, 0, -0.03, 0.2, dark, 'head', hits);
  part(head, 0.06, 0.03, 0.03, 0, 0.0, 0.3, flatMat(0x050302), null, hits);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.085, 0.08);
  head.add(jaw);
  part(jaw, 0.13, 0.04, 0.22, 0, 0, 0.11, dark, 'head', hits);
  part(jaw, 0.07, 0.01, 0.1, 0, 0.022, 0.08, mouth, null, hits);
  for (const side of [-1, 1]) {
    const ear = part(head, 0.05, 0.11, 0.04, side * 0.08, 0.15, -0.07, dark, 'head', hits);
    ear.rotation.z = side * -0.25;
    ear.rotation.x = -0.35;
    part(head, 0.034, 0.018, 0.02, side * 0.07, 0.035, 0.121, eyes, null, hits);
  }

  // pernas: ombros e quadris a 0,6 m, patas no chão
  const legs: DogLeg[] = [];
  for (const [x, z, back, off] of [[-0.12, 0.25, false, 0], [0.12, 0.25, false, 0.35], [-0.12, -0.3, true, Math.PI], [0.12, -0.3, true, Math.PI + 0.35]] as [number, number, boolean, number][]) {
    const upper = new THREE.Group();
    upper.position.set(x, 0.6, z);
    body.add(upper);
    part(upper, back ? 0.11 : 0.09, 0.32, back ? 0.13 : 0.1, 0, -0.15, 0, hide, 'limb', hits);
    const lower = new THREE.Group();
    lower.position.set(0, -0.3, 0);
    upper.add(lower);
    part(lower, 0.065, 0.3, 0.075, 0, -0.15, 0, dark, 'limb', hits);
    part(lower, 0.09, 0.04, 0.13, 0, -0.29, 0.03, dark, 'limb', hits);
    legs.push({ upper, lower, back, off });
  }

  const tail = new THREE.Group();
  tail.position.set(0, 0.7, -0.42);
  tail.rotation.x = 0.7;
  body.add(tail);
  part(tail, 0.05, 0.05, 0.34, 0, 0, -0.17, dark, null, hits);
  part(tail, 0.02, 0.02, 0.1, 0, 0.026, -0.3, glow, null, hits);

  return { root, body, neck, head, jaw, tail, legs, hitMeshes: hits };
}

const smooth = (x: number) => x * x * (3 - 2 * x);

// Galope, mordida e chegada pelo raio. `speed` em m/s; `attackT`/`arriveT` em segundos desde o começo.
export function animateDog(d: DogRig, o: { phase: number; speed: number; t: number; anim: string; attackT: number; arriveT: number }) {
  const amp = clamp(o.speed / DOGS.speed, 0, 1.2);
  const ph = o.phase;
  for (const L of d.legs) {
    const s = Math.sin(ph + L.off);
    const c = Math.cos(ph + L.off);
    L.upper.rotation.x = s * 0.85 * amp;
    L.lower.rotation.x = (L.back ? -1 : 1) * Math.max(0, L.back ? c : -c) * 1.1 * amp + (L.back ? -0.15 : 0.1);
  }
  // corpo sobe e desce e balança para frente e para trás no galope
  d.body.position.y = Math.abs(Math.sin(ph)) * 0.07 * amp;
  d.body.rotation.x = Math.sin(ph + 0.6) * 0.09 * amp;
  d.body.position.z = 0;
  // parado: respira e rosna de cabeça baixa
  const idle = 1 - clamp(amp * 2, 0, 1);
  d.neck.rotation.x = lerp(-0.45, -0.2, idle) + Math.sin(o.t * 2.3) * 0.05 * idle;
  d.head.rotation.y = Math.sin(o.t * 1.1) * 0.15 * idle;
  d.jaw.rotation.x = 0.12 + Math.abs(Math.sin(o.t * 9)) * 0.08 * idle;
  d.tail.rotation.x = 0.7 + Math.sin(ph * 2) * 0.25 * amp;
  d.tail.rotation.y = Math.sin(o.t * 3) * 0.2 * idle;

  // mordida: avança o corpo, abre a boca e fecha com força
  if (o.anim === 'attack') {
    const a = o.attackT;
    const lunge = a < DOGS.attackWindup ? smooth(clamp(a / DOGS.attackWindup, 0, 1)) : 1 - smooth(clamp((a - DOGS.attackWindup) / DOGS.attackRecover, 0, 1));
    d.body.position.z = 0.28 * lunge;
    d.body.position.y = 0.12 * lunge;
    d.body.rotation.x = -0.18 * lunge;
    d.neck.rotation.x = -0.75 * lunge + -0.45 * (1 - lunge);
    d.jaw.rotation.x = a < DOGS.attackWindup ? 0.6 * smooth(clamp(a / DOGS.attackWindup, 0, 1)) : 0.05;
    for (const L of d.legs) L.upper.rotation.x = (L.back ? 0.5 : -0.6) * lunge;
  }

  // chegada: cresce dentro do raio
  const k = o.anim === 'rise' ? clamp(o.arriveT / DOGS.arriveTime, 0, 1) : 1;
  d.root.visible = k > 0.35;
  d.body.scale.setScalar(o.anim === 'rise' ? Math.max(0.01, smooth(clamp((k - 0.35) / 0.65, 0, 1))) : 1);
}
