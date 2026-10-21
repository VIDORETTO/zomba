import * as THREE from 'three';
import type { GameEvent, Element, TrincheiraSnap } from '../../shared/protocol';
import { ELEMENTS } from '../../shared/trincheira-info';
import { boxMesh, flatRing, glowSprite } from './common';
import type { TrCtx } from './ctx';

const EI: Record<Element, number> = { fogo: 0, gelo: 1, vento: 2, raio: 3 };
const PURPLE = new THREE.Color(0x1a0c2a);

// Túneis dos portais e Câmara Antiga: lajes com runa, luz da cor do elemento nos túneis abertos, portais de volta,
// pedras flutuando, céu preto com estrelas e névoa roxa quando o jogador está lá dentro.
export class CamaraFx {
  inside = false;
  private readonly dome: THREE.Mesh;
  private readonly stars: THREE.Points;
  private readonly stones: THREE.InstancedMesh;
  private readonly hallRing: THREE.Mesh;
  private readonly slabGlow: THREE.Sprite[] = [];
  private readonly mouthGlow: THREE.Sprite[] = [];
  private readonly backGlow: THREE.Sprite[] = [];
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s3 = new THREE.Vector3();
  private readonly e = new THREE.Euler();
  private readonly stoneSeed: number[] = [];
  private dim = 0;

  constructor(private readonly c: TrCtx, private readonly mapView: { setDim(k: number): void } | null) {
    const [cx, cz] = c.T.chamber.center;
    const domeMat = new THREE.MeshBasicMaterial({ color: 0x050308, side: THREE.BackSide, fog: false, depthWrite: true });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(32, 24, 12), domeMat);
    this.dome.position.set(cx, 0, cz);
    this.dome.visible = false;
    this.dome.renderOrder = -0.5;
    c.scene.add(this.dome);
    // estrelas
    const n = 420;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.acos(Math.random() * 0.92 + 0.08);
      const r = 30;
      pos[i * 3] = cx + Math.sin(e) * Math.cos(a) * r;
      pos[i * 3 + 1] = Math.cos(e) * r;
      pos[i * 3 + 2] = cz + Math.sin(e) * Math.sin(a) * r;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xd8d0ff, size: 1.1, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9 }));
    this.stars.visible = false;
    c.scene.add(this.stars);
    // pedras flutuando
    const count = 16;
    this.stones = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x3a3640, roughness: 0.9 }), count);
    this.stones.frustumCulled = false;
    for (let i = 0; i < count; i++) this.stoneSeed.push(Math.random() * 100);
    this.stones.visible = false;
    c.scene.add(this.stones);
    this.hallRing = flatRing(0x9a7aff, c.T.chamber.hall - 1, 0.4);
    this.hallRing.position.set(cx, 0.08, cz);
    c.scene.add(this.hallRing);
    // luzes sem luz: sprites dos portais
    for (const p of c.T.portals) {
      const col = ELEMENTS[p.el].hex;
      const slab = glowSprite(col, 1.8, 0.5);
      slab.position.set(p.slab[0], 1.5, p.slab[1]);
      const mouth = glowSprite(col, 4.2, 0);
      mouth.position.set(p.mouth[0], 1.6, p.mouth[1]);
      c.scene.add(slab, mouth);
      this.slabGlow.push(slab);
      this.mouthGlow.push(mouth);
    }
    for (const a of c.T.chamber.alcoves) {
      const g = glowSprite(ELEMENTS[a.el].hex, 4, 0.7);
      g.position.set(a.back[0], 1.6, a.back[1]);
      c.scene.add(g);
      this.backGlow.push(g);
      // pedestal do cristal: brilho fraco
      const cg = glowSprite(ELEMENTS[a.el].hex, 1.6, 0.35);
      cg.position.set(a.crystal[0], 1.3, a.crystal[1]);
      c.scene.add(cg);
    }
    void boxMesh;
  }

  update(tr: TrincheiraSnap, dt: number, t: number, cam: THREE.Vector3, scene: THREE.Scene) {
    const R = this.c.T.chamberRect;
    const was = this.inside;
    this.inside = cam.x > R[0] - 2 && cam.x < R[2] + 2 && cam.z > R[1] - 2 && cam.z < R[3] + 2;
    this.dome.visible = this.inside;
    this.stars.visible = this.inside;
    this.stones.visible = this.inside;
    if (this.inside) {
      // névoa roxa e céu escuro (reafirmado todo quadro: o mapa recalcula a névoa quando o clima muda)
      this.dim = 1;
      this.mapView?.setDim(1);
      const fog = scene.fog as THREE.FogExp2 | null;
      if (fog) {
        fog.color.copy(PURPLE);
        fog.density = 0.03;
      }
      if (scene.background instanceof THREE.Color) scene.background.copy(PURPLE);
    } else if (was || this.dim > 0) {
      this.dim = 0;
      this.mapView?.setDim(0);
    }
    // pedras flutuando em volta do salão
    if (this.inside) {
      const [cx, cz] = this.c.T.chamber.center;
      for (let i = 0; i < this.stoneSeed.length; i++) {
        const s = this.stoneSeed[i];
        const a = t * 0.12 * (i % 2 ? 1 : -1) + (i / this.stoneSeed.length) * Math.PI * 2;
        const r = 9 + (i % 4) * 4.5;
        this.e.set(t * 0.2 + s, t * 0.15 + s * 2, 0);
        this.q.setFromEuler(this.e);
        const sz = 0.8 + (i % 3) * 0.7;
        this.s3.set(sz, sz * 0.7, sz * 0.9);
        this.m4.compose(new THREE.Vector3(cx + Math.cos(a) * r, 6 + Math.sin(t * 0.5 + s) * 0.6 + (i % 5), cz + Math.sin(a) * r), this.q, this.s3);
        this.stones.setMatrixAt(i, this.m4);
      }
      this.stones.instanceMatrix.needsUpdate = true;
    }
    (this.hallRing.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.15 * Math.sin(t * 1.3);
    // portais
    this.c.T.portals.forEach((p, i) => {
      const open = !!tr.portals[EI[p.el]];
      (this.slabGlow[i].material as THREE.SpriteMaterial).opacity = open ? 0 : 0.35 + 0.3 * Math.sin(t * 2 + i);
      (this.mouthGlow[i].material as THREE.SpriteMaterial).opacity = open ? 0.55 + 0.2 * Math.sin(t * 3 + i) : 0;
      if (open) this.swirl(`pm${i}`, p.mouth[0], p.mouth[1], ELEMENTS[p.el].hex, dt, t, 1.3, 2.4);
    });
    this.c.T.chamber.alcoves.forEach((a, i) => {
      (this.backGlow[i].material as THREE.SpriteMaterial).opacity = 0.5 + 0.2 * Math.sin(t * 2.2 + i);
      if (this.inside) this.swirl(`pb${i}`, a.back[0], a.back[1], ELEMENTS[a.el].hex, dt, t, 1.1, 2.2);
    });
  }

  // partículas girando para cima, como um redemoinho de luz
  private swirl(key: string, x: number, z: number, color: number, dt: number, t: number, r: number, h: number) {
    this.c.fx.stream(key, dt, 26, () => {
      const a = t * 4 + Math.random() * 6.28;
      return { x: x + Math.cos(a) * r * Math.random(), y: 0.1, z: z + Math.sin(a) * r * Math.random(), vx: -Math.sin(a) * 1.5, vy: h * (0.6 + Math.random() * 0.6), vz: Math.cos(a) * 1.5, life: 1, size: 0.22, color, alpha: 0.85 };
    });
  }

  onEvent(e: GameEvent, local: string) {
    if (e.e === 'portal') {
      const p = this.c.T.portals.find((x) => x.el === e.el);
      const pos = p ? new THREE.Vector3(p.slab[0], 1.5, p.slab[1]) : undefined;
      this.c.snd.play('portal-abre', pos);
      if (p) {
        this.c.fx.burst(p.mouth[0], 1.6, p.mouth[1], 50, 5, ELEMENTS[e.el].hex, 1.2, 0.4, { up: 1 });
        this.c.fx.ring(p.mouth[0], 0, p.mouth[1], 1, 7, ELEMENTS[e.el].hex, 1);
      }
      this.c.quake(0.4);
      this.c.notify(`O portal de <b style="color:${ELEMENTS[e.el].color}">${ELEMENTS[e.el].name}</b> se abriu: entre no túnel.`);
    } else if (e.e === 'teleporte') {
      if (e.pid === local) {
        this.c.flash();
        this.c.snd.play('teleporte');
      } else {
        const a = this.c.T.chamber.alcoves.find((x) => x.el === e.el);
        const p = this.c.T.portals.find((x) => x.el === e.el);
        const at = e.to === 'camara' ? p?.mouth : a?.back;
        if (at) {
          this.c.fx.burst(at[0], 1.4, at[1], 24, 4, ELEMENTS[e.el].hex, 0.8, 0.35);
          this.c.snd.play('teleporte', new THREE.Vector3(at[0], 1.4, at[1]), 0.7);
        }
      }
    }
  }
}
