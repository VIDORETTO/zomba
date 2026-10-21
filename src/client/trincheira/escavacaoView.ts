import * as THREE from 'three';
import type { Element, TrincheiraSnap } from '../../shared/protocol';
import { ELEMENTS, ELEMENT_LIST } from '../../shared/trincheira-info';
import { additive, glowSprite, Merger, solid } from './common';
import type { TrCtx } from './ctx';

// Escavação: o coração do mapa. Tudo aqui é só desenho (sem colisão): o poço em degraus, andaimes, guindaste, lonas com
// mesas de arqueólogo, as runas do chão, os 4 anéis de pedra (parados até o ticket C6) e os pedestais dos cajados.
// Cada parte é um grupo com nome (`escavacao-*`), com a geometria juntada por material para gastar poucas chamadas de desenho.

// faixa circular (como um anel de disco) com a textura dando a volta: u cresce com o ângulo
function polarRing(rIn: number, rOut: number, seg: number, repeat: number, y = 0): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let k = 0; k <= seg; k++) {
    const a = (k / seg) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    pos.push(c * rIn, y, s * rIn, c * rOut, y, s * rOut);
    uv.push((k / seg) * repeat, 0, (k / seg) * repeat, 1);
    if (k < seg) {
      const i = k * 2;
      idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // as normais saem para baixo com a ordem acima: inverte para olhar para cima
  const n = g.getAttribute('normal');
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

let runeStrip: THREE.CanvasTexture | null = null;
// tira de runas (traços de glifos) em azul-claro sobre transparente
function runeTexture(): THREE.CanvasTexture {
  if (runeStrip) return runeStrip;
  const W = 1024, H = 64;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  let seed = 41;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  // linhas das bordas da faixa
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 5);
  ctx.lineTo(W, 5);
  ctx.moveTo(0, H - 5);
  ctx.lineTo(W, H - 5);
  ctx.stroke();
  ctx.lineWidth = 4;
  for (let k = 0; k < 16; k++) {
    const x0 = k * 64 + 10, y0 = 14, w = 44, h = 36;
    ctx.beginPath();
    const n = 2 + Math.floor(rnd() * 3);
    let px = x0 + rnd() * w, py = y0 + rnd() * h;
    ctx.moveTo(px, py);
    for (let i = 0; i < n; i++) {
      px = x0 + rnd() * w;
      py = y0 + rnd() * h;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    if (rnd() < 0.5) {
      ctx.beginPath();
      ctx.arc(x0 + w * rnd(), y0 + h * rnd(), 4 + rnd() * 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  runeStrip = new THREE.CanvasTexture(c);
  runeStrip.wrapS = THREE.RepeatWrapping;
  runeStrip.colorSpace = THREE.SRGBColorSpace;
  return runeStrip;
}

// símbolo do elemento em um quadrado (anéis de pedra): fogo = gota, gelo = losango, vento = espiral, raio = zigue-zague
function symbolTexture(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S * 4;
  c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#8a8478';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < 600; i++) ctx.fillRect(Math.random() * c.width, Math.random() * S, 3, 3);
  ctx.lineWidth = 7;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const col = (el: Element) => ELEMENTS[el].color;
  ELEMENT_LIST.forEach((el, k) => {
    const ox = k * S + S / 2, oy = S / 2;
    ctx.strokeStyle = col(el);
    ctx.beginPath();
    if (el === 'fogo') {
      ctx.moveTo(ox, oy - 40);
      ctx.bezierCurveTo(ox + 34, oy - 6, ox + 30, oy + 34, ox, oy + 36);
      ctx.bezierCurveTo(ox - 30, oy + 34, ox - 34, oy - 6, ox, oy - 40);
    } else if (el === 'gelo') {
      ctx.moveTo(ox, oy - 40);
      ctx.lineTo(ox + 28, oy);
      ctx.lineTo(ox, oy + 40);
      ctx.lineTo(ox - 28, oy);
      ctx.closePath();
      ctx.moveTo(ox - 28, oy);
      ctx.lineTo(ox + 28, oy);
    } else if (el === 'vento') {
      for (let a = 0; a < 14; a += 0.3) {
        const r = 4 + a * 2.7;
        const x = ox + Math.cos(a) * r, y = oy + Math.sin(a) * r;
        a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
    } else {
      ctx.moveTo(ox + 10, oy - 42);
      ctx.lineTo(ox - 18, oy + 2);
      ctx.lineTo(ox + 6, oy + 2);
      ctx.lineTo(ox - 12, oy + 42);
      ctx.lineTo(ox + 24, oy - 8);
      ctx.lineTo(ox, oy - 8);
      ctx.closePath();
    }
    ctx.stroke();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// cópia do material que desenha as duas faces (paredes abertas vistas de dentro, lonas)
function dbl(m: THREE.Material): THREE.Material {
  const c = m.clone();
  c.side = THREE.DoubleSide;
  return c;
}
// troca os materiais de um grupo pelas versões de duas faces
function doubleSided(g: THREE.Group) {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.material = dbl(mesh.material as THREE.Material);
  });
}

export class EscavacaoView {
  private readonly root = new THREE.Group();
  private readonly runes: THREE.Mesh[] = [];
  private readonly rings: THREE.Mesh[] = [];
  private readonly pitGlow: THREE.Sprite;
  private readonly lanterns: THREE.Sprite[] = [];
  // runa acesa no pé de cada pedestal de cajado (acende quando o cajado está lá)
  private readonly pedRunes: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
  private readonly rope: THREE.Mesh;

  constructor(private readonly c: TrCtx) {
    const [cx, cz] = c.T.ring.c;
    this.root.name = 'escavacao';
    const simple = c.q.simpleMaterials;
    const tex = c.tex;
    const stone = solid(tex, 'stone', 0x9a948a, simple);
    const stoneDark = solid(tex, 'stone', 0x5a554c, simple);
    const wood = solid(tex, 'woodDark', 0x9a7a54, simple);
    const woodLight = wood; // uma madeira só: menos chamadas de desenho
    const rope = solid(tex, 'woodDark', 0xc8b088, simple);
    const metal = solid(tex, 'rivet', 0x55524c, simple, 0.5, 0.5);
    const cloth = (color: number) => dbl(solid(tex, 'cloth', color, simple));

    // ---------- poço em degraus ----------
    // o chão é plano (o motor tem um andar só): o poço é só o que se vê pelo vão de 1,9 m de raio
    {
      const R = c.T.ring.hole;
      const m = new Merger();
      const steps = [R - 0.02, R - 0.45, R - 0.9, R - 1.3];
      const depth = [0, -1.6, -3.2, -4.8];
      for (let k = 0; k < steps.length - 1; k++) {
        // parede do degrau (vista de dentro) e o piso do degrau seguinte
        m.cyl(stoneDark, steps[k], steps[k], depth[k] - depth[k + 1], 24, 0, (depth[k] + depth[k + 1]) / 2, 0, 0, 0, true);
        m.geo(stone, polarRing(steps[k + 1], steps[k], 24, 6, depth[k + 1]));
      }
      m.geo(stoneDark, polarRing(0.01, steps[steps.length - 1], 24, 1, -5.6));
      const pit = m.build('escavacao-poco', false);
      // as paredes são cilindros abertos vistos de dentro: desenham as duas faces
      doubleSided(pit);
      pit.position.set(cx, 0, cz);
      this.root.add(pit);
      this.pitGlow = glowSprite(0x4fb8ff, 4.2, 0.55);
      this.pitGlow.position.set(cx, -4.6, cz);
      this.root.add(this.pitGlow);
    }

    // ---------- andaimes (2 lados) ----------
    for (const [ang, r] of [[20, 9.2], [200, 9.2]] as [number, number][]) {
      const a = (ang * Math.PI) / 180;
      const m = new Merger();
      const W = 3.0, D = 2.2, H = 3.4;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.span(wood, sx * W / 2 - 0.07, 0, sz * D / 2 - 0.07, sx * W / 2 + 0.07, H, sz * D / 2 + 0.07);
      // travessas em X nas duas faces compridas e vigas de topo
      for (const sz of [-1, 1]) {
        m.beam(wood, V(-W / 2, 0.2, sz * D / 2), V(W / 2, H - 0.2, sz * D / 2), 0.08);
        m.beam(wood, V(W / 2, 0.2, sz * D / 2), V(-W / 2, H - 0.2, sz * D / 2), 0.08);
        m.span(wood, -W / 2, 1.6, sz * D / 2 - 0.05, W / 2, 1.7, sz * D / 2 + 0.05);
      }
      // piso de tábuas no alto
      for (let k = 0; k < 6; k++) m.span(woodLight, -W / 2 - 0.1, H - 0.08, -D / 2 + k * (D / 6), W / 2 + 0.1, H, -D / 2 + (k + 1) * (D / 6) - 0.03);
      // escada encostada em um lado
      for (const sx of [-0.3, 0.3]) m.beam(wood, V(sx + 0.9, 0, D / 2 + 1.0), V(sx + 0.9, H, D / 2 + 0.1), 0.07);
      for (let k = 1; k < 8; k++) {
        const t = k / 8;
        m.span(wood, 0.6 + 0.9 - 0.3, t * H - 0.03, D / 2 + 1.0 - t * 0.9 - 0.03, 0.9 + 0.9 + 0.3 - 0.3, t * H + 0.03, D / 2 + 1.0 - t * 0.9 + 0.03);
      }
      // corda e balde no alto
      m.cyl(woodLight, 0.2, 0.15, 0.3, 8, -0.9, H + 0.15, 0.2);
      const g = m.build('escavacao-andaime');
      // de frente para o poço: a escada fica do lado de fora
      g.position.set(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r);
      g.rotation.y = -a - Math.PI / 2;
      this.root.add(g);
    }

    // ---------- guindaste de madeira apontando para o poço ----------
    {
      const m = new Merger();
      const ang = (160 * Math.PI) / 180;
      const bx = cx + Math.cos(ang) * 9, bz = cz + Math.sin(ang) * 9;
      const reach = Math.hypot(cx - bx, cz - bz);
      const mast = V(0, 6.2, 0);
      // mastro em A (duas pernas e um contrafortes) e a lança até o centro do poço, ao longo de +z
      for (const s of [-1, 1]) m.beam(wood, V(s * 0.9, 0, 0.6), mast, 0.2);
      m.beam(wood, V(0, 0, -1.0), mast, 0.2);
      m.span(wood, -0.9, 1.4, 0.55, 0.9, 1.5, 0.65);
      m.beam(woodLight, mast, V(0, 5.0, reach), 0.22);
      m.beam(wood, V(0, 6.2, -1.6), V(0, 0.2, -2.6), 0.07);
      m.span(metal, -0.35, 6.05, -0.3, 0.35, 6.35, 0.3);
      const g = m.build('escavacao-guindaste');
      // corda e balde pendurados da ponta da lança
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 4.2, 5), rope);
      cord.position.set(0, 5.0 - 2.1, reach);
      cord.name = 'escavacao-corda';
      const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.5, 10, 1, true), dbl(metal));
      bucket.position.set(0, 0.55, reach);
      g.add(cord, bucket);
      this.rope = cord;
      g.position.set(bx, 0, bz);
      g.rotation.y = Math.atan2(cx - bx, cz - bz);
      this.root.add(g);
    }

    // ---------- lonas em estacas, mesas de arqueólogo, lampiões, baldes e pás ----------
    for (const [ang, r, color] of [[290, 9.5, 0x9a8a68], [70, 9.5, 0x7a8068]] as [number, number, number][]) {
      const a = (ang * Math.PI) / 180;
      const m = new Merger();
      const mc = cloth(color);
      // quatro estacas e a lona inclinada
      for (const [sx, sz, h] of [[-1.5, -1.3, 2.5], [1.5, -1.3, 2.5], [-1.5, 1.3, 1.9], [1.5, 1.3, 1.9]]) m.span(wood, sx - 0.05, 0, sz - 0.05, sx + 0.05, h, sz + 0.05);
      const sheet = new THREE.PlaneGeometry(3.4, 3.0, 1, 1);
      sheet.rotateX(-Math.PI / 2 + 0.2);
      sheet.translate(0, 2.2, 0);
      m.geo(mc, sheet);
      // mesa de arqueólogo com caixotes e um papel
      m.span(woodLight, -1.0, 0.8, -0.4, 1.0, 0.86, 0.4);
      for (const sx of [-0.9, 0.9]) for (const sz of [-0.3, 0.3]) m.span(wood, sx - 0.04, 0, sz - 0.04, sx + 0.04, 0.8, sz + 0.04);
      // lampião em cima da mesa (a luz é só o brilho, sem luz real: poupa a placa de vídeo)
      m.cyl(metal, 0.07, 0.09, 0.2, 8, 0.7, 0.96, 0.1);
      // balde e pá encostada
      m.cyl(metal, 0.2, 0.15, 0.3, 10, -1.35, 0.15, 0.9);
      m.beam(woodLight, V(1.3, 0, 0.9), V(1.0, 1.4, 1.1), 0.05);
      m.span(metal, 1.1 - 0.12, 1.4, 1.1 - 0.02, 1.1 + 0.12, 1.56, 1.1 + 0.02);
      const g = m.build('escavacao-lona');
      g.position.set(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r);
      g.rotation.y = -a + Math.PI / 2;
      const lamp = glowSprite(0xffc27a, 1.6, 0.8);
      lamp.position.set(0.7, 1.15, 0.1);
      g.add(lamp);
      this.lanterns.push(lamp);
      this.root.add(g);
    }

    // ---------- runas no chão (3 círculos concêntricos que pulsam) ----------
    {
      const g = new THREE.Group();
      g.name = 'escavacao-runas';
      const rt = runeTexture();
      for (const r of [6.5, 7.85, 9.2]) {
        // um material por círculo: cada um pulsa em fase diferente (additive() reaproveitaria o mesmo)
        const mat = additive(0x9fe0ff, { map: rt, opacity: 0.6, fog: true }).clone();
        const mesh = new THREE.Mesh(polarRing(r - 0.32, r + 0.32, 96, Math.round(r * 2), 0.07), mat);
        mesh.renderOrder = 1;
        g.add(mesh);
        this.runes.push(mesh);
      }
      g.position.set(cx, 0, cz);
      this.root.add(g);
    }

    // ---------- 4 anéis de pedra em volta da Forja (parados até o ticket C6) ----------
    {
      const g = new THREE.Group();
      g.name = 'escavacao-aneis';
      const symbols = symbolTexture();
      const base = solid(tex, 'stone', 0x7a746a, simple);
      const bands: [number, number][] = [[2.8, 3.5], [3.6, 4.3], [4.4, 5.1], [5.2, 5.9]];
      // as bordas dos 4 anéis (paredes baixas em pedra lisa) viram uma malha só
      const edges = new Merger();
      bands.forEach(([a, b], i) => {
        const mat = simple ? new THREE.MeshLambertMaterial({ map: symbols, color: 0xbab4a8 }) : new THREE.MeshStandardMaterial({ map: symbols, color: 0xbab4a8, roughness: 0.9 });
        const geo = polarRing(a, b, 64, 4, 0.045);
        const ring = new THREE.Mesh(geo, mat);
        ring.name = `escavacao-anel-${i}`;
        ring.receiveShadow = true;
        g.add(ring);
        edges.cyl(base, a, a, 0.09, 64, 0, 0.045, 0, 0, 0, true);
        edges.cyl(base, b, b, 0.09, 64, 0, 0.045, 0, 0, 0, true);
        this.rings.push(ring);
      });
      const edgeMesh = edges.build('escavacao-aneis-bordas', false);
      doubleSided(edgeMesh);
      g.add(edgeMesh);
      g.position.set(cx, 0, cz);
      this.root.add(g);
    }

    // ---------- pedestais dos cajados: laje trabalhada e runa do elemento ----------
    {
      const g = new THREE.Group();
      g.name = 'escavacao-pedestais';
      const m = new Merger();
      const slab = solid(tex, 'stone', 0xa8a294, simple);
      for (const p of c.T.staffTable) {
        m.box(slab, 1.5, 0.08, 1.5, p.x, 0.04, p.z, Math.PI / 4);
        m.box(slab, 1.2, 0.08, 1.2, p.x, 0.12, p.z);
      }
      g.add(m.build('escavacao-pedestais-pedra'));
      for (const p of c.T.staffTable) {
        const mat = additive(ELEMENTS[p.el].hex, { opacity: 0.25, fog: true });
        const rune = new THREE.Mesh(new THREE.CircleGeometry(0.5, 4).rotateX(-Math.PI / 2).rotateY(Math.PI / 4), mat);
        rune.position.set(p.x, 0.17, p.z);
        rune.renderOrder = 1;
        g.add(rune);
        this.pedRunes.push({ mesh: rune, mat });
      }
      this.root.add(g);
    }

    c.scene.add(this.root);
  }

  update(tr: TrincheiraSnap, t: number) {
    // runas: uma onda de brilho que sai de dentro para fora (mais forte com a Forja erguida)
    const k = tr.forjaUp ? 1 : 0.55;
    this.runes.forEach((m, i) => {
      (m.material as THREE.MeshBasicMaterial).opacity = k * (0.35 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.7 - i * 1.3)));
    });
    (this.pitGlow.material as THREE.SpriteMaterial).opacity = (tr.forjaUp ? 0.25 : 0.55) + 0.12 * Math.sin(t * 2.3);
    this.lanterns.forEach((l, i) => ((l.material as THREE.SpriteMaterial).opacity = 0.7 + 0.15 * Math.sin(t * 7 + i * 2) + 0.08 * Math.sin(t * 13 + i)));
    // a corda do guindaste balança de leve
    this.rope.rotation.x = Math.sin(t * 0.9) * 0.015;
    // runa do pedestal acesa quando o cajado está lá
    this.c.T.staffTable.forEach((p, i) => {
      const st = tr.staffs[ELEMENT_LIST.indexOf(p.el)];
      const r = this.pedRunes[i];
      if (!st || !r) return;
      const on = st.st === 'pedestal';
      r.mat.opacity = on ? 0.9 + 0.1 * Math.sin(t * 3 + i) : 0.22;
    });
  }

  dispose() {
    this.root.removeFromParent();
  }
}
