import * as THREE from 'three';
import { BASE_PERKS, MAX_PERKS } from '../../shared/perks';
import { TRINCHEIRA } from '../../shared/constants';
import { colossusFeet, colossusPose } from '../../shared/colossus';
import type { Interactable, MapDef } from '../../shared/map/types';
import type { Element, GameEvent, NetPlayer, Snapshot, TrincheiraSnap } from '../../shared/protocol';
import { COLOSSI, ELEMENTS, ELEMENT_LIST, SET_PARTS, TEAM_ITEMS } from '../../shared/trincheira-info';
import type { Hud, TrAlert } from '../hud';
import type { QualityConfig } from '../quality';
import type { Sample } from '../snapbuffer';
import type { TexSet } from '../textures';
import { BenchView, DroneView } from './benchView';
import { CamaraFx } from './camaraFx';
import { EscavacaoView } from './escavacaoView';
import { Snd } from './common';
import { ColossusView } from './colossusView';
import type { TrCtx } from './ctx';
import { FizzView } from './fizzView';
import { ForjaView } from './forjaView';
import { GeneratorView } from './generatorView';
import { IgrejaView } from './igrejaView';
import { LamaView } from './lamaView';
import { MoundView } from './moundView';
import { PartsView } from './partsView';
import { SkyFx } from './skyFx';
import { StaffView } from './staffView';
import { TankView } from './tankView';
import { TrFx } from './trFx';
import { WeatherFx } from './weatherFx';

export interface TrPrompt {
  text: string;
  can: boolean;
  price: number;
  // segurar F (manda `hold`) em vez de apertar uma vez (cavar, montar na bancada)
  hold?: boolean;
}

export interface TrOptions {
  quality: QualityConfig;
  audio: unknown;
  // neve, escuridão da Câmara e luzes dos geradores no mapa (opcional)
  mapView?: { setSnow(k: number, ground?: number): void; setDim(k: number): void; setGens(on: boolean[]): void };
}

const EI: Record<Element, number> = { fogo: 0, gelo: 1, vento: 2, raio: 3 };
const GOALS = [TRINCHEIRA.challenge[0], 1, TRINCHEIRA.challenge[2], 1];

// Camada visual e sonora da Trincheira: geradores, Fonte da Sorte, Forja, tanque, colossos, clima, montes, peças,
// bancadas, drone, cajados, Câmara Antiga e os painéis do HUD. Só desenha o que a simulação manda (Snapshot.tr).
export class TrincheiraClient {
  // tremor pedido pelos efeitos (o game.ts lê e zera, como faz com zombies.quake)
  quake = 0;
  // clarão do céu (relâmpago e artilharia), 0 a 1: o game.ts o soma à luz do mapa
  get skyFlash() {
    return this.sky.flash;
  }
  private hud: Hud | null = null;
  private readonly c: TrCtx;
  private readonly fx: TrFx;
  private readonly snd: Snd;
  private readonly gens: GeneratorView;
  private readonly fizz: FizzView;
  private readonly forja: ForjaView;
  private readonly escav: EscavacaoView;
  private readonly igreja: IgrejaView;
  private readonly lama: LamaView;
  private readonly tank: TankView;
  private readonly colossus: ColossusView;
  private readonly weather: WeatherFx;
  private readonly sky: SkyFx;
  private readonly mounds: MoundView;
  private readonly parts: PartsView;
  private readonly bench: BenchView;
  private readonly drone: DroneView;
  private readonly staffs: StaffView;
  private readonly camara: CamaraFx;
  private me: NetPlayer | null = null;
  private local = '';
  private names: (pid: string) => string = () => 'Aliado';
  private lastWeather = '';
  private everOn = new Set<number>();
  private fxH = 0;
  private lastFov = 0;
  private first = true;

  constructor(private readonly scene: THREE.Scene, map: MapDef, tex: TexSet, private opts: TrOptions) {
    if (!map.trincheira) throw new Error('TrincheiraClient: o mapa não tem dados da Trincheira');
    this.snd = new Snd(opts.audio);
    this.fx = new TrFx(scene, opts.quality.particles);
    this.c = {
      scene, map, T: map.trincheira, tex, q: opts.quality, fx: this.fx, snd: this.snd,
      notify: (h) => this.hud?.notify(h),
      quake: (v) => {
        this.quake = Math.max(this.quake, v);
      },
      flash: () => this.hud?.whiteFlash(),
      me: () => (this.me ? { id: this.me.id, x: this.me.x, y: this.me.y, z: this.me.z } : null),
    };
    this.gens = new GeneratorView(this.c);
    this.fizz = new FizzView(this.c);
    this.forja = new ForjaView(this.c);
    this.escav = new EscavacaoView(this.c);
    this.igreja = new IgrejaView(this.c);
    this.lama = new LamaView(this.c);
    this.tank = new TankView(this.c);
    this.colossus = new ColossusView(this.c);
    this.weather = new WeatherFx(scene, opts.quality.particles, this.snd);
    this.sky = new SkyFx(this.c);
    this.mounds = new MoundView(this.c);
    this.parts = new PartsView(this.c);
    this.bench = new BenchView(this.c);
    this.drone = new DroneView(this.c);
    this.staffs = new StaffView(this.c);
    this.camara = new CamaraFx(this.c, opts.mapView ?? null);
  }

  // rastro de projétil em voo (o game.ts chama a cada quadro com a posição anterior e a atual)
  projectileTrail(kind: 'fogo' | 'orbRaio' | 'artilharia', prev: THREE.Vector3, cur: THREE.Vector3) {
    this.fx.trail(kind, prev, cur);
  }

  // raio do Cajado de Gelo e clarão na boca dos cajados (para o evento `shot` de quem atirou)
  iceBeam(origin: THREE.Vector3, dir: THREE.Vector3, len = 22) {
    this.fx.iceBeam(origin, dir, len);
    this.snd.play('gelo-raio', origin, 0.5);
  }

  staffMuzzle(el: Element, pos: THREE.Vector3, dir: THREE.Vector3) {
    this.fx.muzzle(pos, dir, ELEMENTS[el].hex);
  }

  // o mapa foi refeito (troca de qualidade): aponta para o novo MapView
  setMapView(mv: TrOptions['mapView']) {
    this.opts.mapView = mv;
  }

  attachHud(hud: Hud) {
    this.hud = hud;
  }

  // quem é o jogador local (para os textos "você" e "fulano")
  setLocal(id: string, nameOf: (pid: string) => string) {
    this.local = id;
    this.names = nameOf;
  }

  // altura da imagem em pixels (já com a proporção de pixels) e campo de visão: tamanho das partículas
  resize(pxHeight: number, fovDeg: number) {
    this.fx.resize(pxHeight, fovDeg);
    this.weather.resize(pxHeight, fovDeg);
    this.fxH = pxHeight;
    this.lastFov = fovDeg;
  }

  tankPose() {
    return this.tank.pose;
  }

  // o jogador está na Câmara Antiga
  get inChamber() {
    return this.camara.inside;
  }

  setChamber(_inside: boolean) {
    // a detecção é feita aqui dentro pela posição da câmera
    void _inside;
  }

  update(sample: Sample | null, snap: Snapshot, dt: number, t: number, me: NetPlayer | null, cam: THREE.PerspectiveCamera) {
    const tr = snap.tr;
    if (!tr) return;
    this.me = me;
    if (cam.fov !== this.lastFov || !this.fxH) this.resize(this.fxH || window.innerHeight * Math.min(window.devicePixelRatio || 1, 1.5), cam.fov);
    if (this.first) {
      this.first = false;
      tr.gens.forEach((g, i) => g.on && this.everOn.add(i));
    }
    for (let i = 0; i < tr.gens.length; i++) if (tr.gens[i].on) this.everOn.add(i);
    // clima
    this.weather.setWeather(tr.weather);
    this.weather.update(dt, t, cam.position);
    this.sky.update(dt, t, cam.position, tr.weather);
    this.opts.mapView?.setSnow(this.weather.snowAmount, this.weather.snowGround);
    this.opts.mapView?.setGens(tr.gens.map((g) => g.on));
    this.gens.update(tr.gens, dt, t, cam.position);
    this.fizz.update(tr, dt, t);
    this.forja.update(tr.forjaUp, dt);
    this.escav.update(tr, t);
    this.igreja.update(t);
    {
      const fog = this.scene.fog as THREE.FogExp2 | null;
      if (fog) this.lama.update(t, this.weather.rainAmount, fog.color, fog.density);
    }
    this.tank.update(sample, tr, dt, t);
    this.colossus.update(tr, dt, t);
    this.mounds.update(tr, t);
    this.parts.update(tr, dt, t);
    this.bench.update(tr, dt, t);
    this.drone.update(sample, tr, dt, t);
    this.staffs.update(tr, dt, t, cam.position);
    this.staffs.tickZones(dt);
    this.camara.update(tr, dt, t, cam.position, this.scene);
    this.fx.update(dt, cam.position);
    this.updateHud(tr, snap, t, cam);
  }

  private yawAngle(cam: THREE.PerspectiveCamera, x: number, z: number): { angle: number; dist: number } {
    const dx = x - cam.position.x, dz = z - cam.position.z;
    let rel = Math.atan2(-dx, -dz) - cam.rotation.y;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    return { angle: (-rel * 180) / Math.PI, dist: Math.round(Math.hypot(dx, dz)) };
  }

  private updateHud(tr: TrincheiraSnap, snap: Snapshot, t: number, cam: THREE.PerspectiveCamera) {
    const hud = this.hud?.tr;
    if (!hud || !this.hud) return;
    const me = this.me;
    hud.setGens(tr.gens, t);
    const anyStaff = tr.staffs.some((s) => s.st !== 'faltando');
    hud.setTeam(tr.team, { escudo: tr.build.escudo.built, drone: tr.build.drone.built }, tr.team.length > 0 || tr.build.escudo.built || tr.build.drone.built || anyStaff);
    // desafios: aparecem perto de um baú
    const near = me && this.c.T.challengeChests.some((p) => Math.hypot(p[0] - me.x, p[1] - me.z) < 4);
    hud.setChallenges(!!near && !!me, me?.challenges ?? [0, 0, 0, 0], me?.claimed ?? [false, false, false, false], GOALS);
    // avisos do topo (no máximo 2 aparecem; ver TrHud.setAlerts). Prioridade: 1 colosso perto ou prestes a chegar,
    // 2 Cruzados, 3 colosso longe
    const alerts: TrAlert[] = [];
    const r = tr.robot;
    if (r) {
      const feet = colossusFeet(this.c.T, r.id, r.dir);
      const step = r.phase === 'aviso' ? 0 : r.step;
      const pose = colossusPose(feet, r.id, r.dir, step, r.phase === 'aviso' ? 'sobe' : r.sub, r.phase === 'aviso' ? 0 : r.t);
      const a = this.yawAngle(cam, pose.x, pose.z);
      const name = COLOSSI[r.id].name.toUpperCase();
      let danger = false;
      if (me && r.phase === 'passos' && feet[r.step] && (r.sub === 'sobe' || r.sub === 'move')) {
        const f = feet[r.step].r;
        danger = me.x > f[0] - 1 && me.x < f[2] + 1 && me.z > f[1] - 1 && me.z < f[3] + 1;
      }
      const near = r.phase === 'aviso' || a.dist < 60;
      alerts.push({
        id: 'colosso', prio: near ? 1 : 3, color: COLOSSI[r.id].eye, angle: a.angle, dist: a.dist, danger,
        text: r.phase === 'aviso' ? `<b>${name}</b> chega em ${Math.ceil(r.warn)} s` : danger ? `<b>SAIA DA PEGADA!</b> ${name}` : `<b>${name}</b> está passando`,
      });
    }
    // recaptura: seta para o gerador atacado
    const atk = tr.gens.findIndex((g) => g.attacked);
    if (atk >= 0) {
      const g = this.c.T.gens[atk];
      const a = this.yawAngle(cam, g.x, g.z);
      alerts.push({ id: 'cruzados', prio: 2, color: '#ff4a3a', text: `Cruzados atacam o gerador ${atk + 1}!`, angle: a.dist > 6 ? a.angle : null, dist: a.dist > 6 ? a.dist : null });
    }
    hud.setAlerts(alerts);
    // missão
    const showMission = tr.missao.step >= 2 || tr.staffs.some((s) => s.awake);
    hud.setMission(showMission ? tr.missao : null);
    hud.setZblood(me?.zblood ?? 0);
    hud.setStatus({
      shield: me?.shield ?? 0, shieldMax: TRINCHEIRA.shieldHp, artilharia: me?.artilharia ?? 0, weather: tr.weather,
      punho: !!me?.punho, golden: !!me?.goldShovel, zone: null,
    });
    void snap;
  }

  // ---------- eventos ----------

  onEvent(e: GameEvent, ctx?: { local?: string; me?: NetPlayer | null; playerPos?: (pid: string) => THREE.Vector3 | null }) {
    const local = ctx?.local ?? this.local;
    if (ctx?.me) this.me = ctx.me;
    const who = (pid: string) => (pid === local ? 'Você' : this.names(pid));
    switch (e.e) {
      case 'gen':
        this.gens.onEvent(e);
        break;
      case 'forjaSobe':
        this.forja.onEvent(e);
        break;
      case 'fizz':
        this.fizz.onEvent(e);
        break;
      case 'tank':
      case 'esmaga':
        this.tank.onEvent(e);
        break;
      case 'buzina':
      case 'pisada':
        this.colossus.onEvent(e);
        break;
      case 'dig':
        this.mounds.onEvent(e, local);
        break;
      case 'peca':
        this.parts.onEvent(e, local, who);
        break;
      case 'craft':
        this.bench.onEvent(e, local, who);
        break;
      case 'portal':
      case 'teleporte':
        this.camara.onEvent(e, local);
        break;
      case 'alvo':
      case 'cajado':
      case 'desperto':
      case 'enigma':
      case 'tabua':
      case 'area':
        this.staffs.onEvent(e, local, who);
        break;
      case 'clima': {
        const msg = e.weather === 'chuva' ? 'Começou a <b>chover</b>.' : e.weather === 'neve' ? 'Está <b>nevando</b>: os montes de gelo apareceram.' : 'O tempo <b>abriu</b>.';
        if (e.weather !== 'limpo' || this.lastWeather === 'chuva' || this.lastWeather === 'neve') this.c.notify(msg);
        this.lastWeather = e.weather;
        if (e.weather === 'neve') this.snd.play('nevasca', undefined, 0.5);
        break;
      }
      case 'recaptura': {
        const g = this.c.T.gens[e.gen];
        if (e.phase === 'start') {
          this.snd.play('alarme');
          this.hud?.showBanner('CRUZADOS');
          this.c.notify(`Os <b>Cruzados</b> vão desligar o gerador ${e.gen + 1}${g ? ` (${g.name})` : ''}! Defenda-o.`);
        } else if (e.phase === 'win') this.c.notify('Os <b>Cruzados</b> caíram: todos ganham 500 pontos.');
        else this.c.notify(`Os Cruzados desligaram o gerador ${e.gen + 1}.`);
        break;
      }
      case 'blindado': {
        const p = new THREE.Vector3(e.x, 1.5, e.z);
        if (e.phase === 'spawn') {
          this.snd.play('blindado-chega', p);
          this.fx.burst(e.x, 1, e.z, 50, 7, 0xff8a30, 1.2, 0.6, { up: 3 });
          this.fx.dust(e.x, 0.2, e.z, 30, 6, 0x6a5a48, 2);
          this.c.quake(0.8);
          this.hud?.showBanner('O BLINDADO');
          this.c.notify('<b>O Blindado</b> chegou. Mire no visor e fuja do lança-chamas.');
        } else if (e.phase === 'flame') this.snd.play('blindado-fogo', p);
        else if (e.phase === 'claw') this.snd.play('blindado-garra', p);
        else if (e.phase === 'jump') {
          this.snd.play('blindado-salto', p);
          this.fx.burst(e.x, 1, e.z, 20, 5, 0xffb030, 0.8, 0.5, { up: 2 });
        } else if (e.phase === 'visor') this.c.notify('O <b>visor</b> do Blindado quebrou: tiros na cabeça valem o dobro.');
        else if (e.phase === 'death') {
          this.fx.burst(e.x, 1.5, e.z, 60, 8, 0xff7a20, 1.4, 0.7);
          this.c.notify('<b>O Blindado</b> caiu! Munição Cheia no chão.');
        }
        break;
      }
      case 'aneis':
        this.escav.onRingTurn(e.ring, e.pos);
        this.snd.play('cajado-monta', new THREE.Vector3(this.c.T.ring.c[0], 0.5, this.c.T.ring.c[1]), 0.5);
        break;
      case 'bebida': {
        // choque da Faísca (azul) e onda da Casca Grossa (laranja, com poeira e tremor)
        const hex = e.perk === 'faisca' ? 0x3ad8ff : 0xe0703a;
        this.fx.ring(e.x, 0.1, e.z, 0.5, e.r, hex, 0.5);
        this.fx.burst(e.x, 0.8, e.z, e.perk === 'faisca' ? 28 : 36, e.perk === 'faisca' ? 6 : 5, hex, 0.6, 0.25, { up: 1 });
        if (e.perk === 'casca-grossa') {
          this.fx.dust(e.x, 0.2, e.z, 24, 5, 0x6a5a48, 1.6);
          if (e.pid === local) this.c.quake(0.5);
        }
        this.snd.play(e.perk === 'faisca' ? 'alvo-ok' : 'pisada-colosso', new THREE.Vector3(e.x, 1, e.z), e.perk === 'faisca' ? 0.8 : 0.5);
        break;
      }
      case 'previve':
        // reanimado por um cajado desperto: coluna de luz e brilho dourado no aliado
        if (e.by === 'cajado') {
          const p = ctx?.playerPos?.(e.pid);
          if (p) {
            this.fx.burst(p.x, 0.6, p.z, 36, 5, 0xffe6a0, 1, 0.3, { up: 2.5 });
            this.fx.ring(p.x, 0, p.z, 0.6, 5, 0xffd890, 0.9);
            this.snd.play('cajado-desperto', p, 0.7);
          }
        }
        break;
      case 'cabine':
        if (e.pid === local) {
          if (e.phase === 'entra') this.c.notify(`Você foi levado à <b>cabine</b> de ${COLOSSI[e.robot].name}: aperte <b>F</b> no pedestal para pegar o prêmio.`);
          else if (e.phase === 'volta') this.c.notify('Você voltou à pegada: 3 s de proteção.');
          else this.c.notify(`Prêmio da cabine de ${COLOSSI[e.robot].name}: <b>${e.prize}</b>`);
        }
        break;
      case 'desafio':
        if (e.pid === local) {
          this.snd.play('desafio');
          this.c.notify(`Desafio ${e.idx + 1} cumprido: <b>${e.prize}</b>.`);
        }
        break;
      case 'artilharia': {
        const p = new THREE.Vector3(e.x, 0.5, e.z);
        if (e.phase === 'throw') this.snd.play('artilharia-lanca', p);
        else if (e.phase === 'marca') {
          // fumaça vermelha marca o lugar; as bombas vêm 2 s depois
          this.snd.play('artilharia-apito', p);
          this.fx.smokeColumn(e.x, e.z, 0xd02a1a, 3);
        } else {
          this.snd.play('artilharia-bomba', p);
          this.fx.burst(e.x, 1, e.z, 40, 8, 0xff8a30, 0.9, 0.7, { up: 3 });
          this.fx.burst(e.x, 1, e.z, 20, 6, 0x4a4036, 1.4, 1.2, { dull: true, up: 3 });
          this.fx.ring(e.x, 0, e.z, 1, 8, 0xffb060, 0.6);
          const me = this.me;
          const d = me ? Math.hypot(me.x - e.x, me.z - e.z) : 99;
          if (d < 30) this.c.quake(0.8 * (1 - d / 30));
        }
        break;
      }
      case 'missao': {
        this.snd.play(e.phase === 'fim' ? 'missao-fim' : 'missao-passo');
        if (e.phase === 'fim') {
          this.hud?.showBanner('CANÇÃO DA ESCAVAÇÃO');
          this.hud?.whiteFlash();
        }
        if (e.text) this.c.notify(e.text);
        break;
      }
      case 'fx': {
        const col = e.kind === 'queima' ? 0xff7a20 : e.kind === 'congela' ? 0xaee0ff : e.kind === 'estilhaca' ? 0xe8f6ff : e.kind === 'sangue' ? 0xb01010 : 0xffa040;
        const n = e.kind === 'estilhaca' ? 30 : 10;
        this.fx.burst(e.x, e.y + 1, e.z, n, e.kind === 'estilhaca' ? 5 : 2, col, 0.7, e.kind === 'estilhaca' ? 0.18 : 0.35, { grav: e.kind === 'estilhaca' ? 8 : 0 });
        if (e.kind === 'estilhaca') this.snd.play('gelo-quebra', new THREE.Vector3(e.x, e.y + 1, e.z), 0.7);
        break;
      }
      default:
    }
  }

  // ---------- avisos de F ----------

  // zumbis "soltam" peças (drops) que não existem no mapa: viram interações virtuais
  extraInteractables(snap: Snapshot): Interactable[] {
    const tr = snap.tr;
    if (!tr) return [];
    return tr.drops.map((d) => ({ id: d.id, kind: 'part' as const, ref: d.key, use: [d.x, d.z] as [number, number], y: 0 }));
  }

  promptFor(it: Interactable, snap: Snapshot, me: NetPlayer, ctx: { useKey: string; solo: boolean; weaponName: string }): TrPrompt | null {
    const tr = snap.tr;
    if (!tr) return null;
    const K = `<b>${ctx.useKey}</b>`;
    const team = new Set(tr.team);
    const haveSet = (s: 'escudo' | 'drone') => SET_PARTS[s].every((k) => team.has(k));
    const numRef = it.ref !== undefined ? Number(it.ref) : NaN;
    const el = (it.ref as Element | undefined) ?? undefined;
    const missing = (keys: string[]) => keys.filter((k) => !team.has(k)).map((k) => TEAM_ITEMS[k]?.name ?? k);
    switch (it.kind) {
      case 'generator': {
        const i = numRef;
        const g = tr.gens[i];
        if (!g || g.on) return null;
        const gd = this.c.T.gens[i];
        if (g.capturing) return { text: `Capturando <b>${gd.name}</b>...<small>Fique dentro do círculo e proteja o gerador</small>`, can: false, price: 0 };
        let inside = 0;
        for (const p of snap.players) if (p.life === 'alive' && Math.hypot(p.x - gd.x, p.z - gd.z) <= gd.r) inside++;
        inside = Math.max(1, inside);
        const free = this.everOn.has(i);
        const price = free ? 0 : TRINCHEIRA.genCostPerPlayer * inside;
        return {
          text: `Pressione ${K} para ligar o <b>gerador ${i + 1}</b> (${gd.name}) ${free ? '<span class="price">de graça</span>' : `<span class="price">${price}</span>`}<small>${inside > 1 ? `${inside} jogadores no círculo: captura mais rápida. ` : ''}Fique no círculo até acabar</small>`,
          can: true, price,
        };
      }
      case 'fizz': {
        const f = tr.fizz;
        if (f.loc !== numRef) return null;
        const gen = this.c.T.fizzGen[f.loc];
        if (gen !== undefined && !tr.gens[gen]?.on) return { text: '<b>Fonte da Sorte</b> sem energia<small>Ligue o gerador desta área</small>', can: false, price: 0 };
        if (f.state === 'spin') return { text: 'A Fonte da Sorte está girando...', can: false, price: 0 };
        const limit = MAX_PERKS + (me.extraPerk ? 1 : 0);
        if (me.perks.length >= limit) return { text: `Limite de ${limit} bebidas`, can: false, price: 0 };
        const price = snap.effects.firesale > 0 ? 950 : TRINCHEIRA.fizzCost;
        const count = BASE_PERKS.length + (this.c.map.fizzExtra?.length ?? 0) - me.perks.length;
        return { text: `Pressione ${K} para girar a <b>Fonte da Sorte</b> <span class="price">${price}</span><small>Uma bebida ao acaso entre as ${count} que você não tem</small>`, can: true, price };
      }
      case 'tank':
        if (tr.tank.state !== 'parado') {
          if (tr.tank.state === 'espera') return { text: `<b>Tanque</b> esfriando: ${Math.ceil(tr.tank.cooldown)} s`, can: false, price: 0 };
          return null;
        }
        return { text: `Pressione ${K} para chamar o <b>Tanque</b> <span class="price">${TRINCHEIRA.tankCost}</span><small>Faz uma volta: Igreja, Escavação e de volta à Estação</small>`, can: true, price: TRINCHEIRA.tankCost };
      case 'shovel':
        if (me.shovel) return { text: 'Você já tem uma <b>pá</b><small>Cave os montes de terra</small>', can: false, price: 0 };
        return { text: `Pressione ${K} para pegar a <b>pá</b><small>Segure ${ctx.useKey} num monte de terra para cavar</small>`, can: true, price: 0 };
      case 'mound': {
        if (!tr.mounds.includes(numRef)) return null;
        if (!me.shovel) return { text: 'Um monte de terra<small>Você precisa de uma pá (nos postos)</small>', can: false, price: 0 };
        const ice = numRef >= 18;
        return { text: `Segure ${K} para cavar ${ice ? 'o <b>monte de gelo</b>' : 'o monte'}${me.goldShovel ? ' (Pá Dourada)' : ''}`, can: true, price: 0, hold: true };
      }
      case 'part': {
        const key = it.ref ?? it.id.split(':')[1];
        const isDrop = it.id.startsWith('drop-');
        if (key.startsWith('vento-') && !tr.windOpen) return { text: 'Caixote <b>trancado</b><small>Algo muito grande precisa pisar por perto...</small>', can: false, price: 0 };
        if (!isDrop && !tr.pick.includes(it.id)) return null;
        const name = TEAM_ITEMS[key]?.name ?? key;
        return { text: `Pressione ${K} para pegar <b>${name}</b><small>Vai para a equipe</small>`, can: true, price: 0 };
      }
      case 'bench': {
        const i = numRef;
        const b = tr.build;
        if (b.escudo.built && b.escudo.bench === i && (me.shield ?? 0) <= 0) return { text: `Pressione ${K} para pegar um <b>Escudo de Trincheira</b><small>Fica nas costas e bloqueia o que vem por trás</small>`, can: true, price: 0 };
        if (b.drone.built && b.drone.bench === i && b.drone.state === 'banco') return { text: `Pressione ${K} para soltar o <b>Drone de Campo</b><small>Voa 60 s e atira nos zumbis</small>`, can: true, price: 0 };
        if (!b.escudo.built && haveSet('escudo')) return { text: `Segure ${K} para montar o <b>Escudo de Trincheira</b>`, can: true, price: 0, hold: true };
        if (!b.drone.built && haveSet('drone')) return { text: `Segure ${K} para montar o <b>Drone de Campo</b>`, can: true, price: 0, hold: true };
        if (b.escudo.built && b.escudo.bench === i) return { text: 'Você já está com um <b>Escudo</b>', can: false, price: 0 };
        const faltaE = b.escudo.built ? [] : missing(SET_PARTS.escudo);
        const faltaD = b.drone.built ? [] : missing(SET_PARTS.drone);
        const lines = [faltaE.length && faltaE.length < 3 ? `Escudo: falta ${faltaE.join(', ')}` : '', faltaD.length && faltaD.length < 3 ? `Drone: falta ${faltaD.join(', ')}` : ''].filter(Boolean);
        return { text: `<b>Bancada</b>: monta o Escudo e o Drone com 3 peças<small>${lines.join(' · ') || 'Ache as peças espalhadas pelo mapa'}</small>`, can: false, price: 0 };
      }
      case 'portal': {
        if (!el || tr.portals[EI[el]]) return null;
        if (!team.has('gramofone') || !team.has('disco')) return { text: `A laje de <b style="color:${ELEMENTS[el].color}">${ELEMENTS[el].name}</b> está selada<small>Precisa do Gramofone e do Disco Negro</small>`, can: false, price: 0 };
        return { text: `Pressione ${K} para tocar o <b>Disco Negro</b> na laje de ${ELEMENTS[el].name}`, can: true, price: 0 };
      }
      case 'staffPedestal': {
        if (!el) return null;
        const s = tr.staffs[EI[el]];
        const name = `Cajado de ${ELEMENTS[el].name}${s.awake ? ' Desperto' : ''}`;
        const has = me.weapons.some((w) => w.startsWith('cajado-'));
        if (s.st === 'faltando') {
          const keys = [`${el}-1`, `${el}-2`, `${el}-3`, `cristal-${el}`];
          const falta = missing(keys);
          if (!falta.length) return { text: `Pressione ${K} para montar o <b>${name}</b>`, can: true, price: 0 };
          return { text: `Pedestal do <b style="color:${ELEMENTS[el].color}">${name}</b><small>Falta: ${falta.join(', ')}</small>`, can: false, price: 0 };
        }
        if (s.st === 'pedestal') {
          if (has) return { text: `Você já carrega um cajado<small>Devolva o que tem para trocar</small>`, can: false, price: 0 };
          return { text: `Pressione ${K} para pegar o <b>${name}</b>`, can: true, price: 0 };
        }
        if (s.st === 'mao') {
          if (s.owner === me.id) return { text: `Pressione ${K} para devolver o <b>${name}</b>`, can: true, price: 0 };
          return null;
        }
        return { text: `O <b>${name}</b> está no altar da Câmara Antiga`, can: false, price: 0 };
      }
      case 'altar': {
        if (!el) return null;
        const s = tr.staffs[EI[el]];
        const nm = `Cajado de ${ELEMENTS[el].name}`;
        if (s.st === 'mao' && s.owner === me.id && !s.awake) {
          if (!s.solved) return { text: `O enigma do <b>${nm}</b> ainda não foi resolvido<small>${this.puzzleHint(el)}</small>`, can: false, price: 0 };
          if (TRINCHEIRA.ringsStep && !s.rings) return { text: `Falta a 2ª etapa do <b>${nm}</b><small>Na Escavação: alinhe os 4 anéis no símbolo de ${ELEMENTS[el].name} e acerte a esfera acesa com este cajado</small>`, can: false, price: 0 };
          return { text: `Pressione ${K} para colocar o <b>${nm}</b> no altar<small>Ele enche com 20 abates de qualquer jogador</small>`, can: true, price: 0 };
        }
        if (s.st === 'altar') {
          if (s.awake) return { text: `Pressione ${K} para pegar o <b>${nm} Desperto</b>`, can: true, price: 0 };
          return { text: `O altar enche com abates: ${Math.round(s.charge * TRINCHEIRA.staffChargeKills)}/${TRINCHEIRA.staffChargeKills}`, can: false, price: 0 };
        }
        return null;
      }
      case 'tabuaAltar': {
        if (tr.tabua === 'equipe') return { text: `Pressione ${K} para colocar a <b>Tábua de Pedra</b> no altar<small>Depois, mate com a faca dentro da Igreja</small>`, can: true, price: 0 };
        if (tr.tabua === 'altar') return { text: `A tábua se enche com abates de faca na Igreja: ${tr.tabuaCharge}/${TRINCHEIRA.punhoKills}`, can: false, price: 0 };
        if (tr.tabua === 'cheia') {
          if (me.punho) return { text: 'Você já tem o <b>Punho de Ferro</b>', can: false, price: 0 };
          return { text: `Pressione ${K} para receber o <b>Punho de Ferro</b><small>Substitui a faca e arremessa os zumbis</small>`, can: true, price: 0 };
        }
        return { text: 'O altar espera a <b>Tábua de Pedra</b> da Cripta', can: false, price: 0 };
      }
      case 'challenge': {
        const ch = me.challenges ?? [0, 0, 0, 0];
        const cl = me.claimed ?? [false, false, false, false];
        const ready = ch.some((v, i) => v >= GOALS[i] && !cl[i]);
        if (ready) return { text: `Pressione ${K} para retirar os prêmios do <b>Baú de Desafios</b>`, can: true, price: 0 };
        return { text: '<b>Baú de Desafios</b><small>Cumpra os desafios abaixo para abrir</small>', can: false, price: 0 };
      }
      case 'cabine': {
        const id = it.ref as keyof typeof COLOSSI;
        const nm = COLOSSI[id].name;
        const prize = id === 'atlas' ? 'uma Bebida Grátis' : id === 'golias' ? '2000 pontos' : '3 Granadas de Artilharia';
        if (tr.cabinTaken.includes(id)) return { text: `A cabine de <b>${nm}</b> já foi esvaziada`, can: false, price: 0 };
        return { text: `Pressione ${K} para pegar o prêmio da cabine de <b>${nm}</b> <small>${prize} (um por partida)</small>`, can: true, price: 0 };
      }
      case 'ring': {
        const i = Number(it.id.replace('anel-', ''));
        const sim = ['Fogo', 'Gelo', 'Vento', 'Raio'][tr.rings[i]] ?? '';
        return { text: `Pressione ${K} para girar o <b>anel ${i + 1}</b> <small>Mostra o símbolo de ${sim}. Alinhe os 4 no elemento de um cajado com o enigma resolvido</small>`, can: true, price: 0 };
      }
      case 'missao':
        if (tr.missao.step !== 4) return null;
        return { text: `Pressione ${K} para começar a <b>defesa final</b> (${TRINCHEIRA.missaoDefense} s)<small>Zumbis sem parar e 2 Blindados</small>`, can: true, price: 0 };
      default:
        return null;
    }
  }

  private puzzleHint(el: Element): string {
    switch (el) {
      case 'fogo': return 'Mate zumbis com o cajado perto dos 4 baús de almas (6 em cada)';
      case 'gelo': return 'Na neve, acerte as 3 lápides com o cajado';
      case 'vento': return 'Acerte os 3 domos de fumaça com a rajada';
      default: return 'Acerte as placas da Câmara na ordem das lâmpadas';
    }
  }

  dispose() {
    for (const v of [this.weather, this.fx, this.escav, this.igreja, this.lama, this.sky, this.colossus]) v.dispose();
  }
}

export { ELEMENT_LIST };
