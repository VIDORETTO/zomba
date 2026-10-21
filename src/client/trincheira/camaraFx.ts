import * as THREE from 'three';
import type { GameEvent, Element, TrincheiraSnap } from '../../shared/protocol';
import { ELEMENTS } from '../../shared/trincheira-info';
import { beamTex, flatRing, glowSprite, Merger, mergeBuffers, ringTex, runeTexture, solid } from './common';
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
  private readonly stoneRim: THREE.InstancedMesh;
  private readonly portalRings: THREE.Mesh[] = [];
  private runesMesh!: THREE.Mesh;
  private lightCols!: THREE.Mesh;
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
    this.stones.name = 'camara-pedras';
    c.scene.add(this.stones);
    // borda iluminada: um casco um pouco maior, aditivo, pela cor da alcova mais perto de cada pedra
    this.stoneRim = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      count,
    );
    this.stoneRim.name = 'camara-pedras-borda';
    this.stoneRim.frustumCulled = false;
    this.stoneRim.visible = false;
    for (let i = 0; i < count; i++) this.stoneRim.setColorAt(i, new THREE.Color(0xffffff));
    c.scene.add(this.stoneRim);
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
    this.buildDetails(c, cx, cz);
  }

  // cores das bordas das pedras (hex sem #), para os testes
  stoneRimColors(): string[] {
    const out: string[] = [];
    const col = new THREE.Color();
    for (let i = 0; i < this.stoneSeed.length; i++) {
      this.stoneRim.getColorAt(i, col);
      out.push(col.getHexString());
    }
    return out;
  }

  // pilares quebrados, runas das paredes, colunas de luz e os portais de volta de cada alcova
  private buildDetails(c: TrCtx, cx: number, cz: number) {
    const alcoves = c.T.chamber.alcoves;
    const simple = c.q.simpleMaterials;
    // pilares quebrados em volta do salão (alturas e topos diferentes)
    {
      const m = new Merger();
      const stone = solid(c.tex, 'stone', 0x6a6678, simple);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
        const x = cx + Math.cos(a) * 9.3, z = cz + Math.sin(a) * 9.3;
        const h = 1.6 + ((k * 37) % 7) * 0.55;
        m.cyl(stone, 0.55, 0.65, h, 8, x, h / 2, z);
        // topo lascado: um pedaço inclinado e outro caído no chão
        m.box(stone, 0.8, 0.3, 0.7, x, h + 0.1, z, a, 0.35, 0.2);
        m.box(stone, 0.9, 0.5, 0.6, x + Math.cos(a + 0.6) * 1.2, 0.25, z + Math.sin(a + 0.6) * 1.2, a * 2, 0.1, 0.3);
      }
      const g = m.build('camara-pilares');
      c.scene.add(g);
    }
    // runas acesas na parede do fundo de cada alcova (duas faixas por alcova, na cor do elemento)
    {
      const geos: THREE.BufferGeometry[] = [];
      for (const a of alcoves) {
        const d = new THREE.Vector2(a.c[0] - cx, a.c[1] - cz).normalize();
        const lat = new THREE.Vector2(-d.y, d.x);
        const col = new THREE.Color(ELEMENTS[a.el].hex);
        for (const sgn of [-1, 1]) {
          const g = new THREE.PlaneGeometry(3, 0.75).toNonIndexed();
          // faixa de runas na parede de trás (u = 4,7 m), olhando para o salão (-d)
          g.rotateY(Math.atan2(-d.x, -d.y));
          g.translate(a.c[0] + d.x * 4.65 + lat.x * sgn * 2.3, 2.3, a.c[1] + d.y * 4.65 + lat.y * sgn * 2.3);
          const arr = new Float32Array(g.getAttribute('position').count * 3);
          for (let i = 0; i < arr.length; i += 3) col.toArray(arr, i);
          g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
          geos.push(g);
        }
      }
      const rt = runeTexture().clone();
      rt.repeat.set(3, 1);
      rt.needsUpdate = true;
      this.runesMesh = new THREE.Mesh(mergeBuffers(geos), new THREE.MeshBasicMaterial({ map: rt, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, opacity: 0.85 }));
      this.runesMesh.name = 'camara-runas';
      this.runesMesh.frustumCulled = false;
      c.scene.add(this.runesMesh);
    }
    // colunas de luz caindo do céu, na cor de cada elemento (uma malha só, cor por vértice)
    {
      const geos: THREE.BufferGeometry[] = [];
      alcoves.forEach((a, i) => {
        const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const geo = new THREE.CylinderGeometry(0.3, 0.55, 40, 10, 1, true).translate(0, 20, 0).toNonIndexed();
        geo.translate(cx + Math.cos(ang) * 4.2, 0, cz + Math.sin(ang) * 4.2);
        const col = new THREE.Color(ELEMENTS[a.el].hex);
        const arr = new Float32Array(geo.getAttribute('position').count * 3);
        for (let k = 0; k < arr.length; k += 3) col.toArray(arr, k);
        geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        geos.push(geo);
      });
      const mat = new THREE.MeshBasicMaterial({ map: beamTex(), vertexColors: true, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      this.lightCols = new THREE.Mesh(mergeBuffers(geos, true), mat);
      this.lightCols.name = 'camara-luz';
      this.lightCols.frustumCulled = false;
      this.lightCols.renderOrder = 2;
      c.scene.add(this.lightCols);
    }
    // portal de volta em cada alcova: anel de luz de pé na pedra do portal, olhando para dentro da alcova
    for (const a of alcoves) {
      const d = new THREE.Vector2(a.c[0] - cx, a.c[1] - cz).normalize();
      const lat = new THREE.Vector2(-d.y, d.x);
      const n = new THREE.Vector2(a.c[0] - a.back[0], a.c[1] - a.back[1]).normalize();
      const mat = new THREE.MeshBasicMaterial({ map: ringTex(), color: ELEMENTS[a.el].hex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.8, fog: false });
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), mat);
      ring.name = `camara-portal-${a.el}`;
      ring.position.set(a.back[0] + n.x * 0.1, 1.5, a.back[1] + n.y * 0.1);
      ring.rotation.y = Math.atan2(n.x, n.y);
      void lat;
      c.scene.add(ring);
      this.portalRings.push(ring);
    }
  }

  update(tr: TrincheiraSnap, dt: number, t: number, cam: THREE.Vector3, scene: THREE.Scene) {
    const R = this.c.T.chamberRect;
    const was = this.inside;
    this.inside = cam.x > R[0] - 2 && cam.x < R[2] + 2 && cam.z > R[1] - 2 && cam.z < R[3] + 2;
    this.dome.visible = this.inside;
    this.stars.visible = this.inside;
    this.stones.visible = this.inside;
    this.stoneRim.visible = this.inside;
    for (const o of [this.runesMesh, this.lightCols, ...this.portalRings]) o.visible = this.inside;
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
      // borda: mesma posição, um pouco maior, na cor da alcova mais perto da pedra
      const col = new THREE.Color();
      const pos = new THREE.Vector3(), scl = new THREE.Vector3(), rq = new THREE.Quaternion();
      for (let i = 0; i < this.stoneSeed.length; i++) {
        this.stones.getMatrixAt(i, this.m4);
        this.m4.decompose(pos, rq, scl);
        let best = 0, bd = 1e9;
        this.c.T.chamber.alcoves.forEach((al, k) => {
          const dd = Math.hypot(pos.x - al.c[0], pos.z - al.c[1]);
          if (dd < bd) { bd = dd; best = k; }
        });
        col.set(ELEMENTS[this.c.T.chamber.alcoves[best].el].hex);
        this.stoneRim.setColorAt(i, col);
        this.m4.compose(pos, rq, scl.multiplyScalar(1.12));
        this.stoneRim.setMatrixAt(i, this.m4);
      }
      this.stoneRim.instanceMatrix.needsUpdate = true;
      if (this.stoneRim.instanceColor) this.stoneRim.instanceColor.needsUpdate = true;
      // runas e anéis de portal respiram
      (this.runesMesh.material as THREE.MeshBasicMaterial).opacity = 0.6 + 0.25 * Math.sin(t * 1.4);
      this.portalRings.forEach((r, i) => {
        (r.material as THREE.MeshBasicMaterial).opacity = 0.7 + 0.2 * Math.sin(t * 2.5 + i);
        r.rotation.z = t * 0.6 * (i % 2 ? 1 : -1);
      });
      (this.lightCols.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.06 * Math.sin(t * 0.8);
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
