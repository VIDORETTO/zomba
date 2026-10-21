import * as THREE from 'three';
import { buildHumanoid, flatMat, part, type Humanoid } from './humanoid';
import type { TexSet } from './textures';

// Cruzado: zumbi de armadura medieval enferrujada, elmo fechado com olhos vermelhos e capa rasgada.
// Sem insígnias: o pano é liso e sujo.

export interface CruzadoRig {
  h: Humanoid;
  // tiras da capa, penduradas dos ombros (balançam ao andar)
  cape: THREE.Group[];
}

export function buildCruzado(tex: TexSet, look: number): CruzadoRig {
  const mail = flatMat(0x4a4a46, tex.grime);
  const plate = flatMat(0x6a4a34, tex.grime);
  const plateDark = flatMat(0x45301f, tex.grime);
  const cloth = flatMat(0x6e6452, tex.grime);
  const clothDark = flatMat(0x3e382c, tex.grime);
  const hits: THREE.Mesh[] = [];
  const b = 1.2;
  const h = buildHumanoid({
    skin: flatMat(0x7f8a72, tex.grime),
    shirt: mail,
    sleeves: mail,
    pants: clothDark,
    shoes: flatMat(0x1e1a16),
    hair: null,
    eyes: null,
    jaw: flatMat(0x4a2a24, tex.grime),
    scale: 1.12,
    bulk: b,
  });
  // peitoral e costas enferrujados, ombreiras, cinto, cobertura nas pernas
  part(h.torso, 0.5, 0.36, 0.05, 0, 0.34, 0.2, plate, 'body', hits);
  part(h.torso, 0.48, 0.34, 0.05, 0, 0.32, -0.2, plateDark, 'body', hits);
  part(h.hips, 0.44, 0.08, 0.3, 0, 0.07, 0, plateDark, 'body', hits);
  part(h.hips, 0.34, 0.34, 0.03, 0, -0.18, 0.15, cloth, null, hits);
  for (const arm of [h.armL, h.armR]) {
    part(arm.upper, 0.2, 0.1, 0.2, 0, 0.04, 0, plate, 'body', hits);
    part(arm.lower, 0.13, 0.16, 0.13, 0, -0.2, 0, plateDark, 'limb', hits);
  }
  for (const leg of [h.legL, h.legR]) part(leg.lower, 0.15, 0.2, 0.06, 0, -0.14, 0.07, plate, 'limb', hits);
  // elmo de balde (cilíndrico, topo plano) com fenda e olhos vermelhos acesos
  part(h.head, 0.3, 0.32, 0.31, 0, 0.14, 0, plate, 'head', hits);
  part(h.head, 0.32, 0.04, 0.33, 0, 0.31, 0, plateDark, 'head', hits);
  part(h.head, 0.26, 0.035, 0.03, 0, 0.16, 0.155, flatMat(0x050303), null, hits);
  part(h.head, 0.055, 0.03, 0.02, -0.06, 0.16, 0.16, flatMat(0x000000, null, 0xff2410, 6), null, hits);
  part(h.head, 0.055, 0.03, 0.02, 0.06, 0.16, 0.16, flatMat(0x000000, null, 0xff2410, 6), null, hits);
  // gorjal de malha
  part(h.neck, 0.2, 0.1, 0.2, 0, 0.02, 0, mail, 'head', hits);
  // espada na cintura (lâmina de ferro, sem enfeite)
  part(h.hips, 0.04, 0.5, 0.025, 0.24, -0.25, 0.02, flatMat(0x7c8186, tex.grime), null, hits).rotation.z = 0.08;
  part(h.hips, 0.12, 0.03, 0.04, 0.24, 0.02, 0.02, plateDark, null, hits);

  // capa rasgada: tiras de tamanhos diferentes presas nos ombros
  const cape: THREE.Group[] = [];
  const strips = 5;
  for (let i = 0; i < strips; i++) {
    const g = new THREE.Group();
    const x = -0.19 + (i / (strips - 1)) * 0.38;
    g.position.set(x, 0.5, -0.22);
    h.torso.add(g);
    const len = 0.5 + ((look >>> (i * 3)) % 7) * 0.07;
    part(g, 0.085, len, 0.025, 0, -len / 2, 0, i % 2 ? cloth : clothDark, null, hits);
    cape.push(g);
  }
  for (const m of hits) h.hitMeshes.push(m);
  return { h, cape };
}

// balanço da capa: mais aberta quanto mais rápido anda
export function animateCape(rig: CruzadoRig, speed: number, t: number) {
  const k = Math.min(1, speed / 2);
  rig.cape.forEach((g, i) => {
    g.rotation.x = 0.12 + k * 0.45 + Math.sin(t * 2.2 + i * 0.9) * (0.05 + k * 0.1);
    g.rotation.z = Math.sin(t * 1.7 + i * 1.7) * 0.06;
  });
}
