import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { RunInput } from '../shared/board';
import { BISPO, BLEEDOUT_TIME, PLAYER, PLAYER_COLORS, REVIVE_RANGE, TICK_DT, TRINCHEIRA } from '../shared/constants';
import type { MapDef } from '../shared/map/types';
import type { GameEvent, NetPlayer, Snapshot } from '../shared/protocol';
import { clamp, lerp } from '../shared/rng';
import { MAX_PERKS, PERKS, PERK_FX, SOLO_SELF_REVIVES, perkPrice, type PerkId } from '../shared/perks';
import { BOX, FORGE, GRENADE, KNIFE, SIGHTS, WEAPONS, ammoPrice, baseId, pelletOffsets, sightFits, upgradeId, wallAmmoPrice, type HitPart } from '../shared/weapons';
import type { Interactable } from '../shared/map/types';
import { World } from '../shared/world';
import type { AudioEngine, Surface } from './audio';
import { PlayerController } from './controller';
import { FX } from './fx';
import { Hud, type Marker } from './hud';
import { Input } from './input';
import { setSimpleMaterials } from './humanoid';
import { FOG_DENSITY, buildMapView, type MapView } from './mapView';
import { Barricades } from './barricades';
import { BoxView } from './boxView';
import { ForgeView } from './forgeView';
import { PowerupView, announce } from './powerupView';
import { POWERUPS } from '../shared/powerups';
import { BANK, MAX_LEVEL, rankOf, xpForLevel } from '../shared/progress';
import { bankBalance, bankChange, canDeposit, recordMatch, type MatchResult } from './profile';
import { emblemCanvas, animateEmblem } from './emblems';
import { ENTRY_BOARDS, entryPoints } from '../shared/map/types';
import { LOWER, QUALITY, QUALITY_LABEL, initialLevel, type GpuInfo, type QualityConfig, type QualitySetting } from './quality';
import type { Transport } from './net';
import { RemotePlayers } from './players';
import { SnapBuffer } from './snapbuffer';
import { particleTexture, type TexSet } from './textures';
import { WeaponView } from './weapon';
import { ZombieManager } from './zombies';
import { BusView } from './busView';
import { FogBanks, FoliageView } from './foliageView';
import { Decals } from './decals';
import { actionKey, loadKeys } from './keys';
import { controlsEditor, isListening } from './controlsUi';
import { drawPlanta, plantaSize } from './pauseMap';
import { Tips, TIP_TEXT } from './tips';
import { gradePass } from './grade';
import { freeScene } from './free';
import { standingIn } from '../shared/busBody';
import { TrincheiraClient } from './trincheira';


export interface Settings {
  sensitivity: number;
  volume: number;
  fov: number;
  quality: QualitySetting;
  // música e vinhetas (0..1), brilho da imagem (0.7..1.4) e eixo vertical do mouse invertido
  music: number;
  brightness: number;
  invertY: boolean;
  // dicas de primeira vez na Trincheira (padrão: ligadas)
  tips?: boolean;
  // teclas trocadas pelo jogador (ver keys.ts)
  keys?: Partial<Record<string, string[]>>;
}

// Exposição de base do renderizador (o brilho das opções multiplica)
export const EXPOSURE = 1.25;

type PauseTab = 'jogo' | 'video' | 'audio' | 'controles';
const PAUSE_TABS: [PauseTab, string][] = [['jogo', 'Jogo'], ['video', 'Vídeo'], ['audio', 'Áudio'], ['controles', 'Controles']];

export interface GameOptions {
  renderer: THREE.WebGLRenderer;
  container: HTMLElement;
  transport: Transport;
  map: MapDef;
  tex: TexSet;
  audio: AudioEngine;
  settings: Settings;
  gpu: GpuInfo;
  playerName: string;
  onSettings: (s: Settings) => void;
  onExit: () => void;
  // "Jogar de novo" no fim de jogo (só no solo): volta direto para o mesmo mapa
  onRestart?: () => void;
  // placar online (só com conta): manda a partida e devolve a mensagem para a tela de fim de jogo
  onlineRun?: (run: RunInput) => Promise<string>;
}

// ?autoplay em desenvolvimento: joga sem capturar o mouse (usado nos testes automáticos)
const AUTOPLAY = import.meta.env.DEV && new URLSearchParams(location.search).has('autoplay');

// interações novas da Trincheira (o texto do aviso vem do TrincheiraClient)
const TR_KINDS: Record<string, true> = {
  generator: true, fizz: true, tank: true, shovel: true, mound: true, part: true, bench: true, gramofone: true, disco: true,
  portal: true, crystal: true, staffPedestal: true, altar: true, tabua: true, tabuaAltar: true, challenge: true, missao: true, ring: true, cabine: true, cantil: true, radio: true,
};

const WEEKDAYS =['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 500);
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  // correção de cor, vinheta e granulação (qualidades alta e média)
  private readonly gradePass: ShaderPass;
  private readonly world: World;
  private mapView: MapView;
  private readonly fx: FX;
  private readonly barricades: Barricades;
  private readonly boxView: BoxView;
  private readonly powerupView: PowerupView;
  private forgeView!: ForgeView;
  // mapa Rota: ônibus, parada onde o jogador está e névoa da estrada
  private busView: BusView | null = null;
  // vegetação e bancos de névoa rasteiros (mapas que têm)
  private foliage: FoliageView;
  private fogBanks: FogBanks | null = null;
  // furos de bala, sangue, queimados e a bagunça fixa do mapa
  private readonly decals: Decals;
  // Trincheira: camada visual/sonora, interação que está sendo segurada (cavar, montar)
  private tr: TrincheiraClient | null = null;
  private holdId: string | null = null;
  private zone: string | null | undefined = undefined;
  private fogK = 0;
  private lastPower = false;
  private anvilT = 0;
  // arma recém-forjada: mostra na mão assim que ela estiver na mão
  private inspectWeapon: string | null = null;
  // abates por arma nesta partida (para a arma favorita do placar)
  private readonly weaponKills: Record<string, number> = {};
  private repairEntry: number | null = null;
  private shadowRefreshT = 0;
  private pendingSwitch: string | null = null;
  // arma da mão quando caiu (volta para ela ao levantar; caído, usa a pistola)
  private lastStandFrom: string | null = null;
  private readonly nadeMeshes = new Map<number, THREE.Mesh>();
  private readonly nadeGeo = new THREE.SphereGeometry(0.06, 10, 8);
  private readonly nadeMat = new THREE.MeshStandardMaterial({ color: 0x3d4a30, roughness: 0.7 });
  private readonly rayMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 4, 1.2) });
  private readonly rocketMat = new THREE.MeshStandardMaterial({ color: 0x4a5a30, roughness: 0.6, metalness: 0.3, emissive: new THREE.Color(0.3, 0.1, 0.02) });
  private readonly boltMat = new THREE.MeshStandardMaterial({ color: 0xb03020, roughness: 0.5 });
  private readonly vortexMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.5, 2.8) });
  private readonly orbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 0.55, 0.1) });
  private readonly artyMat = new THREE.MeshStandardMaterial({ color: 0x5a1a14, roughness: 0.6, emissive: new THREE.Color(0.35, 0.03, 0.02) });
  // pilares de fogo do Bispo marcados no chão (somem quando o fogo sobe)
  private warns: { x: number; z: number; t: number; dur: number }[] = [];
  // buracos negros abertos: núcleo escuro e anel roxo (sem luz própria: luz nova recompila os materiais e trava o quadro)
  private readonly vortexViews = new Map<number, { group: THREE.Group; ring: THREE.Mesh; core: THREE.Mesh }>();
  private readonly vortexGeo = new THREE.SphereGeometry(1, 20, 14);
  private readonly ringGeo = new THREE.TorusGeometry(1, 0.08, 8, 40);
  private readonly coreMat = new THREE.MeshBasicMaterial({ color: 0x050008 });
  private readonly ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.5, 3.2), transparent: true, opacity: 0.85 });
  private shake = 0;
  // clima da rodada infernal (0..1, muda devagar) e clarão dos raios
  private hellK = 0;
  // último marcador de acerto de explosão
  private blastMarkT = -1;
  private boltFlash = 0;
  private howlT = 5;
  private q: QualityConfig;
  private scale = 1;
  private frameMs = 16;
  private dynT = 0;
  private slowT = 0;
  private readonly zombies: ZombieManager;
  private readonly players: RemotePlayers;
  private readonly weapon: WeaponView;
  private readonly pc: PlayerController;
  private readonly input: Input;
  private readonly hud: Hud;
  private readonly buffer = new SnapBuffer();
  private readonly raycaster = new THREE.Raycaster();
  private readonly muzzleLight = new THREE.PointLight(0xffa040, 0, 9, 2);
  private readonly transport: Transport;
  private readonly audio: AudioEngine;
  private readonly settings: Settings;
  // dicas de primeira vez (Trincheira)
  readonly tips = new Tips();
  private tipT = 0;
  private me: NetPlayer | null = null;
  private spawned = false;
  private raf = 0;
  private last = 0;
  private t = 0;
  private sendT = 0;
  private flashT = 0;
  private blockSprintT = 0;
  private reviveTarget: string | null = null;
  private over = false;
  private disposed = false;
  private fpsAcc = 0;
  private fpsN = 0;
  private fps = 0;
  // F3: chamadas de desenho e triângulos do último quadro (o orçamento de desempenho do POLIMENTO F3)
  perf = { calls: 0, tris: 0 };
  private perfOn = false;
  private onPerfKey = (e: KeyboardEvent) => {
    if (e.code !== 'F3' || e.repeat) return;
    e.preventDefault();
    this.perfOn = !this.perfOn;
    this.infoT = 0;
  };
  private buyPending = 0;
  private readonly jingleT = new Map<string, number>();
  private infoT = 0;

  constructor(private readonly o: GameOptions) {
    this.renderer = o.renderer;
    // conta só o que este quadro desenhou: zera no começo do desenho (ver step) e lê no fim
    this.renderer.info.autoReset = false;
    window.addEventListener('keydown', this.onPerfKey);
    this.transport = o.transport;
    this.audio = o.audio;
    this.settings = { ...o.settings };
    this.tips.enabled = this.settings.tips !== false;
    this.world = new World(o.map);

    this.q = QUALITY[initialLevel(this.settings.quality, o.gpu)];
    this.prepareRenderer();
    this.mapView = buildMapView(o.map, o.tex, this.scene, this.q);
    this.foliage = new FoliageView(this.scene, o.map, this.q);
    if (o.map.fogRoadColor !== undefined) this.fogBanks = new FogBanks(this.scene, Math.round(36 * this.q.particles) + 8);
    this.fx = new FX(this.scene, particleTexture(), this.q.particles);
    this.decals = new Decals(this.scene, this.world, this.q.simpleMaterials);
    this.barricades = new Barricades(this.scene, o.map.entries, o.tex, this.q.simpleMaterials);
    this.boxView = new BoxView(this.scene, o.map.boxSpots, o.tex);
    this.powerupView = new PowerupView(this.scene);
    this.powerupView.onSpawn = (kind, p) => {
      this.audio.powerupDrop(p.clone().setY(1));
      const d = Math.hypot(p.x - this.pc.pos.x, p.z - this.pc.pos.z);
      if (d > 12) this.hud.notify(`<b style="color:${POWERUPS[kind].color}">${POWERUPS[kind].name}</b> caiu a ${Math.round(d)} m.`);
    };
    this.fx.setWorld(o.map.fires, o.map.lava, o.map.mist);
    this.zombies = new ZombieManager(this.scene, o.tex, this.fx, this.audio);
    // alvo da corrente do Carrasco: o peito do jogador
    this.zombies.locate = (pid) => (pid === this.transport.localId ? new THREE.Vector3(this.pc.pos.x, this.pc.pos.y + 1.1, this.pc.pos.z) : this.playerPos(pid));
    this.players = new RemotePlayers(this.scene, o.tex, this.transport.localId);
    this.scene.add(this.muzzleLight);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.45, 0.82);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
    this.gradePass = gradePass(o.map);
    this.composer.addPass(this.gradePass);

    this.pc = new PlayerController(this.world);
    const [sx, sz] = o.map.playerSpawns[0];
    this.pc.spawn(sx, sz, sz > 0 ? 0 : Math.PI);
    this.pc.onStep = () => this.audio.footstep(this.surface(), this.pc.sprinting ? 1.3 : 1);
    this.pc.onLand = (v) => {
      if (v > 4) this.audio.land();
      // Casca Grossa: a altura da queda (v²/2g) vai para a simulação, que solta a onda de choque
      const h = (v * v) / (2 * PLAYER.gravity);
      if (h >= 1.2 && this.me?.perks.includes('casca-grossa')) this.transport.send({ t: 'land', h });
    };

    this.weapon = new WeaponView({
      fire: (spread, charged) => this.fire(spread, charged),
      throwGrenade: () => this.throwGrenade(),
      throwArtillery: () => this.throwArtillery(),
      knife: () => this.knife(),
      bash: () => this.transport.send({ t: 'bash' }),
      reload: (ammo) => {
        if (this.me?.perks.includes('faisca')) this.transport.send({ t: 'reload', weapon: this.weapon.def.id, ammo });
      },
      sound: (s) => {
        if (s === 'dry') this.audio.dryFire();
        else if (s === 'magOut') this.audio.magOut();
        else if (s === 'magIn') this.audio.magIn();
        else if (s === 'slide') this.audio.slide();
        else if (s === 'gulp') this.audio.gulp();
        else if (s === 'shell') this.audio.shell();
        else if (s === 'switch') this.audio.weaponSwitch();
        else this.audio.knifeSwing();
      },
    }, o.map.startWeapon);

    this.forgeView = new ForgeView(this.scene, o.map, this.fx, this.weapon.camoMats);
    if (o.map.bus) this.busView = new BusView(this.scene);
    this.input = new Input(this.renderer.domElement, AUTOPLAY);
    this.input.onUnlock = () => this.onUnlock();
    this.hud = new Hud(o.container);
    this.input.keys = loadKeys(this.settings.keys);
    this.hud.reloadKey = actionKey(this.input.keys, 'reload');
    if (o.map.trincheira) {
      // Trincheira: geradores, tanque, colossos, clima, cajados... e soldados de 1918
      this.tr = new TrincheiraClient(this.scene, o.map, o.tex, { quality: this.q, audio: this.audio, mapView: this.mapView });
      this.tr.attachHud(this.hud);
      this.tr.setLocal(this.transport.localId, (pid) => this.nameOf(pid));
      this.zombies.era = 'ww1';
      const sf = o.map.surface;
      if (sf) this.pc.mudAt = (x, z) => {
        const cx = Math.floor(x - sf.ox), cz = Math.floor(z - sf.oz);
        return cx >= 0 && cz >= 0 && cx < sf.w && cz < sf.h && sf.data[cz * sf.w + cx] === 'm';
      };
    }
    this.renderer.toneMappingExposure = EXPOSURE * (this.settings.brightness ?? 1);
    this.renderer.domElement.addEventListener('click', this.onCanvasClick);

    this.transport.onSnapshot = (s) => this.onSnapshot(s);
    this.transport.onEvents = (l) => this.onEvents(l);

    window.addEventListener('resize', this.resize);
    if (!AUTOPLAY) window.addEventListener('beforeunload', this.onBeforeUnload);
    this.resize();
  }

  // Ctrl+W (agachando com Ctrl e andando com W) ou F5 no meio da partida: o navegador pergunta antes de sair
  private onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (this.over || this.disposed) return;
    e.preventDefault();
    e.returnValue = '';
  };

  start() {
    this.audio.startAmbience();
    if (this.tr) this.audio.startTrincheira();
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    this.hud.showIntro([this.o.map.name.toUpperCase(), this.o.map.place ?? 'Algum lugar no interior', `${WEEKDAYS[d.getDay()]}, ${hh}:${mm}`]);
    this.input.lock();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // Compila os shaders antes do primeiro quadro (sem isso o começo da partida dá um tranco).
  async warmup() {
    this.camera.position.set(this.pc.pos.x, this.pc.pos.y + PLAYER.eye, this.pc.pos.z);
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
      await this.renderer.compileAsync(this.weapon.scene, this.weapon.camera);
    } catch {
      // sem compilação antecipada: compila no primeiro quadro
    }
  }

  // Configurações do renderizador que dependem da qualidade.
  private prepareRenderer() {
    setSimpleMaterials(this.q.simpleMaterials);
    this.renderer.shadowMap.enabled = this.q.shadows;
    // o cenário não se mexe: a sombra é calculada uma vez e reaproveitada
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
  }

  private setQuality(level: QualitySetting | 'downgrade') {
    let lv = this.q.level;
    if (level === 'downgrade') lv = LOWER[lv] ?? lv;
    else {
      this.settings.quality = level;
      this.o.onSettings({ ...this.settings });
      lv = initialLevel(level, this.o.gpu);
    }
    if (lv === this.q.level) return;
    this.q = QUALITY[lv];
    this.prepareRenderer();
    this.mapView.dispose();
    this.mapView = buildMapView(this.o.map, this.o.tex, this.scene, this.q);
    this.mapView.setDoors([...this.world.openDoors]);
    this.tr?.setMapView(this.mapView);
    this.foliage.dispose();
    this.foliage = new FoliageView(this.scene, this.o.map, this.q);
    this.fx.density = this.q.particles;
    this.scale = 1;
    this.slowT = 0;
    this.resize();
  }

  private resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.q.maxPixelRatio) * this.scale;
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.weapon.resize(w / h);
    this.fx.resize(h * this.renderer.getPixelRatio(), this.camera.fov);
    this.tr?.resize(h * this.renderer.getPixelRatio(), this.camera.fov);
  };

  private onCanvasClick = () => {
    if (!this.input.locked && !this.hud.overlayOpen && !this.over) this.input.lock();
  };

  // tecla de "usar" escolhida pelo jogador, para os avisos na tela
  private get useKey() {
    return actionKey(this.input.keys, 'use');
  }

  private get active() {
    return (this.input.locked || AUTOPLAY) && !this.over && !this.hud.overlayOpen;
  }

  // Só em desenvolvimento: posiciona a câmera para testes automáticos.
  debugView(x: number, z: number, yaw: number, pitch = 0) {
    this.pc.spawn(x, z, yaw);
    this.pc.pitch = pitch;
  }

  debugShoot() {
    this.fire(this.weapon.spread);
  }

  lookAtNearestZombie(height = 1.2) {
    let best: { x: number; y: number; z: number } | null = null;
    let bd = Infinity;
    for (const z of this.zombies.bodies()) {
      const d = Math.hypot(z.x - this.pc.pos.x, z.z - this.pc.pos.z);
      if (d < bd) {
        bd = d;
        best = z;
      }
    }
    if (!best) return;
    const dx = best.x - this.pc.pos.x;
    const dz = best.z - this.pc.pos.z;
    this.pc.yaw = Math.atan2(-dx, -dz);
    this.pc.pitch = Math.atan2(best.y + height - (this.pc.pos.y + this.pc.eyeHeight), bd);
  }

  // ---------- rede ----------

  private onSnapshot(s: Snapshot) {
    this.buffer.push(s, performance.now());
    const me = s.players.find((p) => p.id === this.transport.localId) ?? null;
    if (me && !this.spawned) {
      this.spawned = true;
      this.pc.spawn(me.x, me.z, me.z > 0 ? 0 : Math.PI);
    }
    this.me = me;
    // portas abertas (pela simulação): libera a colisão local e afunda o modelo
    const open = new Set(s.doors ?? []);
    for (const id of open) {
      if (this.world.openDoors.has(id)) continue;
      this.world.openDoors.add(id);
      // colisão que só liga e desliga (Caixa, Fonte da Sorte, pés dos colossos) não tem modelo nem muda a sombra
      if (!id.startsWith('box-spot-') && !id.startsWith('fizz-spot-') && !id.startsWith('pe-')) {
        this.mapView.setDoors([id]);
        this.renderer.shadowMap.needsUpdate = true;
        this.shadowRefreshT = 1.4;
      }
    }
    for (const id of [...this.world.openDoors]) if (!open.has(id)) this.world.openDoors.delete(id);
    this.hud.setRound(s.round);
    this.hud.setScores(s.players, this.transport.localId);
    if (me) {
      this.weapon.setInventory(me.weapons);
      this.weapon.setSights(me.sights ?? {});
      this.weapon.heavyKnife = me.heavyKnife;
      this.weapon.punho = !!me.punho;
      this.weapon.punhoEl = me.punhoEl ?? null;
      if (this.pendingSwitch && me.weapons.includes(this.pendingSwitch)) {
        this.weapon.switchTo(this.pendingSwitch);
        this.pendingSwitch = null;
      }
    }
  }

  private playerPos(pid: string): THREE.Vector3 | null {
    if (pid === this.transport.localId) return null;
    const p = this.players.positions().find((x) => x.id === pid);
    return p ? new THREE.Vector3(p.x, p.y + 1.4, p.z) : null;
  }

  private onEvents(list: GameEvent[]) {
    const local = this.transport.localId;
    for (const e of list) {
      // Trincheira: sons, avisos, partículas e painéis de cada evento do mapa
      this.tr?.onEvent(e, { local, me: this.me, playerPos: (pid) => this.playerPos(pid) });
      switch (e.e) {
        case 'points':
          if (e.pid === local) this.hud.popPoints(e.delta, this.me?.slot ?? 0);
          break;
        case 'zhit':
          // explosões e projéteis: o acerto só se sabe agora (um marcador por instante, mesmo pegando vários)
          if (e.pid === local && e.blast) {
            if (this.t - this.blastMarkT > 0.08) {
              this.blastMarkT = this.t;
              this.hud.hitmarker(false);
              this.audio.hitmarker(false);
            }
          }
          if (e.pid !== local || e.blast) {
            this.zombies.flinch(e.zid, e.part, null, e.blast ? 1.2 : 0.8);
            const v = this.zombies.view(e.zid);
            if (v) {
              const p = v.h.root.position.clone();
              const dog = v.kind === 3;
              p.y += e.part === 'head' ? (dog ? 0.75 : 1.65) : dog ? 0.6 : 1.2;
              this.fx.blood(p, new THREE.Vector3(0, 0.3, 0), 0.7);
            }
          }
          break;
        case 'zkill':
          this.zombies.onEvent(e);
          // poça de sangue que se espalha sob o corpo (cão explode; arremessado ou engolido não deixa)
          if (e.kind !== 3 && e.kind !== 5 && !e.fling && !e.sucked) {
            const big = e.kind === 4 || e.kind === 6;
            this.decals.floor('pool', e.x - Math.sin(e.yaw) * 0.6, e.z - Math.cos(e.yaw) * 0.6, (big ? 2.4 : 1.4) + Math.random() * 0.5, e.y + 0.3, true);
          }
          if (e.pid === local) {
            const w = this.weapon.def.id;
            this.weaponKills[w] = (this.weaponKills[w] ?? 0) + 1;
            this.hud.hitmarker(true);
            this.audio.hitmarker(e.part === 'head');
          }
          break;
        case 'zattack':
        case 'zrise':
          this.zombies.onEvent(e);
          break;
        case 'phurt':
          if (e.pid === local) {
            this.audio.hurt();
            let angle: number | null = null;
            if (!e.lava) {
              const dx = e.fromX - this.pc.pos.x;
              const dz = e.fromZ - this.pc.pos.z;
              const f = -Math.sin(this.pc.yaw) * dx - Math.cos(this.pc.yaw) * dz;
              const r = Math.cos(this.pc.yaw) * dx - Math.sin(this.pc.yaw) * dz;
              angle = Math.atan2(r, f);
              this.pc.pitch += 0.03;
              this.pc.yaw += (Math.random() - 0.5) * 0.05;
            }
            this.hud.hurtFrom(angle);
          }
          break;
        case 'pdown':
          if (e.pid === local) {
            this.lastStandFrom = this.weapon.def.id;
            // caído, saca a pistola se tiver uma (a terceira arma vai embora junto com a Mula)
            const pistol = this.me?.weapons.slice(0, 2).find((w) => WEAPONS[w]?.cls === 'pistol' && !WEAPONS[w].projectile);
            if (pistol && pistol !== this.weapon.def.id) this.weapon.switchTo(pistol);
            else this.weapon.raise();
            this.reviveTarget = null;
          } else {
            this.hud.notify(`${this.nameOf(e.pid)} caiu! Reanime com <b>${this.useKey}</b>.`);
          }
          break;
        case 'previve':
          if (e.pid === local) {
            this.standUp();
            if (e.by === 'cajado') this.hud.notify('Um cajado desperto levantou você!');
          }
          else if (e.by === local || e.from === local) this.hud.notify(`Você reanimou ${this.nameOf(e.pid)}${e.by === 'cajado' ? ' com o cajado' : ''}.`);
          break;
        case 'pdead':
          if (e.pid === local) this.hud.notify('Você sangrou até a morte. Volta na próxima rodada.');
          else this.hud.notify(`${this.nameOf(e.pid)} morreu.`);
          break;
        case 'prespawn':
          if (e.pid === local) {
            this.pc.spawn(e.x, e.z, e.z > 0 ? 0 : Math.PI);
            this.weapon.reset();
            this.lastStandFrom = null;
          }
          break;
        case 'shot': {
          const p = this.playerPos(e.pid);
          const wd = WEAPONS[e.weapon];
          if (p && wd?.projectile === 'wind') this.audio.windBlast(p);
          else if (p && wd?.projectile === 'arc') this.audio.arcZap(p);
          else if (p && wd?.projectile === 'rocket') this.audio.rocketLaunch(p);
          else if (p && wd?.projectile === 'blade') this.audio.bladeLaunch(p);
          else if (p) this.audio.gunshot(p, wd?.sound ?? wd?.cls ?? 'pistol', wd?.pitch);
          break;
        }
        case 'roundStart':
          this.hud.setRound(e.round);
          if (e.hell) {
            this.audio.hellStart();
            this.hud.showBanner('RODADA INFERNAL');
          } else if (this.tr) {
            // Trincheira: tambor de guerra, coral grave e metais distantes (a do Blindado é mais pesada)
            this.audio.trSound(e.boss ? 'vinheta-blindado' : 'vinheta-inicio');
          } else {
            this.audio.roundStart();
          }
          break;
        case 'roundEnd':
          this.hud.roundEnded();
          if (this.tr) this.audio.trSound('vinheta-fim');
          else this.audio.roundEnd();
          if (e.hell) this.audio.hellEnd();
          break;
        case 'boss': {
          this.zombies.onEvent(e);
          const p = new THREE.Vector3(e.x, 0.5, e.z);
          const d = p.distanceTo(this.pc.pos);
          if (e.phase === 'spawn') {
            this.audio.bossBell();
            this.hud.showBanner('O CARRASCO');
            this.hud.notify('<b>O Carrasco</b> chegou. Quebre o capacete e mire na cabeça.');
            this.shake = Math.max(this.shake, 1);
            for (let k = 0; k < 4; k++) this.fx.dirt(e.x + (Math.random() - 0.5) * 2, e.z + (Math.random() - 0.5) * 2);
            this.fx.explosion(p);
          } else if (e.phase === 'armor') {
            this.hud.notify('O capacete do <b>Carrasco</b> caiu: tiro na cabeça vale o triplo!');
          } else if (e.phase === 'slam') {
            this.audio.bossSlam(p);
            this.fx.explosion(p.setY(0.1));
            for (let k = 0; k < 6; k++) {
              const a = (k / 6) * Math.PI * 2;
              this.fx.dirt(e.x + Math.cos(a) * 2.5, e.z + Math.sin(a) * 2.5);
            }
            if (d < 16) this.shake = Math.max(this.shake, 1.2 * (1 - d / 16));
          } else if (e.phase === 'chain') {
            const v = this.zombies.view(e.zid);
            if (v) this.audio.chainThrow(v.h.root.position);
          } else if (e.phase === 'charge') {
            const v = this.zombies.view(e.zid);
            if (v) this.audio.bossRoar(v.h.root.position, 1);
          } else if (e.phase === 'wall') {
            this.audio.bossSlam(p);
            if (d < 14) this.shake = Math.max(this.shake, 0.8 * (1 - d / 14));
          } else if (e.phase === 'death') {
            this.fx.explosion(p);
            this.hud.notify('<b>O Carrasco</b> caiu! +1000 para cada jogador.');
            this.shake = Math.max(this.shake, 0.6);
          }
          break;
        }
        case 'bosspull':
          if (e.pid === local) {
            this.pc.pull(e.x, e.z, e.stop);
            this.audio.chainHit();
            this.shake = Math.max(this.shake, 0.7);
          }
          break;
        case 'power':
          if (e.pid === local) this.buyPending = 0;
          this.audio.powerOn();
          this.hud.notify(`${e.pid === local ? 'Você ligou' : `${this.nameOf(e.pid)} ligou`} a <b>energia</b>: bebidas acesas e o cofre da Forja aberto.`);
          this.shake = Math.max(this.shake, 0.4);
          break;
        case 'bus': {
          const bp = this.busView?.pose;
          const at = bp ? new THREE.Vector3(bp.x, 1.5, bp.z) : this.pc.pos.clone();
          const zn = this.o.map.zones?.find((z) => z.id === e.zone)?.name ?? '';
          const near = this.zone === e.zone || (bp && Math.hypot(bp.x - this.pc.pos.x, bp.z - this.pc.pos.z) < 15);
          if (e.phase === 'arrive') {
            this.audio.busDoor(at);
            if (near) this.hud.notify(`<b>Ônibus</b> na parada ${zn}: sai em 20 s.`);
          } else if (e.phase === 'honk') {
            this.audio.busHorn(at);
            if (near) this.hud.notify('<b>Ônibus</b> saindo!');
          } else {
            this.audio.busDoor(at);
          }
          break;
        }
        case 'zvanish':
        case 'runover':
          this.zombies.onEvent(e);
          break;
        case 'ritual': {
          if (e.pid === local) this.buyPending = 0;
          const c = this.o.map.ritual?.candles[e.candle];
          const p = c ? new THREE.Vector3(c[0], c[1], c[2]) : this.pc.pos.clone();
          if (e.phase === 'candle') {
            this.audio.ritualCandle(p);
            if (e.pid !== local) this.hud.notify(`${this.nameOf(e.pid)} acendeu uma <b>vela preta</b>.`);
          } else {
            this.audio.ritualBell();
            this.hud.showBanner('O RITUAL');
            this.hud.notify('As velas pretas queimam. <b>Algo sobe da lava do cruzamento...</b>');
            this.shake = Math.max(this.shake, 0.8);
            this.boltFlash = Math.max(this.boltFlash, 0.5);
          }
          break;
        }
        case 'bispo': {
          const p = new THREE.Vector3(e.x, 1.5, e.z);
          const d = p.distanceTo(this.pc.pos);
          if (e.phase === 'spawn') {
            this.audio.bossBell();
            this.audio.bispoVoice(p, 1.6);
            this.hud.showBanner('O BISPO');
            this.hud.notify('<b>O Bispo</b> subiu da lava. Derrote-o e ganhe todas as bebidas.');
            this.fx.explosion(p.clone().setY(0.4));
            for (let k = 0; k < 6; k++) this.fx.fireBurst(new THREE.Vector3(e.x + (Math.random() - 0.5) * 3, 0.3, e.z + (Math.random() - 0.5) * 3));
            this.shake = Math.max(this.shake, 1.2);
          } else if (e.phase === 'phase') {
            this.audio.bispoVoice(p, 1.3);
            this.fx.fireBurst(p);
            this.fx.fireBurst(p.clone().setY(0.4));
            if (e.n && e.n >= 2) this.hud.notify(e.n === 3 ? '<b>O Bispo</b> está furioso!' : '<b>O Bispo</b> se envolve em fogo e muda de lugar.');
          } else if (e.phase === 'orb') {
            this.audio.rocketLaunch(p);
          } else if (e.phase === 'summon') {
            this.audio.bispoVoice(p, 0.9);
          } else if (e.phase === 'pillar' && e.pts) {
            for (let i = 0; i < e.pts.length; i += 2) {
              this.warns.push({ x: e.pts[i], z: e.pts[i + 1], t: 0, dur: BISPO.pillar.warn });
              this.audio.pillarWarn(new THREE.Vector3(e.pts[i], 0.3, e.pts[i + 1]));
            }
          } else if (e.phase === 'death') {
            this.hud.showBanner('RITUAL COMPLETO');
            this.hud.notify('<b>O Bispo</b> caiu! Todas as bebidas e +5000 para cada um.');
            this.fx.explosion(p);
            this.fx.forgeBurst(p.clone().setY(0.5));
            this.audio.forgeDone(p);
            if (d < 30) this.shake = Math.max(this.shake, 0.9);
            this.warns = [];
          }
          break;
        }
        case 'wind': {
          const o = new THREE.Vector3(e.x, e.y, e.z);
          // a lufada sai da boca da arma de quem atirou
          if (e.pid === local) o.copy(this.camera.position).add(new THREE.Vector3(0, -0.12, 0));
          this.fx.windGust(o, new THREE.Vector3(e.dx, e.dy, e.dz).normalize(), e.range);
          break;
        }
        case 'arc': {
          const pts: THREE.Vector3[] = [];
          for (let i = 0; i < e.pts.length; i += 3) pts.push(new THREE.Vector3(e.pts[i], e.pts[i + 1], e.pts[i + 2]));
          if (e.pid === local && pts.length) {
            const fwd = this.camera.getWorldDirection(new THREE.Vector3());
            pts[0].copy(this.camera.position).addScaledVector(fwd, 0.5).add(new THREE.Vector3(0, -0.1, 0));
          }
          this.fx.arcBolt(pts);
          for (const p of pts.slice(1, 7)) this.audio.arcHit(p);
          break;
        }
        case 'vortex': {
          const p = new THREE.Vector3(e.x, e.y, e.z);
          if (e.phase === 'open') {
            this.audio.vortexOpen(p, e.dur);
            this.fx.vortexBurst(p, false);
          } else {
            this.audio.vortexClose(p);
            this.fx.vortexBurst(p, true);
            const d = p.distanceTo(this.pc.pos);
            if (d < 12) this.shake = Math.max(this.shake, 0.5 * (1 - d / 12));
          }
          break;
        }
        case 'dogspawn': {
          const p = new THREE.Vector3(e.x, 0.5, e.z);
          this.fx.lightning(e.x, e.z);
          this.audio.lightning(p);
          const d = p.distanceTo(this.pc.pos);
          this.boltFlash = Math.max(this.boltFlash, clamp(1 - d / 45, 0.25, 1));
          if (d < 12) this.shake = Math.max(this.shake, 0.5 * (1 - d / 12));
          break;
        }
        case 'blindado':
        case 'fx':
          this.zombies.onEvent(e);
          if (e.e === 'blindado' && e.phase === 'spawn') {
            this.hud.showBanner('O BLINDADO');
            this.shake = Math.max(this.shake, 0.9);
          }
          break;
        case 'cabine':
          // levado à cabine do colosso (ou de volta à pegada): o navegador move o jogador para onde a simulação mandou
          if (e.pid === local && e.x !== undefined && e.z !== undefined && (e.phase === 'entra' || e.phase === 'volta')) {
            this.pc.spawn(e.x, e.z, e.phase === 'entra' ? Math.PI / 2 : 0);
            this.hud.whiteFlash();
          }
          break;
        case 'teleporte':
          // o navegador é quem mexe na posição: leva o jogador para a alcova ou de volta à boca do túnel
          if (e.pid === local && this.o.map.trincheira) {
            const D = this.o.map.trincheira;
            const dest = e.to === 'camara' ? D.chamber.alcoves.find((a) => a.el === e.el)?.c : D.portals.find((p) => p.el === e.el)?.exit;
            if (dest) {
              const back = e.to === 'camara' ? D.chamber.center : D.portals.find((p) => p.el === e.el)!.mouth;
              this.pc.spawn(dest[0], dest[1], Math.atan2(-(back[0] - dest[0]), -(back[1] - dest[1])));
              this.hud.whiteFlash();
            }
          }
          break;
        case 'artilharia':
          if (e.phase === 'throw' && e.pid === local) this.hud.notify('<b>Granada de Artilharia</b>: afaste-se da fumaça vermelha.');
          break;
        case 'gameover':
          this.gameOver(e.round);
          break;
        case 'pleave':
          this.hud.notify(`${e.name} saiu da partida.`);
          break;
        case 'refill':
          if (e.pid === local) {
            this.buyPending = 0;
            this.audio.buy();
            if (e.weapon === this.weapon.def.id) this.weapon.startAction('refill', 1.5, () => this.weapon.refill(e.weapon));
            else this.weapon.refill(e.weapon);
          }
          break;
        case 'perk':
          if (e.pid === local) {
            this.buyPending = 0;
            const d = PERKS[e.perk];
            this.audio.buy();
            this.weapon.startAction('drink', 2, () => {}, d.color);
            this.hud.notify(`<b>${d.name}</b>: ${d.desc}.`);
            const m = this.o.map.interactables.find((i) => i.perk === e.perk);
            if (m) this.audio.perkJingle(new THREE.Vector3(m.use[0], 1.6, m.use[1]), Object.keys(PERKS).indexOf(e.perk));
          }
          break;
        case 'deny':
          if (e.pid === local) {
            this.buyPending = 0;
            this.audio.deny();
            const why: Partial<Record<typeof e.reason, string>> = {
              trancado: 'Está trancado.',
              faltam: 'Ainda falta algo para isso.',
              ocupado: 'Já está em uso.',
              desligada: 'Sem energia: ligue o gerador da área.',
              unica: 'Você já carrega um cajado.',
              esgotado: 'O prêmio desta cabine já foi levado.',
              longe: 'Só dá para pegar o prêmio de dentro da cabine.',
              aneis: 'Falta a 2ª etapa: gire os anéis da Escavação e acerte a esfera com este cajado.',
            };
            if (why[e.reason]) this.hud.notify(why[e.reason]!);
          }
          break;
        case 'sight':
          if (e.pid === local) {
            this.buyPending = 0;
            this.audio.buy();
            this.weapon.startAction('refill', 1.2, () => {});
            this.hud.notify(`<b>${SIGHTS[e.sight].name}</b> instalado: ${WEAPONS[e.weapon]?.name ?? e.weapon}.`);
          }
          break;
        case 'door': {
          const d = this.o.map.doors.find((x) => x.id === e.id);
          for (const it of this.o.map.interactables) {
            if (it.door !== e.id) continue;
            const p = new THREE.Vector3(it.use[0], 0.5, it.use[1]);
            this.audio.doorOpen(p);
            for (let k = 0; k < 3; k++) this.fx.dirt(it.use[0] + (Math.random() - 0.5) * 2, it.use[1] + (Math.random() - 0.5) * 2);
          }
          if (e.pid === local) {
            this.buyPending = 0;
            this.audio.buy();
          } else if (d) {
            this.hud.notify(`${this.nameOf(e.pid)} abriu <b>${d.name}</b>.`);
          }
          break;
        }
        case 'weapon':
          if (e.pid === local) {
            this.buyPending = 0;
            this.audio.buy();
            this.pendingSwitch = e.weapon;
            this.hud.notify(`<b>${WEAPONS[e.weapon]?.name ?? e.weapon}</b>${e.replaced ? ` no lugar de ${WEAPONS[e.replaced]?.name ?? e.replaced}` : ''}.`);
          }
          break;
        case 'gear':
          if (e.pid === local) {
            this.buyPending = 0;
            this.audio.buy();
            this.hud.notify(e.item === 'knife' ? '<b>Faca pesada</b>: mata com um golpe até a rodada 4.' : '<b>Granadas</b> cheias.');
          }
          break;
        case 'bank':
          if (e.pid === local) {
            this.buyPending = 0;
            this.audio.buy();
            bankChange(this.o.playerName, e.action === 'deposit' ? e.amount : -e.amount);
            this.hud.notify(`${e.action === 'deposit' ? 'Depositou' : 'Sacou'} ${e.amount} pontos. Saldo no banco: <b>${bankBalance(this.o.playerName).toLocaleString('pt-BR')}</b>`);
          }
          break;
        case 'forge': {
          const fp = new THREE.Vector3(...this.o.map.forge.anvil);
          if (e.pid === local) this.buyPending = 0;
          if (e.phase === 'candle') this.audio.knifeSwing();
          else if (e.phase === 'on') {
            this.audio.forgeIgnite(fp);
            this.hud.notify(this.o.map.forgeNeedsGenerators ? 'A <b>Forja</b> está pronta na Escavação.' : this.o.map.forge.candles.length ? 'A <b>Forja</b> acendeu no cemitério.' : 'A <b>Forja</b> acendeu no cofre do banco, na Cidade.');
            // pista do ritual: as velas pretas da Igreja só pegam fogo agora
            if (this.o.map.ritual) setTimeout(() => !this.disposed && this.hud.notify('Na Igreja, as <b>velas pretas</b> do altar parecem esperar por fogo...'), 5000);
          } else if (e.phase === 'start') {
            // a arma entra na fornalha
            const mouth = new THREE.Vector3(...this.o.map.forge.mouth);
            this.fx.fireBurst(mouth);
            this.fx.fireBurst(mouth.clone().setY(mouth.y + 0.3));
            this.audio.forgeIgnite(fp);
            if (e.pid === local) {
              this.buyPending = 0;
              this.audio.buy();
            }
          } else if (e.phase === 'ready') {
            // pronta: coluna de fogo sobre a bigorna, clarão e tremor por perto
            this.fx.forgeBurst(fp.clone().setY(fp.y + 0.4));
            this.audio.forgeDone(fp);
            const d = fp.distanceTo(this.pc.pos);
            this.boltFlash = Math.max(this.boltFlash, clamp(1 - d / 25, 0, 0.6));
            if (d < 10) this.shake = Math.max(this.shake, 0.5 * (1 - d / 10));
          } else if (e.phase === 'take' && e.pid === local) {
            this.buyPending = 0;
            this.hud.emberFlash();
            this.audio.forgeTake();
            this.inspectWeapon = e.weapon;
            this.hud.notify(`<b style="color:#ff8a4a">${WEAPONS[e.weapon!]?.name}</b> forjada.`);
          } else if (e.phase === 'expire' && e.pid === local) this.hud.notify('Ninguém pegou a arma da Forja e ela se perdeu.');
          break;
        }
        case 'powerup': {
          const d = POWERUPS[e.kind];
          this.audio.powerupPickup();
          announce(`${d.name}!`, this.settings.volume);
          this.hud.notify(`<b style="color:${d.color}">${d.name}</b>${e.pid === local ? '' : ` (${this.nameOf(e.pid)})`}`);
          if (e.kind === 'maxammo') this.weapon.refillAll();
          if (e.kind === 'bomb') {
            this.hud.whiteFlash();
            this.audio.explosion(this.camera.position.clone().add(new THREE.Vector3(0, 10, 0)));
          }
          break;
        }
        case 'box': {
          this.boxView.onEvent(e.phase);
          const bp = this.boxView.position();
          if (e.phase === 'spin') this.audio.boxSpin(bp);
          else if (e.phase === 'crow') {
            this.audio.crow(bp);
            this.hud.notify(e.pid === local ? 'O <b>Corvo</b> levou a caixa. Seus pontos foram devolvidos.' : 'O <b>Corvo</b> levou a caixa embora.');
          } else if (e.phase === 'arrive') {
            this.hud.notify(`A <b>Caixa Misteriosa</b> apareceu: ${this.o.map.boxSpots[e.loc]?.name ?? ''}.`);
          } else if (e.phase === 'offer' && e.pid === local) {
            this.audio.hitmarker(true);
          }
          if (e.pid === local && (e.phase === 'spin' || e.phase === 'take')) this.buyPending = 0;
          break;
        }
        case 'boom': {
          const p = new THREE.Vector3(e.x, e.y, e.z);
          // explosão perto do chão deixa o chão queimado
          if (e.kind !== 'ray') {
            const g = this.world.groundHeight(e.x, e.z, 0.1, e.y);
            if (e.y - g < 1.6) this.decals.floor('scorch', e.x, e.z, e.kind === 'fire' ? 1.6 : 2.8, e.y);
          }
          if (e.kind === 'ray') this.fx.rayBurst(p);
          else if (e.kind === 'fire') {
            this.fx.fireBurst(p);
            break;
          } else this.fx.explosion(p);
          this.audio.explosion(p);
          const d = p.distanceTo(this.pc.pos);
          if (d < 14) this.shake = Math.max(this.shake, 1 - d / 14);
          break;
        }
        case 'board':
          if (e.kind === 'tear') this.audio.boardBreak(this.barricades.center(e.entry));
          else this.audio.boardFix(this.barricades.center(e.entry));
          break;
        case 'selfrevive':
          if (e.pid === local) {
            this.standUp();
            this.hud.notify('<b>Segundo Fôlego</b>: você se levantou! Suas bebidas se foram.');
          }
          break;
        case 'pjoin':
        case 'knife':
          break;
      }
    }
  }

  // levantou: volta para a arma que estava na mão quando caiu
  private standUp() {
    const from = this.lastStandFrom;
    this.lastStandFrom = null;
    if (from && from !== this.weapon.def.id && this.me?.weapons.includes(from)) this.weapon.switchTo(from);
    else this.weapon.raise();
  }

  private nameOf(pid: string) {
    return this.buffer.latest?.players.get(pid)?.name ?? 'Aliado';
  }

  // ---------- combate ----------

  private fire(spread: number, charged = false) {
    const def = this.weapon.def;
    // Olho Frio: dispersão 30% menor
    if (this.me?.perks.includes('olho-frio')) spread *= PERK_FX.olhoSpreadMult;
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    if (def.projectile) {
      const start = origin.clone().addScaledVector(fwd, 0.6);
      start.y -= 0.06;
      this.transport.send({ t: 'launch', weapon: def.id, x: start.x, y: start.y, z: start.z, dx: fwd.x, dy: fwd.y, dz: fwd.z, ...(charged ? { charged: true } : {}) });
      if (def.staff && this.tr) {
        // cajados: clarão na boca e o som de cada elemento (o resto do efeito vem da simulação)
        this.tr.staffMuzzle(def.staff, start, fwd);
        if (def.projectile === 'frost') this.tr.iceBeam(start, fwd, def.range);
        else if (def.projectile === 'fogo') this.audio.trSound('fogo-bola');
        this.pc.pitch += 0.008 * def.recoil;
        this.flashT = 0.05;
        this.blockSprintT = 0.3;
        if (def.projectile === 'frost' || def.projectile === 'fogo') return;
      }
      if (def.projectile === 'ray') this.audio.rayZap();
      else if (def.projectile === 'wind') {
        this.audio.windBlast();
        this.shake = Math.max(this.shake, 0.6);
      } else if (def.projectile === 'arc') this.audio.arcZap();
      else if (def.projectile === 'rocket') this.audio.rocketLaunch();
      else if (def.projectile === 'blade') this.audio.bladeLaunch();
      else this.audio.gunshot(undefined, def.projectile === 'bolt' ? 'smg' : 'shotgun');
      this.pc.pitch += 0.012 * def.recoil;
      this.flashT = 0.05;
      this.blockSprintT = 0.3;
      return;
    }
    const right = new THREE.Vector3().crossVectors(fwd, this.camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const meshes = this.zombies.hitMeshes();
    const hits: { zid: number; part: HitPart }[] = [];

    // tiro único vai exatamente no centro; escopetas usam um padrão fixo de chumbos
    for (const [ox, oy] of pelletOffsets(def.pellets)) {
      const dir = fwd.clone().addScaledVector(right, ox * spread).addScaledVector(up, oy * spread).normalize();
      const wh = this.world.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, def.range);
      this.raycaster.set(origin, dir);
      this.raycaster.far = wh ? wh.t : def.range;
      // primeiro acerto em cada zumbi; o fuzil de precisão segue até `pierce` zumbis
      const seenZ = new Set<number>();
      const zhits = this.raycaster.intersectObjects(meshes, false).filter((h) => {
        const id = h.object.userData.zid as number;
        if (seenZ.has(id)) return false;
        seenZ.add(id);
        return true;
      }).slice(0, def.pierce ?? 1);
      // arma forjada: rastro de brasa até o fim do tiro
      if (def.upgraded) {
        const end = zhits.length ? zhits[zhits.length - 1].point : origin.clone().addScaledVector(dir, wh ? wh.t : Math.min(def.range, 40));
        const muzzle = origin.clone().addScaledVector(fwd, 0.5).addScaledVector(right, 0.08).addScaledVector(up, -0.08);
        this.fx.emberTracer(muzzle, end, !!wh || zhits.length > 0);
      }
      for (const zh of zhits) {
        const part = zh.object.userData.part as HitPart;
        hits.push({ zid: zh.object.userData.zid as number, part });
        this.fx.blood(zh.point, dir.clone().negate().lerp(dir, 0.6), part === 'head' ? 1.4 : 1);
        this.zombies.flinch(zh.object.userData.zid as number, part, dir, def.cls === 'shotgun' ? 1.6 : def.cls === 'pistol' ? 0.8 : 1);
        // respingo na parede ou no chão atrás do zumbi
        if (Math.random() < 0.55) {
          const back = this.world.raycast(zh.point.x, zh.point.y, zh.point.z, dir.x, dir.y, dir.z, 2.6);
          if (back && !back.block?.hidden && !back.block?.door) {
            const at = zh.point.clone().addScaledVector(dir, back.t);
            this.decals.add('blood', at, new THREE.Vector3(back.nx, back.ny, back.nz), 0.5 + Math.random() * 0.5);
          } else if (Math.random() < 0.5) {
            this.decals.floor('blood', zh.point.x + dir.x * 0.6, zh.point.z + dir.z * 0.6, 0.45 + Math.random() * 0.35, zh.point.y);
          }
        }
        this.hud.hitmarker(false);
        this.audio.hitmarker(part === 'head');
        this.audio.bodyHit(zh.point, part === 'head');
      }
      if (!zhits.length && wh) {
        const p = origin.clone().addScaledVector(dir, wh.t);
        const b = wh.block;
        this.fx.impact(p, wh.nx, wh.ny, wh.nz, b?.mat ?? (this.o.map.bus ? 'ground' : 'asphalt'));
        // furo de bala (não em colisão invisível, porta que vai abrir ou lava)
        if (!b?.hidden && !b?.door && b?.mat !== 'lava') this.decals.add('bullet', p, new THREE.Vector3(wh.nx, wh.ny, wh.nz), 0.16 + Math.random() * 0.06);
      }
    }
    // o raio no meio da mira serve para acertar alvos de enigma e os olhos dos colossos (Trincheira)
    this.transport.send({ t: 'shoot', weapon: def.id, hits, ...(this.tr ? { ray: [origin.x, origin.y, origin.z, fwd.x, fwd.y, fwd.z] as [number, number, number, number, number, number] } : {}) });
    this.audio.gunshot(undefined, def.sound ?? def.cls, def.pitch);
    if (def.upgraded) this.audio.emberShot();
    const adsK = 1 - this.weapon.ads * 0.45;
    this.pc.pitch += (0.016 + Math.random() * 0.008) * def.recoil * adsK;
    this.pc.yaw += (Math.random() - 0.5) * 0.009 * adsK;
    this.flashT = 0.05;
    this.blockSprintT = 0.3;
  }

  private throwGrenade() {
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    const start = origin.clone().addScaledVector(fwd, 0.5);
    start.y -= 0.1;
    const v = fwd.clone().multiplyScalar(GRENADE.throwSpeed);
    v.y += 2.5;
    v.x += this.pc.vel.x * 0.5;
    v.z += this.pc.vel.z * 0.5;
    this.transport.send({ t: 'grenade', x: start.x, y: start.y, z: start.z, vx: v.x, vy: v.y, vz: v.z });
    this.audio.knifeSwing();
  }

  // Granada de Artilharia: sai da mão no instante do arremesso (a animação é a da granada)
  private throwArtillery() {
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    const start = origin.clone().addScaledVector(fwd, 0.5);
    start.y -= 0.1;
    const v = fwd.clone().multiplyScalar(15);
    v.y += 2.5;
    v.x += this.pc.vel.x * 0.5;
    v.z += this.pc.vel.z * 0.5;
    this.transport.send({ t: 'artillery', x: start.x, y: start.y, z: start.z, vx: v.x, vy: v.y, vz: v.z });
    this.audio.trSound('artilharia-lanca');
  }

  // Granadas em voo: bolinhas que seguem o estado da partida.
  private updateGrenades() {
    const list = this.buffer.latest?.s.projectiles ?? [];
    const seen = new Set<number>();
    for (const g of list) {
      seen.add(g.id);
      let m = this.nadeMeshes.get(g.id);
      if (!m) {
        const mat = g.kind === 'ray' ? this.rayMat : g.kind === 'vortex' ? this.vortexMat : g.kind === 'orb' || g.kind === 'fogo' ? this.orbMat : g.kind === 'artilharia' ? this.artyMat : g.kind === 'bolt' || g.kind === 'blade' ? this.boltMat : g.kind === 'rocket' ? this.rocketMat : this.nadeMat;
        m = new THREE.Mesh(this.nadeGeo, mat);
        if (g.kind === 'bolt') m.scale.set(0.4, 0.4, 3);
        if (g.kind === 'blade') m.scale.set(0.15, 0.5, 2.6);
        if (g.kind === 'rocket') m.scale.set(0.9, 0.9, 4);
        if (g.kind === 'ray') m.scale.setScalar(2.2);
        if (g.kind === 'vortex') m.scale.setScalar(1.6);
        if (g.kind === 'orb') m.scale.setScalar(2.4);
        if (g.kind === 'fogo') m.scale.setScalar(2.8);
        if (g.kind === 'artilharia') m.scale.setScalar(1.5);
        m.position.set(g.x, g.y, g.z);
        this.scene.add(m);
        this.nadeMeshes.set(g.id, m);
      }
      const to = new THREE.Vector3(g.x, g.y, g.z);
      // projéteis compridos apontam para onde voam; granadas rolam
      if (g.kind === 'bolt' || g.kind === 'blade' || g.kind === 'rocket') {
        if (to.distanceToSquared(m.position) > 1e-6) m.lookAt(to.clone().add(to.clone().sub(m.position)));
      } else {
        m.rotation.x += 0.2;
      }
      const prev = m.position.clone();
      m.position.lerp(to, 0.35);
      // rastros: fumaça e fogo do foguete, brilho verde do raio
      if (g.kind === 'rocket') this.fx.rocketTrail(prev, m.position);
      else if (g.kind === 'ray') this.fx.rayTrail(prev, m.position);
      else if (g.kind === 'vortex') this.fx.vortexSwirl(m.position, 0.4, 1 / 60, 0.5);
      else if (g.kind === 'orb') this.fx.rocketTrail(prev, m.position);
      else if (g.kind === 'fogo' || g.kind === 'artilharia') this.tr?.projectileTrail(g.kind, prev, m.position);
    }
    for (const [id, m] of this.nadeMeshes) {
      if (seen.has(id)) continue;
      this.scene.remove(m);
      this.nadeMeshes.delete(id);
    }
  }

  // Buracos negros do Vórtice: crescem ao abrir, giram e encolhem no fim
  private updateVortices(dt: number) {
    const list = this.buffer.latest?.s.vortices ?? [];
    const seen = new Set<number>();
    for (const v of list) {
      seen.add(v.id);
      let view = this.vortexViews.get(v.id);
      if (!view) {
        const group = new THREE.Group();
        const core = new THREE.Mesh(this.vortexGeo, this.coreMat);
        const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
        group.add(core, ring);
        group.position.set(v.x, v.y, v.z);
        this.scene.add(group);
        view = { group, ring, core };
        this.vortexViews.set(v.id, view);
      }
      const t = v.t + dt;
      const grow = Math.min(1, t / 0.5) * Math.min(1, (v.dur - t) / 0.6);
      const k = Math.max(0.02, grow);
      view.core.scale.setScalar(0.55 * k + Math.sin(t * 9) * 0.04);
      view.ring.scale.setScalar(1.3 * k);
      view.ring.rotation.set(Math.PI / 2 + Math.sin(t * 2) * 0.3, t * 3, 0);
      this.fx.vortexSwirl(view.group.position, v.r * 0.75, dt, k);
    }
    for (const [id, view] of this.vortexViews) {
      if (seen.has(id)) continue;
      this.scene.remove(view.group);
      this.vortexViews.delete(id);
    }
  }

  private knife() {
    const fx = -Math.sin(this.pc.yaw);
    const fz = -Math.cos(this.pc.yaw);
    let best: { id: number; x: number; y: number; z: number; top: number } | null = null;
    let bestD = Infinity;
    for (const z of this.zombies.bodies()) {
      if (z.rising) continue;
      const dx = z.x - this.pc.pos.x;
      const dz = z.z - this.pc.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > KNIFE.range + 0.35 || Math.abs(z.y - this.pc.pos.y) > 1.2) continue;
      const cos = (dx * fx + dz * fz) / (d || 1);
      if (d > 0.6 && cos < 0.55) continue;
      if (d < bestD) {
        bestD = d;
        best = z;
      }
    }
    this.transport.send({ t: 'knife', zid: best ? best.id : null });
    if (best) {
      const p = new THREE.Vector3(best.x, best.y + best.top, best.z);
      this.fx.blood(p, new THREE.Vector3(fx, 0.2, fz), 1.2);
      this.audio.knifeHit();
      this.hud.hitmarker(false);
    }
  }

  private surface(): Surface {
    const { x, y, z } = this.pc.pos;
    if (y > 0.05) {
      for (const b of this.world.query(x - 0.1, z - 0.1, x + 0.1, z + 0.1)) {
        if (Math.abs(b.max[1] - y) < 0.05 && x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2]) {
          return b.mat === 'floorWood' || b.mat === 'wood' ? 'wood' : 'hard';
        }
      }
    }
    // mapa com o chão de cada lugar já marcado (Trincheira): lama soa como terra por enquanto
    const sf = this.o.map.surface;
    if (sf) {
      const cx = Math.floor(x - sf.ox), cz = Math.floor(z - sf.oz);
      const c = cx >= 0 && cz >= 0 && cx < sf.w && cz < sf.h ? sf.data[cz * sf.w + cx] : 'd';
      return c === 'h' ? 'hard' : c === 'w' ? 'wood' : c === 'm' ? 'mud' : 'dirt';
    }
    // Rota: chão de concreto nas paradas, asfalto na estrada do ônibus, terra no resto
    const route = this.o.map.bus;
    if (route) {
      if (this.zone || this.onBusNow()) return 'hard';
      const n = route.path.length;
      for (let i = 0; i < n; i++) {
        const [ax, az] = route.path[i];
        const [bx, bz] = route.path[(i + 1) % n];
        const dx = bx - ax, dz = bz - az;
        const k = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
        if (Math.hypot(x - ax - dx * k, z - az - dz * k) < 4.2) return 'hard';
      }
      return 'dirt';
    }
    return Math.abs(x) < 9 || Math.abs(z) < 9 ? 'hard' : 'dirt';
  }

  // ---------- quadro ----------

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    try {
      this.step(now);
    } catch (e) {
      this.reportError(e);
    } finally {
      // sempre libera os cliques deste quadro, senão um erro deixa o tiro "preso"
      this.input.endFrame();
    }
  };

  private reportedErrors = new Set<string>();
  private reportError(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (this.reportedErrors.has(msg)) return;
    this.reportedErrors.add(msg);
    console.error(e);
    this.hud.notify(`Erro: ${escapeHtml(msg)}`);
    // em desenvolvimento, relança fora do quadro para o erro aparecer no terminal do servidor
    if (import.meta.env.DEV) setTimeout(() => {
      throw e;
    });
  }

  // Resolução dinâmica: baixa a resolução interna se o quadro demora, sobe quando sobra folga.
  // Na qualidade automática, se mesmo na resolução mínima continuar lento, baixa a qualidade.
  private adaptResolution(rawMs: number, dt: number) {
    if (rawMs > 0 && rawMs < 250) this.frameMs = lerp(this.frameMs, rawMs, 0.06);
    this.dynT += dt;
    if (this.dynT < 1) return;
    this.dynT = 0;
    const slow = this.frameMs > 21;
    if (slow && this.scale > this.q.minScale + 0.001) {
      this.scale = Math.max(this.q.minScale, this.scale - (this.frameMs > 40 ? 0.2 : 0.1));
      this.resize();
    } else if (!slow && this.frameMs < 13 && this.scale < 1) {
      this.scale = Math.min(1, this.scale + 0.05);
      this.resize();
    }
    if (slow && this.scale <= this.q.minScale + 0.001 && this.settings.quality === 'auto' && LOWER[this.q.level]) {
      if (++this.slowT >= 3) {
        this.setQuality('downgrade');
        this.hud.notify(`Qualidade ajustada para <b>${QUALITY_LABEL[this.q.level]}</b> para rodar liso.`);
      }
    } else {
      this.slowT = 0;
    }
  }

  private step(now: number) {
    const rawMs = now - this.last;
    const dt = Math.max(0, Math.min(0.05, rawMs / 1000));
    if (this.input.locked || AUTOPLAY) this.adaptResolution(rawMs, dt);
    this.last = now;
    this.t += dt;

    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.fps = Math.round(this.fpsN / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsN = 0;
    }

    // no solo, o jogo só corre com o mouse capturado (pausa ao apertar Esc)
    if (this.transport.solo) this.transport.paused = !this.over && (this.hud.overlayOpen || (!this.input.locked && !AUTOPLAY));
    this.transport.update(dt);
    const sample = this.buffer.sample(performance.now() - (this.transport.solo ? 70 : 110));
    this.zombies.update(sample, dt, this.camera.position);
    if (this.busView) {
      this.busView.update(sample, dt);
      const bp = this.busView.pose;
      this.pc.setBus(bp);
      this.audio.busEngine(bp ? new THREE.Vector3(bp.x, 1.2, bp.z) : null, this.busView.speed);
    }
    if (this.zombies.quake > 0) {
      this.shake = Math.max(this.shake, this.zombies.quake);
      this.zombies.quake = 0;
    }
    this.players.update(sample, dt);
    // Trincheira: o tanque (e o resto) se interpola antes do controlador, que leva quem está em cima dele
    const trSnap = this.buffer.latest?.s;
    if (this.tr && trSnap) {
      this.tr.update(sample, trSnap, dt, this.t, this.me, this.camera);
      this.updateTips(dt, trSnap.tr?.mounds ?? []);
      this.shake = Math.max(this.shake, this.tr.quake);
      this.tr.quake = 0;
      this.pc.setTank(this.tr.tankPose());
      this.audio.trUpdate(dt);
    }

    const life = this.me?.life ?? 'alive';
    const active = this.active;
    const look = this.input.mouse();
    if (active) this.pc.look(look[0], look[1] * (this.settings.invertY ? -1 : 1), this.settings.sensitivity * 0.0022 * (1 - this.weapon.ads * 0.35));

    this.blockSprintT -= dt;
    this.pc.update(dt, this.input, {
      ads: this.weapon.ads > 0.3,
      blockSprint: this.blockSprintT > 0 || this.weapon.reloading,
      downed: life !== 'alive',
      // caído sendo reanimado por um aliado fica parado (senão sai do alcance dele)
      frozen: !active || this.over || (life === 'downed' && !this.transport.solo && (this.me?.revive ?? 0) > 0),
    }, this.zombies.bodies());

    this.weapon.update(dt, this.t, this.input, this.pc, active ? look : [0, 0], active && life !== 'dead');
    this.pc.applyCamera(this.camera, this.t);
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * 0.08 * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * 0.08 * this.shake;
      this.camera.rotation.z += (Math.random() - 0.5) * 0.03 * this.shake;
      this.shake *= Math.exp(-dt * 5);
    }

    // luneta do fuzil de precisão, ou mira comprada na Oficina (ponto vermelho / luneta 2×)
    const sight = this.weapon.sight;
    const scopeKind = this.weapon.def.scope ? 'sniper' : sight === 'scope' ? 'luneta' : null;
    const scoped = !!scopeKind && this.weapon.ads > 0.85 && life !== 'dead';
    this.hud.scope(scoped, scopeKind ?? 'sniper');
    const zoom = this.weapon.def.scope ? 0.32 : sight ? SIGHTS[sight].zoom : 0.8;
    const targetFov = this.settings.fov * lerp(1, zoom, this.weapon.ads) + this.weapon.sprintT * 5;
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = lerp(this.camera.fov, targetFov, 1 - Math.exp(-dt * 14));
      this.camera.updateProjectionMatrix();
      this.fx.resize(window.innerHeight * this.renderer.getPixelRatio(), this.camera.fov);
    }

    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = TICK_DT;
      this.transport.send({
        t: 'state',
        x: this.pc.pos.x, y: this.pc.pos.y, z: this.pc.pos.z,
        yaw: this.pc.yaw, pitch: this.pc.pitch,
        crouch: this.pc.crouchT > 0.5, speed: this.pc.speed2d,
      });
    }

    this.applyPerks(dt);
    this.updateGrenades();
    this.updateVortices(dt);
    this.boxView.update(this.buffer.latest?.s.box, dt, this.t);
    this.powerupView.update(this.buffer.latest?.s, this.t);
    const forge = this.buffer.latest?.s.forge;
    this.forgeView.update(forge, dt, this.t);
    if (forge?.state === 'working') {
      this.anvilT -= dt;
      if (this.anvilT <= 0) {
        this.anvilT = 0.45;
        const ap = new THREE.Vector3(...this.o.map.forge.anvil);
        this.audio.anvil(ap);
        // cada martelada solta faíscas
        this.fx.impact(ap.clone().setY(ap.y + 0.15), 0, 1, 0);
      }
    }
    if (this.inspectWeapon && this.weapon.def.id === this.inspectWeapon && !this.weapon.busy) {
      this.inspectWeapon = null;
      this.weapon.startAction('inspect', 1.5, () => {});
    }
    this.hud.setEffects(this.buffer.latest?.s.effects);
    this.hud.setGrenades(this.me?.grenades ?? 0);
    if (canThrowKey(this.input) && this.active && life === 'alive' && (this.me?.grenades ?? 0) > 0 && !this.weapon.busy) {
      this.weapon.startAction('throw', 0.62, () => {});
    }
    const canAct = active && life === 'alive';
    // escudo na mão (alternar): só com o escudo montado; a simulação confirma
    if (this.tr && this.input.hit('shield') && canAct && (this.me?.shield ?? 0) > 0) this.transport.send({ t: 'shield', on: !this.me?.shieldHand });
    if (this.tr && this.input.hit('artillery') && canAct && (this.me?.artilharia ?? 0) > 0 && !this.weapon.busy) this.weapon.throwArtillery();
    this.hud.setCharge(life === 'alive' && !this.over ? this.weapon.chargeFrac : 0);
    if (!this.updateRevive(canAct) && !this.updateRepair(canAct) && !this.updateInteract(dt, canAct)) this.hud.prompt(null);
    this.barricades.update(this.buffer.latest?.s.boards, dt);
    this.updateHud(dt, life);

    const fwd = this.camera.getWorldDirection(new THREE.Vector3());

    this.flashT -= dt;
    this.muzzleLight.position.copy(this.camera.position).addScaledVector(fwd, 0.8);
    this.muzzleLight.intensity = this.flashT > 0 ? 12 : 0;

    if (this.shadowRefreshT > 0) {
      this.shadowRefreshT -= dt;
      if (this.shadowRefreshT <= 0) this.renderer.shadowMap.needsUpdate = true;
    }
    this.updateMood(dt);
    this.fx.update(dt, this.camera.position);
    this.decals.update(dt);
    this.mapView.update(this.t, this.camera.position);
    this.foliage.update(this.t, this.camera.position);

    this.renderer.info.reset();
    this.renderer.autoClear = true;
    // alta e média passam pelo acabamento (a média sem o brilho); a baixa desenha direto
    if (this.q.level !== 'baixa') {
      this.bloomPass.enabled = this.q.bloom;
      this.gradePass.uniforms.time.value = this.t;
      // na rodada infernal a vinheta fecha um pouco mais
      this.gradePass.uniforms.vignette.value = 0.38 + this.hellK * 0.2;
      this.composer.render(dt);
    } else this.renderer.render(this.scene, this.camera);
    if (life !== 'dead' && !this.over && !scoped) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.weapon.scene, this.weapon.camera);
    }
    this.perf.calls = this.renderer.info.render.calls;
    this.perf.tris = this.renderer.info.render.triangles;

    // som por último: um problema no áudio nunca impede a imagem
    this.audio.setListener(this.camera.position, fwd);
    const hp = this.me?.health ?? PLAYER.maxHealth;
    this.audio.heartbeat(dt, life === 'alive' && hp < 45 ? 1 - hp / 45 : 0);
  }

  // Dicas de primeira vez da Trincheira: perto (menos de 3,5 m) de uma pá, gerador, tanque, peça, bancada ou monte de terra
  private updateTips(dt: number, mounds: number[]) {
    if (!this.tips.enabled) return;
    this.tipT -= dt;
    if (this.tipT > 0) return;
    this.tipT = 0.3;
    const p = this.pc.pos;
    const near = (x: number, z: number) => Math.hypot(x - p.x, z - p.z) < 3.5;
    const show = (kind: string) => {
      if (this.tips.take(kind)) this.hud.notify(`<span class="tip">Dica: ${TIP_TEXT[kind]}</span>`);
    };
    for (const it of this.o.map.interactables) {
      const kind = it.kind === 'tank' ? 'tank' : it.kind;
      if ((kind === 'shovel' || kind === 'generator' || kind === 'tank' || kind === 'part' || kind === 'bench') && near(it.use[0], it.use[1])) {
        show(kind);
        return;
      }
    }
    const T = this.o.map.trincheira;
    if (T && mounds.some((i) => T.mounds[i] && near(T.mounds[i][0], T.mounds[i][1]))) show('mound');
  }

  // Só em desenvolvimento (?autoplay, solo): atalhos da Trincheira para os testes automáticos.
  debugTr(cmd: string, arg?: string) {
    if (!AUTOPLAY) return;
    const sim = (this.transport as unknown as { sim?: { tr: { debug(c: string, a: string | undefined, p: unknown): void } | null; players: Map<string, unknown> } }).sim;
    const p = sim?.players.get(this.transport.localId);
    if (cmd.startsWith('tp:')) {
      const [x, z] = cmd.slice(3).split(',').map(Number);
      this.pc.spawn(x, z, this.pc.yaw);
      return;
    }
    if (cmd === 'rodada' && sim) {
      const q = sim as unknown as { round: number; state: string; stateTimer: number; toSpawn: number; zombies: Map<number, unknown> };
      q.round = Number(arg ?? 1) - 1;
      q.state = 'intermission';
      q.stateTimer = 0.1;
      q.toSpawn = 0;
      q.zombies.clear();
      return;
    }
    if (sim?.tr && p) sim.tr.debug(cmd, arg, p);
  }

  // Só em desenvolvimento (?autoplay ou ?registro, solo): baixa o registro de ajuste da partida (F1); em produção a função nem existe
  baixarRegistro() {
    if (!import.meta.env.DEV) return;
    const sim = (this.transport as unknown as { sim?: { devLog(): unknown } }).sim;
    const log = sim?.devLog();
    if (log) void import('./devlog').then((m) => m.baixarRegistro(log));
  }

  // Só em desenvolvimento: dá pontos ao jogador local (testes automáticos no solo).
  debugPoints(n: number) {
    const sim = (this.transport as unknown as { sim?: { players: Map<string, { points: number }> } }).sim;
    const p = sim?.players.get(this.transport.localId);
    if (p) p.points = n;
  }

  // Barricada quebrada por perto: segurar F conserta (+10 por tábua até 500 por rodada).
  private updateRepair(canRepair: boolean): boolean {
    let target: number | null = null;
    const boards = this.buffer.latest?.s.boards;
    if (canRepair && boards) {
      let bestD = 1.9;
      for (const e of this.o.map.entries) {
        if ((boards[e.id] ?? ENTRY_BOARDS) >= ENTRY_BOARDS) continue;
        const p = entryPoints(e).inside;
        const d = Math.hypot(p[0] - this.pc.pos.x, p[1] - this.pc.pos.z);
        if (d < bestD) {
          bestD = d;
          target = e.id;
        }
      }
    }
    const want = target !== null && this.input.held('use') && !this.weapon.busy ? target : null;
    if (want !== this.repairEntry) {
      this.repairEntry = want;
      this.transport.send({ t: 'repair', entry: want });
    }
    if (target === null) return false;
    this.hud.prompt(want !== null ? 'Consertando a barricada...' : `Segure <b>${this.useKey}</b> para consertar a barricada <span class="price">+10</span>`, want !== null ? (boards![target] ?? 0) / ENTRY_BOARDS : null);
    return true;
  }

  // Painel do ônibus: parado (onde e em quantos segundos sai) ou andando (para qual parada vai)
  private updateBusInfo() {
    const route = this.o.map.bus;
    const b = this.buffer.latest?.s.bus;
    if (!route || !b || this.over) {
      this.hud.setBus(null);
      return;
    }
    const name = (id: string | null) => this.o.map.zones?.find((z) => z.id === id)?.name ?? '';
    // próxima parada: a primeira depois do trecho da estrada em que o ônibus está
    const path = route.path;
    let seg = 0;
    let best = Infinity;
    for (let i = 0; i < path.length; i++) {
      const [ax, az] = path[i];
      const [cx, cz] = path[(i + 1) % path.length];
      const dx = cx - ax, dz = cz - az;
      const t = clamp(((b.x - ax) * dx + (b.z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      const d = Math.hypot(b.x - ax - dx * t, b.z - az - dz * t);
      if (d < best) {
        best = d;
        seg = i;
      }
    }
    let next = route.stops[0];
    for (let k = 1; k <= path.length; k++) {
      const s = route.stops.find((st) => st.at === (seg + k) % path.length);
      if (s) {
        next = s;
        break;
      }
    }
    const onBus = this.onBusNow();
    let text: string;
    if (b.stop) text = b.wait > 0.5 ? `Ônibus na ${name(b.stop)} · sai em ${Math.ceil(b.wait)} s` : `Ônibus saindo da ${name(b.stop)}`;
    else text = onBus ? `No ônibus · próxima parada: ${name(next.zone)}` : `Ônibus indo para a ${name(next.zone)}`;
    const dx = b.x - this.pc.pos.x, dz = b.z - this.pc.pos.z;
    const dist = Math.round(Math.hypot(dx, dz));
    let angle: number | null = null;
    if (!onBus && dist > 6) {
      let rel = Math.atan2(-dx, -dz) - this.pc.yaw;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      angle = (-rel * 180) / Math.PI;
    }
    this.hud.setBus({ text, angle, dist: onBus || dist <= 6 ? null : dist, leaving: !!b.stop && b.wait < 6 });
  }

  // jogador em pé dentro do ônibus agora
  private onBusNow(): boolean {
    const b = this.busView?.pose;
    return !!b && standingIn(b, this.pc.pos.x, this.pc.pos.y, this.pc.pos.z);
  }

  // Clima da rodada infernal: névoa vermelha entrando e saindo devagar, clarões dos raios e uivos ao longe.
  private updateMood(dt: number) {
    const hell = !!this.buffer.latest?.s.hell;
    this.hud.setHell(hell);
    const sn = this.buffer.latest?.s;
    if (sn?.bispo) this.hud.setBoss({ hp: sn.bispo.hp, armor: sn.bispo.shield }, 'O BISPO');
    else this.hud.setBoss(sn?.boss ?? null, this.o.map.boss === 'blindado' ? 'O BLINDADO' : 'O CARRASCO');
    this.zombies.bispoShield = !!sn?.bispo?.shield;
    this.zombies.bossHp = sn?.boss?.hp ?? null;
    for (let i = this.warns.length - 1; i >= 0; i--) {
      const w = this.warns[i];
      w.t += dt;
      if (w.t >= w.dur) this.warns.splice(i, 1);
      else this.fx.warnRing(w.x, w.z, BISPO.pillar.radius, w.t / w.dur, dt);
    }
    const rc = this.o.map.ritual?.candles;
    if (rc && sn?.ritual) sn.ritual.candles.forEach((lit, i) => {
      if (lit && sn.ritual!.state !== 'done') this.fx.flame(`ritual${i}`, new THREE.Vector3(rc[i][0], rc[i][1], rc[i][2]), dt, 6, 0.2);
    });
    this.hellK = clamp(this.hellK + (hell ? dt / 2.5 : -dt / 4), 0, 1);
    this.boltFlash = Math.max(0, this.boltFlash - dt * 5);
    this.mapView.setSkyFlash(this.tr?.skyFlash ?? 0);
    this.mapView.setMood(this.hellK, this.boltFlash);
    // Rota: névoa mais fechada na estrada; o nome da parada aparece ao chegar
    const zones = this.o.map.zones;
    if (zones) {
      const p = this.pc.pos;
      const z = zones.find((zn) => p.x > zn.rect.minX && p.x < zn.rect.maxX && p.z > zn.rect.minZ && p.z < zn.rect.maxZ) ?? null;
      const id = z?.id ?? null;
      if (id !== this.zone) {
        const first = this.zone === undefined;
        this.zone = id;
        if (z) this.hud.showBanner(z.name.toUpperCase(), 'zone');
        else if (!first && !(this.busView?.pose && this.pc.pulled === false && this.onBusNow())) this.hud.notify('<b>Névoa</b>: fique longe dela ou os Vultos aparecem.');
      }
      const road = !id && !this.onBusNow();
      this.fogK = clamp(this.fogK + (road ? dt / 2.5 : -dt / 2.5), 0, 1);
      const base = this.o.map.fogDensity ?? FOG_DENSITY;
      this.mapView.setFogBase(base + ((this.o.map.fogRoad ?? base) - base) * this.fogK, this.fogK);
      this.fogBanks?.update(dt, this.camera.position, this.fogK * (1 - this.hellK * 0.6), this.mapView.fogColor);
    }
    const power = !!this.buffer.latest?.s.power;
    if (power !== this.lastPower) {
      this.lastPower = power;
      this.mapView.setPower(power);
    }
    if (this.mapView.takeShadowDirty()) this.renderer.shadowMap.needsUpdate = true;
    this.fx.setFog(this.mapView.fogColor, this.mapView.fogDensity);
    if (hell) {
      this.howlT -= dt;
      if (this.howlT <= 0) {
        this.howlT = 6 + Math.random() * 6;
        const a = Math.random() * Math.PI * 2;
        this.audio.dogHowl(new THREE.Vector3(this.pc.pos.x + Math.cos(a) * 35, 2, this.pc.pos.z + Math.sin(a) * 35));
      }
    }
  }

  // A Caixa Misteriosa só aparece no local onde ela está.
  private boxUsable(spot: number): boolean {
    const b = this.buffer.latest?.s.box;
    return !!b && b.loc === spot && b.state !== 'moving';
  }

  // Caixotes e máquinas: aviso na tela e compra com F. Reanimar um aliado tem prioridade.
  private updateInteract(dt: number, canUse: boolean): boolean {
    this.buyPending = Math.max(0, this.buyPending - dt);
    const me = this.me;
    const snap = this.buffer.latest?.s;
    if (!canUse || !me) {
      this.releaseHold();
      return false;
    }
    // candidatos ao alcance, do mais perto ao mais longe (a Trincheira soma peças soltas por zumbis)
    const all = this.tr && snap ? [...this.o.map.interactables, ...this.tr.extraInteractables(snap)] : this.o.map.interactables;
    const cands: [number, Interactable][] = [];
    for (const it of all) {
      if (it.kind === 'door' && this.world.openDoors.has(it.door!)) continue;
      if (it.kind === 'box' && !this.boxUsable(it.box!)) continue;
      const d = Math.hypot(it.use[0] - this.pc.pos.x, it.use[1] - this.pc.pos.z);
      const near = it.minY !== undefined ? this.pc.pos.y >= it.minY - 0.1 : Math.abs(this.pc.pos.y - it.y) < 1.2;
      if (d < (it.reach ?? 1.9) && near) cands.push([d, it]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    for (const [, best] of cands) {
      let r: { text: string; price: number; can: boolean; hold?: boolean } | null;
      if (best.kind in TR_KINDS) r = this.tr && snap ? this.tr.promptFor(best, snap, me, { useKey: this.useKey, solo: this.transport.solo, weaponName: this.weapon.def.name }) : null;
      else r = this.basePrompt(best, me);
      if (!r) continue;
      const poor = r.can && me.points < r.price;
      this.hud.prompt(r.text, null, poor);
      if (r.hold) {
        // cavar e montar: segurar F (a simulação conta o tempo)
        const want = r.can && this.input.held('use') && !this.weapon.busy ? best.id : null;
        if (want !== this.holdId) {
          this.holdId = want;
          this.transport.send({ t: 'hold', id: want });
        }
        return true;
      }
      this.releaseHold();
      if (r.can && this.input.hit('use') && !this.weapon.busy && this.buyPending <= 0) {
        if (poor) {
          this.audio.deny();
        } else {
          this.buyPending = 1;
          this.transport.send({ t: 'interact', id: best.id, weapon: this.weapon.def.id });
        }
      }
      return true;
    }
    this.releaseHold();
    return false;
  }

  private releaseHold() {
    if (this.holdId === null) return;
    this.holdId = null;
    this.transport.send({ t: 'hold', id: null });
  }

  // Texto, preço e se dá para comprar o que está na frente (Cidade, Rota e o que é comum aos mapas).
  private basePrompt(best: Interactable, me: NetPlayer): { text: string; price: number; can: boolean } | null {
    let text: string;
    let price = 0;
    let can = true;
    if (best.kind === 'door') {
      const d = this.o.map.doors.find((x) => x.id === best!.door)!;
      price = d.cost;
      text = `Pressione <b>${this.useKey}</b> para abrir <b>${d.name}</b> <span class="price">${price}</span>`;
    } else if (best.kind === 'weapon') {
      const def = WEAPONS[best.weapon!];
      const upId = upgradeId(def.id);
      if (me.weapons.includes(upId)) {
        price = wallAmmoPrice(upId);
        if (this.weapon.isFull(upId)) {
          text = `Munição de <b>${WEAPONS[upId].name}</b> cheia`;
          can = false;
        } else {
          text = `Pressione <b>${this.useKey}</b> para comprar munição de <b>${WEAPONS[upId].name}</b> <span class="price">${price}</span>`;
        }
      } else if (me.weapons.includes(def.id)) {
        price = wallAmmoPrice(def.id);
        if (this.weapon.isFull(def.id)) {
          text = `Munição de <b>${def.name}</b> cheia`;
          can = false;
        } else {
          text = `Pressione <b>${this.useKey}</b> para comprar munição de <b>${def.name}</b> <span class="price">${price}</span>`;
        }
      } else {
        price = def.cost;
        const full = me.weapons.length >= 2 + (me.perks.includes('mula') ? 1 : 0);
        text = `Pressione <b>${this.useKey}</b> para comprar <b>${def.name}</b> <span class="price">${price}</span>${full ? `<small>No lugar de: ${this.weapon.def.name}</small>` : ''}`;
      }
    } else if (best.kind === 'box') {
      const b = this.buffer.latest!.s.box;
      if (b.state === 'idle') {
        price = b.fireSale ? 10 : BOX.cost;
        text = `Pressione <b>${this.useKey}</b> para girar a <b>Caixa Misteriosa</b> <span class="price">${price}</span>`;
      } else if (b.state === 'offer' && b.pid === this.transport.localId && b.weapon) {
        const full = me.weapons.length >= 2 + (me.perks.includes('mula') ? 1 : 0);
        text = `Pressione <b>${this.useKey}</b> para pegar <b>${b.weapon === 'artilharia' ? '3 Granadas de Artilharia' : WEAPONS[b.weapon]?.name ?? b.weapon}</b>${full ? `<small>No lugar de: ${this.weapon.def.name}</small>` : ''}`;
      } else {
        return null;
      }
    } else if (best.kind === 'bank') {
      const bal = bankBalance(this.o.playerName);
      if (best.bank === 'deposit') {
        price = BANK.step;
        if (!canDeposit(this.o.playerName)) {
          text = `Banco cheio (limite de ${BANK.limit.toLocaleString('pt-BR')})`;
          can = false;
        } else {
          text = `Pressione <b>${this.useKey}</b> para depositar <span class="price">${BANK.step}</span><small>Saldo guardado: ${bal.toLocaleString('pt-BR')}</small>`;
        }
      } else if (bal < BANK.step) {
        text = `Saldo insuficiente para sacar (${bal.toLocaleString('pt-BR')})`;
        can = false;
      } else {
        text = `Pressione <b>${this.useKey}</b> para sacar ${BANK.step} (taxa ${BANK.fee})<small>Saldo guardado: ${bal.toLocaleString('pt-BR')}</small>`;
      }
    } else if (best.kind === 'sight') {
      const s = SIGHTS[best.sight!];
      const def = this.weapon.def;
      price = s.cost;
      if (!sightFits(best.sight!, def.id)) {
        text = `<b>${s.name}</b> não serve nesta arma<small>Serve em: ${s.weapons.map((w) => WEAPONS[w].name).join(', ')}</small>`;
        can = false;
      } else if (me.sights[baseId(def.id)] === best.sight) {
        text = `Esta arma já tem <b>${s.name}</b>`;
        can = false;
      } else {
        const old = me.sights[baseId(def.id)];
        text = `Pressione <b>${this.useKey}</b> para instalar <b>${s.name}</b> <span class="price">${price}</span>${old ? `<small>Troca o ${SIGHTS[old].name}</small>` : `<small>Na arma da mão: ${def.name}</small>`}`;
      }
    } else if (best.kind === 'candle') {
      const f = this.buffer.latest!.s.forge;
      if (f.on || f.candles[best.candle!]) return null;
      text = `Pressione <b>${this.useKey}</b> para acender a vela`;
    } else if (best.kind === 'ritual') {
      const r = this.buffer.latest?.s.ritual;
      if (!r || r.state !== 'idle' || r.candles[best.candle!]) return null;
      if (!this.buffer.latest!.s.forge.on) {
        text = 'Uma vela preta, fria<small>Algo precisa queimar antes dela</small>';
        can = false;
      } else {
        text = `Pressione <b>${this.useKey}</b> para acender a <b>vela preta</b>`;
      }
    } else if (best.kind === 'power') {
      if (this.buffer.latest?.s.power) return null;
      text = `Pressione <b>${this.useKey}</b> para ligar a <b>energia</b><small>Acende as bebidas e abre o cofre da Forja</small>`;
    } else if (best.kind === 'forge') {
      const f = this.buffer.latest!.s.forge;
      const def = this.weapon.def;
      if (!f.on) {
        text = this.o.map.forgeNeedsGenerators ? 'A Forja ainda dorme no fundo do poço. Ligue os 6 geradores.' : this.o.map.forge.candles.length ? 'A Forja está fria. Acenda as três velas do cemitério.' : 'A Forja está fria. Ligue a energia na Usina.';
        can = false;
      } else if (f.state === 'ready' && f.pid === this.transport.localId && f.weapon) {
        text = `Pressione <b>${this.useKey}</b> para pegar <b>${WEAPONS[f.weapon]?.name}</b>`;
      } else if (f.state !== 'idle') {
        return null;
      } else if (def.upgraded || !WEAPONS[upgradeId(def.id)]) {
        text = 'Esta arma já foi forjada';
        can = false;
      } else if (me.weapons.length < 2) {
        text = 'Compre outra arma antes de entregar a única que tem';
        can = false;
      } else {
        price = FORGE.cost;
        text = `Pressione <b>${this.useKey}</b> para forjar a <b>${def.name}</b> <span class="price">${price}</span><small>Vira ${WEAPONS[upgradeId(def.id)].name}</small>`;
      }
    } else if (best.kind === 'grenade') {
      price = GRENADE.cost;
      if (me.grenades >= GRENADE.max) {
        text = 'Granadas cheias';
        can = false;
      } else {
        text = `Pressione <b>${this.useKey}</b> para comprar granadas <span class="price">${price}</span>`;
      }
    } else if (best.kind === 'knife') {
      price = KNIFE.heavyCost;
      if (me.heavyKnife) {
        text = 'Você já tem a faca pesada';
        can = false;
      } else {
        text = `Pressione <b>${this.useKey}</b> para comprar a <b>faca pesada</b> <span class="price">${price}</span><small>Mata com um golpe até a rodada 4</small>`;
      }
    } else if (best.kind === 'ammo') {
      price = ammoPrice(this.weapon.def.id) ?? 0;
      if (this.weapon.full) {
        text = 'Munição cheia';
        can = false;
      } else {
        text = `Pressione <b>${this.useKey}</b> para encher a munição <span class="price">${price}</span>`;
      }
    } else {
      const d = PERKS[best.perk as PerkId];
      price = perkPrice(d.id, this.transport.solo);
      const pg = this.o.map.perkGen?.[d.id];
      if (this.o.map.perksNeedPower && !this.buffer.latest?.s.power) {
        text = `<b>${d.name}</b> sem energia<small>Ligue a alavanca na Usina</small>`;
        can = false;
      } else if (pg !== undefined && !this.buffer.latest?.s.tr?.gens[pg]?.on) {
        text = `<b>${d.name}</b> sem energia<small>Ligue o gerador desta área</small>`;
        can = false;
      } else if (me.perks.includes(d.id)) {
        text = `Você já tem <b>${d.name}</b>`;
        can = false;
      } else if (me.perks.length >= MAX_PERKS + (me.extraPerk ? 1 : 0)) {
        text = `Limite de ${MAX_PERKS + (me.extraPerk ? 1 : 0)} bebidas`;
        can = false;
      } else if (d.id === 'folego' && this.transport.solo && me.selfRevives >= SOLO_SELF_REVIVES) {
        text = 'Segundo Fôlego esgotado nesta partida';
        can = false;
      } else {
        text = `Pressione <b>${this.useKey}</b> para beber <b>${d.name}</b> <span class="price">${price}</span><small>${d.desc}</small>`;
      }
    }
    return { text, price, can };
  }

  // Aplica os efeitos das bebidas que dependem do navegador (recarga, cadência, corrida) e toca as vinhetas.
  private applyPerks(dt: number) {
    const perks = this.me?.perks ?? [];
    this.weapon.mods.reload = perks.includes('reflexo') ? PERK_FX.reflexoReloadMult : 1;
    this.weapon.mods.fire = perks.includes('gatilho') ? PERK_FX.gatilhoFireMult : 1;
    this.pc.mods.sprintSpeed = perks.includes('passo') ? PERK_FX.passoSpeedMult : 1;
    this.pc.mods.stamina = perks.includes('passo') ? PERK_FX.passoStaminaMult : 1;
    this.weapon.shieldHand = !!this.me?.shieldHand;
    this.pc.weaponMove = this.me?.shieldHand ? TRINCHEIRA.shieldHandMove : this.weapon.def.moveMult ?? 1;
    this.hud.setPerks(perks);
    for (const it of this.o.map.interactables) {
      if (it.kind !== 'perk') continue;
      const left = (this.jingleT.get(it.id) ?? 8 + Math.random() * 20) - dt;
      if (left > 0) {
        this.jingleT.set(it.id, left);
        continue;
      }
      this.jingleT.set(it.id, 45 + Math.random() * 40);
      if (Math.hypot(it.use[0] - this.pc.pos.x, it.use[1] - this.pc.pos.z) < 14) {
        this.audio.perkJingle(new THREE.Vector3(it.use[0], 1.6, it.use[1]), Object.keys(PERKS).indexOf(it.perk!));
      }
    }
  }

  private updateRevive(canRevive: boolean): boolean {
    let target: NetPlayer | null = null;
    const snap = this.buffer.latest;
    if (canRevive && snap) {
      let bestD = REVIVE_RANGE;
      for (const p of snap.s.players) {
        if (p.id === this.transport.localId || p.life !== 'downed') continue;
        const d = Math.hypot(p.x - this.pc.pos.x, p.z - this.pc.pos.z);
        if (d <= bestD) {
          bestD = d;
          target = p;
        }
      }
    }
    const holding = !!target && this.input.held('use');
    const want = holding ? target!.id : null;
    if (want !== this.reviveTarget) {
      this.reviveTarget = want;
      this.transport.send({ t: 'revive', target: want });
    }
    if (target) {
      this.hud.prompt(holding ? `Reanimando ${target.name}...` : `Segure <b>${this.useKey}</b> para reanimar ${target.name}`, holding ? target.revive : null);
      return true;
    }
    return false;
  }

  private updateHud(dt: number, life: string) {
    const w = this.weapon;
    this.hud.setAmmo(w.ammo, w.reserve, w.def.name, w.def.mag);
    const px = (w.spread / Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) * (window.innerHeight / 2);
    this.hud.setCrosshair(Math.max(6, px), w.ads < 0.5 && w.sprintT < 0.5 && life !== 'dead' && !this.over);
    this.hud.update(dt, this.me?.health ?? PLAYER.maxHealth, this.me?.maxHealth ?? PLAYER.maxHealth);

    if (life === 'downed' && !this.over) {
      if (this.transport.solo) this.hud.downed(true, this.me?.revive ?? 0, 'Segundo Fôlego: levantando...');
      else this.hud.downed(true, (this.me?.bleed ?? 0) / BLEEDOUT_TIME, 'Aguente firme. Rasteje com W A S D até um aliado reanimar você.');
    } else {
      this.hud.downed(false);
    }

    // marcadores de aliados caídos
    const markers: Marker[] = [];
    const snap = this.buffer.latest;
    if (snap) {
      const v = new THREE.Vector3();
      const W = window.innerWidth;
      const H = window.innerHeight;
      for (const p of snap.s.players) {
        if (p.id === this.transport.localId || p.life !== 'downed') continue;
        v.set(p.x, p.y + 0.6, p.z).project(this.camera);
        const behind = v.z > 1;
        let x = (v.x * 0.5 + 0.5) * W;
        let y = (-v.y * 0.5 + 0.5) * H;
        if (behind) {
          // atrás: na borda esquerda ou direita, na altura do meio (longe do HUD de baixo)
          x = W - x < W / 2 ? 0 : W;
          y = H * 0.45;
        }
        const onScreen = !behind && x > 30 && x < W - 30 && y > 30 && y < H - 30;
        // longe o bastante da borda para o nome caber na tela
        x = Math.min(W - 70, Math.max(70, x));
        y = Math.min(H - 30, Math.max(30, y));
        const d = Math.round(Math.hypot(p.x - this.pc.pos.x, p.z - this.pc.pos.z));
        markers.push({ x, y, onScreen, label: `${p.name} · ${d} m`, color: PLAYER_COLORS[p.slot % PLAYER_COLORS.length] });
      }
      // itens no chão até 80 m: símbolo na tela (ou na borda, se estiver fora da vista)
      for (const pu of snap.s.powerups) {
        const d = Math.hypot(pu.x - this.pc.pos.x, pu.z - this.pc.pos.z);
        if (d > 80) continue;
        v.set(pu.x, pu.y + 2.1, pu.z).project(this.camera);
        const behind = v.z > 1;
        let x = (v.x * 0.5 + 0.5) * W;
        let y = (-v.y * 0.5 + 0.5) * H;
        if (behind) {
          // atrás: na borda esquerda ou direita, na altura do meio (longe do HUD de baixo)
          x = W - x < W / 2 ? 0 : W;
          y = H * 0.45;
        }
        const onScreen = !behind && x > 30 && x < W - 30 && y > 30 && y < H - 30;
        // de perto o item já se vê bem: só o símbolo some se estiver na tela e a menos de 6 m
        if (onScreen && d < 6) continue;
        // longe o bastante da borda para o nome caber na tela
        x = Math.min(W - 70, Math.max(70, x));
        y = Math.min(H - 30, Math.max(30, y));
        const def = POWERUPS[pu.kind];
        markers.push({ x, y, onScreen, label: `${def.name} · ${Math.round(d)} m`, color: def.color, icon: def.glyph, item: true });
      }
    }
    this.hud.markers(markers);
    this.updateBusInfo();
    this.hud.clickToPlay(!this.input.locked && !this.hud.overlayOpen && !this.over);
    if (this.t - this.infoT > 0.5) {
      this.infoT = this.t;
      const res = this.scale < 1 ? ` · ${Math.round(this.scale * 100)}%` : '';
      const perf = this.perfOn ? ` · ${this.perf.calls} chamadas · ${(this.perf.tris / 1000).toFixed(0)} mil tri` : '';
      this.hud.netinfo(`${this.fps} FPS${res}${perf}${this.transport.solo ? '' : ` · ${Math.round(this.transport.ping)} ms`}`);
    }
  }

  // ---------- menus ----------

  private onUnlock() {
    if (this.over || this.disposed || this.hud.overlayOpen) return;
    this.showPause();
  }

  // Menu de jogo (Esc): abas Jogo, Vídeo, Áudio e Controles. No solo a partida para; no co-op segue rodando.
  private showPause() {
    // solta o mouse (com ele capturado, os cliques iriam para a tela do jogo, não para o menu)
    this.input.unlock();
    this.transport.paused = true;
    const solo = this.transport.solo;
    const snap = this.buffer.latest?.s;
    const me = snap?.players.find((p) => p.id === this.transport.localId);
    const mins = Math.floor(this.t / 60);
    const secs = String(Math.floor(this.t % 60)).padStart(2, '0');
    const ov = this.hud.showOverlay(`
      <div class="panel pause gm">
        <div class="gm-head">
          <h2>${solo ? 'Pausado' : 'Menu'}</h2>
          <div class="gm-info"><b>${escapeHtml(this.o.map.name)}</b> · Rodada ${Math.max(1, snap?.round ?? 1)} · ${mins}:${secs}${me ? ` · ${me.points.toLocaleString('pt-BR')} pontos · ${me.kills} abates` : ''}</div>
        </div>
        ${solo ? '' : '<p class="muted gm-coop">A partida continua rodando para os outros jogadores.</p>'}
        <div class="gm-tabs">${PAUSE_TABS.map(([id, label]) => `<button type="button" data-tab="${id}" class="${id === this.pauseTab ? 'on' : ''}">${label}</button>`).join('')}</div>
        <div class="gm-body"></div>
        <p class="gm-foot muted">Esc volta ao jogo</p>
      </div>`);
    const body = ov.querySelector<HTMLElement>('.gm-body')!;
    ov.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((t) => t.addEventListener('click', () => {
      this.pauseTab = t.dataset.tab as PauseTab;
      ov.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === t));
      this.renderPauseTab(body);
    }));
    this.renderPauseTab(body);
    this.closePauseKeys();
    this.pauseOpenedAt = performance.now();
    window.addEventListener('keydown', this.onPauseKey);
  }

  private pauseTab: PauseTab = 'jogo';
  // o Esc que abriu o menu (soltando o mouse) pode chegar também como tecla: não fecha o menu na hora
  private pauseOpenedAt = 0;
  private stopKeysEditor: (() => void) | null = null;

  // Esc com o menu aberto volta ao jogo (menos enquanto o editor de teclas espera uma tecla)
  private onPauseKey = (e: KeyboardEvent) => {
    if (e.code !== 'Escape' || e.repeat || !this.hud.overlayOpen || this.over || performance.now() - this.pauseOpenedAt < 350) return;
    const box = document.querySelector<HTMLElement>('.gm-body');
    if (box && isListening(box)) return;
    e.preventDefault();
    void this.resume();
  };

  private mapTimer = 0;

  private closePauseKeys() {
    clearInterval(this.mapTimer);
    window.removeEventListener('keydown', this.onPauseKey);
    this.stopKeysEditor?.();
    this.stopKeysEditor = null;
  }

  private async resume() {
    this.closePauseKeys();
    this.hud.hideOverlay();
    this.transport.paused = false;
    const ok = await this.input.lock();
    // o navegador às vezes recusa capturar o mouse logo depois do Esc: o menu volta e o clique em Continuar resolve
    if (!ok && !AUTOPLAY && !this.disposed && !this.over && !this.input.locked && !this.hud.overlayOpen) this.showPause();
  }

  private saveSettings() {
    this.o.onSettings({ ...this.settings });
  }

  // controle deslizante ligado a uma opção numérica
  private slider(box: HTMLElement, label: string, key: 'sensitivity' | 'fov' | 'volume' | 'music' | 'brightness', min: number, max: number, step: number, show: (v: number) => string, apply?: (v: number) => void) {
    const el = document.createElement('label');
    el.className = 'slider';
    el.innerHTML = `${label} <input type="range" min="${min}" max="${max}" step="${step}" value="${this.settings[key]}"><output>${show(this.settings[key])}</output>`;
    const inp = el.querySelector('input')!;
    inp.addEventListener('input', () => {
      const v = Number(inp.value);
      this.settings[key] = v;
      el.querySelector('output')!.textContent = show(v);
      apply?.(v);
      this.saveSettings();
    });
    box.append(el);
  }

  private renderPauseTab(body: HTMLElement) {
    clearInterval(this.mapTimer);
    this.stopKeysEditor?.();
    this.stopKeysEditor = null;
    body.innerHTML = '';
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const tab = this.pauseTab;
    if (tab === 'jogo') {
      const solo = this.transport.solo;
      body.innerHTML = `
        <div class="gm-actions">
          <button class="btn primary" data-act="resume">Continuar</button>
          ${solo && this.o.onRestart ? '<button class="btn" data-act="restart">Reiniciar partida</button>' : ''}
          <button class="btn ghost" data-act="exit">${solo ? 'Sair para o menu' : 'Sair da partida'}</button>
        </div>
        <p class="gm-confirm muted"></p>`;
      // Trincheira: a planta do mapa, redesenhada a cada meio segundo enquanto o menu está aberto
      if (this.o.map.trincheira) {
        const { w, h } = plantaSize(this.o.map);
        const cv = document.createElement('canvas');
        cv.id = 'pause-map';
        cv.className = 'pause-map';
        cv.width = w;
        cv.height = h;
        body.append(cv);
        const draw = () => {
          const snap = this.buffer.latest?.s;
          if (!snap) return;
          drawPlanta(cv, this.o.map, {
            snap,
            eu: { x: this.pc.pos.x, z: this.pc.pos.z, yaw: this.pc.yaw },
            aliados: this.players.positions().map((p) => ({ x: p.x, z: p.z, name: p.id })),
          });
        };
        draw();
        this.mapTimer = window.setInterval(draw, 500);
      }
      const confirm = body.querySelector<HTMLElement>('.gm-confirm')!;
      // reiniciar e sair perdem a partida: pedem um segundo clique
      const twice = (btn: HTMLButtonElement, msg: string, go: () => void) => {
        let armed = false;
        btn.addEventListener('click', () => {
          if (armed) return go();
          armed = true;
          btn.classList.add('armed');
          btn.textContent = 'Clique de novo para confirmar';
          confirm.textContent = msg;
        });
      };
      body.querySelector('[data-act="resume"]')!.addEventListener('click', () => void this.resume());
      const restart = body.querySelector<HTMLButtonElement>('[data-act="restart"]');
      if (restart) twice(restart, 'A partida atual termina sem contar no placar.', () => {
        this.closePauseKeys();
        this.o.onRestart?.();
      });
      twice(body.querySelector<HTMLButtonElement>('[data-act="exit"]')!, solo ? 'A partida atual termina sem contar no placar.' : 'Você sai da sala; os outros continuam jogando.', () => {
        this.closePauseKeys();
        this.o.onExit();
      });
      return;
    }
    if (tab === 'video') {
      const q = document.createElement('div');
      q.className = 'quality';
      const used = () => `Em uso: ${QUALITY_LABEL[this.q.level]} · resolução ${Math.round(this.scale * 100)}%`;
      q.innerHTML = `<span>Qualidade gráfica</span>
        <div class="seg">${(['auto', 'alta', 'media', 'baixa'] as QualitySetting[]).map((k) => `<button type="button" data-q="${k}" class="${this.settings.quality === k ? 'on' : ''}">${QUALITY_LABEL[k]}</button>`).join('')}</div>
        <small class="used">${used()}</small>
        <small class="gpu ${this.o.gpu.software ? 'bad' : ''}">${this.o.gpu.software ? 'Sem aceleração gráfica: ative a aceleração de hardware no navegador.' : 'Placa: ' + escapeHtml(this.o.gpu.renderer || 'desconhecida')}</small>`;
      q.querySelectorAll<HTMLButtonElement>('button[data-q]').forEach((b) => b.addEventListener('click', () => {
        this.setQuality(b.dataset.q as QualitySetting);
        q.querySelectorAll('button[data-q]').forEach((x) => x.classList.toggle('on', x === b));
        q.querySelector('.used')!.textContent = used();
      }));
      body.append(q);
      this.slider(body, 'Campo de visão', 'fov', 60, 100, 1, (v) => String(v));
      this.slider(body, 'Brilho', 'brightness', 0.7, 1.4, 0.05, pct, (v) => (this.renderer.toneMappingExposure = EXPOSURE * v));
      return;
    }
    if (tab === 'audio') {
      this.slider(body, 'Volume geral', 'volume', 0, 1, 0.05, pct, (v) => this.audio.setVolume(v));
      this.slider(body, 'Música e vinhetas', 'music', 0, 1, 0.05, pct, (v) => this.audio.setMusicVolume(v));
      return;
    }
    this.slider(body, 'Sensibilidade do mouse', 'sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2));
    const inv = document.createElement('label');
    inv.className = 'check';
    inv.innerHTML = `<input type="checkbox" ${this.settings.invertY ? 'checked' : ''}> Inverter o mouse (para cima olha para baixo)`;
    inv.querySelector('input')!.addEventListener('change', (e) => {
      this.settings.invertY = (e.target as HTMLInputElement).checked;
      this.saveSettings();
    });
    body.append(inv);
    const tip = document.createElement('label');
    tip.className = 'check';
    tip.innerHTML = `<input type="checkbox" data-opt="tips" ${this.settings.tips !== false ? 'checked' : ''}> Dicas de primeira vez (uma linha perto de pás, geradores, tanque e bancadas)`;
    tip.querySelector('input')!.addEventListener('change', (e) => {
      this.settings.tips = (e.target as HTMLInputElement).checked;
      this.tips.enabled = this.settings.tips;
      this.saveSettings();
    });
    body.append(tip);
    const keysBox = document.createElement('div');
    keysBox.className = 'keys-box';
    body.append(keysBox);
    this.stopKeysEditor = controlsEditor(keysBox, this.input.keys, (keys) => {
      this.input.keys = keys;
      this.hud.reloadKey = actionKey(keys, 'reload');
      this.settings.keys = keys;
      this.saveSettings();
    });
  }

  private gameOver(round: number) {
    if (this.over) return;
    this.over = true;
    if (import.meta.env.DEV) this.baixarRegistro();
    this.audio.gameOver();
    this.hud.downed(false);
    setTimeout(() => {
      if (this.disposed) return;
      this.input.unlock();
      // registra a partida no perfil do jogador (XP, estatísticas, recordes)
      const me = this.buffer.latest?.s.players.find((p) => p.id === this.transport.localId);
      const startRound = this.buffer.latest?.s.startRound ?? 1;
      const result = me
        ? recordMatch({
            name: this.o.playerName,
            mode: this.transport.solo ? 'solo' : 'coop',
            players: this.buffer.latest?.s.players.length ?? 1,
            round,
            startRound,
            kills: me.kills,
            headshots: me.headshots,
            downs: me.downs,
            revives: me.revives,
            earned: me.earned,
            seconds: this.t,
            weaponKills: this.weaponKills,
          })
        : null;
      const players = [...(this.buffer.latest?.s.players ?? [])].sort((a, b) => b.points - a.points);
      // destaque para quem mais matou (no co-op)
      const mvp = players.length > 1 ? [...players].sort((a, b) => b.kills - a.kills || b.points - a.points)[0] : null;
      const fmt = (n: number) => n.toLocaleString('pt-BR');
      const rows = players
        .map((p) => `<tr class="${p === mvp ? 'mvp' : ''}" style="color:${PLAYER_COLORS[p.slot % PLAYER_COLORS.length]}"><td>${escapeHtml(p.name)}${p === mvp ? '<span class="mvp-tag">Melhor da partida</span>' : ''}</td><td>${fmt(p.points)}</td><td>${p.kills}</td><td>${p.headshots}</td><td>${p.downs}</td><td>${p.revives}</td></tr>`)
        .join('');
      const mins = Math.floor(this.t / 60);
      const secs = String(Math.floor(this.t % 60)).padStart(2, '0');
      const restart = this.transport.solo && this.o.onRestart;
      const ov = this.hud.showOverlay(`
        <div class="panel gameover">
          <h1>FIM DE JOGO</h1>
          <p class="survived">${players.length > 1 ? 'Vocês sobreviveram' : 'Você sobreviveu'} ${round} rodada${round === 1 ? '' : 's'} <span class="muted">· ${mins}:${secs} de partida · ${escapeHtml(this.o.map.name)}</span></p>
          ${this.buffer.latest?.s.tr?.missao.step === 6 ? '<p class="survived">★ Missão <b>Canção da Escavação</b> concluída</p>' : ''}
          ${result ? `<div class="levelup"><span class="emb"></span><div class="lvl-info"><div class="xp-gain">+<span class="xp-count">0</span> XP</div><div class="xp-bar"><i></i></div><div class="lvl-line muted"></div>${result.record ? '<div class="new-level">Novo recorde pessoal!</div>' : ''}</div></div>` : ''}
          <table><thead><tr><th>Nome</th><th>Pontos</th><th>Abates</th><th>Na cabeça</th><th>Quedas</th><th>Reanimações</th></tr></thead><tbody>${rows}</tbody></table>
          <p class="muted online-note"></p>
          <div class="gameover-actions">
            ${restart ? '<button class="btn primary" data-act="again">Jogar de novo</button>' : ''}
            <button class="btn ${restart ? '' : 'primary'}" data-act="exit">Voltar ao menu</button>
          </div>
        </div>`);
      if (result) this.animateXp(ov, result);
      ov.querySelector('[data-act="exit"]')!.addEventListener('click', () => this.o.onExit());
      ov.querySelector('[data-act="again"]')?.addEventListener('click', () => this.o.onRestart?.());
      // placar online
      const note = ov.querySelector<HTMLElement>('.online-note')!;
      if (me && this.o.onlineRun) {
        note.textContent = 'Enviando ao placar online…';
        this.o.onlineRun({
          mode: this.transport.solo ? 'solo' : 'coop', map: this.o.map.id, round: Math.max(round, startRound), startRound,
          players: this.buffer.latest?.s.players.length ?? 1, kills: me.kills, headshots: me.headshots,
          downs: me.downs, revives: me.revives, seconds: Math.round(this.t),
          missao: this.buffer.latest?.s.tr?.missao.step === 6,
        }).then((m) => (note.textContent = m), (err: Error) => (note.textContent = `Placar online: ${err.message}`));
      }
    }, 2200);
  }

  // XP do fim de jogo: o número sobe, a barra enche (passando de nível quantas vezes for) e o emblema troca.
  private animateXp(ov: HTMLElement, result: MatchResult) {
    const count = ov.querySelector<HTMLElement>('.xp-count')!;
    const bar = ov.querySelector<HTMLElement>('.xp-bar i')!;
    const line = ov.querySelector<HTMLElement>('.lvl-line')!;
    const emb = ov.querySelector<HTMLElement>('.emb')!;
    let shown = -1;
    const badge = (level: number) => {
      if (level === shown) return;
      shown = level;
      const c = emblemCanvas(level, 144);
      emb.replaceChildren(c);
      animateEmblem(c, level);
    };
    const paint = (gained: number) => {
      let level = result.before.level;
      let into = result.before.into + gained;
      while (level < MAX_LEVEL && into >= xpForLevel(level)) into -= xpForLevel(level++);
      const need = level >= MAX_LEVEL ? 0 : xpForLevel(level);
      count.textContent = Math.round(gained).toLocaleString('pt-BR');
      bar.style.width = need ? `${(into / need) * 100}%` : '100%';
      if (level > shown && shown > 0) {
        line.className = 'lvl-line new-level';
        this.audio.forgeDone(this.camera.position);
      }
      if (level > result.before.level) line.textContent = `Novo nível ${level}: ${rankOf(level).name}`;
      else line.textContent = need ? `Nível ${level} · faltam ${Math.ceil(need - into).toLocaleString('pt-BR')} XP` : 'Nível máximo';
      badge(level);
    };
    paint(0);
    const dur = Math.min(2600, 900 + result.xp / 4);
    const t0 = performance.now() + 500;
    const step = (now: number) => {
      if (this.disposed) return;
      const k = clamp((now - t0) / dur, 0, 1);
      paint(result.xp * (1 - (1 - k) ** 3));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  connectionLost() {
    if (this.over) return;
    this.over = true;
    this.input.unlock();
    const ov = this.hud.showOverlay(`
      <div class="panel gameover">
        <h1>CONEXÃO PERDIDA</h1>
        <p class="survived">${'p2p' in this.transport ? 'O anfitrião saiu ou a conexão com ele caiu. Quem cria a sala roda a partida no próprio computador.' : 'O servidor encerrou a partida ou ficou fora do ar.'}</p>
        <button class="btn primary" data-act="exit">Voltar ao menu</button>
      </div>`);
    ov.querySelector('[data-act="exit"]')!.addEventListener('click', () => this.o.onExit());
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    // libera da placa de vídeo tudo o que esta partida criou (as texturas do cenário ficam para a próxima)
    freeScene([this.scene, this.weapon.scene], this.o.tex);
    this.nadeGeo.dispose();
    this.renderer.renderLists.dispose();

    window.removeEventListener('resize', this.resize);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    window.removeEventListener('keydown', this.onPerfKey);
    this.renderer.info.autoReset = true;
    this.closePauseKeys();
    this.renderer.domElement.removeEventListener('click', this.onCanvasClick);
    this.input.unlock();
    this.input.dispose();
    this.transport.close();
    this.audio.stopAmbience();
    if (this.tr) {
      this.audio.stopTrincheira();
      this.audio.setWeather('limpo');
      this.tr.dispose();
    }
    this.hud.dispose();
    this.mapView.dispose();
    this.foliage.dispose();
    this.fogBanks?.dispose();
    this.decals.dispose();
    this.fx.dispose();
    this.barricades.dispose();
    this.boxView.dispose();
    this.powerupView.dispose();
    this.forgeView.dispose();
    this.busView?.dispose();
    this.audio.stopBusEngine();
    this.zombies.dispose();
    this.players.dispose();
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
  }
}

function canThrowKey(input: Input) {
  return input.hit('grenade');
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
