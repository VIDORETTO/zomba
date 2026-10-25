import * as THREE from 'three';
import { BISPO, BOSS, CRAWLER, DOGS, TRINCHEIRA, VULTO, ZOMBIE } from '../shared/constants';
import type { GameEvent, ZombieAnim, ZombieKind } from '../shared/protocol';
import { angleLerp, clamp, lerp, mulberry32 } from '../shared/rng';
import type { AudioEngine } from './audio';
import type { FX } from './fx';
import { animateBoss, buildBoss, type BossRig } from './boss';
import { animateBispo, buildBispo, type BispoRig } from './bispo';
import { animateDog, buildDog, type DogRig } from './dog';
import { animateBlindado, buildBlindado, type BlindadoRig } from './blindado';
import { animateCape, buildCruzado, type CruzadoRig } from './cruzado';
import { buildHumanoid, flatMat, part, type Humanoid } from './humanoid';
import type { Sample } from './snapbuffer';
import type { TexSet } from './textures';

const SKIN = [0xa8b892, 0xb8ba9e, 0x98a688, 0xc2bba0, 0x8c9a80, 0xb4a894];
const SHIRT = [0x86705a, 0xb2aa98, 0x5e7088, 0x963e34, 0x6c7a5e, 0xa49070, 0x55555e, 0xbaa682, 0x5e7a5e];
const PANTS = [0x46506a, 0x5e5040, 0x726a58, 0x404040, 0x5a6274, 0x76664f];
const HAIR = [0x1a1410, 0x3a2a1a, 0x5a5048, 0x2a2420, 0x6a6058];

const R_ = (a: number, b: number) => a + Math.random() * (b - a);

const KIND_SPEED = [ZOMBIE.walkSpeed, ZOMBIE.runSpeed, ZOMBIE.sprintSpeed, 0, 0, VULTO.speed, BISPO.speed[0], 1.9, TRINCHEIRA.templarSpeed, CRAWLER.speed[1]];

// Visual de 1918 (Trincheira): capotes de lã, capacetes redondos, máscaras de gás, bandoleiras e lama na roupa
export type Era = 'padrao' | 'ww1';
const COAT = [0x6b5f4a, 0x59554a, 0x4e5240, 0x70664f, 0x4a4a46, 0x5f5444, 0x7a6e56];
const WOOL = [0x4a4538, 0x3e3d36, 0x544a3a, 0x353530];
const MUD = 0x3a2c1e;
const OVERLAY_BOX = new THREE.BoxGeometry(1, 1, 1);
const ICE_MAT = new THREE.MeshBasicMaterial({ color: 0xaee4ff, transparent: true, opacity: 0.45, depthWrite: false });
const BURN_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.7, 0.15), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });

class ZombieView {
  readonly h: Humanoid;
  readonly rnd: () => number;
  phase = 0;
  speed = 0;
  lastX = 0;
  lastZ = 0;
  yaw = 0;
  anim: ZombieAnim = 'move';
  riseT = 0;
  attackT = 99;
  climbT = 0;
  // Rastejador: tempo no salto e na escalada, e a pose atual (inclinação do corpo, avanço e altura), que vai suave de uma para outra
  leapT = 0;
  wallT = 0;
  // sons: tempo até o próximo arranhão, último grunhido de dor e o lado da onda do passo (para soar um passo por ciclo)
  sndT = 0;
  painT = 0;
  stepSign = 0;
  cPitch = 1.38;
  cZ = -0.82;
  cLift = 0.22;
  groanT: number;
  dying = false;
  deathT = 0;
  fallDir = 1;
  // morte das armas maravilha: voando (velocidade) ou encolhendo para dentro do vórtice
  fling: THREE.Vector3 | null = null;
  flingY = 0;
  shrink = false;
  readonly limp: number;
  readonly armStyle: number;
  readonly headTilt: number;
  // tranco ao levar tiro (1 = acabou de levar, cai até 0), lado do tiro e se foi na cabeça
  flinch = 0;
  flinchSide = 0;
  flinchHead = false;
  // jeito de morrer: 0 = cai para a frente ou para trás, 1 = de joelhos e de cara, 2 = de lado girando
  readonly deathStyle: number;

  // Cruzado: capa balançando
  cape: CruzadoRig | null = null;

  constructor(readonly id: number, readonly kind: ZombieKind, readonly look: number, tex: TexSet, era: Era = 'padrao') {
    const r = mulberry32(look);
    this.rnd = r;
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
    const ww1 = era === 'ww1' && (kind <= 2 || kind === 9);
    const skin = flatMat(pick(SKIN), tex.grime);
    const shirt = flatMat(ww1 ? pick(COAT) : pick(SHIRT), tex.grime);
    // Vulto: criatura pequena e escura da névoa, de olhos claros
    const vulto = kind === 5;
    const shade = flatMat(0x24201e, tex.grime);
    if (kind === 8) {
      this.cape = buildCruzado(tex, look);
      this.h = this.cape.h;
    } else this.h = buildHumanoid(vulto ? {
      skin: shade, shirt: shade, pants: shade, shoes: shade, hair: null,
      eyes: flatMat(0x000000, null, 0xb8e0ff, 4), jaw: flatMat(0x0e0c0c),
      scale: 0.58 + r() * 0.06, bulk: 0.8,
    } : {
      skin,
      shirt,
      sleeves: ww1 ? shirt : r() < 0.35 ? skin : shirt,
      pants: flatMat(ww1 ? pick(WOOL) : pick(PANTS), tex.grime),
      shoes: flatMat(ww1 ? 0x2a2018 : 0x1e1a16),
      hair: ww1 ? null : r() < 0.7 ? flatMat(pick(HAIR)) : null,
      eyes: flatMat(0x000000, null, 0xffa030, 5),
      jaw: flatMat(0x4a2a24, tex.grime),
      scale: kind === 9 ? 0.9 + r() * 0.08 : 0.94 + r() * 0.12,
      bulk: 0.9 + r() * 0.25,
    });
    if (ww1) this.dressWw1(r, tex, shirt);
    if (kind === 9) this.maimArms(tex);
    for (const m of this.h.hitMeshes) m.userData.zid = id;
    this.limp = r() < 0.35 ? 0.4 + r() * 0.4 : 1;
    this.armStyle = r();
    this.headTilt = (r() - 0.5) * 0.6;
    this.groanT = 1 + r() * 5;
    this.fallDir = r() < 0.5 ? 1 : -1;
    this.deathStyle = Math.floor(r() * 3);
  }

  // Rastejador: sem braços. Os braços somem (e deixam de ser alvo) e ficam tocos de carne viva nos ombros.
  private maimArms(tex: TexSet) {
    const h = this.h;
    const gone = new Set<THREE.Object3D>();
    for (const a of [h.armL.upper, h.armR.upper]) {
      a.visible = false;
      a.traverse((o) => gone.add(o));
    }
    for (let i = h.hitMeshes.length - 1; i >= 0; i--) if (gone.has(h.hitMeshes[i])) h.hitMeshes.splice(i, 1);
    const flesh = flatMat(0x6a2020, tex.grime, 0x180404, 0.4);
    const bone = flatMat(0xc9c2ac);
    for (const side of [-1, 1]) {
      part(h.torso, 0.16, 0.18, 0.16, side * 0.25, 0.44, 0, flesh, 'body', h.hitMeshes);
      part(h.torso, 0.05, 0.07, 0.05, side * 0.27, 0.34, 0.02, bone, null, h.hitMeshes);
    }
  }

  // Equipamento de soldado de 1918 (genérico, sem insígnias): capacete redondo, boné ou máscara de gás,
  // bandoleira, cartucheiras, gola do capote e lama nas botas e na barra.
  private dressWw1(r: () => number, tex: TexSet, coat: THREE.Material) {
    const h = this.h;
    const steel = flatMat(0x4c5048, tex.grime);
    const leather = flatMat(0x4a3320, tex.grime);
    const cloth = flatMat(0x5a5342, tex.grime);
    const rubber = flatMat(0x252320, tex.grime);
    const mud = flatMat(MUD, tex.grime);
    const hits = h.hitMeshes;
    const roll = r();
    if (roll < 0.45) {
      // capacete redondo de aço com aba curta
      part(h.head, 0.29, 0.1, 0.31, 0, 0.3, 0, steel, 'head', hits);
      part(h.head, 0.25, 0.07, 0.27, 0, 0.37, 0, steel, 'head', hits);
      part(h.head, 0.33, 0.025, 0.35, 0, 0.255, 0, steel, 'head', hits);
    } else if (roll < 0.7) {
      // boné de lã com aba
      part(h.head, 0.27, 0.09, 0.29, 0, 0.3, 0, cloth, 'head', hits);
      part(h.head, 0.25, 0.025, 0.12, 0, 0.27, 0.19, leather, 'head', hits);
    } else if (roll < 0.9) {
      // máscara de gás com capacete: olhos de vidro e filtro na frente
      part(h.head, 0.29, 0.1, 0.31, 0, 0.3, 0, steel, 'head', hits);
      part(h.head, 0.25, 0.07, 0.27, 0, 0.37, 0, steel, 'head', hits);
      part(h.head, 0.26, 0.2, 0.06, 0, 0.1, 0.15, rubber, 'head', hits);
      for (const x of [-0.065, 0.065]) part(h.head, 0.07, 0.07, 0.03, x, 0.15, 0.185, flatMat(0x101414, null, 0x203028, 0.8), null, hits);
      part(h.head, 0.09, 0.09, 0.08, 0, 0.03, 0.21, steel, 'head', hits);
    } else {
      // cabeça enfaixada
      part(h.head, 0.27, 0.12, 0.29, 0, 0.26, 0, cloth, 'head', hits);
    }
    // gola do capote e bandoleira atravessada com cartucheiras
    part(h.torso, 0.46, 0.08, 0.28, 0, 0.55, 0, coat, null, hits);
    const strap = part(h.torso, 0.07, 0.66, 0.02, 0, 0.28, 0.135, leather, null, hits);
    strap.rotation.z = 0.7;
    for (let i = 0; i < 3; i++) part(h.torso, 0.07, 0.07, 0.04, 0.13 - i * 0.13, 0.13 + i * 0.15, 0.15, leather, null, hits).rotation.z = 0.7;
    // barra do capote e lama nas pernas
    part(h.hips, 0.4, 0.4, 0.24, 0, -0.2, 0, coat, 'body', hits);
    for (const leg of [h.legL, h.legR]) part(leg.lower, 0.15, 0.2, 0.16, 0, -0.34, 0.01, mud, null, hits);
    if (r() < 0.6) part(h.torso, 0.22, 0.18, 0.02, (r() - 0.5) * 0.2, 0.2, 0.125, mud, null, hits);
  }
}

// Blindado: humanoide enorme em armadura a vapor; a corrente da garra vive no espaço do mundo
class BlindadoView {
  readonly rig: BlindadoRig;
  readonly h: Humanoid;
  readonly kind: ZombieKind = 7;
  phase = 0;
  speed = 0;
  lastX = 0;
  lastZ = 0;
  yaw = 0;
  anim: ZombieAnim = 'rise';
  animT = 0;
  riseT = 0;
  attackT = 99;
  climbT = 0;
  groanT = 3;
  dying = false;
  deathT = 0;
  fallDir = -1;
  fling: THREE.Vector3 | null = null;
  flingY = 0;
  shrink = false;
  stepSide = 0;
  chain: { pid: string } | null = null;

  constructor(readonly id: number, readonly look: number, tex: TexSet) {
    this.rig = buildBlindado(tex);
    this.h = this.rig.h;
    for (const m of this.h.hitMeshes) m.userData.zid = id;
  }
}

// Cão Infernal: mesma interface da vista do zumbi (posição, animação, morte)
class DogView {
  readonly h: DogRig;
  readonly kind: ZombieKind = 3;
  phase = 0;
  speed = 0;
  lastX = 0;
  lastZ = 0;
  yaw = 0;
  anim: ZombieAnim = 'move';
  riseT = 0;
  attackT = 99;
  climbT = 0;
  groanT: number;
  dying = false;
  deathT = 0;

  constructor(readonly id: number, readonly look: number, tex: TexSet) {
    this.h = buildDog(look, tex);
    for (const m of this.h.hitMeshes) m.userData.zid = id;
    this.groanT = 0.5 + Math.random() * 2;
  }
}

// Carrasco: humanoide grande com armadura; a corrente lançada vive no espaço do mundo
class BossView {
  readonly rig: BossRig;
  readonly h: Humanoid;
  readonly kind: ZombieKind = 4;
  phase = 0;
  speed = 0;
  lastX = 0;
  lastZ = 0;
  yaw = 0;
  anim: ZombieAnim = 'rise';
  animT = 0;
  riseT = 0;
  attackT = 99;
  climbT = 0;
  groanT = 3;
  dying = false;
  deathT = 0;
  fallDir = -1;
  fling: THREE.Vector3 | null = null;
  flingY = 0;
  shrink = false;
  stepSide = 0;
  chain: { pid: string } | null = null;

  constructor(readonly id: number, readonly look: number, tex: TexSet) {
    this.rig = buildBoss(tex);
    this.h = this.rig.h;
    for (const m of this.h.hitMeshes) m.userData.zid = id;
  }
}

// Bispo: flutua; a esfera de fogo aparece enquanto ele troca de fase
class BispoView {
  readonly rig: BispoRig;
  readonly h: Humanoid;
  readonly kind: ZombieKind = 6;
  phase = 0;
  speed = 0;
  lastX = 0;
  lastZ = 0;
  yaw = 0;
  anim: ZombieAnim = 'rise';
  animT = 0;
  riseT = 0;
  attackT = 99;
  climbT = 0;
  groanT = 4;
  dying = false;
  deathT = 0;
  fallDir = -1;
  fling: THREE.Vector3 | null = null;
  flingY = 0;
  shrink = false;

  constructor(readonly id: number, readonly look: number, tex: TexSet) {
    this.rig = buildBispo(tex);
    this.h = this.rig.h;
    for (const m of this.h.hitMeshes) m.userData.zid = id;
  }
}

type View = ZombieView | DogView | BossView | BispoView | BlindadoView;

function makeView(id: number, kind: ZombieKind, look: number, tex: TexSet, era: Era = 'padrao'): View {
  if (kind === 4) return new BossView(id, look, tex);
  if (kind === 6) return new BispoView(id, look, tex);
  if (kind === 7) return new BlindadoView(id, look, tex);
  return kind === 3 ? new DogView(id, look, tex) : new ZombieView(id, kind, look, tex, era);
}

// Tom da voz de cada zumbi (sai do sorteio da aparência); o Vulto, pequeno, tem a voz mais aguda.
function voicePitch(v: View): number {
  if (!(v instanceof ZombieView)) return 1;
  if (v.kind === 5) return 1.35;
  if (v.kind === 9) return 1.15 + (((v.look * 7919) >>> 0) % 100) / 100 * 0.2;
  return 0.88 + (((v.look * 7919) >>> 0) % 100) / 100 * 0.24;
}

export class ZombieManager {
  readonly group = new THREE.Group();
  private readonly views = new Map<number, View>();
  private readonly corpses: View[] = [];
  private readonly dead = new Map<number, number>();
  private readonly tmp = new THREE.Vector3();
  private t = 0;
  // tremor dos passos e golpes do Carrasco (a Game soma na câmera)
  quake = 0;
  // capacetes voando depois de quebrar
  private flyers: { obj: THREE.Object3D; vel: THREE.Vector3; spin: number; t: number }[] = [];
  // onde está cada jogador (alvo da corrente)
  locate: (pid: string) => THREE.Vector3 | null = () => null;
  // Bispo imune (trocando de fase): a Game copia do estado da partida
  bispoShield = false;
  // fração da vida do chefão vivo (o Blindado solta as placas aos 75%, 50% e 25%)
  bossHp: number | null = null;
  // visual dos zumbis comuns: 'ww1' = soldados de 1918 (Trincheira). Ligue antes da partida começar.
  era: Era = 'padrao';
  // queimando ou congelado (camada de cor sobre o corpo), por zumbi
  private readonly statuses = new Map<number, { kind: 'queima' | 'congela'; t: number; overlay: THREE.Group }>();

  constructor(scene: THREE.Scene, private readonly tex: TexSet, private readonly fx: FX, private readonly audio: AudioEngine) {
    scene.add(this.group);
  }

  hitMeshes(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const v of this.views.values()) for (const m of v.h.hitMeshes) out.push(m);
    return out;
  }

  // posições atuais (para colisão do jogador e mira da faca)
  // posições atuais; `top` = altura do peito (onde sai o sangue da faca)
  bodies(): { id: number; x: number; y: number; z: number; rising: boolean; top: number }[] {
    const out = [];
    for (const v of this.views.values()) {
      const p = v.h.root.position;
      const dog = v instanceof DogView;
      const boss = v instanceof BossView || v instanceof BispoView || v instanceof BlindadoView;
      const rising = v.anim === 'rise' && (v instanceof BispoView ? v.animT < BISPO.riseTime * 0.7 : v instanceof BlindadoView ? v.animT < 2.4 * 0.8 : boss ? v.animT < BOSS.riseTime * 0.6 : v.riseT < (dog ? DOGS.arriveTime * 0.8 : ZOMBIE.riseTime * 0.6));
      out.push({ id: v.id, x: p.x, y: p.y, z: p.z, rising, top: dog ? 0.6 : boss ? 2.3 : v.kind === 9 ? 0.6 : 1.25 });
    }
    return out;
  }

  view(id: number): View | undefined {
    return this.views.get(id);
  }

  // Zumbi levou tiro: tranco para trás (mais forte de escopeta), cabeça jogada se foi nela.
  // dir = direção do tiro (sem ela, o tranco é para trás do zumbi)
  flinch(id: number, part: string, dir: THREE.Vector3 | null, power = 1) {
    const v = this.views.get(id);
    if (!(v instanceof ZombieView)) return;
    v.flinch = Math.min(1.3, v.flinch * 0.4 + power);
    // grunhido de dor (nem todo tiro, e não em rajada)
    if (Math.random() < 0.4 && this.t - v.painT > 0.6) {
      v.painT = this.t;
      this.audio.zombiePain(v.h.root.position, voicePitch(v));
    }
    v.flinchHead = part === 'head';
    if (dir) {
      // lado do tiro no espaço do zumbi
      const lx = dir.x * Math.cos(v.yaw) - dir.z * Math.sin(v.yaw);
      v.flinchSide = Math.max(-1, Math.min(1, lx * 2));
    } else v.flinchSide = (Math.random() - 0.5) * 1.2;
  }

  onEvent(e: GameEvent) {
    switch (e.e) {
      case 'zattack': {
        const v = this.views.get(e.zid);
        if (v instanceof DogView) this.audio.dogBark(v.h.root.position);
        else if (v instanceof BossView) this.audio.bossRoar(v.h.root.position, 0.6);
        else if (v instanceof BispoView) this.audio.bispoVoice(v.h.root.position, 0.7);
        else if (v instanceof BlindadoView) this.audio.bossRoar(v.h.root.position, 0.5);
        else if (v instanceof ZombieView && v.kind === 8) this.audio.trSound('cruzado-grito', v.h.root.position, 0.8);
        else if (v) this.audio.zombieAttack(v.h.root.position, voicePitch(v));
        break;
      }
      case 'zrise':
        this.fx.dirt(e.x, e.z);
        this.audio.zombieRise(this.tmp.set(e.x, 0.3, e.z));
        break;
      case 'boss': {
        const v = this.views.get(e.zid);
        if (!(v instanceof BossView)) break;
        if (e.phase === 'chain' && e.pid) v.chain = { pid: e.pid };
        if (e.phase === 'armor') this.breakHelmet(v);
        break;
      }
      case 'blindado': {
        const v = this.views.get(e.zid);
        const at = new THREE.Vector3(e.x, 1.2, e.z);
        if (e.phase === 'spawn') {
          this.audio.trSound('blindado-chega', at);
          this.fx.fireBurst(at.clone().setY(0.4));
          this.quake = Math.max(this.quake, 0.5 * Math.max(0, 1 - at.distanceTo(this.listener) / 30));
        } else if (e.phase === 'flame') this.audio.trSound('blindado-fogo', v ? v.h.root.position : at);
        else if (e.phase === 'claw') {
          this.audio.trSound('blindado-garra', v ? v.h.root.position : at);
          if (v instanceof BlindadoView && e.pid) v.chain = { pid: e.pid };
        } else if (e.phase === 'jump') this.audio.trSound('blindado-salto', v ? v.h.root.position : at);
        else if (e.phase === 'visor' && v instanceof BlindadoView) this.breakHelmet(v);
        break;
      }
      case 'fx': {
        // status em zumbi: queimando, congelado, estilhaçou
        if (e.zid === undefined) break;
        if (e.kind === 'queima' || e.kind === 'congela') this.setStatus(e.zid, e.kind, 2.5);
        else if (e.kind === 'estilhaca') {
          const v = this.views.get(e.zid);
          const at = v ? v.h.root.position.clone().setY(v.h.root.position.y + 1) : new THREE.Vector3(e.x, e.y, e.z);
          this.setStatus(e.zid, null);
          this.audio.trSound('gelo-quebra', at);
          for (let k = 0; k < 5; k++) this.fx.impact(at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8)), 0, 1, 0, 'glass');
        }
        break;
      }
      case 'zvanish': {
        // Vulto se desfaz na névoa
        const v = this.views.get(e.zid);
        if (!v) break;
        const p = v.h.root.position;
        this.fx.dirt(p.x, p.z);
        this.group.remove(v.h.root);
        this.views.delete(e.zid);
        this.dead.set(e.zid, this.t);
        break;
      }
      case 'runover': {
        // atropelado: voa para trás e cai
        const v = this.views.get(e.zid);
        if (!v) break;
        this.views.delete(e.zid);
        this.dead.set(e.zid, this.t);
        const p = v.h.root.position.clone();
        p.y += 1;
        this.fx.blood(p, new THREE.Vector3(0, 1, 0), 2);
        this.audio.bodyHit(p, false);
        v.dying = true;
        v.deathT = 0;
        if (v instanceof DogView) {
          this.group.remove(v.h.root);
          break;
        }
        this.corpses.push(v);
        break;
      }
      case 'zkill': {
        this.dead.set(e.zid, this.t);
        let v = this.views.get(e.zid);
        if (!v) {
          v = makeView(e.zid, e.kind, e.look, this.tex, this.era);
          v.h.root.position.set(e.x, e.y, e.z);
          v.h.root.rotation.y = e.yaw;
          this.group.add(v.h.root);
        }
        this.views.delete(e.zid);
        if (v instanceof BossView || v instanceof BlindadoView) v.rig.line.visible = false;
        this.setStatus(e.zid, null);
        v.dying = true;
        v.deathT = 0;
        if (v instanceof DogView) {
          // o cão explode em fogo
          const p = v.h.root.position.clone();
          p.y += 0.5;
          this.fx.fireBurst(p);
          this.fx.explosion(p.setY(p.y - 0.3));
          this.audio.dogDeath(v.h.root.position);
          this.corpses.push(v);
          break;
        }
        if (e.sucked) {
          v.shrink = true;
          this.audio.zombieDeath(v.h.root.position, voicePitch(v));
          this.corpses.push(v);
          break;
        }
        if (e.fling && !(v instanceof BossView) && !(v instanceof BlindadoView)) {
          v.fling = new THREE.Vector3(...e.fling);
          v.flingY = v.h.root.position.y;
          v.fallDir = -1;
        }
        if (e.part === 'head') {
          v.h.head.visible = false;
          v.h.head.getWorldPosition(this.tmp);
          this.fx.blood(this.tmp, new THREE.Vector3(0, 1, 0), 2.2);
          v.fallDir = -1;
        }
        if (v instanceof BossView || v instanceof BlindadoView) this.audio.bossRoar(v.h.root.position, 1.2);
        else if (v instanceof BispoView) {
          v.rig.shield.visible = false;
          this.audio.bispoVoice(v.h.root.position, 1.4);
        } else this.audio.zombieDeath(v.h.root.position, voicePitch(v));
        this.corpses.push(v);
        if (this.corpses.length > 14) {
          const old = this.corpses.shift()!;
          this.group.remove(old.h.root);
        }
        break;
      }
    }
  }

  private listener = new THREE.Vector3();

  update(sample: Sample | null, dt: number, listener: THREE.Vector3) {
    this.t += dt;
    this.listener.copy(listener);
    for (const [id, at] of this.dead) if (this.t - at > 3) this.dead.delete(id);

    if (sample) {
      const { a, b, k } = sample;
      const seen = new Set<number>();
      for (const zb of b.s.zombies) {
        if (this.dead.has(zb.id)) continue;
        seen.add(zb.id);
        const za = a.zombies.get(zb.id) ?? zb;
        let v = this.views.get(zb.id);
        if (!v) {
          v = makeView(zb.id, zb.kind, zb.look, this.tex, this.era);
          v.h.root.position.set(zb.x, zb.y, zb.z);
          v.lastX = zb.x;
          v.lastZ = zb.z;
          v.yaw = zb.yaw;
          v.anim = zb.anim;
          this.views.set(zb.id, v);
          this.group.add(v.h.root);
          if (v instanceof BossView || v instanceof BlindadoView) this.group.add(v.rig.line);
        }
        const anim = k < 0.5 ? za.anim : zb.anim;
        if (anim === 'rise' && v.anim !== 'rise') v.riseT = 0;
        if (anim === 'attack' && v.anim !== 'attack') v.attackT = 0;
        if (anim === 'climb' && v.anim !== 'climb') v.climbT = 0;
        if (v instanceof ZombieView) {
          if (anim === 'leap' && v.anim !== 'leap') {
            v.leapT = 0;
            this.audio.crawlerLeap(v.h.root.position, voicePitch(v));
          }
          if (anim === 'wall' && v.anim !== 'wall') v.wallT = 0;
          if (v.kind === 9 && anim === 'attack' && v.anim !== 'attack') this.audio.crawlerBite(v.h.root.position);
        }
        if ((v instanceof BossView || v instanceof BispoView || v instanceof BlindadoView) && anim !== v.anim) v.animT = 0;
        v.anim = anim;
        const p = v.h.root.position;
        const nx = lerp(za.x, zb.x, k);
        const nz = lerp(za.z, zb.z, k);
        // reapareceu longe (zumbi preso): teleporta
        if (Math.hypot(nx - p.x, nz - p.z) > 3) {
          v.lastX = nx;
          v.lastZ = nz;
        }
        p.x = nx;
        p.z = nz;
        p.y = lerp(za.y, zb.y, k);
        v.yaw = angleLerp(za.yaw, zb.yaw, k);
      }
      for (const [id, v] of this.views) {
        if (!seen.has(id) && !b.zombies.has(id)) {
          this.group.remove(v.h.root);
          if (v instanceof BossView || v instanceof BlindadoView) this.group.remove(v.rig.line);
          this.views.delete(id);
        }
      }
    }

    for (const v of this.views.values()) {
      this.animate(v, dt);
      v.groanT -= dt;
      if (v.groanT <= 0) {
        const dog = v instanceof DogView;
        if (v instanceof BossView) {
          v.groanT = 4 + Math.random() * 4;
          if (v.anim === 'move') this.audio.bossRoar(v.h.root.position, 0.45);
          continue;
        }
        if (v instanceof BlindadoView) {
          v.groanT = 5 + Math.random() * 4;
          if (v.anim === 'move') this.audio.bossRoar(v.h.root.position, 0.4);
          continue;
        }
        if (v instanceof BispoView) {
          v.groanT = 5 + Math.random() * 4;
          this.audio.bispoVoice(v.h.root.position, 0.4);
          continue;
        }
        v.groanT = dog ? 1.2 + Math.random() * 2.5 : (v.kind === 0 ? 3 : 2) + Math.random() * 5;
        if (v.h.root.position.distanceTo(listener) < 32) {
          if (dog) this.audio.dogGrowl(v.h.root.position);
          else if (v.kind === 5) this.audio.vultoHiss(v.h.root.position);
          else if (v.kind === 8) this.audio.trSound('cruzado-grito', v.h.root.position, 0.7);
          else this.audio.zombieIdle(v.h.root.position, v.kind, voicePitch(v));
        }
      }
    }

    this.updateStatuses(dt);

    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t += dt;
      f.vel.y -= 9.8 * dt;
      f.obj.position.addScaledVector(f.vel, dt);
      f.obj.rotation.x += f.spin * dt;
      if (f.obj.position.y < 0.15) {
        f.obj.position.y = 0.15;
        f.vel.set(f.vel.x * 0.4, Math.abs(f.vel.y) * 0.3, f.vel.z * 0.4);
        f.spin *= 0.5;
      }
      if (f.t > 6) {
        this.group.remove(f.obj);
        this.flyers.splice(i, 1);
      }
    }

    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const v = this.corpses[i];
      this.animateDeath(v, dt);
      if (v.deathT > (v instanceof DogView || v.shrink ? 0.35 : 8)) {
        this.group.remove(v.h.root);
        this.corpses.splice(i, 1);
      }
    }
  }

  // capacete arrancado: some da cabeça e sai voando (e para de contar como alvo)
  private breakHelmet(v: BossView | BlindadoView) {
    const helm = v.rig.helmet;
    if (!helm.visible) return;
    helm.updateWorldMatrix(true, true);
    const c = helm.clone();
    helm.matrixWorld.decompose(c.position, c.quaternion, c.scale);
    this.group.add(c);
    const dir = new THREE.Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw));
    this.flyers.push({ obj: c, vel: new THREE.Vector3(-dir.x * 2 + (Math.random() - 0.5), 4.5, -dir.z * 2 + (Math.random() - 0.5)), spin: 7, t: 0 });
    helm.visible = false;
    c.name = v instanceof BlindadoView ? 'blindado-visor-voando' : c.name;
    if (v instanceof BlindadoView) this.shatter(c.position, 7, 0x6a6a70, 'blindado-cacos');
    const gone = new Set<THREE.Object3D>(helm.children);
    for (let i = v.h.hitMeshes.length - 1; i >= 0; i--) if (gone.has(v.h.hitMeshes[i])) v.h.hitMeshes.splice(i, 1);
    this.fx.impact(c.position.clone(), 0, 1, 0);
    this.audio.armorBreak(c.position);
  }

  // cacos de armadura: pedacinhos que voam para todos os lados e caem (só visual)
  private shatter(at: THREE.Vector3, n: number, color: number, name: string) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.5 });
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.1 + Math.random() * 0.1, 0.04, 0.1 + Math.random() * 0.1), mat);
      m.name = name;
      m.position.copy(at);
      this.group.add(m);
      const a = Math.random() * Math.PI * 2;
      this.flyers.push({ obj: m, vel: new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 3), 3 + Math.random() * 3, Math.sin(a) * (2 + Math.random() * 3)), spin: 6 + Math.random() * 8, t: 0 });
    }
  }

  // placa de armadura que se solta (aos 75%, 50% e 25% da vida do Blindado): cai como um pedaço e some dos alvos
  private shedPlate(v: BlindadoView, plate: BlindadoRig['plates'][number]) {
    const obj = plate.obj;
    plate.gone = true;
    obj.updateWorldMatrix(true, true);
    const c = obj.clone();
    c.name = 'blindado-placa-caida';
    obj.matrixWorld.decompose(c.position, c.quaternion, c.scale);
    this.group.add(c);
    const dir = new THREE.Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw));
    this.flyers.push({ obj: c, vel: new THREE.Vector3(dir.x * 1.5 + (Math.random() - 0.5) * 3, 3.5, dir.z * 1.5 + (Math.random() - 0.5) * 3), spin: 5, t: 0 });
    obj.visible = false;
    const gone = new Set<THREE.Object3D>();
    obj.traverse((o) => gone.add(o));
    for (let i = v.h.hitMeshes.length - 1; i >= 0; i--) if (gone.has(v.h.hitMeshes[i])) v.h.hitMeshes.splice(i, 1);
    this.shatter(c.position, 4, 0x5f646a, 'blindado-cacos');
    this.fx.impact(c.position.clone(), 0, 1, 0);
    this.audio.armorBreak(c.position);
  }

  private animateBossView(v: BossView, dt: number) {
    const p = v.h.root.position;
    const moved = Math.hypot(p.x - v.lastX, p.z - v.lastZ);
    v.lastX = p.x;
    v.lastZ = p.z;
    v.speed = lerp(v.speed, Math.min(dt > 0 ? moved / dt : 0, 12), 1 - Math.exp(-dt * 8));
    v.animT += dt;
    v.h.root.rotation.y = v.yaw;
    const before = Math.sin(v.phase);
    v.phase += dt * v.speed * 1.5;
    // passos pesados: som e tremor
    const after = Math.sin(v.phase);
    if (v.speed > 0.6 && Math.sign(before) !== Math.sign(after)) {
      this.audio.bossStep(p, v.speed > 5);
      const near = Math.max(0, 1 - p.distanceTo(this.listener) / 20);
      this.quake = Math.max(this.quake, (v.speed > 5 ? 0.4 : 0.22) * near);
    }
    animateBoss(v.rig, { phase: v.phase, speed: v.speed, t: this.t, anim: v.anim, animT: v.animT });

    // corrente lançada: da mão até o jogador, indo e voltando
    const line = v.rig.line;
    line.visible = false;
    if (v.anim === 'chain' && v.chain) {
      const S = BOSS.chain;
      const out = clamp((v.animT - S.windup) / S.fly, 0, 1);
      const back = clamp((v.animT - S.windup - S.fly - 0.15) / (S.recover * 0.6), 0, 1);
      const k = out * (1 - back);
      if (k > 0.01) {
        v.h.root.updateMatrixWorld(true);
        const hand = v.h.armR.lower.localToWorld(new THREE.Vector3(0, -0.36, 0.03));
        const target = this.locate(v.chain.pid) ?? hand.clone().add(new THREE.Vector3(Math.sin(v.yaw) * 14, -1, Math.cos(v.yaw) * 14));
        const len = hand.distanceTo(target);
        line.visible = true;
        line.position.copy(hand);
        line.lookAt(target);
        v.rig.lineBody.scale.z = Math.max(0.01, len * k);
        v.rig.hook.position.z = len * k;
      }
    }
  }

  private animate(v: View, dt: number) {
    if (v instanceof BossView) {
      this.animateBossView(v, dt);
      return;
    }
    if (v instanceof BlindadoView) {
      this.animateBlindadoView(v, dt);
      return;
    }
    if (v instanceof BispoView) {
      const p = v.h.root.position;
      const moved = Math.hypot(p.x - v.lastX, p.z - v.lastZ);
      v.lastX = p.x;
      v.lastZ = p.z;
      v.speed = lerp(v.speed, Math.min(dt > 0 ? moved / dt : 0, 8), 1 - Math.exp(-dt * 6));
      v.animT += dt;
      v.h.root.rotation.y = v.yaw;
      animateBispo(v.rig, { speed: v.speed, t: this.t, anim: v.anim, animT: v.animT, shield: this.bispoShield });
      // brasas caindo da batina
      if (Math.random() < dt * 14) {
        const a = Math.random() * Math.PI * 2;
        this.fx.flame('bispo-' + v.id, this.tmp.set(p.x + Math.sin(a) * 0.5, p.y + 0.35, p.z + Math.cos(a) * 0.5), dt, 30, 0.3);
      }
      return;
    }
    if (v instanceof DogView) {
      this.animateDogView(v, dt);
      return;
    }
    const h = v.h;
    const p = h.root.position;
    const moved = Math.hypot(p.x - v.lastX, p.z - v.lastZ);
    v.lastX = p.x;
    v.lastZ = p.z;
    const inst = dt > 0 ? moved / dt : 0;
    v.speed = lerp(v.speed, Math.min(inst, 7), 1 - Math.exp(-dt * 8));
    h.root.rotation.y = v.yaw;

    if (v.kind === 9) {
      this.animateCrawler(v, dt);
      return;
    }
    const kind = v.kind === 5 ? 2 : v.kind === 8 ? 0 : v.kind;
    const norm = clamp(v.speed / KIND_SPEED[v.kind], 0, 1.3);
    v.phase += dt * v.speed * (kind === 0 ? 2.9 : 2.1);
    const ph = v.phase;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const t = this.t + v.look * 0.001;
    // passo arrastado: um por ciclo da perna, só dos que estão perto
    const sg = Math.sign(s);
    if (sg !== v.stepSign) {
      v.stepSign = sg;
      if (v.speed > 0.6 && v.anim === 'move' && p.distanceTo(this.listener) < 16) this.audio.zombieStep(p, kind === 0 ? 0.8 : 1.1);
    }

    const legAmp = (kind === 0 ? 0.42 : kind === 1 ? 0.78 : 0.95) * norm;
    h.legL.upper.rotation.x = s * legAmp * v.limp;
    h.legR.upper.rotation.x = -s * legAmp;
    h.legL.lower.rotation.x = Math.max(0, -c) * legAmp * 1.3 + 0.05;
    h.legR.lower.rotation.x = Math.max(0, c) * legAmp * 1.3 + 0.05;
    h.hips.position.y = 0.92 - Math.abs(s) * 0.035 * norm - (kind > 0 ? 0.04 * norm : 0);
    h.hips.rotation.y = s * 0.12 * norm;
    h.torso.rotation.x = (kind === 0 ? 0.2 : kind === 1 ? 0.38 : 0.52) * Math.max(0.4, norm);
    h.torso.rotation.z = Math.sin(ph * 0.5) * 0.1 + (v.limp < 1 ? 0.08 : 0);
    h.neck.rotation.z = v.headTilt + Math.sin(t * 0.8) * 0.08;
    h.neck.rotation.x = -0.15 - (kind > 0 ? 0.15 : 0);
    h.head.rotation.y = Math.sin(t * 0.6) * 0.25;

    let armL: number, armR: number;
    if (kind === 0) {
      armL = -1.35 + Math.sin(ph * 0.5 + 1) * 0.15;
      armR = -1.3 + Math.sin(ph * 0.5) * 0.15;
      if (v.armStyle < 0.25) armR = s * 0.35;
      // Cruzado: braços caídos, marchando
      if (v.kind === 8) {
        armL = -0.3 + s * 0.3;
        armR = -0.3 - s * 0.3;
      }
    } else if (kind === 1) {
      armL = -1.1 + s * 0.45;
      armR = -1.1 - s * 0.45;
    } else {
      armL = -0.5 + s * 0.95;
      armR = -0.5 - s * 0.95;
    }
    let elbow = kind === 2 ? -0.9 : -0.25;
    let lean = h.torso.rotation.x;

    if (v.anim === 'attack') {
      v.attackT += dt;
      const a = v.attackT;
      const up = clamp(a / 0.35, 0, 1);
      const down = clamp((a - 0.35) / 0.2, 0, 1);
      const back = clamp((a - 0.75) / 0.35, 0, 1);
      const raised = lerp(armR, -2.7, up);
      const swing = lerp(raised, -0.6, down * down);
      armL = lerp(swing, armL, back);
      armR = lerp(swing + 0.15, armR, back);
      elbow = lerp(-0.6, elbow, back);
      lean = lerp(lean, 0.55, down * (1 - back));
    }

    if (v.anim === 'rise') {
      v.riseT += dt;
      const r = clamp(v.riseT / ZOMBIE.riseTime, 0, 1);
      const e = 1 - Math.pow(1 - r, 2);
      h.body.position.y = -1.75 * (1 - e);
      armL = -2.7 + Math.sin(this.t * 7) * 0.25;
      armR = -2.6 + Math.sin(this.t * 7 + 2) * 0.25;
      lean = 0.3 * (1 - e);
    } else {
      h.body.position.y = 0;
    }

    // na barricada: puxa as tábuas alternando os braços
    if (v.anim === 'tear') {
      const s7 = Math.sin(this.t * 7 + v.look);
      armL = -1.6 + s7 * 0.5;
      armR = -1.6 - s7 * 0.5;
      elbow = -0.35 - Math.abs(s7) * 0.5;
      lean = 0.35;
    }
    // pula a janela: sobe, encolhe as pernas e cai do lado de dentro
    if (v.anim === 'climb') {
      v.climbT += dt;
      const k = clamp(v.climbT / 0.9, 0, 1);
      const b = Math.sin(Math.PI * k);
      h.body.position.y = b * 0.6;
      h.legL.upper.rotation.x = -1.3 * b;
      h.legR.upper.rotation.x = -0.9 * b;
      h.legL.lower.rotation.x = 1.6 * b;
      h.legR.lower.rotation.x = 1.3 * b;
      armL = -1.9;
      armR = -1.8;
      lean = 0.25 + 0.5 * b;
    }

    // tranco do tiro: tronco e cabeça vão para trás, braços abrem, o corpo recua um passo
    const f = v.flinch;
    if (f > 0.001) {
      lean -= f * 0.55;
      armL += f * 0.7;
      armR += f * 0.5;
      h.torso.rotation.z += v.flinchSide * f * 0.35;
      h.neck.rotation.x -= f * (v.flinchHead ? 0.9 : 0.25);
      h.neck.rotation.z += v.flinchSide * f * (v.flinchHead ? 0.5 : 0.15);
      v.flinch *= Math.exp(-dt * 7);
    }
    if (v.anim !== 'climb' && v.anim !== 'rise') h.body.position.z = -0.14 * f;

    h.armL.upper.rotation.x = armL;
    h.armR.upper.rotation.x = armR;
    h.armL.upper.rotation.z = -0.12;
    h.armR.upper.rotation.z = 0.12;
    h.armL.lower.rotation.x = elbow;
    h.armR.lower.rotation.x = elbow;
    h.torso.rotation.x = lean;
    if (v.cape) animateCape(v.cape, v.speed, t);
  }

  // ---------- Rastejador ----------

  // Deitado de bruços, sem braços: arrasta-se ondulando o corpo e empurrando com as pernas. Arma e salta em cima do
  // alvo, morde de perto e escala paredes de pé, raspando as pernas na parede.
  private animateCrawler(v: ZombieView, dt: number) {
    const h = v.h;
    const t = this.t + v.look * 0.001;
    const moving = clamp(v.speed / CRAWLER.speed[1], 0, 1.3);
    v.phase += dt * (2.5 + v.speed * 2.6);
    const s = Math.sin(v.phase);
    const c = Math.cos(v.phase);
    // sons: raspa no chão a cada impulso e arranha a parede quando sobe
    const near = h.root.position.distanceTo(this.listener) < 22;
    const sg = Math.sign(s);
    if (sg !== v.stepSign) {
      v.stepSign = sg;
      if (near && sg > 0 && v.speed > 0.8 && v.anim === 'move') this.audio.crawlerMove(h.root.position);
    }
    if (v.anim === 'wall' || v.anim === 'climb') {
      v.sndT -= dt;
      if (v.sndT <= 0 && near) {
        v.sndT = R_(0.14, 0.26);
        this.audio.crawlerScrabble(h.root.position);
      }
    }

    // pose alvo: [inclinação do corpo, avanço, altura]
    let pitch = 1.38;
    let zoff = -0.82;
    let lift = 0.22;
    let torso = -0.35 + s * 0.08 * moving;
    let neck = -0.95 + s * 0.1 * moving;
    let kickL = s * 0.55 * moving + 0.12;
    let kickR = -s * 0.55 * moving + 0.12;
    let kneeL = 0.25 + Math.max(0, -c) * 0.9 * moving;
    let kneeR = 0.25 + Math.max(0, c) * 0.9 * moving;
    let twist = s * 0.3 * moving;
    let riseDrop = 0;

    if (v.anim === 'rise') {
      v.riseT += dt;
      const e = 1 - Math.pow(1 - clamp(v.riseT / CRAWLER.riseTime, 0, 1), 2);
      riseDrop = -1.1 * (1 - e);
      neck = -0.6 + Math.sin(this.t * 9) * 0.25;
    }
    if (v.anim === 'attack') {
      // dá o bote com a cabeça: arma para trás, estica e morde
      v.attackT += dt;
      const a = v.attackT;
      const wind = clamp(a / CRAWLER.attackWindup, 0, 1);
      const strike = clamp((a - CRAWLER.attackWindup) / 0.12, 0, 1);
      const back = clamp((a - CRAWLER.attackWindup - 0.12) / 0.4, 0, 1);
      const k = strike * (1 - back);
      zoff += -0.15 * wind * (1 - strike) + 0.55 * k;
      torso = lerp(torso, -0.7, wind * (1 - strike)) + 1.0 * k;
      neck = lerp(neck, -1.2, wind * (1 - strike)) + 0.9 * k;
      pitch -= 0.1 * k;
    } else {
      v.attackT = 99;
    }
    if (v.anim === 'leap') {
      v.leapT += dt;
      const windup = CRAWLER.leap.windup;
      if (v.leapT < windup) {
        // agacha e arma as pernas
        const k = clamp(v.leapT / windup, 0, 1);
        lift = lerp(lift, 0.1, k);
        pitch = lerp(pitch, 1.3, k);
        torso = lerp(torso, -0.8, k);
        neck = lerp(neck, -1.1, k);
        kneeL = kneeR = lerp(kneeL, 1.5, k);
        kickL = kickR = lerp(kickL, 0.9, k);
        zoff += -0.12 * k;
      } else {
        // no ar: corpo esticado como uma flecha, boca aberta
        pitch = 1.12;
        lift = 0.4;
        torso = 0.1;
        neck = -0.45;
        kneeL = kneeR = 0.15;
        kickL = kickR = -0.2;
        zoff += 0.15;
      }
    } else {
      v.leapT = 0;
    }
    if (v.anim === 'wall' || v.anim === 'climb') {
      // sobe de pé, agarrando a parede com as pernas e o tronco
      v.wallT += dt;
      const sc = Math.sin(t * 13);
      pitch = 0.22 + Math.sin(t * 6.5) * 0.08;
      zoff = -0.1;
      lift = 0;
      torso = -0.15 + sc * 0.2;
      neck = -0.5;
      kickL = -1.0 + sc * 0.7;
      kickR = -1.0 - sc * 0.7;
      kneeL = 1.2 + sc * 0.4;
      kneeR = 1.2 - sc * 0.4;
      twist = sc * 0.25;
    } else {
      v.wallT = 0;
    }
    if (v.anim === 'tear') {
      // morde e puxa as tábuas da barricada
      const s7 = Math.sin(this.t * 9 + v.look);
      pitch = 0.75;
      zoff = -0.45;
      lift = 0.05;
      torso = 0.1 + s7 * 0.35;
      neck = -0.4 + s7 * 0.4;
      twist = s7 * 0.15;
    }

    // pose atual vai suave até a pose alvo
    const k = 1 - Math.exp(-dt * 11);
    v.cPitch = lerp(v.cPitch, pitch, k);
    v.cZ = lerp(v.cZ, zoff, k);
    v.cLift = lerp(v.cLift, lift, k);

    // tranco do tiro
    const f = v.flinch;
    if (f > 0.001) {
      neck -= f * (v.flinchHead ? 0.9 : 0.3);
      torso -= f * 0.35;
      twist += v.flinchSide * f * 0.4;
      v.flinch *= Math.exp(-dt * 7);
    }

    h.body.rotation.x = v.cPitch;
    h.body.position.set(0, v.cLift + riseDrop + Math.abs(s) * 0.025 * moving, v.cZ - 0.1 * f);
    h.hips.rotation.y = twist;
    h.torso.rotation.set(torso, -twist * 0.8, v.limp < 1 ? 0.08 : 0);
    h.neck.rotation.set(neck, 0, v.headTilt * 0.5 + Math.sin(t * 0.9) * 0.1);
    h.head.rotation.y = Math.sin(t * 0.7) * 0.3 - twist * 0.3;
    h.legL.upper.rotation.x = kickL * v.limp;
    h.legR.upper.rotation.x = kickR;
    h.legL.lower.rotation.x = kneeL;
    h.legR.lower.rotation.x = kneeR;
  }

  // ---------- Blindado ----------

  private animateBlindadoView(v: BlindadoView, dt: number) {
    const p = v.h.root.position;
    const moved = Math.hypot(p.x - v.lastX, p.z - v.lastZ);
    v.lastX = p.x;
    v.lastZ = p.z;
    v.speed = lerp(v.speed, Math.min(dt > 0 ? moved / dt : 0, 12), 1 - Math.exp(-dt * 8));
    v.animT += dt;
    v.h.root.rotation.y = v.yaw;
    const before = Math.sin(v.phase);
    v.phase += dt * v.speed * 1.4;
    const after = Math.sin(v.phase);
    if (v.speed > 0.6 && Math.sign(before) !== Math.sign(after)) {
      this.audio.bossStep(p, false);
      this.quake = Math.max(this.quake, 0.18 * Math.max(0, 1 - p.distanceTo(this.listener) / 18));
    }
    animateBlindado(v.rig, { phase: v.phase, speed: v.speed, t: this.t, anim: v.anim, animT: v.animT });
    for (const pl of v.rig.plates) if (!pl.gone && this.bossHp !== null && this.bossHp <= pl.at && !v.dying) this.shedPlate(v, pl);
    // fogo do lança-chamas e jatos da mochila soltam brasas
    if (v.rig.flame.visible || v.rig.pack.visible) {
      v.h.root.updateMatrixWorld(true);
      const src = v.rig.flame.visible ? v.rig.flame : v.rig.pack;
      src.getWorldPosition(this.tmp);
      this.fx.flame('blindado-' + v.id + (v.rig.flame.visible ? 'f' : 'p'), this.tmp, dt, 40, v.rig.flame.visible ? 0.5 : 0.35);
    }
    // corrente da garra: da mão até o jogador, indo e voltando
    const line = v.rig.line;
    line.visible = false;
    if (v.anim === 'chain' && v.chain) {
      const S = BOSS.chain;
      const out = clamp((v.animT - S.windup) / S.fly, 0, 1);
      const back = clamp((v.animT - S.windup - S.fly - 0.15) / (S.recover * 0.6), 0, 1);
      const k = out * (1 - back);
      if (k > 0.01) {
        v.h.root.updateMatrixWorld(true);
        const hand = v.h.armR.lower.localToWorld(new THREE.Vector3(0.12, -0.4, 0.03));
        const target = this.locate(v.chain.pid) ?? hand.clone().add(new THREE.Vector3(Math.sin(v.yaw) * 14, -1, Math.cos(v.yaw) * 14));
        const len = hand.distanceTo(target);
        line.visible = true;
        line.position.copy(hand);
        line.lookAt(target);
        v.rig.lineBody.scale.z = Math.max(0.01, len * k);
        v.rig.hook.position.z = len * k;
      }
    }
  }

  // ---------- queimando e congelado ----------

  // Camada de cor sobre o corpo do zumbi por `secs` segundos: laranja e brasas (queima) ou gelo azulado (congela).
  // Chamar de novo renova o tempo; kind null tira na hora.
  setStatus(zid: number, kind: 'queima' | 'congela' | null, secs = 2.5) {
    const cur = this.statuses.get(zid);
    if (kind === null) {
      if (cur) {
        cur.overlay.removeFromParent();
        this.statuses.delete(zid);
      }
      return;
    }
    const v = this.views.get(zid);
    if (!v) return;
    if (cur && cur.kind === kind) {
      cur.t = secs;
      return;
    }
    if (cur) cur.overlay.removeFromParent();
    const overlay = this.buildOverlay(v, kind);
    this.statuses.set(zid, { kind, t: secs, overlay });
  }

  private buildOverlay(v: View, kind: 'queima' | 'congela'): THREE.Group {
    const mat = kind === 'congela' ? ICE_MAT : BURN_MAT;
    const g = new THREE.Group();
    const big = v instanceof BossView || v instanceof BlindadoView ? 1.45 : v instanceof BispoView ? 1.1 : 1;
    const add = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(OVERLAY_BOX, mat);
      m.scale.set(w, h, d);
      m.position.set(x, y, z);
      m.renderOrder = 2;
      g.add(m);
      parent.add(m);
    };
    const h = v.h as Humanoid | DogRig;
    if ('torso' in h) {
      add(h.torso, 0.5 * big, 0.62, 0.34 * big, 0, 0.28, 0);
      add(h.head, 0.31, 0.33, 0.33, 0, 0.12, 0);
      for (const arm of [h.armL, h.armR]) add(arm.upper, 0.17 * big, 0.66, 0.17 * big, 0, -0.2, 0);
      for (const leg of [h.legL, h.legR]) add(leg.upper, 0.2 * big, 0.95, 0.21 * big, 0, -0.45, 0);
    } else {
      add(h.root, 0.8, 0.8, 1.5, 0, 0.45, 0);
    }
    return g;
  }

  private updateStatuses(dt: number) {
    for (const [id, st] of this.statuses) {
      st.t -= dt;
      const v = this.views.get(id);
      if (st.t <= 0 || !v) {
        st.overlay.removeFromParent();
        this.statuses.delete(id);
        continue;
      }
      const flick = 0.75 + Math.sin(this.t * 22 + id) * 0.25;
      if (st.kind === 'queima') {
        BURN_MAT.opacity = 0.5 * flick;
        const p = v.h.root.position;
        this.fx.flame('burn-' + id, this.tmp.set(p.x, p.y + 0.9, p.z), dt, 34, 0.32);
      } else {
        // aos poucos o gelo some no fim
        ICE_MAT.opacity = 0.45;
      }
    }
  }

  private animateDogView(v: DogView, dt: number) {
    const p = v.h.root.position;
    const moved = Math.hypot(p.x - v.lastX, p.z - v.lastZ);
    v.lastX = p.x;
    v.lastZ = p.z;
    v.speed = lerp(v.speed, Math.min(dt > 0 ? moved / dt : 0, 9), 1 - Math.exp(-dt * 10));
    v.phase += dt * (4 + v.speed * 1.5);
    v.h.root.rotation.y = v.yaw;
    if (v.anim === 'rise') v.riseT += dt;
    if (v.anim === 'attack') v.attackT += dt;
    animateDog(v.h, { phase: v.phase, speed: v.speed, t: this.t + v.look * 0.001, anim: v.anim, attackT: v.attackT, arriveT: v.riseT });
  }

  private animateDeath(v: View, dt: number) {
    if (v.deathT === 0) {
      const blob = v.h.root.getObjectByName('blob');
      if (blob) blob.visible = false;
    }
    if (v instanceof DogView) {
      // queima e some em instantes
      v.deathT += dt;
      v.h.body.scale.setScalar(Math.max(0.01, 1 - v.deathT / 0.3));
      return;
    }
    v.deathT += dt;
    const h = v.h;
    if (v.shrink) {
      // engolido: gira e some no centro do vórtice
      h.root.scale.setScalar(Math.max(0.01, 1 - v.deathT / 0.32));
      h.root.rotation.y += dt * 18;
      return;
    }
    if (v.fling) {
      // arremessado: voa girando e cai mais longe
      h.root.position.addScaledVector(v.fling, dt);
      v.fling.y -= 14 * dt;
      v.fling.x *= Math.exp(-dt * 0.8);
      v.fling.z *= Math.exp(-dt * 0.8);
      if (h.root.position.y <= v.flingY && v.fling.y < 0) {
        h.root.position.y = v.flingY;
        v.fling = null;
      }
    }
    if (v instanceof ZombieView && v.kind === 9 && !v.fling) {
      // já está deitado: tomba de lado, as pernas dão um último chute e a cabeça cai
      const k = clamp(v.deathT / 0.45, 0, 1);
      h.root.rotation.z = v.fallDir * 0.95 * k * k;
      h.body.position.y = lerp(h.body.position.y, 0.12, Math.min(1, dt * 9));
      h.legL.upper.rotation.x = lerp(h.legL.upper.rotation.x, 0.5 + Math.sin(v.deathT * 18) * 0.3 * (1 - k), Math.min(1, dt * 12));
      h.legR.upper.rotation.x = lerp(h.legR.upper.rotation.x, -0.2, Math.min(1, dt * 8));
      h.neck.rotation.x = lerp(h.neck.rotation.x, -0.2, Math.min(1, dt * 6));
      if (v.deathT > 6) h.root.position.y -= dt * 0.25;
      return;
    }
    const style = v instanceof ZombieView && !v.fling ? v.deathStyle : 0;
    h.root.rotation.order = 'YXZ';
    if (style === 1) {
      // cai de joelhos e depois de cara no chão
      const kneel = clamp(v.deathT / 0.35, 0, 1);
      const fall = clamp((v.deathT - 0.45) / 0.5, 0, 1);
      h.body.position.y = -0.42 * kneel * (1 - fall) + 0.13 * fall * fall;
      h.legL.lower.rotation.x = lerp(h.legL.lower.rotation.x, 1.6 * (1 - fall) + 0.3, Math.min(1, dt * 14));
      h.legR.lower.rotation.x = lerp(h.legR.lower.rotation.x, 1.5 * (1 - fall) + 0.2, Math.min(1, dt * 14));
      h.armL.upper.rotation.x = lerp(h.armL.upper.rotation.x, -0.2, Math.min(1, dt * 8));
      h.armR.upper.rotation.x = lerp(h.armR.upper.rotation.x, -0.3, Math.min(1, dt * 8));
      h.torso.rotation.x = lerp(h.torso.rotation.x, 0.3 * (1 - fall), Math.min(1, dt * 10));
      h.root.rotation.x = (Math.PI / 2) * fall * fall;
      if (v.deathT > 6) h.root.position.y -= dt * 0.25;
      return;
    }
    const k = clamp(v.deathT / 0.6, 0, 1);
    const e = k * k;
    if (style === 2) {
      // gira e cai de lado
      h.root.rotation.z = v.fallDir * (Math.PI / 2) * e;
      h.root.rotation.y += dt * 2.2 * (1 - k) * v.fallDir;
    } else h.root.rotation.x = v.fallDir * (Math.PI / 2) * e;
    h.body.position.y = 0.13 * e;
    h.legL.upper.rotation.x = lerp(h.legL.upper.rotation.x, 0.25, k);
    h.legR.upper.rotation.x = lerp(h.legR.upper.rotation.x, -0.15, k);
    h.legL.lower.rotation.x = lerp(h.legL.lower.rotation.x, 0.4, k);
    h.armL.upper.rotation.x = lerp(h.armL.upper.rotation.x, -2.6, k);
    h.armR.upper.rotation.x = lerp(h.armR.upper.rotation.x, -0.4, k);
    h.armL.upper.rotation.z = lerp(h.armL.upper.rotation.z, -0.8, k);
    h.torso.rotation.x = lerp(h.torso.rotation.x, 0, k);
    if (v.deathT > 6) h.root.position.y -= dt * 0.25;
  }

  dispose() {
    this.group.removeFromParent();
  }
}
