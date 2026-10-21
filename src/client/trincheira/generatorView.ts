import * as THREE from 'three';
import type { GameEvent, TrGen } from '../../shared/protocol';
import { additive, beamMesh, clamp01, flatRing, glowSprite, smooth } from './common';
import type { TrCtx } from './ctx';

interface GenFx {
  group: THREE.Group;
  ring: THREE.Mesh;
  wall: THREE.Mesh;
  beam: THREE.Mesh;
  glow: THREE.Sprite;
  alert: THREE.Mesh;
  lamps: THREE.Sprite[];
  on: number;
}

const OFF = new THREE.Color(0xff8a30);
const ON = new THREE.Color(0x4fe8ff);

// Geradores: círculo de captura no chão, parede de progresso, lâmpadas quentes e feixe ciano que sobe ao céu quando ligado.
export class GeneratorView {
  private readonly gens: GenFx[] = [];
  private readonly wallGeo: THREE.CylinderGeometry;

  constructor(private readonly c: TrCtx) {
    this.wallGeo = new THREE.CylinderGeometry(1, 1, 1, 40, 1, true).translate(0, 0.5, 0);
    for (const g of c.T.gens) {
      const group = new THREE.Group();
      group.position.set(g.x, 0, g.z);
      const ring = flatRing(OFF, g.r + 0.35, 0.55);
      const alert = flatRing(0xff2a1a, g.r + 1.2, 0);
      const wall = new THREE.Mesh(this.wallGeo, additive(ON, { opacity: 0.28, side: THREE.DoubleSide, fog: false }));
      wall.scale.set(g.r, 0.01, g.r);
      wall.visible = false;
      const beam = beamMesh(0x6af2ff, 0.7, 170, 0.55);
      beam.visible = false;
      const glow = glowSprite(OFF, 3.2, 0.7);
      glow.position.y = 3.6;
      const lamps: THREE.Sprite[] = [];
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.7;
        const l = glowSprite(0xffc27a, 1.5, 0);
        l.position.set(Math.cos(a) * (g.r + 0.8), 3.4, Math.sin(a) * (g.r + 0.8));
        lamps.push(l);
        group.add(l);
      }
      group.add(ring, alert, wall, beam, glow);
      c.scene.add(group);
      this.gens.push({ group, ring, wall, beam, glow, alert, lamps, on: 0 });
    }
  }

  // cam: posição da câmera; de perto o feixe e o brilho desbotam (smoothstep de 2 a 12 m do eixo) para não cobrirem a tela
  update(gens: TrGen[], dt: number, t: number, cam: THREE.Vector3) {
    gens.forEach((s, i) => {
      const v = this.gens[i];
      if (!v) return;
      const g = this.c.T.gens[i];
      v.on += ((s.on ? 1 : 0) - v.on) * Math.min(1, dt * 2.5);
      const near = smooth(clamp01((Math.hypot(cam.x - g.x, cam.z - g.z) - 2) / 10));
      const col = OFF.clone().lerp(ON, v.on);
      (v.ring.material as THREE.MeshBasicMaterial).color.copy(col);
      (v.ring.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.25 * Math.sin(t * (s.capturing ? 7 : 1.6) + i) + (s.on ? 0.15 : 0);
      (v.glow.material as THREE.SpriteMaterial).color.copy(col);
      v.glow.scale.setScalar(2.6 + v.on * 1.6 + Math.sin(t * 3 + i) * 0.2);
      (v.glow.material as THREE.SpriteMaterial).opacity = 0.7 * (0.3 + 0.7 * near);
      v.beam.visible = v.on > 0.02;
      if (v.beam.visible) {
        const m = v.beam.material as THREE.MeshBasicMaterial;
        m.opacity = 0.5 * v.on * near * (0.85 + 0.15 * Math.sin(t * 5 + i));
        v.beam.rotation.y = t * 0.6;
      }
      for (const l of v.lamps) (l.material as THREE.SpriteMaterial).opacity = v.on * (0.8 + 0.2 * Math.sin(t * 9 + l.position.x));
      // parede de progresso
      v.wall.visible = s.capturing || (s.progress > 0.01 && !s.on);
      if (v.wall.visible) {
        v.wall.scale.set(g.r, 0.2 + s.progress * 3.2, g.r);
        (v.wall.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.1 * Math.sin(t * 9);
      }
      // gerador sendo atacado: anel vermelho piscando
      const am = v.alert.material as THREE.MeshBasicMaterial;
      am.opacity = s.attacked ? 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 10)) : 0;
      // fumaça do motor e faíscas ao capturar
      // vapor claro e aditivo (nunca escurece o que está atrás, como a fumaça escura fazia dentro do feixe)
      if (s.on) this.c.fx.stream(`gen${i}`, dt, 2.2, () => ({
        x: g.x + (Math.random() - 0.5) * 0.3, y: 3.0, z: g.z + (Math.random() - 0.5) * 0.3,
        vx: (Math.random() - 0.5) * 0.5 + 0.3, vy: 1.4 * (0.7 + Math.random() * 0.6), vz: (Math.random() - 0.5) * 0.5,
        life: 2.2 + Math.random() * 1.4, size: 0.9, color: 0x5a7a84, alpha: 0.16, grow: 0.7,
      }));
      if (s.capturing) this.c.fx.stream(`gencap${i}`, dt, 18, () => {
        const a = Math.random() * Math.PI * 2;
        return { x: g.x + Math.cos(a) * g.r, y: 0.2, z: g.z + Math.sin(a) * g.r, vy: 2 + Math.random() * 2, vx: -Math.cos(a) * 1.2, vz: -Math.sin(a) * 1.2, life: 0.9, size: 0.22, color: 0x7af0ff, alpha: 0.9 };
      });
    });
  }

  onEvent(e: GameEvent) {
    if (e.e !== 'gen') return;
    const g = this.c.T.gens[e.gen];
    if (!g) return;
    const p = new THREE.Vector3(g.x, 1.5, g.z);
    const name = g.name;
    switch (e.phase) {
      case 'start':
        this.c.snd.play('gerador-captura', p);
        break;
      case 'cancel':
        this.c.snd.play('gerador-perde', p, 0.6);
        this.c.notify(`A captura de <b>${name}</b> falhou: ninguém ficou no círculo.`);
        break;
      case 'done':
        this.c.snd.play('gerador-liga', p);
        this.c.fx.ring(g.x, 0, g.z, 1, g.r + 6, 0x6af2ff, 1.2);
        this.c.fx.burst(g.x, 3, g.z, 40, 6, 0x9af6ff, 1, 0.35, { up: 2 });
        this.c.quake(0.35);
        this.c.notify(`<b>${name}</b> ligado: a bebida e a Fonte da Sorte da área acenderam.`);
        break;
      case 'lost':
        this.c.snd.play('gerador-perde', p);
        this.c.fx.burst(g.x, 2.5, g.z, 30, 4, 0x555049, 1.4, 0.7, { dull: true, up: 1 });
        this.c.notify(`Os Cruzados desligaram <b>${name}</b>! Capture de novo (de graça).`);
        break;
      case 'attack':
        this.c.snd.play('alarme', p);
        break;
    }
  }
}
