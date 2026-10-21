import * as THREE from 'three';
import type { GameEvent, TrGen } from '../../shared/protocol';
import { additive, beamMesh, clamp01, flatRing, glowSprite, glowTex, Merger, smooth, solid } from './common';
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
  // anel de progresso no chão (uniformes: uP = quanto já encheu, uBack = 1 quando o progresso está voltando)
  prog: THREE.Mesh;
  lastProg: number;
  // cordão de lâmpadas: segundos desde que ligou (as lâmpadas acendem em sequência ao longo de LAMP_TIME)
  lampT: number;
  lit: number;
}

const LAMPS_PER_GEN = 20;
const LAMP_TIME = 1.5;
const PROG_V = /* glsl */ `
  varying vec2 vP;
  void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PROG_F = /* glsl */ `
  uniform float uP; uniform float uBack; uniform float uOpacity;
  varying vec2 vP;
  void main() {
    float a = atan(vP.y, vP.x) / 6.2831853 + 0.5;
    float fill = step(a, uP);
    vec3 col = mix(vec3(0.35, 0.95, 1.0), vec3(1.0, 0.22, 0.15), uBack);
    gl_FragColor = vec4(col, (0.18 + 0.72 * fill) * uOpacity);
  }`;

const OFF = new THREE.Color(0xff8a30);
const ON = new THREE.Color(0x4fe8ff);

// Geradores: círculo de captura no chão, parede de progresso, lâmpadas quentes e feixe ciano que sobe ao céu quando ligado.
export class GeneratorView {
  private readonly gens: GenFx[] = [];
  private readonly wallGeo: THREE.CylinderGeometry;
  private readonly bulbs: THREE.InstancedMesh;
  private readonly halos: THREE.Points;
  private readonly haloCol: THREE.BufferAttribute;

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
      // anel de progresso: gira ao redor do círculo de captura e enche conforme a captura anda
      const prog = new THREE.Mesh(
        new THREE.RingGeometry(g.r - 0.1, g.r + 0.25, 72).rotateX(-Math.PI / 2),
        new THREE.ShaderMaterial({ vertexShader: PROG_V, fragmentShader: PROG_F, uniforms: { uP: { value: 0 }, uBack: { value: 0 }, uOpacity: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      prog.name = `gerador-progresso-${this.gens.length}`;
      prog.position.y = 0.09;
      prog.renderOrder = 1;
      prog.visible = false;
      group.add(ring, alert, wall, beam, glow, prog);
      c.scene.add(group);
      this.gens.push({ group, ring, wall, beam, glow, alert, lamps, on: 0, prog, lastProg: 0, lampT: 0, lit: 0 });
    }
    // cordões de lâmpadas em volta de cada área: 4 postes e 4 arcos com 5 lâmpadas (uma malha instanciada para todos)
    const lampsGroup = new THREE.Group();
    lampsGroup.name = 'gerador-lampadas';
    const posts = new Merger();
    const wood = solid(c.tex, 'woodDark', 0x8a6a48, c.q.simpleMaterials);
    const wire: number[] = [];
    const bulbPos: THREE.Vector3[] = [];
    for (const g of c.T.gens) {
      const R = g.r + 2.0, H = 3.4;
      const post = (k: number) => new THREE.Vector3(g.x + Math.cos(Math.PI / 4 + (k * Math.PI) / 2) * R, H, g.z + Math.sin(Math.PI / 4 + (k * Math.PI) / 2) * R);
      for (let k = 0; k < 4; k++) {
        const a = post(k), b = post(k + 1);
        posts.span(wood, a.x - 0.06, 0, a.z - 0.06, a.x + 0.06, H + 0.1, a.z + 0.06);
        let prev = a;
        for (let j = 1; j <= 6; j++) {
          const t = j / 6;
          const p = new THREE.Vector3(a.x + (b.x - a.x) * t, H - 0.45 * (1 - (2 * t - 1) ** 2), a.z + (b.z - a.z) * t);
          wire.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
          prev = p;
          if (j < 6) bulbPos.push(p.clone().setY(p.y - 0.1));
        }
      }
    }
    lampsGroup.add(posts.build('gerador-postes', false));
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(wire, 3)), new THREE.LineBasicMaterial({ color: 0x1a1612 }));
    lines.frustumCulled = false;
    lampsGroup.add(lines);
    this.bulbs = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbPos.length);
    bulbPos.forEach((p, i) => {
      this.bulbs.setMatrixAt(i, new THREE.Matrix4().setPosition(p));
      this.bulbs.setColorAt(i, new THREE.Color(0x2a2018));
    });
    this.bulbs.frustumCulled = false;
    lampsGroup.add(this.bulbs);
    const hpos = new Float32Array(bulbPos.length * 3);
    bulbPos.forEach((p, i) => p.toArray(hpos, i * 3));
    const hgeo = new THREE.BufferGeometry();
    hgeo.setAttribute('position', new THREE.BufferAttribute(hpos, 3));
    this.haloCol = new THREE.BufferAttribute(new Float32Array(bulbPos.length * 3), 3);
    hgeo.setAttribute('color', this.haloCol);
    this.halos = new THREE.Points(hgeo, new THREE.PointsMaterial({ map: glowTex(), size: 1.3, sizeAttenuation: true, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.halos.frustumCulled = false;
    this.halos.renderOrder = 2;
    lampsGroup.add(this.halos);
    c.scene.add(lampsGroup);
  }

  // quantas lâmpadas do cordão do gerador i estão acesas / quantas ele tem
  lampsLit(i: number) {
    return this.gens[i]?.lit ?? 0;
  }
  lampsTotal(_i: number) {
    return LAMPS_PER_GEN;
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
      // anel de progresso: enche com a captura; vermelho quando o progresso está voltando
      const pu = (v.prog.material as THREE.ShaderMaterial).uniforms;
      v.prog.visible = s.capturing || (s.progress > 0.01 && !s.on);
      pu.uP.value = s.progress;
      if (s.capturing) pu.uBack.value = s.progress < v.lastProg - 1e-4 ? 1 : 0;
      else if (s.progress < v.lastProg - 1e-4) pu.uBack.value = 1;
      else if (s.progress === 0) pu.uBack.value = 0;
      pu.uOpacity.value = 0.9;
      v.lastProg = s.progress;
      // cordão de lâmpadas: acende uma a uma em 1,5 s depois que o gerador liga e apaga de uma vez ao desligar
      if (s.on) v.lampT += dt;
      else v.lampT = 0;
      const lit = s.on ? Math.min(LAMPS_PER_GEN, Math.floor(((v.lampT + 1e-6) / LAMP_TIME) * LAMPS_PER_GEN) + (v.lampT > 0 ? 1 : 0)) : 0;
      if (lit !== v.lit) {
        v.lit = lit;
        this.lampsDirty = true;
      }
      // parede de progresso
      v.wall.visible = s.capturing || (s.progress > 0.01 && !s.on);
      if (v.wall.visible) {
        v.wall.scale.set(g.r, 0.2 + s.progress * 3.2, g.r);
        (v.wall.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.1 * Math.sin(t * 9);
      }
      // motor do gerador: ronco contínuo enquanto liga (só se ouve de perto); falha quando os Cruzados o atacam
      this.c.snd.genLoop(i, new THREE.Vector3(g.x, 1.5, g.z), s.on ? (s.attacked ? 'falha' : 'liga') : null);
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
    this.paintLamps();
  }

  private lampsDirty = true;
  private readonly cOff = new THREE.Color(0x2a2018);
  private readonly cOn = new THREE.Color(0xffe2a0).multiplyScalar(1.6);

  // pinta as lâmpadas acesas (só quando algo mudou)
  private paintLamps() {
    if (!this.lampsDirty) return;
    this.lampsDirty = false;
    const per = this.bulbs.count / this.gens.length;
    this.gens.forEach((v, gi) => {
      for (let k = 0; k < per; k++) {
        const i = gi * per + k;
        const on = k < v.lit;
        this.bulbs.setColorAt(i, on ? this.cOn : this.cOff);
        const a = on ? 0.85 : 0;
        this.haloCol.setXYZ(i, 1.0 * a, 0.78 * a, 0.42 * a);
      }
    });
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
    this.haloCol.needsUpdate = true;
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
