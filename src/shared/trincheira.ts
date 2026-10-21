// Regras do mapa Trincheira (docs/trincheira): geradores, Fonte da Sorte, clima, pás e montes, tanque, colossos,
// Cruzados, Blindado, Sangue Morto, peças e bancadas, portais e Câmara Antiga, cajados, Punho de Ferro, desafios,
// Granada de Artilharia e a missão final. A GameSim chama esta classe em poucos pontos (tick, interact, abates, dano, snapshot).
import { BOSS, TRINCHEIRA as T, ZOMBIE } from './constants';
import { zombieHealth } from './rounds';
import { colossusFeet, colossusPose, EYE_RADIUS, SOLE_RADIUS, type FootRect } from './colossus';
import type { Interactable, MapDef, TrincheiraData } from './map/types';
import { NavGrid } from './navgrid';
import { MAX_PERKS, PERKS, SOLO_SELF_REVIVES, type PerkId } from './perks';
import { DEFAULT_POOL, type PowerupKind } from './powerups';
import type { Element, GameEvent, NetPlayer, StaffState, TrGen, TrRobot, TrStaff, TrincheiraSnap, Weather } from './protocol';
import { ELEMENT_LIST, MOUND_ODDS, SET_PARTS, ids } from './trincheira-info';
import { GRENADE, WEAPONS, isStaff, type WeaponDef } from './weapons';
import type { World } from './world';
import { TANK_BODY, toLocal, type BodyDims } from './busBody';
import type { SimPlayer, SimZombie } from './sim';
import { angleLerp } from './rng';

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const pick = <X>(list: X[]): X => list[Math.floor(Math.random() * list.length)];
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

// o que a simulação oferece à Trincheira (fechamentos sobre os membros privados da GameSim)
export interface TrHost {
  readonly map: MapDef;
  readonly world: World;
  readonly nav: NavGrid;
  readonly solo: boolean;
  readonly players: Map<string, SimPlayer>;
  readonly zombies: Map<number, SimZombie>;
  time(): number;
  round(): number;
  state(): string;
  emit(e: GameEvent): void;
  addPoints(p: SimPlayer, delta: number): void;
  grantPerk(p: SimPlayer, perk: PerkId): void;
  giveWeapon(p: SimPlayer, w: string, held: string): void;
  damageZombie(z: SimZombie, dmg: number, p: SimPlayer, part: 'head' | 'body' | 'limb', knife: boolean, blast?: boolean): void;
  damagePlayer(p: SimPlayer, dmg: number, fromX: number, fromZ: number, lava: boolean): void;
  // tira o zumbi do jogo sem pontos nem item (esmagado, queimado, morto pela missão)
  killSilently(z: SimZombie, fx?: { fling?: [number, number, number]; sucked?: boolean; shock?: boolean }): void;
  // cria um zumbi de um tipo (kind) num ponto; extra = não conta para o total da rodada
  makeZombie(kind: 0 | 1 | 2 | 7 | 8, x: number, z: number, hp: number, speed: number, extra: Partial<SimZombie>): SimZombie;
  spawnZombie(at?: [number, number]): SimZombie | null;
  dropPowerup(kind: PowerupKind, x: number, y: number, z: number): void;
  randomPowerup(): PowerupKind;
  applyPowerupTo(kind: PowerupKind, p: SimPlayer): void;
  rebuildNav(): void;
  roundZombies(): number;
  toSpawn(): number;
  groundY(x: number, z: number, r: number, y: number): number;
  isRoundActive(): boolean;
  playerList(): SimPlayer[];
  fireSale(): boolean;
  igniteForge(): void;
  setWeapon(w: string | null): void;
  spawnProjectile(kind: 'fogo', weapon: string, pid: string, x: number, y: number, z: number, vx: number, vy: number, vz: number): void;
  openVortexMoving(pid: string, x: number, y: number, z: number, r: number, dur: number, damage: number, vx: number, vz: number): void;
  windBlast(p: SimPlayer, def: WeaponDef, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): void;
  arcShot(p: SimPlayer, def: WeaponDef, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): void;
  zombieOnSegment(ax: number, ay: number, az: number, bx: number, by: number, bz: number): { z: SimZombie; t: number } | null;
}

export interface TrPlayer {
  shovel: boolean;
  goldShovel: boolean;
  helmet: boolean;
  shield: number;
  shieldBrokenRound: number;
  punho: boolean;
  artilharia: number;
  zblood: number;
  // desafios: [abates, geradores (0/1), cabeças, rodada 15 (0/1)]
  flags: [number, number, number, number];
  claimed: boolean[];
  extraPerk: boolean;
  digs: number;
  hold: { id: string; t: number } | null;
  burn: number;
  burnAcc: number;
  // teletransporte: ignora a posição que o navegador manda até este instante; e tempo sem poder entrar de novo
  tpUntil: number;
  tpCool: number;
  tunnelT: number;
  tunnelEl: Element | null;
  // invulnerável até este instante (saída da cabine)
  invUntil: number;
  helmetGiven: boolean;
}

interface Gen {
  on: boolean;
  progress: number;
  capturing: boolean;
  attacked: boolean;
  spawnT: number;
  // tempo seguido com Cruzado dentro do círculo
  templarT: number;
  // religar de graça (perdido para os Cruzados)
  free: boolean;
}

interface Target {
  id: string;
  kind: 'bau' | 'lapide' | 'domo' | 'placa' | 'sola' | 'olho';
  idx: number;
  x: number;
  y: number;
  z: number;
  r: number;
}

interface StaffSim {
  el: Element;
  st: StaffState;
  awake: boolean;
  owner: string;
  // dono antes de a missão prender o cajado no pedestal
  prevOwner: string;
  charge: number;
  solved: boolean;
  puzzle: number[];
  seq: number[];
}

// efeitos de área dos cajados despertos e bolas elétricas
interface AreaFx {
  kind: 'pilar' | 'nevasca' | 'redemoinho' | 'orbRaio';
  x: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
  t: number;
  dur: number;
  pid: string;
  tick: number;
  weapon: string;
}

const ROBOT_ORDER: TrRobot['id'][] = ['atlas', 'golias', 'tita'];
const FIRE_WEAPONS = ['cajado-fogo', 'cajado-fogo-d'];

export class TrincheiraSystems {
  readonly D: TrincheiraData;
  readonly gens: Gen[] = [];
  forjaUp = false;
  weather: Weather = 'limpo';
  private lastSnow = 0;
  private snowEver = false;
  readonly fizz = { loc: 0, state: 'idle' as 'idle' | 'spin', t: 0, uses: 0, max: 5, pid: '', perk: null as PerkId | null };
  readonly mounds = new Set<number>();
  private iceDug = new Set<number>();
  // tanque
  readonly tank = { x: 0, z: 0, yaw: 0, seg: 0, d: 0, v: 0, state: 'parado' as 'parado' | 'volta' | 'espera', stop: null as string | null, wait: 0, cooldown: 0, visited: new Set<string>() };
  private tankDims: BodyDims = TANK_BODY;
  // colossos
  robot: { id: TrRobot['id']; phase: 'aviso' | 'passos'; warn: number; step: number; sub: TrRobot['sub']; t: number; dir: 1 | -1; feet: FootRect[]; hatch: boolean; sole: number } | null = null;
  private robotNext = 0;
  private robotPause = 6;
  private robotPasses: Record<string, number> = { atlas: 0, golias: 0, tita: 0 };
  windOpen = false;
  // inimigos
  private panzerRound: number;
  private panzerTimer = -1;
  private templarRoundsSince = 0;
  private gensEver = 0;
  private recapturing = false;
  private templarTarget = -1;
  private templarNav: NavGrid | null = null;
  private templarNavT = 0;
  // equipe
  readonly team = new Set<string>();
  readonly picks = new Set<string>();
  readonly drops: { id: string; key: string; x: number; z: number }[] = [];
  private nextDrop = 1;
  readonly build = {
    escudo: { built: false, bench: -1 },
    drone: { built: false, bench: -1, state: 'banco' as 'banco' | 'voo' | 'espera', owner: '', t: 0, x: 0, y: 2.5, z: 0, revived: false, shootT: 0, reviveT: 0 },
  };
  // portais e Câmara
  readonly portals = [false, false, false, false];
  discoLoc = -1;
  private portalMusic: { el: Element; t: number; pid: string } | null = null;
  // cajados
  readonly staffs: StaffSim[] = [];
  tabua: 'cripta' | 'equipe' | 'altar' | 'cheia' = 'cripta';
  tabuaCharge = 0;
  private punhoTaken = new Set<string>();
  private targets: Target[] = [];
  readonly areas: AreaFx[] = [];
  // artilharia
  private strikes: { x: number; z: number; t: number; shells: number; next: number; pid: string }[] = [];
  // missão
  readonly missao = { step: 1, count: 0, t: 0, startRound: 0, eyes: [false, false, false], defense: 0, done: false, active: false };
  private ps = new Map<string, TrPlayer>();

  constructor(readonly h: TrHost) {
    this.D = h.map.trincheira!;
    for (const _ of this.D.gens) this.gens.push({ on: false, progress: 0, capturing: false, attacked: false, spawnT: 0, templarT: 0, free: false });
    // peças com mais de um local: sorteia um; o resto (cristais, itens únicos) já está lá
    for (const [key, locs] of Object.entries(this.D.pickups)) {
      const loc = Math.floor(Math.random() * locs.length);
      this.picks.add(ids.part(key, loc));
      if (key === 'disco') this.discoLoc = loc;
    }
    // pegadas dos colossos só têm colisão enquanto o pé está no chão; Fonte só ocupa o local atual
    for (const f of this.D.feet) h.world.openDoors.add(`pe-${f.id}`);
    this.fizz.max = T.fizzUsesMin + Math.floor(Math.random() * (T.fizzUsesMax - T.fizzUsesMin + 1));
    this.syncFizzSpots();
    const [x, z] = this.D.tank.path[0];
    const [nx, nz] = this.D.tank.path[1];
    Object.assign(this.tank, { x, z, yaw: Math.atan2(nx - x, nz - z), stop: 'estacao' });
    ELEMENT_LIST.forEach((el) => {
      const seq: number[] = [];
      while (seq.length < 3) {
        const n = 1 + Math.floor(Math.random() * 6);
        if (!seq.includes(n)) seq.push(n);
      }
      this.staffs.push({ el, st: 'faltando', awake: false, owner: '', prevOwner: '', charge: 0, solved: false, puzzle: el === 'fogo' ? [0, 0, 0, 0] : el === 'raio' ? [0] : [0, 0, 0], seq: el === 'raio' ? seq : [] });
    });
    // alvos dos enigmas e da missão
    this.D.chests.forEach((c, i) => this.targets.push({ id: `bau-${i}`, kind: 'bau', idx: i, x: c[0], y: 0.7, z: c[1], r: 1.2 }));
    this.D.tombstones.forEach((c, i) => this.targets.push({ id: `lapide-${i}`, kind: 'lapide', idx: i, x: c[0], y: 0.6, z: c[1], r: 0.9 }));
    this.D.domes.forEach((c, i) => this.targets.push({ id: `domo-${i}`, kind: 'domo', idx: i, x: c[0], y: 1.0, z: c[1], r: 1.5 }));
    this.D.chamber.plates.forEach((c, i) => this.targets.push({ id: `placa-${i}`, kind: 'placa', idx: i, x: c[0], y: c[1], z: c[2], r: 0.55 }));
    this.panzerRound = T.panzerFirst;
  }

  // ---------- ajudantes ----------

  P(p: SimPlayer | string): TrPlayer {
    const id = typeof p === 'string' ? p : p.id;
    let t = this.ps.get(id);
    if (!t) {
      t = {
        shovel: false, goldShovel: false, helmet: false, shield: 0, shieldBrokenRound: -1, punho: false, artilharia: 0, zblood: 0,
        flags: [0, 0, 0, 0], claimed: [false, false, false, false], extraPerk: false, digs: 0, hold: null, burn: 0, burnAcc: 0,
        tpUntil: 0, tpCool: 0, tunnelT: 0, tunnelEl: null, invUntil: 0, helmetGiven: false,
      };
      this.ps.set(id, t);
    }
    return t;
  }

  private emit(e: GameEvent) {
    this.h.emit(e);
  }

  perkLimit(p: SimPlayer) {
    return MAX_PERKS + (this.P(p).extraPerk ? 1 : 0);
  }

  groupAt(x: number, z: number): string {
    const R = this.D.chamberRect;
    if (x >= R[0] && x <= R[2] && z >= R[1] && z <= R[3]) return 'm';
    const g = this.D.groups;
    const cx = Math.floor(x - g.ox), cz = Math.floor(z - g.oz);
    if (cx < 0 || cz < 0 || cx >= g.w || cz >= g.h) return '.';
    return g.data[cz * g.w + cx];
  }

  // lama: o jogador anda mais devagar (o navegador lê o mesmo mapa de chão; aqui para testes e para a simulação)
  inMud(x: number, z: number): boolean {
    const sf = this.h.map.surface;
    if (!sf) return false;
    const cx = Math.floor(x - sf.ox), cz = Math.floor(z - sf.oz);
    return cx >= 0 && cz >= 0 && cx < sf.w && cz < sf.h && sf.data[cz * sf.w + cx] === 'm';
  }

  // um jogador vivo em algum dos grupos (letras) faz a área valer como aberta
  occupied(zone: string | undefined): boolean {
    if (!zone) return false;
    for (const p of this.h.players.values()) if (p.life === 'alive' && this.groupAt(p.x, p.z) === zone) return true;
    return false;
  }

  anyoneIn(zone: string) {
    return this.occupied(zone);
  }

  alive(): SimPlayer[] {
    return this.h.playerList().filter((p) => p.life === 'alive');
  }

  // jogadores que os zumbis podem escolher (o Sangue Morto os faz ignorar quem bebeu)
  targetable(p: SimPlayer) {
    return this.P(p).zblood <= 0;
  }

  teleporting(pid: string) {
    return this.P(pid).tpUntil > this.h.time();
  }

  private it(id: string): Interactable | undefined {
    return this.h.map.interactables.find((i) => i.id === id);
  }

  private syncFizzSpots() {
    this.D.fizzGen.forEach((_, i) => {
      if (i === this.fizz.loc) this.h.world.openDoors.delete(`fizz-spot-${i}`);
      else this.h.world.openDoors.add(`fizz-spot-${i}`);
    });
  }

  // ---------- gerador ----------

  private insideGen(g: number) {
    const d = this.D.gens[g];
    return this.alive().filter((p) => dist(p.x, p.z, d.x, d.z) <= d.r);
  }

  private interactGenerator(p: SimPlayer, it: Interactable): boolean {
    const gi = Number(it.ref);
    const g = this.gens[gi];
    const deny = (reason: 'pontos' | 'longe' | 'ocupado') => this.emit({ e: 'deny', pid: p.id, reason });
    if (g.on || g.capturing) {
      deny('ocupado');
      return true;
    }
    const inside = this.insideGen(gi);
    if (!inside.includes(p)) {
      deny('longe');
      return true;
    }
    if (!g.free) {
      // cada jogador dentro do círculo paga a parte dele
      if (inside.some((o) => o.points < T.genCostPerPlayer)) {
        deny('pontos');
        return true;
      }
      for (const o of inside) this.h.addPoints(o, -T.genCostPerPlayer);
    }
    g.capturing = true;
    g.progress = 0;
    g.spawnT = 1;
    g.free = false;
    this.emit({ e: 'gen', gen: gi, on: false, pid: p.id, phase: 'start' });
    return true;
  }

  private tickGens(dt: number) {
    this.gens.forEach((g, gi) => {
      if (g.capturing) {
        const inside = this.insideGen(gi);
        const rate = (1 + T.genExtraPlayer * Math.max(0, inside.length - 1)) / T.genTime;
        g.progress += (inside.length ? rate : -rate) * dt;
        if (g.progress <= 0) {
          g.progress = 0;
          g.capturing = false;
          this.emit({ e: 'gen', gen: gi, on: false, pid: null, phase: 'cancel' });
        } else if (g.progress >= 1) {
          g.progress = 1;
          g.capturing = false;
          g.on = true;
          this.gensEver++;
          this.emit({ e: 'gen', gen: gi, on: true, pid: inside[0]?.id ?? null, phase: 'done' });
          // desafio 2: estar no círculo quando o 3º gerador termina
          if (this.gensEver === T.challenge[1]) for (const o of inside) this.P(o).flags[1] = 1;
          this.afterGenChange();
        } else if (this.h.isRoundActive()) {
          // zumbis extras, além do ritmo da rodada
          g.spawnT -= dt;
          if (g.spawnT <= 0) {
            g.spawnT = T.genSpawnEvery;
            this.spawnNear(this.D.gens[gi].x, this.D.gens[gi].z, 10, 36);
          }
        }
      }
    });
  }

  // zumbi extra (não conta para a rodada) num ponto de surgir perto de um lugar
  private spawnNear(x: number, z: number, min: number, max: number) {
    const spots = this.h.map.zombieSpawns.filter((s) => {
      const d = dist(s.x, s.z, x, z);
      return d >= min && d <= max && this.spawnValid(s);
    });
    if (!spots.length) return null;
    const s = pick(spots);
    return this.h.spawnZombie([s.x, s.z]);
  }

  spawnValid(s: { area: string | string[] | null; zone?: string }) {
    const open = (a: string) => this.h.world.openDoors.has(a);
    if (s.area === null) return true;
    if (Array.isArray(s.area) ? s.area.some(open) : open(s.area)) return true;
    return this.occupied(s.zone);
  }

  private afterGenChange() {
    if (!this.forjaUp && this.gens.every((g) => g.on)) {
      this.forjaUp = true;
      this.forjaRise = 6;
      this.emit({ e: 'forjaSobe' });
    }
  }
  // a coluna sobe em 6 s; depois disso a Forja está liberada para sempre
  private forjaRise = 0;
  private tickForja(dt: number) {
    if (this.forjaRise <= 0) return;
    this.forjaRise -= dt;
    if (this.forjaRise <= 0) this.h.igniteForge();
  }

  // ---------- Fonte da Sorte ----------

  private fizzPrice() {
    return this.h.fireSale() ? 950 : T.fizzCost;
  }

  private interactFizz(p: SimPlayer, it: Interactable): boolean {
    const deny = (reason: 'pontos' | 'limite' | 'desligada' | 'possui' | 'ocupado') => this.emit({ e: 'deny', pid: p.id, reason });
    const i = Number(it.ref);
    const f = this.fizz;
    if (i !== f.loc) return true;
    if (!this.gens[this.D.fizzGen[i]].on) {
      deny('desligada');
      return true;
    }
    if (f.state !== 'idle') {
      deny('ocupado');
      return true;
    }
    if (p.perks.length >= this.perkLimit(p)) {
      deny('limite');
      return true;
    }
    const missing = (Object.keys(PERKS) as PerkId[]).filter((k) => !p.perks.includes(k) && !(k === 'folego' && this.h.solo && p.selfRevives >= SOLO_SELF_REVIVES));
    if (!missing.length) {
      deny('possui');
      return true;
    }
    const price = this.fizzPrice();
    if (p.points < price) {
      deny('pontos');
      return true;
    }
    this.h.addPoints(p, -price);
    Object.assign(f, { state: 'spin', t: T.fizzSpin, pid: p.id, perk: pick(missing) });
    this.emit({ e: 'fizz', phase: 'spin', loc: f.loc, pid: p.id, perk: null });
    return true;
  }

  private tickFizz(dt: number) {
    const f = this.fizz;
    if (f.state !== 'spin') return;
    f.t -= dt;
    if (f.t > 0) return;
    const p = this.h.players.get(f.pid);
    const perk = f.perk!;
    f.state = 'idle';
    f.uses++;
    if (p && p.life !== 'dead') {
      if (!p.perks.includes(perk)) this.h.grantPerk(p, perk);
      this.emit({ e: 'fizz', phase: 'give', loc: f.loc, pid: p.id, perk });
    } else {
      this.emit({ e: 'fizz', phase: 'give', loc: f.loc, pid: null, perk });
    }
    if (f.uses >= f.max) {
      // foge para outro local cujo gerador esteja ligado
      const options = this.D.fizzGen.map((g, i) => i).filter((i) => i !== f.loc && this.gens[this.D.fizzGen[i]].on);
      this.emit({ e: 'fizz', phase: 'leave', loc: f.loc, pid: null, perk: null });
      if (options.length) {
        f.loc = pick(options);
        this.syncFizzSpots();
        this.h.rebuildNav();
        this.emit({ e: 'fizz', phase: 'arrive', loc: f.loc, pid: null, perk: null });
      }
      f.uses = 0;
      f.max = T.fizzUsesMin + Math.floor(Math.random() * (T.fizzUsesMax - T.fizzUsesMin + 1));
    }
  }

  // ---------- clima ----------

  onRoundStart(round: number) {
    // clima da rodada: 1 e 2 limpas; neve garantida até a rodada 7 e a cada 8 sem neve
    let w: Weather = 'limpo';
    if (round > 2) {
      const forced = (!this.snowEver && round >= T.snowBy) || (this.snowEver && round - this.lastSnow >= T.snowGap);
      if (forced) w = 'neve';
      else {
        const r = Math.random();
        w = r < T.weatherChances[0] ? 'limpo' : r < T.weatherChances[0] + T.weatherChances[1] ? 'chuva' : 'neve';
      }
    }
    if (w === 'neve') {
      this.snowEver = true;
      this.lastSnow = round;
    }
    if (w !== this.weather) this.emit({ e: 'clima', weather: w, round });
    this.weather = w;
    // montes de terra: cada local vazio tem 45% de chance
    for (let i = 0; i < this.D.mounds.length - 3; i++) {
      if (!this.mounds.has(i) && Math.random() < T.moundChance) this.mounds.add(i);
    }
    // montes de gelo só existem na neve
    for (let i = this.D.mounds.length - 3; i < this.D.mounds.length; i++) {
      if (w === 'neve' && !this.iceDug.has(i)) this.mounds.add(i);
      else this.mounds.delete(i);
    }
    // Cruzados: a partir do 3º gerador, 30% de chance (garantido depois de 4 rodadas sem)
    this.templarRoundsSince++;
    if (this.gensEver >= T.templarAfterGens && !this.recapturing && !this.isPanzerRound(round)) {
      if (this.templarRoundsSince >= T.templarForceAfter || Math.random() < T.templarChance) this.startRecapture();
    }
    // missão: a colheita conta rodadas
    const m = this.missao;
    if (m.active && m.step === 3) {
      m.t = Math.max(0, T.missaoRounds - (round - m.startRound));
      if (round - m.startRound >= T.missaoRounds) {
        m.count = 0;
        m.startRound = round;
        m.t = T.missaoRounds;
        this.emit({ e: 'missao', step: 3, phase: 'falha', text: 'A colheita acabou e o contador voltou a zero.' });
      }
    }
  }

  onRoundEnd(round: number) {
    // desafio 4: viva(o) ao fim da rodada 15
    if (round === T.challenge[3]) for (const p of this.alive()) this.P(p).flags[3] = 1;
  }

  // ---------- pás e montes de terra ----------

  private interactShovel(p: SimPlayer): boolean {
    const t = this.P(p);
    if (t.shovel) {
      this.emit({ e: 'deny', pid: p.id, reason: 'possui' });
      return true;
    }
    t.shovel = true;
    this.emit({ e: 'peca', pid: p.id, key: 'pa' });
    return true;
  }

  hold(p: SimPlayer, id: string | null) {
    const t = this.P(p);
    if (!id) {
      t.hold = null;
      return;
    }
    if (t.hold?.id !== id) t.hold = { id, t: 0 };
  }

  private tickHolds(dt: number) {
    for (const p of this.h.players.values()) {
      const t = this.P(p);
      if (!t.hold) continue;
      const it = this.it(t.hold.id);
      if (!it || p.life !== 'alive' || dist(p.x, p.z, it.use[0], it.use[1]) > (it.reach ?? 1.9) + 0.7) {
        t.hold = null;
        continue;
      }
      if (it.kind === 'mound') {
        const idx = Number(it.ref);
        if (!this.mounds.has(idx) || !t.shovel) {
          t.hold = null;
          continue;
        }
        t.hold.t += dt;
        if (t.hold.t >= (t.goldShovel ? T.digTimeGold : T.digTime)) {
          t.hold = null;
          this.dig(p, idx);
        }
      } else if (it.kind === 'bench') {
        const set = this.craftable(Number(it.ref));
        if (!set) {
          t.hold = null;
          continue;
        }
        if (t.hold.t === 0) this.emit({ e: 'craft', pid: p.id, what: set, phase: 'start' });
        t.hold.t += dt;
        if (t.hold.t >= 2) {
          t.hold = null;
          for (const k of SET_PARTS[set]) this.team.delete(k);
          this.build[set].built = true;
          this.build[set].bench = Number(it.ref);
          if (set === 'drone') {
            const b = this.D.benches[Number(it.ref)];
            Object.assign(this.build.drone, { state: 'banco', x: b[0], z: b[1], y: 1.4 });
          }
          this.emit({ e: 'craft', pid: p.id, what: set, phase: 'done' });
        }
      }
    }
  }

  // o conjunto que dá para montar agora (a equipe tem as 3 peças e ainda não foi montado)
  private craftable(_bench: number): 'escudo' | 'drone' | null {
    for (const set of ['escudo', 'drone'] as const) {
      if (!this.build[set].built && SET_PARTS[set].every((k) => this.team.has(k))) return set;
    }
    return null;
  }

  private dig(p: SimPlayer, idx: number) {
    const t = this.P(p);
    const [x, z] = this.D.mounds[idx];
    this.mounds.delete(idx);
    const ice = idx >= this.D.mounds.length - 3;
    let result: 'powerup' | 'granadas' | 'pontos' | 'zumbi' | 'terra' | 'arma' | 'bebida' | 'peca' | 'capacete' | 'pa-dourada' = 'terra';
    let text = '';
    if (ice) {
      this.iceDug.add(idx);
      const key = `gelo-${idx - (this.D.mounds.length - 3) + 1}`;
      this.team.add(key);
      result = 'peca';
      text = key;
      this.emit({ e: 'peca', pid: p.id, key });
    } else {
      let r = Math.random();
      let kind: (typeof MOUND_ODDS)[number][0] = 'terra';
      for (const [k, w] of MOUND_ODDS) {
        r -= w;
        if (r <= 0) {
          kind = k;
          break;
        }
      }
      result = kind;
      switch (kind) {
        case 'powerup': {
          const pool = this.powerupPool();
          const k = pick(pool);
          this.h.dropPowerup(k, x, 0, z);
          text = k;
          break;
        }
        case 'granadas':
          p.grenades = Math.min(GRENADE.max, p.grenades + 2);
          break;
        case 'pontos': {
          const pts = Math.min(500, 50 * Math.max(1, this.h.round()));
          this.h.addPoints(p, pts);
          text = String(pts);
          break;
        }
        case 'zumbi':
          this.h.spawnZombie([x, z]);
          break;
        case 'terra':
          // a Pá Dourada troca "só terra" por pontos
          if (t.goldShovel) {
            this.h.addPoints(p, 100);
            result = 'pontos';
            text = '100';
          }
          break;
        case 'arma': {
          const walls = this.h.map.interactables.filter((i) => i.kind === 'weapon' && !p.weapons.includes(i.weapon!));
          if (walls.length) {
            const w = pick(walls).weapon!;
            this.h.giveWeapon(p, w, p.weapons[p.weapons.length - 1]);
            text = w;
          } else {
            this.h.addPoints(p, 250);
            result = 'pontos';
          }
          break;
        }
        case 'bebida':
          this.h.applyPowerupTo('freeperk', p);
          break;
      }
    }
    t.digs++;
    this.emit({ e: 'dig', pid: p.id, mound: idx, result, x: r3(x), z: r3(z), text });
    // Pá Dourada depois de 30 montes; o Capacete Dourado sai na primeira vez com ela
    if (!t.goldShovel && t.digs >= T.goldAfter) {
      t.goldShovel = true;
      this.emit({ e: 'dig', pid: p.id, mound: idx, result: 'pa-dourada', x: r3(x), z: r3(z), text: '' });
    } else if (t.goldShovel && !t.helmetGiven) {
      t.helmetGiven = true;
      t.helmet = true;
      this.emit({ e: 'dig', pid: p.id, mound: idx, result: 'capacete', x: r3(x), z: r3(z), text: '' });
    }
  }

  // itens que podem cair/sair da terra (sem a Bebida Grátis, que tem a chance dela)
  powerupPool(): PowerupKind[] {
    const pool = (this.h.map.powerupPool ?? DEFAULT_POOL).filter((k) => k !== 'freeperk');
    return pool;
  }

  // ---------- tanque ----------

  tankPose() {
    return { x: this.tank.x, z: this.tank.z, yaw: this.tank.yaw };
  }

  onTank(p: { x: number; y: number; z: number }) {
    const [lx, lz] = toLocal(this.tankPose(), p.x, p.z);
    return Math.abs(lx) < this.tankDims.hw && Math.abs(lz) < this.tankDims.hl && p.y > this.tankDims.floorY - 0.3;
  }

  private interactTank(p: SimPlayer): boolean {
    const k = this.tank;
    if (k.state !== 'parado') {
      this.emit({ e: 'deny', pid: p.id, reason: 'ocupado' });
      return true;
    }
    if (p.points < T.tankCost) {
      this.emit({ e: 'deny', pid: p.id, reason: 'pontos' });
      return true;
    }
    this.h.addPoints(p, -T.tankCost);
    Object.assign(k, { state: 'volta', stop: null, wait: 0.8, v: 0 });
    k.visited.clear();
    this.emit({ e: 'tank', phase: 'chamado', stop: null });
    return true;
  }

  private tickTank(dt: number) {
    const k = this.tank;
    const path = this.D.tank.path, n = path.length;
    const stops = this.D.tank.stops;
    if (k.state === 'parado') return;
    if (k.state === 'espera') {
      k.cooldown -= dt;
      if (k.cooldown <= 0) {
        k.state = 'parado';
        this.emit({ e: 'tank', phase: 'pronto', stop: 'estacao' });
      }
      return;
    }
    if (k.wait > 0) {
      k.wait -= dt;
      if (k.wait <= 0) {
        if (k.stop) this.emit({ e: 'tank', phase: 'sai', stop: k.stop });
        k.stop = null;
      }
      return;
    }
    // freia perto da próxima parada
    const stopAt = new Set(stops.map((s) => s.at));
    let ahead = -k.d;
    for (let m = 0, i = k.seg; m < n; m++, i = (i + 1) % n) {
      const [ax, az] = path[i];
      const [bx, bz] = path[(i + 1) % n];
      ahead += Math.hypot(bx - ax, bz - az);
      if (stopAt.has((i + 1) % n)) break;
    }
    const target = ahead < 9 ? Math.max(1.5, T.tankSpeed * (ahead / 9)) : T.tankSpeed;
    k.v = k.v < target ? Math.min(target, k.v + 2.2 * dt) : Math.max(target, k.v - 4 * dt);
    let left = k.v * dt;
    while (left > 0) {
      const [ax, az] = path[k.seg];
      const [bx, bz] = path[(k.seg + 1) % n];
      const len = Math.hypot(bx - ax, bz - az);
      if (k.d + left < len) {
        k.d += left;
        left = 0;
      } else {
        left -= len - k.d;
        k.seg = (k.seg + 1) % n;
        k.d = 0;
        const stop = stops.find((s) => s.at === k.seg);
        if (stop) {
          k.v = 0;
          k.stop = stop.zone;
          left = 0;
          if (stop.zone === 'estacao') {
            k.state = 'espera';
            k.cooldown = T.tankCooldown;
            this.emit({ e: 'tank', phase: 'volta', stop: stop.zone });
          } else {
            k.wait = T.tankStopWait;
            this.emit({ e: 'tank', phase: 'chegou', stop: stop.zone });
            // o tanque derruba o portão da Igreja: quem desce lá entra sem pagar
            if (stop.zone === 'igreja' && !this.h.world.openDoors.has('igreja') && this.alive().some((p) => this.onTank(p))) {
              this.h.world.openDoors.add('igreja');
              this.h.rebuildNav();
              const who = this.alive().find((p) => this.onTank(p))!;
              this.emit({ e: 'door', id: 'igreja', pid: who.id });
            }
          }
        }
      }
    }
    const [ax, az] = path[k.seg];
    const [bx, bz] = path[(k.seg + 1) % n];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    k.x = ax + ((bx - ax) * k.d) / len;
    k.z = az + ((bz - az) * k.d) / len;
    k.yaw = angleLerp(k.yaw, Math.atan2(bx - ax, bz - az), Math.min(1, dt * 2.2));
    this.tankHurts(dt);
  }

  // esmaga quem estiver no caminho e queima quem fica atrás (sem pontos para ninguém)
  private tankHurts(dt: number) {
    const k = this.tank;
    const pose = this.tankPose();
    const d = this.tankDims;
    for (const z of [...this.h.zombies.values()]) {
      if (z.anim === 'rise' || z.kind === 4 || z.kind === 6 || z.kind === 7) continue;
      const [lx, lz] = toLocal(pose, z.x, z.z);
      if (k.v > 1.5 && Math.abs(lx) < d.hw + 0.4 && lz > -d.hl && lz < d.hl + 0.8) {
        this.emit({ e: 'esmaga', zid: z.id });
        this.h.killSilently(z);
        continue;
      }
      // lança-chamas traseiro
      if (k.v > 0.3 && Math.abs(lx) < d.hw + 1 && lz < -d.hl && lz > -d.hl - T.tankFlameRange) {
        z.hp -= (T.tankFlameDps + 0.1 * zombieHealth(this.h.round())) * dt;
        if (z.hp <= 0) this.h.killSilently(z);
      }
    }
  }

  // ---------- colossos ----------

  private tickRobots(dt: number) {
    const round = this.h.round();
    const running = this.h.state() === 'active' || this.h.state() === 'intermission';
    if (!running) return;
    if (!this.robot) {
      if (round < T.robotFirstRound && !this.forceRobot) return;
      this.robotPause -= dt;
      if (this.robotPause <= 0) this.startRobot();
      return;
    }
    const r = this.robot;
    if (r.phase === 'aviso') {
      r.warn -= dt;
      if (r.warn <= 0) Object.assign(r, { phase: 'passos', step: 0, sub: 'sobe', t: 0 });
      return;
    }
    const dur = { sobe: T.stepLift, move: T.stepMove, desce: T.stepDown, fica: T.stepHold }[r.sub];
    r.t += dt / dur;
    if (r.t < 1) return;
    r.t = 0;
    const foot = r.feet[r.step];
    if (r.sub === 'sobe') r.sub = 'move';
    else if (r.sub === 'move') r.sub = 'desce';
    else if (r.sub === 'desce') {
      r.sub = 'fica';
      this.stomp(foot);
    } else {
      // o pé sai da pegada
      this.h.world.openDoors.add(`pe-${foot.id}`);
      this.h.rebuildNav();
      r.step++;
      r.sub = 'sobe';
      r.hatch = false;
      r.sole = 0;
      if (r.step >= r.feet.length) {
        this.robotPasses[r.id]++;
        this.robot = null;
        this.robotPause = T.robotPause;
      }
    }
  }

  private startRobot() {
    const id = ROBOT_ORDER[this.robotNext++ % 3];
    const dir: 1 | -1 = this.robotPasses[id] % 2 === 0 ? 1 : -1;
    this.robot = { id, phase: 'aviso', warn: T.robotWarn, step: 0, sub: 'sobe', t: 0, dir, feet: colossusFeet(this.D, id, dir), hatch: false, sole: 0 };
    this.emit({ e: 'buzina', robot: id, dir });
  }

  // o pé toca o chão: tudo dentro da pegada morre
  private stomp(foot: FootRect) {
    const r = this.robot!;
    const [x0, z0, x1, z1] = foot.r;
    const inside = (x: number, z: number) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
    const killed: string[] = [];
    for (const p of this.h.players.values()) {
      if (p.life === 'dead' || !inside(p.x, p.z)) continue;
      const t = this.P(p);
      if (t.invUntil > this.h.time()) continue;
      if (r.hatch && p.life === 'alive') {
        this.toCabin(p, r.id);
        continue;
      }
      if (p.life === 'alive') {
        this.h.damagePlayer(p, 99999, foot.cx, foot.cz, false);
        killed.push(p.id);
      } else if (p.life === 'downed') {
        p.bleed = Math.min(p.bleed, 0.01);
      }
    }
    let n = 0;
    for (const z of [...this.h.zombies.values()]) {
      if (!inside(z.x, z.z) || z.anim === 'rise') continue;
      if (z.panzer) {
        z.hp -= z.panzer.maxHp * 0.5;
        if (z.hp <= 0) this.h.killSilently(z);
        continue;
      }
      if (z.kind === 4 || z.kind === 6) continue;
      n++;
      this.h.killSilently(z);
    }
    this.h.world.openDoors.delete(`pe-${foot.id}`);
    this.h.rebuildNav();
    if (foot.id === 'K' || foot.id === 'B') this.windOpen = true;
    this.emit({ e: 'pisada', robot: r.id, foot: foot.id, x: r3(foot.cx), z: r3(foot.cz), killed, zombies: n });
  }

  // cabine do colosso (extra): prêmio único por colosso e volta à pegada com 3 s de invulnerabilidade
  private toCabin(p: SimPlayer, id: TrRobot['id']) {
    const t = this.P(p);
    const prizeKey = `cabine-${id}`;
    let prize = 'nada';
    if (!this.cabinTaken.has(prizeKey)) {
      this.cabinTaken.add(prizeKey);
      if (id === 'atlas') {
        this.h.applyPowerupTo('freeperk', p);
        prize = 'Bebida Grátis';
      } else if (id === 'golias') {
        this.h.addPoints(p, 2000);
        prize = '2000 pontos';
      } else {
        t.artilharia += 3;
        prize = '3 Granadas de Artilharia';
      }
    }
    t.invUntil = this.h.time() + 3 + T.stepHold;
    this.emit({ e: 'cabine', pid: p.id, robot: id, prize });
  }
  private cabinTaken = new Set<string>();

  // posição do olho do colosso agora (ou null se não há colosso passando)
  private eyeTarget(): Target | null {
    const r = this.robot;
    if (!r || r.phase !== 'passos') return null;
    const pose = colossusPose(r.feet, r.id, r.dir, r.step, r.sub, r.t);
    return { id: 'olho', kind: 'olho', idx: ROBOT_ORDER.indexOf(r.id), x: pose.eye[0], y: pose.eye[1], z: pose.eye[2], r: EYE_RADIUS };
  }

  private soleTarget(): Target | null {
    const r = this.robot;
    if (!r || r.phase !== 'passos' || r.sub === 'sobe' || r.sub === 'fica') return null;
    const pose = colossusPose(r.feet, r.id, r.dir, r.step, r.sub, r.t);
    return { id: 'sola', kind: 'sola', idx: ROBOT_ORDER.indexOf(r.id), x: pose.fx, y: Math.max(1, pose.fy), z: pose.fz, r: SOLE_RADIUS };
  }

  // ---------- tiros em alvos (enigmas, olho e sola dos colossos) ----------

  // ray: origem e direção do tiro; range: alcance da arma; weapon: id da arma do jogador
  rayShot(p: SimPlayer, weapon: string, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, range: number) {
    const def = WEAPONS[weapon];
    const staff = def?.staff;
    const list: Target[] = [...this.targets];
    const eye = this.eyeTarget();
    if (eye) list.push(eye);
    const sole = this.soleTarget();
    if (sole) list.push(sole);
    for (const t of list) {
      // domos e olhos: de qualquer distância; o resto pelo alcance da arma
      const reach = t.kind === 'domo' || t.kind === 'olho' || t.kind === 'sola' ? Math.max(range, 160) : t.kind === 'lapide' ? Math.max(range, 40) : range;
      const vx = t.x - ox, vy = t.y - oy, vz = t.z - oz;
      const s = vx * dx + vy * dy + vz * dz;
      if (s < 0 || s > reach) continue;
      const cx = vx - dx * s, cy = vy - dy * s, cz = vz - dz * s;
      if (Math.hypot(cx, cy, cz) > t.r) continue;
      if (t.kind !== 'olho' && t.kind !== 'sola') {
        // lápides, domos e baús são blocos sólidos: o tiro para na borda da esfera do alvo
        const slack = t.kind === 'placa' ? 0.8 : t.r;
        const wall = this.h.world.raycast(ox, oy, oz, dx, dy, dz, Math.max(0, s - slack));
        if (wall) continue;
      }
      this.targetHit(p, t, staff, weapon);
    }
  }

  private targetHit(p: SimPlayer, t: Target, staff: string | undefined, weapon: string) {
    const st = (el: Element) => this.staffs[ELEMENT_LIST.indexOf(el)];
    switch (t.kind) {
      case 'lapide': {
        const s = st('gelo');
        if (staff !== 'gelo' || s.puzzle[t.idx] || (this.weather !== 'neve' && !s.puzzle[t.idx])) break;
        s.puzzle[t.idx] = 1;
        this.emit({ e: 'alvo', kind: 'lapide', idx: t.idx, pid: p.id, ok: true });
        this.checkSolved(s);
        break;
      }
      case 'domo': {
        const s = st('vento');
        if (staff !== 'vento' || s.puzzle[t.idx]) break;
        s.puzzle[t.idx] = 1;
        this.emit({ e: 'alvo', kind: 'domo', idx: t.idx, pid: p.id, ok: true });
        this.checkSolved(s);
        break;
      }
      case 'placa': {
        const s = st('raio');
        if (staff !== 'raio' || s.solved) break;
        const need = s.seq[s.puzzle[0]];
        if (t.idx + 1 === need) {
          s.puzzle[0]++;
          this.emit({ e: 'alvo', kind: 'placa', idx: t.idx, pid: p.id, ok: true });
          this.checkSolved(s);
        } else {
          s.puzzle[0] = 0;
          this.emit({ e: 'alvo', kind: 'placa', idx: t.idx, pid: p.id, ok: false });
        }
        break;
      }
      case 'sola': {
        const r = this.robot;
        if (!r || r.hatch) break;
        r.sole++;
        this.emit({ e: 'alvo', kind: 'sola', idx: t.idx, pid: p.id, ok: r.sole >= 3 });
        if (r.sole >= 3) r.hatch = true;
        break;
      }
      case 'olho': {
        const m = this.missao;
        if (!m.active || m.step !== 4 || this.P(p).zblood <= 0 || m.eyes[t.idx]) break;
        m.eyes[t.idx] = true;
        m.count = m.eyes.filter(Boolean).length;
        this.emit({ e: 'alvo', kind: 'olho', idx: t.idx, pid: p.id, ok: true });
        if (m.eyes.every(Boolean)) this.missionStep(5, 'Os três olhos se apagaram. Aperte F no poço para a defesa final.');
        break;
      }
      default:
        break;
    }
    void weapon;
  }

  private checkSolved(s: StaffSim) {
    if (s.solved) return;
    const done = s.el === 'raio' ? s.puzzle[0] >= 3 : s.el === 'fogo' ? s.puzzle.every((v) => v >= T.fireChestKills) : s.puzzle.every((v) => v >= 1);
    if (!done) return;
    s.solved = true;
    this.emit({ e: 'enigma', el: s.el });
  }

  // ---------- Blindado ----------

  isPanzerRound(round: number) {
    return this.h.map.boss === 'blindado' && round === this.panzerRoundNow;
  }
  private panzerRoundNow = -1;

  // a simulação pergunta isto para não fechar a rodada antes de o Blindado chegar
  bossPending() {
    return this.panzerTimer > 0 || this.panzerQueue > 0;
  }
  private panzerQueue = 0;

  private planPanzer(round: number) {
    if (round !== this.panzerRound) return;
    this.panzerRoundNow = round;
    this.panzerTimer = BOSS.arriveMin + Math.random() * (BOSS.arriveMax - BOSS.arriveMin);
    this.panzerQueue = round >= 16 && this.h.players.size >= 3 ? 2 : 1;
    this.panzerRound = round + T.panzerGapMin + Math.floor(Math.random() * (T.panzerGapMax - T.panzerGapMin + 1));
  }

  private tickPanzerSpawn(dt: number) {
    if (this.panzerTimer <= 0 && this.panzerQueue <= 0) return;
    if (this.panzerTimer > 0) {
      this.panzerTimer -= dt;
      // mataram tudo antes: ele vem na hora
      if (this.h.toSpawn() === 0 && this.h.roundZombies() === 0) this.panzerTimer = Math.min(this.panzerTimer, 0);
      if (this.panzerTimer > 0) return;
      this.panzerTimer = -1;
    }
    if (this.panzerQueue > 0) {
      this.panzerSpawnGap -= dt;
      if (this.panzerSpawnGap > 0) return;
      this.panzerSpawnGap = 4;
      this.panzerQueue--;
      this.spawnPanzer();
    }
  }
  private panzerSpawnGap = 0;

  // chega descendo do céu perto do jogador com mais pontos
  spawnPanzer() {
    const alive = this.alive();
    if (!alive.length) return;
    const rich = alive.reduce((a, b) => (b.points > a.points ? b : a));
    let spot: [number, number] | null = null;
    for (let tries = 0; tries < 60 && !spot; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = 12 + Math.random() * 16;
      const x = rich.x + Math.sin(a) * r, z = rich.z + Math.cos(a) * r;
      if (this.h.nav.distanceAt(x, z) < 0xffff && !this.h.world.inLava(x, z) && this.groupAt(x, z) !== '.') spot = [x, z];
    }
    if (!spot) spot = [rich.x, rich.z];
    const hp = BOSS.healthMult * zombieHealth(this.h.round()) * Math.max(1, this.h.players.size);
    const z = this.h.makeZombie(7, spot[0], spot[1], hp, BOSS.walkSpeed, {
      anim: 'rise',
      panzer: { maxHp: hp, visor: true, visorTaken: 0, state: 'walk', t: 0, flameCD: 3, clawCD: 5, farT: 0, flameAcc: 0, target: null, hit: false },
    });
    this.emit({ e: 'blindado', phase: 'spawn', zid: z.id, x: r3(z.x), z: r3(z.z) });
  }

  // abaixo da vida: o visor quebra depois de 20% da vida em dano na cabeça
  panzerHeadHit(z: SimZombie, dmg: number) {
    const b = z.panzer;
    if (!b || !b.visor) return;
    b.visorTaken += dmg;
    if (b.visorTaken >= b.maxHp * T.panzerVisorBreak) {
      b.visor = false;
      this.emit({ e: 'blindado', phase: 'visor', zid: z.id, x: r3(z.x), z: r3(z.z) });
    }
  }

  updatePanzer(z: SimZombie, dt: number, targets: SimPlayer[], all: SimZombie[]) {
    const b = z.panzer!;
    b.flameCD -= dt;
    b.clawCD -= dt;
    let tp: SimPlayer | null = null;
    let td = Infinity;
    for (const p of targets) {
      const d = dist(p.x, p.z, z.x, z.z);
      if (d < td) {
        td = d;
        tp = p;
      }
    }
    b.farT = td > 25 ? b.farT + dt : 0;
    const face = (x: number, zz: number, k: number) => {
      z.yaw = angleLerp(z.yaw, Math.atan2(x - z.x, zz - z.z), Math.min(1, dt * k));
    };
    const sees = (p: SimPlayer) => this.h.world.lineOfSight(z.x, z.y + 1.8, z.z, p.x, p.y + 1.2, p.z);
    const R = 0.55, H = 2.2;
    if (b.state === 'flame') {
      b.t += dt;
      z.anim = 'attack';
      if (tp) face(tp.x, tp.z, 5);
      b.flameAcc += dt;
      if (b.flameAcc >= 0.5) {
        b.flameAcc = 0;
        const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw);
        for (const p of targets) {
          const dx = p.x - z.x, dz = p.z - z.z;
          const d = Math.hypot(dx, dz);
          if (d > T.panzerFlameRange || (dx * fx + dz * fz) / (d || 1) < Math.cos((20 * Math.PI) / 180) || Math.abs(p.y - z.y) > 2) continue;
          const t = this.P(p);
          this.h.damagePlayer(p, T.panzerFlameDps * 0.5 * (t.helmet ? 0.5 : 1), z.x, z.z, false);
          t.burn = 2;
        }
      }
      if (b.t >= 3 || td > T.panzerFlameRange + 3) {
        b.state = 'walk';
        b.flameCD = 4;
        z.anim = 'move';
        this.emit({ e: 'blindado', phase: 'flame', zid: z.id, x: r3(z.x), z: r3(z.z) });
      }
      return;
    }
    if (b.state === 'claw') {
      b.t += dt;
      z.anim = 'chain';
      const p = b.target ? this.h.players.get(b.target) : undefined;
      if (p && b.t < 0.7) face(p.x, p.z, 8);
      if (!b.hit && b.t >= 0.7 + 0.35) {
        b.hit = true;
        if (p && p.life === 'alive' && dist(p.x, p.z, z.x, z.z) < T.panzerClawRange + 3 && sees(p)) {
          this.h.damagePlayer(p, 15, z.x, z.z, false);
          if (p.life === 'alive') this.emit({ e: 'bosspull', pid: p.id, x: r3(z.x), z: r3(z.z), stop: 2.6 });
        }
      }
      if (b.t >= 0.7 + 0.35 + 0.9) {
        b.state = 'walk';
        z.anim = 'move';
      }
      return;
    }
    if (b.state === 'jump') {
      b.t += dt;
      z.anim = 'charge';
      if (!b.hit && b.t >= 0.9) {
        b.hit = true;
        const p = b.target ? this.h.players.get(b.target) : undefined;
        if (p) {
          for (let tries = 0; tries < 40; tries++) {
            const a = Math.random() * Math.PI * 2;
            const r = 7 + Math.random() * 4;
            const x = p.x + Math.sin(a) * r, zz = p.z + Math.cos(a) * r;
            if (this.h.nav.distanceAt(x, zz) < 0xffff && !this.h.world.inLava(x, zz) && this.groupAt(x, zz) !== '.') {
              z.x = x;
              z.z = zz;
              z.y = this.h.groundY(x, zz, R, 0.3);
              break;
            }
          }
          this.emit({ e: 'blindado', phase: 'jump', zid: z.id, x: r3(z.x), z: r3(z.z) });
          z.bestNav = 0xffff;
        }
      }
      if (b.t >= 1.7) {
        b.state = 'walk';
        z.anim = 'move';
      }
      return;
    }
    if (!tp) return;
    // escolhe um ataque
    if (td < T.panzerFlameRange - 0.5 && b.flameCD <= 0 && sees(tp)) {
      Object.assign(b, { state: 'flame', t: 0, flameAcc: 0 });
      this.emit({ e: 'blindado', phase: 'flame', zid: z.id, x: r3(z.x), z: r3(z.z), pid: tp.id });
      return;
    }
    if (b.clawCD <= 0 && td > T.panzerFlameRange && td < T.panzerClawRange && sees(tp)) {
      Object.assign(b, { state: 'claw', t: 0, hit: false, clawCD: T.panzerClawCd, target: tp.id });
      this.emit({ e: 'blindado', phase: 'claw', zid: z.id, x: r3(z.x), z: r3(z.z), pid: tp.id });
      return;
    }
    if (b.farT >= 6) {
      Object.assign(b, { state: 'jump', t: 0, hit: false, farT: 0, target: tp.id });
      return;
    }
    // anda até o jogador empurrando os outros
    let dx = tp.x - z.x, dz = tp.z - z.z;
    z.losT -= dt;
    if (z.losT <= 0) {
      z.losT = 0.3;
      z.los = td < ZOMBIE.directChaseRange && sees(tp);
    }
    if (!z.los) {
      const d = this.h.nav.direction(z.x, z.z);
      if (d) [dx, dz] = d;
    }
    const dl = Math.hypot(dx, dz) || 1;
    z.anim = 'move';
    z.x += (dx / dl) * z.speed * dt;
    z.z += (dz / dl) * z.speed * dt;
    for (const o of all) {
      if (o === z) continue;
      const ox = o.x - z.x, oz = o.z - z.z;
      const d = Math.hypot(ox, oz);
      if (d < 1 && d > 1e-4) {
        o.x += (ox / d) * (1 - d) * 0.5;
        o.z += (oz / d) * (1 - d) * 0.5;
      }
    }
    this.h.world.collideCylinder(z, R, H);
    z.y = this.h.groundY(z.x, z.z, R, z.y);
    z.yaw = angleLerp(z.yaw, Math.atan2(dx, dz), Math.min(1, dt * 4));
    // corpo a corpo: um golpe de braço quando encosta
    if (td < 1.8) {
      b.flameCD = Math.min(b.flameCD, 0);
    }
    const nd = this.h.nav.distanceAt(z.x, z.z);
    if (nd < z.bestNav - 1) {
      z.bestNav = nd;
      z.stuckT = 0;
    } else z.stuckT += dt;
    if (z.stuckT > ZOMBIE.stuckTime && td > 14) {
      b.farT = 6;
      z.stuckT = 0;
      z.bestNav = 0xffff;
    }
  }

  onPanzerDeath(z: SimZombie, killer: SimPlayer | null) {
    this.emit({ e: 'blindado', phase: 'death', zid: z.id, x: r3(z.x), z: r3(z.z) });
    this.h.dropPowerup('maxammo', z.x, z.y, z.z);
    if (killer) this.h.addPoints(killer, T.panzerReward);
    // a 3ª peça do Cajado de Fogo cai do primeiro Blindado
    if (!this.fireThirdDropped && !this.team.has('fogo-3')) {
      this.fireThirdDropped = true;
      this.drops.push({ id: `drop-${this.nextDrop++}`, key: 'fogo-3', x: z.x, z: z.z });
    }
  }
  private fireThirdDropped = false;

  // ---------- Cruzados ----------

  private startRecapture() {
    const candidates = this.gens.map((g, i) => ({ g, i })).filter((o) => o.g.on && !o.g.capturing);
    if (!candidates.length) return;
    const { i } = pick(candidates);
    this.recapturing = true;
    this.templarRoundsSince = 0;
    this.templarTarget = i;
    this.templarNav = this.templarNav ?? new NavGrid(this.h.world, ZOMBIE.radius);
    this.templarNavT = 0;
    const n = T.templarBase + T.templarPerPlayer * Math.max(1, this.h.players.size);
    const d = this.D.gens[i];
    this.gens[i].attacked = true;
    this.emit({ e: 'recaptura', phase: 'start', gen: i });
    this.fixNavTargets();
    // nascem a 25-40 m do gerador, num lugar de onde existe caminho até ele
    let made = 0;
    for (let tries = 0; tries < 600 && made < n; tries++) {
      const a = Math.random() * Math.PI * 2;
      // se não há lugar a 25-40 m (área pequena), aceita mais perto
      const r = (tries < 300 ? 25 : 10) + Math.random() * 15;
      const x = d.x + Math.cos(a) * r, z = d.z + Math.sin(a) * r;
      const g = this.groupAt(x, z);
      if (g === '.' || g === 'm' || this.h.world.inLava(x, z) || this.templarNav!.distanceAt(x, z) >= 0xffff) continue;
      this.makeTemplar(x, z);
      made++;
    }
  }

  private makeTemplar(x: number, z: number) {
    const hp = T.templarHpMult * zombieHealth(this.h.round());
    const zb = this.h.makeZombie(8, x, z, hp, T.templarSpeed, { anim: 'rise', extra: true, templar: { atkT: 0 } });
    return zb;
  }

  private fixNavTargets() {
    if (this.templarTarget < 0 || !this.templarNav) return;
    const d = this.D.gens[this.templarTarget];
    this.templarNav.rebuild();
    this.templarNav.update([{ x: d.x + 2, z: d.z }], 500);
  }

  private tickTemplars(dt: number) {
    const templars = [...this.h.zombies.values()].filter((z) => z.kind === 8);
    if (!this.recapturing) {
      for (const g of this.gens) g.attacked = false;
      return;
    }
    if (!templars.length) {
      // todos morreram: a equipe venceu
      this.recapturing = false;
      for (const g of this.gens) g.attacked = false;
      this.emit({ e: 'recaptura', phase: 'win', gen: this.templarTarget });
      for (const p of this.h.players.values()) if (p.life !== 'dead') this.h.addPoints(p, T.templarReward);
      const at = this.lastTemplarPos;
      if (at) this.h.dropPowerup(this.h.randomPowerup(), at[0], 0, at[1]);
      return;
    }
    if (this.templarNav) {
      this.templarNavT -= dt;
      if (this.templarNavT <= 0) {
        this.templarNavT = 1;
        this.fixNavTargets();
      }
    }
    // perda do gerador: um Cruzado dentro do círculo por 8 s
    const g = this.gens[this.templarTarget];
    const d = this.D.gens[this.templarTarget];
    if (!g) return;
    const inCircle = templars.some((z) => dist(z.x, z.z, d.x, d.z) <= d.r);
    g.templarT = inCircle ? g.templarT + dt : Math.max(0, g.templarT - dt);
    if (g.on && g.templarT >= T.templarTakeTime) {
      g.on = false;
      g.free = true;
      g.templarT = 0;
      g.attacked = false;
      this.emit({ e: 'gen', gen: this.templarTarget, on: false, pid: null, phase: 'lost' });
      this.emit({ e: 'recaptura', phase: 'lose', gen: this.templarTarget });
      // os que sobraram vão para o próximo gerador ligado mais perto
      const mx = templars.reduce((a, z) => a + z.x, 0) / templars.length;
      const mz = templars.reduce((a, z) => a + z.z, 0) / templars.length;
      let best = -1, bd = Infinity;
      this.gens.forEach((o, i) => {
        if (!o.on) return;
        const dd = dist(this.D.gens[i].x, this.D.gens[i].z, mx, mz);
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      });
      if (best < 0) {
        // nada mais para tomar: eles se dispersam
        this.recapturing = false;
        for (const z of templars) this.h.killSilently(z);
      } else {
        this.templarTarget = best;
        this.gens[best].attacked = true;
        this.fixNavTargets();
      }
    }
  }
  private lastTemplarPos: [number, number] | null = null;

  updateTemplar(z: SimZombie, dt: number, targets: SimPlayer[], all: SimZombie[]) {
    this.lastTemplarPos = [z.x, z.z];
    const st = z.templar!;
    if (z.anim === 'attack') {
      st.atkT += dt;
      if (st.atkT >= ZOMBIE.attackWindup && !z.attackHit) {
        z.attackHit = true;
        for (const p of targets) if (dist(p.x, p.z, z.x, z.z) < 1.7) this.h.damagePlayer(p, ZOMBIE.damage, z.x, z.z, false);
      }
      if (st.atkT >= ZOMBIE.attackWindup + ZOMBIE.attackRecover) z.anim = 'move';
      return;
    }
    // ignora os jogadores: só ataca quem fica a menos de 1,5 m na frente
    const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw);
    for (const p of targets) {
      const dx = p.x - z.x, dz = p.z - z.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5 && (dx * fx + dz * fz) / (d || 1) > 0.3 && Math.abs(p.y - z.y) < 1.2) {
        z.anim = 'attack';
        st.atkT = 0;
        z.attackHit = false;
        this.emit({ e: 'zattack', zid: z.id });
        return;
      }
    }
    const goal = this.D.gens[Math.max(0, this.templarTarget)];
    let dx = goal.x - z.x, dz = goal.z - z.z;
    if (dist(z.x, z.z, goal.x, goal.z) > 3 && this.templarNav) {
      const dir = this.templarNav.direction(z.x, z.z);
      if (dir) [dx, dz] = dir;
    }
    const dl = Math.hypot(dx, dz) || 1;
    let vx = (dx / dl) * z.speed, vz = (dz / dl) * z.speed;
    // separação dos outros
    for (const o of all) {
      if (o === z) continue;
      const ox = z.x - o.x, oz = z.z - o.z;
      const d2 = ox * ox + oz * oz;
      if (d2 > 0.56 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      vx += (ox / d) * (0.75 - d) * 4;
      vz += (oz / d) * (0.75 - d) * 4;
    }
    z.x += vx * dt;
    z.z += vz * dt;
    this.h.world.collideCylinder(z, ZOMBIE.radius, ZOMBIE.height);
    z.y = this.h.groundY(z.x, z.z, ZOMBIE.radius, z.y);
    z.yaw = angleLerp(z.yaw, Math.atan2(dx, dz), Math.min(1, dt * 6));
    z.anim = 'move';
  }

  // a recaptura conta como evento de rodada: os zumbis comuns surgem na metade do ritmo
  get slowSpawns() {
    return this.recapturing;
  }

  // ---------- Sangue Morto, queimadura e invulnerabilidade ----------

  giveBlood(p: SimPlayer) {
    this.P(p).zblood = T.zbloodTime;
    this.emit({ e: 'fx', kind: 'sangue', pid: p.id, x: r3(p.x), y: r3(p.y), z: r3(p.z) });
  }

  private tickPlayers(dt: number) {
    for (const p of this.h.players.values()) {
      const t = this.P(p);
      if (t.zblood > 0) t.zblood = Math.max(0, t.zblood - dt);
      if (t.burn > 0) {
        t.burn -= dt;
        t.burnAcc += dt;
        if (t.burnAcc >= 0.5 && p.life === 'alive') {
          t.burnAcc = 0;
          this.h.damagePlayer(p, 6 * (t.helmet ? 0.5 : 1), p.x, p.z, true);
        }
      }
    }
  }

  // o Escudo bloqueia o dano de quem ataca pelas costas; devolve o dano que sobra
  filterDamage(p: SimPlayer, dmg: number, fromX: number, fromZ: number): number {
    const t = this.P(p);
    if (t.invUntil > this.h.time()) return 0;
    if (t.shield <= 0) return dmg;
    const dx = fromX - p.x, dz = fromZ - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) return dmg;
    // costas do jogador: o oposto de para onde ele olha
    const bx = Math.sin(p.yaw), bz = Math.cos(p.yaw);
    if ((dx * bx + dz * bz) / d < Math.cos(((T.shieldArc / 2) * Math.PI) / 180)) return dmg;
    t.shield -= dmg;
    if (t.shield <= 0) {
      t.shield = 0;
      t.shieldBrokenRound = this.h.round();
      this.emit({ e: 'craft', pid: p.id, what: 'escudo', phase: 'expire' });
    }
    return 0;
  }

  // ---------- peças, equipe, bancadas ----------

  private interactPart(p: SimPlayer, it: Interactable): boolean {
    const deny = (reason: 'trancado' | 'longe') => this.emit({ e: 'deny', pid: p.id, reason });
    const drop = this.drops.find((d) => d.id === it.id);
    const key = drop ? drop.key : it.ref!;
    if (!drop && !this.picks.has(it.id)) return true;
    if (key.startsWith('vento-') && !this.windOpen) {
      deny('trancado');
      return true;
    }
    if (drop) this.drops.splice(this.drops.indexOf(drop), 1);
    else this.picks.delete(it.id);
    this.team.add(key);
    if (key === 'disco') this.discoLoc = -1;
    if (key === 'tabua') this.tabua = 'equipe';
    this.emit({ e: 'peca', pid: p.id, key });
    return true;
  }

  private interactBench(p: SimPlayer, it: Interactable): boolean {
    const i = Number(it.ref);
    const t = this.P(p);
    const b = this.build;
    if (b.escudo.built && b.escudo.bench === i) {
      if (t.shield > 0) {
        this.emit({ e: 'deny', pid: p.id, reason: 'possui' });
        return true;
      }
      if (t.shieldBrokenRound === this.h.round()) {
        this.emit({ e: 'deny', pid: p.id, reason: 'esgotado' });
        return true;
      }
      t.shield = T.shieldHp;
      this.emit({ e: 'craft', pid: p.id, what: 'escudo', phase: 'take' });
      return true;
    }
    if (b.drone.built && b.drone.bench === i && b.drone.state === 'banco') {
      Object.assign(b.drone, { state: 'voo', owner: p.id, t: T.droneTime, revived: false, reviveT: 0, shootT: 0 });
      this.emit({ e: 'craft', pid: p.id, what: 'drone', phase: 'take' });
      return true;
    }
    if (!this.craftable(i)) this.emit({ e: 'deny', pid: p.id, reason: 'faltam' });
    return true;
  }

  // Drone de Campo: segue o dono, atira nos zumbis e reanima uma vez por voo
  private tickDrone(dt: number) {
    const d = this.build.drone;
    if (!d.built) return;
    if (d.state === 'banco') {
      const b = this.D.benches[d.bench] ?? [d.x, d.z];
      d.x = b[0];
      d.z = b[1];
      d.y = 1.4;
      return;
    }
    if (d.state === 'espera') {
      d.t -= dt;
      const b = this.D.benches[d.bench];
      if (b) {
        d.x += (b[0] - d.x) * Math.min(1, dt * 2);
        d.z += (b[1] - d.z) * Math.min(1, dt * 2);
        d.y += (1.4 - d.y) * Math.min(1, dt * 2);
      }
      if (d.t <= 0) {
        d.state = 'banco';
        this.emit({ e: 'craft', pid: '', what: 'drone', phase: 'expire' });
      }
      return;
    }
    const owner = this.h.players.get(d.owner);
    d.t -= dt;
    if (!owner || owner.life === 'dead' || d.t <= 0) {
      d.state = 'espera';
      d.t = T.droneCd;
      d.owner = '';
      this.emit({ e: 'craft', pid: owner?.id ?? '', what: 'drone', phase: 'drone-leave' });
      return;
    }
    const tx = owner.x - Math.sin(owner.yaw) * -2 + Math.cos(owner.yaw) * 1.2, tz = owner.z - Math.cos(owner.yaw) * -2 - Math.sin(owner.yaw) * 1.2;
    d.x += (tx - d.x) * Math.min(1, dt * 3);
    d.z += (tz - d.z) * Math.min(1, dt * 3);
    d.y += (owner.y + 2.5 - d.y) * Math.min(1, dt * 3);
    // reanima o dono em 3 s (uma vez por voo)
    if (owner.life === 'downed' && !d.revived) {
      d.reviveT += dt;
      owner.revive = Math.min(1, d.reviveT / 3);
      if (d.reviveT >= 3) {
        d.revived = true;
        owner.life = 'alive';
        owner.health = owner.maxHealth;
        owner.revive = 0;
        owner.lastHurt = this.h.time();
        this.emit({ e: 'previve', pid: owner.id, by: 'drone' });
        this.emit({ e: 'craft', pid: owner.id, what: 'drone', phase: 'drone-revive' });
      }
      return;
    }
    if (owner.life !== 'alive') return;
    d.shootT -= dt;
    if (d.shootT > 0) return;
    let best: SimZombie | null = null;
    let bd = T.droneRange;
    for (const z of this.h.zombies.values()) {
      if (z.anim === 'rise') continue;
      const dd = Math.hypot(z.x - d.x, z.z - d.z);
      if (dd < bd && this.h.world.lineOfSight(d.x, d.y, d.z, z.x, z.y + 1.4, z.z)) {
        bd = dd;
        best = z;
      }
    }
    if (best) {
      d.shootT = T.droneRate;
      this.h.setWeapon('drone');
      this.h.damageZombie(best, T.droneDmg * Math.max(1, zombieHealth(this.h.round()) / 600), owner, 'head', false, true);
      this.h.setWeapon(null);
      this.emit({ e: 'shot', pid: 'drone', weapon: 'drone' });
    }
  }

  // ---------- portais e Câmara Antiga ----------

  private interactPortal(p: SimPlayer, it: Interactable): boolean {
    const el = it.ref as Element;
    const i = ELEMENT_LIST.indexOf(el);
    if (this.portals[i] || this.portalMusic) return true;
    if (!this.team.has('gramofone') || !this.team.has('disco')) {
      this.emit({ e: 'deny', pid: p.id, reason: 'faltam' });
      return true;
    }
    this.portalMusic = { el, t: T.portalMusic, pid: p.id };
    this.emit({ e: 'portal', el, pid: p.id });
    return true;
  }

  private tickPortals(dt: number) {
    const pm = this.portalMusic;
    if (pm) {
      pm.t -= dt;
      if (pm.t <= 0) {
        const i = ELEMENT_LIST.indexOf(pm.el);
        this.portals[i] = true;
        this.h.world.openDoors.add(`portal-${pm.el}`);
        this.h.rebuildNav();
        this.portalMusic = null;
      }
    }
    const now = this.h.time();
    for (const p of this.alive()) {
      const t = this.P(p);
      if (t.tpCool > now) continue;
      // boca do túnel: 1 s dentro leva para a alcova
      let inMouth: Element | null = null;
      for (const po of this.D.portals) {
        const i = ELEMENT_LIST.indexOf(po.el);
        if (this.portals[i] && dist(p.x, p.z, po.mouth[0], po.mouth[1]) < po.r) inMouth = po.el;
      }
      if (inMouth) {
        if (t.tunnelEl !== inMouth) {
          t.tunnelEl = inMouth;
          t.tunnelT = 0;
        }
        t.tunnelT += dt;
        if (t.tunnelT >= T.portalTime) {
          const al = this.D.chamber.alcoves.find((a) => a.el === inMouth)!;
          this.teleport(p, al.c[0], al.c[1], inMouth, 'camara');
        }
        continue;
      }
      t.tunnelEl = null;
      t.tunnelT = 0;
      // portal de volta na alcova
      if (this.groupAt(p.x, p.z) === 'm') {
        for (const al of this.D.chamber.alcoves) {
          if (dist(p.x, p.z, al.back[0], al.back[1]) < 1.5) {
            const po = this.D.portals.find((q) => q.el === al.el)!;
            this.teleport(p, po.exit[0], po.exit[1], al.el, 'tunel');
            break;
          }
        }
      }
    }
  }

  private teleport(p: SimPlayer, x: number, z: number, el: Element, to: 'camara' | 'tunel') {
    const t = this.P(p);
    p.x = x;
    p.z = z;
    p.y = 0;
    t.tpUntil = this.h.time() + 0.6;
    t.tpCool = this.h.time() + 2.5;
    t.tunnelT = 0;
    t.tunnelEl = null;
    t.hold = null;
    this.emit({ e: 'teleporte', pid: p.id, el, to });
  }

  // ---------- cajados ----------

  private staffOf(el: Element) {
    return this.staffs[ELEMENT_LIST.indexOf(el)];
  }

  private holdingStaff(p: SimPlayer) {
    return p.weapons.find((w) => isStaff(w)) ?? null;
  }

  private missionLocked() {
    return this.missao.active && this.missao.step >= 2 && this.missao.step <= 5;
  }

  private interactStaffPedestal(p: SimPlayer, it: Interactable): boolean {
    const el = it.ref as Element;
    const s = this.staffOf(el);
    const deny = (reason: 'faltam' | 'unica' | 'trancado' | 'ocupado') => this.emit({ e: 'deny', pid: p.id, reason });
    if (s.st === 'faltando') {
      const parts = [1, 2, 3].map((n) => `${el}-${n}`);
      if (!parts.every((k) => this.team.has(k)) || !this.team.has(`cristal-${el}`)) {
        deny('faltam');
        return true;
      }
      for (const k of parts) this.team.delete(k);
      this.team.delete(`cristal-${el}`);
      s.st = 'pedestal';
      this.emit({ e: 'cajado', el, phase: 'monta', pid: p.id });
      return true;
    }
    if (s.st === 'pedestal') {
      if (this.missionLocked()) {
        deny('trancado');
        return true;
      }
      if (this.holdingStaff(p)) {
        deny('unica');
        return true;
      }
      const id = s.awake ? `cajado-${el}-d` : `cajado-${el}`;
      this.h.giveWeapon(p, id, p.weapons[p.weapons.length - 1]);
      s.st = 'mao';
      s.owner = p.id;
      this.emit({ e: 'cajado', el, phase: 'pega', pid: p.id });
      return true;
    }
    if (s.st === 'mao' && s.owner === p.id) {
      if (this.missionLocked()) {
        deny('trancado');
        return true;
      }
      this.returnStaff(s, p);
      this.emit({ e: 'cajado', el, phase: 'devolve', pid: p.id });
      return true;
    }
    deny('ocupado');
    return true;
  }

  // tira o cajado da mão do dono e o põe de volta no pedestal
  private returnStaff(s: StaffSim, p: SimPlayer | undefined) {
    if (p) {
      p.weapons = p.weapons.filter((w) => !(isStaff(w) && WEAPONS[w].staff === s.el));
    }
    // quem põe o cajado desperto na Mesa o recebe de volta no fim da missão (travado a partir da etapa 3)
    if (p && s.awake && !this.missionLocked()) s.prevOwner = p.id;
    s.st = 'pedestal';
    s.owner = '';
  }

  // fim da missão: cada cajado volta a quem o pôs na Mesa; sem esse dono (saiu, morreu ou já segura
  // outro cajado), vai para o primeiro vivo sem cajado; sem ninguém, fica no pedestal
  private handBackStaffs() {
    const give = (s: StaffSim, o: SimPlayer) => {
      this.h.giveWeapon(o, `cajado-${s.el}-d`, o.weapons[o.weapons.length - 1]);
      s.st = 'mao';
      s.owner = o.id;
    };
    const loose: StaffSim[] = [];
    for (const s of this.staffs) {
      const o = this.h.players.get(s.prevOwner);
      if (o && o.life !== 'dead' && !this.holdingStaff(o)) give(s, o);
      else loose.push(s);
    }
    for (const s of loose) {
      const o = [...this.h.players.values()].find((x) => x.life !== 'dead' && !this.holdingStaff(x));
      if (o) give(s, o);
    }
  }

  private interactAltar(p: SimPlayer, it: Interactable): boolean {
    const el = it.ref as Element;
    const s = this.staffOf(el);
    const deny = (reason: 'faltam' | 'ocupado') => this.emit({ e: 'deny', pid: p.id, reason });
    if (s.st === 'altar') {
      if (s.awake) {
        if (this.holdingStaff(p)) {
          this.emit({ e: 'deny', pid: p.id, reason: 'unica' });
          return true;
        }
        this.h.giveWeapon(p, `cajado-${el}-d`, p.weapons[p.weapons.length - 1]);
        s.st = 'mao';
        s.owner = p.id;
        s.charge = 0;
        this.emit({ e: 'desperto', el, pid: p.id });
        return true;
      }
      deny('ocupado');
      return true;
    }
    // o cajado normal na mão, enigma resolvido: põe no altar
    const held = p.weapons.find((w) => isStaff(w) && WEAPONS[w].staff === el && !WEAPONS[w].awake);
    if (held && s.st === 'mao' && s.owner === p.id && s.solved && !s.awake) {
      p.weapons = p.weapons.filter((w) => w !== held);
      s.st = 'altar';
      s.owner = '';
      s.charge = 0;
      this.emit({ e: 'cajado', el, phase: 'altar', pid: p.id });
      return true;
    }
    deny('faltam');
    return true;
  }

  // dono sangrou até o fim ou saiu: o cajado volta sozinho ao pedestal
  onPlayerGone(p: SimPlayer) {
    const t = this.P(p);
    Object.assign(t, { shovel: false, goldShovel: false, helmet: false, shield: 0, punho: false, hold: null, burn: 0, zblood: 0 });
    p.weapons = p.weapons.filter((w) => !isStaff(w));
    for (const s of this.staffs) {
      if (s.st === 'mao' && s.owner === p.id) {
        s.st = 'pedestal';
        s.owner = '';
        this.emit({ e: 'cajado', el: s.el, phase: 'perde', pid: p.id });
      }
    }
    if (this.build.drone.owner === p.id) {
      Object.assign(this.build.drone, { state: 'espera', t: T.droneCd, owner: '' });
    }
  }

  // ---------- Tábua de Pedra e Punho de Ferro ----------

  private interactTabuaAltar(p: SimPlayer): boolean {
    const t = this.P(p);
    if (this.tabua === 'equipe') {
      this.tabua = 'altar';
      this.team.delete('tabua');
      this.tabuaCharge = 0;
      this.emit({ e: 'tabua', phase: 'altar', pid: p.id });
      return true;
    }
    if (this.tabua === 'cheia') {
      if (this.punhoTaken.has(p.id)) {
        this.emit({ e: 'deny', pid: p.id, reason: 'possui' });
        return true;
      }
      this.punhoTaken.add(p.id);
      t.punho = true;
      this.emit({ e: 'tabua', phase: 'punho', pid: p.id });
      return true;
    }
    this.emit({ e: 'deny', pid: p.id, reason: this.tabua === 'cripta' ? 'faltam' : 'ocupado' });
    return true;
  }

  // ---------- desafios ----------

  challengeProgress(p: SimPlayer): number[] {
    const t = this.P(p);
    return [Math.min(T.challenge[0], p.kills), t.flags[1], Math.min(T.challenge[2], p.headshots), t.flags[3]];
  }

  private challengeDone(p: SimPlayer, i: number) {
    const v = this.challengeProgress(p)[i];
    return i === 1 || i === 3 ? v >= 1 : v >= T.challenge[i];
  }

  private interactChallenge(p: SimPlayer, it: Interactable): boolean {
    const t = this.P(p);
    let any = false;
    for (let i = 0; i < 4; i++) {
      if (t.claimed[i] || !this.challengeDone(p, i)) continue;
      any = true;
      t.claimed[i] = true;
      let prize = '';
      const [cx, cz] = this.D.challengeChests[Number(it.ref)] ?? [p.x, p.z];
      if (i === 0) {
        const k = pick(this.powerupPool());
        this.h.dropPowerup(k, cx, 0, cz);
        prize = k;
      } else if (i === 1) {
        t.artilharia += 3;
        prize = '3 Granadas de Artilharia';
      } else if (i === 2) {
        this.h.giveWeapon(p, 'raygun', p.weapons[p.weapons.length - 1]);
        prize = 'Desintegrador';
      } else {
        t.extraPerk = true;
        prize = '+1 vaga de bebida';
      }
      this.emit({ e: 'desafio', pid: p.id, idx: i, prize });
    }
    if (!any) this.emit({ e: 'deny', pid: p.id, reason: 'faltam' });
    return true;
  }

  // ---------- Granada de Artilharia ----------

  throwArtillery(p: SimPlayer): boolean {
    const t = this.P(p);
    if (t.artilharia <= 0) return false;
    t.artilharia--;
    this.emit({ e: 'artilharia', phase: 'throw', pid: p.id, x: r3(p.x), z: r3(p.z) });
    return true;
  }

  // a granada pousou: fumaça vermelha e, depois do atraso, as bombas
  artilleryLanded(x: number, z: number, pid: string) {
    this.strikes.push({ x, z, t: T.artilleryDelay, shells: T.artilleryShells, next: 0, pid });
    this.emit({ e: 'artilharia', phase: 'marca', pid, x: r3(x), z: r3(z) });
  }

  private tickStrikes(dt: number) {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.t -= dt;
      if (s.t > 0) continue;
      s.next -= dt;
      if (s.next > 0) continue;
      s.next = 2 / T.artilleryShells;
      s.shells--;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * T.artilleryRadius;
      const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
      this.emit({ e: 'artilharia', phase: 'bomba', pid: s.pid, x: r3(x), z: r3(z) });
      const owner = this.h.players.get(s.pid);
      this.h.setWeapon('artilharia');
      for (const zb of [...this.h.zombies.values()]) {
        if (dist(zb.x, zb.z, x, z) > 3.2) continue;
        // mata até a rodada 25; chefões levam um dano grande
        const dmg = zb.kind === 4 || zb.kind === 6 || zb.kind === 7 ? 4500 : Math.max(zb.hp, 1);
        if (owner) this.h.damageZombie(zb, dmg, owner, 'body', false, true);
        else this.h.killSilently(zb);
      }
      this.h.setWeapon(null);
      if (s.shells <= 0) this.strikes.splice(i, 1);
    }
  }

  // ---------- armas dos cajados ----------

  // chão onde a mira acaba (parede, chão ou 30 m à frente)
  private aimPoint(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max = 40): [number, number] {
    const hit = this.h.world.raycast(ox, oy, oz, dx, dy, dz, max);
    const t = hit ? Math.max(0, hit.t - 0.3) : Math.min(max, 14);
    return [ox + dx * t, oz + dz * t];
  }

  // disparo de um cajado (o game.ts manda 'launch'); charged = ataque do cajado desperto
  launchStaff(p: SimPlayer, def: WeaponDef, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, charged: boolean) {
    const d = def;
    this.h.emit({ e: 'shot', pid: p.id, weapon: d.id });
    this.rayShot(p, d.id, ox, oy, oz, dx, dy, dz, d.range);
    const round = this.h.round();
    const scale = Math.max(1, zombieHealth(round) / 800);
    const big = charged && !!d.awake;
    this.h.setWeapon(d.id);
    switch (d.staff) {
      case 'fogo':
        if (big) {
          const [x, z] = this.aimPoint(ox, oy, oz, dx, dy, dz);
          this.addArea('pilar', x, z, 0, 0, 4, 5, p.id, d.id);
        } else {
          const base = Math.atan2(dx, dz);
          const h = Math.hypot(dx, dz) || 1;
          const pitch = Math.atan2(dy, h);
          for (const a of [-0.13, 0, 0.13]) {
            const sp = 42;
            this.h.spawnProjectile('fogo', d.id, p.id, ox + dx * 0.6, oy - 0.08, oz + dz * 0.6,
              Math.sin(base + a) * Math.cos(pitch) * sp, Math.sin(pitch) * sp, Math.cos(base + a) * Math.cos(pitch) * sp);
          }
        }
        break;
      case 'gelo':
        if (big) {
          const [x, z] = this.aimPoint(ox, oy, oz, dx, dy, dz);
          this.addArea('nevasca', x, z, 0, 0, 6, 6, p.id, d.id);
        } else {
          this.frostBeam(p, d, ox, oy, oz, dx, dy, dz);
        }
        break;
      case 'vento':
        if (big) {
          const h = Math.hypot(dx, dz) || 1;
          this.h.openVortexMoving(p.id, ox + (dx / h) * 3, Math.max(oy, 1.2), oz + (dz / h) * 3, 5, 5, 3000, (dx / h) * 3, (dz / h) * 3);
          this.emit({ e: 'area', kind: 'redemoinho', x: r3(ox + (dx / h) * 3), y: 1.2, z: r3(oz + (dz / h) * 3), r: 5, dur: 5 });
        } else {
          this.h.windBlast(p, d, ox, oy, oz, dx, dy, dz);
        }
        break;
      case 'raio':
        if (big) {
          const h = Math.hypot(dx, dz) || 1;
          this.addArea('orbRaio', ox + (dx / h) * 1.5, oz + (dz / h) * 1.5, (dx / h) * 6, (dz / h) * 6, 4, 4, p.id, d.id);
        } else {
          this.h.arcShot(p, d, ox, oy, oz, dx, dy, dz);
        }
        break;
    }
    this.h.setWeapon(null);
    void scale;
  }

  private addArea(kind: AreaFx['kind'], x: number, z: number, vx: number, vz: number, r: number, dur: number, pid: string, weapon: string) {
    this.areas.push({ kind, x, z, vx, vz, r, t: 0, dur, pid, tick: 0, weapon });
    this.emit({ e: 'area', kind, x: r3(x), y: kind === 'orbRaio' ? 1.4 : 0, z: r3(z), r, dur });
  }

  private frostBeam(p: SimPlayer, d: WeaponDef, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) {
    const wall = this.h.world.raycast(ox, oy, oz, dx, dy, dz, d.range);
    const len = wall ? wall.t : d.range;
    const hit = this.h.zombieOnSegment(ox, oy, oz, ox + dx * len, oy + dy * len, oz + dz * len);
    if (hit) this.frostHit(p, d, hit.z, 1);
  }

  private frostHit(p: SimPlayer, d: WeaponDef, z: SimZombie, amount: number) {
    const chief = z.kind === 4 || z.kind === 6 || z.kind === 7;
    const hits = Math.max(3, (d.frost ?? 15) * (0.4 + 0.06 * this.h.round()));
    const before = z.frost ?? 0;
    z.frost = Math.min(chief ? 0.6 : 1, before + amount / hits);
    z.frostPid = p.id;
    if (before === 0) this.emit({ e: 'fx', kind: 'congela', zid: z.id, x: r3(z.x), y: r3(z.y + 1), z: r3(z.z) });
    if (chief) {
      this.h.damageZombie(z, 60, p, 'body', false, true);
      return;
    }
    if (z.frost >= 1) {
      this.emit({ e: 'fx', kind: 'estilhaca', zid: z.id, x: r3(z.x), y: r3(z.y + 1), z: r3(z.z) });
      this.h.damageZombie(z, Math.max(z.hp, 1), p, 'body', false, true);
    }
  }

  // bola de fogo do Cajado de Fogo bateu: dano em volta e queimadura
  fireballImpact(g: { x: number; y: number; z: number; weapon: string; pid: string }) {
    const def = WEAPONS[g.weapon];
    const owner = this.h.players.get(g.pid);
    this.emit({ e: 'boom', x: r3(g.x), y: r3(g.y), z: r3(g.z), kind: 'fire' });
    if (!owner || !def) return;
    const scale = Math.max(1, zombieHealth(this.h.round()) / 800);
    const R = 2.6;
    this.h.setWeapon(def.id);
    for (const z of [...this.h.zombies.values()]) {
      const d = Math.hypot(z.x - g.x, z.y + 1 - g.y, z.z - g.z);
      if (d > R) continue;
      const chief = z.kind === 4 || z.kind === 6 || z.kind === 7;
      const base = def.damage * (1 - 0.5 * (d / R));
      const dmg = chief ? base : Math.max(base, z.hp * 0.5);
      this.h.damageZombie(z, dmg, owner, 'body', false, true);
      if (this.h.zombies.has(z.id) && def.burn) {
        z.burn = { t: def.burn.time, dps: def.burn.dps * scale, acc: 0, pid: owner.id, weapon: def.id };
        this.emit({ e: 'fx', kind: 'queima', zid: z.id, x: r3(z.x), y: r3(z.y + 1), z: r3(z.z) });
      }
    }
    this.h.setWeapon(null);
  }

  private tickAreas(dt: number) {
    for (let i = this.areas.length - 1; i >= 0; i--) {
      const a = this.areas[i];
      a.t += dt;
      a.x += a.vx * dt;
      a.z += a.vz * dt;
      if (a.t >= a.dur) {
        this.areas.splice(i, 1);
        continue;
      }
      a.tick -= dt;
      if (a.tick > 0) continue;
      const owner = this.h.players.get(a.pid);
      const scale = Math.max(1, zombieHealth(this.h.round()) / 2000);
      this.h.setWeapon(a.weapon);
      if (a.kind === 'pilar') {
        a.tick = 0.25;
        for (const z of [...this.h.zombies.values()]) {
          if (dist(z.x, z.z, a.x, a.z) > a.r) continue;
          const dmg = 500 * scale;
          if (owner) this.h.damageZombie(z, dmg, owner, 'body', false, true);
          else this.h.killSilently(z);
        }
      } else if (a.kind === 'nevasca') {
        a.tick = 0.2;
        const def = WEAPONS[a.weapon];
        for (const z of [...this.h.zombies.values()]) {
          if (dist(z.x, z.z, a.x, a.z) > a.r || !owner) continue;
          this.frostHit(owner, def, z, 0.4 * (def.frost ?? 15) * (0.4 + 0.06 * this.h.round()));
        }
      } else if (a.kind === 'orbRaio') {
        a.tick = 0.3;
        for (const z of [...this.h.zombies.values()]) {
          if (dist(z.x, z.z, a.x, a.z) > a.r) continue;
          const chief = z.kind === 4 || z.kind === 6 || z.kind === 7;
          if (owner) this.h.damageZombie(z, chief ? 700 : Math.max(2500, z.hp), owner, 'body', false, true);
          else this.h.killSilently(z);
        }
        this.emit({ e: 'area', kind: 'choque', x: r3(a.x), y: 1.4, z: r3(a.z), r: a.r, dur: 0.3 });
      }
      this.h.setWeapon(null);
    }
  }

  // queimadura e frio nos zumbis
  private tickStatus(dt: number) {
    for (const z of [...this.h.zombies.values()]) {
      if (z.frost) z.frost = Math.max(0, z.frost - dt * 0.18);
      const b = z.burn;
      if (!b) continue;
      b.t -= dt;
      b.acc += dt;
      if (b.acc >= 0.5) {
        b.acc = 0;
        const owner = this.h.players.get(b.pid);
        this.h.setWeapon(b.weapon);
        if (owner) this.h.damageZombie(z, b.dps * 0.5, owner, 'body', false, true);
        else this.h.killSilently(z);
        this.h.setWeapon(null);
      }
      if (b.t <= 0) z.burn = undefined;
    }
  }

  // ---------- abates ----------

  onKill(z: SimZombie, p: SimPlayer, info: { knife: boolean; weapon: string | null }) {
    const w = info.weapon;
    // enigma do Fogo: 6 abates com o cajado a até 8 m de cada baú
    if (w && FIRE_WEAPONS.includes(w)) {
      const s = this.staffOf('fogo');
      if (!s.solved) {
        let bi = -1, bd = T.fireChestRange;
        this.D.chests.forEach((c, i) => {
          const d = dist(c[0], c[1], z.x, z.z);
          if (s.puzzle[i] < T.fireChestKills && d <= bd) {
            bd = d;
            bi = i;
          }
        });
        if (bi >= 0) {
          s.puzzle[bi]++;
          this.emit({ e: 'alvo', kind: 'bau', idx: bi, pid: p.id, ok: true });
          this.checkSolved(s);
        }
      }
    }
    // cajados no altar enchem com abates de qualquer jogador
    for (const s of this.staffs) {
      if (s.st !== 'altar' || s.awake) continue;
      s.charge = Math.min(1, s.charge + 1 / T.staffChargeKills);
      if (s.charge >= 1) {
        s.awake = true;
        this.emit({ e: 'cajado', el: s.el, phase: 'cheio', pid: p.id });
      }
    }
    // Tábua de Pedra: faca dentro da Igreja
    if (this.tabua === 'altar' && info.knife && this.groupAt(z.x, z.z) === 'i') {
      this.tabuaCharge++;
      if (this.tabuaCharge >= T.punhoKills) {
        this.tabua = 'cheia';
        this.emit({ e: 'tabua', phase: 'cheia', pid: p.id });
      }
    }
    // missão: colheita dentro do anel; o Sangue Morto cai mais na etapa dos olhos
    const m = this.missao;
    if (m.active && m.step === 3 && dist(z.x, z.z, this.D.ring.c[0], this.D.ring.c[1]) <= 16) {
      m.count++;
      if (m.count >= T.missaoKills) this.missionStep(4, 'Colheita completa: agora, os olhos dos colossos.');
    }
    if (m.active && m.step === 4 && Math.random() < 0.015) this.h.dropPowerup('sangue', z.x, z.y, z.z);
  }

  // ---------- missão principal ----------

  private missionStep(step: number, text: string) {
    const m = this.missao;
    m.step = step;
    m.count = step === 4 ? m.eyes.filter(Boolean).length : 0;
    this.emit({ e: 'missao', step, phase: 'passo', text });
  }

  private tickMission(dt: number) {
    const m = this.missao;
    if (m.done) return;
    if (m.step === 1 && this.staffs.every((s) => s.awake)) this.missionStep(2, 'Os quatro cajados despertaram: ponha todos na Mesa dos Cajados.');
    if (m.step === 2 && this.forjaUp && this.staffs.every((s) => s.awake && s.st === 'pedestal')) {
      m.active = true;
      m.startRound = this.h.round();
      m.t = T.missaoRounds;
      m.eyes = [false, false, false];
      this.missionStep(3, 'O anel de pedra gira. Os cajados ficam presos: 100 abates dentro do anel.');
    }
    if (m.step === 5 && m.defense > 0) {
      m.t = Math.max(0, m.t - dt);
      this.defenseSpawn -= dt;
      if (this.defenseSpawn <= 0 && this.h.state() !== 'gameover') {
        this.defenseSpawn = 0.7;
        const near = this.alive();
        if (near.length && this.h.zombies.size < 34) this.h.spawnZombie();
      }
      if (m.t <= 0) this.finishMission();
    }
  }
  private defenseSpawn = 0;

  private interactPoco(p: SimPlayer): boolean {
    const m = this.missao;
    if (!m.active || m.step !== 5 || m.defense > 0) {
      this.emit({ e: 'deny', pid: p.id, reason: m.active && m.defense > 0 ? 'ocupado' : 'faltam' });
      return true;
    }
    m.defense = 1;
    m.t = T.missaoDefense;
    this.emit({ e: 'missao', step: 5, phase: 'defesa', text: 'Defenda o poço por 90 segundos!' });
    this.spawnPanzer();
    this.spawnPanzer();
    return true;
  }

  private finishMission() {
    const m = this.missao;
    m.done = true;
    m.active = false;
    m.defense = 0;
    m.step = 6;
    for (const z of [...this.h.zombies.values()]) this.h.killSilently(z);
    this.panzerQueue = 0;
    this.panzerTimer = -1;
    this.emit({ e: 'missao', step: 6, phase: 'fim', text: 'A canção da escavação termina. A terra se cala.' });
    for (const p of this.h.players.values()) {
      if (p.life === 'dead') continue;
      for (const k of Object.keys(PERKS) as PerkId[]) if (!p.perks.includes(k)) this.h.grantPerk(p, k);
    }
    this.handBackStaffs();
  }

  get missionDone() {
    return this.missao.done;
  }

  // ---------- ligação com a GameSim ----------

  virtualIt(id: string): Interactable | undefined {
    const d = this.drops.find((x) => x.id === id);
    return d ? { id, kind: 'part', ref: d.key, use: [d.x, d.z], y: 0, reach: 1.8 } : undefined;
  }

  // devolve true se tratou a interação (inclusive recusando)
  interact(p: SimPlayer, it: Interactable): boolean {
    switch (it.kind) {
      case 'generator': return this.interactGenerator(p, it);
      case 'fizz': return this.interactFizz(p, it);
      case 'tank': return this.interactTank(p);
      case 'shovel': return this.interactShovel(p);
      case 'mound': return true;
      case 'part': return this.interactPart(p, it);
      case 'bench': return this.interactBench(p, it);
      case 'portal': return this.interactPortal(p, it);
      case 'staffPedestal': return this.interactStaffPedestal(p, it);
      case 'altar': return this.interactAltar(p, it);
      case 'tabuaAltar': return this.interactTabuaAltar(p);
      case 'challenge': return this.interactChallenge(p, it);
      case 'missao': return this.interactPoco(p);
      default: return false;
    }
  }

  tick(dt: number) {
    this.tickGens(dt);
    this.tickForja(dt);
    this.tickFizz(dt);
    this.tickHolds(dt);
    this.tickTank(dt);
    this.tickRobots(dt);
    this.tickTemplars(dt);
    this.tickPanzerSpawn(dt);
    this.tickPlayers(dt);
    this.tickDrone(dt);
    this.tickPortals(dt);
    this.tickAreas(dt);
    this.tickStatus(dt);
    this.tickStrikes(dt);
    this.tickMission(dt);
  }

  // começo de rodada: clima, montes, Cruzados e Blindado
  roundStarted(round: number) {
    this.planPanzer(round);
    this.onRoundStart(round);
  }

  // ---------- estado enviado aos navegadores ----------

  playerFields(p: SimPlayer): Partial<NetPlayer> {
    const t = this.P(p);
    return {
      shovel: t.shovel, goldShovel: t.goldShovel, helmet: t.helmet, shield: Math.round(t.shield), punho: t.punho,
      artilharia: t.artilharia, zblood: r3(t.zblood), challenges: this.challengeProgress(p), claimed: [...t.claimed], extraPerk: t.extraPerk,
    };
  }

  snap(): TrincheiraSnap {
    const gens: TrGen[] = this.gens.map((g) => ({ on: g.on, progress: r3(g.progress), capturing: g.capturing, attacked: g.attacked }));
    const r = this.robot;
    const staffs: TrStaff[] = this.staffs.map((s) => ({
      el: s.el, st: s.st, awake: s.awake, owner: s.owner, charge: r3(s.charge), solved: s.solved, puzzle: [...s.puzzle], seq: [...s.seq],
    }));
    const k = this.tank;
    const d = this.build.drone;
    return {
      gens,
      weather: this.weather,
      forjaUp: this.forjaUp,
      fizz: { loc: this.fizz.loc, state: this.fizz.state, t: r3(Math.max(0, this.fizz.t)), uses: this.fizz.uses },
      mounds: [...this.mounds],
      tank: { x: r3(k.x), z: r3(k.z), yaw: r3(k.yaw), state: k.state, stop: k.stop, wait: r3(Math.max(0, k.wait)), cooldown: r3(Math.max(0, k.cooldown)) },
      robot: r ? { id: r.id, phase: r.phase, warn: r3(Math.max(0, r.warn)), step: r.step, sub: r.sub, t: r3(Math.min(1, r.t)), dir: r.dir } : null,
      team: [...this.team],
      pick: [...this.picks],
      drops: this.drops.map((x) => ({ ...x, x: r3(x.x), z: r3(x.z) })),
      windOpen: this.windOpen,
      build: {
        escudo: { ...this.build.escudo },
        drone: { built: d.built, bench: d.bench, state: d.state, owner: d.owner, t: r3(Math.max(0, d.t)), x: r3(d.x), y: r3(d.y), z: r3(d.z) },
      },
      portals: [...this.portals],
      disco: this.discoLoc,
      staffs,
      tabua: this.tabua,
      tabuaCharge: this.tabuaCharge,
      missao: { step: this.missao.step, count: this.missao.step === 4 ? this.missao.eyes.filter(Boolean).length : this.missao.count, t: r3(this.missao.t) },
      recapture: this.recapturing,
    };
  }

  // ---------- atalhos de teste (só em desenvolvimento; o game.ts os expõe com ?autoplay) ----------

  debug(cmd: string, arg: string | undefined, me: SimPlayer) {
    const t = this.P(me);
    switch (cmd) {
      case 'gens':
        this.gens.forEach((g, i) => {
          if (!g.on) {
            g.on = true;
            g.capturing = false;
            this.gensEver++;
            this.emit({ e: 'gen', gen: i, on: true, pid: me.id, phase: 'done' });
          }
        });
        this.afterGenChange();
        break;
      case 'itens':
        for (const [key, locs] of Object.entries(this.D.pickups)) {
          if (key.startsWith('cristal')) continue;
          void locs;
          this.team.add(key);
          for (const id of [...this.picks]) if (id.startsWith(`part:${key}:`)) this.picks.delete(id);
        }
        for (const el of ELEMENT_LIST) {
          this.team.add(`${el}-1`);
          this.team.add(`${el}-2`);
          this.team.add(`${el}-3`);
          this.team.add(`cristal-${el}`);
        }
        this.tabua = 'equipe';
        this.windOpen = true;
        break;
      case 'clima':
        this.weather = (arg as Weather) ?? 'neve';
        if (this.weather === 'neve') this.snowEver = true;
        for (let i = this.D.mounds.length - 3; i < this.D.mounds.length; i++) if (this.weather === 'neve') this.mounds.add(i);
        break;
      case 'colosso': {
        this.robot = null;
        const id = (arg as TrRobot['id']) ?? 'atlas';
        this.robotNext = ROBOT_ORDER.indexOf(id);
        this.robotPause = 0;
        this.forceRobot = true;
        break;
      }
      case 'sangue':
        this.giveBlood(me);
        break;
      case 'cajados':
        for (const s of this.staffs) {
          s.st = 'pedestal';
          s.awake = true;
          s.solved = true;
        }
        break;
      case 'portais':
        this.team.add('gramofone');
        this.team.add('disco');
        this.portals.fill(true);
        for (const e of ELEMENT_LIST) this.h.world.openDoors.add(`portal-${e}`);
        this.h.rebuildNav();
        break;
      case 'blindado':
        this.spawnPanzer();
        break;
      case 'cruzados':
        for (const d of this.h.map.doors) this.h.world.openDoors.add(d.id);
        this.h.rebuildNav();
        this.gensEver = Math.max(this.gensEver, 3);
        if (!this.gens.some((g) => g.on)) {
          this.gens[0].on = true;
          this.gens[1].on = true;
          this.gens[2].on = true;
        }
        this.startRecapture();
        break;
      case 'tanque':
        t.hold = null;
        Object.assign(this.tank, { state: 'volta', stop: null, wait: 0.5, v: 0 });
        break;
      case 'montes':
        for (let i = 0; i < this.D.mounds.length - 3; i++) this.mounds.add(i);
        t.shovel = true;
        break;
      case 'drone':
        this.build.drone.built = true;
        this.build.drone.bench = 0;
        break;
      case 'escudo':
        this.build.escudo.built = true;
        this.build.escudo.bench = 0;
        t.shield = T.shieldHp;
        break;
      case 'desafios':
        t.flags = [T.challenge[0], 1, T.challenge[2], 1];
        me.kills = Math.max(me.kills, T.challenge[0]);
        me.headshots = Math.max(me.headshots, T.challenge[2]);
        break;
      case 'artilharia':
        t.artilharia += 3;
        break;
      case 'punho':
        t.punho = true;
        break;
      case 'missao': {
        const n = Number(arg ?? 3);
        for (const s of this.staffs) {
          s.st = 'pedestal';
          s.awake = true;
          s.solved = true;
          s.prevOwner = me.id;
        }
        this.forjaUp = true;
        this.missao.active = n >= 3;
        this.missao.startRound = this.h.round();
        this.missionStep(n, 'teste');
        break;
      }
      default:
        break;
    }
  }
  forceRobot = false;
}
