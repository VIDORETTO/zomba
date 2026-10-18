import * as THREE from 'three';
import { BOSS, DOGS, VULTO, ZOMBIE } from '../shared/constants';
import type { GameEvent, ZombieAnim, ZombieKind } from '../shared/protocol';
import { angleLerp, clamp, lerp, mulberry32 } from '../shared/rng';
import type { AudioEngine } from './audio';
import type { FX } from './fx';
import { animateBoss, buildBoss, type BossRig } from './boss';
import { animateDog, buildDog, type DogRig } from './dog';
import { buildHumanoid, flatMat, type Humanoid } from './humanoid';
import type { Sample } from './snapbuffer';
import type { TexSet } from './textures';

const SKIN = [0xa8b892, 0xb8ba9e, 0x98a688, 0xc2bba0, 0x8c9a80, 0xb4a894];
const SHIRT = [0x86705a, 0xb2aa98, 0x5e7088, 0x963e34, 0x6c7a5e, 0xa49070, 0x55555e, 0xbaa682, 0x5e7a5e];
const PANTS = [0x46506a, 0x5e5040, 0x726a58, 0x404040, 0x5a6274, 0x76664f];
const HAIR = [0x1a1410, 0x3a2a1a, 0x5a5048, 0x2a2420, 0x6a6058];

const KIND_SPEED = [ZOMBIE.walkSpeed, ZOMBIE.runSpeed, ZOMBIE.sprintSpeed, 0, 0, VULTO.speed];

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
  groanT: number;
  dying = false;
  deathT = 0;
  fallDir = 1;
  readonly limp: number;
  readonly armStyle: number;
  readonly headTilt: number;

  constructor(readonly id: number, readonly kind: ZombieKind, readonly look: number, tex: TexSet) {
    const r = mulberry32(look);
    this.rnd = r;
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
    const skin = flatMat(pick(SKIN), tex.grime);
    const shirt = flatMat(pick(SHIRT), tex.grime);
    // Vulto: criatura pequena e escura da névoa, de olhos claros
    const vulto = kind === 5;
    const shade = flatMat(0x24201e, tex.grime);
    this.h = buildHumanoid(vulto ? {
      skin: shade, shirt: shade, pants: shade, shoes: shade, hair: null,
      eyes: flatMat(0x000000, null, 0xb8e0ff, 4), jaw: flatMat(0x0e0c0c),
      scale: 0.58 + r() * 0.06, bulk: 0.8,
    } : {
      skin,
      shirt,
      sleeves: r() < 0.35 ? skin : shirt,
      pants: flatMat(pick(PANTS), tex.grime),
      shoes: flatMat(0x1e1a16),
      hair: r() < 0.7 ? flatMat(pick(HAIR)) : null,
      eyes: flatMat(0x000000, null, 0xffa030, 5),
      jaw: flatMat(0x4a2a24, tex.grime),
      scale: 0.94 + r() * 0.12,
      bulk: 0.9 + r() * 0.25,
    });
    for (const m of this.h.hitMeshes) m.userData.zid = id;
    this.limp = r() < 0.35 ? 0.4 + r() * 0.4 : 1;
    this.armStyle = r();
    this.headTilt = (r() - 0.5) * 0.6;
    this.groanT = 1 + r() * 5;
    this.fallDir = r() < 0.5 ? 1 : -1;
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
  stepSide = 0;
  chain: { pid: string } | null = null;

  constructor(readonly id: number, readonly look: number, tex: TexSet) {
    this.rig = buildBoss(tex);
    this.h = this.rig.h;
    for (const m of this.h.hitMeshes) m.userData.zid = id;
  }
}

type View = ZombieView | DogView | BossView;

function makeView(id: number, kind: ZombieKind, look: number, tex: TexSet): View {
  if (kind === 4) return new BossView(id, look, tex);
  return kind === 3 ? new DogView(id, look, tex) : new ZombieView(id, kind, look, tex);
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
      const boss = v instanceof BossView;
      const rising = v.anim === 'rise' && (boss ? v.animT < BOSS.riseTime * 0.6 : v.riseT < (dog ? DOGS.arriveTime * 0.8 : ZOMBIE.riseTime * 0.6));
      out.push({ id: v.id, x: p.x, y: p.y, z: p.z, rising, top: dog ? 0.6 : boss ? 2.3 : 1.25 });
    }
    return out;
  }

  view(id: number): View | undefined {
    return this.views.get(id);
  }

  onEvent(e: GameEvent) {
    switch (e.e) {
      case 'zattack': {
        const v = this.views.get(e.zid);
        if (v instanceof DogView) this.audio.dogBark(v.h.root.position);
        else if (v instanceof BossView) this.audio.bossRoar(v.h.root.position, 0.6);
        else if (v) this.audio.zombieAttack(v.h.root.position);
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
          v = makeView(e.zid, e.kind, e.look, this.tex);
          v.h.root.position.set(e.x, e.y, e.z);
          v.h.root.rotation.y = e.yaw;
          this.group.add(v.h.root);
        }
        this.views.delete(e.zid);
        if (v instanceof BossView) v.rig.line.visible = false;
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
        if (e.part === 'head') {
          v.h.head.visible = false;
          v.h.head.getWorldPosition(this.tmp);
          this.fx.blood(this.tmp, new THREE.Vector3(0, 1, 0), 2.2);
          v.fallDir = -1;
        }
        if (v instanceof BossView) this.audio.bossRoar(v.h.root.position, 1.2);
        else this.audio.zombieDeath(v.h.root.position);
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
          v = makeView(zb.id, zb.kind, zb.look, this.tex);
          v.h.root.position.set(zb.x, zb.y, zb.z);
          v.lastX = zb.x;
          v.lastZ = zb.z;
          v.yaw = zb.yaw;
          v.anim = zb.anim;
          this.views.set(zb.id, v);
          this.group.add(v.h.root);
          if (v instanceof BossView) this.group.add(v.rig.line);
        }
        const anim = k < 0.5 ? za.anim : zb.anim;
        if (anim === 'rise' && v.anim !== 'rise') v.riseT = 0;
        if (anim === 'attack' && v.anim !== 'attack') v.attackT = 0;
        if (anim === 'climb' && v.anim !== 'climb') v.climbT = 0;
        if (v instanceof BossView && anim !== v.anim) v.animT = 0;
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
          if (v instanceof BossView) this.group.remove(v.rig.line);
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
        v.groanT = dog ? 1.2 + Math.random() * 2.5 : (v.kind === 0 ? 3 : 2) + Math.random() * 5;
        if (v.h.root.position.distanceTo(listener) < 32) {
          if (dog) this.audio.dogGrowl(v.h.root.position);
          else if (v.kind === 5) this.audio.vultoHiss(v.h.root.position);
          else this.audio.zombieGroan(v.h.root.position, v.kind);
        }
      }
    }

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
      if (v.deathT > (v instanceof DogView ? 0.35 : 8)) {
        this.group.remove(v.h.root);
        this.corpses.splice(i, 1);
      }
    }
  }

  // capacete arrancado: some da cabeça e sai voando (e para de contar como alvo)
  private breakHelmet(v: BossView) {
    const helm = v.rig.helmet;
    if (!helm.visible) return;
    helm.updateWorldMatrix(true, true);
    const c = helm.clone();
    helm.matrixWorld.decompose(c.position, c.quaternion, c.scale);
    this.group.add(c);
    const dir = new THREE.Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw));
    this.flyers.push({ obj: c, vel: new THREE.Vector3(-dir.x * 2 + (Math.random() - 0.5), 4.5, -dir.z * 2 + (Math.random() - 0.5)), spin: 7, t: 0 });
    helm.visible = false;
    const gone = new Set<THREE.Object3D>(helm.children);
    for (let i = v.h.hitMeshes.length - 1; i >= 0; i--) if (gone.has(v.h.hitMeshes[i])) v.h.hitMeshes.splice(i, 1);
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

    const kind = v.kind === 5 ? 2 : v.kind;
    const norm = clamp(v.speed / KIND_SPEED[v.kind], 0, 1.3);
    v.phase += dt * v.speed * (kind === 0 ? 2.9 : 2.1);
    const ph = v.phase;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const t = this.t + v.look * 0.001;

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

    h.armL.upper.rotation.x = armL;
    h.armR.upper.rotation.x = armR;
    h.armL.upper.rotation.z = -0.12;
    h.armR.upper.rotation.z = 0.12;
    h.armL.lower.rotation.x = elbow;
    h.armR.lower.rotation.x = elbow;
    h.torso.rotation.x = lean;
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
    if (v instanceof DogView) {
      // queima e some em instantes
      v.deathT += dt;
      v.h.body.scale.setScalar(Math.max(0.01, 1 - v.deathT / 0.3));
      return;
    }
    v.deathT += dt;
    const h = v.h;
    const k = clamp(v.deathT / 0.6, 0, 1);
    const e = k * k;
    h.root.rotation.order = 'YXZ';
    h.root.rotation.x = v.fallDir * (Math.PI / 2) * e;
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
