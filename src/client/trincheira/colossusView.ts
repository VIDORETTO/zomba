import * as THREE from 'three';
import { TRINCHEIRA } from '../../shared/constants';
import type { GameEvent, TrRobot, TrincheiraSnap } from '../../shared/protocol';
import { COLOSSI } from '../../shared/trincheira-info';
import { colossusFeet, colossusPose, robotAxis, BODY_HEIGHT, FAR_STRIDE, type FootRect } from '../../shared/colossus';
import { boxMesh, cylMesh, glowSprite, smooth } from './common';
import type { TrCtx } from './ctx';

type Id = 'atlas' | 'golias' | 'tita';

const BODY_COLOR: Record<Id, number> = { atlas: 0x7e5c44, golias: 0x59646f, tita: 0x6e3a32 };
const STEP = TRINCHEIRA.stepLift + TRINCHEIRA.stepMove + TRINCHEIRA.stepDown + TRINCHEIRA.stepHold;
// frações do passo: sobe, move, desce, fica
const F_LIFT = TRINCHEIRA.stepLift / STEP;
const F_MOVE = F_LIFT + TRINCHEIRA.stepMove / STEP;
const F_DOWN = F_MOVE + TRINCHEIRA.stepDown / STEP;

interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  eye: THREE.Mesh;
  eyeGlow: THREE.Sprite;
  armPivot: THREE.Group[];
  forearm: THREE.Group[];
  legs: { thigh: THREE.Mesh; shin: THREE.Mesh; knee: THREE.Mesh; foot: THREE.Mesh; sole: THREE.Sprite }[];
  chimneys: THREE.Object3D[];
  shadow: THREE.Mesh;
}

const KINDS: Id[] = ['atlas', 'golias', 'tita'];
// escala do modelo: o olho fica a BODY_HEIGHT do chão, a 4 m à frente do centro (igual à simulação)
const S = 0.75;
const EYE_LOCAL_Y = 15.8 * S;

// Colossos: robôs gigantes de aço rebitado que atravessam o mapa pisando nas pegadas. A pose (corpo, pé no ar, pé plantado, olho)
// vem de `colossusPose`, a mesma função da simulação; as pernas são esticadas para o pé sempre alcançar a pegada.
export class ColossusView {
  private readonly rigs = new Map<Id, Rig>();
  private active: Id | null = null;
  private exit: { id: Id; t: number; dir: 1 | -1; n: number } | null = null;
  private lastRobot: TrRobot | null = null;
  private hipY = BODY_HEIGHT - EYE_LOCAL_Y;
  private smokeT = 0;
  private readonly feetCache = new Map<string, FootRect[]>();
  private readonly v3 = new THREE.Vector3();
  private readonly v4 = new THREE.Vector3();
  private readonly v5 = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly q = new THREE.Quaternion();

  constructor(private readonly c: TrCtx) {
    for (const id of KINDS) if (c.T.feet.some((f) => f.robot === id)) this.rigs.set(id, this.build(id));
  }

  private feet(id: Id, dir: 1 | -1, extra = 0): FootRect[] {
    const key = `${id}${dir}${extra}`;
    let f = this.feetCache.get(key);
    if (!f) {
      f = colossusFeet(this.c.T, id, dir);
      // pegadas virtuais depois da última: o colosso segue andando para fora do mapa
      const axis = robotAxis(id);
      const last = f[f.length - 1];
      for (let i = 1; i <= extra; i++) {
        const cx = last.cx + (axis === 'x' ? dir * FAR_STRIDE * i : 0);
        const cz = last.cz + (axis === 'z' ? dir * FAR_STRIDE * i : 0);
        f.push({ id: `fora${i}`, r: [cx - 4, cz - 8, cx + 4, cz + 8], cx, cz });
      }
      this.feetCache.set(key, f);
    }
    return f;
  }

  private mat(color: number, repeat = 3): THREE.Material {
    const map = this.c.tex.rivet ? this.c.tex.rivet.clone() : null;
    if (map) {
      map.repeat.set(repeat, repeat);
      map.needsUpdate = true;
    }
    const p = { color, map, fog: false };
    return this.c.q.simpleMaterials ? new THREE.MeshLambertMaterial(p) : new THREE.MeshStandardMaterial({ ...p, roughness: 0.85, metalness: 0.35 });
  }

  private build(id: Id): Rig {
    const root = new THREE.Group();
    const body = new THREE.Group();
    const col = BODY_COLOR[id];
    const steel = this.mat(col);
    const dark = this.mat(0x2e2a26, 2);
    const trim = this.mat(col * 0.8, 2);
    const s = S;
    const add = (parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
      const b = boxMesh(w * s, h * s, d * s, m, x * s, y * s, z * s);
      b.frustumCulled = false;
      parent.add(b);
      return b;
    };
    add(body, 8, 3.2, 5.5, dark, 0, 0, 0);
    add(body, 9.5, 11, 6.5, steel, 0, 7.4, 0);
    add(body, 10.4, 4, 7.2, trim, 0, 11.4, 0);
    add(body, 6, 2, 3, dark, 0, 4, 3.4);
    add(body, 5, 6, 3, trim, 0, 8, -4.2);
    // cabeça com visor e olho (o olho fica 4 m à frente do centro, como na simulação)
    const headZ = 4 / s - 2.2;
    add(body, 4.4, 4.2, 4.4, steel, 0, 15.6, headZ);
    add(body, 4.8, 0.7, 4.8, dark, 0, 17.9, headZ);
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLOSSI[id].eyeHex).multiplyScalar(2.2), fog: false });
    const eye = boxMesh(2.6 * s, 0.9 * s, 0.4 * s, eyeMat, 0, EYE_LOCAL_Y, 4.05);
    body.add(eye);
    const eyeGlow = glowSprite(COLOSSI[id].eyeHex, 9 * s, 0.9);
    (eyeGlow.material as THREE.SpriteMaterial).fog = false;
    eyeGlow.position.set(0, EYE_LOCAL_Y, 4.6);
    body.add(eyeGlow);
    // chaminés
    const chimneys: THREE.Object3D[] = [];
    for (const sx of [-1, 1]) {
      const ch = cylMesh(0.9 * s, 1.1 * s, 7 * s, dark, 8, sx * 3.3 * s, 15.5 * s, -2.6 * s);
      ch.frustumCulled = false;
      body.add(ch);
      const top = new THREE.Object3D();
      top.position.set(sx * 3.3 * s, 19.2 * s, -2.6 * s);
      body.add(top);
      chimneys.push(top);
    }
    // braços (ombro, braço, antebraço, punho)
    const armPivot: THREE.Group[] = [];
    const forearm: THREE.Group[] = [];
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(sx * 6.6 * s, 11.2 * s, 0);
      body.add(sh);
      add(sh, 3.8, 3.8, 3.8, trim, 0, 0, 0);
      add(sh, 2.8, 8, 2.8, steel, 0, -4.2, 0);
      const fa = new THREE.Group();
      fa.position.set(0, -8.4 * s, 0);
      sh.add(fa);
      add(fa, 2.4, 8, 2.4, steel, 0, -3.8, 0);
      add(fa, 3.6, 3.4, 3.6, dark, 0, -8.6, 0.3);
      armPivot.push(sh);
      forearm.push(fa);
    }
    // pernas (peças esticadas pelo cálculo de cada quadro)
    const legs: Rig['legs'] = [];
    for (let i = 0; i < 2; i++) {
      const thigh = boxMesh(1, 1, 1, steel, 0, 0, 0);
      const shin = boxMesh(1, 1, 1, steel, 0, 0, 0);
      const knee = boxMesh(3 * S * 1.4, 3 * S * 1.4, 3 * S * 1.4, dark, 0, 0, 0);
      const foot = boxMesh(6.4, 2.2, 13, dark, 0, 0, 0);
      const sole = glowSprite(COLOSSI[id].eyeHex, 8, 0);
      (sole.material as THREE.SpriteMaterial).fog = false;
      for (const m of [thigh, shin, knee, foot]) m.frustumCulled = false;
      root.add(thigh, shin, knee, foot, sole);
      legs.push({ thigh, shin, knee, foot, sole });
    }
    root.add(body);
    // sombra da próxima pegada
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    shadow.renderOrder = 2;
    shadow.visible = false;
    this.c.scene.add(shadow);
    root.visible = false;
    root.frustumCulled = false;
    this.c.scene.add(root);
    return { root, body, eye, eyeGlow, armPivot, forearm, legs, chimneys, shadow };
  }

  update(tr: TrincheiraSnap, dt: number, t: number) {
    const robot = tr.robot;
    let id: Id | null = null;
    let dir: 1 | -1 = 1;
    let step = 0;
    let sub: TrRobot['sub'] = 'sobe';
    let st = 0;
    let extra = 0;
    if (robot) {
      id = robot.id;
      dir = robot.dir;
      this.exit = null;
      this.lastRobot = robot;
      if (robot.phase === 'passos') {
        step = robot.step;
        sub = robot.sub;
        st = robot.t;
      }
    } else if (this.lastRobot) {
      // acabou a passagem: continua andando para fora do mapa por mais dois passos
      if (this.lastRobot.phase === 'passos') this.exit = { id: this.lastRobot.id, t: 0, dir: this.lastRobot.dir, n: this.feet(this.lastRobot.id, this.lastRobot.dir).length };
      this.lastRobot = null;
    }
    if (this.exit) {
      this.exit.t += dt;
      id = this.exit.id;
      dir = this.exit.dir;
      const k = this.exit.t / STEP;
      step = this.exit.n + Math.floor(k);
      const u = k - Math.floor(k);
      sub = u < F_LIFT ? 'sobe' : u < F_MOVE ? 'move' : u < F_DOWN ? 'desce' : 'fica';
      st = sub === 'sobe' ? u / F_LIFT : sub === 'move' ? (u - F_LIFT) / (F_MOVE - F_LIFT) : sub === 'desce' ? (u - F_MOVE) / (F_DOWN - F_MOVE) : (u - F_DOWN) / (1 - F_DOWN);
      extra = 3;
      if (this.exit.t > STEP * 2.2) this.exit = null;
    }
    if (id !== this.active) {
      if (this.active) {
        const o = this.rigs.get(this.active);
        if (o) {
          o.root.visible = false;
          o.shadow.visible = false;
        }
      }
      this.active = id;
    }
    if (!id) return;
    const r = this.rigs.get(id);
    if (!r) return;
    r.root.visible = true;
    this.pose(r, id, dir, step, sub, st, extra, dt, t, tr);
  }

  private pose(r: Rig, id: Id, dir: 1 | -1, step: number, sub: TrRobot['sub'], st: number, extra: number, dt: number, t: number, tr: TrincheiraSnap) {
    const feet = this.feet(id, dir, extra);
    const n = this.feet(id, dir, 0).length;
    const p = colossusPose(feet, id, dir, step, sub, st);
    const yaw = p.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const hipY = BODY_HEIGHT - EYE_LOCAL_Y;
    this.hipY += (hipY - this.hipY) * Math.min(1, dt * 8);
    r.body.position.set(p.x, this.hipY, p.z);
    r.body.rotation.y = yaw;
    const moving = p.foot === 'L' ? 0 : 1;
    // braços balançam ao contrário das pernas
    const q = sub === 'sobe' ? 0 : sub === 'move' ? smooth(st) : 1;
    const sw = (moving ? 1 : -1) * (0.6 - 1.2 * q);
    r.armPivot[0].rotation.x = sw;
    r.armPivot[1].rotation.x = -sw;
    r.forearm[0].rotation.x = -0.4 - Math.max(0, sw) * 0.3;
    r.forearm[1].rotation.x = -0.4 - Math.max(0, -sw) * 0.3;
    // distância máxima quadril-pé: as pernas esticam o necessário
    const lateral = 2.2;
    const fwd = this.v4.set(fx, 0, fz);
    const hips: THREE.Vector3[] = [];
    const feetPos: THREE.Vector3[] = [];
    for (let side = 0; side < 2; side++) {
      const lat = (side === 0 ? -1 : 1) * lateral;
      hips.push(new THREE.Vector3(p.x + rx * lat, this.hipY, p.z + rz * lat));
      feetPos.push(side === moving ? new THREE.Vector3(p.fx, p.fy + 1.1, p.fz) : new THREE.Vector3(p.px, 1.1, p.pz));
    }
    let dmax = 0;
    for (let i = 0; i < 2; i++) dmax = Math.max(dmax, hips[i].distanceTo(feetPos[i]));
    const L = Math.max(15, dmax / 1.9);
    for (let side = 0; side < 2; side++) {
      const leg = r.legs[side];
      this.limb(hips[side], feetPos[side], L, fwd, leg, 1);
      leg.foot.position.copy(feetPos[side]);
      leg.foot.rotation.y = yaw;
      const lifted = side === moving && p.fy > 0.5 && step >= 0 && step < n;
      (leg.sole.material as THREE.SpriteMaterial).opacity = lifted ? 0.6 + 0.4 * Math.sin(t * 8) : 0;
      leg.sole.position.set(feetPos[side].x, Math.max(0.3, feetPos[side].y - 1.3), feetPos[side].z);
    }
    // sombra da pegada onde o pé vai pisar
    const real = step >= 0 && step < n;
    r.shadow.visible = real && sub !== 'fica';
    if (real) {
      const ft = feet[step];
      r.shadow.position.set(ft.cx, 0.07, ft.cz);
      r.shadow.scale.set(ft.r[2] - ft.r[0], 1, ft.r[3] - ft.r[1]);
      const a = sub === 'sobe' ? 0.12 * st : sub === 'move' ? 0.12 + 0.55 * smooth(st) : 0.67;
      (r.shadow.material as THREE.MeshBasicMaterial).opacity = a;
    }
    // olho: no passo 4 da missão ele fica vulnerável (pisca forte)
    const vul = tr.missao.step === 3;
    const em = r.eye.material as THREE.MeshBasicMaterial;
    em.color.set(COLOSSI[id].eyeHex).multiplyScalar(vul ? 3 + Math.sin(t * 8) * 1.2 : 2.2);
    (r.eyeGlow.material as THREE.SpriteMaterial).opacity = vul ? 1 : 0.8;
    // fumaça das chaminés
    this.smokeT -= dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.5;
      for (const ch of r.chimneys) {
        ch.getWorldPosition(this.v3);
        this.c.fx.emit({ x: this.v3.x, y: this.v3.y, z: this.v3.z, vx: 1.5, vy: 5, vz: 0, life: 6, size: 8, color: 0x3a3733, alpha: 0.35, grow: 0.5, dull: true });
      }
    }
  }

  // perna de dois ossos (coxa e canela) do quadril ao pé, com o joelho dobrando para a frente
  private limb(hip: THREE.Vector3, foot: THREE.Vector3, L: number, fwd: THREE.Vector3, leg: Rig['legs'][number], s: number) {
    const v = this.v3.copy(foot).sub(hip);
    const len = Math.max(0.01, v.length());
    const D = Math.min(len, 2 * L * 0.995);
    v.divideScalar(len);
    const a = D / 2;
    const h = Math.sqrt(Math.max(0, L * L - a * a));
    const p = fwd.clone().addScaledVector(v, -fwd.dot(v));
    if (p.lengthSq() < 1e-4) p.set(1, 0, 0);
    p.normalize();
    const knee = hip.clone().addScaledVector(v, a).addScaledVector(p, h);
    leg.knee.position.copy(knee);
    this.bone(leg.thigh, hip, knee, 3.4 * s);
    const end = hip.clone().addScaledVector(v, D);
    this.bone(leg.shin, knee, end, 3 * s);
  }

  private bone(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, w: number) {
    const d = this.v5.copy(b).sub(a);
    const len = d.length();
    m.position.copy(a).addScaledVector(d, 0.5);
    m.scale.set(w, len, w);
    this.q.setFromUnitVectors(this.up, d.divideScalar(len || 1));
    m.quaternion.copy(this.q);
  }

  onEvent(e: GameEvent) {
    if (e.e === 'buzina') {
      const feet = this.feet(e.robot, e.dir);
      if (!feet.length) return;
      const axis = robotAxis(e.robot);
      const f0 = feet[0];
      const sx = f0.cx - (axis === 'x' ? e.dir * FAR_STRIDE : 0), sz = f0.cz - (axis === 'z' ? e.dir * FAR_STRIDE : 0);
      this.c.snd.play('buzina-colosso', new THREE.Vector3(sx, 12, sz), 1);
      this.c.notify(`<b>${COLOSSI[e.robot].name}</b> vem aí! Saia das pegadas.`);
    } else if (e.e === 'pisada') {
      const p = new THREE.Vector3(e.x, 0.5, e.z);
      this.c.snd.play('pisada-colosso', p, 1);
      this.c.fx.dust(e.x, 0.2, e.z, 40, 9, 0x7a6a56, 2.4);
      this.c.fx.ring(e.x, 0, e.z, 2, 22, 0xcaa070, 1.1, 0.6);
      this.c.fx.burst(e.x, 1, e.z, 20, 7, 0x5a4a3a, 1.2, 0.8, { dull: true, grav: 6, up: 5 });
      const me = this.c.me();
      const d = me ? Math.hypot(me.x - e.x, me.z - e.z) : 999;
      if (d < 90) this.c.quake(Math.min(1.5, 1.7 * (1 - d / 90)));
      const mine = me && e.killed.includes(me.id);
      if (mine) this.c.notify(`Esmagado por <b>${COLOSSI[e.robot].name}</b>.`);
    }
  }
}
