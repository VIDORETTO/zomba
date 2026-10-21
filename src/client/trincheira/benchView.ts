import * as THREE from 'three';
import type { GameEvent, TrincheiraSnap } from '../../shared/protocol';
import { SET_PARTS } from '../../shared/trincheira-info';
import { basic, boxMesh, cylMesh, flatRing, glowSprite, glowy, lerp } from './common';
import type { TrCtx } from './ctx';
import { pairOf } from './ctx';
import type { Sample } from '../snapbuffer';

export function shieldMesh(c: { tex: Record<string, THREE.Texture>; simple: boolean }): THREE.Group {
  const g = new THREE.Group();
  const steel = glowy(c.tex, 0xa8a8a0, c.simple);
  g.add(boxMesh(0.62, 0.86, 0.06, steel));
  g.add(boxMesh(0.4, 0.07, 0.07, basic(0x0a0a0a), 0, 0.2, 0.035));
  g.add(boxMesh(0.66, 0.05, 0.08, glowy(c.tex, 0x6a665e, c.simple), 0, -0.4, 0));
  return g;
}

export function droneMesh(c: { tex: Record<string, THREE.Texture>; simple: boolean }): { group: THREE.Group; rotors: THREE.Object3D[]; eye: THREE.Mesh } {
  const group = new THREE.Group();
  const brass = glowy(c.tex, 0xe0b858, c.simple);
  const dark = glowy(c.tex, 0x8a8478, c.simple);
  group.add(boxMesh(0.5, 0.24, 0.5, brass));
  group.add(boxMesh(0.36, 0.1, 0.36, dark, 0, 0.17, 0));
  const eye = boxMesh(0.14, 0.14, 0.05, basic(new THREE.Color(0.4, 2.4, 0.7)), 0, 0, 0.27);
  group.add(eye);
  const rotors: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32]]) {
    const r = new THREE.Group();
    r.position.set(x, 0.2, z);
    r.add(boxMesh(0.4, 0.015, 0.06, dark));
    r.add(boxMesh(0.06, 0.015, 0.4, dark));
    group.add(r, cylMesh(0.02, 0.02, 0.2, dark, 5, x, 0.1, z));
    rotors.push(r);
  }
  return { group, rotors, eye };
}

// Bancadas: o Escudo e o Drone montados repousam na bancada; um anel pulsa quando a equipe já tem as 3 peças de um conjunto.
export class BenchView {
  private readonly benches: { group: THREE.Group; ring: THREE.Mesh; glow: THREE.Sprite; shield: THREE.Group; drone: ReturnType<typeof droneMesh> }[] = [];
  private craftT = 0;
  private craftAt = -1;

  constructor(private readonly c: TrCtx) {
    const info = { tex: c.tex, simple: c.q.simpleMaterials };
    for (const [x, z] of c.T.benches) {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      const ring = flatRing(0x7aff9a, 2.2, 0);
      const glow = glowSprite(0x7aff9a, 2.2, 0);
      glow.position.y = 1.3;
      const shield = shieldMesh(info);
      shield.position.set(-0.45, 1.5, 0);
      shield.scale.setScalar(1.6);
      shield.rotation.y = 0.5;
      shield.visible = false;
      const drone = droneMesh(info);
      drone.group.position.set(0.5, 1.3, 0);
      drone.group.scale.setScalar(1.5);
      drone.group.visible = false;
      group.add(ring, glow, shield, drone.group);
      c.scene.add(group);
      this.benches.push({ group, ring, glow, shield, drone });
    }
  }

  update(tr: TrincheiraSnap, dt: number, t: number) {
    const has = (set: 'escudo' | 'drone') => SET_PARTS[set].every((k) => tr.team.includes(k));
    this.benches.forEach((b, i) => {
      const ready = (has('escudo') && !tr.build.escudo.built) || (has('drone') && !tr.build.drone.built);
      const k = ready ? 0.5 + 0.35 * Math.sin(t * 3) : 0;
      (b.ring.material as THREE.MeshBasicMaterial).opacity = k;
      (b.glow.material as THREE.SpriteMaterial).opacity = k * 0.8;
      b.shield.visible = tr.build.escudo.built && tr.build.escudo.bench === i;
      b.shield.rotation.y = 0.5 + Math.sin(t * 0.8) * 0.25;
      const dr = tr.build.drone;
      const here = dr.built && dr.bench === i && dr.state !== 'voo';
      b.drone.group.visible = here;
      if (here) {
        b.drone.group.position.y = 1.35 + Math.sin(t * 2 + i) * 0.04;
        b.drone.group.rotation.y = t * 0.6;
        for (const r of b.drone.rotors) r.rotation.y += dt * (dr.state === 'banco' ? 2 : 0.4);
        (b.drone.eye.material as THREE.MeshBasicMaterial).color.setRGB(0.4, dr.state === 'banco' ? 2.4 : 0.5, 0.7);
      }
    });
    // montagem em andamento: faíscas na bancada
    if (this.craftT > 0 && this.craftAt >= 0) {
      this.craftT -= dt;
      const p = this.c.T.benches[this.craftAt];
      if (p) this.c.fx.stream('craft', dt, 30, () => ({ x: p[0] + (Math.random() - 0.5) * 0.8, y: 1.1, z: p[1] + (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 3, life: 0.5, size: 0.14, color: 0xffd890, grav: 6 }));
    }
  }

  onEvent(e: GameEvent, local: string, who: (pid: string) => string) {
    if (e.e !== 'craft') return;
    const what = e.what === 'escudo' ? 'Escudo de Trincheira' : e.what === 'drone' ? 'Drone de Campo' : 'Cajado';
    if (e.what === 'cajado') return;
    const tr = this.c.me();
    void tr;
    if (e.phase === 'start') {
      this.craftT = 2;
      this.craftAt = this.nearest();
      this.c.snd.play('bancada');
    } else if (e.phase === 'done') {
      const i = this.nearest();
      const p = this.c.T.benches[i];
      if (p) {
        this.c.fx.burst(p[0], 1.3, p[1], 40, 4, 0xfff0c0, 0.9, 0.3, { up: 2 });
        this.c.fx.ring(p[0], 0, p[1], 1, 4, 0xffd890, 0.8);
      }
      this.c.snd.play('monta');
      this.c.notify(`${who(e.pid)} montou: <b>${what}</b>.`);
    } else if (e.phase === 'take') {
      if (e.what === 'escudo') this.c.snd.play('escudo-pega');
      else this.c.snd.play('drone-liga');
      if (e.pid === local) this.c.notify(e.what === 'escudo' ? '<b>Escudo de Trincheira</b> nas costas: bloqueia o que vem por trás.' : '<b>Drone de Campo</b> no ar por 60 s.');
      else this.c.notify(`${who(e.pid)} pegou: <b>${what}</b>.`);
    } else if (e.phase === 'expire') {
      this.c.snd.play('gerador-perde', undefined, 0.5);
      this.c.notify(e.what === 'escudo' ? 'O <b>Escudo</b> quebrou.' : 'O <b>Drone</b> voltou para a bancada.');
    } else if (e.phase === 'drone-revive') {
      this.c.notify('O <b>Drone</b> está reanimando o dono!');
    }
  }

  // bancada mais perto do jogador local
  private nearest(): number {
    const me = this.c.me();
    if (!me) return 0;
    let best = 0, bd = Infinity;
    this.c.T.benches.forEach((p, i) => {
      const d = Math.hypot(p[0] - me.x, p[1] - me.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }
}

// Drone no ar: segue o dono a 2,5 m de altura, hélices girando e olho verde.
export class DroneView {
  private readonly d: ReturnType<typeof droneMesh>;
  private readonly glow: THREE.Sprite;
  private shotT = 0;

  constructor(c: TrCtx) {
    this.d = droneMesh({ tex: c.tex, simple: c.q.simpleMaterials });
    this.d.group.scale.setScalar(1.3);
    this.d.group.visible = false;
    this.glow = glowSprite(0x6aff8a, 1, 0.6);
    this.d.group.add(this.glow);
    c.scene.add(this.d.group);
  }

  update(sample: Sample | null, tr: TrincheiraSnap, dt: number, t: number) {
    const { a, b, k } = pairOf(sample, tr);
    const dr = b.build.drone;
    const flying = dr.state === 'voo';
    this.d.group.visible = flying;
    if (!flying) return;
    const pa = a.build.drone;
    this.d.group.position.set(lerp(pa.x, dr.x, k), lerp(pa.y, dr.y, k) + Math.sin(t * 3) * 0.06, lerp(pa.z, dr.z, k));
    this.d.group.rotation.y += dt * 0.5;
    for (const r of this.d.rotors) r.rotation.y += dt * 50;
    this.glow.scale.setScalar(0.9 + Math.sin(t * 6) * 0.1);
    // some perto do fim do tempo
    this.d.group.visible = dr.t > 1.5 || Math.sin(t * 20) > -0.3;
    this.shotT -= dt;
  }
}
