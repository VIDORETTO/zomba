import * as THREE from 'three';
import { SKY_SUN_DIR } from '../mapView';
import { Merger, solid } from './common';
import type { TrCtx } from './ctx';

// Lama molhada (ticket B3): poças que refletem o céu, crateras rasas com água e tábuas jogadas por cima.
// Tudo é só desenho, sem colisão, em poucas chamadas: todas as poças e crateras viram UMA malha com um shader próprio.
// Os respingos da chuva ficam em weatherFx (`lama-respingos`).

const PUDDLE_V = /* glsl */ `
  attribute float aSeed;
  varying vec2 vUv; varying vec3 vW; varying float vSeed;
  void main() {
    vUv = uv; vSeed = aSeed;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
// reflexo do céu: o tom depende de quão rasa é a visada (o mesmo gradiente do céu), mais o brilho do sol; a borda é irregular
const PUDDLE_F = /* glsl */ `
  uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunDir; uniform vec3 uFog;
  uniform float uFogDensity; uniform float uTime; uniform float uRain;
  varying vec2 vUv; varying vec3 vW; varying float vSeed;
  void main() {
    vec2 p = vUv - 0.5;
    float d = length(p) * 2.0;
    float ang = atan(p.y, p.x);
    float edge = 0.8 + 0.14 * sin(ang * 3.0 + vSeed * 6.0) + 0.08 * sin(ang * 7.0 + vSeed * 11.0) + 0.05 * sin(ang * 13.0 + vSeed * 3.0);
    float a = 1.0 - smoothstep(edge - 0.2, edge, d);
    if (a < 0.01) discard;
    vec3 V = normalize(cameraPosition - vW);
    float ripple = uRain * 0.04 * sin(d * 34.0 - uTime * 7.0 + vSeed * 20.0);
    float h = clamp(V.y + ripple, 0.0, 1.0);
    vec3 col = mix(uHorizon, uTop, pow(h, 0.55)) * 0.85;
    vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
    float s = max(dot(R, uSunDir), 0.0);
    col += uSun * (pow(s, 24.0) * 0.8 + pow(s, 4.0) * 0.12);
    float dist = length(cameraPosition - vW);
    float f = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
    col = mix(col, uFog, f * 0.8);
    gl_FragColor = vec4(col, a * 0.88);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// sorteio determinístico (a mesma lama em toda partida)
const hash = (a: number, b: number, c: number) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export class LamaView {
  private readonly root = new THREE.Group();
  private readonly mat: THREE.ShaderMaterial;

  constructor(c: TrCtx) {
    const sf = c.map.surface;
    this.root.name = 'lama';
    this.mat = new THREE.ShaderMaterial({
      vertexShader: PUDDLE_V,
      fragmentShader: PUDDLE_F,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      uniforms: {
        uTop: { value: new THREE.Color(c.map.sky?.top ?? 0x34373b) },
        uHorizon: { value: new THREE.Color(c.map.fogColor ?? 0x6b6458) },
        uSun: { value: new THREE.Color(c.map.sky?.sun ?? 0xd8782e) },
        uSunDir: { value: SKY_SUN_DIR.clone() },
        uFog: { value: new THREE.Color(c.map.fogColor ?? 0x6b6458) },
        uFogDensity: { value: c.map.fogDensity ?? 0.014 },
        uTime: { value: 0 },
        uRain: { value: 0 },
      },
    });
    if (!sf) return;
    const simple = c.q.simpleMaterials;
    // pontos de lama longe dos geradores e do poço da Escavação
    const T = c.T;
    const free = (x: number, z: number) => T.gens.every((g) => Math.hypot(g.x - x, g.z - z) > g.r + 3) && Math.hypot(T.ring.c[0] - x, T.ring.c[1] - z) > T.ring.r + 1;
    const puddles: { x: number; z: number; sx: number; sz: number; yaw: number; seed: number }[] = [];
    const craters: { x: number; z: number; r: number }[] = [];
    const planks: { x: number; z: number; yaw: number }[] = [];
    for (let cz = 0; cz < sf.h; cz++) {
      for (let cx = 0; cx < sf.w; cx++) {
        if (sf.data[cz * sf.w + cx] !== 'm') continue;
        const x = sf.ox + cx + 0.5, z = sf.oz + cz + 0.5;
        const h = hash(cx, cz, 91);
        if (h < 0.011 && free(x, z)) {
          const sxz = 0.8 + hash(cx, cz, 92) * 1.6;
          puddles.push({ x, z, sx: sxz, sz: sxz * (0.55 + hash(cx, cz, 93) * 0.5), yaw: hash(cx, cz, 94) * Math.PI, seed: hash(cx, cz, 95) });
        } else if (h > 0.9965 && free(x, z)) craters.push({ x, z, r: 1.4 + hash(cx, cz, 96) * 1.4 });
        else if (hash(cx, cz, 97) > 0.992 && free(x, z)) planks.push({ x, z, yaw: hash(cx, cz, 98) * Math.PI });
      }
    }

    // poças e a água das crateras: uma malha, um shader
    const geos: THREE.BufferGeometry[] = [];
    const addDisc = (x: number, z: number, sx: number, sz: number, yaw: number, seed: number) => {
      const g = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2).toNonIndexed();
      g.scale(sx, 1, sz);
      g.rotateY(yaw);
      g.translate(x, 0.03, z);
      g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(seed), 1));
      geos.push(g);
    };
    for (const p of puddles) addDisc(p.x, p.z, p.sx, p.sz, p.yaw, p.seed);
    for (const k of craters) addDisc(k.x, k.z, k.r * 0.95, k.r * 0.95, 0, hash(Math.round(k.x), Math.round(k.z), 99));
    const merged = mergeBuffers(geos);
    const pud = new THREE.Mesh(merged, this.mat);
    pud.name = 'lama-pocas';
    pud.frustumCulled = false;
    pud.renderOrder = 1;
    this.root.add(pud);

    // crateras rasas: aro de lama levantada em volta da água
    {
      const m = new Merger();
      const mud = solid(c.tex, 'mud', 0xffffff, simple);
      for (const k of craters) {
        const geo = new THREE.LatheGeometry([
          new THREE.Vector2(k.r * 2.0, 0.0), new THREE.Vector2(k.r * 1.7, 0.06), new THREE.Vector2(k.r * 1.25, 0.3), new THREE.Vector2(k.r * 1.02, 0.18), new THREE.Vector2(k.r * 0.9, 0.0),
        ], 16).toNonIndexed();
        geo.translate(k.x, 0.0, k.z);
        m.geo(mud, geo);
      }
      const g = m.build('lama-crateras', false);
      g.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh) mesh.material = (mesh.material as THREE.Material).clone(), ((mesh.material as THREE.Material).side = THREE.DoubleSide); });
      this.root.add(g);
    }

    // tábuas jogadas por cima da lama
    {
      const m = new Merger();
      const wood = solid(c.tex, 'rotWood', 0xd0b898, simple);
      for (const p of planks) {
        const n = 2 + Math.floor(hash(Math.round(p.x), Math.round(p.z), 100) * 3);
        for (let i = 0; i < n; i++) {
          m.box(wood, 0.26, 0.05, 2.2 + hash(i, Math.round(p.x), 101) * 0.8, p.x + Math.cos(p.yaw + 1.57) * i * 0.3, 0.045, p.z + Math.sin(p.yaw + 1.57) * i * 0.3, p.yaw + (hash(i, Math.round(p.z), 102) - 0.5) * 0.12, (hash(i, 3, 5) - 0.5) * 0.06, 0);
        }
      }
      this.root.add(m.build('lama-tabuas', false));
    }
    c.scene.add(this.root);
  }

  update(t: number, rain: number, fogColor: THREE.Color, fogDensity: number) {
    const u = this.mat.uniforms;
    u.uTime.value = t;
    u.uRain.value = rain;
    u.uFog.value.copy(fogColor);
    u.uHorizon.value.copy(fogColor);
    u.uFogDensity.value = fogDensity;
  }

  dispose() {
    this.root.removeFromParent();
    this.mat.dispose();
  }
}

function mergeBuffers(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const total = list.reduce((a, g) => a + g.getAttribute('position').count, 0);
  const pos = new Float32Array(total * 3), uv = new Float32Array(total * 2), seed = new Float32Array(total);
  let o = 0;
  for (const g of list) {
    const n = g.getAttribute('position').count;
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    uv.set(g.getAttribute('uv').array as Float32Array, o * 2);
    seed.set(g.getAttribute('aSeed').array as Float32Array, o);
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  return out;
}
