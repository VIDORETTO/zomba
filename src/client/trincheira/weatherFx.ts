import * as THREE from 'three';
import type { Weather } from '../../shared/protocol';
import type { Snd } from './common';

const BOX = new THREE.Vector3(48, 30, 48);

const RAIN_V = /* glsl */ `
  attribute vec4 aSeed;
  attribute float aTip;
  uniform float uTime; uniform float uK; uniform vec3 uCam; uniform vec3 uBox;
  varying float vA;
  void main() {
    vec3 s = aSeed.xyz;
    float fall = fract(s.y - uTime * 0.85);
    vec3 p;
    p.x = uCam.x + (fract((s.x * uBox.x - uCam.x) / uBox.x) - 0.5) * uBox.x;
    p.z = uCam.z + (fract((s.z * uBox.z - uCam.z) / uBox.z) - 0.5) * uBox.z;
    p.y = uCam.y + (fall - 0.5) * uBox.y + 4.0;
    p.x -= (fall - 0.5) * 3.0;
    p += aTip * vec3(0.35, 1.0, 0.18) * 0.9;
    float vis = step(aSeed.w, uK);
    vA = vis * (1.0 - aTip * 0.7);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
  }`;
const RAIN_F = /* glsl */ `
  varying float vA;
  void main() { gl_FragColor = vec4(0.75, 0.82, 0.92, 0.38 * vA); }`;

const SNOW_V = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime; uniform float uK; uniform vec3 uCam; uniform vec3 uBox; uniform float uScale;
  varying float vA;
  void main() {
    vec3 s = aSeed.xyz;
    float fall = fract(s.y - uTime * 0.045);
    vec3 p;
    p.x = uCam.x + (fract((s.x * uBox.x - uCam.x) / uBox.x) - 0.5) * uBox.x + sin(uTime * 0.9 + s.z * 40.0) * 0.8;
    p.z = uCam.z + (fract((s.z * uBox.z - uCam.z) / uBox.z) - 0.5) * uBox.z + cos(uTime * 0.7 + s.x * 40.0) * 0.8;
    p.y = uCam.y + (fall - 0.5) * uBox.y + 5.0;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    float d = max(0.5, -mv.z);
    gl_PointSize = clamp((0.09 + aSeed.w * 0.05) * uScale / d, 1.0, 14.0);
    vA = step(aSeed.w, uK) * (1.0 - smoothstep(18.0, 30.0, d));
    gl_Position = projectionMatrix * mv;
  }`;
const SNOW_F = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(0.95, 0.97, 1.0, vA * (1.0 - d * d) * 0.9);
  }`;

// respingos da chuva no chão: anéis que crescem e somem, sorteados ao redor da câmera (tudo na placa de vídeo)
const SPLASH_V = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime; uniform float uK; uniform vec3 uCam; uniform vec3 uBox; uniform float uScale;
  varying float vA;
  void main() {
    vec3 s = aSeed.xyz;
    float ph = fract(uTime * (0.8 + s.y * 0.5) + s.x * 7.0);
    vec3 p;
    p.x = uCam.x + (fract((s.x * uBox.x - uCam.x) / uBox.x) - 0.5) * uBox.x;
    p.z = uCam.z + (fract((s.z * uBox.z - uCam.z) / uBox.z) - 0.5) * uBox.z;
    p.y = 0.04;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    float d = max(0.5, -mv.z);
    gl_PointSize = clamp((0.25 + ph * 0.9) * uScale / d, 1.0, 40.0);
    vA = step(aSeed.w, uK) * (1.0 - ph) * (1.0 - smoothstep(14.0, 26.0, d));
    gl_Position = projectionMatrix * mv;
  }`;
const SPLASH_F = /* glsl */ `
  varying float vA;
  void main() {
    // elipse achatada (anel visto do chão); sem teste de profundidade, a metade de baixo não some dentro do chão
    vec2 q = (gl_PointCoord - 0.5) * 2.0;
    float d = length(vec2(q.x, q.y * 2.4));
    float ring = smoothstep(0.45, 0.7, d) * (1.0 - smoothstep(0.82, 1.0, d));
    gl_FragColor = vec4(0.82, 0.88, 0.95, ring * vA * 0.55);
  }`;

// Chuva (riscos) e neve (flocos) em volta da câmera: tudo calculado na placa de vídeo, sem trabalho por partícula na CPU.
export class WeatherFx {
  private readonly rain: THREE.LineSegments;
  private readonly snow: THREE.Points;
  private readonly splash: THREE.Points;
  private readonly splashMat: THREE.ShaderMaterial;
  private readonly rainMat: THREE.ShaderMaterial;
  private readonly snowMat: THREE.ShaderMaterial;
  private rainK = 0;
  private snowK = 0;
  // neve no chão: sobe devagar enquanto neva (cheia em 80 s) e derrete em uns 60 s depois
  private ground = 0;
  private current: Weather = 'limpo';
  private scale = 600;

  constructor(scene: THREE.Scene, density: number, private readonly snd: Snd) {
    const nRain = Math.round(900 * Math.max(0.35, density));
    const nSnow = Math.round(1100 * Math.max(0.35, density));
    const mk = (n: number, tips: boolean) => {
      const geo = new THREE.BufferGeometry();
      const per = tips ? 2 : 1;
      const seed = new Float32Array(n * per * 4);
      const tip = new Float32Array(n * per);
      const pos = new Float32Array(n * per * 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random(), b = Math.random(), c = Math.random(), d = Math.random();
        for (let k = 0; k < per; k++) {
          const o = (i * per + k) * 4;
          seed[o] = a;
          seed[o + 1] = b;
          seed[o + 2] = c;
          seed[o + 3] = d;
          tip[i * per + k] = k;
        }
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
      geo.setAttribute('aTip', new THREE.BufferAttribute(tip, 1));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
      return geo;
    };
    const u = () => ({ uTime: { value: 0 }, uK: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: BOX.clone() }, uScale: { value: this.scale } });
    this.rainMat = new THREE.ShaderMaterial({ vertexShader: RAIN_V, fragmentShader: RAIN_F, uniforms: u(), transparent: true, depthWrite: false });
    this.snowMat = new THREE.ShaderMaterial({ vertexShader: SNOW_V, fragmentShader: SNOW_F, uniforms: u(), transparent: true, depthWrite: false });
    this.rain = new THREE.LineSegments(mk(nRain, true), this.rainMat);
    this.snow = new THREE.Points(mk(nSnow, false), this.snowMat);
    this.splashMat = new THREE.ShaderMaterial({ vertexShader: SPLASH_V, fragmentShader: SPLASH_F, uniforms: u(), transparent: true, depthWrite: false, depthTest: false });
    this.splashMat.uniforms.uBox.value.set(34, 1, 34);
    this.splash = new THREE.Points(mk(Math.round(260 * Math.max(0.35, density)), false), this.splashMat);
    this.splash.name = 'lama-respingos';
    for (const o of [this.rain, this.snow, this.splash]) {
      o.frustumCulled = false;
      o.renderOrder = 6;
      o.visible = false;
      scene.add(o);
    }
  }

  resize(pxHeight: number, fovDeg: number) {
    this.scale = pxHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
    this.snowMat.uniforms.uScale.value = this.scale;
    this.splashMat.uniforms.uScale.value = this.scale;
  }

  // 0 a 1 de quanto chove
  get rainAmount() {
    return this.rainK;
  }

  // 0 a 1 de quanto a neve cobre o chão (para o mapa)
  get snowAmount() {
    return this.snowK;
  }

  // 0 a 1 de quanto a neve já se acumulou no chão
  get snowGround() {
    return this.ground;
  }

  setWeather(w: Weather) {
    if (w === this.current) return;
    this.current = w;
    this.snd.weather(w);
  }

  update(dt: number, t: number, cam: THREE.Vector3) {
    this.rainK += ((this.current === 'chuva' ? 1 : 0) - this.rainK) * Math.min(1, dt * 0.6);
    this.snowK += ((this.current === 'neve' ? 1 : 0) - this.snowK) * Math.min(1, dt * 0.35);
    this.ground = Math.max(0, Math.min(1, this.ground + (this.current === 'neve' ? dt / 80 : -dt / 60)));
    for (const [obj, mat, k] of [[this.rain, this.rainMat, this.rainK], [this.snow, this.snowMat, this.snowK], [this.splash, this.splashMat, this.rainK]] as const) {
      obj.visible = k > 0.01;
      if (!obj.visible) continue;
      mat.uniforms.uTime.value = t;
      mat.uniforms.uK.value = k;
      mat.uniforms.uCam.value.copy(cam);
    }
  }

  dispose() {
    for (const o of [this.rain, this.snow, this.splash]) {
      o.removeFromParent();
      o.geometry.dispose();
    }
    this.rainMat.dispose();
    this.snowMat.dispose();
    this.splashMat.dispose();
  }
}
