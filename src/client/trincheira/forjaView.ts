import * as THREE from 'three';
import type { GameEvent } from '../../shared/protocol';
import { signTexture } from '../textures';
import { basic, boxMesh, solid } from './common';
import type { TrCtx } from './ctx';

const RISE = 6;
const DEPTH = 4.8;

// Coluna da Forja: fica escondida no poço da Escavação e sobe com tremor quando os 6 geradores ligam.
export class ForjaView {
  private readonly g = new THREE.Group();
  private t = -1;
  private up = false;
  private started = false;
  private dustT = 0;

  constructor(private readonly c: TrCtx) {
    const [cx, cz] = c.T.ring.c;
    this.g.position.set(cx, -DEPTH, cz);
    const stone = solid(c.tex, 'rune', 0x6e685e, c.q.simpleMaterials);
    const dark = solid(c.tex, 'rune', 0x4a453e, c.q.simpleMaterials);
    const metal = solid(c.tex, 'rivet', 0x3a3a3a, c.q.simpleMaterials, 0.5, 0.5);
    this.g.add(boxMesh(2.4, 1.8, 1.62, stone, 0, 0.9, -0.49));
    this.g.add(boxMesh(2.6, 0.2, 1.82, dark, 0, 1.9, -0.49));
    this.g.add(boxMesh(0.8, 2.4, 0.8, stone, 0, 3.2, -0.5));
    const rune = basic(0x4fb8ff);
    for (let k = 0; k < 4; k++) this.g.add(boxMesh(2.42, 0.06, 0.02, rune, 0, 0.33 + k * 0.4, 0.335));
    this.g.add(boxMesh(0.7, 0.45, 0.6, metal, 0, 0.225, 1.15));
    this.g.add(boxMesh(0.9, 0.27, 0.8, metal, 0, 0.585, 1.15));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.3), new THREE.MeshBasicMaterial({ map: signTexture('FORJA', '#9fd8ff', '#10161e', 1.1, 0.3, false) }));
    sign.position.set(0, 1.55, 0.35);
    this.g.add(sign);
    this.g.visible = false;
    c.scene.add(this.g);
  }

  update(forjaUp: boolean, dt: number) {
    const [cx, cz] = this.c.T.ring.c;
    if (!this.started) {
      this.started = true;
      // entrou com a Forja já erguida: aparece pronta
      if (forjaUp) {
        this.up = true;
        this.t = RISE;
      }
    }
    if (forjaUp && !this.up && this.t < 0) this.startRise();
    if (this.t >= 0 && this.t < RISE) {
      this.t += dt;
      this.dustT -= dt;
      if (this.dustT <= 0) {
        this.dustT = 0.18;
        const a = Math.random() * Math.PI * 2;
        this.c.fx.dust(cx + Math.cos(a) * 2, 0.1, cz + Math.sin(a) * 2, 8, 3);
        this.c.quake(0.3);
      }
      if (this.t >= RISE) {
        this.up = true;
        this.c.fx.ring(cx, 0, cz, 1, 12, 0x6ab8ff, 1.2);
        this.c.fx.burst(cx, 1.5, cz, 40, 5, 0x9fd8ff, 1.2, 0.35, { up: 2 });
      }
    }
    const k = this.up ? 1 : Math.max(0, this.t) / RISE;
    const e = 1 - Math.pow(1 - Math.min(1, k), 3);
    this.g.position.y = -DEPTH * (1 - e);
    this.g.visible = this.up || this.t >= 0;
  }

  private startRise() {
    this.t = 0;
    const [cx, cz] = this.c.T.ring.c;
    this.c.snd.play('forja-sobe', new THREE.Vector3(cx, 1, cz));
    this.c.notify('Os seis geradores rugem: a <b>Forja</b> sobe do poço da Escavação.');
  }

  onEvent(e: GameEvent) {
    if (e.e === 'forjaSobe' && !this.up && this.t < 0) this.startRise();
  }
}
