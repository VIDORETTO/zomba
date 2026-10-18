import * as THREE from 'three';
import type { BoxSpot } from '../shared/map/types';
import type { BoxState } from '../shared/protocol';
import { BOX, BOX_POOL } from '../shared/weapons';
import { buildGun, type GunMats } from './gunModels';
import type { TexSet } from './textures';

function std(color: number, rough = 0.7, metal = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

function questionTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(240,232,210,0.9)';
  ctx.font = "900 110px Georgia, 'Times New Roman', serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 64, 70);
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 400; i++) ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Caixa Misteriosa no mundo: baú, facho de luz, arma girando e o Corvo.
export class BoxView {
  private readonly group = new THREE.Group();
  private readonly chest = new THREE.Group();
  private readonly lid = new THREE.Group();
  private readonly glow: THREE.Mesh;
  private readonly beam: THREE.Mesh;
  private readonly beamMat: THREE.MeshBasicMaterial;
  private readonly holder = new THREE.Group();
  private readonly crow = new THREE.Group();
  private readonly wingL = new THREE.Group();
  private readonly wingR = new THREE.Group();
  private readonly mats: GunMats;
  private shown = '';
  private cycleT = 0;
  private openT = 0;
  private crowT = -1;
  private loc = -1;
  private dropT = 1;
  private spinStart = 0;

  constructor(scene: THREE.Scene, private readonly spots: BoxSpot[], tex: TexSet) {
    this.mats = {
      steel: std(0x8a8e94, 0.4, 0.4), dark: std(0x2c2e31, 0.55, 0.1), black: std(0x161616, 0.5, 0.3),
      wood: std(0x5a3a26, 0.7), glove: std(0x3a3430), sleeve: std(0x434a33), skin: std(0xb98d70),
    };
    const wood = new THREE.MeshStandardMaterial({ map: tex.woodDark, color: 0x8a6a50, roughness: 0.85 });
    const metal = std(0x3a3632, 0.5, 0.5);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 0.7), wood);
    base.position.y = 0.275;
    this.chest.add(base);
    for (const x of [-0.62, 0, 0.62]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.57, 0.72), metal);
      band.position.set(x, 0.275, 0);
      this.chest.add(band);
    }
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshLambertMaterial({ map: questionTexture(), transparent: true, depthWrite: false }));
    q.position.set(-0.32, 0.28, 0.352);
    this.chest.add(q);
    const q2 = q.clone();
    q2.position.x = 0.32;
    this.chest.add(q2);
    // tampa articulada na borda de trás
    this.lid.position.set(0, 0.55, -0.35);
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.12, 0.72), wood);
    lidMesh.position.set(0, 0.06, 0.36);
    this.lid.add(lidMesh);
    this.chest.add(this.lid);
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 0.8) }));
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.54;
    this.glow.visible = false;
    this.chest.add(this.glow);
    this.group.add(this.chest);

    // facho de luz que marca a caixa de longe
    this.beamMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.5, 0.75, 1.4), transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    // começa acima da caixa, para não cobrir quem está perto
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 60, 16, 1, true), this.beamMat);
    this.beam.position.y = 32.5;
    this.group.add(this.beam);

    this.holder.position.y = 0.7;
    this.chest.add(this.holder);

    // o Corvo
    const black = std(0x0e0e10, 0.6);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.34), black);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), black);
    head.position.set(0, 0.08, 0.2);
    const beak = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.1), std(0x2a2620));
    beak.position.set(0, 0.06, 0.3);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 0.4, 0.2) }));
    eye.position.set(0, 0.1, 0.24);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.16), black);
    tail.position.set(0, -0.02, -0.24);
    for (const [w, side] of [[this.wingL, -1], [this.wingR, 1]] as [THREE.Group, number][]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.22), black);
      m.position.x = side * 0.17;
      w.add(m);
      w.position.x = side * 0.07;
      this.crow.add(w);
    }
    this.crow.add(body, head, beak, eye, tail);
    this.crow.visible = false;
    this.chest.add(this.crow);

    this.group.visible = false;
    scene.add(this.group);
  }

  private place(loc: number) {
    const s = this.spots[loc];
    this.group.position.set(s.x, 0, s.z);
    this.group.rotation.y = Math.atan2(s.nx, s.nz);
    this.group.visible = true;
  }

  private readonly models = new Map<string, THREE.Group>();

  private show(id: string) {
    if (id === this.shown) return;
    this.shown = id;
    this.holder.clear();
    if (!id) return;
    // cada modelo é montado uma vez só e reaproveitado (o sorteio troca de arma várias vezes por segundo)
    let g = this.models.get(id);
    if (g) {
      this.holder.add(g);
      return;
    }
    g = buildGun(id, this.mats, false).group;
    this.models.set(id, g);
    g.scale.setScalar(1.7);
    g.rotation.y = Math.PI / 2;
    this.holder.add(g);
  }

  onEvent(phase: string) {
    if (phase === 'spin') this.spinStart = performance.now();
    if (phase === 'crow') this.crowT = 0;
    if (phase === 'arrive') this.dropT = 0;
  }

  update(b: BoxState | undefined, dt: number, t: number) {
    if (!b) return;
    if (b.loc !== this.loc) {
      this.loc = b.loc;
      this.place(b.loc);
    }
    const open = b.state === 'spinning' || b.state === 'offer' || this.crowT >= 0;
    this.openT = Math.max(0, Math.min(1, this.openT + (open ? dt * 3 : -dt * 2)));
    this.lid.rotation.x = -1.25 * this.openT;
    this.glow.visible = this.openT > 0.2;

    // arma sobe girando no sorteio, troca cada vez mais devagar, e afunda devagar enquanto espera
    if (b.state === 'spinning') {
      const el = (performance.now() - this.spinStart) / 1000;
      const k = Math.min(1, el / BOX.spinTime);
      this.cycleT -= dt;
      if (this.cycleT <= 0) {
        this.cycleT = 0.08 + k * k * 0.4;
        this.show(BOX_POOL[Math.floor(Math.random() * BOX_POOL.length)][0]);
      }
      this.holder.position.y = 0.6 + k * 0.5;
      this.holder.rotation.y = 0;
    } else if (b.state === 'offer' && b.weapon) {
      this.show(b.weapon);
      this.holder.position.y = 0.6 + 0.5 * (b.t / BOX.offerTime);
      this.holder.rotation.y = Math.sin(t * 1.5) * 0.25;
    } else {
      this.show('');
    }

    // o Corvo sai da caixa batendo asas e leva a caixa embora
    if (this.crowT >= 0) {
      this.crowT += dt;
      this.crow.visible = true;
      this.crow.position.set(Math.sin(this.crowT * 2) * 0.3, 0.6 + this.crowT * 0.9, 0);
      this.crow.rotation.y = this.crowT * 1.5;
      const flap = Math.sin(this.crowT * 22) * 0.9;
      this.wingL.rotation.z = flap;
      this.wingR.rotation.z = -flap;
      if (this.crowT > 2.5) {
        this.chest.position.y = (this.crowT - 2.5) * 3;
        this.beamMat.opacity = Math.max(0, 0.16 - (this.crowT - 2.5) * 0.1);
      }
      if (this.crowT > 6) {
        this.crowT = -1;
        this.crow.visible = false;
      }
    }
    if (b.state !== 'moving' && this.crowT < 0) {
      // chegada: cai do céu
      this.dropT = Math.min(1, this.dropT + dt * 1.5);
      this.chest.position.y = (1 - this.dropT) * (1 - this.dropT) * 8;
      this.beamMat.opacity = 0.16;
    }
    this.chest.visible = b.state !== 'moving' || this.crowT >= 0;
    this.beam.visible = this.chest.visible;
  }

  // ponto da caixa (para sons)
  position(): THREE.Vector3 {
    return this.group.position.clone().setY(0.8);
  }

  dispose() {
    this.group.removeFromParent();
    for (const g of this.models.values()) g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.models.clear();
  }
}
