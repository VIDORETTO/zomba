import * as THREE from 'three';
import type { GameEvent } from '../../shared/protocol';
import { glowSprite, Merger, solid } from './common';
import type { TrCtx } from './ctx';

// Segredo musical (ticket C8): 3 cantis de metal pendurados em postes baixos, um no Quartel Norte, um na Vala Sul e um no Posto Oeste.
// F em cada um toca um sino e o cantil balança; com os 3, toca a música de ~90 s (som em trSound.ts).
export class SegredoView {
  private readonly leds: THREE.Sprite[] = [];
  private readonly cantis: { group: THREE.Group; pend: THREE.Group; swing: number; pos: THREE.Vector3 }[] = [];

  constructor(private readonly c: TrCtx) {
    const simple = c.q.simpleMaterials;
    const wood = solid(c.tex, 'woodDark', 0x8a6a48, simple);
    const metal = solid(c.tex, 'rivet', 0x8a8a84, simple, 0.4, 0.7);
    const strap = solid(c.tex, 'woodDark', 0x4a3a28, simple);
    c.map.interactables.filter((i) => i.kind === 'cantil').forEach((it, i) => {
      const g = new THREE.Group();
      g.name = `segredo-cantil-${i}`;
      g.position.set(it.use[0], 0, it.use[1] + 0.6);
      const m = new Merger();
      // poste com braço, de onde o cantil pende
      m.box(wood, 0.12, 1.9, 0.12, 0, 0.95, 0);
      m.box(wood, 0.7, 0.1, 0.1, 0.3, 1.85, 0);
      g.add(m.build('segredo-poste', false));
      const pend = new THREE.Group();
      pend.position.set(0.6, 1.82, 0);
      const cord = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.35, 0.02), strap);
      cord.position.y = -0.18;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 12).rotateX(Math.PI / 2), metal);
      body.position.y = -0.46;
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.09, 8), metal);
      neck.position.y = -0.36;
      pend.add(cord, body, neck);
      g.add(pend);
      c.scene.add(g);
      this.cantis.push({ group: g, pend, swing: 0, pos: new THREE.Vector3(it.use[0] + 0.6, 1.3, it.use[1] + 0.6) });
    });
    this.buildRadios();
  }

  // rádios de campanha (C9): caixote com o aparelho em cima, antena e uma luz vermelha que pisca
  private buildRadios() {
    const c = this.c;
    const simple = c.q.simpleMaterials;
    const wood = solid(c.tex, 'woodDark', 0x8a6a48, simple);
    const metal = solid(c.tex, 'rivet', 0x6a6a64, simple, 0.5, 0.5);
    c.map.interactables.filter((i) => i.kind === 'radio').forEach((it, i) => {
      const g = new THREE.Group();
      g.name = `radio-aparelho-${i}`;
      g.position.set(it.use[0], 0, it.use[1] + 0.7);
      const m = new Merger();
      m.box(wood, 0.7, 0.7, 0.55, 0, 0.35, 0);
      m.box(metal, 0.5, 0.28, 0.3, 0, 0.84, 0);
      m.box(metal, 0.04, 0.04, 0.04, 0.18, 1.0, 0);
      m.box(metal, 0.02, 0.6, 0.02, -0.2, 1.28, -0.05);
      g.add(m.build('radio-corpo', false));
      const led = glowSprite(0xff3a2a, 0.35, 0.9);
      led.position.set(0.18, 1.03, 0.1);
      g.add(led);
      this.leds.push(led);
      c.scene.add(g);
    });
  }

  update(dt: number, t: number) {
    this.leds.forEach((l, i) => ((l.material as THREE.SpriteMaterial).opacity = Math.sin(t * 3 + i * 1.7) > 0.4 ? 0.95 : 0.15));
    for (const k of this.cantis) {
      k.swing = Math.max(0, k.swing - dt * 0.55);
      k.pend.rotation.z = Math.sin(t * 6) * k.swing * 0.5 + Math.sin(t * 0.8 + k.pos.x) * 0.03;
    }
  }

  onEvent(e: GameEvent) {
    if (e.e !== 'segredo') return;
    if (e.phase === 'cantil' && e.idx !== undefined) {
      const k = this.cantis[e.idx];
      if (!k) return;
      k.swing = 1;
      this.c.snd.play(`cantil-${e.idx + 1}` as 'cantil-1' | 'cantil-2' | 'cantil-3', k.pos);
    } else if (e.phase === 'musica') {
      this.c.snd.play('segredo-musica');
      this.c.notify('Três cantis soaram juntos: uma <b>canção antiga</b> começa a tocar...');
    }
  }

  dispose() {
    for (const k of this.cantis) k.group.removeFromParent();
  }
}
