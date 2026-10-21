import * as THREE from 'three';
import { PERKS, type PerkId } from '../../shared/perks';
import type { GameEvent, TrincheiraSnap } from '../../shared/protocol';
import { signTexture } from '../textures';
import { beamMesh, boxMesh, cylMesh, glowSprite, solid } from './common';
import type { TrCtx } from './ctx';

const PERK_ORDER = Object.keys(PERKS) as PerkId[];

// Fonte da Sorte: uma máquina giratória de garrafas que fica num dos 6 locais por vez. Os outros locais mostram só o pedestal apagado.
export class FizzView {
  private readonly machine = new THREE.Group();
  private readonly carousel = new THREE.Group();
  private readonly bottles: THREE.Mesh[] = [];
  private readonly beam: THREE.Mesh;
  private readonly lamp: THREE.Sprite;
  private loc = -1;
  private spin = 0;
  private revealT = 0;
  private revealColor = new THREE.Color();
  private lightK = 0;

  constructor(private readonly c: TrCtx) {
    const spots = c.map.fizzSpots ?? [];
    const dark = solid(c.tex, 'rivet', 0x3a3834, c.q.simpleMaterials, 0.6, 0.4);
    const brass = solid(c.tex, 'rivet', 0x8a6a30, c.q.simpleMaterials, 0.5, 0.6);
    // o mapa já desenha o pedestal apagado de cada local; a máquina só cobre o local ativo
    void spots;
    // corpo da máquina
    this.machine.add(boxMesh(1.3, 0.3, 0.95, dark, 0, 0.15, 0));
    this.machine.add(boxMesh(1.3, 2.2, 0.2, dark, 0, 1.3, -0.35));
    this.machine.add(boxMesh(1.3, 0.2, 0.95, brass, 0, 2.45, 0));
    this.machine.add(boxMesh(0.12, 2.0, 0.8, brass, -0.62, 1.3, 0));
    this.machine.add(boxMesh(0.12, 2.0, 0.8, brass, 0.62, 1.3, 0));
    const glass = new THREE.MeshBasicMaterial({ color: 0x8ab8c8, transparent: true, opacity: 0.18, depthWrite: false });
    this.machine.add(boxMesh(1.12, 1.9, 0.04, glass, 0, 1.3, 0.38));
    // carrossel de garrafas (uma por bebida)
    this.carousel.position.set(0, 1.3, 0.02);
    this.carousel.add(cylMesh(0.06, 0.06, 1.9, brass, 8));
    PERK_ORDER.forEach((id, i) => {
      const a = (i / PERK_ORDER.length) * Math.PI * 2;
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(PERKS[id].color).multiplyScalar(0.55) });
      const b = cylMesh(0.1, 0.1, 0.5, m, 8, Math.cos(a) * 0.38, (i % 2 ? 0.5 : -0.4), Math.sin(a) * 0.3);
      b.userData.perk = id;
      this.bottles.push(b);
      this.carousel.add(b);
    });
    this.machine.add(this.carousel);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ map: signTexture('FONTE DA SORTE', '#ffe9b0', '#201810', 1.2, 0.3, true), color: new THREE.Color(1.2, 1.2, 1.2) }));
    sign.position.set(0, 2.2, 0.49);
    this.machine.add(sign);
    this.lamp = glowSprite(0xfff0c0, 2.4, 0.5);
    this.lamp.position.set(0, 1.4, 0.8);
    this.machine.add(this.lamp);
    this.beam = beamMesh(0xffffff, 0.3, 60, 0.3);
    this.machine.add(this.beam);
    this.machine.visible = false;
    c.scene.add(this.machine);
  }

  private placeAt(loc: number) {
    const s = this.c.map.fizzSpots?.[loc];
    if (!s) {
      this.machine.visible = false;
      return;
    }
    this.machine.position.set(s.x, 0, s.z);
    this.machine.rotation.y = Math.atan2(s.nx, s.nz);
    this.machine.visible = true;
  }

  update(tr: TrincheiraSnap, dt: number, t: number) {
    const f = tr.fizz;
    if (f.loc !== this.loc) {
      this.loc = f.loc;
      this.placeAt(f.loc);
    }
    if (!this.machine.visible) return;
    const gen = this.c.T.fizzGen[f.loc];
    const powered = gen === undefined || tr.gens[gen]?.on;
    this.lightK += ((powered ? 1 : 0) - this.lightK) * Math.min(1, dt * 3);
    const spinning = f.state === 'spin';
    this.spin += dt * (spinning ? 9 : powered ? 0.5 : 0);
    this.carousel.rotation.y = this.spin;
    this.revealT = Math.max(0, this.revealT - dt);
    this.bottles.forEach((b, i) => {
      const m = b.material as THREE.MeshBasicMaterial;
      const base = new THREE.Color(PERKS[b.userData.perk as PerkId].color);
      const k = (spinning ? 1.4 : 1) * this.lightK;
      m.color.copy(base).multiplyScalar(0.12 + 0.9 * k);
      if (this.revealT > 0 && i === 0) m.color.copy(this.revealColor).multiplyScalar(2);
    });
    (this.lamp.material as THREE.SpriteMaterial).opacity = 0.1 + 0.35 * this.lightK;
    this.lamp.scale.setScalar(1.8 + this.lightK * 0.8 + (spinning ? Math.sin(t * 20) * 0.2 : 0));
    this.beam.visible = this.lightK > 0.05;
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.28 * this.lightK;
    if (spinning) {
      const p = this.machine.position;
      this.c.fx.stream('fizz', dt, 20, () => ({ x: p.x + (Math.random() - 0.5), y: 1 + Math.random() * 1.5, z: p.z + (Math.random() - 0.5), vy: 1.5, life: 0.7, size: 0.2, color: 0xffe9b0, alpha: 0.9 }));
    }
  }

  onEvent(e: GameEvent) {
    if (e.e !== 'fizz') return;
    const s = this.c.map.fizzSpots?.[e.loc];
    if (!s) return;
    const p = new THREE.Vector3(s.x, 1.4, s.z);
    switch (e.phase) {
      case 'spin':
        this.c.snd.play('fonte-gira', p);
        break;
      case 'give': {
        this.c.snd.play('fonte-bebida', p);
        if (e.perk) {
          this.revealColor.set(PERKS[e.perk].color);
          this.revealT = 3;
          this.c.fx.burst(s.x, 1.6, s.z, 24, 3, PERKS[e.perk].color, 1, 0.3, { up: 1.5 });
        }
        break;
      }
      case 'leave':
        // um raio de luz leva a máquina embora
        this.c.snd.play('fonte-foge', p);
        this.c.fx.bolt(new THREE.Vector3(s.x, 45, s.z), new THREE.Vector3(s.x, 0.2, s.z), 0xffffff, 0.5, 0.7);
        this.c.fx.burst(s.x, 1.5, s.z, 40, 6, 0xffffff, 0.9, 0.4);
        this.c.fx.ring(s.x, 0, s.z, 1, 7, 0xffffff, 0.8);
        this.c.notify('A <b>Fonte da Sorte</b> foi embora num raio de luz.');
        break;
      case 'arrive':
        this.c.fx.bolt(new THREE.Vector3(s.x, 45, s.z), new THREE.Vector3(s.x, 0.2, s.z), 0xfff0c0, 0.5, 0.7);
        this.c.fx.ring(s.x, 0, s.z, 1, 6, 0xfff0c0, 0.8);
        this.c.snd.play('fonte-foge', p, 0.7);
        this.c.notify(`A <b>Fonte da Sorte</b> apareceu: ${s.name}.`);
        break;
    }
  }
}
