import * as THREE from 'three';
import { clamp, lerp } from '../shared/rng';
import { KNIFE, WEAPONS, baseId, type SightKind, type WeaponDef } from '../shared/weapons';
import type { PlayerController } from './controller';
import { buildGun, limb, type GunMats, type GunModel } from './gunModels';
import type { Input } from './input';
import { emberTexture, muzzleTexture } from './textures';

function smokeTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < 5; i++) {
    const x = 20 + Math.random() * 24, y = 20 + Math.random() * 24;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 20);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}

export type WeaponSound = 'dry' | 'magOut' | 'magIn' | 'slide' | 'knifeSwing' | 'gulp' | 'shell' | 'switch';

export interface WeaponCallbacks {
  // charged = ataque carregado do cajado desperto (segurou o gatilho até a carga encher); false/ausente nos demais disparos
  fire(spread: number, charged?: boolean): void;
  knife(): void;
  throwGrenade(): void;
  // Granada de Artilharia (chamado no instante do arremesso; opcional: sem ele nada é lançado)
  throwArtillery?(): void;
  sound(s: WeaponSound): void;
  // a recarga começou com `ammo` tiros no pente (a Faísca usa)
  reload?(ammo: number): void;
  // pancada do escudo (botão de atirar com o escudo na mão)
  bash?(): void;
}

type State = 'idle' | 'reload' | 'knife' | 'raise' | 'action' | 'switch';
export type ActionKind = 'refill' | 'drink' | 'throw' | 'inspect';

const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
// sobe de a até b, fica, desce de c até d
const bump = (u: number, a: number, b: number, c: number, d: number) => smooth(a, b, u) * (1 - smooth(c, d, u));

function std(color: number, rough = 0.6, metal = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

function box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

// mira comprada na Oficina, montada no trilho da arma
interface Optic {
  kind: SightKind;
  group: THREE.Group;
  // ponto vermelho: só aparece com a arma no rosto
  dot: THREE.Object3D | null;
  sightY: number;
  adsZ: number;
}

interface Slot {
  def: WeaponDef;
  ammo: number;
  reserve: number;
  model: GunModel;
  optic: Optic | null;
}

// cápsulas, pentes vazios e células que caem da arma (no espaço da câmera da arma)
interface Debris {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  pool: THREE.Object3D[] | null;
}

// Trilha de posições: em cada tempo-chave a mão está num ponto; entre eles, vai suavemente.
type Key = [number, THREE.Vector3];
function track(keys: Key[], u: number, out: THREE.Vector3) {
  if (u <= keys[0][0]) return out.copy(keys[0][1]);
  for (let i = 0; i < keys.length - 1; i++) {
    const [ta, a] = keys[i];
    const [tb, b] = keys[i + 1];
    if (u <= tb) return out.lerpVectors(a, b, smooth(ta, tb, u));
  }
  return out.copy(keys[keys.length - 1][1]);
}

const SWITCH_TIME = 0.5;
// escopeta de repetição: tempos (s) para começar, cada cartucho, voltar a mão e bombear
const PUMP = { start: 0.4, shell: 0.38, end: 0.3, rack: 0.45 };
// mão longe da arma, buscando munição no colete
const AWAY = new THREE.Vector3(-0.05, -0.32, 0.14);

const WEAPON_KEYS = ['weapon1', 'weapon2', 'weapon3'] as const;

export class WeaponView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(52, 1, 0.01, 10);
  ads = 0;
  spread = 0;
  sprintT = 0;
  heavyKnife = false;
  // escudo na mão (Trincheira): some a arma, o botão de atirar dá pancada
  shieldHand = false;
  private shieldT = 0;
  private bashT = 99;
  private readonly shieldRig = new THREE.Group();
  // Punho de Ferro no lugar da faca (o game.ts liga com me.punho)
  punho = false;
  // multiplicadores das bebidas: tempo de recarga e intervalo entre tiros
  mods = { reload: 1, fire: 1 };

  private readonly mats: GunMats;
  // pintura das armas melhoradas na Forja (brasa animada)
  readonly camoMats: GunMats;
  private readonly ember = emberTexture();
  private readonly root = new THREE.Group();
  private readonly slots: Slot[] = [];
  private cur = 0;
  private pending = -1;
  private readonly knifeRig = new THREE.Group();
  private readonly knifeBasic = new THREE.Group();
  private readonly knifeHeavy = new THREE.Group();
  private readonly flash: THREE.Mesh;
  private readonly flashLight: THREE.PointLight;

  private state: State = 'raise';
  private stateT = 0;
  private reloadEmpty = false;
  private marks = new Set<string>();
  private knifeHitDone = false;
  private fireCD = 0;
  private shotBuffer = 0;
  private kick = 0;
  private swayX = 0;
  private swayY = 0;
  private flashT = 0;
  private slideBack = 0;
  private slideLocked = false;
  private cycleT = 1;
  private cycleSounded = true;
  private reloadLen = 1;
  private reloadShells = 0;
  // Reflexo no começo da recarga (a animação inteira acelera junto)
  private reloadScale = 1;
  // rajada: tiros que ainda faltam e o tempo até o próximo
  private burstLeft = 0;
  private burstT = 0;
  // ao interromper a recarga, a mão volta suavemente ao lugar
  private handBlend = 0;
  private readonly handFrom = new THREE.Vector3();
  private readonly handNow = new THREE.Vector3();
  private readonly debris: Debris[] = [];
  private readonly brassPool: THREE.Object3D[] = [];
  private readonly shellPool: THREE.Object3D[] = [];
  private readonly brassGeo = new THREE.BoxGeometry(0.007, 0.007, 0.02);
  private readonly shellGeo = new THREE.BoxGeometry(0.012, 0.012, 0.03);
  private readonly brassMat = std(0xc89a3c, 0.3, 0.85);
  private readonly emberGeo = new THREE.BoxGeometry(0.006, 0.006, 0.006);
  private readonly emberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.4, 0.3) });
  private readonly emberPool: THREE.Object3D[] = [];
  // fumaça que sai do cano depois do tiro
  private readonly smoke: { s: THREE.Sprite; t: number; life: number; v: THREE.Vector3 }[] = [];
  private smokeNext = 0;
  private readonly smokeTex = smokeTexture();
  private readonly shellMat = std(0x9a2a22, 0.5, 0.1);
  // o que a mão esquerda traz do colete: um cartucho, dois cartuchos, uma granada
  private readonly heldShell = new THREE.Group();
  private readonly heldShells2 = new THREE.Group();
  private readonly heldNade = new THREE.Group();
  // carregador rápido do revólver (seis cápsulas em roda) e três granadas do tambor
  private readonly heldLoader = new THREE.Group();
  private readonly heldGrenades = new THREE.Group();
  // giro do tambor (revólver e lança-granadas de tambor)
  private spinTo = 0;
  private readonly tmpM = new THREE.Matrix4();
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private action: { kind: ActionKind; dur: number; done: () => void } | null = null;
  // cajado desperto: tempo de gatilho segurado e se está carregando
  private chargeT = 0;
  private charging = false;
  private chargeFull = false;
  // a granada que está sendo arremessada é a de artilharia
  private artilleryThrow = false;
  private readonly fistRig = new THREE.Group();
  private readonly nadeMesh: THREE.Mesh;
  private readonly nadeMat = std(0x3d4a30, 0.7, 0.2);
  private readonly artMat = std(0x6a1f18, 0.55, 0.3);
  private readonly bottle = new THREE.Group();
  private readonly grenadeHand = new THREE.Group();
  private readonly bottleMat = new THREE.MeshStandardMaterial({ color: 0xb8352b, roughness: 0.25, metalness: 0.1, emissive: new THREE.Color(0xb8352b), emissiveIntensity: 0.35 });

  constructor(private readonly cb: WeaponCallbacks, private readonly startId = 'pistol') {
    const hemi = new THREE.HemisphereLight(0xffd6b4, 0x4a3426, 2.6);
    const key = new THREE.DirectionalLight(0xffb070, 3.2);
    key.position.set(-1, 2, 1.5);
    const fill = new THREE.DirectionalLight(0xff7a3a, 1.4);
    fill.position.set(1.5, -0.5, -1);
    this.flashLight = new THREE.PointLight(0xffa040, 0, 2, 2);
    this.flashLight.position.set(0.1, 0, -0.5);
    this.scene.add(hemi, key, fill, this.flashLight, this.root, this.knifeRig);

    this.mats = {
      steel: std(0x5a5e64, 0.4, 0.2),
      dark: std(0x2c2e31, 0.55, 0.1),
      black: std(0x161616, 0.5, 0.3),
      wood: std(0x5a3a26, 0.7, 0),
      glove: std(0x3a3430, 0.9, 0),
      sleeve: std(0x434a33, 0.95, 0),
      skin: std(0xb98d70, 0.8, 0),
    };
    const m = this.mats;
    const camo = new THREE.MeshStandardMaterial({ color: 0x3a1a14, map: this.ember, emissive: new THREE.Color(1, 0.35, 0.1), emissiveMap: this.ember, emissiveIntensity: 1.1, roughness: 0.45, metalness: 0.3 });
    const camoDark = new THREE.MeshStandardMaterial({ color: 0x1a0c0a, map: this.ember, emissive: new THREE.Color(0.8, 0.25, 0.08), emissiveMap: this.ember, emissiveIntensity: 0.7, roughness: 0.5, metalness: 0.3 });
    this.camoMats = { ...m, steel: camo, dark: camoDark, black: camoDark, wood: camo };

    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.16),
      new THREE.MeshBasicMaterial({
        map: muzzleTexture(), color: new THREE.Color(2.5, 2.2, 1.8), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.flash.visible = false;
    // duas chamas compridas de lado, para o clarão ter volume (vistas de lado, saem para a frente do cano)
    for (const roll of [0, Math.PI / 2]) {
      const side = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3, 0.1).translate(0.15, 0, 0).rotateY(Math.PI / 2).rotateZ(roll),
        this.flash.material,
      );
      this.flash.add(side);
    }
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, color: 0xb8b0a6, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      this.scene.add(s);
      this.smoke.push({ s, t: 9, life: 1, v: new THREE.Vector3() });
    }

    // facas: comum e pesada (lâmina maior)
    box(this.knifeBasic, 0.024, 0.03, 0.1, 0, 0, 0.03, std(0x111111, 0.8));
    box(this.knifeBasic, 0.005, 0.032, 0.17, 0, 0.004, -0.1, std(0x9aa0a6, 0.25, 0.9));
    box(this.knifeHeavy, 0.028, 0.034, 0.11, 0, 0, 0.03, m.wood);
    box(this.knifeHeavy, 0.006, 0.05, 0.27, 0, 0.008, -0.16, std(0xb8bec4, 0.2, 0.95));
    box(this.knifeHeavy, 0.05, 0.012, 0.012, 0, 0.004, -0.025, m.steel);
    for (const k of [this.knifeBasic, this.knifeHeavy]) {
      box(k, 0.05, 0.06, 0.08, 0, -0.005, 0.04, m.glove);
      limb(k, new THREE.Vector3(0, -0.01, 0.08), new THREE.Vector3(0.05, -0.12, 0.4), 0.07, m.sleeve);
      this.knifeRig.add(k);
    }
    this.knifeRig.visible = false;
    this.buildFist();

    // garrafa da bebida (aparece só ao beber)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.03, 0.15, 12), this.bottleMat);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.024, 0.06, 12), this.bottleMat);
    neck.position.y = 0.105;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.014, 12), std(0xd8d0c0, 0.4, 0.6));
    cap.position.y = 0.14;
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0305, 0.0305, 0.05, 12), std(0xece4d2, 0.8));
    label.position.y = -0.01;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.07), m.glove);
    hand.position.set(0, -0.03, 0.02);
    limb(this.bottle, new THREE.Vector3(0, -0.05, 0.04), new THREE.Vector3(0.08, -0.3, 0.3), 0.07, m.sleeve);
    this.bottle.add(body, neck, cap, label, hand);
    this.bottle.visible = false;
    this.scene.add(this.bottle);

    // mão esquerda com a granada (arremesso)
    const nade = new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 10), this.nadeMat);
    nade.scale.y = 1.2;
    this.nadeMesh = nade;
    box(this.grenadeHand, 0.014, 0.03, 0.014, 0, 0.045, 0, m.steel);
    box(this.grenadeHand, 0.06, 0.05, 0.06, 0, -0.035, 0.01, m.glove);
    limb(this.grenadeHand, new THREE.Vector3(0, -0.05, 0.03), new THREE.Vector3(-0.08, -0.3, 0.3), 0.07, m.sleeve);
    this.grenadeHand.add(nade);
    this.grenadeHand.visible = false;
    this.scene.add(this.grenadeHand);

    // munição na mão esquerda durante a recarga (o comprimento fica no eixo Z, como o cano)
    this.heldShell.add(new THREE.Mesh(this.shellGeo, this.shellMat));
    for (const x of [-0.012, 0.012]) {
      const s = new THREE.Mesh(this.shellGeo, this.shellMat);
      s.position.x = x;
      this.heldShells2.add(s);
    }
    const shellNade = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 12), std(0x4a5a34, 0.6, 0.2));
    shellNade.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), std(0x8a7a3a, 0.4, 0.6));
    tip.position.z = -0.035;
    this.heldNade.add(shellNade, tip);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const b = new THREE.Mesh(this.brassGeo, this.brassMat);
      b.position.set(Math.cos(a) * 0.017, Math.sin(a) * 0.017, 0);
      this.heldLoader.add(b);
    }
    const loaderBase = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 12), std(0x1a1a1a, 0.6, 0.3));
    loaderBase.rotation.x = Math.PI / 2;
    loaderBase.position.z = 0.016;
    this.heldLoader.add(loaderBase);
    for (let i = 0; i < 3; i++) {
      const n = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.06, 10), std(0x4a5a34, 0.6, 0.2));
      n.rotation.x = Math.PI / 2;
      n.position.set((i - 1) * 0.046, 0, 0);
      this.heldGrenades.add(n);
    }
    for (const h of [this.heldShell, this.heldShells2, this.heldNade, this.heldLoader, this.heldGrenades]) {
      h.visible = false;
      this.root.add(h);
    }

    this.setInventory([this.startId]);
    // escudo de Trincheira segurado na mão esquerda: placa rebitada com visor estreito e punho
    {
      const steel = std(0x9a9a92, 0.5, 0.2);
      const dark = std(0x2a2a2a, 0.6, 0.2);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.035), steel);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.53, 0.02), dark);
      rim.position.z = -0.018;
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.04), dark);
      slit.position.set(0, 0.14, 0.005);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.05), dark);
      grip.position.set(0, -0.02, 0.06);
      this.shieldRig.add(rim, plate, slit, grip);
      for (const [x, y] of [[-0.14, 0.2], [0.14, 0.2], [-0.14, -0.2], [0.14, -0.2]]) {
        const rv = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.02), dark);
        rv.position.set(x, y, -0.02);
        this.shieldRig.add(rv);
      }
      this.shieldRig.visible = false;
      this.root.add(this.shieldRig);
    }
  }

  // Punho de Ferro: luva de aço rebitada com ponteiras nos nós dos dedos (o punho aponta para -Z)
  private buildFist() {
    const m = this.mats;
    const iron = std(0x6a6f76, 0.35, 0.75);
    const rust = std(0x4a3a2c, 0.6, 0.6);
    const f = this.fistRig;
    box(f, 0.075, 0.06, 0.09, 0, 0, 0, iron);
    box(f, 0.08, 0.035, 0.05, 0, 0.012, -0.055, iron);
    for (let i = 0; i < 4; i++) {
      box(f, 0.015, 0.04, 0.03, -0.0285 + i * 0.019, 0, -0.065, iron);
      const sp = box(f, 0.008, 0.008, 0.02, -0.0285 + i * 0.019, 0.004, -0.092, rust);
      sp.rotation.x = 0.2;
    }
    box(f, 0.02, 0.025, 0.06, 0.045, -0.002, -0.015, iron);
    for (const x of [-0.03, 0, 0.03]) box(f, 0.008, 0.008, 0.008, x, 0.032, 0.01, rust);
    box(f, 0.09, 0.075, 0.05, 0, -0.005, 0.07, rust);
    limb(f, new THREE.Vector3(0, -0.01, 0.09), new THREE.Vector3(0.05, -0.12, 0.42), 0.075, m.sleeve);
    f.visible = false;
    this.knifeRig.add(f);
  }

  // Arremessa a Granada de Artilharia (mesma animação da granada). Devolve false se as mãos estão ocupadas.
  throwArtillery(): boolean {
    if (this.busy || this.state === 'raise') return false;
    this.artilleryThrow = true;
    this.nadeMesh.material = this.artMat;
    this.startAction('throw', 0.7, () => {
      this.artilleryThrow = false;
      this.nadeMesh.material = this.nadeMat;
    });
    return true;
  }

  // 0 a 1: carga do ataque carregado (para o anel na mira); 0 se a arma não carrega ou ainda é só um aperto rápido
  get chargeFrac(): number {
    const c = this.def.charge;
    if (!c || !this.charging || this.chargeT < 0.2) return 0;
    return clamp(this.chargeT / c, 0, 1);
  }

  // ---------- inventário ----------

  private get slot(): Slot {
    return this.slots[this.cur];
  }
  get def(): WeaponDef {
    return this.slot.def;
  }
  get ammo() {
    return this.slot.ammo;
  }
  get reserve() {
    return this.slot.reserve;
  }
  get weaponIds(): string[] {
    return this.slots.map((s) => s.def.id);
  }

  // Sincroniza com as armas que a simulação diz que o jogador tem. Armas novas chegam cheias.
  setInventory(ids: string[]) {
    const key = ids.join(',');
    if (key === this.weaponIds.join(',')) return;
    const curId = this.slots[this.cur]?.def.id;
    const keep = new Map(this.slots.map((s) => [s.def.id, s]));
    this.slots.length = 0;
    for (const id of ids) {
      let s = keep.get(id);
      if (!s) {
        const def = WEAPONS[id] ?? WEAPONS.pistol;
        const model = buildGun(def.id, def.upgraded ? this.camoMats : this.mats);
        model.group.visible = false;
        this.root.add(model.group);
        s = { def, ammo: def.mag, reserve: def.reserve, model, optic: null };
      }
      keep.delete(id);
      this.slots.push(s);
    }
    for (const s of keep.values()) {
      this.root.remove(s.model.group);
      this.release(s.model.group);
    }
    const idx = this.slots.findIndex((s) => s.def.id === curId);
    this.showSlot(idx >= 0 ? idx : 0);
  }

  private showSlot(i: number) {
    // a arma guardada no meio da recarga volta inteira
    for (const s of this.slots) {
      this.restParts(s.model);
      if (s.model.hinge) s.model.hinge.rotation[s.model.hingeAxis] = 0;
    }
    this.handBlend = 0;
    this.cur = clamp(i, 0, this.slots.length - 1);
    this.slots.forEach((s, k) => (s.model.group.visible = k === this.cur));
    const mdl = this.slot.model;
    mdl.group.add(this.flash);
    this.flash.position.copy(mdl.muzzle);
    this.slideLocked = false;
  }

  // mira montada na arma da mão (ponto vermelho ou luneta 2×)
  get sight(): SightKind | null {
    return this.slot.optic?.kind ?? null;
  }

  // Sincroniza as miras com as que a simulação diz que cada arma tem.
  setSights(map: Record<string, SightKind>) {
    for (const s of this.slots) {
      const want = s.model.rail ? map[baseId(s.def.id)] ?? s.def.optic ?? null : null;
      if ((s.optic?.kind ?? null) === want) continue;
      if (s.optic) {
        s.model.group.remove(s.optic.group);
        this.release(s.optic.group);
      }
      s.optic = want ? this.buildOptic(want, s.model) : null;
      if (s.optic) s.model.group.add(s.optic.group);
    }
  }

  // Libera da placa de vídeo uma arma (ou mira) que saiu: formas e materiais próprios dela.
  // Os materiais comuns a todas as armas e o clarão do cano ficam.
  private release(obj: THREE.Object3D) {
    if (this.flash.parent === obj || obj.getObjectById(this.flash.id)) this.flash.removeFromParent();
    const shared = new Set<THREE.Material>([...Object.values(this.mats), ...Object.values(this.camoMats), this.brassMat, this.shellMat, this.emberMat]);
    const sharedGeo = new Set<THREE.BufferGeometry>([this.brassGeo, this.shellGeo, this.emberGeo]);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!sharedGeo.has(m.geometry)) m.geometry.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (!shared.has(mat)) mat.dispose();
    });
  }

  private buildOptic(kind: SightKind, mdl: GunModel): Optic {
    const g = new THREE.Group();
    const rail = mdl.rail!;
    g.position.copy(rail);
    const black = this.mats.black;
    if (kind === 'red') {
      // base, janela quadrada e o ponto vermelho no vidro
      const cy = 0.034;
      box(g, 0.03, 0.012, 0.05, 0, 0.006, 0, black);
      box(g, 0.044, 0.005, 0.032, 0, cy + 0.019, 0, black);
      box(g, 0.044, 0.005, 0.032, 0, cy - 0.019, 0, black);
      box(g, 0.005, 0.038, 0.032, -0.0195, cy, 0, black);
      box(g, 0.005, 0.038, 0.032, 0.0195, cy, 0, black);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.034, 0.033), new THREE.MeshBasicMaterial({ color: 0x9ab8ff, transparent: true, opacity: 0.1, depthWrite: false }));
      glass.position.set(0, cy, -0.015);
      g.add(glass);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0011, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.35, 0.2) }));
      dot.position.set(0, cy, -0.0155);
      g.add(dot);
      return { kind, group: g, dot, sightY: rail.y + cy, adsZ: mdl.adsZ + 0.08 };
    }
    // luneta: tubo com as pontas mais largas e duas argolas
    const cy = 0.042;
    const tube = (r: number, len: number, z: number) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), black);
      c.rotation.x = Math.PI / 2;
      c.position.set(0, cy, z);
      g.add(c);
    };
    tube(0.012, 0.17, -0.03);
    tube(0.016, 0.035, -0.12);
    tube(0.015, 0.03, 0.055);
    box(g, 0.026, cy - 0.01, 0.014, 0, (cy - 0.01) / 2, -0.06, black);
    box(g, 0.026, cy - 0.01, 0.014, 0, (cy - 0.01) / 2, 0.02, black);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.013, 14), new THREE.MeshBasicMaterial({ color: 0x1a2636 }));
    lens.position.set(0, cy, 0.0705);
    g.add(lens);
    return { kind, group: g, dot: null, sightY: rail.y + cy, adsZ: mdl.adsZ };
  }

  switchTo(id: string) {
    const i = this.slots.findIndex((s) => s.def.id === id);
    if (i < 0 || i === this.cur) return;
    this.pending = i;
    this.setState('switch');
    this.cb.sound('switch');
  }

  private cycle(dir: number) {
    if (this.slots.length < 2) return;
    this.switchTo(this.slots[(this.cur + dir + this.slots.length) % this.slots.length].def.id);
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  // Volta ao começo (renascer): só a pistola, cheia.
  reset() {
    this.setInventory([this.startId]);
    this.slot.ammo = this.def.mag;
    this.slot.reserve = this.def.reserve;
    this.setState('raise');
  }

  raise() {
    this.setState('raise');
  }

  get busy() {
    return this.state === 'reload' || this.state === 'knife' || this.state === 'action' || this.state === 'switch';
  }

  get reloading() {
    return this.state === 'reload';
  }

  get full() {
    return this.ammo === this.def.mag && this.reserve === this.def.reserve;
  }

  isFull(id: string) {
    const s = this.slots.find((x) => x.def.id === id);
    return !!s && s.ammo === s.def.mag && s.reserve === s.def.reserve;
  }

  // Ação que ocupa as mãos (caixote, bebida, granada): abaixa a arma e chama done() ao terminar.
  startAction(kind: ActionKind, dur: number, done: () => void, color?: string) {
    this.action = { kind, dur, done };
    if (color) {
      this.bottleMat.color.set(color);
      this.bottleMat.emissive.set(color);
    }
    this.setState('action');
  }

  // Munição Cheia: enche todas as armas
  refillAll() {
    for (const s of this.slots) {
      s.ammo = s.def.mag;
      s.reserve = s.def.reserve;
    }
    this.slideLocked = false;
  }

  refill(id?: string) {
    const s = id ? this.slots.find((x) => x.def.id === id) : this.slot;
    if (!s) return;
    s.ammo = s.def.mag;
    s.reserve = s.def.reserve;
    if (s === this.slot) this.slideLocked = false;
  }

  // Um tiro: gasta a bala, coice, clarão, cápsula e avisa a Game.
  private shootOnce(charged = false) {
    const def = this.def;
    const mdl = this.slot.model;
    this.slot.ammo--;
    this.fireCD = def.fireDelay * this.mods.fire;
    this.kick = Math.min(1.6, this.kick + Math.min(1.2, 0.35 + def.recoil * 0.45));
    this.flashT = 0.045;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar((0.8 + Math.random() * 0.5) * (def.cls === 'shotgun' ? 1.6 : def.cls === 'rifle' ? 1.25 : 1));
    this.puffSmoke(def.cls === 'shotgun' ? 1.6 : 1);
    this.slideBack = 1;
    if (mdl.cycle) this.cycleT = 0;
    else if (!mdl.spinner) this.ejectCasing(def.cls === 'shotgun');
    if (mdl.spinner) this.spinTo += Math.PI / 3;
    if (this.ammo === 0 && def.cls === 'pistol') this.slideLocked = true;
    this.cb.fire(this.spread, charged);
  }

  // fiapo de fumaça na boca do cano: sobe devagar e some
  private puffSmoke(k: number) {
    const it = this.smoke[this.smokeNext];
    this.smokeNext = (this.smokeNext + 1) % this.smoke.length;
    this.flash.updateWorldMatrix(true, false);
    this.flash.getWorldPosition(it.s.position);
    it.t = 0;
    it.life = 0.7 + Math.random() * 0.5;
    it.v.set((Math.random() - 0.5) * 0.04, 0.06 + Math.random() * 0.05, -0.18 - Math.random() * 0.1);
    it.s.userData.k = k;
    it.s.visible = true;
  }

  private setState(s: State) {
    this.state = s;
    this.stateT = 0;
    this.marks.clear();
    this.knifeHitDone = false;
  }

  private startReload() {
    if (this.reserve <= 0 || this.ammo >= this.def.mag) return;
    this.reloadEmpty = this.ammo === 0;
    if (this.slot.model.style === 'pump') {
      // um cartucho por vez: quanto mais faltar, mais demora
      this.reloadShells = Math.min(this.def.mag - this.ammo, this.reserve);
      this.reloadLen = PUMP.start + this.reloadShells * PUMP.shell + PUMP.end + (this.reloadEmpty ? PUMP.rack : 0);
    } else {
      this.reloadLen = this.reloadEmpty ? this.def.reloadEmptyTime : this.def.reloadTime;
    }
    this.reloadScale = this.mods.reload;
    this.reloadLen *= this.reloadScale;
    this.setState('reload');
    this.cb.reload?.(this.ammo);
  }

  // sai da recarga no meio (tiro na escopeta de repetição): a mão volta suave
  private interruptReload() {
    this.handFrom.copy(this.handNow);
    this.handBlend = 1;
    this.setState('idle');
  }

  // ---------- peças da arma no espaço do grupo da arma ----------

  private chain(space: THREE.Object3D, out: THREE.Matrix4) {
    out.identity();
    const top = this.slot.model.group;
    for (let o: THREE.Object3D | null = space; o && o !== top; o = o.parent) {
      o.updateMatrix();
      out.premultiply(o.matrix);
    }
    return out;
  }

  // ponto `p` dado no espaço de `space` → espaço da arma
  private toGun(space: THREE.Object3D, p: THREE.Vector3, out: THREE.Vector3) {
    return out.copy(p).applyMatrix4(this.chain(space, this.tmpM));
  }

  // coloca `obj` no ponto `p` (espaço da arma), seja qual for o pai dele
  private placeAt(obj: THREE.Object3D, p: THREE.Vector3) {
    obj.position.copy(p).applyMatrix4(this.chain(obj.parent!, this.tmpM).invert());
  }

  private restParts(mdl: GunModel) {
    if (mdl.mag) {
      mdl.mag.position.copy(mdl.magRest);
      mdl.mag.visible = true;
    }
    if (mdl.mag2) mdl.mag2.visible = true;
    if (mdl.left) {
      mdl.left.position.copy(mdl.leftRest);
      mdl.left.rotation.x = 0;
    }
  }

  // Mão esquerda, pente e munição na mão durante a recarga.
  private reloadHands(mdl: GunModel, reloading: boolean, u: number, E: boolean, hingeX: number, dt: number) {
    this.restParts(mdl);
    this.heldShell.visible = this.heldShells2.visible = this.heldNade.visible = this.heldLoader.visible = this.heldGrenades.visible = false;
    if (mdl.style === 'bolt' && mdl.mag) mdl.mag.visible = this.ammo > 0;
    if (mdl.style === 'dual' && reloading && u > 0.12 && u < 0.36) {
      if (mdl.mag) mdl.mag.visible = false;
      if (mdl.mag2) mdl.mag2.visible = false;
    }
    const left = mdl.left;
    if (!left) return;
    const rest = this.toGun(left.parent!, mdl.leftRest, this.v1);
    const h = this.v2;
    let moved = false;
    const away = () => rest.clone().add(AWAY);

    if (reloading) {
      switch (mdl.style) {
        case 'mag': {
          const mag = mdl.mag;
          if (!mag) break;
          const base = this.toGun(mag.parent!, mdl.magRest, new THREE.Vector3());
          const down = new THREE.Vector3(0, -1, 0).applyEuler(new THREE.Euler(mag.rotation.x, 0, 0)).add(mdl.magRest);
          const axis = this.toGun(mag.parent!, down, new THREE.Vector3()).sub(base).normalize();
          const off = axis.clone().multiplyScalar(0.055).add(new THREE.Vector3(-0.012, 0, 0.004));
          const grab = base.clone().add(off);
          const out = grab.clone().addScaledVector(axis, 0.09);
          const far = out.clone().add(AWAY);
          const ready = grab.clone().addScaledVector(axis, 0.1);
          const slap = grab.clone().addScaledVector(axis, -0.008);
          let hold: [number, number];
          if (E) {
            const keys: Key[] = [[0.06, rest], [0.3, far], [0.46, ready], [0.55, grab], [0.58, slap], [0.62, grab]];
            if (mdl.charge) {
              const back = mdl.charge.clone().add(new THREE.Vector3(0, 0, 0.045));
              keys.push([0.71, mdl.charge], [0.76, back], [0.8, back], [0.93, rest]);
              // no ferrolho o antebraço desce, para não cobrir a tela
              left.rotation.x = 0.9 * bump(u, 0.63, 0.71, 0.82, 0.92);
            } else keys.push([0.8, rest]);
            track(keys, u, h);
            hold = [0.3, 0.55];
            if (u >= 0.12 && u < 0.3) mag.visible = false;
          } else {
            track([[0.04, rest], [0.17, grab], [0.29, out], [0.41, far], [0.53, ready], [0.62, grab], [0.65, slap], [0.69, grab], [0.86, rest]], u, h);
            hold = [0.17, 0.62];
          }
          if (u >= hold[0] && u <= hold[1]) this.placeAt(mag, h.clone().sub(off));
          moved = true;
          break;
        }
        case 'break': {
          // a mão vai na telha dos canos; só sai dela para buscar os cartuchos
          if (!mdl.hinge || !mdl.port || u < 0.2 || u > 0.72) break;
          const breech = this.toGun(mdl.hinge, mdl.port, new THREE.Vector3());
          const above = breech.clone().add(new THREE.Vector3(-0.01, 0.05, 0.03));
          const inB = breech.clone().add(new THREE.Vector3(-0.005, 0.02, 0.025));
          track([[0.2, rest], [0.34, away()], [0.5, above], [0.58, inB], [0.62, inB], [0.72, rest]], u, h);
          if (u >= 0.34 && u < 0.6) {
            const item = mdl.reloadItem ?? (this.def.projectile ? 'nade' : 'shells2');
            const held = { shells2: this.heldShells2, nade: this.heldNade, loader: this.heldLoader, grenades: this.heldGrenades }[item];
            const tiltX = mdl.hingeAxis === 'x' ? hingeX : 0;
            const along = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(1, 0, 0), tiltX);
            held.visible = true;
            held.position.copy(h).add(breech).sub(inB).addScaledVector(along, 0.012);
            held.rotation.set(tiltX, 0, 0);
          }
          moved = true;
          break;
        }
        case 'pump': {
          if (!mdl.port) break;
          const port = mdl.port;
          const below = port.clone().add(new THREE.Vector3(-0.03, -0.13, 0.08));
          const under = port.clone().add(new THREE.Vector3(-0.005, -0.05, 0.02));
          const push = port.clone().add(new THREE.Vector3(0, -0.008, -0.012));
          const s = this.stateT / this.reloadScale;
          const endS = PUMP.start + this.reloadShells * PUMP.shell;
          if (s < PUMP.start) track([[0.05, rest], [PUMP.start, below]], s, h);
          else if (s < endS) {
            const k = Math.floor((s - PUMP.start) / PUMP.shell);
            const v = (s - PUMP.start - k * PUMP.shell) / PUMP.shell;
            track([[0, below], [0.35, under], [0.55, push], [1, below]], v, h);
            if (v < 0.55) {
              this.heldShell.visible = true;
              this.heldShell.position.copy(h).add(new THREE.Vector3(0, 0.028, -0.006));
              this.heldShell.rotation.set(0, 0, 0);
            }
          } else if (s < endS + PUMP.end) track([[endS, below], [endS + PUMP.end, rest]], s, h);
          else break;
          moved = true;
          break;
        }
        case 'bolt': {
          const bolt = mdl.mag;
          if (!bolt) break;
          const hold = mdl.loadHold?.clone() ?? new THREE.Vector3(-0.005, 0, 0.06);
          const seat = mdl.magRest.clone().add(hold);
          const back = mdl.magRest.clone().add(mdl.loadFrom ?? new THREE.Vector3(0, 0.04, 0.16)).add(hold);
          track([[0.06, rest], [0.28, away()], [0.46, back], [0.6, seat], [0.64, seat], [0.82, rest]], u, h);
          if (u >= 0.28) bolt.visible = true;
          if (u >= 0.28 && u < 0.6) this.placeAt(bolt, h.clone().sub(hold));
          moved = true;
          break;
        }
        case 'cell': {
          const cell = mdl.mag;
          if (!cell) break;
          const hold = new THREE.Vector3(-0.02, 0.025, 0);
          const seat = mdl.magRest.clone().add(hold);
          const up = seat.clone().add(new THREE.Vector3(0, 0.07, 0.03));
          const press = seat.clone().add(new THREE.Vector3(0, -0.006, 0));
          track([[0.05, rest], [0.3, away()], [0.46, up], [0.58, seat], [0.6, press], [0.64, seat], [0.82, rest]], u, h);
          if (u >= 0.14 && u < 0.3) cell.visible = false;
          if (u >= 0.3 && u < 0.58) this.placeAt(cell, h.clone().sub(hold));
          moved = true;
          break;
        }
      }
    }

    if (moved) {
      // mão acima do lugar de sempre: o antebraço desce, para não cobrir a tela
      left.rotation.x = Math.max(left.rotation.x, clamp((h.y - rest.y) * 12, 0, 1.4));
      this.placeAt(left, h);
      this.handNow.copy(h);
      this.handBlend = 0;
    } else if (this.handBlend > 0) {
      this.handBlend = Math.max(0, this.handBlend - dt / 0.18);
      this.placeAt(left, h.lerpVectors(rest, this.handFrom, smooth(0, 1, this.handBlend)));
    }
  }

  // posição da arma (espaço da arma) → espaço da câmera da arma, onde caem os destroços
  private toView(p: THREE.Vector3, out: THREE.Vector3) {
    this.root.updateMatrixWorld(true);
    return out.copy(p).applyMatrix4(this.slot.model.group.matrixWorld);
  }

  private addDebris(obj: THREE.Object3D, vel: THREE.Vector3, spin: THREE.Vector3, life: number, pool: THREE.Object3D[] | null) {
    this.scene.add(obj);
    this.debris.push({ obj, vel, spin, life, pool });
  }

  // cápsula voando para a direita (ou o cartucho vermelho da escopeta)
  private ejectCasing(shotgun: boolean) {
    const mdl = this.slot.model;
    if (!mdl.eject || this.debris.length > 40) return;
    const pool = shotgun ? this.shellPool : this.brassPool;
    const obj = pool.pop() ?? new THREE.Mesh(shotgun ? this.shellGeo : this.brassGeo, shotgun ? this.shellMat : this.brassMat);
    this.toView(mdl.eject, obj.position);
    obj.rotation.set(0, Math.random() * 3, 0);
    const r = Math.random();
    this.addDebris(obj, new THREE.Vector3(0.55 + r * 0.3, 0.5 + r * 0.3, 0.12), new THREE.Vector3(14, 6, 9), 0.55, pool);
  }

  // brasas saltando do corpo da arma (arma recém-forjada)
  private emberBurst(n: number) {
    const mdl = this.slot.model;
    for (let i = 0; i < n && this.debris.length < 70; i++) {
      const obj = this.emberPool.pop() ?? new THREE.Mesh(this.emberGeo, this.emberMat);
      this.toView(new THREE.Vector3((Math.random() - 0.5) * 0.06, (Math.random() - 0.3) * 0.06, -0.05 - Math.random() * 0.4), obj.position);
      this.addDebris(obj, new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.25 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3), new THREE.Vector3(3, 3, 3), 0.5 + Math.random() * 0.5, this.emberPool);
    }
    void mdl;
  }

  // pente (ou célula) que solta da arma e cai
  private dropMag(mag: THREE.Object3D | null, vel: THREE.Vector3) {
    if (!mag) return;
    this.root.updateMatrixWorld(true);
    const c = mag.clone();
    mag.matrixWorld.decompose(c.position, c.quaternion, c.scale);
    this.addDebris(c, vel, new THREE.Vector3(1.6, 0.4, 1.1), 0.75, null);
  }

  // canos abertos: os cartuchos vazios saltam da culatra
  private ejectBreech() {
    const mdl = this.slot.model;
    if (!mdl.hinge || !mdl.port) return;
    const cfg = mdl.breechEject ?? (this.def.projectile ? null : { n: 2, brass: false });
    if (!cfg) return;
    for (let i = 0; i < cfg.n; i++) {
      const pool = cfg.brass ? this.brassPool : this.shellPool;
      const obj = pool.pop() ?? new THREE.Mesh(cfg.brass ? this.brassGeo : this.shellGeo, cfg.brass ? this.brassMat : this.shellMat);
      this.toView(this.toGun(mdl.hinge, mdl.port, this.v1), obj.position);
      if (cfg.brass) {
        // revólver: as seis cápsulas caem do tambor aberto
        const a = (i / cfg.n) * Math.PI * 2;
        obj.position.x += Math.cos(a) * 0.017;
        obj.position.y += Math.sin(a) * 0.017;
        this.addDebris(obj, new THREE.Vector3((Math.random() - 0.5) * 0.3, -0.2 - Math.random() * 0.3, 0.25), new THREE.Vector3(6, 3, 5), 0.6, pool);
      } else {
        const side = i % 2 ? 1 : -1;
        obj.position.x += side * 0.012;
        this.addDebris(obj, new THREE.Vector3(side * 0.08 + 0.05, 0.85, 0.5), new THREE.Vector3(9, 2, 4), 0.6, pool);
      }
    }
  }

  private updateDebris(dt: number) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      d.vel.y -= 4.5 * dt;
      d.obj.position.addScaledVector(d.vel, dt);
      d.obj.rotation.x += d.spin.x * dt;
      d.obj.rotation.y += d.spin.y * dt;
      d.obj.rotation.z += d.spin.z * dt;
      if (d.life <= 0) {
        this.scene.remove(d.obj);
        d.pool?.push(d.obj);
        this.debris[i] = this.debris[this.debris.length - 1];
        this.debris.pop();
      }
    }
  }

  private mark(k: string, u: number, at: number, fn: () => void) {
    if (u >= at && !this.marks.has(k)) {
      this.marks.add(k);
      fn();
    }
  }

  // Cajado desperto: segurar o gatilho enche a carga (def.charge s). Soltar com a carga cheia dá o ataque carregado;
  // soltar antes é um disparo comum. Arma automática (Gelo): o raio sai normalmente enquanto se segura e,
  // quando a carga enche, o ataque carregado sai uma vez; para repetir, solta e aperta de novo.
  private updateCharge(dt: number, input: Input) {
    const def = this.def;
    const held = input.held('fire');
    const hit = input.hit('fire');
    const idle = this.state === 'idle' && this.sprintT < 0.35 && this.ammo > 0;
    if (hit && idle) {
      this.charging = true;
      this.chargeT = 0;
      this.chargeFull = false;
    }
    if (this.charging && held && idle) {
      this.chargeT += dt;
      if (this.chargeT >= def.charge! && !this.chargeFull) {
        this.chargeFull = true;
        this.cb.sound('slide');
      }
      if (def.auto) {
        // a carga cheia solta o ataque carregado uma vez; até lá o raio sai normalmente
        if (this.chargeFull && this.fireCD <= 0) {
          this.shootOnce(true);
          this.charging = false;
          this.chargeT = 0;
          this.chargeFull = false;
        } else this.shotBuffer = 0.05;
      }
      return;
    }
    if (this.charging && !held) {
      // soltou: carga cheia = carregado; senão um disparo comum
      if (this.chargeFull && idle && this.fireCD <= 0 && !def.auto) {
        this.shootOnce(true);
        this.shotBuffer = 0;
      } else if (!def.auto) this.shotBuffer = 0.2;
      this.charging = false;
      this.chargeT = 0;
      this.chargeFull = false;
      return;
    }
    this.charging = false;
    if (def.auto ? held : hit) this.shotBuffer = def.auto ? 0.05 : 0.2;
  }

  // ---------- quadro ----------

  private wasHand = false;

  // escudo na mão: a arma some, o botão de atirar dá a pancada e o escudo balança com o andar
  private updateShieldHand(dt: number, t: number, input: Input, pc: PlayerController, active: boolean) {
    if (this.shieldHand !== this.wasHand) {
      this.wasHand = this.shieldHand;
      if (this.shieldHand) {
        this.slot.model.group.visible = false;
        this.charging = false;
        this.shotBuffer = 0;
        this.burstLeft = 0;
        if (this.state === 'reload') this.setState('idle');
      } else {
        this.showSlot(this.cur);
        this.setState('raise');
      }
    }
    this.shieldT += ((this.shieldHand ? 1 : 0) - this.shieldT) * (1 - Math.exp(-dt * 10));
    this.bashT += dt;
    this.shieldRig.visible = this.shieldT > 0.03;
    if (!this.shieldRig.visible) return;
    if (this.shieldHand && active && input.hit('fire') && this.bashT > 0.55) {
      this.bashT = 0;
      this.cb.bash?.();
      this.cb.sound('knifeSwing');
    }
    const k = this.bashT < 0.32 ? Math.sin((this.bashT / 0.32) * Math.PI) : 0;
    const b = pc.bobAmount;
    this.shieldRig.position.set(-0.24 + Math.cos(pc.bobPhase) * 0.01 * b + 0.1 * k, -0.2 + (1 - this.shieldT) * -0.5 - Math.abs(Math.sin(pc.bobPhase)) * 0.01 * b, -0.58 - 0.3 * k);
    this.shieldRig.rotation.set(0.05 + 0.25 * k, 0.55 - 0.5 * k, 0.04 * Math.cos(pc.bobPhase) * b);
    void t;
  }

  update(dt: number, t: number, input: Input, pc: PlayerController, look: [number, number], active: boolean) {
    this.updateShieldHand(dt, t, input, pc, active);
    if (this.shieldHand) {
      // sem tiro nem recarga: só a pancada (a fila de tiros e a mira ficam zeradas)
      this.stateT += dt;
      this.ads = clamp(this.ads - dt / 0.2, 0, 1);
      return;
    }
    this.stateT += dt;
    this.fireCD -= dt;
    this.shotBuffer -= dt;
    this.cycleT += dt;
    this.updateDebris(dt);
    const def = this.def;

    if (active) {
      if (def.charge) this.updateCharge(dt, input);
      else if (input.hit('fire') || (def.auto && input.held('fire'))) this.shotBuffer = def.auto ? 0.05 : 0.2;
      for (let k = 0; k < this.slots.length; k++) {
        if (input.hit(WEAPON_KEYS[k]) && this.state !== 'action') this.switchTo(this.slots[k].def.id);
      }
      if ((input.hit('nextWeapon') || input.hit('prevWeapon')) && this.state !== 'action') this.cycle(input.hit('nextWeapon') ? 1 : -1);
    }
    if (!active || !def.charge) this.charging = false;
    const wantAds = active && input.held('aim') && !this.busy && !pc.sprinting;
    this.ads = clamp(this.ads + (wantAds ? 1 : -1) * (dt / def.adsTime), 0, 1);
    this.sprintT = lerp(this.sprintT, pc.sprinting ? 1 : 0, 1 - Math.exp(-dt * 12));

    if (active && input.hit('knife') && this.state !== 'knife' && this.state !== 'raise' && this.state !== 'action' && this.state !== 'switch') {
      this.setState('knife');
      this.cb.sound('knifeSwing');
    }
    if (active && input.hit('reload') && this.state === 'idle') this.startReload();
    // escopeta de repetição: atirar interrompe a recarga (com pelo menos um cartucho dentro)
    if (active && this.state === 'reload' && this.slot.model.style === 'pump' && this.shotBuffer > 0 && this.ammo > 0) this.interruptReload();

    const canShoot = this.state === 'idle' && this.sprintT < 0.35 && active;
    // rajada em andamento: os tiros seguintes saem sozinhos
    if (this.burstLeft > 0) {
      this.burstT -= dt;
      if (!canShoot || this.ammo <= 0) this.burstLeft = 0;
      else if (this.burstT <= 0) {
        this.shootOnce();
        this.burstLeft--;
        this.burstT = def.burstDelay ?? 0.07;
      }
    }
    if (this.shotBuffer > 0 && canShoot && this.fireCD <= 0 && this.burstLeft === 0) {
      this.shotBuffer = 0;
      if (this.ammo > 0) {
        this.shootOnce();
        if (def.burst && def.burst > 1) {
          this.burstLeft = def.burst - 1;
          this.burstT = def.burstDelay ?? 0.07;
          this.fireCD = ((def.burst - 1) * (def.burstDelay ?? 0.07) + def.fireDelay) * this.mods.fire;
        }
      } else {
        this.cb.sound('dry');
        this.fireCD = 0.25;
        this.startReload();
      }
    }

    // estados
    if (this.state === 'raise' && this.stateT > 0.45) this.setState('idle');
    if (this.state === 'switch') {
      if (this.pending >= 0 && this.stateT >= SWITCH_TIME / 2) {
        this.showSlot(this.pending);
        this.pending = -1;
      }
      if (this.stateT >= SWITCH_TIME) this.setState('idle');
    }
    if (this.state === 'action' && this.action) {
      const a = this.action;
      const u = this.stateT / a.dur;
      if (a.kind === 'drink') {
        this.mark('g1', u, 0.42, () => this.cb.sound('gulp'));
        this.mark('g2', u, 0.56, () => this.cb.sound('gulp'));
        this.mark('g3', u, 0.68, () => this.cb.sound('gulp'));
      } else if (a.kind === 'refill') {
        this.mark('m1', u, 0.3, () => this.cb.sound('magOut'));
        this.mark('m2', u, 0.65, () => this.cb.sound('magIn'));
      } else if (a.kind === 'inspect') {
        // arma forjada: brasas saltando enquanto ela é mostrada
        this.mark('e1', u, 0.12, () => this.emberBurst(26));
        this.mark('e2', u, 0.45, () => this.emberBurst(18));
      } else {
        this.mark('pin', u, 0.15, () => this.cb.sound('shell'));
        this.mark('throw', u, 0.48, () => (this.artilleryThrow ? this.cb.throwArtillery?.() : this.cb.throwGrenade()));
      }
      if (u >= 1) {
        this.action = null;
        a.done();
        this.setState('raise');
      }
    }
    if (this.state === 'knife') {
      if (!this.knifeHitDone && this.stateT > 0.14) {
        this.knifeHitDone = true;
        this.cb.knife();
      }
      if (this.stateT > KNIFE.cooldown) this.setState('idle');
    }
    if (this.state === 'reload') {
      const u = this.stateT / this.reloadLen;
      const mdl = this.slot.model;
      const E = this.reloadEmpty;
      const fill = () => {
        const take = Math.min(def.mag - this.ammo, this.reserve);
        this.slot.ammo += take;
        this.slot.reserve -= take;
      };
      const release = () => (this.slideLocked = false);
      switch (mdl.style) {
        case 'mag':
          if (E) {
            // vazia: o pente cai sozinho, a mão já vai buscar outro
            this.mark('out', u, 0.12, () => {
              this.cb.sound('magOut');
              this.dropMag(mdl.mag, new THREE.Vector3(-0.04, -0.35, 0.06));
            });
            this.mark('in', u, 0.55, () => this.cb.sound('magIn'));
            this.mark('fill', u, 0.57, fill);
            if (mdl.charge) {
              this.mark('pull', u, 0.75, () => this.cb.sound('slide'));
              this.mark('rel', u, 0.8, release);
            } else this.mark('rel', u, 0.6, release);
          } else {
            this.mark('out', u, 0.2, () => this.cb.sound('magOut'));
            this.mark('in', u, 0.62, () => this.cb.sound('magIn'));
            this.mark('fill', u, 0.64, fill);
          }
          break;
        case 'break':
          this.mark('open', u, 0.14, () => this.cb.sound('slide'));
          this.mark('out', u, 0.22, () => {
            this.cb.sound('shell');
            this.ejectBreech();
          });
          this.mark('in', u, 0.58, () => this.cb.sound('magIn'));
          this.mark('fill', u, 0.6, fill);
          this.mark('close', u, 0.84, () => this.cb.sound('slide'));
          break;
        case 'pump': {
          // cada cartucho entra de verdade: dá para atirar no meio
          const s = this.stateT / this.reloadScale;
          for (let k = 0; k < this.reloadShells; k++) {
            this.mark(`s${k}`, s, PUMP.start + (k + 0.55) * PUMP.shell, () => {
              if (this.reserve <= 0 || this.ammo >= def.mag) return;
              this.slot.ammo++;
              this.slot.reserve--;
              this.cb.sound('shell');
            });
          }
          if (E) this.mark('rack', s, PUMP.start + this.reloadShells * PUMP.shell + PUMP.end + PUMP.rack * 0.4, () => this.cb.sound('slide'));
          break;
        }
        case 'dual':
          this.mark('out', u, 0.12, () => {
            this.cb.sound('magOut');
            this.dropMag(mdl.mag, new THREE.Vector3(0.05, -0.4, 0.05));
            this.dropMag(mdl.mag2, new THREE.Vector3(-0.05, -0.4, 0.05));
          });
          this.mark('in', u, 0.42, () => this.cb.sound('magIn'));
          this.mark('fill', u, 0.45, fill);
          if (E) this.mark('rel', u, 0.7, () => {
            this.cb.sound('slide');
            release();
          });
          break;
        case 'bolt':
          this.mark('in', u, 0.5, () => this.cb.sound('magIn'));
          this.mark('fill', u, 0.6, fill);
          this.mark('cock', u, 0.7, () => this.cb.sound('slide'));
          break;
        case 'cell':
          this.mark('out', u, 0.14, () => {
            this.cb.sound('magOut');
            this.dropMag(mdl.mag, new THREE.Vector3(0.12, 0.7, 0.35));
          });
          this.mark('in', u, 0.58, () => this.cb.sound('magIn'));
          this.mark('fill', u, 0.6, fill);
          break;
      }
      if (u >= 1) this.setState('idle');
    }
    // escopeta de repetição e fuzil de precisão: a peça vai e volta logo depois do tiro
    if (this.slot.model.cycle && this.cycleT >= 0.22 && !this.cycleSounded) {
      this.cycleSounded = true;
      this.cb.sound('slide');
      this.ejectCasing(def.cls === 'shotgun');
    }
    if (this.cycleT < 0.22) this.cycleSounded = false;

    const adsE = smooth(0, 1, this.ads);
    this.spread = lerp(def.spreadHip, def.spreadAds, adsE);

    this.pose(dt, t, pc, look, adsE);
  }

  private pose(dt: number, t: number, pc: PlayerController, look: [number, number], adsE: number) {
    const mdl = this.slot.model;
    const optic = this.slot.optic;
    const ads = new THREE.Vector3(optic ? 0 : -mdl.sightX, -(optic?.sightY ?? mdl.sightY), optic?.adsZ ?? mdl.adsZ);
    if (optic?.dot) optic.dot.visible = adsE > 0.5;
    const pos = new THREE.Vector3().lerpVectors(mdl.hip, ads, adsE);
    const rot = new THREE.Euler(0.02 * (1 - adsE), 0.07 * (1 - adsE), -0.04 * (1 - adsE));
    const sp = this.sprintT;
    const long = this.def.cls !== 'pistol';

    pos.x += -0.02 * sp;
    pos.y += -0.045 * sp;
    pos.z += 0.03 * sp;
    rot.x += (long ? -0.25 : -0.5) * sp;
    rot.y += (long ? 0.95 : 0.75) * sp;
    rot.z += (long ? 0.15 : 0.3) * sp;

    const b = pc.bobAmount * (1 - adsE * 0.85);
    const bp = pc.bobPhase;
    pos.x += Math.cos(bp) * 0.009 * b * (1 + sp);
    pos.y += -Math.abs(Math.sin(bp)) * 0.009 * b * (1 + sp * 1.5);
    rot.z += Math.cos(bp) * 0.02 * b;

    this.swayX = lerp(this.swayX, clamp(-look[0] * 0.0012, -0.08, 0.08), 1 - Math.exp(-dt * 9));
    this.swayY = lerp(this.swayY, clamp(-look[1] * 0.0012, -0.08, 0.08), 1 - Math.exp(-dt * 9));
    const swayK = 1 - adsE * 0.75;
    rot.y += this.swayX * swayK;
    rot.x += this.swayY * swayK;
    pos.x += this.swayX * 0.05 * swayK;
    pos.y += this.swayY * 0.05 * swayK;

    pos.y += Math.sin(t * 1.6) * 0.0018 * (1 - adsE);
    pos.y -= pc.landKick * 0.035;
    pos.y += pc.stepSmooth * 0.2;
    pos.x -= pc.crouchT * 0.008 * (1 - adsE);

    this.kick *= Math.exp(-dt * 13);
    pos.z += this.kick * (long ? 0.05 : 0.04);
    pos.y += this.kick * 0.006;
    rot.x += this.kick * (long ? 0.09 : 0.17) * (1 - adsE * 0.5);

    if (!this.slideLocked) this.slideBack = Math.max(0, this.slideBack - dt * 16);
    // escopeta de repetição e fuzil de precisão: a peça vai e volta logo depois do tiro
    let moveZ = mdl.cycle ? bump(this.cycleT, 0.12, 0.25, 0.32, 0.48) * mdl.moveDist : this.slideBack * mdl.moveDist;
    let hingeX = 0;
    const reloading = this.state === 'reload';
    const u = reloading ? clamp(this.stateT / this.reloadLen, 0, 1) : 0;
    const E = this.reloadEmpty;

    // recarga: a arma inclina para mostrar por onde entra a munição
    if (reloading) {
      const tilt = bump(u, 0, 0.12, 0.86, 1);
      switch (mdl.style) {
        case 'mag':
          // gira para a direita e sobe um pouco: aparece o encaixe do pente
          rot.z -= 0.5 * tilt;
          rot.y += 0.25 * tilt;
          rot.x += 0.08 * tilt;
          pos.y += 0.09 * tilt;
          pos.x -= 0.06 * tilt;
          pos.z += 0.03 * tilt;
          // tapa no pente
          rot.x += E ? 0.05 * bump(u, 0.56, 0.58, 0.59, 0.64) : 0.05 * bump(u, 0.63, 0.65, 0.66, 0.71);
          if (E && mdl.charge) moveZ = Math.max(moveZ, smooth(0.71, 0.76, u) * (1 - smooth(0.8, 0.82, u)) * mdl.moveDist);
          break;
        case 'break':
          // sobe e vira para o centro: dá para ver a culatra aberta
          rot.x -= 0.05 * tilt;
          rot.y += 0.3 * tilt;
          rot.z += 0.3 * tilt;
          pos.y += 0.07 * tilt;
          pos.x -= 0.06 * tilt;
          // canos basculam para baixo e fecham com um tranco
          hingeX = mdl.hingeOpen * bump(u, 0.06, 0.18, 0.78, 0.86);
          rot.x += 0.1 * bump(u, 0.82, 0.85, 0.87, 0.95);
          break;
        case 'pump': {
          // deita para a direita: a janela de baixo fica virada para a mão
          rot.z -= 0.75 * tilt;
          rot.y += 0.2 * tilt;
          rot.x += 0.05 * tilt;
          pos.y += 0.06 * tilt;
          pos.x -= 0.06 * tilt;
          const rackAt = (PUMP.start + this.reloadShells * PUMP.shell + PUMP.end) * this.reloadScale;
          if (E && this.stateT > rackAt) moveZ = bump((this.stateT - rackAt) / (PUMP.rack * this.reloadScale), 0.1, 0.4, 0.5, 0.9) * mdl.moveDist;
          break;
        }
        case 'dual': {
          // sacode para soltar os pentes, desce até o cinto e volta com os novos
          rot.x += 0.25 * bump(u, 0.04, 0.1, 0.14, 0.22);
          const dip = bump(u, 0.18, 0.32, 0.44, 0.6);
          pos.y -= 0.3 * dip;
          rot.x -= 0.9 * dip;
          break;
        }
        case 'bolt':
          rot.z += 0.3 * tilt;
          rot.x += 0.1 * tilt;
          pos.y -= 0.02 * tilt;
          break;
        case 'cell':
          rot.x += 0.35 * tilt;
          rot.z += 0.3 * tilt;
          pos.y -= 0.015 * tilt;
          break;
      }
    }
    if (mdl.moving) mdl.moving.position.z = (mdl.moving.userData.restZ ??= mdl.moving.position.z) + moveZ;
    if (mdl.hinge) mdl.hinge.rotation[mdl.hingeAxis] = hingeX;
    // tambor gira uma câmara por tiro
    if (mdl.spinner) mdl.spinner.rotation.y += (this.spinTo - mdl.spinner.rotation.y) * (1 - Math.exp(-dt * 30));
    this.reloadHands(mdl, reloading, u, E, hingeX, dt);
    for (const st of mdl.stock) st.visible = adsE < 0.6;

    // troca de arma: desce a atual e sobe a nova
    if (this.state === 'switch') {
      const u = this.stateT / SWITCH_TIME;
      const d = u < 0.5 ? smooth(0, 0.5, u) : 1 - smooth(0.5, 1, u);
      pos.y -= 0.28 * d;
      rot.x -= 0.8 * d;
    }

    // ação (caixote, bebida, granada): arma desce
    this.bottle.visible = false;
    this.grenadeHand.visible = false;
    if (this.state === 'action' && this.action) {
      const u = this.stateT / this.action.dur;
      const dip = bump(u, 0, 0.18, 0.85, 1);
      const k = this.action.kind;
      if (k === 'inspect') {
        // ergue e vira a arma para mostrar a pintura de brasa
        const show = bump(u, 0, 0.25, 0.8, 1);
        const turn = Math.sin(smooth(0.15, 0.8, u) * Math.PI);
        pos.x -= 0.07 * show;
        pos.y += 0.05 * show;
        pos.z += 0.04 * show;
        rot.y += 0.9 * show + 0.25 * turn;
        rot.z += 0.45 * show;
        rot.x += 0.15 * show;
      } else {
        pos.y -= (k === 'throw' ? 0.12 : 0.3) * dip;
        rot.x -= (k === 'throw' ? 0.4 : 0.9) * dip;
      }
      if (k === 'drink' && u > 0.12 && u < 0.92) {
        this.bottle.visible = true;
        const up = smooth(0.12, 0.38, u);
        const down = smooth(0.78, 0.92, u);
        const tilt = smooth(0.38, 0.5, u) * (1 - down);
        this.bottle.position.set(lerp(0.12, 0.015, up), lerp(-0.34, -0.085, up) - down * 0.3, lerp(-0.36, -0.2, up));
        this.bottle.rotation.set(1.25 * tilt, 0, lerp(-0.3, 0.05, up));
      }
      if (k === 'throw' && u < 0.6) {
        this.grenadeHand.visible = true;
        const back = smooth(0, 0.3, u);
        const fwd = smooth(0.32, 0.5, u);
        this.grenadeHand.position.set(lerp(-0.2, -0.12, back) + fwd * 0.08, lerp(-0.3, -0.08, back) + fwd * 0.05, lerp(-0.3, -0.18, back) - fwd * 0.4);
        this.grenadeHand.rotation.set(-0.4 * back + fwd * 1.2, 0, 0.2);
      }
    }

    // faca
    this.knifeRig.visible = false;
    if (this.state === 'knife') {
      const u = this.stateT / KNIFE.cooldown;
      const dip = bump(u, 0, 0.12, 0.6, 0.95);
      rot.x -= 0.6 * dip;
      rot.z -= 0.35 * dip;
      pos.y -= 0.09 * dip;
      pos.x += 0.04 * dip;
      if (u > 0.03 && u < 0.7) {
        this.knifeRig.visible = true;
        this.knifeBasic.visible = !this.heavyKnife && !this.punho;
        this.knifeHeavy.visible = this.heavyKnife && !this.punho;
        this.fistRig.visible = this.punho;
        if (this.punho) {
          // soco reto: recua, estica para a frente e volta
          const back = smooth(0.03, 0.16, u);
          const hit = smooth(0.16, 0.3, u);
          const away = smooth(0.45, 0.7, u);
          this.knifeRig.position.set(lerp(0.2, 0.0, hit), lerp(-0.24, -0.08, hit) - away * 0.2, lerp(-0.18, -0.62, hit) + (1 - back) * 0.05);
          this.knifeRig.rotation.set(lerp(0.1, -0.05, hit), lerp(0.3, 0, hit), lerp(-0.2, 0, hit));
        } else {
          const s = smooth(0.05, 0.32, u);
          const away = smooth(0.45, 0.7, u);
          this.knifeRig.position.set(lerp(0.3, -0.2, s), lerp(-0.26, -0.07, s) - away * 0.2, lerp(-0.32, -0.48, s));
          this.knifeRig.rotation.set(lerp(-0.1, 0.1, s), lerp(0.9, -0.7, s), lerp(-0.7, 0.8, s));
        }
      }
    }

    if (this.state === 'raise') {
      const u = smooth(0, 1, this.stateT / 0.45);
      pos.y -= (1 - u) * 0.22;
      rot.x -= (1 - u) * 0.7;
    }

    // caído: a arma fica mais baixa e torta
    if (pc.downT > 0.01) {
      pos.y -= 0.01 * pc.downT;
      rot.z -= 0.2 * pc.downT;
    }

    // cajado: brilho e anéis animados; a carga treme a arma e puxa o cano para trás
    const tick = mdl.group.userData.tick as ((t: number, charge: number) => void) | undefined;
    if (tick) {
      const c = this.chargeFrac;
      tick(t, c);
      if (c > 0) {
        pos.x += (Math.random() - 0.5) * 0.004 * c;
        pos.y += (Math.random() - 0.5) * 0.004 * c;
        pos.z += 0.02 * c;
      }
    }

    this.root.position.copy(pos);
    this.root.rotation.copy(rot);

    this.ember.offset.set(t * 0.03, t * 0.017);
    (this.flash.material as THREE.MeshBasicMaterial).color.setRGB(2.5, this.def.upgraded ? 0.9 : 2.2, this.def.upgraded ? 0.6 : 1.8);
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    for (const it of this.smoke) {
      if (!it.s.visible) continue;
      it.t += dt;
      if (it.t >= it.life) {
        it.s.visible = false;
        continue;
      }
      const u = it.t / it.life;
      it.s.position.addScaledVector(it.v, dt);
      it.s.scale.setScalar((0.02 + u * 0.07) * it.s.userData.k);
      (it.s.material as THREE.SpriteMaterial).opacity = 0.14 * (1 - u) * Math.min(1, it.t * 20);
    }
    this.flashLight.intensity = this.flashT > 0 ? 2.5 : 0;
  }
}
