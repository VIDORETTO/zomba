import * as THREE from 'three';
import type { Weather } from '../../shared/protocol';
import { glowSprite } from './common';
import type { TrCtx } from './ctx';

// Céu e clima de Origins: nuvens pesadas que andam devagar, relâmpagos com trovão atrasado, clarões de artilharia no
// horizonte (agora sincronizados com o som `artilharia-longe`), colunas de fumaça fixas fora do mapa e sinalizadores
// vermelhos que caem devagar. Tudo é só visual: os sorteios usam o Math.random do navegador (não mexem na simulação).

const SOUND_SPEED = 343;

let cloudTex: THREE.CanvasTexture | null = null;
// ruído de nuvens que se repete nas bordas (soma de oitavas de ruído de valor)
function cloudTexture(): THREE.CanvasTexture {
  if (cloudTex) return cloudTex;
  const N = 256;
  let seed = 11;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const grid = (n: number) => Float32Array.from({ length: n * n }, () => rnd());
  const octaves = [[4, 0.5], [8, 0.27], [16, 0.15], [32, 0.08]].map(([n, w]) => ({ n, w, g: grid(n) }));
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const sample = (o: { n: number; g: Float32Array }, x: number, y: number) => {
    const fx = x * o.n, fy = y * o.n;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = smooth(fx - x0), ty = smooth(fy - y0);
    const at = (i: number, j: number) => o.g[(((j % o.n) + o.n) % o.n) * o.n + (((i % o.n) + o.n) % o.n)];
    return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
  };
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let v = 0;
      for (const o of octaves) v += sample(o, x / N, y / N) * o.w;
      const b = Math.max(0, Math.min(255, Math.round(v * 255)));
      const i = (y * N + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  cloudTex = new THREE.CanvasTexture(c);
  cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
  return cloudTex;
}

// coluna de fumaça: mais densa embaixo, some em cima, borda macia
let columnTex: THREE.CanvasTexture | null = null;
function columnTexture(): THREE.CanvasTexture {
  if (columnTex) return columnTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 256, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 256);
  columnTex = new THREE.CanvasTexture(c);
  return columnTex;
}

interface Pending {
  at: number;
  name: 'trovao' | 'artilharia-longe';
  pos: THREE.Vector3;
}

const R = (a: number, b: number) => a + Math.random() * (b - a);

// quatro colunas de fumaça de frentes de batalha distantes (fora do mapa, que vai de x -130 a 200 e z -86 a 86)
const COLUMNS: [number, number, number][] = [[-250, -70, 150], [-230, 130, 120], [290, -110, 170], [300, 90, 130]];

export class SkyFx {
  readonly stats = { lightning: 0, shells: 0, flares: 0 };
  // clarão atual do céu (0 a 1): o jogo o soma à luz do mapa
  flash = 0;
  private readonly clouds: THREE.Mesh;
  private readonly cloudMat: THREE.ShaderMaterial;
  private readonly columns: THREE.InstancedMesh;
  private readonly flare = new THREE.Group();
  private readonly flareGlow: THREE.Sprite;
  private readonly horizonGlow: THREE.Sprite;
  private lightT = R(10, 25);
  private shellT = R(8, 20);
  private flareT = R(25, 45);
  private boltAge = 99;
  private shellAge = 99;
  private flareAge = -1;
  private flarePos = new THREE.Vector3();
  private clock = 0;
  private readonly pending: Pending[] = [];
  private readonly mat4 = new THREE.Matrix4();
  private darkK = 0;

  constructor(private readonly c: TrCtx) {
    const scene = c.scene;
    // nuvens: um disco grande sobre a câmera, com ruído que anda com o vento; escurece com a chuva
    this.cloudMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        map: { value: cloudTexture() },
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector2() },
        uDark: { value: 0 },
        uFlash: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vXZ;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vXZ = w.xz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform float uTime; uniform vec2 uCam; uniform float uDark; uniform float uFlash;
        varying vec2 vXZ;
        void main() {
          vec2 d = vXZ - uCam;
          float r = length(d) / 470.0;
          vec2 uv = vXZ * 0.0032 + vec2(uTime * 0.0042, uTime * 0.0016);
          float n = texture2D(map, uv).r * 0.65 + texture2D(map, uv * 2.7 + 0.37).r * 0.35;
          float a = smoothstep(0.42 - uDark * 0.12, 0.78, n) * (1.0 - smoothstep(0.7, 1.0, r)) * (0.78 + uDark * 0.2);
          // lado de baixo escuro e chumbo; perto do horizonte pega a cor do poente
          vec3 lead = mix(vec3(0.17, 0.17, 0.18), vec3(0.07, 0.07, 0.08), uDark);
          vec3 warm = vec3(0.46, 0.2, 0.1);
          vec3 col = mix(lead, warm, smoothstep(0.35, 0.95, r) * 0.7);
          col += vec3(0.55, 0.6, 0.75) * uFlash * (0.5 + n * 0.5);
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.clouds = new THREE.Mesh(new THREE.CircleGeometry(470, 40).rotateX(-Math.PI / 2), this.cloudMat);
    this.clouds.name = 'ceu-nuvens';
    this.clouds.renderOrder = 0;
    this.clouds.frustumCulled = false;
    scene.add(this.clouds);

    // colunas de fumaça: 4 instâncias de um cilindro aberto
    const geo = new THREE.CylinderGeometry(9, 15, 1, 12, 1, true).translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ map: columnTexture(), color: 0x2a2623, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.columns = new THREE.InstancedMesh(geo, mat, COLUMNS.length);
    this.columns.name = 'fumaca-colunas';
    this.columns.frustumCulled = false;
    this.columns.renderOrder = 1;
    scene.add(this.columns);
    this.placeColumns(0);

    // sinalizador: ponto vermelho com brilho (some quando não há nenhum no ar)
    this.flare.name = 'sinalizador';
    this.flare.visible = false;
    this.flareGlow = glowSprite(0xff3a2a, 14, 0.9);
    const core = glowSprite(0xffd8c0, 3.2, 1);
    this.flare.add(this.flareGlow, core);
    scene.add(this.flare);

    // clarão de artilharia no horizonte
    this.horizonGlow = glowSprite(0xff9a50, 160, 0);
    this.horizonGlow.name = 'artilharia-clarao';
    scene.add(this.horizonGlow);
  }

  private placeColumns(t: number) {
    COLUMNS.forEach(([x, z, h], i) => {
      const sway = 1 + 0.06 * Math.sin(t * 0.25 + i * 1.7);
      this.mat4.makeScale(sway, h, sway).setPosition(x, 0, z);
      this.columns.setMatrixAt(i, this.mat4);
    });
    this.columns.instanceMatrix.needsUpdate = true;
  }

  update(dt: number, t: number, cam: THREE.Vector3, weather: Weather) {
    this.clock += dt;
    // nuvens
    this.clouds.position.set(cam.x, cam.y + 115, cam.z);
    this.darkK += ((weather === 'chuva' ? 1 : weather === 'neve' ? 0.35 : 0) - this.darkK) * Math.min(1, dt * 0.3);
    this.cloudMat.uniforms.uTime.value = t;
    this.cloudMat.uniforms.uCam.value.set(cam.x, cam.z);
    this.cloudMat.uniforms.uDark.value = this.darkK;
    this.placeColumns(t);

    // relâmpago: a cada 15 a 40 s (na chuva, 6 a 15 s)
    this.lightT -= dt;
    if (this.lightT <= 0) {
      this.lightT = weather === 'chuva' ? R(6, 15) : R(15, 40);
      this.strike(cam);
    }
    // clarão do céu: 0,15 s (um pico curto e a queda rápida)
    this.boltAge += dt;
    this.shellAge += dt;
    let f = 0;
    if (this.boltAge < 0.15) f = this.boltAge < 0.05 ? 1 : 1 - (this.boltAge - 0.05) / 0.1;
    if (this.shellAge < 0.3) f = Math.max(f, 0.18 * (1 - this.shellAge / 0.3));
    this.flash = f;
    this.cloudMat.uniforms.uFlash.value = f;
    (this.horizonGlow.material as THREE.SpriteMaterial).opacity = this.shellAge < 0.35 ? 0.85 * (1 - this.shellAge / 0.35) : 0;

    // artilharia ao longe: clarão no horizonte e o som chega depois
    this.shellT -= dt;
    if (this.shellT <= 0) {
      this.shellT = R(20, 50);
      this.shell(cam);
    }

    // sinalizador: a cada 30 a 60 s, cai devagar com luz vermelha
    this.flareT -= dt;
    if (this.flareT <= 0 && this.flareAge < 0) {
      this.flareT = R(30, 60);
      this.flareAge = 0;
      const a = Math.random() * Math.PI * 2, d = R(120, 220);
      this.flarePos.set(cam.x + Math.cos(a) * d, 105, cam.z + Math.sin(a) * d);
      this.stats.flares++;
    }
    if (this.flareAge >= 0) {
      this.flareAge += dt;
      this.flarePos.y -= 4.2 * dt;
      this.flarePos.x += 1.4 * dt;
      this.flare.visible = true;
      this.flare.position.copy(this.flarePos);
      const fade = Math.min(1, this.flareAge / 1.2) * Math.max(0, Math.min(1, (24 - this.flareAge) / 3));
      (this.flareGlow.material as THREE.SpriteMaterial).opacity = 0.85 * fade * (0.8 + 0.2 * Math.sin(t * 17));
      this.c.fx.stream('sinalizador', dt, 12, () => ({
        x: this.flarePos.x + (Math.random() - 0.5) * 0.6, y: this.flarePos.y - 0.4, z: this.flarePos.z + (Math.random() - 0.5) * 0.6,
        vx: 0, vy: -0.5, vz: 0, life: 2.2, size: 2.2, color: 0xff5a3a, alpha: 0.35 * fade, grow: 0.6,
      }));
      if (this.flareAge > 24) {
        this.flareAge = -1;
        this.flare.visible = false;
      }
    }

    // trovões e estrondos atrasados pela distância
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.clock >= this.pending[i].at) {
        const p = this.pending[i];
        this.c.snd.play(p.name, p.pos, p.name === 'trovao' ? 1 : 1);
        this.pending.splice(i, 1);
      }
    }
  }

  // relâmpago: clarão na hora e trovão depois (a luz viaja, o som demora)
  strike(cam: THREE.Vector3) {
    this.stats.lightning++;
    this.boltAge = 0;
    const a = Math.random() * Math.PI * 2, d = R(250, 1400);
    const pos = new THREE.Vector3(cam.x + Math.cos(a) * Math.min(d, 120), 20, cam.z + Math.sin(a) * Math.min(d, 120));
    this.pending.push({ at: this.clock + d / SOUND_SPEED, name: 'trovao', pos });
  }

  shell(cam: THREE.Vector3) {
    this.stats.shells++;
    const a = Math.random() * Math.PI * 2, d = R(250, 420);
    this.shellAge = 0;
    this.horizonGlow.position.set(cam.x + Math.cos(a) * 380, 14, cam.z + Math.sin(a) * 380);
    this.pending.push({ at: this.clock + d / SOUND_SPEED, name: 'artilharia-longe', pos: new THREE.Vector3(cam.x + Math.cos(a) * 110, 12, cam.z + Math.sin(a) * 110) });
  }

  dispose() {
    for (const o of [this.clouds, this.columns, this.flare, this.horizonGlow]) o.removeFromParent();
    this.clouds.geometry.dispose();
    this.cloudMat.dispose();
    this.columns.dispose();
  }
}
