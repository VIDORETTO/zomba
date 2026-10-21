import * as THREE from 'three';

// Modelos das armas em primeira pessoa, feitos de caixas. Origem = corpo da arma, cano para -Z.

export interface GunMats {
  steel: THREE.Material;
  dark: THREE.Material;
  black: THREE.Material;
  wood: THREE.Material;
  glove: THREE.Material;
  sleeve: THREE.Material;
  skin: THREE.Material;
}

// pente · canos basculantes · cartucho por cartucho · duas pistolas · besta · célula do Desintegrador
export type ReloadStyle = 'mag' | 'break' | 'pump' | 'dual' | 'bolt' | 'cell';

export interface GunModel {
  group: THREE.Group;
  // peça que corre para trás ao atirar (ferrolho, telha da escopeta)
  moving: THREE.Object3D | null;
  moveDist: number;
  // depois de cada tiro a peça vai e volta sozinha (telha da escopeta, ferrolho do fuzil de precisão)
  cycle: boolean;
  // pente que sai e volta na recarga (mag2: o da outra pistola)
  mag: THREE.Object3D | null;
  magRest: THREE.Vector3;
  mag2: THREE.Object3D | null;
  // canos que basculam (escopeta de dois canos, lança-granadas) ou tambor que sai de lado (revólver)
  hinge: THREE.Object3D | null;
  hingeOpen: number;
  hingeAxis: 'x' | 'z';
  // tambor que gira uma câmara a cada tiro
  spinner: THREE.Object3D | null;
  // o que a mão traz na recarga de culatra: dois cartuchos, uma granada, um carregador rápido, três granadas
  reloadItem: 'shells2' | 'nade' | 'loader' | 'grenades' | null;
  // cápsulas que saltam ao abrir a culatra
  breechEject: { n: number; brass: boolean } | null;
  // recarga pela frente/de trás (besta, foguete, lâmina): de onde a peça vem e onde a mão a segura
  loadFrom: THREE.Vector3 | null;
  loadHold: THREE.Vector3 | null;
  // mão esquerda solta: é ela que troca o pente, põe os cartuchos e puxa o ferrolho
  left: THREE.Group | null;
  leftRest: THREE.Vector3;
  // onde a mão puxa o ferrolho quando a arma esvazia (espaço da arma)
  charge: THREE.Vector3 | null;
  // entrada dos cartuchos: janela da escopeta de repetição (espaço da arma) ou culatra (espaço dos canos)
  port: THREE.Vector3 | null;
  // janela de onde saem as cápsulas ao atirar
  eject: THREE.Vector3 | null;
  // trilho em cima da arma, onde vão as miras compradas na Oficina
  rail: THREE.Vector3 | null;
  muzzle: THREE.Vector3;
  // coronha: escondida ao mirar (o olho fica sobre ela)
  stock: THREE.Object3D[];
  sightY: number;
  // mira fora do centro (lança-foguetes: a mira fica do lado do tubo)
  sightX: number;
  hip: THREE.Vector3;
  adsZ: number;
  style: ReloadStyle;
}

type Parts = Pick<GunModel, 'group' | 'muzzle' | 'sightY' | 'hip' | 'adsZ' | 'style'> & Partial<GunModel>;

function finish(p: Parts): GunModel {
  const left = p.left ?? null;
  return {
    moving: null, moveDist: 0, cycle: false, mag: null, mag2: null, hinge: null, hingeOpen: 0, hingeAxis: 'x',
    spinner: null, reloadItem: null, breechEject: null, loadFrom: null, loadHold: null, sightX: 0,
    charge: null, port: null, eject: null, rail: null, stock: [],
    ...p,
    left,
    leftRest: left ? left.position.clone() : new THREE.Vector3(),
    magRest: p.mag ? p.mag.position.clone() : new THREE.Vector3(),
  };
}

function box(p: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, rx = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.rotation.x = rx;
  p.add(mesh);
  return mesh;
}

export function limb(p: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, thick: number, m: THREE.Material) {
  const dir = to.clone().sub(from);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(thick, thick, len), m);
  mesh.position.copy(from).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
  p.add(mesh);
  return mesh;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// Mão direita no cabo e mão esquerda na frente; os antebraços descem para fora da tela.
let withArms = true;

// Devolve o grupo da mão esquerda (origem na luva), para a recarga poder movê-la.
function arms(p: THREE.Object3D, grip: THREE.Vector3, fore: THREE.Vector3, m: GunMats, foreParent?: THREE.Object3D): THREE.Group | undefined {
  if (!withArms) return undefined;
  box(p, 0.05, 0.075, 0.075, grip.x, grip.y, grip.z, m.glove);
  limb(p, grip.clone().add(V(0.005, -0.035, 0.04)), V(grip.x + 0.1, grip.y - 0.17, grip.z + 0.38), 0.072, m.sleeve);
  const fp = foreParent ?? p;
  const off = foreParent ? foreParent.position : new THREE.Vector3();
  const left = new THREE.Group();
  left.position.copy(fore).sub(off);
  fp.add(left);
  box(left, 0.055, 0.05, 0.09, 0, 0, 0, m.glove);
  limb(left, V(-0.01, -0.02, 0.04), V(-0.17, -0.17, 0.38), 0.07, m.sleeve);
  return left;
}

// mão esquerda das pistolas: apoia por baixo do cabo
function supportHand(p: THREE.Object3D, at: THREE.Vector3, m: GunMats): THREE.Group | undefined {
  if (!withArms) return undefined;
  const left = new THREE.Group();
  left.position.copy(at);
  p.add(left);
  box(left, 0.02, 0.06, 0.05, -0.004, 0.015, -0.015, m.glove);
  box(left, 0.04, 0.03, 0.06, 0.01, -0.015, 0, m.glove);
  limb(left, V(-0.01, -0.02, 0.03), V(-0.15, -0.16, 0.34), 0.068, m.sleeve);
  limb(left, V(-0.005, -0.01, 0.015), V(-0.02, -0.03, 0.05), 0.05, m.skin);
  return left;
}

function pistol(m: GunMats): GunModel {
  const g = new THREE.Group();
  const slide = new THREE.Group();
  g.add(slide);
  box(slide, 0.032, 0.032, 0.2, 0, 0, 0, m.steel);
  box(slide, 0.008, 0.008, 0.012, 0, 0.02, -0.09, m.dark);
  box(slide, 0.0075, 0.009, 0.01, -0.0075, 0.0205, 0.092, m.dark);
  box(slide, 0.0075, 0.009, 0.01, 0.0075, 0.0205, 0.092, m.dark);
  for (let i = 0; i < 6; i++) box(slide, 0.034, 0.024, 0.003, 0, -0.002, 0.055 + i * 0.007, m.dark);
  box(g, 0.014, 0.014, 0.008, 0, 0, -0.103, m.black);
  box(g, 0.029, 0.02, 0.17, 0, -0.025, -0.012, m.dark);
  box(g, 0.024, 0.005, 0.045, 0, -0.05, -0.033, m.dark);
  box(g, 0.005, 0.02, 0.005, 0, -0.04, -0.012, m.dark);
  const grip = new THREE.Group();
  grip.position.set(0, -0.03, 0.06);
  grip.rotation.x = -0.22;
  g.add(grip);
  box(grip, 0.031, 0.112, 0.048, 0, -0.055, 0, m.wood);
  const mag = box(grip, 0.022, 0.1, 0.034, 0, -0.06, 0, m.black);
  box(g, 0.012, 0.012, 0.01, 0, 0.01, 0.105, m.dark);
  if (withArms) {
    box(grip, 0.048, 0.075, 0.07, 0.003, -0.06, 0.012, m.glove);
    limb(g, V(0.005, -0.1, 0.1), V(0.09, -0.24, 0.42), 0.07, m.sleeve);
  }
  return finish({
    group: g, moving: slide, moveDist: 0.035, mag, style: 'mag',
    left: supportHand(g, V(-0.02, -0.09, 0.06), m),
    charge: V(-0.03, 0.006, 0.07), eject: V(0.02, 0.02, 0),
    muzzle: V(0, 0.002, -0.17), sightY: 0.0255,
    hip: V(0.12, -0.112, -0.43), adsZ: -0.37,
  });
}

function carbine(m: GunMats): GunModel {
  const g = new THREE.Group();
  box(g, 0.045, 0.05, 0.22, 0, 0, 0, m.dark);
  box(g, 0.052, 0.055, 0.46, 0, -0.022, -0.2, m.wood);
  const stockC = box(g, 0.05, 0.1, 0.3, 0, -0.075, 0.25, m.wood, 0.22);
  box(g, 0.018, 0.018, 0.34, 0, 0.012, -0.5, m.steel);
  box(g, 0.006, 0.026, 0.01, 0, 0.036, -0.64, m.dark);
  box(g, 0.007, 0.022, 0.012, -0.008, 0.035, 0.07, m.dark);
  box(g, 0.007, 0.022, 0.012, 0.008, 0.035, 0.07, m.dark);
  const mag = box(g, 0.034, 0.09, 0.06, 0, -0.085, -0.03, m.black);
  const bolt = box(g, 0.012, 0.014, 0.05, 0.028, 0.008, -0.01, m.steel);
  return finish({
    group: g, moving: bolt, moveDist: 0.05, mag, stock: [stockC], style: 'mag',
    left: arms(g, V(0, -0.075, 0.12), V(0, -0.06, -0.28), m),
    charge: V(0.04, 0.02, -0.01), eject: V(0.03, 0.015, -0.03), rail: V(0, 0.025, -0.02),
    muzzle: V(0, 0.012, -0.69), sightY: 0.046,
    hip: V(0.13, -0.135, -0.38), adsZ: -0.4,
  });
}

function doublebarrel(m: GunMats): GunModel {
  const g = new THREE.Group();
  box(g, 0.05, 0.05, 0.12, 0, 0, 0, m.dark);
  const stockD = box(g, 0.05, 0.1, 0.32, 0, -0.07, 0.22, m.wood, 0.22);
  const hinge = new THREE.Group();
  hinge.position.set(0, -0.012, -0.06);
  g.add(hinge);
  box(hinge, 0.022, 0.022, 0.55, -0.012, 0.022, -0.27, m.steel);
  box(hinge, 0.022, 0.022, 0.55, 0.012, 0.022, -0.27, m.steel);
  box(hinge, 0.008, 0.006, 0.55, 0, 0.036, -0.27, m.dark);
  box(hinge, 0.05, 0.032, 0.2, 0, -0.004, -0.16, m.wood);
  box(hinge, 0.006, 0.006, 0.006, 0, 0.042, -0.53, m.steel);
  return finish({
    group: g, hinge, hingeOpen: -0.75, stock: [stockD], style: 'break',
    left: arms(g, V(0, -0.065, 0.1), V(0, -0.04, -0.22), m, hinge),
    port: V(0, 0.022, 0.0),
    muzzle: V(0, 0.01, -0.62), sightY: 0.032,
    hip: V(0.13, -0.13, -0.36), adsZ: -0.4,
  });
}

function smg(m: GunMats): GunModel {
  const g = new THREE.Group();
  box(g, 0.045, 0.06, 0.3, 0, 0, -0.05, m.dark);
  box(g, 0.02, 0.02, 0.1, 0, 0.004, -0.25, m.steel);
  box(g, 0.006, 0.024, 0.006, 0, 0.042, -0.19, m.dark);
  box(g, 0.007, 0.02, 0.01, -0.009, 0.04, 0.08, m.dark);
  box(g, 0.007, 0.02, 0.01, 0.009, 0.04, 0.08, m.dark);
  const mag = box(g, 0.03, 0.13, 0.04, 0, -0.1, -0.1, m.black, 0.25);
  box(g, 0.034, 0.1, 0.045, 0, -0.075, 0.07, m.black, -0.25);
  const stockS = box(g, 0.02, 0.05, 0.18, 0, -0.04, 0.2, m.dark);
  const bolt = box(g, 0.012, 0.014, 0.05, -0.03, 0.018, -0.13, m.steel);
  return finish({
    group: g, moving: bolt, moveDist: 0.03, mag, stock: [stockS], style: 'mag',
    left: arms(g, V(0, -0.095, 0.07), V(0, -0.045, -0.17), m),
    charge: V(-0.042, 0.02, -0.12), eject: V(0.03, 0.02, -0.08), rail: V(0, 0.03, -0.04),
    muzzle: V(0, 0.004, -0.32), sightY: 0.05,
    hip: V(0.12, -0.125, -0.36), adsZ: -0.38,
  });
}

function rifle(m: GunMats): GunModel {
  const g = new THREE.Group();
  box(g, 0.05, 0.065, 0.32, 0, 0, -0.02, m.dark);
  box(g, 0.056, 0.056, 0.2, 0, -0.004, -0.28, m.wood);
  box(g, 0.018, 0.018, 0.26, 0, 0.012, -0.48, m.steel);
  box(g, 0.006, 0.036, 0.008, 0, 0.04, -0.55, m.dark);
  box(g, 0.022, 0.012, 0.02, 0, 0.04, -0.12, m.dark);
  const mag = new THREE.Group();
  mag.position.set(0, -0.09, -0.1);
  g.add(mag);
  box(mag, 0.034, 0.1, 0.055, 0, 0, 0, m.black, 0.15);
  box(mag, 0.034, 0.08, 0.055, 0, -0.08, 0.035, m.black, 0.45);
  const stockR = box(g, 0.045, 0.09, 0.28, 0, -0.06, 0.27, m.wood, 0.22);
  box(g, 0.034, 0.09, 0.045, 0, -0.08, 0.08, m.black, -0.3);
  const bolt = box(g, 0.012, 0.02, 0.04, 0.03, 0.015, -0.05, m.steel);
  return finish({
    group: g, moving: bolt, moveDist: 0.06, mag, stock: [stockR], style: 'mag',
    left: arms(g, V(0, -0.1, 0.09), V(0, -0.045, -0.27), m),
    charge: V(0.04, 0.025, -0.05), eject: V(0.03, 0.02, -0.07), rail: V(0, 0.035, 0.0),
    muzzle: V(0, 0.012, -0.62), sightY: 0.046,
    hip: V(0.13, -0.135, -0.38), adsZ: -0.43,
  });
}

function pump(m: GunMats): GunModel {
  const g = new THREE.Group();
  box(g, 0.05, 0.06, 0.2, 0, 0, 0, m.dark);
  box(g, 0.024, 0.024, 0.5, 0, 0.014, -0.35, m.steel);
  box(g, 0.02, 0.02, 0.42, 0, -0.016, -0.3, m.dark);
  const stockP = box(g, 0.05, 0.1, 0.3, 0, -0.07, 0.24, m.wood, 0.22);
  box(g, 0.006, 0.006, 0.006, 0, 0.03, -0.59, m.steel);
  box(g, 0.03, 0.006, 0.07, 0, -0.031, -0.02, m.black);
  const fore = new THREE.Group();
  fore.position.set(0, -0.018, -0.3);
  g.add(fore);
  box(fore, 0.052, 0.042, 0.16, 0, 0, 0, m.wood);
  return finish({
    group: g, moving: fore, moveDist: 0.09, cycle: true, stock: [stockP], style: 'pump',
    left: arms(g, V(0, -0.07, 0.11), V(0, -0.045, -0.3), m, fore),
    port: V(0, -0.04, -0.02), eject: V(0.035, 0.005, -0.03),
    muzzle: V(0, 0.014, -0.61), sightY: 0.033,
    hip: V(0.13, -0.135, -0.37), adsZ: -0.4,
  });
}

// ---------- armas da Caixa Misteriosa ----------

function lmg(m: GunMats): GunModel {
  const g = new THREE.Group();
  box(g, 0.06, 0.08, 0.36, 0, 0, -0.02, m.dark);
  box(g, 0.03, 0.03, 0.42, 0, 0.01, -0.42, m.steel);
  box(g, 0.05, 0.05, 0.18, 0, -0.01, -0.3, m.black);
  box(g, 0.006, 0.03, 0.008, 0, 0.045, -0.58, m.dark);
  box(g, 0.022, 0.012, 0.02, 0, 0.05, -0.08, m.dark);
  const mag = box(g, 0.08, 0.1, 0.12, -0.02, -0.09, -0.06, m.dark);
  box(g, 0.034, 0.09, 0.045, 0, -0.085, 0.09, m.black, -0.3);
  const stock = box(g, 0.05, 0.09, 0.26, 0, -0.06, 0.28, m.black, 0.2);
  box(g, 0.01, 0.16, 0.01, -0.03, -0.09, -0.52, m.dark, -0.4);
  box(g, 0.01, 0.16, 0.01, 0.03, -0.09, -0.52, m.dark, -0.4);
  const bolt = box(g, 0.014, 0.02, 0.04, 0.035, 0.02, -0.05, m.steel);
  return finish({
    group: g, moving: bolt, moveDist: 0.05, mag, stock: [stock], style: 'mag',
    left: arms(g, V(0, -0.1, 0.1), V(0, -0.05, -0.3), m),
    charge: V(0.048, 0.03, -0.05), eject: V(0.035, -0.02, -0.06), rail: V(0, 0.045, 0.02),
    muzzle: V(0, 0.01, -0.64), sightY: 0.056,
    hip: V(0.14, -0.15, -0.4), adsZ: -0.45,
  });
}

function sniper(m: GunMats): GunModel {
  const g = new THREE.Group();
  box(g, 0.05, 0.06, 0.3, 0, 0, 0, m.dark);
  box(g, 0.054, 0.05, 0.46, 0, -0.03, -0.24, m.wood);
  box(g, 0.02, 0.02, 0.5, 0, 0.01, -0.62, m.steel);
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 12), m.black);
  scope.rotation.x = Math.PI / 2;
  scope.position.set(0, 0.065, -0.02);
  g.add(scope);
  box(g, 0.012, 0.03, 0.02, 0, 0.04, -0.1, m.black);
  box(g, 0.012, 0.03, 0.02, 0, 0.04, 0.08, m.black);
  const mag = box(g, 0.03, 0.06, 0.06, 0, -0.06, -0.04, m.black);
  const stock = box(g, 0.05, 0.1, 0.32, 0, -0.07, 0.3, m.wood, 0.2);
  // ferrolho com a alavanca para a direita
  const bolt = new THREE.Group();
  bolt.position.set(0.03, 0.012, 0.06);
  g.add(bolt);
  box(bolt, 0.012, 0.012, 0.06, 0, 0, 0, m.steel);
  box(bolt, 0.03, 0.008, 0.008, 0.018, -0.006, 0.02, m.steel);
  box(bolt, 0.014, 0.014, 0.014, 0.034, -0.01, 0.02, m.black);
  return finish({
    group: g, moving: bolt, moveDist: 0.07, cycle: true, mag, stock: [stock], style: 'mag',
    left: arms(g, V(0, -0.08, 0.13), V(0, -0.06, -0.32), m),
    charge: V(0.07, 0.0, 0.08), eject: V(0.035, 0.02, 0.03),
    muzzle: V(0, 0.01, -0.88), sightY: 0.065,
    hip: V(0.13, -0.14, -0.4), adsZ: -0.3,
  });
}

function dualpistol(m: GunMats): GunModel {
  const g = new THREE.Group();
  const slides = new THREE.Group();
  g.add(slides);
  const mags: THREE.Object3D[] = [];
  for (const side of [1, -1]) {
    const x = side * 0.13;
    box(slides, 0.032, 0.032, 0.2, x, 0, 0, m.steel);
    box(g, 0.029, 0.02, 0.17, x, -0.025, -0.012, m.dark);
    box(g, 0.031, 0.112, 0.048, x, -0.08, 0.06, m.wood, -0.22);
    mags.push(box(g, 0.022, 0.1, 0.034, x, -0.088, 0.062, m.black, -0.22));
    if (withArms) {
      box(g, 0.05, 0.075, 0.075, x, -0.085, 0.07, m.glove);
      limb(g, V(x, -0.12, 0.1), V(x + side * 0.08, -0.26, 0.42), 0.07, m.sleeve);
    }
  }
  return finish({
    group: g, moving: slides, moveDist: 0.035, mag: mags[0], mag2: mags[1], style: 'dual',
    eject: V(0.15, 0.02, 0),
    muzzle: V(0.13, 0.002, -0.17), sightY: 0.04,
    hip: V(0, -0.12, -0.42), adsZ: -0.38,
  });
}

function autoshotgun(m: GunMats): GunModel {
  const g = new THREE.Group();
  box(g, 0.055, 0.07, 0.3, 0, 0, -0.02, m.dark);
  box(g, 0.026, 0.026, 0.36, 0, 0.015, -0.36, m.steel);
  box(g, 0.006, 0.02, 0.008, 0, 0.04, -0.5, m.dark);
  box(g, 0.02, 0.012, 0.02, 0, 0.045, -0.08, m.dark);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 14), m.black);
  drum.rotation.z = Math.PI / 2;
  drum.position.set(0, -0.08, -0.08);
  g.add(drum);
  box(g, 0.034, 0.09, 0.045, 0, -0.08, 0.08, m.black, -0.3);
  const stock = box(g, 0.05, 0.09, 0.26, 0, -0.06, 0.26, m.black, 0.2);
  return finish({
    group: g, mag: drum, stock: [stock], style: 'mag',
    left: arms(g, V(0, -0.1, 0.09), V(0, -0.04, -0.26), m),
    eject: V(0.035, 0.02, -0.06),
    muzzle: V(0, 0.015, -0.55), sightY: 0.05,
    hip: V(0.13, -0.14, -0.38), adsZ: -0.42,
  });
}

function launcher(m: GunMats): GunModel {
  const g = new THREE.Group();
  box(g, 0.05, 0.06, 0.12, 0, 0, 0, m.dark);
  const hinge = new THREE.Group();
  hinge.position.set(0, -0.01, -0.06);
  g.add(hinge);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 14), m.dark);
  tube.rotation.x = Math.PI / 2;
  tube.position.set(0, 0.02, -0.16);
  hinge.add(tube);
  box(hinge, 0.05, 0.03, 0.18, 0, -0.025, -0.14, m.wood);
  box(hinge, 0.04, 0.03, 0.02, 0, 0.065, -0.2, m.steel);
  const stock = box(g, 0.05, 0.1, 0.3, 0, -0.06, 0.22, m.wood, 0.2);
  return finish({
    group: g, hinge, hingeOpen: -0.6, stock: [stock], style: 'break',
    left: arms(g, V(0, -0.07, 0.1), V(0, -0.05, -0.2), m, hinge),
    port: V(0, 0.02, 0.0),
    muzzle: V(0, 0.01, -0.4), sightY: 0.075,
    hip: V(0.13, -0.15, -0.38), adsZ: -0.38,
  });
}

function crossbow(m: GunMats): GunModel {
  const g = new THREE.Group();
  box(g, 0.04, 0.05, 0.5, 0, 0, -0.1, m.wood);
  box(g, 0.5, 0.025, 0.03, 0, 0.01, -0.32, m.dark);
  box(g, 0.004, 0.004, 0.36, -0.12, 0.012, -0.2, m.steel).rotation.y = -0.6;
  box(g, 0.004, 0.004, 0.36, 0.12, 0.012, -0.2, m.steel).rotation.y = 0.6;
  const bolt = new THREE.Group();
  g.add(bolt);
  box(bolt, 0.012, 0.012, 0.4, 0, 0.035, -0.18, m.steel);
  box(bolt, 0.03, 0.03, 0.04, 0, 0.035, -0.4, plain(0xb03020));
  box(g, 0.012, 0.03, 0.012, 0, 0.05, 0.05, m.black);
  const stock = box(g, 0.045, 0.09, 0.22, 0, -0.04, 0.22, m.wood, 0.2);
  return finish({
    group: g, mag: bolt, stock: [stock], style: 'bolt',
    left: arms(g, V(0, -0.06, 0.1), V(0, -0.04, -0.2), m),
    muzzle: V(0, 0.035, -0.42), sightY: 0.06,
    hip: V(0.13, -0.14, -0.38), adsZ: -0.38,
  });
}

function raygun(m: GunMats): GunModel {
  const g = new THREE.Group();
  // corpo cilíndrico escuro, anéis de cobre e bobinas verdes que brilham
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.6, 0.7) });
  const body = new THREE.MeshStandardMaterial({ color: 0x2e3033, roughness: 0.35, metalness: 0.5 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xb4683a, roughness: 0.3, metalness: 0.7 });
  const tube = (r: number, len: number, z: number, mat: THREE.Material, y = 0.005) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 16), mat);
    c.rotation.x = Math.PI / 2;
    c.position.set(0, y, z);
    g.add(c);
    return c;
  };
  tube(0.032, 0.2, 0, body);
  tube(0.036, 0.015, 0.06, copper);
  tube(0.026, 0.06, -0.13, glow);
  for (let i = 0; i < 3; i++) tube(0.04 - i * 0.004, 0.012, -0.11 - i * 0.025, copper);
  tube(0.016, 0.08, -0.2, body);
  tube(0.02, 0.01, -0.245, glow);
  // célula de energia encaixada em cima (é ela que sai na recarga)
  const cell = new THREE.Group();
  cell.position.set(0, 0.042, 0.02);
  g.add(cell);
  box(cell, 0.012, 0.018, 0.06, 0, 0, 0, glow);
  box(cell, 0.016, 0.008, 0.012, 0, 0.006, 0.03, copper);
  box(g, 0.032, 0.11, 0.048, 0, -0.07, 0.07, plain(0x7a2018), -0.22);
  if (withArms) {
    box(g, 0.05, 0.075, 0.075, 0, -0.075, 0.08, m.glove);
    limb(g, V(0.005, -0.11, 0.11), V(0.09, -0.25, 0.43), 0.07, m.sleeve);
  }
  return finish({
    group: g, mag: cell, style: 'cell',
    left: supportHand(g, V(-0.01, -0.11, 0.07), m),
    muzzle: V(0, 0.005, -0.27), sightY: 0.05,
    hip: V(0.12, -0.115, -0.43), adsZ: -0.38,
  });
}

// ---------- armas novas ----------

function burstrifle(m: GunMats): GunModel {
  const g = new THREE.Group();
  box(g, 0.05, 0.07, 0.34, 0, 0, -0.02, m.dark);
  box(g, 0.058, 0.06, 0.22, 0, -0.004, -0.3, m.black);
  for (let i = 0; i < 4; i++) box(g, 0.06, 0.008, 0.02, 0, 0.027, -0.22 - i * 0.05, m.dark);
  box(g, 0.018, 0.018, 0.2, 0, 0.012, -0.5, m.steel);
  box(g, 0.026, 0.026, 0.04, 0, 0.012, -0.6, m.black);
  // alça de transporte com a mira de trás; massa de mira na frente
  box(g, 0.02, 0.02, 0.16, 0, 0.06, -0.04, m.dark);
  box(g, 0.02, 0.03, 0.02, 0, 0.045, -0.11, m.dark);
  box(g, 0.02, 0.03, 0.02, 0, 0.045, 0.03, m.dark);
  box(g, 0.008, 0.05, 0.01, 0, 0.045, -0.38, m.dark);
  const mag = box(g, 0.032, 0.13, 0.055, 0, -0.1, -0.08, m.black, 0.08);
  box(g, 0.034, 0.09, 0.045, 0, -0.08, 0.08, m.black, -0.3);
  const stock = box(g, 0.045, 0.08, 0.26, 0, -0.03, 0.27, m.black, 0.05);
  const bolt = box(g, 0.012, 0.02, 0.04, 0.03, 0.015, -0.03, m.steel);
  return finish({
    group: g, moving: bolt, moveDist: 0.05, mag, stock: [stock], style: 'mag',
    left: arms(g, V(0, -0.1, 0.09), V(0, -0.045, -0.28), m),
    charge: V(0.04, 0.03, -0.03), eject: V(0.03, 0.02, -0.05), rail: V(0, 0.072, -0.04),
    muzzle: V(0, 0.012, -0.62), sightY: 0.07,
    hip: V(0.13, -0.135, -0.38), adsZ: -0.42,
  });
}

// tambor com seis câmaras (gira a cada tiro); a origem do grupo é o eixo do tambor
function cylinder(p: THREE.Object3D, r: number, len: number, holes: number, m: GunMats, x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.x = Math.PI / 2;
  p.add(g);
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), m.steel);
  g.add(c);
  for (let i = 0; i < holes; i++) {
    const a = (i / holes) * Math.PI * 2;
    const h = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.24, r * 0.24, len + 0.004, 8), m.black);
    h.position.set(Math.cos(a) * r * 0.58, 0, Math.sin(a) * r * 0.58);
    g.add(h);
  }
  return g;
}

function revolver(m: GunMats): GunModel {
  const g = new THREE.Group();
  box(g, 0.03, 0.055, 0.1, 0, -0.005, 0, m.steel);
  box(g, 0.026, 0.026, 0.2, 0, 0.012, -0.15, m.steel);
  box(g, 0.012, 0.01, 0.2, 0, 0.029, -0.15, m.dark);
  box(g, 0.006, 0.016, 0.01, 0, 0.036, -0.245, m.dark);
  box(g, 0.01, 0.02, 0.02, 0, 0.032, 0.055, m.dark);
  box(g, 0.005, 0.02, 0.005, 0, -0.04, 0.0, m.dark);
  box(g, 0.024, 0.006, 0.04, 0, -0.05, -0.0, m.dark);
  // braço do tambor: gira em torno de um eixo embaixo à esquerda, paralelo ao cano
  const crane = new THREE.Group();
  crane.position.set(-0.02, -0.02, 0);
  g.add(crane);
  const spin = cylinder(crane, 0.03, 0.065, 6, m, 0.02, 0.026, 0);
  const grip = new THREE.Group();
  grip.position.set(0, -0.03, 0.06);
  grip.rotation.x = -0.35;
  g.add(grip);
  box(grip, 0.032, 0.115, 0.05, 0, -0.055, 0, m.wood);
  if (withArms) {
    box(grip, 0.048, 0.075, 0.07, 0.003, -0.06, 0.012, m.glove);
    limb(g, V(0.005, -0.1, 0.1), V(0.09, -0.24, 0.42), 0.07, m.sleeve);
  }
  return finish({
    group: g, hinge: crane, hingeOpen: 1.25, hingeAxis: 'z', spinner: spin, style: 'break',
    reloadItem: 'loader', breechEject: { n: 6, brass: true },
    left: supportHand(g, V(-0.02, -0.095, 0.06), m),
    port: V(0.02, 0.026, 0.034),
    muzzle: V(0, 0.012, -0.25), sightY: 0.036,
    hip: V(0.12, -0.112, -0.43), adsZ: -0.37,
  });
}

function burstpistol(m: GunMats): GunModel {
  const g = new THREE.Group();
  const slide = new THREE.Group();
  g.add(slide);
  box(slide, 0.032, 0.032, 0.22, 0, 0, -0.01, m.dark);
  box(slide, 0.008, 0.008, 0.012, 0, 0.02, -0.1, m.steel);
  box(slide, 0.0075, 0.009, 0.01, -0.0075, 0.0205, 0.092, m.steel);
  box(slide, 0.0075, 0.009, 0.01, 0.0075, 0.0205, 0.092, m.steel);
  // compensador com janelas
  box(g, 0.034, 0.03, 0.05, 0, 0, -0.145, m.black);
  box(g, 0.036, 0.008, 0.012, 0, 0.012, -0.14, m.steel);
  box(g, 0.029, 0.02, 0.17, 0, -0.025, -0.012, m.black);
  box(g, 0.024, 0.005, 0.045, 0, -0.05, -0.033, m.black);
  const grip = new THREE.Group();
  grip.position.set(0, -0.03, 0.06);
  grip.rotation.x = -0.22;
  g.add(grip);
  box(grip, 0.031, 0.112, 0.048, 0, -0.055, 0, m.black);
  // pente estendido saindo do cabo
  const mag = box(grip, 0.022, 0.15, 0.034, 0, -0.085, 0, m.dark);
  if (withArms) {
    box(grip, 0.048, 0.075, 0.07, 0.003, -0.06, 0.012, m.glove);
    limb(g, V(0.005, -0.1, 0.1), V(0.09, -0.24, 0.42), 0.07, m.sleeve);
  }
  return finish({
    group: g, moving: slide, moveDist: 0.03, mag, style: 'mag',
    left: supportHand(g, V(-0.02, -0.09, 0.06), m),
    charge: V(-0.03, 0.006, 0.07), eject: V(0.02, 0.02, 0),
    muzzle: V(0, 0.002, -0.18), sightY: 0.0255,
    hip: V(0.12, -0.112, -0.43), adsZ: -0.37,
  });
}

function machinepistol(m: GunMats): GunModel {
  const g = new THREE.Group();
  box(g, 0.04, 0.06, 0.22, 0, 0, -0.03, m.dark);
  box(g, 0.018, 0.018, 0.06, 0, 0.006, -0.17, m.steel);
  box(g, 0.006, 0.02, 0.006, 0, 0.038, -0.12, m.black);
  box(g, 0.007, 0.018, 0.01, 0, 0.038, 0.06, m.black);
  // pente na frente do gatilho, coronha de arame dobrada por cima
  const mag = box(g, 0.028, 0.14, 0.036, 0, -0.1, -0.07, m.black, 0.12);
  box(g, 0.032, 0.09, 0.042, 0, -0.07, 0.05, m.black, -0.25);
  box(g, 0.006, 0.006, 0.2, -0.018, 0.04, -0.02, m.steel);
  box(g, 0.006, 0.006, 0.2, 0.018, 0.04, -0.02, m.steel);
  box(g, 0.042, 0.006, 0.006, 0, 0.04, -0.12, m.steel);
  const bolt = box(g, 0.01, 0.012, 0.04, 0.026, 0.016, -0.05, m.steel);
  return finish({
    group: g, moving: bolt, moveDist: 0.03, mag, style: 'mag',
    left: arms(g, V(0, -0.09, 0.05), V(0, -0.1, -0.075), m),
    charge: V(0.036, 0.02, -0.05), eject: V(0.025, 0.02, -0.04),
    muzzle: V(0, 0.006, -0.2), sightY: 0.047,
    hip: V(0.12, -0.12, -0.38), adsZ: -0.36,
  });
}

function dmr(m: GunMats): GunModel {
  const g = new THREE.Group();
  box(g, 0.048, 0.06, 0.3, 0, 0, 0, m.dark);
  box(g, 0.056, 0.055, 0.34, 0, -0.01, -0.3, m.wood);
  box(g, 0.02, 0.02, 0.36, 0, 0.012, -0.6, m.steel);
  box(g, 0.03, 0.03, 0.05, 0, 0.012, -0.79, m.black);
  box(g, 0.03, 0.01, 0.18, 0, 0.034, -0.02, m.black);
  const mag = box(g, 0.032, 0.075, 0.07, 0, -0.07, -0.04, m.black);
  box(g, 0.034, 0.09, 0.045, 0, -0.075, 0.09, m.wood, -0.3);
  const stock = box(g, 0.05, 0.1, 0.32, 0, -0.06, 0.3, m.wood, 0.18);
  const bolt = box(g, 0.012, 0.02, 0.05, 0.03, 0.012, -0.02, m.steel);
  return finish({
    group: g, moving: bolt, moveDist: 0.05, mag, stock: [stock], style: 'mag',
    left: arms(g, V(0, -0.085, 0.12), V(0, -0.05, -0.32), m),
    charge: V(0.04, 0.025, -0.02), eject: V(0.03, 0.02, -0.03), rail: V(0, 0.039, -0.02),
    muzzle: V(0, 0.012, -0.82), sightY: 0.05,
    hip: V(0.13, -0.14, -0.4), adsZ: -0.42,
  });
}

function rocket(m: GunMats): GunModel {
  const g = new THREE.Group();
  // tubo no ombro, com a ogiva aparecendo na boca
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 14), m.dark);
  tube.rotation.x = Math.PI / 2;
  tube.position.set(0, 0.02, -0.15);
  g.add(tube);
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.1, 14), m.black);
  bell.rotation.x = Math.PI / 2;
  bell.position.set(0, 0.02, 0.33);
  g.add(bell);
  box(g, 0.03, 0.04, 0.05, -0.05, 0.08, -0.05, m.black);
  box(g, 0.005, 0.02, 0.005, -0.05, 0.11, -0.05, m.steel);
  box(g, 0.004, 0.012, 0.004, -0.05, 0.106, -0.42, m.steel);
  box(g, 0.012, 0.03, 0.01, -0.05, 0.085, -0.42, m.black);
  box(g, 0.035, 0.1, 0.045, 0, -0.07, 0.04, m.black, -0.2);
  box(g, 0.035, 0.09, 0.04, 0, -0.06, -0.25, m.black);
  const head = new THREE.Group();
  head.position.set(0, 0.02, -0.62);
  g.add(head);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 12), plain(0x5a6a3a));
  cone.rotation.x = -Math.PI / 2;
  cone.position.z = -0.08;
  head.add(cone);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 10), plain(0x4a5a30));
  body.rotation.x = Math.PI / 2;
  body.position.z = 0.06;
  head.add(body);
  return finish({
    group: g, mag: head, style: 'bolt',
    left: arms(g, V(0, -0.07, 0.04), V(0, -0.06, -0.25), m),
    loadFrom: V(0, -0.06, -0.28), loadHold: V(-0.02, -0.035, 0.1),
    muzzle: V(0, 0.02, -0.62), sightY: 0.112, sightX: -0.05,
    hip: V(0.15, -0.11, -0.36), adsZ: -0.32,
  });
}

function blade(m: GunMats): GunModel {
  const g = new THREE.Group();
  box(g, 0.036, 0.036, 0.19, 0, 0, 0.03, m.black);
  for (let i = 0; i < 5; i++) box(g, 0.04, 0.04, 0.012, 0, 0, -0.04 + i * 0.03, m.dark);
  box(g, 0.012, 0.016, 0.03, 0, -0.026, 0.0, m.steel);
  box(g, 0.06, 0.012, 0.016, 0, 0, -0.07, m.steel);
  // a lâmina é a "munição": sai voando e uma nova entra pela frente
  const knife = new THREE.Group();
  knife.position.set(0, 0, -0.07);
  g.add(knife);
  box(knife, 0.006, 0.032, 0.16, 0, 0, -0.085, plain(0xb8bec4));
  box(knife, 0.007, 0.006, 0.16, 0, 0.016, -0.085, m.steel);
  if (withArms) {
    box(g, 0.05, 0.075, 0.075, 0.0, -0.02, 0.06, m.glove);
    limb(g, V(0.005, -0.05, 0.1), V(0.09, -0.22, 0.42), 0.07, m.sleeve);
  }
  return finish({
    group: g, mag: knife, style: 'bolt',
    left: supportHand(g, V(-0.035, -0.06, 0.02), m),
    loadFrom: V(0, 0.03, -0.22), loadHold: V(-0.015, 0.0, -0.13),
    muzzle: V(0, 0, -0.24), sightY: 0.03,
    hip: V(0.12, -0.1, -0.42), adsZ: -0.36,
  });
}

function drum(m: GunMats): GunModel {
  const g = new THREE.Group();
  box(g, 0.06, 0.07, 0.16, 0, 0.0, 0.08, m.dark);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 14), m.dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.03, -0.27);
  g.add(barrel);
  box(g, 0.01, 0.03, 0.01, 0, 0.075, -0.38, m.black);
  box(g, 0.012, 0.02, 0.012, 0, 0.075, 0.05, m.black);
  // tambor de seis granadas que abre de lado
  const crane = new THREE.Group();
  crane.position.set(-0.05, -0.05, 0);
  g.add(crane);
  const spin = cylinder(crane, 0.07, 0.14, 6, m, 0.05, 0.05, -0.06);
  // miras altas por cima do tambor
  box(g, 0.03, 0.06, 0.012, 0, 0.1, 0.06, m.black);
  box(g, 0.006, 0.07, 0.008, 0, 0.1, -0.38, m.black);
  box(g, 0.035, 0.1, 0.045, 0, -0.09, 0.12, m.black, -0.25);
  const stock = box(g, 0.05, 0.09, 0.26, 0, -0.04, 0.3, m.black, 0.15);
  return finish({
    group: g, hinge: crane, hingeOpen: 0.9, hingeAxis: 'z', spinner: spin, stock: [stock], style: 'break',
    reloadItem: 'grenades', breechEject: null,
    left: arms(g, V(0, -0.11, 0.13), V(0, -0.04, -0.27), m),
    port: V(0.05, 0.05, 0.02),
    muzzle: V(0, 0.03, -0.43), sightY: 0.132,
    hip: V(0.14, -0.15, -0.38), adsZ: -0.46,
  });
}

// ---------- armas maravilha ----------

const cyl = (p: THREE.Object3D, rTop: number, rBot: number, len: number, x: number, y: number, z: number, mat: THREE.Material, seg = 16) => {
  // deitado ao longo de z: rTop fica para trás (+z), rBot para a frente (-z)
  const c = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, seg), mat);
  c.rotation.x = Math.PI / 2;
  c.position.set(x, y, z);
  p.add(c);
  return c;
};

// Canhão de Vento: corpo de ferro, hélice atrás, boca em sino e um cilindro de ar comprimido em cima
function wind(m: GunMats): GunModel {
  const g = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.35, metalness: 0.8 });
  const air = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.9, 2.4) });
  cyl(g, 0.05, 0.05, 0.26, 0, 0, -0.04, m.dark);
  cyl(g, 0.055, 0.12, 0.17, 0, 0, -0.25, m.steel, 20);
  cyl(g, 0.122, 0.122, 0.02, 0, 0, -0.335, brass, 20);
  for (const z of [0.0, -0.08, -0.14]) cyl(g, 0.056, 0.056, 0.014, 0, 0, z, brass);
  // hélice dentro do sino
  cyl(g, 0.03, 0.03, 0.03, 0, 0, -0.2, m.black, 12);
  for (let i = 0; i < 4; i++) {
    const b = box(g, 0.17, 0.016, 0.004, 0, 0, -0.27, m.steel);
    b.rotation.z = (i / 4) * Math.PI;
  }
  cyl(g, 0.045, 0.045, 0.06, 0, 0, 0.11, m.dark);
  // canos de cobre por fora
  for (const s of [-1, 1]) box(g, 0.01, 0.01, 0.24, s * 0.058, -0.02, -0.08, brass);
  // cilindro de ar em cima (sai na recarga)
  const tank = new THREE.Group();
  tank.position.set(0, 0.075, -0.02);
  g.add(tank);
  cyl(tank, 0.024, 0.024, 0.16, 0, 0, 0, m.steel);
  cyl(tank, 0.018, 0.018, 0.1, 0, 0.0, 0, air);
  box(tank, 0.014, 0.014, 0.02, 0, 0, 0.09, brass);
  box(g, 0.035, 0.12, 0.05, 0, -0.08, 0.06, m.wood, -0.25);
  const stock = box(g, 0.05, 0.08, 0.2, 0, -0.05, 0.22, m.wood, 0.15);
  return finish({
    group: g, mag: tank, style: 'cell', stock: [stock],
    left: arms(g, V(0, -0.09, 0.07), V(0, -0.07, -0.17), m),
    muzzle: V(0, 0, -0.35), sightY: 0.11,
    hip: V(0.15, -0.16, -0.5), adsZ: -0.5,
  });
}

// Arpão Elétrico: fuzil comprido com bobinas de cobre e o arpão de ponta azul por cima do cano
function arc(m: GunMats): GunModel {
  const g = new THREE.Group();
  const copper = new THREE.MeshStandardMaterial({ color: 0xb4683a, roughness: 0.3, metalness: 0.75 });
  const blue = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 1.8, 4) });
  const dim = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.6, 1.4) });
  box(g, 0.05, 0.07, 0.32, 0, 0, -0.02, m.dark);
  cyl(g, 0.02, 0.02, 0.32, 0, -0.005, -0.33, m.steel);
  for (let i = 0; i < 6; i++) cyl(g, 0.032, 0.032, 0.016, 0, -0.005, -0.22 - i * 0.04, copper);
  // bateria na lateral
  box(g, 0.025, 0.05, 0.12, -0.04, -0.01, -0.04, m.black);
  box(g, 0.003, 0.012, 0.08, -0.053, -0.002, -0.04, dim);
  // o arpão (sai e volta na recarga)
  const spear = new THREE.Group();
  g.add(spear);
  box(spear, 0.01, 0.01, 0.46, 0, 0.05, -0.2, m.steel);
  const tip = cyl(spear, 0.0, 0.018, 0.06, 0, 0.05, -0.45, blue, 8);
  tip.rotation.x = -Math.PI / 2;
  box(spear, 0.03, 0.006, 0.02, 0, 0.05, -0.4, m.steel);
  box(g, 0.03, 0.03, 0.03, 0, 0.04, 0.02, m.black);
  box(g, 0.032, 0.11, 0.05, 0, -0.08, 0.08, m.black, -0.2);
  const stock = box(g, 0.048, 0.09, 0.22, 0, -0.04, 0.24, m.dark, 0.18);
  return finish({
    group: g, mag: spear, style: 'bolt', stock: [stock], loadFrom: V(0, 0.03, 0.2),
    left: arms(g, V(0, -0.08, 0.09), V(0, -0.045, -0.24), m),
    muzzle: V(0, -0.005, -0.5), sightY: 0.075,
    hip: V(0.13, -0.14, -0.4), adsZ: -0.4,
  });
}

// Vórtice: tubo curto que bascula, com uma esfera de vidro roxa na culatra
function vortex(m: GunMats): GunModel {
  const g = new THREE.Group();
  const violet = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.5, 2.8) });
  const glass = new THREE.MeshStandardMaterial({ color: 0x40205a, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.55 });
  box(g, 0.055, 0.065, 0.12, 0, 0, 0.0, m.dark);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.018, 14, 10), violet);
  core.position.set(0.03, 0.035, 0.03);
  g.add(core);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), glass);
  shell.position.copy(core.position);
  g.add(shell);
  const hinge = new THREE.Group();
  hinge.position.set(0, -0.01, -0.06);
  g.add(hinge);
  cyl(hinge, 0.042, 0.05, 0.28, 0, 0.02, -0.14, m.steel, 18);
  for (const z of [-0.06, -0.16, -0.26]) cyl(hinge, 0.054, 0.054, 0.014, 0, 0.02, z, m.black, 18);
  cyl(hinge, 0.036, 0.036, 0.01, 0, 0.02, -0.285, violet, 18);
  box(hinge, 0.04, 0.03, 0.16, 0, -0.035, -0.12, m.wood);
  const stock = box(g, 0.05, 0.1, 0.28, 0, -0.06, 0.2, m.wood, 0.2);
  return finish({
    group: g, hinge, hingeOpen: -0.6, stock: [stock], style: 'break',
    left: arms(g, V(0, -0.07, 0.1), V(0, -0.06, -0.18), m, hinge),
    port: V(0, 0.02, 0.0),
    muzzle: V(0, 0.01, -0.36), sightY: 0.11,
    hip: V(0.13, -0.15, -0.38), adsZ: -0.38,
  });
}

// ---------- cajados elementais da Trincheira ----------

type Elem = 'fogo' | 'gelo' | 'vento' | 'raio';
// cor do cristal de cada elemento (acima de 1 para o brilho pegar no bloom)
const STAFF_COL: Record<Elem, [number, number, number]> = {
  fogo: [1.9, 0.62, 0.1],
  gelo: [0.45, 1.25, 2.0],
  vento: [1.9, 1.6, 0.22],
  raio: [1.2, 0.5, 2.2],
};

// Cajado: haste de madeira escura, cabeça de metal antigo com garras segurando o cristal do elemento.
// Desperto: cristal maior, halo e anéis de pedra girando. O brilho e os anéis se animam por userData.tick(t, carga).
function staff(m: GunMats, el: Elem, awake: boolean): GunModel {
  const g = new THREE.Group();
  const [cr, cg, cb] = STAFF_COL[el];
  const glowCol = new THREE.Color(cr, cg, cb);
  const glow = new THREE.MeshBasicMaterial({ color: glowCol.clone() });
  const wood = new THREE.MeshStandardMaterial({ color: 0x2b1b12, roughness: 0.85 });
  const old = new THREE.MeshStandardMaterial({ color: 0x6b5d45, roughness: 0.42, metalness: 0.75 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x7c766c, roughness: 0.9 });
  // haste e empunhadura enrolada em couro
  cyl(g, 0.014, 0.017, 0.58, 0, 0, -0.03, wood, 10);
  for (let i = 0; i < 4; i++) cyl(g, 0.019, 0.019, 0.01, 0, 0, 0.14 + i * 0.022, m.black, 10);
  cyl(g, 0.02, 0.02, 0.012, 0, 0, 0.265, old, 10);
  // cabeça: colar e quatro garras
  cyl(g, 0.026, 0.019, 0.045, 0, 0, -0.335, old, 10);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    limb(g, V(Math.cos(a) * 0.02, Math.sin(a) * 0.02, -0.35), V(Math.cos(a) * 0.03, Math.sin(a) * 0.03, -0.44), 0.007, old);
  }
  // cristal
  const size = awake ? 1.35 : 1;
  const geo = el === 'fogo' ? new THREE.DodecahedronGeometry(0.03 * size, 0)
    : el === 'gelo' ? new THREE.OctahedronGeometry(0.026 * size, 0)
      : el === 'vento' ? new THREE.IcosahedronGeometry(0.03 * size, 0)
        : new THREE.OctahedronGeometry(0.03 * size, 0);
  const crystal = new THREE.Mesh(geo, glow);
  crystal.position.set(0, 0, -0.395);
  if (el === 'gelo') crystal.scale.set(0.8, 0.8, 1.9);
  else if (el === 'raio') crystal.scale.set(0.9, 0.9, 1.5);
  g.add(crystal);
  const flames: THREE.Mesh[] = [];
  const spin: THREE.Object3D[] = [];
  if (el === 'fogo') {
    // línguas de fogo em volta do cristal
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.07, 6), glow);
      const a = (i / 3) * Math.PI * 2;
      f.position.set(Math.cos(a) * 0.022, Math.sin(a) * 0.022 + 0.01, -0.43);
      f.rotation.x = -Math.PI / 2;
      f.userData.base = a;
      g.add(f);
      flames.push(f);
    }
  } else if (el === 'gelo') {
    // pontas de gelo em leque
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.07, 5), glow);
      c.position.set(Math.cos(a) * 0.026, Math.sin(a) * 0.026, -0.425);
      c.rotation.x = -Math.PI / 2;
      c.rotation.z = Math.cos(a) * 0.35;
      c.rotation.y = Math.sin(a) * 0.35;
      g.add(c);
    }
  } else if (el === 'vento') {
    // aletas de latão em espiral
    const brass = new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.35, metalness: 0.8 });
    const fins = new THREE.Group();
    fins.position.set(0, 0, -0.34);
    for (let i = 0; i < 3; i++) {
      const f = box(fins, 0.07, 0.006, 0.03, 0, 0, i * -0.016, brass);
      f.rotation.z = (i / 3) * Math.PI;
    }
    g.add(fins);
    spin.push(fins);
  } else {
    // bobinas de cobre ao longo da haste
    const copper = new THREE.MeshStandardMaterial({ color: 0xb4683a, roughness: 0.3, metalness: 0.75 });
    for (let i = 0; i < 4; i++) cyl(g, 0.024, 0.024, 0.01, 0, 0, -0.26 - i * 0.022, copper, 10);
  }
  // desperto: halo e dois anéis de pedra em volta do cristal
  let halo: THREE.Mesh | null = null;
  const rings: THREE.Group[] = [];
  if (awake) {
    halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 14, 10),
      new THREE.MeshBasicMaterial({ color: glowCol.clone().multiplyScalar(0.3), transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    halo.position.copy(crystal.position);
    g.add(halo);
    for (let k = 0; k < 2; k++) {
      const ring = new THREE.Group();
      ring.position.copy(crystal.position);
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const b = box(ring, 0.016, 0.01, 0.012, Math.cos(a) * (0.062 + k * 0.012), Math.sin(a) * (0.062 + k * 0.012), 0, stone);
        b.rotation.z = a;
      }
      ring.rotation.x = k ? 1.1 : 0.2;
      g.add(ring);
      rings.push(ring);
    }
  }
  // cristal sobressalente na lateral (sai e entra na recarga)
  const shard = box(g, 0.018, 0.018, 0.05, 0.034, -0.005, 0.02, glow);
  shard.rotation.z = 0.4;
  const baseCol = glowCol.clone();
  g.userData.tick = (t: number, charge = 0) => {
    const pulse = 1 + Math.sin(t * (el === 'raio' ? 17 : 4)) * (el === 'raio' ? 0.18 : 0.08) + charge * 0.35;
    glow.color.copy(baseCol).multiplyScalar(pulse * (el === 'raio' && Math.sin(t * 31) > 0.7 ? 1.4 : 1));
    crystal.scale.setScalar(1 + charge * 0.5);
    if (el === 'gelo') crystal.scale.set(0.8 + charge * 0.3, 0.8 + charge * 0.3, 1.9 + charge * 0.6);
    if (el === 'raio') crystal.scale.set(0.9 + charge * 0.3, 0.9 + charge * 0.3, 1.5 + charge * 0.5);
    crystal.rotation.z = t * (el === 'vento' ? 2.4 : 0.6);
    for (const f of flames) {
      const a = f.userData.base as number;
      f.scale.set(1, 1 + Math.sin(t * 9 + a * 3) * 0.3 + charge * 0.8, 1);
    }
    for (const sp of spin) sp.rotation.z = t * (3 + charge * 10);
    if (halo) halo.scale.setScalar(1 + Math.sin(t * 3) * 0.1 + charge * 0.4);
    rings.forEach((r, i) => {
      if (i === 0) r.rotation.z = t * (1.2 + charge * 4);
      else r.rotation.y = t * (-1.6 - charge * 4);
    });
  };
  g.userData.tick(0, 0);
  return finish({
    group: g, mag: shard, style: 'cell', stock: [],
    left: arms(g, V(0, -0.012, 0.12), V(0, -0.01, -0.12), m),
    muzzle: V(0, 0, -0.45), sightY: 0.125,
    hip: V(0.15, -0.15, -0.36), adsZ: -0.4,
  });
}

// Cajado solto no mundo (pedestal, altar): em pé, com a base na origem e a cabeça para cima, em escala de gente (~1,6 m).
// Anime com `group.userData.tick(tempoEmSegundos, carga 0..1)`.
export function buildStaffMesh(el: Elem, awake: boolean): THREE.Group {
  withArms = false;
  const model = staff(plainMats(), el, awake);
  withArms = true;
  const wrapper = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.x = Math.PI / 2;
  model.group.position.z = -0.27;
  inner.add(model.group);
  inner.scale.setScalar(2.8);
  wrapper.add(inner);
  wrapper.userData.tick = model.group.userData.tick;
  return wrapper;
}

function plainMats(): GunMats {
  const std = (c: number, r: number, mt = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: mt });
  return { steel: std(0x5a5e64, 0.4, 0.2), dark: std(0x2c2e31, 0.55, 0.1), black: std(0x161616, 0.5, 0.3), wood: std(0x5a3a26, 0.7), glove: std(0x3a3430, 0.9), sleeve: std(0x434a33, 0.95), skin: std(0xb98d70, 0.8) };
}

function plain(color: number) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
}

const BUILDERS: Record<string, (m: GunMats) => GunModel> = {
  pistol, carbine, doublebarrel, smg, rifle, pump, lmg, sniper, dualpistol, autoshotgun, launcher, crossbow, raygun,
  burstrifle, revolver, burstpistol, machinepistol, dmr, rocket, blade, drum, wind, arc, vortex,
  'cajado-fogo': (m) => staff(m, 'fogo', false), 'cajado-fogo-d': (m) => staff(m, 'fogo', true),
  'cajado-gelo': (m) => staff(m, 'gelo', false), 'cajado-gelo-d': (m) => staff(m, 'gelo', true),
  'cajado-vento': (m) => staff(m, 'vento', false), 'cajado-vento-d': (m) => staff(m, 'vento', true),
  'cajado-raio': (m) => staff(m, 'raio', false), 'cajado-raio-d': (m) => staff(m, 'raio', true),
};

// Monta a arma; sem mãos quando ela aparece solta no mundo.
export function buildGun(id: string, m: GunMats, hands = true): GunModel {
  withArms = hands;
  const g = (BUILDERS[id] ?? pistol)(m);
  withArms = true;
  return g;
}
