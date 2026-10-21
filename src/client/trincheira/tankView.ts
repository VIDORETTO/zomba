import * as THREE from 'three';
import { TRINCHEIRA } from '../../shared/constants';
import type { GameEvent, TrincheiraSnap } from '../../shared/protocol';
import type { Sample } from '../snapbuffer';
import { angLerp, basic, boxMesh, cylMesh, glowSprite, lerp, solid } from './common';
import { pairOf, type TrCtx } from './ctx';

const HL = TRINCHEIRA.tankHalfLen;
const HW = TRINCHEIRA.tankHalfWidth;
const DECK = TRINCHEIRA.tankDeck;

function trackTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#26221d';
  ctx.fillRect(0, 0, 32, 64);
  ctx.fillStyle = '#4a4238';
  for (let y = 0; y < 64; y += 16) ctx.fillRect(0, y, 32, 9);
  ctx.fillStyle = '#17140f';
  ctx.fillRect(0, 0, 3, 64);
  ctx.fillRect(29, 0, 3, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 4);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Tanque: casco de losango de 1917 cor de lama, esteiras que rolam, torre com canhão, escape e lança-chamas na traseira.
// Frente para +z local; o convés (onde se anda) fica a 1,15 m. Também desenha a alavanca de chamar.
export class TankView {
  readonly group = new THREE.Group();
  pose: { x: number; z: number; yaw: number } | null = null;
  speed = 0;
  private readonly turret = new THREE.Group();
  private readonly trackMat: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
  private readonly trackTex = trackTexture();
  private readonly flame = new THREE.Group();
  private readonly lever = new THREE.Group();
  private readonly leverLamp: THREE.Sprite;
  private readonly leverHandle: THREE.Mesh;
  private last: { x: number; z: number } | null = null;
  private wasState = '';
  private flameOn = 0;

  constructor(private readonly c: TrCtx) {
    const simple = c.q.simpleMaterials;
    const mud = solid(c.tex, 'rivet', 0x6a6248, simple, 0.8, 0.2);
    const dark = solid(c.tex, 'rivet', 0x3c382e, simple, 0.7, 0.3);
    const rust = solid(c.tex, 'rivet', 0x7a5a3c, simple, 0.9, 0.1);
    this.trackMat = (simple ? new THREE.MeshLambertMaterial({ map: this.trackTex }) : new THREE.MeshStandardMaterial({ map: this.trackTex, roughness: 0.95 }));
    const g = this.group;
    // casco e convés
    g.add(boxMesh(HW * 2 - 1.1, DECK - 0.35, HL * 2 - 0.4, mud, 0, 0.35 + (DECK - 0.35) / 2, 0));
    g.add(boxMesh(HW * 2, 0.1, HL * 2, mud, 0, DECK - 0.05, 0));
    // esteiras nas laterais (losango: pontas inclinadas)
    for (const s of [-1, 1]) {
      g.add(boxMesh(0.62, 0.95, HL * 2 - 1.4, this.trackMat, s * (HW - 0.31), 0.5, 0));
      for (const e of [-1, 1]) {
        const m = boxMesh(0.62, 0.95, 1.5, this.trackMat, s * (HW - 0.31), 0.6, e * (HL - 0.75));
        m.rotation.x = e * 0.55;
        m.position.y = 0.5 + 0.18;
        g.add(m);
      }
      // proteção de lama sobre a esteira
      g.add(boxMesh(0.8, 0.08, HL * 2 - 0.8, dark, s * (HW - 0.4), 1.02, 0));
    }
    // proa e popa inclinadas
    for (const e of [-1, 1]) {
      const m = boxMesh(HW * 2 - 1.3, 0.12, 1.5, mud, 0, 0.9, e * (HL - 0.4));
      m.rotation.x = e * -0.5;
      g.add(m);
    }
    // torre no centro (a simulação tem uma caixa de 1,6 x 1,6 até 3 m)
    const t = this.turret;
    t.position.set(0, DECK, 0);
    t.add(boxMesh(1.7, 0.9, 1.7, dark, 0, 0.45, 0));
    t.add(boxMesh(1.4, 0.5, 1.4, mud, 0, 1.15, 0));
    t.add(cylMesh(0.14, 0.17, 2.8, dark, 10, 0, 0.95, 1.9)).rotation.x = Math.PI / 2;
    t.add(boxMesh(0.5, 0.25, 0.5, rust, 0.3, 1.5, -0.3));
    g.add(t);
    // escape com fumaça na traseira
    g.add(cylMesh(0.12, 0.12, 0.9, dark, 8, 0.9, DECK + 0.45, -HL + 0.6));
    // lança-chamas na traseira
    this.flame.position.set(0, DECK + 0.4, -HL - 0.1);
    this.flame.add(boxMesh(0.3, 0.3, 0.7, dark, 0, 0, 0));
    this.flame.add(cylMesh(0.07, 0.1, 0.5, dark, 8, 0, 0, -0.5)).rotation.x = Math.PI / 2;
    g.add(this.flame);
    // faróis
    for (const s of [-1, 1]) g.add(boxMesh(0.25, 0.18, 0.05, basic(new THREE.Color(2.2, 2, 1.5)), s * 1.1, DECK - 0.3, HL + 0.15));
    g.visible = false;
    c.scene.add(g);

    // alavanca de chamar
    const L = c.T.tank;
    this.lever.position.set(L.lever[0], 0, L.lever[1]);
    this.lever.rotation.y = Math.atan2(L.leverNormal[0], L.leverNormal[1]);
    this.lever.add(boxMesh(0.5, 1.1, 0.3, dark, 0, 0.55, 0));
    this.lever.add(boxMesh(0.7, 0.1, 0.5, rust, 0, 0.05, 0));
    this.leverHandle = boxMesh(0.07, 0.6, 0.07, rust, 0, 1.2, 0.15);
    this.lever.add(this.leverHandle);
    this.leverLamp = glowSprite(0x4aff6a, 0.9, 0.9);
    this.leverLamp.position.set(0, 1.35, 0.2);
    this.lever.add(this.leverLamp);
    c.scene.add(this.lever);
  }

  update(sample: Sample | null, tr: TrincheiraSnap, dt: number, t: number) {
    const { a, b, k } = pairOf(sample, tr);
    const x = lerp(a.tank.x, b.tank.x, k);
    const z = lerp(a.tank.z, b.tank.z, k);
    const yaw = angLerp(a.tank.yaw, b.tank.yaw, k);
    this.pose = { x, z, yaw };
    this.group.visible = true;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = yaw;
    if (this.last && dt > 0) this.speed = lerp(this.speed, Math.hypot(x - this.last.x, z - this.last.z) / dt, 1 - Math.exp(-dt * 5));
    this.last = { x, z };
    // esteiras rolando (textura anda com a velocidade)
    this.trackTex.offset.y -= (this.speed * dt) / 1.6;
    this.turret.rotation.y = Math.sin(t * 0.25) * 0.5;
    const state = tr.tank.state;
    const moving = this.speed > 0.4;
    const s = Math.sin(yaw), cn = Math.cos(yaw);
    // escape: fumaça sempre (mais forte andando)
    const ex2 = x + 0.9 * cn + (-HL + 0.6) * s;
    const ez2 = z - 0.9 * s + (-HL + 0.6) * cn;
    this.c.fx.smoke('tank-exh', ex2, DECK + 1, ez2, dt, moving ? 8 : 3, moving ? 1.1 : 0.7, 0x4a4640, 2.2);
    // lança-chamas: só andando na volta
    const wantFlame = state === 'volta' && moving;
    this.flameOn += ((wantFlame ? 1 : 0) - this.flameOn) * Math.min(1, dt * 6);
    if (this.flameOn > 0.3) {
      const bx = x + (-HL - 0.4) * s;
      const bz = z + (-HL - 0.4) * cn;
      this.c.fx.stream('tank-flame', dt, 70, () => {
        const sp = 7 + Math.random() * 3;
        return {
          x: bx, y: DECK + 0.4, z: bz,
          vx: -s * sp + (Math.random() - 0.5) * 1.6, vy: 0.2 + Math.random() * 0.8, vz: -cn * sp + (Math.random() - 0.5) * 1.6,
          life: 0.45, size: 0.8, color: Math.random() < 0.5 ? 0xff7a20 : 0xffc040, alpha: 0.85, grow: 0.8, drag: 1.5,
        };
      });
    }
    if (state !== this.wasState) {
      if (this.wasState && state === 'volta') this.c.snd.play('tanque-motor', new THREE.Vector3(x, 1, z));
      this.wasState = state;
    }
    // alavanca: verde quando dá para chamar
    const ready = state === 'parado';
    (this.leverLamp.material as THREE.SpriteMaterial).color.set(ready ? 0x4aff6a : 0xff3a2a);
    (this.leverLamp.material as THREE.SpriteMaterial).opacity = 0.5 + 0.4 * Math.sin(t * (ready ? 2 : 6));
    this.leverHandle.rotation.x = ready ? -0.5 : 0.5;
  }

  onEvent(e: GameEvent) {
    if (e.e === 'tank' && this.pose) {
      const p = new THREE.Vector3(this.pose.x, 1.5, this.pose.z);
      if (e.phase === 'chamado') {
        this.c.snd.play('tanque-chamado', p);
        this.c.notify('O <b>Tanque</b> foi chamado: volta pela Igreja e pela Escavação.');
      } else if (e.phase === 'chegou') {
        this.c.snd.play('tanque-motor', p, 0.6);
        const name = e.stop === 'igreja' ? 'a Igreja' : e.stop === 'norte' ? 'a plataforma da Escavação' : 'a Estação';
        this.c.notify(`O <b>Tanque</b> chegou em ${name}.`);
      } else if (e.phase === 'sai') {
        this.c.snd.play('tanque-motor', p);
      } else if (e.phase === 'pronto') {
        this.c.notify('O <b>Tanque</b> está pronto para ser chamado de novo.');
      }
    } else if (e.e === 'esmaga' && this.pose) {
      this.c.fx.burst(this.pose.x, 0.6, this.pose.z, 6, 2, 0x7a1010, 0.5, 0.3, { dull: true });
    }
  }
}
