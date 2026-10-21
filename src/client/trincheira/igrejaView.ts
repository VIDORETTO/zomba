import * as THREE from 'three';
import { glowSprite, Merger, mergeBuffers, solid } from './common';
import type { TrCtx } from './ctx';

// Interior da Igreja (Posto Oeste, ticket B4): nave alta de 8 m, bancos tombados, vitrais quebrados com raios de luz colorida,
// telhado desabado (só vigas à mostra e buracos com céu), escombros e o sino caído. Tudo é só desenho, sem colisão.
// A planta: nave de x -96 a -71 e z -13 a 19, com a abside atrás do altar (z 19,8 a 27,1) no eixo x = -81,3.

const AXIS = -81.3;
// bordas da nave (retas da planta): x esquerdo e direito para um dado z
const xL = (z: number) => -96.1 + ((z + 9.8) * 6.3) / 28.7;
const xR = (z: number) => -77.7 + ((z + 13.7) * 6.7) / 32.6;

// sorteio fixo (a mesma igreja em toda partida)
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export class IgrejaView {
  private readonly root = new THREE.Group();
  private readonly shafts: THREE.Mesh;
  private readonly glow: THREE.Sprite[] = [];

  constructor(c: TrCtx) {
    const simple = c.q.simpleMaterials;
    const tex = c.tex;
    const wood = solid(tex, 'woodDark', 0x7a5a3e, simple);
    const stone = solid(tex, 'stone', 0x8e887c, simple);
    const brass = solid(tex, 'rivet', 0x9a7a34, simple, 0.4, 0.6);
    const r = rng(77);
    this.root.name = 'igreja';

    // ---------- bancos: duas colunas em volta do corredor central; metade tombada ----------
    {
      const m = new Merger();
      for (let z = -7; z <= 12.5; z += 2.3) {
        for (const side of [-1, 1]) {
          const cx = AXIS + side * 5.2;
          if (cx - 1.5 < xL(z) + 1.2 || cx + 1.5 > xR(z) - 1.2) continue;
          const yaw = (r() - 0.5) * 0.5;
          const fallen = r() < 0.4;
          const sx = cx + (r() - 0.5) * 0.8;
          const sz = z + (r() - 0.5) * 0.4;
          const roll = fallen ? (r() < 0.5 ? -1 : 1) * (1.2 + r() * 0.3) : 0;
          const tipUp = fallen && r() < 0.35;
          const g = new Merger();
          // assento, encosto e pernas
          g.box(wood, 2.8, 0.08, 0.5, 0, 0.45, 0);
          g.box(wood, 2.8, 0.7, 0.07, 0, 0.85, -0.25);
          for (const lx of [-1.3, 1.3]) g.box(wood, 0.08, 0.45, 0.46, lx, 0.22, 0);
          // junta no mundo com a rotação do banco (guinada e tombo)
          m.absorb(g, new THREE.Matrix4().compose(
            new THREE.Vector3(sx, fallen ? 0.28 : 0, sz),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(tipUp ? 0.3 : 0, yaw, roll, 'YXZ')),
            new THREE.Vector3(1, 1, 1),
          ));
        }
      }
      this.root.add(m.build('igreja-bancos'));
    }

    // ---------- vigas do telhado desabado: caibros de lado a lado, a cumeeira rachada e vigas caídas no chão ----------
    {
      const m = new Merger();
      for (let z = -12; z <= 19; z += 3.1) {
        // alguns caibros quebraram no meio
        const broken = r() < 0.3;
        const a = xL(z) - 0.3, b = xR(z) + 0.3;
        if (broken) {
          const mid = a + (b - a) * (0.35 + r() * 0.3);
          m.beam(wood, new THREE.Vector3(a, 8.0, z), new THREE.Vector3(mid, 7.9, z), 0.3);
          m.beam(wood, new THREE.Vector3(mid + 1.2, 7.1, z), new THREE.Vector3(b, 8.0, z), 0.3);
        } else {
          m.beam(wood, new THREE.Vector3(a, 8.0, z), new THREE.Vector3(b, 8.0, z), 0.3);
        }
        // empena: duas vigas inclinadas até a cumeeira
        const cx = (a + b) / 2;
        m.beam(wood, new THREE.Vector3(a, 8.0, z), new THREE.Vector3(cx, 10.6, z), 0.22);
        if (r() < 0.65) m.beam(wood, new THREE.Vector3(b, 8.0, z), new THREE.Vector3(cx, 10.6, z), 0.22);
      }
      // cumeeira (partida) e terças
      m.beam(wood, new THREE.Vector3(AXIS - 2, 10.6, -12), new THREE.Vector3(AXIS - 2.2, 10.6, 4), 0.28);
      m.beam(wood, new THREE.Vector3(AXIS - 2.5, 10.4, 7), new THREE.Vector3(AXIS - 2.6, 10.6, 19), 0.28);
      for (const off of [-6, 6]) m.beam(wood, new THREE.Vector3(AXIS + off, 8.1, -12), new THREE.Vector3(AXIS + off, 8.1, 19), 0.2);
      // vigas que despencaram: encostam no chão
      for (const [x, z, ang] of [[-86, -2, 0.5], [-76.5, 6, -0.7], [-84.5, 12, 0.2]] as [number, number, number][]) {
        m.beam(wood, new THREE.Vector3(x, 7.5, z), new THREE.Vector3(x + Math.cos(ang) * 4.5, 0.3, z + Math.sin(ang) * 4.5), 0.3);
      }
      // placas de telhado que sobraram, penduradas nas vigas
      for (const [x, z, tilt] of [[-90, -6, 0.4], [-74, 1, -0.5], [-87, 14, 0.3]] as [number, number, number][]) {
        m.box(solid(tex, 'roof', 0x5a4a3c, simple), 3.2, 0.12, 2.4, x, 7.6, z, 0.5, tilt, 0.15);
      }
      this.root.add(m.build('igreja-vigas', false));
    }

    // ---------- escombros e telhas no chão ----------
    {
      const m = new Merger();
      const rub = solid(tex, 'brick', 0x7a5040, simple);
      for (let i = 0; i < 46; i++) {
        const z = -10 + r() * 28;
        const x = xL(z) + 1.5 + r() * (xR(z) - xL(z) - 3);
        if (Math.abs(x - AXIS) < 1.3 && r() < 0.7) continue; // o corredor fica mais limpo
        const s = 0.2 + r() * 0.5;
        m.box(r() < 0.6 ? rub : stone, s, s * 0.7, s * 1.2, x, s * 0.3, z, r() * 3, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5);
      }
      this.root.add(m.build('igreja-escombros', false));
    }

    // ---------- sino caído: lado no chão, perto da porta ----------
    {
      const bell = new THREE.Mesh(new THREE.LatheGeometry([
        new THREE.Vector2(0.05, 1.0), new THREE.Vector2(0.25, 0.95), new THREE.Vector2(0.36, 0.7), new THREE.Vector2(0.5, 0.35), new THREE.Vector2(0.62, 0.0),
      ], 12), brass);
      bell.name = 'igreja-sino';
      bell.position.set(-75.5, 0.65, 2);
      bell.rotation.set(0, 0.6, Math.PI / 2 - 0.1);
      bell.castShadow = true;
      this.root.add(bell);
    }

    // ---------- altar: patamar de pedra atrás da Tábua e candelabros apagados ----------
    {
      const m = new Merger();
      m.box(stone, 6.5, 0.3, 3.2, AXIS, 0.15, 21.8);
      m.box(stone, 5.0, 0.3, 2.4, AXIS, 0.45, 22.8);
      for (const dx of [-2, 2]) {
        m.box(brass, 0.08, 1.2, 0.08, AXIS + dx, 1.05, 22.8);
        m.box(brass, 0.2, 0.06, 0.2, AXIS + dx, 1.68, 22.8);
      }
      this.root.add(m.build('igreja-altar', false));
    }

    // ---------- vitrais quebrados na parede do fundo (abside): vidro colorido que ainda brilha ----------
    {
      const frame = new Merger();
      const panes: { x: number; color: number }[] = [{ x: AXIS - 3.2, color: 0xd23a3a }, { x: AXIS, color: 0x3a6ad2 }, { x: AXIS + 3.2, color: 0xe0a83a }];
      const g = new THREE.Group();
      g.name = 'igreja-vitral';
      const glass: THREE.BufferGeometry[] = [];
      for (const p of panes) {
        // moldura de pedra
        frame.box(stone, 2.0, 0.2, 0.3, p.x, 2.4, 26.9);
        frame.box(stone, 2.0, 0.2, 0.3, p.x, 6.9, 26.9);
        frame.box(stone, 0.2, 4.7, 0.3, p.x - 1.0, 4.65, 26.9);
        frame.box(stone, 0.2, 4.7, 0.3, p.x + 1.0, 4.65, 26.9);
        // pedaços de vidro: alguns faltam (quebrados); todos entram na mesma malha, com a cor e a força em cada vértice
        for (let row = 0; row < 6; row++) {
          for (let col = 0; col < 3; col++) {
            if (r() < 0.35) continue;
            const geo = new THREE.PlaneGeometry(0.55, 0.7).toNonIndexed();
            geo.rotateY(Math.PI);
            geo.translate(p.x - 0.62 + col * 0.62, 2.8 + row * 0.7, 26.8);
            const k = 0.45 + r() * 0.4;
            const c = new THREE.Color(p.color).multiplyScalar(k);
            const arr = new Float32Array(geo.getAttribute('position').count * 3);
            for (let i = 0; i < arr.length; i += 3) c.toArray(arr, i);
            geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
            glass.push(geo);
          }
        }
        const glow = glowSprite(p.color, 5, 0.35);
        glow.position.set(p.x, 4.6, 26.4);
        g.add(glow);
        this.glow.push(glow);
      }
      const glassMesh = new THREE.Mesh(mergeBuffers(glass), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      glassMesh.name = 'igreja-vidros';
      glassMesh.frustumCulled = false;
      g.add(glassMesh);
      g.add(frame.build('igreja-vitral-molduras', false));
      this.root.add(g);

      // raios de luz colorida atravessando a nave (um prisma por vitral, juntos em uma malha só)
      const geos: THREE.BufferGeometry[] = [];
      const cols: THREE.Color[] = [];
      for (const p of panes) {
        const geo = new THREE.CylinderGeometry(0.9, 1.9, 24, 4, 1, true).translate(0, 12, 0);
        const dir = new THREE.Vector3(0.12 * (p.x - AXIS) / 3.2, -0.55, -1).normalize();
        geo.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir)));
        geo.translate(p.x, 5.0, 26.2);
        const col = new THREE.Color(p.color).multiplyScalar(0.8);
        const n = geo.getAttribute('position').count;
        const arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) col.toArray(arr, i * 3);
        geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        geos.push(geo);
        cols.push(col);
      }
      const merged = mergeBuffers(geos);
      this.shafts = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      this.shafts.name = 'igreja-raios';
      this.shafts.frustumCulled = false;
      this.shafts.renderOrder = 2;
      this.root.add(this.shafts);
    }

    c.scene.add(this.root);
  }

  update(t: number) {
    // os raios respiram devagar (poeira passando) e o brilho dos vitrais oscila
    (this.shafts.material as THREE.MeshBasicMaterial).opacity = 0.09 + 0.03 * Math.sin(t * 0.7);
    this.glow.forEach((g, i) => ((g.material as THREE.SpriteMaterial).opacity = 0.32 + 0.06 * Math.sin(t * 0.9 + i * 2)));
  }

  dispose() {
    this.root.removeFromParent();
  }
}
