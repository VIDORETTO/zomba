import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { MapDef } from '../shared/map/types';
import type { NetZombie, Snapshot } from '../shared/protocol';
import { lerp } from '../shared/rng';
import type { AudioEngine } from './audio';
import { BusView } from './busView';
import { FogBanks, FoliageView } from './foliageView';
import { FX } from './fx';
import { freeScene } from './free';
import { gradePass } from './grade';
import { setSimpleMaterials } from './humanoid';
import { FOG_DENSITY, buildMapView, type MapView } from './mapView';
import type { QualityConfig } from './quality';
import type { BufferedSnap, Sample } from './snapbuffer';
import { particleTexture, type TexSet } from './textures';
import { ZombieManager } from './zombies';

type V3 = [number, number, number];

// Um plano de câmera: anda de "from" até "to" olhando de "look" até "lookTo".
// Os zumbis andam de "walk[0]" até "walk[1]" (espalhados para os lados), sempre recomeçando.
interface Shot {
  from: V3;
  to: V3;
  look: V3;
  lookTo: V3;
  walk?: [[number, number], [number, number]];
  // 0 = parada (névoa de entardecer), 1 = estrada (névoa fechada); só o Rota usa
  road?: number;
}

const SHOT_TIME = 14;
const FADE = 1.2;

const SHOTS: Record<string, Shot[]> = {
  cidade: [
    // o cruzamento com a fenda de lava, zumbis vindo pela rua
    { from: [-9, 1.9, 17], to: [-4, 2.3, 14.5], look: [0, 0.9, 0], lookTo: [2, 1.2, -6], walk: [[0, -34], [0, -4]] },
    // cemitério nos fundos da Igreja
    { from: [45, 1.6, 41], to: [42, 2.0, 40], look: [36, 1.0, 33], lookTo: [33, 1.8, 27], walk: [[30, 26], [38, 36]] },
    // rua principal vista de longe, fogo dos carros
    { from: [1.5, 1.7, -42], to: [1.5, 2.0, -31], look: [-1, 1.8, 0], lookTo: [0, 1.6, 6], walk: [[0, 4], [0, -26]] },
  ],
  rota: [
    // a Rodoviária com o ônibus parado
    { from: [30, 1.9, 5], to: [21, 2.4, 6], look: [2, 2.6, -10], lookTo: [-4, 2.4, -9], walk: [[-30, 2.5], [12, 2.5]], road: 0 },
    // a estrada no meio da névoa
    { from: [-42, 1.7, -3], to: [-56, 1.8, -12], look: [-80, 1.2, -40], lookTo: [-92, 1.2, -55], walk: [[-95, -62], [-62, -20]], road: 1 },
    // a Usina
    { from: [-70, 2.2, 255], to: [-61, 2.7, 254], look: [-44, 4, 244], lookTo: [-38, 4, 243], walk: [[-22, 251], [-56, 249]], road: 0 },
  ],
};

// Som desligado: o menu reaproveita os zumbis do jogo sem gemidos.
const SILENT = new Proxy({}, { get: () => () => undefined }) as AudioEngine;

// Fundo do menu: o mapa escolhido com a câmera passando devagar, fogo, névoa e alguns zumbis andando.
export class MenuScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly grade: ShaderPass;
  private readonly mapView: MapView;
  private readonly foliage: FoliageView;
  private readonly fogBanks: FogBanks | null = null;
  private readonly fx: FX;
  private readonly zombies: ZombieManager;
  private readonly bus: BusView | null = null;
  private readonly shots: Shot[];
  private readonly walkers: { look: number; side: number; k: number; speed: number }[] = [];
  private shot = 0;
  private shotT = 0;
  private t = 0;
  private raf = 0;
  private last = 0;
  private running = false;
  private disposed = false;
  private readonly look = new THREE.Vector3();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    readonly map: MapDef,
    private readonly tex: TexSet,
    private readonly q: QualityConfig,
  ) {
    setSimpleMaterials(q.simpleMaterials);
    renderer.shadowMap.enabled = q.shadows;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    this.mapView = buildMapView(map, tex, this.scene, q);
    this.foliage = new FoliageView(this.scene, map, q);
    if (map.fogRoadColor !== undefined) this.fogBanks = new FogBanks(this.scene, Math.round(30 * q.particles) + 6);
    this.fx = new FX(this.scene, particleTexture(), q.particles);
    this.fx.setWorld(map.fires, map.lava, map.mist);
    this.zombies = new ZombieManager(this.scene, tex, this.fx, SILENT);
    if (map.bus) this.bus = new BusView(this.scene);
    this.shots = SHOTS[map.id] ?? SHOTS.cidade;
    // começa num plano diferente a cada visita
    this.shot = Math.floor(Math.random() * this.shots.length);
    for (let i = 0; i < 5; i++) this.walkers.push({ look: 1000 + Math.floor(Math.random() * 9000), side: (i - 2) * 1.4 + (Math.random() - 0.5), k: i / 5, speed: 0.6 + Math.random() * 0.35 });

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.45, 0.82);
    this.bloom.enabled = q.bloom;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = gradePass(map);
    // o lado esquerdo (onde ficam os botões) fica um pouco mais escuro pela vinheta maior
    this.grade.uniforms.vignette.value = 0.5;
    this.composer.addPass(this.grade);
    window.addEventListener('resize', this.resize);
    this.resize();
    this.place(0);
  }

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // Só para testes: pula para o plano i, no instante k (0..1).
  debugShot(i: number, k: number) {
    this.shot = i % this.shots.length;
    this.shotT = k * SHOT_TIME;
    this.walkers.forEach((w, j) => (w.k = j / this.walkers.length));
  }

  private resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.q.maxPixelRatio);
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // tela estreita: abre o ângulo para o mapa continuar aparecendo
    this.camera.fov = w / h < 1.4 ? 62 : 50;
    this.camera.updateProjectionMatrix();
    this.fx.resize(h * this.renderer.getPixelRatio(), this.camera.fov);
  };

  // posiciona a câmera no instante k (0..1) do plano atual
  private place(k: number) {
    const s = this.shots[this.shot];
    const e = k * k * (3 - 2 * k) * 0.6 + k * 0.4;
    this.camera.position.set(lerp(s.from[0], s.to[0], e), lerp(s.from[1], s.to[1], e), lerp(s.from[2], s.to[2], e));
    this.look.set(lerp(s.look[0], s.lookTo[0], e), lerp(s.look[1], s.lookTo[1], e), lerp(s.look[2], s.lookTo[2], e));
    this.camera.lookAt(this.look);
  }

  // Estado de mentira para os zumbis (e o ônibus parado na Rodoviária) andarem como no jogo.
  private sample(dt: number): Sample {
    const s = this.shots[this.shot];
    const zombies: NetZombie[] = [];
    if (s.walk) {
      const [[ax, az], [bx, bz]] = s.walk;
      const len = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      const yaw = Math.atan2(dx, dz);
      this.walkers.forEach((w, i) => {
        w.k = (w.k + (w.speed * dt) / len) % 1;
        const along = w.k * len;
        // balança um pouco para os lados, como quem cambaleia
        const side = w.side + Math.sin(this.t * 0.7 + i * 2) * 0.3;
        zombies.push({ id: i + 1, kind: 0, look: w.look, anim: 'move', x: ax + dx * along - dz * side, y: 0, z: az + dz * along + dx * side, yaw });
      });
    }
    const bus = this.bus && this.shot === 0 ? { x: -2, z: 0, yaw: -Math.PI / 2, stop: 'rodoviaria', wait: 10 } : null;
    const snap = {
      at: 0,
      s: { zombies, bus } as unknown as Snapshot,
      zombies: new Map(zombies.map((z) => [z.id, z])),
      players: new Map(),
    } as BufferedSnap;
    return { a: snap, b: snap, k: 1 };
  }

  private frame = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.shotT += dt;
    if (this.shotT >= SHOT_TIME) {
      this.shotT = 0;
      this.shot = (this.shot + 1) % this.shots.length;
      // troca de plano: zumbis somem e reaparecem no novo caminho
      this.zombies.update(null, 0, this.camera.position);
      this.walkers.forEach((w, i) => (w.k = i / this.walkers.length));
    }
    this.place(this.shotT / SHOT_TIME);
    const s = this.shots[this.shot];
    const road = s.road ?? 0;
    const base = this.map.fogDensity ?? FOG_DENSITY;
    this.mapView.setFogBase(base + ((this.map.fogRoad ?? base) - base) * road, road);
    this.fogBanks?.update(dt, this.camera.position, road, this.mapView.fogColor);
    const sample = this.sample(dt);
    this.zombies.update(sample, dt, this.camera.position);
    this.bus?.update(sample, dt);
    this.fx.update(dt, this.camera.position);
    this.mapView.update(this.t, this.camera.position);
    this.foliage.update(this.t, this.camera.position);
    if (this.mapView.takeShadowDirty()) this.renderer.shadowMap.needsUpdate = true;
    // escurece no começo e no fim de cada plano
    const edge = Math.min(this.shotT, SHOT_TIME - this.shotT, this.t);
    this.grade.uniforms.fade.value = Math.min(1, edge / FADE);
    this.grade.uniforms.time.value = this.t;
    this.renderer.autoClear = true;
    if (this.q.level === 'baixa') this.renderer.render(this.scene, this.camera);
    else this.composer.render(dt);
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    freeScene([this.scene], this.tex);
    this.renderer.renderLists.dispose();
    this.mapView.dispose();
    this.foliage.dispose();
    this.fogBanks?.dispose();
    this.fx.dispose();
    this.zombies.dispose();
    this.bus?.dispose();
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
    this.scene.clear();
  }
}
