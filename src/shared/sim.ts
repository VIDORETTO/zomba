import {
  BARRICADE, BISPO, BLEEDOUT_TIME, BOSS, BUS, DOGS, VULTO, FIRST_ROUND_DELAY, INTERMISSION_TIME, LAVA_DAMAGE, LAVA_INTERVAL,
  PLAYER, POINTS, REVIVE_RANGE, REVIVE_TIME, TRINCHEIRA, ZOMBIE,
} from './constants';
import { ENTRY_BOARDS, entryPoints, type MapDef } from './map/types';
import { NavGrid } from './navgrid';
import { BUS_DOOR, TANK_BODY, busCollide, busGround, toLocal, toWorld } from './busBody';
import { TrincheiraSystems, type TrHost } from './trincheira';
import { bossHealth, zombieHealth } from './rounds';
import type {
  BoxState, ForgeState, GameEvent, NetPlayer, NetZombie, PlayerInput, ProjectileKind, RoundState, Snapshot, ZombieAnim, ZombieKind,
} from './protocol';
import { angleLerp, clamp, mulberry32 } from './rng';
import { BASE_PERKS, MAX_PERKS, PERK_FX, SELF_REVIVE_TIME, SOLO_SELF_REVIVES, perkPrice, type PerkId } from './perks';
import { DEFAULT_POOL, POWERUP, POWERUPS, type PowerupKind } from './powerups';
import { BANK, MAX_START_ROUND, startPoints } from './progress';
import { BOX, BOX_POOL, FORGE, GRENADE, KNIFE, PROJECTILES, SIGHTS, WEAPONS, WONDER, ammoPrice, baseId, damageFor, sightFits, upgradeId, wallAmmoPrice, type HitPart, type WeaponDef } from './weapons';

export { bossHealth, zombieHealth };
import { World } from './world';

export interface SimPlayer extends NetPlayer {
  lastHurt: number;
  lavaTimer: number;
  reviveTarget: string | null;
  knifeReady: number;
  selfReviveT: number;
  repairEntry: number | null;
  repairT: number;
  repairPts: number;
  lastLaunch: number;
  // saldo do banco que o navegador informou ao entrar (a simulação confere saques e depósitos)
  bank: number;
}

interface SimGrenade {
  id: number;
  kind: Exclude<ProjectileKind, 'orb' | 'orbRaio'>;
  weapon: string;
  traveled: number;
  stuck: boolean;
  stuckT: number;
  pid: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
}

export interface SimZombie {
  // no convés do tanque (C7): posição local guardada, e a escalada em andamento (segundos e de onde saiu)
  onTank?: boolean;
  tl?: [number, number];
  climbT?: number;
  climbFrom?: [number, number];
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  kind: ZombieKind;
  speed: number;
  anim: ZombieAnim;
  t: number;
  look: number;
  attackT: number;
  attackHit: boolean;
  losT: number;
  los: boolean;
  bestNav: number;
  stuckT: number;
  // entrada pela barricada: aproximar, arrancar tábuas, pular para dentro
  entry: number;
  phase: 'none' | 'approach' | 'tear' | 'climb';
  phaseT: number;
  // só o Carrasco
  boss?: BossState;
  // só o Bispo
  bispo?: BispoState;
  // Trincheira: Blindado, Cruzado, queimadura, frio e se é extra (não conta para o total da rodada)
  panzer?: PanzerState;
  templar?: { atkT: number };
  burn?: { t: number; dps: number; acc: number; pid: string; weapon: string };
  frost?: number;
  frostPid?: string;
  extra?: boolean;
}

export interface PanzerState {
  maxHp: number;
  visor: boolean;
  visorTaken: number;
  state: 'walk' | 'flame' | 'claw' | 'jump';
  t: number;
  flameCD: number;
  clawCD: number;
  farT: number;
  flameAcc: number;
  target: string | null;
  hit: boolean;
}

interface BispoState {
  maxHp: number;
  phase: number;
  shieldT: number;
  ringT: number;
  orbT: number;
  castT: number;
  summonT: number;
  pillarT: number;
}

interface BossState {
  maxHp: number;
  taken: number;
  armor: boolean;
  slamCD: number;
  chainCD: number;
  chargeCD: number;
  target: string | null;
  dirX: number;
  dirZ: number;
  hit: Set<string>;
  ran: number;
}

export function zombiesForRound(round: number, players: number): number {
  const max = 24 + Math.max(0, players - 1) * 6;
  let mult = Math.max(1, round / 5);
  if (round >= 10) mult *= round * 0.15;
  const early = [0.25, 0.3, 0.5, 0.7, 0.9];
  if (round <= 5) return Math.floor(max * early[round - 1]);
  return Math.floor(max * mult);
}

export function dogsForRound(players: number, hellRoundsBefore: number): number {
  return Math.min(DOGS.max, DOGS.perPlayer * players + DOGS.perHellRound * hellRoundsBefore);
}

export function dogHealth(hellRoundsBefore: number): number {
  return DOGS.health[Math.min(hellRoundsBefore, DOGS.health.length - 1)];
}

const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

const isDog = (z: { kind: ZombieKind }) => z.kind === 3;
const isBoss = (z: { kind: ZombieKind }) => z.kind === 4;
const isVulto = (z: { kind: ZombieKind }) => z.kind === 5;
const isBispo = (z: { kind: ZombieKind }) => z.kind === 6;
// chefões: não morrem de Golpe Fatal nem da Bomba, não são atropelados nem engolidos
const isChief = (z: { kind: ZombieKind }) => z.kind === 4 || z.kind === 6 || z.kind === 7;
const isPanzer = (z: { kind: ZombieKind }) => z.kind === 7;

const r3 = (v: number) => Math.round(v * 1000) / 1000;

// Simulação autoritativa da partida. Roda no navegador (solo) ou no servidor (co-op).
export class GameSim {
  readonly world: World;
  private readonly nav: NavGrid;
  readonly players = new Map<string, SimPlayer>();
  private readonly zombies = new Map<number, SimZombie>();
  round = 0;
  state: RoundState = 'waiting';
  private stateTimer = 0;
  private time = 0;
  private toSpawn = 0;
  private spawnTimer = 0;
  private nextZid = 1;
  private navTimer = 0;
  private events: GameEvent[] = [];
  readonly boards: number[];
  private readonly occupant: (number | null)[];
  private grenades: SimGrenade[] = [];
  private nextGid = 1;
  // buracos negros do Vórtice e os zumbis que eles estão puxando neste passo
  private vortices: { id: number; x: number; y: number; z: number; r: number; t: number; dur: number; pid: string; damage: number; pulse: number; vx?: number; vz?: number }[] = [];
  private readonly sucked = new Set<number>();
  // como o próximo zumbi morto morre (arremessado, engolido, eletrocutado): vai junto no evento
  private killFx: { fling?: [number, number, number]; sucked?: boolean; shock?: boolean } | null = null;
  // ritual do Bispo (Cidade), bolas de fogo dele e pilares marcados no chão
  readonly ritual: { candles: boolean[]; state: 'idle' | 'summoning' | 'fight' | 'done'; t: number } | null;
  private orbs: { id: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number }[] = [];
  private pillars: { x: number; z: number; t: number }[] = [];
  // Caixa Misteriosa
  readonly box: BoxState = { loc: 0, state: 'idle', t: 0, weapon: null, pid: null, fireSale: false };
  private boxResult = '';
  private boxSpins = 0;
  private boxPrice = 0;
  private boxMoved = false;
  // itens que caem e efeitos ativos
  private powerups: { id: number; kind: PowerupKind; x: number; y: number; z: number; t: number }[] = [];
  private nextPid = 1;
  private dropsThisRound = 0;
  private lastDrop: PowerupKind | null = null;
  private readonly effects = { insta: 0, double: 0, firesale: 0 };
  // Forja: desligada até as 3 velas acenderem
  readonly forge: ForgeState = { on: false, candles: [false, false, false], state: 'idle', t: 0, weapon: null, pid: null };

  readonly firstRound: number;
  // rodada infernal: a atual, a próxima e quantas já passaram
  hell = false;
  nextHellRound: number;
  hellRounds = 0;
  private lastDogPos: [number, number, number] | null = null;
  // Carrasco: rodada em que ele vem e quanto falta para aparecer nela (-1 = não vem)
  nextBossRound: number;
  bossTimer = -1;
  // mapa Rota: energia, ônibus e tempo de cada jogador na névoa
  power = false;
  bus: { x: number; z: number; yaw: number; seg: number; d: number; v: number; wait: number; stop: string | null; honked: boolean } | null = null;
  private readonly fogT = new Map<string, number>();
  private vultoT = 0;
  private noFogT = 0;
  // Trincheira: regras do mapa (null nos outros mapas) e a arma que causa o dano que está sendo aplicado
  readonly tr!: TrincheiraSystems | null;
  private curWeapon: string | null = null;

  // gerador da partida (com `seed`, sempre a mesma sequência; sem ela, o aleatório do motor)
  private rng: () => number = Math.random;
  // registro de ajuste da Trincheira (F1): só ligado com `log: true`
  private readonly logOn: boolean;

  constructor(map: MapDef, readonly solo: boolean, opts: { startRound?: number; seed?: number; log?: boolean } = {}) {
    if (opts.seed !== undefined) this.rng = mulberry32(opts.seed);
    this.logOn = !!opts.log;
    this.firstRound = Math.max(1, Math.min(MAX_START_ROUND, Math.floor(opts.startRound ?? 1)));
    // começando depois da rodada 4, a primeira rodada infernal vem 2 a 4 rodadas depois
    this.nextHellRound = this.firstRound < DOGS.firstMin
      ? randInt(DOGS.firstMin, DOGS.firstMax)
      : this.firstRound + randInt(2, 4);
    this.nextBossRound = this.firstRound <= BOSS.firstRound ? BOSS.firstRound : this.firstRound + randInt(2, 4);
    if (this.nextBossRound === this.nextHellRound) this.nextBossRound++;
    // Trincheira: sem cães infernais e o chefão é o Blindado (a classe da Trincheira cuida dele)
    if (map.hellRounds === false) this.nextHellRound = Infinity;
    if (map.boss === 'blindado') this.nextBossRound = Infinity;
    // ônibus parado na primeira parada da rota, esperando os jogadores
    const route = map.bus;
    if (route && route.stops.length) {
      const s = route.stops[0];
      const [x, z] = route.path[s.at];
      const [nx, nz] = route.path[(s.at + 1) % route.path.length];
      this.bus = { x, z, yaw: Math.atan2(nx - x, nz - z), seg: s.at, d: 0, v: 0, wait: BUS.firstWait, stop: s.zone, honked: false };
    }
    this.ritual = map.ritual ? { candles: map.ritual.candles.map(() => false), state: 'idle', t: 0 } : null;
    // mapa sem velas nem energia (Trincheira): a Forja já começa acesa
    if (!map.forge.candles.length && !map.forgeNeedsPower && !map.forgeNeedsGenerators) this.forge.on = true;
    this.world = new World(map);
    this.nav = new NavGrid(this.world, ZOMBIE.radius);
    this.boards = map.entries.map(() => ENTRY_BOARDS);
    this.occupant = map.entries.map(() => null);
    // só o local atual da caixa tem colisão
    map.boxSpots.forEach((_, i) => {
      if (i !== this.box.loc) this.world.openDoors.add(`box-spot-${i}`);
    });
    this.tr = map.trincheira ? new TrincheiraSystems(this.trHost()) : null;
    this.nav.rebuild();
  }

  // O que a Trincheira pode pedir à simulação (fechamentos sobre os membros privados daqui).
  private trHost(): TrHost {
    const self = this;
    return {
      map: this.world.map,
      world: this.world,
      nav: this.nav,
      solo: this.solo,
      players: this.players,
      zombies: this.zombies,
      time: () => self.time,
      round: () => self.round,
      state: () => self.state,
      emit: (e) => self.emit(e),
      addPoints: (p, d) => self.addPoints(p, d),
      grantPerk: (p, perk) => self.grantPerk(p, perk),
      giveWeapon: (p, w, held) => self.giveWeapon(p, w, held),
      damageZombie: (z, dmg, p, part, knife, blast) => self.damageZombie(z, dmg, p, part, knife, blast),
      rand: () => self.rng(),
      devLog: self.logOn,
      damagePlayer: (p, dmg, fx, fz, lava, cause) => self.damagePlayer(p, dmg, fx, fz, lava, cause),
      revivePlayer: (p, by) => self.revivePlayer(p, by),
      killSilently: (z, fx) => self.killSilently(z, fx),
      makeZombie: (kind, x, z, hp, speed, extra) => self.makeZombie(kind, x, z, hp, speed, extra),
      spawnZombie: (at) => self.spawnZombie(at) ?? null,
      dropPowerup: (kind, x, y, z) => {
        self.powerups.push({ id: self.nextPid++, kind, x, y, z, t: 0 });
      },
      randomPowerup: () => {
        const pool = (self.world.map.powerupPool ?? DEFAULT_POOL).filter((k) => k !== 'freeperk' && (k !== 'firesale' || self.boxMoved));
        return pool[Math.floor(Math.random() * pool.length)];
      },
      applyPowerupTo: (kind, p) => self.applyPowerup(kind, p),
      rebuildNav: () => {
        self.nav.rebuild();
        self.navTimer = 0;
      },
      roundZombies: () => self.roundZombies(),
      toSpawn: () => self.toSpawn,
      groundY: (x, z, r, y) => self.world.groundHeight(x, z, r, y),
      isRoundActive: () => self.state === 'active',
      playerList: () => [...self.players.values()],
      fireSale: () => self.effects.firesale > 0,
      igniteForge: () => {
        if (self.forge.on) return;
        self.forge.on = true;
        self.emit({ e: 'forge', phase: 'on', pid: null, weapon: null });
      },
      setWeapon: (w) => {
        self.curWeapon = w;
      },
      spawnProjectile: (kind, weapon, pid, x, y, z, vx, vy, vz) => {
        self.grenades.push({ id: self.nextGid++, kind, weapon, traveled: 0, stuck: false, stuckT: 0, pid, x, y, z, vx, vy, vz, t: 0 });
      },
      openVortexMoving: (pid, x, y, z, r, dur, damage, vx, vz) => {
        const id = self.nextGid++;
        self.vortices.push({ id, x, y, z, r, t: 0, dur, pid, damage, pulse: 0, vx, vz });
        self.emit({ e: 'vortex', phase: 'open', id, x: r3(x), y: r3(y), z: r3(z), r, dur });
      },
      windBlast: (p, def, ox, oy, oz, dx, dy, dz) => self.windBlast(p as SimPlayer, def, ox, oy, oz, dx, dy, dz),
      arcShot: (p, def, ox, oy, oz, dx, dy, dz) => self.arcShot(p as SimPlayer, def, ox, oy, oz, dx, dy, dz),
      zombieOnSegment: (ax, ay, az, bx, by, bz) => self.zombieOnSegment(ax, ay, az, bx, by, bz),
    };
  }

  // registro de ajuste da Trincheira (null sem a opção `log`): rodadas e tempos dos geradores, quedas por causa, recapturas, colossos e cajados
  devLog() {
    return this.tr?.log ?? null;
  }

  addPlayer(id: string, name: string, slot: number, level = 1, bank = 0) {
    const [x, z] = this.world.map.playerSpawns[slot % this.world.map.playerSpawns.length];
    this.players.set(id, {
      id, name, slot, x, y: 0, z, yaw: 0, pitch: 0, crouch: false, speed: 0,
      life: 'alive', health: PLAYER.maxHealth, points: startPoints(this.firstRound), level, earned: 0,
      kills: 0, headshots: 0, downs: 0, revives: 0, bleed: 0, revive: 0,
      maxHealth: PLAYER.maxHealth, perks: [], selfRevives: 0,
      weapons: [this.world.map.startWeapon ?? 'pistol'], grenades: GRENADE.start, heavyKnife: false, sights: {},
      lastHurt: -99, lavaTimer: 0, reviveTarget: null, knifeReady: 0, selfReviveT: 0,
      repairEntry: null, repairT: 0, repairPts: 0, lastLaunch: -99,
      bank: Math.max(0, Math.min(BANK.limit, Math.floor(Number(bank) || 0))),
    });
  }

  removePlayer(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    this.tr?.onPlayerGone(p);
    this.players.delete(id);
    this.fogT.delete(id);
    this.emit({ e: 'pleave', pid: id, name: p.name });
    this.checkGameOver();
  }

  start() {
    // a primeira rodada que começa é a rodada inicial escolhida
    this.round = this.firstRound - 1;
    this.state = 'intermission';
    this.stateTimer = FIRST_ROUND_DELAY;
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private emit(e: GameEvent) {
    this.events.push(e);
  }

  handle(pid: string, msg: PlayerInput) {
    const p = this.players.get(pid);
    if (!p || this.state === 'gameover') return;
    switch (msg.t) {
      case 'state': {
        if (p.life === 'dead') return;
        if (![msg.x, msg.y, msg.z, msg.yaw, msg.pitch, msg.speed].every(Number.isFinite)) return;
        p.yaw = msg.yaw;
        p.pitch = msg.pitch;
        // caído também se mexe: rasteja devagar (o navegador limita a velocidade)
        const b = this.world.map.bounds;
        // acabou de se teletransportar: ignora a posição velha que o navegador ainda manda
        if (!this.tr?.teleporting(pid)) {
          p.x = clamp(msg.x, b.minX, b.maxX);
          p.y = clamp(msg.y, -1, 30);
          p.z = clamp(msg.z, b.minZ, b.maxZ);
        }
        p.crouch = p.life === 'alive' && msg.crouch;
        p.speed = msg.speed;
        break;
      }
      case 'shoot': {
        if (p.life === 'dead' || !Array.isArray(msg.hits)) return;
        const def = WEAPONS[msg.weapon];
        if (!def || !p.weapons.includes(def.id)) return;
        // com o escudo na mão não se atira (só a pancada)
        if (this.tr?.holdingShield(p)) return;
        this.emit({ e: 'shot', pid, weapon: def.id });
        for (const h of msg.hits.slice(0, def.pellets * (def.pierce ?? 1))) {
          const z = this.zombies.get(h.zid);
          if (!z) continue;
          const d = Math.hypot(z.x - p.x, z.y - p.y, z.z - p.z);
          if (d > def.range + 3) continue;
          const mult = p.perks.includes('gatilho') ? PERK_FX.gatilhoDamageMult : 1;
          const zx = z.x, zy = z.y, zz = z.z;
          // Olho Frio: o peito alto (pescoço) vale cabeça; a cabeça leva +25%
          let part = h.part;
          const eye = p.perks.includes('olho-frio');
          if (eye && part === 'body' && Array.isArray(msg.ray) && msg.ray.length === 6 && msg.ray.every(Number.isFinite)) {
            const [ox, oy, oz, rx, ry, rz] = msg.ray;
            const hl = Math.hypot(rx, rz);
            if (hl > 1e-4) {
              const t = ((z.x - ox) * rx + (z.z - oz) * rz) / (hl * hl);
              const yAt = oy + ry * t;
              if (t > 0 && yAt >= z.y + PERK_FX.olhoNeckY && yAt <= z.y + 2.3) part = 'head';
            }
          }
          const headK = eye && part === 'head' ? PERK_FX.olhoHeadMult : 1;
          // Carrasco: com capacete a cabeça vale como corpo; sem ele, o triplo. Blindado: o visor inteiro faz a cabeça valer como corpo; quebrado, o dobro
          const dmg = isBoss(z) && part === 'head'
            ? damageFor(def, 'body', d) * (z.boss!.armor ? 1 : BOSS.headMult)
            : isPanzer(z) && part === 'head'
              ? damageFor(def, 'body', d) * (z.panzer!.visor ? 1 : 2)
              : damageFor(def, part, d);
          this.curWeapon = def.id;
          this.damageZombie(z, dmg * mult * headK, p, part, false);
          this.curWeapon = null;
          if (def.splash) {
            this.emit({ e: 'boom', x: r3(zx), y: r3(zy + 1.1), z: r3(zz), kind: 'fire' });
            for (const o of [...this.zombies.values()]) {
              if (o.id === h.zid || Math.hypot(o.x - zx, o.z - zz) > def.splash.radius) continue;
              this.damageZombie(o, def.splash.damage * mult, p, 'body', false, true);
            }
          }
        }
        // alvos dos enigmas e olhos dos colossos: um raio no meio da mira
        if (this.tr && Array.isArray(msg.ray) && msg.ray.length === 6 && msg.ray.every(Number.isFinite)) {
          const [ox, oy, oz, rx, ry, rz] = msg.ray;
          const rl = Math.hypot(rx, ry, rz);
          if (rl > 0.5 && Math.hypot(ox - p.x, oy - p.y - 1.4, oz - p.z) < 3) this.tr.rayShot(p, def.id, ox, oy, oz, rx / rl, ry / rl, rz / rl, def.range);
        }
        break;
      }
      case 'knife': {
        if (p.life !== 'alive' || this.time < p.knifeReady) return;
        p.knifeReady = this.time + KNIFE.cooldown * 0.8;
        this.emit({ e: 'knife', pid });
        if (msg.zid === null) return;
        const z = this.zombies.get(msg.zid);
        if (!z || Math.hypot(z.x - p.x, z.z - p.z) > KNIFE.range + 1.2) return;
        if (this.tr?.P(p).punho) {
          // Punho de Ferro: o triplo da faca pesada e o zumbi voa
          const dx = z.x - p.x, dz = z.z - p.z, dl = Math.hypot(dx, dz) || 1;
          this.killFx = { fling: [r3((dx / dl) * 9), r3(5 + Math.random() * 2), r3((dz / dl) * 9)] };
          this.curWeapon = 'punho';
          this.damageZombie(z, KNIFE.heavyDamage * TRINCHEIRA.punhoMult, p, 'body', true);
          this.killFx = null;
          // Punho elemental (depois da missão): fogo, gelo, vento ou raio
          this.tr.punhoEffect(p, z, dx / dl, dz / dl);
        } else {
          this.curWeapon = 'knife';
          this.damageZombie(z, p.heavyKnife ? KNIFE.heavyDamage : KNIFE.damage, p, 'body', true);
        }
        this.curWeapon = null;
        break;
      }
      case 'reload':
        if (p.life === 'alive' && typeof msg.weapon === 'string' && Number.isFinite(msg.ammo)) this.tr?.onReload(p, msg.weapon, msg.ammo);
        break;
      case 'land':
        if (p.life === 'alive' && Number.isFinite(msg.h)) this.tr?.onLand(p, msg.h);
        break;
      case 'shield':
        this.tr?.setShieldHand(p, !!msg.on);
        break;
      case 'bash':
        this.tr?.shieldBash(p);
        break;
      case 'revive':
        p.reviveTarget = p.life === 'alive' ? msg.target : null;
        break;
      case 'interact':
        this.interact(p, msg.id, msg.weapon);
        break;
      case 'grenade': {
        if (p.life === 'dead' || p.grenades <= 0) return;
        const sp = Math.hypot(msg.vx, msg.vy, msg.vz);
        if (Math.hypot(msg.x - p.x, msg.y - p.y - 1.4, msg.z - p.z) > 2.5 || sp > 25 || !Number.isFinite(sp)) return;
        p.grenades--;
        this.grenades.push({
          id: this.nextGid++, kind: 'grenade', weapon: '', traveled: 0, stuck: false, stuckT: 0,
          pid: p.id, x: msg.x, y: msg.y, z: msg.z, vx: msg.vx, vy: msg.vy, vz: msg.vz, t: 0,
        });
        this.emit({ e: 'throw', pid: p.id });
        break;
      }
      case 'launch': {
        const def = WEAPONS[msg.weapon];
        if (p.life === 'dead' || !def?.projectile || !p.weapons.includes(def.id)) return;
        if (this.tr?.holdingShield(p)) return;
        if (this.time - p.lastLaunch < def.fireDelay * 0.7) return;
        const dl = Math.hypot(msg.dx, msg.dy, msg.dz);
        if (!Number.isFinite(dl) || dl < 1e-3 || Math.hypot(msg.x - p.x, msg.y - p.y - 1.4, msg.z - p.z) > 2.5) return;
        p.lastLaunch = this.time;
        if (def.staff && this.tr) {
          this.tr.launchStaff(p, def, msg.x, msg.y, msg.z, msg.dx / dl, msg.dy / dl, msg.dz / dl, !!msg.charged);
          break;
        }
        if (def.projectile === 'frost') break;
        if (def.projectile === 'wind' || def.projectile === 'arc') {
          const ox = msg.x, oy = msg.y, oz = msg.z, dx = msg.dx / dl, dy = msg.dy / dl, dz = msg.dz / dl;
          this.emit({ e: 'shot', pid, weapon: def.id });
          if (def.projectile === 'wind') this.windBlast(p, def, ox, oy, oz, dx, dy, dz);
          else this.arcShot(p, def, ox, oy, oz, dx, dy, dz);
          break;
        }
        const sp = PROJECTILES[def.projectile].speed;
        this.grenades.push({
          id: this.nextGid++, kind: def.projectile, weapon: def.id, traveled: 0, stuck: false, stuckT: 0,
          pid: p.id, x: msg.x, y: msg.y, z: msg.z, vx: (msg.dx / dl) * sp, vy: (msg.dy / dl) * sp, vz: (msg.dz / dl) * sp, t: 0,
        });
        this.emit({ e: 'shot', pid, weapon: def.id });
        break;
      }
      case 'hold':
        if (this.tr) this.tr.hold(p, typeof msg.id === 'string' && msg.id.length < 48 ? msg.id : null);
        break;
      case 'artillery': {
        if (!this.tr || p.life === 'dead') return;
        const sp = Math.hypot(msg.vx, msg.vy, msg.vz);
        if (Math.hypot(msg.x - p.x, msg.y - p.y - 1.4, msg.z - p.z) > 2.5 || sp > 25 || !Number.isFinite(sp)) return;
        if (!this.tr.throwArtillery(p)) return;
        this.grenades.push({
          id: this.nextGid++, kind: 'artilharia', weapon: '', traveled: 0, stuck: false, stuckT: 0,
          pid: p.id, x: msg.x, y: msg.y, z: msg.z, vx: msg.vx, vy: msg.vy, vz: msg.vz, t: 0,
        });
        break;
      }
      case 'repair':
        p.repairEntry = p.life === 'alive' && msg.entry !== null && this.boards[msg.entry] !== undefined ? msg.entry : null;
        if (p.repairEntry === null) p.repairT = 0;
        break;
    }
  }

  // Compra num objeto do mapa (caixote de munição ou máquina de bebida). A simulação confere tudo.
  private interact(p: SimPlayer, id: string, weapon: string) {
    if (p.life !== 'alive') return;
    const it = this.world.map.interactables.find((i) => i.id === id) ?? this.tr?.virtualIt(id);
    if (!it) return;
    const deny = (reason: 'pontos' | 'limite' | 'possui' | 'longe' | 'esgotado' | 'cheio' | 'desligada' | 'unica' | 'mira') => this.emit({ e: 'deny', pid: p.id, reason });
    if (Math.hypot(p.x - it.use[0], p.z - it.use[1]) > (it.reach !== undefined ? it.reach + 0.7 : 2.6)) return deny('longe');
    if (it.minY !== undefined && p.y < it.minY) return deny('longe');
    // Trincheira: geradores, Fonte, tanque, peças, cajados e o resto
    if (this.tr && this.tr.interact(p, it)) return;

    if (it.kind === 'door') {
      const d = this.world.map.doors.find((x) => x.id === it.door);
      if (!d || this.world.openDoors.has(d.id)) return;
      if (p.points < d.cost) return deny('pontos');
      this.addPoints(p, -d.cost);
      this.world.openDoors.add(d.id);
      this.nav.rebuild();
      this.navTimer = 0;
      this.emit({ e: 'door', id: d.id, pid: p.id });
      return;
    }

    if (it.kind === 'bank') {
      if (it.bank === 'deposit') {
        if (p.bank + BANK.step > BANK.limit) return deny('cheio');
        if (p.points < BANK.step) return deny('pontos');
        p.points -= BANK.step;
        p.bank += BANK.step;
        this.emit({ e: 'points', pid: p.id, delta: -BANK.step });
      } else {
        // o saldo mora no navegador do jogador; a simulação só deixa sacar o que ele informou ao entrar
        if (p.bank < BANK.step) return deny('esgotado');
        p.bank -= BANK.step;
        p.points += BANK.step - BANK.fee;
        this.emit({ e: 'points', pid: p.id, delta: BANK.step - BANK.fee });
      }
      this.emit({ e: 'bank', pid: p.id, action: it.bank!, amount: BANK.step });
      return;
    }

    if (it.kind === 'power') {
      if (this.power) return;
      this.power = true;
      this.emit({ e: 'power', pid: p.id });
      // portas que só abrem com a energia (cofre da Forja)
      for (const d of this.world.map.doors) {
        if (d.kind !== 'power' || this.world.openDoors.has(d.id)) continue;
        this.world.openDoors.add(d.id);
        this.emit({ e: 'door', id: d.id, pid: p.id });
      }
      this.nav.rebuild();
      this.navTimer = 0;
      if (this.world.map.forgeNeedsPower && !this.forge.on) {
        this.forge.on = true;
        this.emit({ e: 'forge', phase: 'on', pid: p.id, weapon: null });
      }
      return;
    }

    if (it.kind === 'sight') {
      // a mira vai na arma da mão; trocar de mira substitui a anterior
      const kind = it.sight!;
      if (!p.weapons.includes(weapon) || !sightFits(kind, weapon)) return deny('mira');
      const b = baseId(weapon);
      if (p.sights[b] === kind) return deny('possui');
      if (p.points < SIGHTS[kind].cost) return deny('pontos');
      this.addPoints(p, -SIGHTS[kind].cost);
      p.sights[b] = kind;
      this.emit({ e: 'sight', pid: p.id, weapon, sight: kind });
      return;
    }

    if (it.kind === 'ritual') {
      const r = this.ritual;
      const i = it.candle!;
      if (!r || r.state !== 'idle' || r.candles[i]) return;
      // as velas pretas só pegam fogo depois que a Forja acende
      if (!this.forge.on) return deny('desligada');
      r.candles[i] = true;
      this.emit({ e: 'ritual', phase: 'candle', pid: p.id, candle: i });
      if (r.candles.every(Boolean)) {
        r.state = 'summoning';
        r.t = BISPO.summonDelay;
        this.emit({ e: 'ritual', phase: 'start', pid: p.id, candle: i });
      }
      return;
    }

    if (it.kind === 'candle') {
      const f = this.forge;
      if (f.on || f.candles[it.candle!]) return;
      f.candles[it.candle!] = true;
      this.emit({ e: 'forge', phase: 'candle', pid: p.id, weapon: null });
      if (f.candles.every(Boolean)) {
        f.on = true;
        this.emit({ e: 'forge', phase: 'on', pid: p.id, weapon: null });
      }
      return;
    }

    if (it.kind === 'forge') {
      const f = this.forge;
      if (!f.on) return deny('desligada');
      if (f.state === 'ready') {
        if (f.pid !== p.id) return;
        this.giveWeapon(p, f.weapon!, weapon);
        this.emit({ e: 'forge', phase: 'take', pid: p.id, weapon: f.weapon });
        Object.assign(f, { state: 'idle', t: 0, weapon: null, pid: null });
        return;
      }
      if (f.state !== 'idle') return;
      const def = WEAPONS[weapon];
      if (!def || def.upgraded || !WEAPONS[upgradeId(weapon)] || !p.weapons.includes(weapon)) return deny('possui');
      if (p.weapons.length < 2) return deny('unica');
      if (p.points < FORGE.cost) return deny('pontos');
      this.addPoints(p, -FORGE.cost);
      p.weapons = p.weapons.filter((w) => w !== weapon);
      Object.assign(f, { state: 'working', t: FORGE.workTime, weapon: upgradeId(weapon), pid: p.id });
      this.emit({ e: 'forge', phase: 'start', pid: p.id, weapon });
      return;
    }

    if (it.kind === 'box') {
      const b = this.box;
      if (it.box !== b.loc || b.state === 'moving' || b.state === 'spinning') return;
      if (b.state === 'offer') {
        if (b.pid !== p.id) return;
        // Trincheira: raramente a caixa entrega 3 Granadas de Artilharia em vez de uma arma
        if (b.weapon === 'artilharia' && this.tr) {
          this.tr.P(p).artilharia += 3;
          this.emit({ e: 'peca', pid: p.id, key: 'artilharia' });
        } else this.giveWeapon(p, b.weapon!, weapon);
        this.emit({ e: 'box', phase: 'take', loc: b.loc, pid: p.id, weapon: b.weapon });
        Object.assign(b, { state: 'idle', t: 0, weapon: null, pid: null });
        return;
      }
      const price = b.fireSale ? 10 : BOX.cost;
      if (p.points < price) return deny('pontos');
      this.addPoints(p, -price);
      this.boxSpins++;
      const crow = !b.fireSale && this.boxSpins >= BOX.crowFrom && Math.random() < BOX.crowChance && this.world.map.boxSpots.length > 1;
      this.boxResult = crow ? 'crow' : this.pickBoxWeapon(p);
      Object.assign(b, { state: 'spinning', t: BOX.spinTime, weapon: null, pid: p.id });
      this.boxPrice = price;
      this.emit({ e: 'box', phase: 'spin', loc: b.loc, pid: p.id, weapon: null });
      return;
    }

    if (it.kind === 'weapon') {
      const w = it.weapon!;
      const def = WEAPONS[w];
      if (!def) return;
      if (p.weapons.includes(upgradeId(w))) {
        // versão da Forja: munição na parede por 4500
        const price = wallAmmoPrice(upgradeId(w));
        if (p.points < price) return deny('pontos');
        this.addPoints(p, -price);
        this.emit({ e: 'refill', pid: p.id, weapon: upgradeId(w) });
        return;
      }
      if (p.weapons.includes(w)) {
        // já tem: compra só a munição, pela metade do preço
        const price = wallAmmoPrice(w);
        if (p.points < price) return deny('pontos');
        this.addPoints(p, -price);
        this.emit({ e: 'refill', pid: p.id, weapon: w });
        return;
      }
      if (p.points < def.cost) return deny('pontos');
      this.addPoints(p, -def.cost);
      this.giveWeapon(p, w, weapon);
      return;
    }

    if (it.kind === 'grenade') {
      if (p.grenades >= GRENADE.max) return deny('cheio');
      if (p.points < GRENADE.cost) return deny('pontos');
      this.addPoints(p, -GRENADE.cost);
      p.grenades = GRENADE.max;
      this.emit({ e: 'gear', pid: p.id, item: 'grenades' });
      return;
    }

    if (it.kind === 'knife') {
      if (p.heavyKnife) return deny('possui');
      if (p.points < KNIFE.heavyCost) return deny('pontos');
      this.addPoints(p, -KNIFE.heavyCost);
      p.heavyKnife = true;
      this.emit({ e: 'gear', pid: p.id, item: 'knife' });
      return;
    }

    if (it.kind === 'ammo') {
      const price = ammoPrice(weapon);
      if (price === null) return;
      if (p.points < price) return deny('pontos');
      this.addPoints(p, -price);
      this.emit({ e: 'refill', pid: p.id, weapon });
      return;
    }

    const perk = it.perk!;
    if (this.world.map.perksNeedPower && !this.power) return deny('desligada');
    // Trincheira: cada bebida fixa só vende com o gerador da área ligado
    const pg = this.world.map.perkGen?.[perk];
    if (pg !== undefined && this.tr && !this.tr.gens[pg].on) return deny('desligada');
    if (p.perks.includes(perk)) return deny('possui');
    if (p.perks.length >= (this.tr ? this.tr.perkLimit(p) : MAX_PERKS)) return deny('limite');
    if (perk === 'folego' && this.solo && p.selfRevives >= SOLO_SELF_REVIVES) return deny('esgotado');
    const price = perkPrice(perk, this.solo);
    if (p.points < price) return deny('pontos');
    this.addPoints(p, -price);
    this.grantPerk(p, perk);
  }

  private grantPerk(p: SimPlayer, perk: PerkId) {
    p.perks.push(perk);
    if (perk === 'couraca') {
      p.maxHealth = PERK_FX.couracaHealth;
      p.health = p.maxHealth;
    }
    this.emit({ e: 'perk', pid: p.id, perk });
  }

  // Dá uma arma ao jogador; com o inventário cheio, troca a que está na mão.
  private giveWeapon(p: SimPlayer, w: string, held: string) {
    // já tem essa arma (comprou na parede enquanto a caixa girava, por exemplo): vira munição cheia
    if (p.weapons.includes(w)) {
      this.emit({ e: 'refill', pid: p.id, weapon: w });
      return;
    }
    const slots = 2 + (p.perks.includes('mula') ? 1 : 0);
    let replaced: string | null = null;
    if (p.weapons.length >= slots) {
      const i = Math.max(0, p.weapons.indexOf(held));
      replaced = p.weapons[i];
      p.weapons[i] = w;
      // a arma trocada vai embora com a mira (a da Forja continua com a dela)
      if (baseId(replaced) !== baseId(w)) delete p.sights[baseId(replaced)];
    } else {
      p.weapons.push(w);
    }
    this.emit({ e: 'weapon', pid: p.id, weapon: w, replaced });
  }

  // Sorteio da caixa: nunca uma arma que o jogador já tem.
  private pickBoxWeapon(p: SimPlayer): string {
    if (this.tr && Math.random() < 0.03) return 'artilharia';
    // arma maravilha única: fica fora do sorteio enquanto alguém a tiver (ou ela estiver na Forja)
    const taken = new Set<string>();
    for (const o of this.players.values()) for (const w of o.weapons) taken.add(baseId(w));
    if (this.forge.weapon) taken.add(baseId(this.forge.weapon));
    const excl = this.world.map.boxExclude ?? [];
    const pool = [...BOX_POOL, ...(this.world.map.boxExtra ?? [])].filter(([w]) => !excl.includes(w) && !p.weapons.includes(w) && !p.weapons.includes(upgradeId(w)) && !(WEAPONS[w].unique && taken.has(w)));
    const total = pool.reduce((a, [, wt]) => a + wt, 0);
    let r = Math.random() * total;
    for (const [w, wt] of pool) {
      r -= wt;
      if (r <= 0) return w;
    }
    return pool[pool.length - 1]?.[0] ?? 'smg';
  }

  private updateBox(dt: number) {
    const b = this.box;
    if (b.state === 'idle') return;
    b.t -= dt;
    if (b.t > 0) return;
    if (b.state === 'spinning') {
      if (this.boxResult === 'crow') {
        // o Corvo: devolve os pontos e a caixa foge para outro lugar
        const p = b.pid ? this.players.get(b.pid) : undefined;
        if (p) this.addPoints(p, this.boxPrice);
        this.emit({ e: 'box', phase: 'crow', loc: b.loc, pid: b.pid, weapon: null });
        Object.assign(b, { state: 'moving', t: BOX.moveTime, weapon: null, pid: null });
        return;
      }
      Object.assign(b, { state: 'offer', t: BOX.offerTime, weapon: this.boxResult });
      this.emit({ e: 'box', phase: 'offer', loc: b.loc, pid: b.pid, weapon: b.weapon });
      return;
    }
    if (b.state === 'offer') {
      this.emit({ e: 'box', phase: 'expire', loc: b.loc, pid: b.pid, weapon: b.weapon });
      Object.assign(b, { state: 'idle', t: 0, weapon: null, pid: null });
      return;
    }
    // moving: chega num local diferente
    const spots = this.world.map.boxSpots;
    let next = b.loc;
    while (spots.length > 1 && next === b.loc) next = Math.floor(Math.random() * spots.length);
    this.world.openDoors.add(`box-spot-${b.loc}`);
    this.world.openDoors.delete(`box-spot-${next}`);
    this.nav.rebuild();
    this.boxSpins = 0;
    this.boxMoved = true;
    Object.assign(b, { loc: next, state: 'idle', t: 0, weapon: null, pid: null });
    this.emit({ e: 'box', phase: 'arrive', loc: next, pid: null, weapon: null });
  }

  // Cão Infernal morto: explode em fogo e queima quem estiver colado nele
  private dogBlast(z: SimZombie) {
    this.lastDogPos = [z.x, z.y, z.z];
    this.emit({ e: 'boom', x: r3(z.x), y: r3(z.y + 0.5), z: r3(z.z), kind: 'fire' });
    for (const p of this.players.values()) {
      if (p.life === 'alive' && Math.hypot(p.x - z.x, p.z - z.z) < DOGS.blastRadius && Math.abs(p.y - z.y) < 1.5) {
        this.damagePlayer(p, DOGS.blastDamage, z.x, z.z, false);
      }
    }
  }

  // Carrasco morto: 1000 para cada jogador, um item garantido e às vezes uma bebida grátis
  private bossDeath(z: SimZombie) {
    this.emit({ e: 'boss', phase: 'death', zid: z.id, x: r3(z.x), z: r3(z.z) });
    for (const o of this.players.values()) if (o.life !== 'dead') this.addPoints(o, BOSS.reward);
    const pool = (['maxammo', 'insta', 'double', 'bomb', 'carpenter'] as PowerupKind[]);
    const kind = pool[Math.floor(Math.random() * pool.length)];
    this.powerups.push({ id: this.nextPid++, kind, x: z.x, y: z.y, z: z.z, t: 0 });
    if (Math.random() < BOSS.perkChance) this.powerups.push({ id: this.nextPid++, kind: 'freeperk', x: z.x + 1.2, y: z.y, z: z.z, t: 0 });
  }

  // Sorteia um item no lugar do zumbi morto (e garante Munição Cheia no último das rodadas 2, 5 e 10).
  private maybeDrop(z: SimZombie) {
    if (isChief(z)) return;
    // na rodada infernal só cai a Munição Cheia do último cão (no fim da rodada)
    if (isDog(z) || isVulto(z)) return;
    const last = this.state === 'active' && this.toSpawn === 0 && this.roundZombies() === 0;
    let kind: PowerupKind | null = null;
    if (last && POWERUP.guaranteedAmmoRounds.includes(this.round)) kind = 'maxammo';
    else if (this.dropsThisRound < POWERUP.maxPerRound && Math.random() < POWERUP.dropChance) {
      const pool = (this.world.map.powerupPool ?? DEFAULT_POOL).filter((k) => k !== this.lastDrop && (k !== 'firesale' || this.boxMoved));
      kind = pool[Math.floor(Math.random() * pool.length)];
    }
    if (!kind) return;
    this.dropsThisRound++;
    this.lastDrop = kind;
    this.powerups.push({ id: this.nextPid++, kind, x: z.x, y: z.y, z: z.z, t: 0 });
  }

  private applyPowerup(kind: PowerupKind, p: SimPlayer) {
    this.emit({ e: 'powerup', kind, pid: p.id });
    const alive = [...this.players.values()];
    switch (kind) {
      case 'maxammo':
        for (const o of alive) if (o.life !== 'dead') o.grenades = GRENADE.max;
        break;
      case 'insta':
      case 'double':
      case 'firesale':
        this.effects[kind] = POWERUPS[kind].duration;
        break;
      case 'bomb':
        for (const z of [...this.zombies.values()]) {
          if (isChief(z)) continue;
          this.zombies.delete(z.id);
          if (z.entry >= 0 && this.occupant[z.entry] === z.id) this.occupant[z.entry] = null;
          if (isDog(z)) this.lastDogPos = [z.x, z.y, z.z];
          this.emit({
            e: 'zkill', zid: z.id, pid: p.id, part: 'body',
            x: r3(z.x), y: r3(z.y), z: r3(z.z), yaw: r3(z.yaw), kind: z.kind, look: z.look,
          });
        }
        for (const o of alive) this.addPoints(o, POWERUP.bombPoints);
        break;
      case 'freeperk': {
        // uma bebida que o jogador ainda não tem; com todas, vira pontos
        const missing = BASE_PERKS.filter((k) => !p.perks.includes(k) && !(k === 'folego' && this.solo && p.selfRevives >= SOLO_SELF_REVIVES));
        if (p.life !== 'alive' || !missing.length) {
          this.addPoints(p, BOSS.reward);
          break;
        }
        this.grantPerk(p, missing[Math.floor(Math.random() * missing.length)]);
        break;
      }
      case 'sangue':
        this.tr?.giveBlood(p);
        break;
      case 'carpenter':
        for (let i = 0; i < this.boards.length; i++) this.boards[i] = ENTRY_BOARDS;
        for (const o of alive) this.addPoints(o, POWERUP.carpenterPoints);
        break;
    }
  }

  private updatePowerups(dt: number) {
    for (const k of ['insta', 'double', 'firesale'] as const) this.effects[k] = Math.max(0, this.effects[k] - dt);
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const pu = this.powerups[i];
      pu.t += dt;
      if (pu.t >= POWERUP.lifetime) {
        this.powerups.splice(i, 1);
        continue;
      }
      for (const p of this.players.values()) {
        if (p.life !== 'alive' || Math.hypot(p.x - pu.x, p.z - pu.z) > POWERUP.pickRadius || Math.abs(p.y - pu.y) > 1.5) continue;
        this.powerups.splice(i, 1);
        this.applyPowerup(pu.kind, p);
        break;
      }
    }
    this.box.fireSale = this.effects.firesale > 0;
  }

  private updateForge(dt: number) {
    const f = this.forge;
    if (f.state === 'idle') return;
    f.t -= dt;
    if (f.t > 0) return;
    if (f.state === 'working') {
      Object.assign(f, { state: 'ready', t: FORGE.offerTime });
      this.emit({ e: 'forge', phase: 'ready', pid: f.pid, weapon: f.weapon });
      return;
    }
    // ninguém pegou: a arma se perde (com a mira dela)
    const owner = f.pid ? this.players.get(f.pid) : undefined;
    if (owner && f.weapon) delete owner.sights[baseId(f.weapon)];
    this.emit({ e: 'forge', phase: 'expire', pid: f.pid, weapon: f.weapon });
    Object.assign(f, { state: 'idle', t: 0, weapon: null, pid: null });
  }

  private clearPerks(p: SimPlayer) {
    // sem a Mula, a terceira arma vai embora
    if (p.weapons.length > 2) {
      delete p.sights[baseId(p.weapons[2])];
      p.weapons = p.weapons.slice(0, 2);
    }
    p.perks = [];
    p.maxHealth = PLAYER.maxHealth;
    p.health = Math.min(p.health, p.maxHealth);
  }

  private addPoints(p: SimPlayer, delta: number) {
    if (delta > 0 && this.effects.double > 0) delta *= 2;
    if (delta > 0) p.earned += delta;
    p.points = Math.max(0, p.points + delta);
    this.emit({ e: 'points', pid: p.id, delta });
  }

  private damageZombie(z: SimZombie, dmg: number, p: SimPlayer, part: HitPart, knife: boolean, blast = false) {
    // Golpe Fatal: qualquer dano mata (menos o Carrasco)
    // Bispo trocando de fase: imune
    if (z.bispo && z.bispo.shieldT > 0) return;
    z.hp -= this.effects.insta > 0 && !isChief(z) ? Math.max(dmg, z.hp) : dmg;
    if (z.bispo) {
      // cada fase termina num terço da vida: o dano que sobra não pula a troca de fase
      const b = z.bispo;
      const floor = b.phase === 1 ? 2 / 3 : b.phase === 2 ? 1 / 3 : 0;
      if (floor > 0 && z.hp <= b.maxHp * floor) {
        z.hp = b.maxHp * floor;
        b.phase++;
        b.shieldT = BISPO.shield.time;
        b.ringT = 0;
        b.pillarT = 2;
        // some numa explosão de fogo e reaparece em outro ponto do mapa
        const spots = this.world.map.ritual?.arena ?? [[z.x, z.z]];
        const far = spots.filter(([x, zz]) => Math.hypot(x - z.x, zz - z.z) > 8);
        const [nx, nz] = (far.length ? far : spots)[Math.floor(Math.random() * (far.length || spots.length))];
        this.emit({ e: 'boom', x: r3(z.x), y: r3(z.y + 1.5), z: r3(z.z), kind: 'fire' });
        z.x = nx;
        z.z = nz;
        z.y = this.world.groundHeight(nx, nz, BISPO.radius, 0.3);
        this.emit({ e: 'bispo', phase: 'phase', zid: z.id, x: r3(z.x), z: r3(z.z), n: b.phase });
      }
    }
    if (z.panzer && part === 'head') this.tr?.panzerHeadHit(z, dmg);
    if (z.boss) {
      z.boss.taken += dmg;
      if (z.boss.armor && z.boss.taken >= z.boss.maxHp * BOSS.armorFrac && z.hp > 0) {
        z.boss.armor = false;
        this.emit({ e: 'boss', phase: 'armor', zid: z.id, x: r3(z.x), z: r3(z.z) });
      }
    }
    if (z.hp > 0) {
      this.addPoints(p, POINTS.hit);
      this.emit(blast ? { e: 'zhit', zid: z.id, pid: p.id, part, blast } : { e: 'zhit', zid: z.id, pid: p.id, part });
      return;
    }
    this.zombies.delete(z.id);
    if (z.entry >= 0 && this.occupant[z.entry] === z.id) this.occupant[z.entry] = null;
    if (isDog(z)) this.dogBlast(z);
    if (isBoss(z)) this.bossDeath(z);
    if (isBispo(z)) this.bispoDeath(z);
    if (isPanzer(z)) this.tr?.onPanzerDeath(z, p);
    p.kills++;
    if (part === 'head' && !knife) p.headshots++;
    this.addPoints(p, knife ? POINTS.knifeKill : part === 'head' ? POINTS.headKill : POINTS.kill);
    this.emit({
      e: 'zkill', zid: z.id, pid: p.id, part: knife ? 'knife' : part,
      x: r3(z.x), y: r3(z.y), z: r3(z.z), yaw: r3(z.yaw), kind: z.kind, look: z.look,
      ...(this.killFx ?? {}),
    });
    this.tr?.onKill(z, p, { knife, weapon: this.curWeapon });
    this.maybeDrop(z);
  }

  // Tira um zumbi do jogo sem pontos nem item (esmagado pelo tanque ou pelo colosso, queimado, dispersado pela missão).
  private killSilently(z: SimZombie, fx: { fling?: [number, number, number]; sucked?: boolean; shock?: boolean } = {}) {
    if (!this.zombies.delete(z.id)) return;
    if (z.entry >= 0 && this.occupant[z.entry] === z.id) this.occupant[z.entry] = null;
    this.emit({
      e: 'zkill', zid: z.id, pid: '', part: 'body',
      x: r3(z.x), y: r3(z.y), z: r3(z.z), yaw: r3(z.yaw), kind: z.kind, look: z.look, ...fx,
    });
  }

  // Zumbi de um tipo novo (Blindado, Cruzado) no ponto dado.
  private makeZombie(kind: 0 | 1 | 2 | 7 | 8, x: number, z: number, hp: number, speed: number, extra: Partial<SimZombie>): SimZombie {
    const ref = [...this.players.values()].find((p) => p.life === 'alive');
    const zb: SimZombie = {
      id: this.nextZid++,
      x, y: this.world.groundHeight(x, z, ZOMBIE.radius, 0.2), z,
      yaw: ref ? Math.atan2(ref.x - x, ref.z - z) : 0,
      hp, kind, speed, anim: 'rise', t: 0, look: Math.floor(Math.random() * 1e6),
      attackT: 0, attackHit: false, losT: 0, los: false, bestNav: 0xffff, stuckT: 0,
      entry: -1, phase: 'none', phaseT: 0,
      ...extra,
    };
    this.zombies.set(zb.id, zb);
    this.emit({ e: 'zrise', zid: zb.id, x: r3(x), z: r3(z) });
    return zb;
  }

  // jogador caído volta com a vida cheia; a reanimação conta para quem o levantou
  private revivePlayer(p: SimPlayer, by: SimPlayer) {
    p.life = 'alive';
    p.health = p.maxHealth;
    p.revive = 0;
    p.reviveTarget = null;
    p.lastHurt = this.time;
    by.revives++;
  }

  private damagePlayer(p: SimPlayer, dmg: number, fromX: number, fromZ: number, lava: boolean, cause?: string) {
    if (p.life !== 'alive') return;
    // Trincheira: o Escudo de costas e a invulnerabilidade da saída da cabine
    if (this.tr) {
      dmg = this.tr.filterDamage(p, dmg, fromX, fromZ);
      if (dmg <= 0) return;
    }
    p.health -= dmg;
    p.lastHurt = this.time;
    this.emit({ e: 'phurt', pid: p.id, dmg, fromX: r3(fromX), fromZ: r3(fromZ), lava });
    if (p.health > 0) return;
    p.health = 0;
    p.life = 'downed';
    p.downs++;
    this.tr?.noteDown(cause);
    p.bleed = BLEEDOUT_TIME;
    p.revive = 0;
    p.reviveTarget = null;
    // Segundo Fôlego no solo: levanta sozinho depois de alguns segundos (e gasta a bebida)
    p.selfReviveT = this.solo && p.perks.includes('folego') ? SELF_REVIVE_TIME : 0;
    this.clearPerks(p);
    if (!this.solo) {
      const loss = Math.floor((p.points * 0.05) / 10) * 10;
      if (loss > 0) this.addPoints(p, -loss);
    }
    this.emit({ e: 'pdown', pid: p.id });
    this.checkGameOver();
  }

  private checkGameOver() {
    if (this.state === 'gameover' || this.state === 'waiting') return;
    if (this.players.size === 0) return;
    for (const p of this.players.values()) if (p.life === 'alive' || p.selfReviveT > 0) return;
    this.state = 'gameover';
    this.emit({ e: 'gameover', round: this.round });
  }

  private startRound() {
    this.round++;
    this.state = 'active';
    this.hell = this.round === this.nextHellRound;
    if (this.hell) {
      this.toSpawn = dogsForRound(this.players.size, this.hellRounds);
      this.nextHellRound = this.round + randInt(DOGS.gapMin, DOGS.gapMax);
      this.lastDogPos = null;
    } else {
      this.toSpawn = zombiesForRound(this.round, this.players.size);
    }
    // Carrasco: vem no meio desta rodada (numa infernal, fica para a próxima)
    this.bossTimer = -1;
    if (this.round === this.nextBossRound) {
      if (this.hell) this.nextBossRound++;
      else {
        this.bossTimer = BOSS.arriveMin + Math.random() * (BOSS.arriveMax - BOSS.arriveMin);
        this.nextBossRound = this.round + randInt(BOSS.gapMin, BOSS.gapMax);
        if (this.nextBossRound === this.nextHellRound) this.nextBossRound++;
      }
    }
    this.dropsThisRound = 0;
    for (const p of this.players.values()) {
      p.repairPts = 0;
      if (this.round > 1 && p.life !== 'dead') p.grenades = Math.min(GRENADE.max, p.grenades + GRENADE.perRound);
    }
    this.spawnTimer = this.hell ? DOGS.warmup : 1;
    let i = 0;
    for (const p of this.players.values()) {
      if (p.life !== 'dead') {
        i++;
        continue;
      }
      const [x, z] = this.world.map.playerSpawns[i++ % this.world.map.playerSpawns.length];
      this.clearPerks(p);
      Object.assign(p, {
        life: 'alive', health: PLAYER.maxHealth, x, y: 0, z, bleed: 0, revive: 0,
        weapons: [this.world.map.startWeapon ?? 'pistol'], grenades: GRENADE.start, heavyKnife: false, sights: {},
      });
      this.emit({ e: 'prespawn', pid: p.id, x, z });
    }
    this.tr?.roundStarted(this.round);
    this.emit({ e: 'roundStart', round: this.round, hell: this.hell, ...(this.tr?.isPanzerRound(this.round) ? { boss: true } : {}) });
  }

  private spawnDelay(): number {
    if (this.hell) return DOGS.spawnDelay / (1 + 0.25 * (this.players.size - 1));
    const base = Math.max(0.3, 2.0 * Math.pow(0.95, this.round - 1)) * (this.tr?.slowSpawns ? 2 : 1);
    return base / (1 + 0.25 * (this.players.size - 1));
  }

  private spawnZombie(at?: [number, number]): SimZombie | undefined {
    const alive = [...this.players.values()].filter((p) => p.life === 'alive');
    const ref = alive.length ? alive : [...this.players.values()];
    // candidatos: pontos de surgir da terra e entradas com tábuas (as entradas pesam o dobro)
    const nearest = (x: number, z: number) => {
      let d = Infinity;
      for (const p of ref) d = Math.min(d, Math.hypot(x - p.x, z - p.z));
      return d;
    };
    type Cand = { x: number; z: number; entry: number; d: number };
    const scored: Cand[] = this.openSpawns().map((s) => ({ x: s.x, z: s.z, entry: -1, d: nearest(s.x, s.z) }));
    for (const e of this.openEntries()) {
      const pts = entryPoints(e);
      const c = { x: pts.outside[0], z: pts.outside[1], entry: e.id, d: nearest(pts.inside[0], pts.inside[1]) };
      scored.push(c, c);
    }
    let pool = scored.filter((c) => c.d >= 10 && c.d <= 45);
    // mapa grande sem ponto perto: o zumbi sobe da terra no caminho dos jogadores (na névoa também)
    if (!pool.length && this.world.map.zones) {
      const spot = this.dogSpot(12, 30);
      if (spot) pool = [{ x: spot[0], z: spot[1], entry: -1, d: 12 }];
    }
    if (!pool.length) pool = scored.filter((c) => c.d >= 8);
    if (!pool.length) pool = scored;
    if (!at && !pool.length) return undefined;
    const pick = at ? { x: at[0], z: at[1], entry: -1, d: 0 } : pool[Math.floor(Math.random() * pool.length)];
    const jitter = pick.entry < 0 ? 1.5 : 0.6;
    const x = pick.x + (Math.random() - 0.5) * jitter;
    const z = pick.z + (Math.random() - 0.5) * jitter;

    const r = this.round;
    const roll = Math.random();
    const sprintChance = clamp((r - 6) * 0.1, 0, 0.6);
    const runChance = clamp((r - 1) * 0.16, 0, 0.95);
    const kind: ZombieKind = roll < sprintChance ? 2 : roll < runChance ? 1 : 0;
    const base = kind === 2 ? ZOMBIE.sprintSpeed : kind === 1 ? ZOMBIE.runSpeed : ZOMBIE.walkSpeed;
    let yaw = Math.random() * Math.PI * 2;
    if (ref.length) yaw = Math.atan2(ref[0].x - x, ref[0].z - z);

    const zb: SimZombie = {
      id: this.nextZid++,
      x, y: this.world.groundHeight(x, z, ZOMBIE.radius, 0.2), z, yaw,
      hp: zombieHealth(r), kind, speed: base * (0.9 + Math.random() * 0.2),
      anim: pick.entry < 0 ? 'rise' : 'move', t: 0, look: Math.floor(Math.random() * 1e6),
      attackT: 0, attackHit: false, losT: 0, los: false, bestNav: 0xffff, stuckT: 0,
      entry: pick.entry, phase: pick.entry < 0 ? 'none' : 'approach', phaseT: 0,
    };
    if (pick.entry >= 0) {
      const e = this.world.map.entries[pick.entry];
      zb.yaw = Math.atan2(e.nx, e.nz);
    }
    this.zombies.set(zb.id, zb);
    if (pick.entry < 0) this.emit({ e: 'zrise', zid: zb.id, x: r3(x), z: r3(z) });
    return zb;
  }

  // Lugar para o raio de um cão: perto (mas não colado) de um jogador vivo, num ponto que dá para alcançar.
  private dogSpot(min: number = DOGS.spawnMin, max: number = DOGS.spawnMax): [number, number] | null {
    const alive = [...this.players.values()].filter((p) => p.life === 'alive');
    if (!alive.length) return null;
    const b = this.world.map.bounds;
    for (let tries = 0; tries < 40; tries++) {
      const p = alive[Math.floor(Math.random() * alive.length)];
      const a = Math.random() * Math.PI * 2;
      const r = min + Math.random() * (max - min);
      const x = p.x + Math.sin(a) * r;
      const z = p.z + Math.cos(a) * r;
      if (x < b.minX + 1 || x > b.maxX - 1 || z < b.minZ + 1 || z > b.maxZ - 1) continue;
      if (this.world.inLava(x, z)) continue;
      // caminho até o jogador existe e não é longo demais
      const nd = this.nav.distanceAt(x, z);
      if (nd >= 0xffff || nd * this.nav.cell > max * 2.5) continue;
      if (alive.some((o) => Math.hypot(o.x - x, o.z - z) < min - 1)) continue;
      return [x, z];
    }
    // sem lugar bom: o ponto de surgir mais perto de alguém (sem ser colado)
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const s of this.openSpawns()) {
      const d = Math.min(...alive.map((p) => Math.hypot(p.x - s.x, p.z - s.z)));
      if (d >= min && d < bestD) {
        bestD = d;
        best = [s.x, s.z];
      }
    }
    return best;
  }

  private spawnDog() {
    const spot = this.dogSpot();
    if (!spot) return;
    const [x, z] = spot;
    const ref = [...this.players.values()].find((p) => p.life === 'alive');
    const zb: SimZombie = {
      id: this.nextZid++,
      x, y: this.world.groundHeight(x, z, DOGS.radius, 0.2), z,
      yaw: ref ? Math.atan2(ref.x - x, ref.z - z) : 0,
      hp: dogHealth(this.hellRounds), kind: 3, speed: DOGS.speed * (0.92 + Math.random() * 0.16),
      anim: 'rise', t: 0, look: Math.floor(Math.random() * 1e6),
      attackT: 0, attackHit: false, losT: 0, los: false, bestNav: 0xffff, stuckT: 0,
      entry: -1, phase: 'none', phaseT: 0,
    };
    this.zombies.set(zb.id, zb);
    this.emit({ e: 'dogspawn', zid: zb.id, x: r3(x), z: r3(z) });
  }

  // Carrasco: sobe da terra num ponto de surgir afastado dos jogadores (14 a 35 m)
  private spawnBoss() {
    const alive = [...this.players.values()].filter((p) => p.life === 'alive');
    const ref = alive.length ? alive : [...this.players.values()];
    const near = (x: number, z: number) => Math.min(...ref.map((p) => Math.hypot(p.x - x, p.z - z)));
    // um ponto da rua alcançável, longe o bastante para dar tempo de reagir
    const spot = this.dogSpot(14, 30) ?? this.dogSpot(8, 20);
    let s: { x: number; z: number } | null = spot ? { x: spot[0], z: spot[1] } : null;
    if (!s) {
      const spots = this.openSpawns().filter((c) => near(c.x, c.z) >= 8);
      if (spots.length) s = spots[Math.floor(Math.random() * spots.length)];
    }
    if (!s) return;
    const hp = bossHealth(this.round, this.players.size);
    const zb: SimZombie = {
      id: this.nextZid++,
      x: s.x, y: this.world.groundHeight(s.x, s.z, BOSS.radius, 0.2), z: s.z,
      yaw: ref.length ? Math.atan2(ref[0].x - s.x, ref[0].z - s.z) : 0,
      hp, kind: 4, speed: BOSS.walkSpeed, anim: 'rise', t: 0, look: Math.floor(Math.random() * 1e6),
      attackT: 0, attackHit: false, losT: 0, los: false, bestNav: 0xffff, stuckT: 0,
      entry: -1, phase: 'none', phaseT: 0,
      boss: { maxHp: hp, taken: 0, armor: true, slamCD: 3, chainCD: 4, chargeCD: 7, target: null, dirX: 0, dirZ: 1, hit: new Set(), ran: 0 },
    };
    this.zombies.set(zb.id, zb);
    this.emit({ e: 'boss', phase: 'spawn', zid: zb.id, x: r3(zb.x), z: r3(zb.z) });
  }

  // Carrasco: escolhe entre golpe, golpe no chão, investida e corrente; senão anda até o jogador.
  private updateBoss(z: SimZombie, dt: number, targets: SimPlayer[], all: SimZombie[]) {
    const b = z.boss!;
    b.slamCD -= dt;
    b.chainCD -= dt;
    b.chargeCD -= dt;
    let tp: SimPlayer | null = null;
    let td = Infinity;
    for (const p of targets) {
      const d = Math.hypot(p.x - z.x, p.z - z.z);
      if (d < td) {
        td = d;
        tp = p;
      }
    }
    const face = (x: number, zz: number, k: number) => {
      z.yaw = angleLerp(z.yaw, Math.atan2(x - z.x, zz - z.z), Math.min(1, dt * k));
    };
    const sees = (p: SimPlayer) => this.world.lineOfSight(z.x, z.y + 1.6, z.z, p.x, p.y + 1.2, p.z);
    const start = (anim: ZombieAnim) => {
      z.anim = anim;
      z.attackT = 0;
      z.attackHit = false;
    };

    if (z.anim === 'attack') {
      const S = BOSS.swing;
      z.attackT += dt;
      if (tp) face(tp.x, tp.z, 5);
      if (!z.attackHit && z.attackT >= S.windup) {
        z.attackHit = true;
        const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw);
        for (const p of targets) {
          const dx = p.x - z.x, dz = p.z - z.z;
          const d = Math.hypot(dx, dz);
          if (d < S.hitRange && (dx * fx + dz * fz) / (d || 1) > 0.2 && Math.abs(p.y - z.y) < 2) this.damagePlayer(p, S.damage, z.x, z.z, false);
        }
      }
      if (z.attackT >= S.windup + S.recover) z.anim = 'move';
      return;
    }
    if (z.anim === 'slam') {
      const S = BOSS.slam;
      z.attackT += dt;
      if (!z.attackHit && z.attackT >= S.windup) {
        z.attackHit = true;
        this.emit({ e: 'boss', phase: 'slam', zid: z.id, x: r3(z.x), z: r3(z.z) });
        for (const p of targets) {
          const d = Math.hypot(p.x - z.x, p.z - z.z);
          if (d < S.radius && Math.abs(p.y - z.y) < 1.5) this.damagePlayer(p, Math.max(S.minDamage, S.damage * (1 - d / S.radius)), z.x, z.z, false);
        }
      }
      if (z.attackT >= S.windup + S.recover) z.anim = 'move';
      return;
    }
    if (z.anim === 'chain') {
      const S = BOSS.chain;
      z.attackT += dt;
      const p = b.target ? this.players.get(b.target) : undefined;
      if (p && z.attackT < S.windup) face(p.x, p.z, 8);
      if (!z.attackHit && z.attackT >= S.windup + S.fly) {
        z.attackHit = true;
        // o gancho só pega se o jogador ainda estiver à vista e ao alcance
        if (p && p.life === 'alive' && Math.hypot(p.x - z.x, p.z - z.z) < S.max + 3 && sees(p)) {
          this.damagePlayer(p, S.damage, z.x, z.z, false);
          if (p.life === 'alive') this.emit({ e: 'bosspull', pid: p.id, x: r3(z.x), z: r3(z.z), stop: S.stopAt });
        }
      }
      if (z.attackT >= S.windup + S.fly + S.recover) z.anim = 'move';
      return;
    }
    if (z.anim === 'charge') {
      const S = BOSS.charge;
      z.attackT += dt;
      if (z.attackT < S.windup) {
        const p = b.target ? this.players.get(b.target) : undefined;
        if (p) face(p.x, p.z, 8);
        return;
      }
      if (!z.attackHit) {
        // começa a correr na direção em que está olhando
        z.attackHit = true;
        b.dirX = Math.sin(z.yaw);
        b.dirZ = Math.cos(z.yaw);
        b.hit.clear();
        b.ran = 0;
        this.emit({ e: 'boss', phase: 'charge', zid: z.id, x: r3(z.x), z: r3(z.z) });
      }
      if (z.attackT < S.windup + S.run) {
        const ox = z.x, oz = z.z;
        z.x += b.dirX * S.speed * dt;
        z.z += b.dirZ * S.speed * dt;
        this.world.collideCylinder(z, BOSS.radius, BOSS.height);
        z.y = this.world.groundHeight(z.x, z.z, BOSS.radius, z.y);
        const moved = Math.hypot(z.x - ox, z.z - oz);
        b.ran += moved;
        for (const p of targets) {
          if (b.hit.has(p.id) || Math.hypot(p.x - z.x, p.z - z.z) > S.hitRadius || Math.abs(p.y - z.y) > 1.5) continue;
          b.hit.add(p.id);
          this.damagePlayer(p, S.damage, z.x, z.z, false);
        }
        // trombou numa parede: para e fica tonto
        if (moved < S.speed * dt * 0.35 && z.attackT > S.windup + 0.15) {
          this.emit({ e: 'boss', phase: 'wall', zid: z.id, x: r3(z.x), z: r3(z.z) });
          z.attackT = S.windup + S.run;
        }
        return;
      }
      if (z.attackT >= S.windup + S.run + S.recover) z.anim = 'move';
      return;
    }

    if (!tp) return;
    // escolhe um ataque
    if (td < BOSS.swing.range) {
      start('attack');
      this.emit({ e: 'zattack', zid: z.id });
      return;
    }
    if (b.slamCD <= 0 && td < BOSS.slam.range) {
      b.slamCD = BOSS.slam.cooldown;
      start('slam');
      return;
    }
    if (b.chargeCD <= 0 && td > BOSS.charge.min && td < BOSS.charge.max && sees(tp)) {
      b.chargeCD = BOSS.charge.cooldown;
      b.chainCD = Math.max(b.chainCD, 3);
      b.target = tp.id;
      start('charge');
      return;
    }
    if (b.chainCD <= 0 && td > BOSS.chain.min && td < BOSS.chain.max && sees(tp)) {
      b.chainCD = BOSS.chain.cooldown;
      b.chargeCD = Math.max(b.chargeCD, 3);
      b.target = tp.id;
      start('chain');
      this.emit({ e: 'boss', phase: 'chain', zid: z.id, x: r3(z.x), z: r3(z.z), pid: tp.id });
      return;
    }

    // anda até o jogador (empurra os zumbis do caminho)
    let dx = tp.x - z.x;
    let dz = tp.z - z.z;
    z.losT -= dt;
    if (z.losT <= 0) {
      z.losT = 0.3;
      z.los = td < ZOMBIE.directChaseRange && sees(tp);
    }
    if (!z.los) {
      const d = this.nav.direction(z.x, z.z);
      if (d) [dx, dz] = d;
    }
    const dl = Math.hypot(dx, dz) || 1;
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
    this.world.collideCylinder(z, BOSS.radius, BOSS.height);
    z.y = this.world.groundHeight(z.x, z.z, BOSS.radius, z.y);
    if (this.bus) busCollide(this.bus, z, BOSS.radius);
    face(z.x + dx, z.z + dz, 4);
    // preso longe de todos: sobe da terra em outro ponto
    const nd = this.nav.distanceAt(z.x, z.z);
    if (nd < z.bestNav - 1) {
      z.bestNav = nd;
      z.stuckT = 0;
    } else z.stuckT += dt;
    if (z.stuckT > ZOMBIE.stuckTime && td > 14) {
      const near = this.world.map.zones ? this.dogSpot(14, 30) : null;
      const spots = near ? [{ x: near[0], z: near[1] }] : this.openSpawns().filter((s) => Math.min(...targets.map((p) => Math.hypot(p.x - s.x, p.z - s.z))) > 10);
      if (spots.length) {
        const s = spots[Math.floor(Math.random() * spots.length)];
        z.x = s.x;
        z.z = s.z;
        z.y = this.world.groundHeight(z.x, z.z, BOSS.radius, 0.2);
        z.t = 0;
        z.anim = 'rise';
        this.emit({ e: 'zrise', zid: z.id, x: r3(z.x), z: r3(z.z) });
      }
      z.stuckT = 0;
      z.bestNav = 0xffff;
    }
  }

  // Zumbi vindo por uma entrada: caminha até a janela (ou espera na fila), arranca as tábuas e pula para dentro.
  private updateEntryZombie(z: SimZombie, dt: number, targets: SimPlayer[]) {
    const e = this.world.map.entries[z.entry];
    const pts = entryPoints(e);
    z.yaw = angleLerp(z.yaw, Math.atan2(e.nx, e.nz), Math.min(1, dt * 6));

    if (z.phase === 'approach') {
      const occ = this.occupant[z.entry];
      const free = occ === null || occ === z.id;
      // fila: espera um pouco atrás, para o lado
      const side = ((z.id % 3) - 1) * 0.7;
      const tx = free ? pts.window[0] : pts.window[0] - e.nx * 1.1 + Math.abs(e.nz) * side;
      const tz = free ? pts.window[1] : pts.window[1] - e.nz * 1.1 + Math.abs(e.nx) * side;
      const dx = tx - z.x;
      const dz = tz - z.z;
      const d = Math.hypot(dx, dz);
      const step = Math.min(d, z.speed * dt);
      if (d > 1e-4) {
        z.x += (dx / d) * step;
        z.z += (dz / d) * step;
      }
      z.anim = 'move';
      if (free && d < 0.05) {
        this.occupant[z.entry] = z.id;
        z.phase = 'tear';
        z.phaseT = 0;
        z.anim = 'tear';
      }
      return;
    }

    if (z.phase === 'tear') {
      // ataca quem estiver encostado na barricada
      if (z.anim === 'attack') {
        z.attackT += dt;
        if (!z.attackHit && z.attackT >= ZOMBIE.attackWindup) {
          z.attackHit = true;
          for (const p of targets) {
            if (Math.hypot(p.x - z.x, p.z - z.z) < ZOMBIE.attackHitRange) this.damagePlayer(p, ZOMBIE.damage, z.x, z.z, false);
          }
        }
        if (z.attackT >= ZOMBIE.attackWindup + ZOMBIE.attackRecover) z.anim = 'tear';
        return;
      }
      if (targets.some((p) => Math.hypot(p.x - z.x, p.z - z.z) < 1.45)) {
        z.anim = 'attack';
        z.attackT = 0;
        z.attackHit = false;
        this.emit({ e: 'zattack', zid: z.id });
        return;
      }
      z.anim = 'tear';
      if (this.boards[z.entry] <= 0) {
        z.phase = 'climb';
        z.phaseT = 0;
        z.anim = 'climb';
        return;
      }
      z.phaseT += dt;
      if (z.phaseT >= (this.round >= BARRICADE.lateRound ? BARRICADE.tearTimeLate : BARRICADE.tearTime)) {
        z.phaseT = 0;
        this.boards[z.entry]--;
        this.emit({ e: 'board', entry: z.entry, boards: this.boards[z.entry], kind: 'tear' });
      }
      return;
    }

    // climb: pula da janela para dentro
    z.phaseT += dt;
    const k = Math.min(1, z.phaseT / BARRICADE.climbTime);
    z.x = pts.window[0] + (pts.inside[0] - pts.window[0]) * k;
    z.z = pts.window[1] + (pts.inside[1] - pts.window[1]) * k;
    if (k >= 1) {
      if (this.occupant[z.entry] === z.id) this.occupant[z.entry] = null;
      z.phase = 'none';
      z.entry = -1;
      z.anim = 'move';
      z.y = this.world.groundHeight(z.x, z.z, ZOMBIE.radius, 0.3);
      z.bestNav = 0xffff;
      z.stuckT = 0;
    }
  }

  // Primeiro zumbi que o segmento (a -> b) atravessa, tratando o zumbi como uma esfera no peito.
  private zombieOnSegment(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz || 1e-9;
    for (const z of this.zombies.values()) {
      if (z.anim === 'rise') continue;
      const dog = isDog(z);
      const big = isChief(z);
      const cx = z.x, cy = z.y + (dog ? 0.5 : isBispo(z) ? 1.8 : big ? 1.6 : 1.1), cz = z.z;
      const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / len2));
      const px = ax + dx * t, py = ay + dy * t, pz = az + dz * t;
      const rw = big ? 0.8 : 0.5;
      if (Math.abs(cx - px) < rw && Math.abs(cz - pz) < rw && Math.abs(cy - py) < (dog ? 0.5 : big ? 1.6 : 0.95)) return { z, t };
    }
    return null;
  }

  private explode(g: SimGrenade) {
    // Trincheira: a bola do Cajado de Fogo queima; a Granada de Artilharia só marca o chão (as bombas caem depois)
    if (g.kind === 'fogo') return void this.tr?.fireballImpact(g);
    if (g.kind === 'artilharia') return void this.tr?.artilleryLanded(g.x, g.z, g.pid);
    const isGrenade = g.kind === 'grenade';
    const def = isGrenade ? null : WEAPONS[g.weapon];
    const cfg = isGrenade ? null : PROJECTILES[g.kind as Exclude<ProjectileKind, 'grenade' | 'orb' | 'orbRaio' | 'artilharia'>];
    const radius = isGrenade ? GRENADE.radius : cfg!.radius;
    const maxD = isGrenade ? GRENADE.damage : def!.damage;
    const minD = isGrenade ? GRENADE.minDamage : def!.damage * cfg!.minDamage;
    this.emit({ e: 'boom', x: r3(g.x), y: r3(g.y), z: r3(g.z), kind: g.kind });
    const owner = this.players.get(g.pid);
    const mult = owner?.perks.includes('gatilho') ? PERK_FX.gatilhoDamageMult : 1;
    // Trincheira: a explosão que o próprio jogador causa também o fere (a Casca Grossa anula)
    if (this.tr && owner && owner.life === 'alive' && !owner.perks.includes('casca-grossa')) {
      const od = Math.hypot(owner.x - g.x, owner.y + 1 - g.y, owner.z - g.z);
      if (od < radius) this.damagePlayer(owner, TRINCHEIRA.selfBlastMax + (TRINCHEIRA.selfBlastMin - TRINCHEIRA.selfBlastMax) * (od / radius), g.x, g.z, false);
    }
    for (const z of [...this.zombies.values()]) {
      const d = Math.hypot(z.x - g.x, z.y + (isDog(z) ? 0.5 : 1) - g.y, z.z - g.z);
      if (d > radius) continue;
      const dmg = (maxD + (minD - maxD) * (d / radius)) * mult;
      if (owner) this.damageZombie(z, dmg, owner, 'body', false, true);
    }
  }

  // Projéteis: granadas quicam e explodem no pavio; lança-granadas e Desintegrador explodem no impacto;
  // a flecha da besta gruda e explode um segundo depois.
  private updateGrenades(dt: number) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.t += dt;
      // granada de mão e do tambor quicam; os outros voam até bater
      if (g.kind !== 'grenade' && g.kind !== 'drum' && g.kind !== 'artilharia') {
        const cfg = PROJECTILES[g.kind];
        if (g.stuck) {
          g.stuckT += dt;
          if (g.stuckT >= (cfg.stickTime ?? 0)) {
            this.grenades.splice(i, 1);
            this.explode(g);
          }
          continue;
        }
        g.vy -= cfg.gravity * dt;
        const sp = Math.hypot(g.vx, g.vy, g.vz);
        const step = sp * dt;
        const nx = g.x + g.vx * dt, ny = g.y + g.vy * dt, nz = g.z + g.vz * dt;
        const wh = this.world.raycast(g.x, g.y, g.z, g.vx / sp, g.vy / sp, g.vz / sp, step);
        const zh = this.zombieOnSegment(g.x, g.y, g.z, nx, ny, nz);
        const tw = wh ? wh.t / step : Infinity;
        const tz = zh ? zh.t : Infinity;
        const hitT = Math.min(tw, tz);
        if (hitT <= 1) {
          g.x += g.vx * dt * hitT;
          g.y += g.vy * dt * hitT;
          g.z += g.vz * dt * hitT;
          g.traveled += step * hitT;
          if (g.kind === 'vortex') {
            this.grenades.splice(i, 1);
            this.openVortex(g);
          } else if (g.kind === 'bolt') {
            g.stuck = true;
            g.stuckT = 0;
          } else if (g.kind === 'blade') {
            // lâmina: corta o zumbi que acertar (o dobro na cabeça), sem explosão
            this.grenades.splice(i, 1);
            const owner = this.players.get(g.pid);
            if (zh && tz <= tw && owner) {
              const z = zh.z;
              const headY = z.y + (isDog(z) ? 0.6 : isBoss(z) ? 2.5 : 1.45);
              const head = g.y >= headY;
              const def = WEAPONS[g.weapon];
              const mult = owner.perks.includes('gatilho') ? PERK_FX.gatilhoDamageMult : 1;
              const dmg = (def?.damage ?? 700) * (head && !(isBoss(z) && z.boss!.armor) ? def?.headMult ?? 2 : 1) * mult;
              this.damageZombie(z, dmg, owner, head ? 'head' : 'body', false, true);
            }
          } else {
            this.grenades.splice(i, 1);
            if (g.traveled >= cfg.armDist) this.explode(g);
            else if (zh) {
              const owner = this.players.get(g.pid);
              if (owner) this.damageZombie(zh.z, 150, owner, 'body', false, true);
            }
          }
          continue;
        }
        g.x = nx;
        g.y = ny;
        g.z = nz;
        g.traveled += step;
        if (g.kind === 'vortex' && (g.y < 0.15 || g.t > 4)) {
          this.grenades.splice(i, 1);
          this.openVortex(g);
          continue;
        }
        if (g.t > 6 || g.y < -2) this.grenades.splice(i, 1);
        continue;
      }
      g.vy -= 15 * dt;
      // granada do tambor explode ao encostar num zumbi
      if (g.kind === 'drum' && g.t > 0.05) {
        const zh = this.zombieOnSegment(g.x, g.y, g.z, g.x + g.vx * dt, g.y + g.vy * dt, g.z + g.vz * dt);
        if (zh) {
          this.grenades.splice(i, 1);
          this.explode(g);
          continue;
        }
      }
      const sp = Math.hypot(g.vx, g.vy, g.vz);
      if (sp > 1e-3) {
        const step = sp * dt;
        const hit = this.world.raycast(g.x, g.y, g.z, g.vx / sp, g.vy / sp, g.vz / sp, step + 0.06);
        if (hit) {
          g.x += (g.vx / sp) * Math.max(0, hit.t - 0.06);
          g.y += (g.vy / sp) * Math.max(0, hit.t - 0.06);
          g.z += (g.vz / sp) * Math.max(0, hit.t - 0.06);
          const dot = g.vx * hit.nx + g.vy * hit.ny + g.vz * hit.nz;
          g.vx = (g.vx - 2 * dot * hit.nx) * 0.4;
          g.vy = (g.vy - 2 * dot * hit.ny) * 0.4;
          g.vz = (g.vz - 2 * dot * hit.nz) * 0.4;
        } else {
          g.x += g.vx * dt;
          g.y += g.vy * dt;
          g.z += g.vz * dt;
        }
      }
      if (g.y < 0.06) {
        g.y = 0.06;
        g.vy = Math.abs(g.vy) * 0.3;
        g.vx *= 0.6;
        g.vz *= 0.6;
      }
      if (g.t < (g.kind === 'drum' ? PROJECTILES.drum.fuse! : g.kind === 'artilharia' ? PROJECTILES.artilharia.fuse! : GRENADE.fuse)) continue;
      this.grenades.splice(i, 1);
      this.explode(g);
    }
  }

  // dano das armas maravilha: mata qualquer zumbi comum de uma vez; chefões só levam o dano
  private wonderDamage(z: SimZombie, base: number, p: SimPlayer) {
    const mult = p.perks.includes('gatilho') ? PERK_FX.gatilhoDamageMult : 1;
    return isChief(z) ? base * mult : Math.max(base * mult, z.hp);
  }

  // Canhão de Vento: todo zumbi no cone à frente (e à vista) morre arremessado para longe.
  private windBlast(p: SimPlayer, def: WeaponDef, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) {
    const range = def.range;
    this.emit({ e: 'wind', pid: p.id, x: r3(ox), y: r3(oy), z: r3(oz), dx: r3(dx), dy: r3(dy), dz: r3(dz), range: r3(range) });
    const cosMax = Math.cos(WONDER.windCone);
    for (const z of [...this.zombies.values()]) {
      const cy = z.y + (isDog(z) ? 0.5 : 1.1);
      const vx = z.x - ox, vy = cy - oy, vz = z.z - oz;
      const d = Math.hypot(vx, vy, vz);
      if (d > range || d < 1e-3) continue;
      if ((vx * dx + vy * dy + vz * dz) / d < cosMax && d > 1.6) continue;
      if (!this.world.lineOfSight(ox, oy, oz, z.x, cy, z.z)) continue;
      const h = Math.hypot(vx, vz) || 1;
      const push = WONDER.windPush * (1 - (0.5 * d) / range);
      this.killFx = { fling: [r3((vx / h) * push), r3(WONDER.windLift * (0.7 + Math.random() * 0.6)), r3((vz / h) * push)] };
      this.damageZombie(z, this.wonderDamage(z, def.damage, p), p, 'body', false, true);
      this.killFx = null;
      // quem aguenta (chefões) é empurrado para trás
      if (this.zombies.has(z.id)) {
        z.x += (vx / h) * 1.2;
        z.z += (vz / h) * 1.2;
        this.world.collideCylinder(z, isBoss(z) ? BOSS.radius : ZOMBIE.radius, isBoss(z) ? BOSS.height : ZOMBIE.height);
      }
    }
  }

  // Arpão Elétrico: o raio acerta o primeiro zumbi na mira e salta para o mais perto, até o limite de saltos da arma.
  private arcShot(p: SimPlayer, def: WeaponDef, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) {
    const wh = this.world.raycast(ox, oy, oz, dx, dy, dz, def.range);
    const len = wh ? wh.t : def.range;
    const pts = [r3(ox), r3(oy), r3(oz)];
    let cur = this.zombieOnSegment(ox, oy, oz, ox + dx * len, oy + dy * len, oz + dz * len)?.z ?? null;
    if (!cur) {
      pts.push(r3(ox + dx * len), r3(oy + dy * len), r3(oz + dz * len));
      this.emit({ e: 'arc', pid: p.id, pts });
      return;
    }
    const done = new Set<number>();
    const chest = (z: SimZombie): [number, number, number] => [z.x, z.y + (isDog(z) ? 0.5 : isBoss(z) ? 1.8 : 1.2), z.z];
    for (let n = 0; cur && n < (def.chain ?? 10); n++) {
      const [cx, cy, cz] = chest(cur);
      pts.push(r3(cx), r3(cy), r3(cz));
      done.add(cur.id);
      this.killFx = { shock: true };
      this.damageZombie(cur, this.wonderDamage(cur, def.damage, p), p, 'body', false, true);
      this.killFx = null;
      let next: SimZombie | null = null;
      let best = WONDER.arcJump;
      for (const o of this.zombies.values()) {
        if (done.has(o.id) || o.anim === 'rise') continue;
        const [qx, qy, qz] = chest(o);
        const d = Math.hypot(qx - cx, qz - cz);
        if (d < best && this.world.lineOfSight(cx, cy, cz, qx, qy, qz)) {
          best = d;
          next = o;
        }
      }
      cur = next;
    }
    this.emit({ e: 'arc', pid: p.id, pts });
  }

  private openVortex(g: SimGrenade) {
    const def = WEAPONS[g.weapon];
    const v = def?.vortex ?? { radius: 7.5, time: 6 };
    const y = Math.max(g.y, 0.2) + 1.0;
    const id = this.nextGid++;
    this.vortices.push({ id, x: g.x, y, z: g.z, r: v.radius, t: 0, dur: v.time, pid: g.pid, damage: def?.damage ?? 4000, pulse: 0 });
    this.emit({ e: 'vortex', phase: 'open', id, x: r3(g.x), y: r3(y), z: r3(g.z), r: v.radius, dur: v.time });
  }

  // Vórtice: puxa os zumbis do raio para o centro, onde eles somem; chefões só levam dano.
  private updateVortices(dt: number) {
    this.sucked.clear();
    for (let i = this.vortices.length - 1; i >= 0; i--) {
      const v = this.vortices[i];
      v.t += dt;
      if (v.vx || v.vz) {
        v.x += (v.vx ?? 0) * dt;
        v.z += (v.vz ?? 0) * dt;
      }
      if (v.t >= v.dur) {
        this.vortices.splice(i, 1);
        this.emit({ e: 'vortex', phase: 'close', id: v.id, x: r3(v.x), y: r3(v.y), z: r3(v.z), r: v.r, dur: v.dur });
        continue;
      }
      const owner = this.players.get(v.pid);
      // chefões levam o dano em pulsos de meio segundo (um acerto, não um por passo)
      v.pulse += dt;
      const pulse = v.pulse >= WONDER.vortexPulse;
      if (pulse) v.pulse -= WONDER.vortexPulse;
      for (const z of [...this.zombies.values()]) {
        if (this.sucked.has(z.id)) continue;
        const dx = v.x - z.x, dz = v.z - z.z;
        const d = Math.hypot(dx, dz);
        if (d > v.r) continue;
        if (isChief(z)) {
          if (owner && pulse) this.damageZombie(z, v.damage * 0.25 * WONDER.vortexPulse, owner, 'body', false, true);
          continue;
        }
        // sai da janela, se estava nela, e vai sendo puxado (cada vez mais rápido perto do centro)
        if (z.phase !== 'none') {
          if (z.entry >= 0 && this.occupant[z.entry] === z.id) this.occupant[z.entry] = null;
          z.phase = 'none';
          z.entry = -1;
        }
        this.sucked.add(z.id);
        const speed = WONDER.vortexPull * (1.6 - d / v.r);
        const step = Math.min(d, speed * dt);
        if (d > 1e-3) {
          z.x += (dx / d) * step;
          z.z += (dz / d) * step;
        }
        z.y += (v.y - 0.6 - z.y) * Math.min(1, dt * 2.5);
        z.yaw += dt * 9;
        z.anim = 'move';
        if (Math.hypot(v.x - z.x, v.z - z.z) < WONDER.vortexCore) {
          if (owner) {
            this.killFx = { sucked: true };
            this.damageZombie(z, Math.max(v.damage, z.hp), owner, 'body', false, true);
            this.killFx = null;
          } else {
            this.zombies.delete(z.id);
            this.emit({ e: 'zvanish', zid: z.id });
          }
        }
      }
    }
  }

  // ---------- Bispo ----------

  private bispoAlive() {
    for (const z of this.zombies.values()) if (z.bispo) return true;
    return false;
  }

  private updateRitual(dt: number) {
    const r = this.ritual;
    if (!r || r.state !== 'summoning') return;
    r.t -= dt;
    if (r.t > 0) return;
    r.state = 'fight';
    this.spawnBispo();
  }

  // sobe da fenda de lava do cruzamento
  private spawnBispo() {
    const [x, z] = this.world.map.ritual?.arena[0] ?? [0, 0];
    const hp = BISPO.healthMult * zombieHealth(Math.max(10, this.round)) * Math.max(1, this.players.size);
    const zb: SimZombie = {
      id: this.nextZid++,
      x, y: this.world.groundHeight(x, z, BISPO.radius, 0.2), z,
      yaw: 0, hp, kind: 6, speed: BISPO.speed[0], anim: 'rise', t: 0, look: Math.floor(Math.random() * 1e6),
      attackT: 0, attackHit: false, losT: 0, los: false, bestNav: 0xffff, stuckT: 0,
      entry: -1, phase: 'none', phaseT: 0,
      bispo: { maxHp: hp, phase: 1, shieldT: 0, ringT: 0, orbT: 3, castT: 0, summonT: 6, pillarT: 2 },
    };
    this.zombies.set(zb.id, zb);
    this.emit({ e: 'bispo', phase: 'spawn', zid: zb.id, x: r3(x), z: r3(z) });
  }

  private updateBispo(z: SimZombie, dt: number, targets: SimPlayer[]) {
    const b = z.bispo!;
    const P = b.phase - 1;
    let tp: SimPlayer | null = null;
    let td = Infinity;
    for (const p of targets) {
      const d = Math.hypot(p.x - z.x, p.z - z.z);
      if (d < td) {
        td = d;
        tp = p;
      }
    }
    const face = (x: number, zz: number, k: number) => {
      z.yaw = angleLerp(z.yaw, Math.atan2(x - z.x, zz - z.z), Math.min(1, dt * k));
    };
    // trocando de fase: parado, imune, queimando quem fica no anel de fogo
    if (b.shieldT > 0) {
      b.shieldT -= dt;
      b.ringT -= dt;
      z.anim = 'cast';
      if (b.ringT <= 0) {
        b.ringT = 0.5;
        for (const p of targets) {
          if (Math.hypot(p.x - z.x, p.z - z.z) < BISPO.shield.ring) this.damagePlayer(p, BISPO.shield.damage, z.x, z.z, true);
        }
      }
      if (b.shieldT <= 0) z.anim = 'move';
      return;
    }
    if (z.anim === 'attack') {
      const S = BISPO.swing;
      z.attackT += dt;
      if (tp) face(tp.x, tp.z, 6);
      if (!z.attackHit && z.attackT >= S.windup) {
        z.attackHit = true;
        for (const p of targets) {
          if (Math.hypot(p.x - z.x, p.z - z.z) < S.hitRange && Math.abs(p.y - z.y) < 2) this.damagePlayer(p, S.damage, z.x, z.z, false);
        }
      }
      if (z.attackT >= S.windup + S.recover) z.anim = 'move';
      return;
    }
    b.orbT -= dt;
    b.summonT -= dt;
    if (b.phase >= 2) b.pillarT -= dt;
    if (b.castT > 0) {
      b.castT -= dt;
      if (tp) face(tp.x, tp.z, 6);
      if (b.castT <= 0) z.anim = 'move';
      return;
    }
    if (!tp) return;
    const sees = (p: SimPlayer) => this.world.lineOfSight(z.x, z.y + 2.4, z.z, p.x, p.y + 1.2, p.z);
    if (td < BISPO.swing.range) {
      z.anim = 'attack';
      z.attackT = 0;
      z.attackHit = false;
      this.emit({ e: 'zattack', zid: z.id });
      return;
    }
    // bolas de fogo no jogador mais perto (três em leque na fase 3)
    if (b.orbT <= 0 && sees(tp)) {
      b.orbT = BISPO.orb.every[P];
      b.castT = BISPO.orb.cast;
      z.anim = 'cast';
      const ox = z.x, oy = z.y + 2.6, oz = z.z;
      const dx = tp.x - ox, dy = tp.y + 1.1 - oy, dz = tp.z - oz;
      const base = Math.atan2(dx, dz);
      const h = Math.hypot(dx, dz) || 1;
      const pitch = Math.atan2(dy, h);
      const fans = b.phase === 3 ? [-BISPO.orb.spread, 0, BISPO.orb.spread] : [0];
      for (const a of fans) {
        const s = BISPO.orb.speed;
        this.orbs.push({
          id: this.nextGid++, x: ox, y: oy, z: oz, t: 0,
          vx: Math.sin(base + a) * Math.cos(pitch) * s, vy: Math.sin(pitch) * s, vz: Math.cos(base + a) * Math.cos(pitch) * s,
        });
      }
      this.emit({ e: 'bispo', phase: 'orb', zid: z.id, x: r3(z.x), z: r3(z.z), n: fans.length });
      return;
    }
    // chama zumbis da terra em volta dele (cães na fase 3)
    if (b.summonT <= 0) {
      b.summonT = BISPO.summon.every[P];
      const n = BISPO.summon.n[P];
      if (this.roundZombies() < ZOMBIE.maxAlive) {
        for (let i = 0; i < n; i++) {
          if (b.phase === 3) this.spawnDog();
          else {
            const a = Math.random() * Math.PI * 2;
            const r = 2.5 + Math.random() * 2;
            const sx = z.x + Math.sin(a) * r, sz = z.z + Math.cos(a) * r;
            if (this.nav.distanceAt(sx, sz) < 0xffff) this.spawnZombie([sx, sz]);
          }
        }
        b.castT = 0.8;
        z.anim = 'cast';
        this.emit({ e: 'bispo', phase: 'summon', zid: z.id, x: r3(z.x), z: r3(z.z), n });
        return;
      }
    }
    // pilares de fogo sob cada jogador
    if (b.phase >= 2 && b.pillarT <= 0) {
      b.pillarT = BISPO.pillar.every[P];
      const pts: number[] = [];
      for (const p of targets) {
        this.pillars.push({ x: p.x, z: p.z, t: BISPO.pillar.warn });
        pts.push(r3(p.x), r3(p.z));
      }
      this.emit({ e: 'bispo', phase: 'pillar', zid: z.id, x: r3(z.x), z: r3(z.z), pts });
    }
    // anda (flutua) até o jogador
    z.speed = BISPO.speed[P];
    let dx = tp.x - z.x;
    let dz = tp.z - z.z;
    z.losT -= dt;
    if (z.losT <= 0) {
      z.losT = 0.3;
      z.los = td < ZOMBIE.directChaseRange && sees(tp);
    }
    if (!z.los) {
      const d = this.nav.direction(z.x, z.z);
      if (d) [dx, dz] = d;
    }
    const dl = Math.hypot(dx, dz) || 1;
    z.x += (dx / dl) * z.speed * dt;
    z.z += (dz / dl) * z.speed * dt;
    this.world.collideCylinder(z, BISPO.radius, BISPO.height);
    z.y = this.world.groundHeight(z.x, z.z, BISPO.radius, z.y);
    face(z.x + dx, z.z + dz, 4);
    const nd = this.nav.distanceAt(z.x, z.z);
    if (nd < z.bestNav - 1) {
      z.bestNav = nd;
      z.stuckT = 0;
    } else z.stuckT += dt;
    // preso: reaparece num dos pontos do ritual mais perto de alguém
    if (z.stuckT > ZOMBIE.stuckTime && td > 12) {
      const spots = this.world.map.ritual?.arena ?? [];
      let best: [number, number] | null = null;
      let bd = Infinity;
      for (const [x, zz] of spots) {
        const d = Math.min(...targets.map((p) => Math.hypot(p.x - x, p.z - zz)));
        if (d > 8 && d < bd) {
          bd = d;
          best = [x, zz];
        }
      }
      if (best) {
        [z.x, z.z] = best;
        z.y = this.world.groundHeight(z.x, z.z, BISPO.radius, 0.3);
        this.emit({ e: 'bispo', phase: 'phase', zid: z.id, x: r3(z.x), z: r3(z.z), n: b.phase });
      }
      z.stuckT = 0;
      z.bestNav = 0xffff;
    }
  }

  // bolas de fogo: voam retas e explodem no jogador, na parede ou no chão
  private updateOrbs(dt: number) {
    const O = BISPO.orb;
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.t += dt;
      const sp = Math.hypot(o.vx, o.vy, o.vz);
      const step = sp * dt;
      const wh = this.world.raycast(o.x, o.y, o.z, o.vx / sp, o.vy / sp, o.vz / sp, step);
      let hit = !!wh || o.y < 0.2 || o.t > 6;
      if (wh) {
        o.x += (o.vx / sp) * wh.t;
        o.y += (o.vy / sp) * wh.t;
        o.z += (o.vz / sp) * wh.t;
      } else {
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        o.z += o.vz * dt;
      }
      for (const p of this.players.values()) {
        if (p.life === 'alive' && Math.hypot(p.x - o.x, p.y + 1.1 - o.y, p.z - o.z) < O.hitRadius) hit = true;
      }
      if (!hit) continue;
      this.orbs.splice(i, 1);
      this.emit({ e: 'boom', x: r3(o.x), y: r3(o.y), z: r3(o.z), kind: 'fire' });
      for (const p of this.players.values()) {
        const d = Math.hypot(p.x - o.x, p.y + 1 - o.y, p.z - o.z);
        if (p.life === 'alive' && d < O.radius) this.damagePlayer(p, O.damage * (1 - (0.6 * d) / O.radius), o.x, o.z, false);
      }
    }
  }

  private updatePillars(dt: number) {
    const P = BISPO.pillar;
    for (let i = this.pillars.length - 1; i >= 0; i--) {
      const c = this.pillars[i];
      c.t -= dt;
      if (c.t > 0) continue;
      this.pillars.splice(i, 1);
      this.emit({ e: 'boom', x: r3(c.x), y: 0.5, z: r3(c.z), kind: 'fire' });
      for (const p of this.players.values()) {
        if (p.life === 'alive' && Math.hypot(p.x - c.x, p.z - c.z) < P.radius) this.damagePlayer(p, P.damage, c.x, c.z, false);
      }
    }
  }

  // Bispo morto: 5000 pontos e todas as bebidas para cada jogador, e Munição Cheia no chão
  private bispoDeath(z: SimZombie) {
    this.emit({ e: 'bispo', phase: 'death', zid: z.id, x: r3(z.x), z: r3(z.z) });
    if (this.ritual) this.ritual.state = 'done';
    this.orbs = [];
    this.pillars = [];
    for (const o of this.players.values()) {
      if (o.life === 'dead') continue;
      this.addPoints(o, BISPO.reward);
      if (o.life !== 'alive') continue;
      for (const k of BASE_PERKS) {
        if (o.perks.includes(k) || (k === 'folego' && this.solo && o.selfRevives >= SOLO_SELF_REVIVES)) continue;
        this.grantPerk(o, k);
      }
    }
    this.powerups.push({ id: this.nextPid++, kind: 'maxammo', x: z.x, y: z.y, z: z.z, t: 0 });
  }

  private updateRepairs(dt: number) {
    for (const p of this.players.values()) {
      if (p.repairEntry === null || p.life !== 'alive') continue;
      const i = p.repairEntry;
      const pts = entryPoints(this.world.map.entries[i]);
      if (Math.hypot(p.x - pts.inside[0], p.z - pts.inside[1]) > BARRICADE.repairRange || this.boards[i] >= ENTRY_BOARDS) {
        p.repairT = 0;
        continue;
      }
      p.repairT += dt;
      if (p.repairT < BARRICADE.repairTime) continue;
      p.repairT = 0;
      this.boards[i]++;
      this.emit({ e: 'board', entry: i, boards: this.boards[i], kind: 'fix' });
      if (p.repairPts < BARRICADE.repairLimit) {
        p.repairPts += BARRICADE.repairPoints;
        this.addPoints(p, BARRICADE.repairPoints);
      }
    }
  }

  // janelas com tábuas que já valem (as dos prédios fechados esperam a porta abrir)
  private openEntries() {
    return this.world.map.entries.filter((e) => !e.area || this.world.openDoors.has(e.area));
  }

  // pontos de surgir da terra nas áreas já abertas
  private openSpawns() {
    const open = (a: string) => this.world.openDoors.has(a);
    // Trincheira: uma área também vale como aberta se há um jogador vivo dentro dela (tanque, Câmara Antiga)
    if (this.tr) return this.world.map.zombieSpawns.filter((s) => this.tr!.spawnValid(s));
    return this.world.map.zombieSpawns.filter((s) => s.area === null || (Array.isArray(s.area) ? s.area.some(open) : open(s.area)));
  }

  // Cão preso: cai outro raio perto de alguém
  private relocateDog(z: SimZombie) {
    const spot = this.dogSpot();
    z.stuckT = 0;
    z.bestNav = 0xffff;
    if (!spot) return;
    [z.x, z.z] = spot;
    z.y = this.world.groundHeight(z.x, z.z, DOGS.radius, 0.2);
    z.t = 0;
    z.anim = 'rise';
    this.emit({ e: 'dogspawn', zid: z.id, x: r3(z.x), z: r3(z.z) });
  }

  // Zumbi preso longe de todos: volta a entrar por outro lugar (terra de área aberta ou uma barricada).
  private relocate(z: SimZombie) {
    // mapa grande: reaparece da terra perto dos jogadores
    if (this.world.map.zones) {
      const spot = this.dogSpot(14, 30);
      z.stuckT = 0;
      z.bestNav = 0xffff;
      z.t = 0;
      if (!spot) return;
      [z.x, z.z] = spot;
      z.y = this.world.groundHeight(z.x, z.z, ZOMBIE.radius, 0.2);
      z.entry = -1;
      z.phase = 'none';
      z.anim = 'rise';
      this.emit({ e: 'zrise', zid: z.id, x: r3(z.x), z: r3(z.z) });
      return;
    }
    const alive = [...this.players.values()].filter((p) => p.life === 'alive');
    const far = (x: number, zz: number) => alive.every((p) => Math.hypot(x - p.x, zz - p.z) > 10);
    const ground = this.openSpawns().filter((s) => far(s.x, s.z));
    const entries = this.openEntries().filter((e) => far(...entryPoints(e).inside));
    z.stuckT = 0;
    z.bestNav = 0xffff;
    z.t = 0;
    if (ground.length && (!entries.length || Math.random() < 0.5)) {
      const s = ground[Math.floor(Math.random() * ground.length)];
      z.x = s.x;
      z.z = s.z;
      z.y = this.world.groundHeight(z.x, z.z, ZOMBIE.radius, 0.2);
      z.anim = 'rise';
      this.emit({ e: 'zrise', zid: z.id, x: r3(z.x), z: r3(z.z) });
      return;
    }
    const pool = entries.length ? entries : this.openEntries();
    if (!pool.length) return;
    const e = pool[Math.floor(Math.random() * pool.length)];
    const out = entryPoints(e).outside;
    z.x = out[0];
    z.z = out[1];
    z.y = 0;
    z.entry = e.id;
    z.phase = 'approach';
    z.anim = 'move';
  }

  tick(dt: number) {
    if (this.state === 'waiting' || this.state === 'gameover') return;
    this.time += dt;

    if (this.state === 'intermission') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) this.startRound();
    } else if (this.state === 'active') {
      const maxAlive = this.hell ? DOGS.maxAlive + 2 * (this.players.size - 1) : ZOMBIE.maxAlive;
      const alive = this.roundZombies();
      if (this.toSpawn > 0 && alive < maxAlive && !this.bispoAlive()) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          if (this.hell) this.spawnDog();
          else this.spawnZombie();
          this.toSpawn--;
          this.spawnTimer = this.spawnDelay();
        }
      }
      if (this.bossTimer > 0) {
        this.bossTimer -= dt;
        // mataram tudo antes: ele vem na hora
        if (this.toSpawn === 0 && this.roundZombies() === 0) this.bossTimer = 0;
        if (this.bossTimer <= 0) {
          this.bossTimer = -1;
          this.spawnBoss();
        }
      }
      if (this.toSpawn === 0 && this.roundZombies() === 0 && this.bossTimer < 0 && !this.tr?.bossPending()) {
        this.state = 'intermission';
        this.stateTimer = INTERMISSION_TIME;
        this.tr?.onRoundEnd(this.round);
        this.emit({ e: 'roundEnd', round: this.round, hell: this.hell });
        if (this.hell) this.endHellRound();
      }
    }

    this.updateRitual(dt);
    this.updatePlayers(dt);
    this.updateRepairs(dt);
    this.updateGrenades(dt);
    this.updateBox(dt);
    this.updatePowerups(dt);
    this.updateForge(dt);
    this.updateBus(dt);
    this.tr?.tick(dt);
    this.updateFog(dt);
    this.updateVortices(dt);
    this.updateZombies(dt);
    this.updateOrbs(dt);
    this.updatePillars(dt);
  }

  // zumbis que contam para a rodada (os Vultos não contam)
  private roundZombies(): number {
    let n = 0;
    for (const z of this.zombies.values()) if (!isVulto(z) && z.kind !== 8) n++;
    return n;
  }

  zoneAt(x: number, z: number): string | null {
    for (const zn of this.world.map.zones ?? []) {
      const r = zn.rect;
      if (x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) return zn.id;
    }
    return null;
  }

  // o jogador está dentro do ônibus (no piso, entre as paredes)
  onBus(p: { x: number; y: number; z: number }): boolean {
    const b = this.bus;
    if (!b) return false;
    const dx = p.x - b.x, dz = p.z - b.z;
    const s = Math.sin(b.yaw), c = Math.cos(b.yaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    // folga para a frente: o navegador desenha o ônibus um pouco atrás de onde ele está na simulação
    return Math.abs(lx) < BUS.halfWidth + 0.4 && lz > -BUS.halfLen - 0.4 && lz < BUS.halfLen + 1.6 && p.y > BUS.floorY - 0.25;
  }

  // Ponto para onde o zumbi vai quando o alvo está dentro do ônibus: primeiro a frente da porta mais perto, depois o corredor.
  private busDoorTarget(z: SimZombie, tp: SimPlayer): [number, number] | null {
    const b = this.bus;
    if (!b || !this.onBus(tp) || this.onBus(z)) return null;
    const [lx, lz] = toLocal(b, z.x, z.z);
    if (Math.abs(lx) > BUS.halfWidth + 4 || Math.abs(lz) > BUS.halfLen + 4) return null;
    const side = lx >= 0 ? 1 : -1;
    const dz = (BUS_DOOR.z0 + BUS_DOOR.z1) / 2;
    const atDoor = Math.abs(lz - dz) < 0.5 && Math.abs(lx) < BUS.halfWidth + 1;
    return toWorld(b, atDoor ? 0 : side * (BUS.halfWidth + 0.8), dz);
  }

  // Ônibus: anda pela rota, freia perto das paradas, espera, buzina e sai; atropela zumbis no caminho.
  private updateBus(dt: number) {
    const b = this.bus;
    const route = this.world.map.bus;
    if (!b || !route) return;
    const n = route.path.length;
    if (b.wait > 0) {
      b.wait -= dt;
      if (b.wait <= BUS.honkAt && !b.honked) {
        b.honked = true;
        this.emit({ e: 'bus', phase: 'honk', zone: b.stop ?? '' });
      }
      if (b.wait <= 0) {
        this.emit({ e: 'bus', phase: 'leave', zone: b.stop ?? '' });
        b.stop = null;
      }
      return;
    }
    // distância até a próxima parada (para frear)
    const stopAt = new Set(route.stops.map((s) => s.at));
    let ahead = -b.d;
    for (let k = 0, i = b.seg; k < n; k++, i = (i + 1) % n) {
      const [ax, az] = route.path[i];
      const [bx, bz] = route.path[(i + 1) % n];
      ahead += Math.hypot(bx - ax, bz - az);
      if (stopAt.has((i + 1) % n)) break;
    }
    // acelera devagar ao sair (dá para correr atrás e subir) e freia chegando na parada
    const target = ahead < BUS.slowDist ? Math.max(BUS.slowSpeed, BUS.speed * (ahead / BUS.slowDist)) : BUS.speed;
    b.v = b.v < target ? Math.min(target, b.v + BUS.accel * dt) : Math.max(target, b.v - BUS.brake * dt);
    let left = b.v * dt;
    while (left > 0) {
      const [ax, az] = route.path[b.seg];
      const [bx, bz] = route.path[(b.seg + 1) % n];
      const len = Math.hypot(bx - ax, bz - az);
      if (b.d + left < len) {
        b.d += left;
        left = 0;
      } else {
        left -= len - b.d;
        b.seg = (b.seg + 1) % n;
        b.d = 0;
        const stop = route.stops.find((s) => s.at === b.seg);
        if (stop) {
          b.wait = BUS.wait;
          b.v = 0;
          b.stop = stop.zone;
          b.honked = false;
          this.emit({ e: 'bus', phase: 'arrive', zone: stop.zone });
          left = 0;
        }
      }
    }
    const [ax, az] = route.path[b.seg];
    const [bx, bz] = route.path[(b.seg + 1) % n];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    b.x = ax + ((bx - ax) * b.d) / len;
    b.z = az + ((bz - az) * b.d) / len;
    b.yaw = angleLerp(b.yaw, Math.atan2(bx - ax, bz - az), Math.min(1, dt * 2.2));
    // atropela quem estiver na frente (menos o Carrasco); bem devagar, só empurra
    if (b.v < 1.5) return;
    const s = Math.sin(b.yaw), c = Math.cos(b.yaw);
    for (const z of [...this.zombies.values()]) {
      if (isChief(z) || z.anim === 'rise') continue;
      const dx = z.x - b.x, dz = z.z - b.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < BUS.halfWidth + 0.4 && lz > -BUS.halfLen && lz < BUS.halfLen + 0.8) {
        this.zombies.delete(z.id);
        if (z.entry >= 0 && this.occupant[z.entry] === z.id) this.occupant[z.entry] = null;
        this.emit({ e: 'runover', zid: z.id });
      }
    }
  }

  // Névoa: quem anda fora das paradas e do ônibus por um tempo atrai Vultos; eles somem quando ninguém está mais nela.
  private updateFog(dt: number) {
    if (!this.world.map.fogCreatures || this.state !== 'active' && this.state !== 'intermission') return;
    const inFog: SimPlayer[] = [];
    for (const p of this.players.values()) {
      const fog = p.life === 'alive' && !this.zoneAt(p.x, p.z) && !this.onBus(p);
      const t = fog ? (this.fogT.get(p.id) ?? 0) + dt : 0;
      this.fogT.set(p.id, t);
      if (fog && t > VULTO.delay) inFog.push(p);
    }
    const vultos = [...this.zombies.values()].filter(isVulto);
    if (!inFog.length) {
      this.noFogT += dt;
      if (this.noFogT > VULTO.vanishAfter) {
        for (const v of vultos) {
          this.zombies.delete(v.id);
          this.emit({ e: 'zvanish', zid: v.id });
        }
      }
      return;
    }
    this.noFogT = 0;
    this.vultoT -= dt;
    if (this.vultoT > 0 || vultos.length >= VULTO.maxPerPlayer * inFog.length) return;
    this.vultoT = VULTO.every * (0.7 + Math.random() * 0.6);
    const spot = this.dogSpot(VULTO.spawnMin, VULTO.spawnMax);
    if (!spot) return;
    const [x, z] = spot;
    const target = inFog[Math.floor(Math.random() * inFog.length)];
    const zb: SimZombie = {
      id: this.nextZid++,
      x, y: this.world.groundHeight(x, z, VULTO.radius, 0.2), z,
      yaw: Math.atan2(target.x - x, target.z - z),
      hp: VULTO.health, kind: 5, speed: VULTO.speed * (0.9 + Math.random() * 0.2),
      anim: 'rise', t: 0, look: Math.floor(Math.random() * 1e6),
      attackT: 0, attackHit: false, losT: 0, los: false, bestNav: 0xffff, stuckT: 0,
      entry: -1, phase: 'none', phaseT: 0,
    };
    this.zombies.set(zb.id, zb);
    this.emit({ e: 'zrise', zid: zb.id, x: r3(x), z: r3(z) });
  }

  // fim da rodada infernal: o último cão sempre deixa Munição Cheia
  private endHellRound() {
    this.hellRounds++;
    this.hell = false;
    let at = this.lastDogPos;
    if (!at) {
      const p = [...this.players.values()].find((o) => o.life === 'alive');
      if (p) at = [p.x, p.y, p.z];
    }
    if (at) this.powerups.push({ id: this.nextPid++, kind: 'maxammo', x: at[0], y: at[1], z: at[2], t: 0 });
  }

  private updatePlayers(dt: number) {
    for (const p of this.players.values()) {
      if (p.life === 'alive') {
        if (this.time - p.lastHurt > PLAYER.regenDelay) {
          p.health = Math.min(p.maxHealth, p.health + PLAYER.regenRate * (p.maxHealth / PLAYER.maxHealth) * dt);
        }
        if (p.y < 0.3 && this.world.inLava(p.x, p.z)) {
          p.lavaTimer -= dt;
          if (p.lavaTimer <= 0) {
            p.lavaTimer = LAVA_INTERVAL;
            this.damagePlayer(p, LAVA_DAMAGE, p.x, p.z, true);
          }
        } else {
          p.lavaTimer = 0;
        }
      } else if (p.life === 'downed') {
        if (p.selfReviveT > 0) {
          p.selfReviveT -= dt;
          p.revive = 1 - p.selfReviveT / SELF_REVIVE_TIME;
          if (p.selfReviveT <= 0) {
            p.selfReviveT = 0;
            p.selfRevives++;
            p.life = 'alive';
            p.health = p.maxHealth;
            p.revive = 0;
            p.lastHurt = this.time;
            this.emit({ e: 'selfrevive', pid: p.id });
          }
          continue;
        }
        let reviving = false;
        for (const o of this.players.values()) {
          if (o.life === 'alive' && o.reviveTarget === p.id && Math.hypot(o.x - p.x, o.z - p.z) <= REVIVE_RANGE + 0.5) {
            reviving = true;
            p.revive += dt / (REVIVE_TIME * (o.perks.includes('folego') ? PERK_FX.folegoReviveMult : 1));
            if (p.revive >= 1) {
              this.revivePlayer(p, o);
              o.reviveTarget = null;
              this.emit({ e: 'previve', pid: p.id, by: o.id });
            }
            break;
          }
        }
        if (p.life !== 'downed') continue;
        if (!reviving) {
          p.revive = 0;
          p.bleed -= dt;
          if (p.bleed <= 0) {
            p.life = 'dead';
            p.bleed = 0;
            this.tr?.onPlayerGone(p);
            this.emit({ e: 'pdead', pid: p.id });
            this.checkGameOver();
          }
        }
      }
    }
  }

  private updateZombies(dt: number) {
    // Sangue Morto: quem bebeu some dos alvos dos zumbis
    const targets = [...this.players.values()].filter((p) => p.life === 'alive' && (!this.tr || this.tr.targetable(p)));
    this.navTimer -= dt;
    if (this.navTimer <= 0) {
      this.navTimer = 0.25;
      this.nav.update(targets, this.world.map.navRange ? Math.round(this.world.map.navRange / this.nav.cell) : undefined);
    }
    const all = [...this.zombies.values()];
    const bodies = [...this.players.values()].filter((p) => p.life !== 'dead');

    for (const z of all) {
      z.t += dt;
      if (this.sucked.has(z.id)) continue;
      if (z.phase !== 'none') {
        this.updateEntryZombie(z, dt, targets);
        continue;
      }
      const dog = isDog(z);
      if (z.anim === 'rise') {
        if (z.t >= (dog ? DOGS.arriveTime : isBoss(z) || isPanzer(z) ? BOSS.riseTime : isBispo(z) ? BISPO.riseTime : isVulto(z) ? VULTO.riseTime : ZOMBIE.riseTime)) z.anim = 'move';
        continue;
      }
      if (this.tr && z.kind === 7) {
        this.tr.updatePanzer(z, dt, targets, all);
        continue;
      }
      if (this.tr && z.kind === 8) {
        this.tr.updateTemplar(z, dt, targets, all);
        continue;
      }
      if (isBoss(z)) {
        this.updateBoss(z, dt, targets, all);
        continue;
      }
      if (isBispo(z)) {
        this.updateBispo(z, dt, targets);
        continue;
      }
      // Trincheira: zumbi comum sobe no tanque lento (escalada de 1 s) e, no convés, é levado junto
      if (this.tr?.zombieTank(z, dt)) continue;
      // medidas do tipo: zumbi ou cão
      const C = isVulto(z) ? VULTO : dog ? DOGS : ZOMBIE;

      let tp: SimPlayer | null = null;
      let td = Infinity;
      for (const p of targets) {
        const d = Math.hypot(p.x - z.x, p.z - z.z);
        if (d < td) {
          td = d;
          tp = p;
        }
      }

      if (z.anim === 'attack') {
        z.attackT += dt;
        if (tp) z.yaw = angleLerp(z.yaw, Math.atan2(tp.x - z.x, tp.z - z.z), Math.min(1, dt * 8));
        if (!z.attackHit && z.attackT >= C.attackWindup) {
          z.attackHit = true;
          if (tp && td < C.attackHitRange && Math.abs(tp.y - z.y) < 1.5) {
            this.damagePlayer(tp, C.damage, z.x, z.z, false);
          }
        }
        if (z.attackT >= C.attackWindup + C.attackRecover) z.anim = 'move';
        continue;
      }

      if (!tp) continue;

      if (td < C.attackRange && Math.abs(tp.y - z.y) < 1.2) {
        z.anim = 'attack';
        z.attackT = 0;
        z.attackHit = false;
        this.emit({ e: 'zattack', zid: z.id });
        continue;
      }

      let dx = tp.x - z.x;
      let dz = tp.z - z.z;
      z.losT -= dt;
      if (z.losT <= 0) {
        z.losT = 0.25 + Math.random() * 0.1;
        z.los = td < ZOMBIE.directChaseRange && this.world.lineOfSight(z.x, z.y + (dog ? 0.6 : 1.2), z.z, tp.x, tp.y + 1.2, tp.z);
        // no convés não há caminho a seguir: vai direto ao jogador
        if (z.onTank) z.los = true;
      }
      if (!z.los) {
        const d = this.nav.direction(z.x, z.z);
        if (d) {
          dx = d[0];
          dz = d[1];
        }
      }
      // jogador dentro do ônibus parado: o zumbi dá a volta e entra pela porta
      const door = this.busDoorTarget(z, tp);
      if (door) {
        dx = door[0] - z.x;
        dz = door[1] - z.z;
      }
      const dl = Math.hypot(dx, dz) || 1;
      // frio do Cajado de Gelo: até 70% mais lento
      const slow = z.frost ? 1 - 0.7 * z.frost : 1;
      let vx = (dx / dl) * z.speed * slow;
      let vz = (dz / dl) * z.speed * slow;

      // separação entre zumbis e para não entrar no jogador
      let sx = 0;
      let sz = 0;
      for (const o of all) {
        if (o === z) continue;
        const ox = z.x - o.x;
        const oz = z.z - o.z;
        const d2 = ox * ox + oz * oz;
        if (d2 > 0.56 || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        sx += (ox / d) * (0.75 - d);
        sz += (oz / d) * (0.75 - d);
      }
      for (const p of bodies) {
        const ox = z.x - p.x;
        const oz = z.z - p.z;
        const d = Math.hypot(ox, oz);
        if (d < 0.7 && d > 1e-4) {
          sx += (ox / d) * (0.7 - d) * 2;
          sz += (oz / d) * (0.7 - d) * 2;
        }
      }
      vx += sx * 4;
      vz += sz * 4;

      z.x += vx * dt;
      z.z += vz * dt;
      this.world.collideCylinder(z, C.radius, C.height);
      z.y = this.world.groundHeight(z.x, z.z, C.radius, z.y);
      // o ônibus é sólido para os zumbis (só se entra pelas portas)
      if (this.bus) {
        busCollide(this.bus, z, C.radius);
        z.y = Math.max(z.y, busGround(this.bus, z.x, z.z, C.radius, z.y, 0.5));
      }
      if (this.tr) {
        // no convés o zumbi anda a altura do convés (o casco só o empurra por fora)
        if (z.onTank) z.y = TANK_BODY.floorY;
        busCollide(this.tr.tankPose(), z, C.radius, TANK_BODY);
        this.tr.zombieDeckFix(z);
      }
      z.yaw = angleLerp(z.yaw, Math.atan2(dx, dz), Math.min(1, dt * 6));

      // Zumbi preso longe de todos: reaparece em outro ponto.
      const nd = this.nav.distanceAt(z.x, z.z);
      if (nd < z.bestNav - 1) {
        z.bestNav = nd;
        z.stuckT = 0;
      } else {
        z.stuckT += dt;
      }
      if (z.stuckT > ZOMBIE.stuckTime && td > 18) {
        if (dog) this.relocateDog(z);
        else this.relocate(z);
      }
      else if (z.stuckT > ZOMBIE.stuckTime) {
        z.stuckT = 0;
        z.bestNav = nd;
      }
    }
  }

  snapshot(): Snapshot {
    const players: NetPlayer[] = [];
    for (const p of this.players.values()) {
      players.push({
        id: p.id, name: p.name, slot: p.slot,
        x: r3(p.x), y: r3(p.y), z: r3(p.z), yaw: r3(p.yaw), pitch: r3(p.pitch),
        crouch: p.crouch, speed: r3(p.speed), life: p.life, health: Math.round(p.health),
        points: p.points, kills: p.kills, headshots: p.headshots, downs: p.downs, revives: p.revives,
        bleed: r3(p.bleed), revive: r3(p.revive),
        maxHealth: p.maxHealth, perks: [...p.perks], selfRevives: p.selfRevives,
        weapons: [...p.weapons], grenades: p.grenades, heavyKnife: p.heavyKnife, sights: { ...p.sights }, level: p.level, earned: p.earned,
        ...(this.tr ? this.tr.playerFields(p) : {}),
      });
    }
    const zombies: NetZombie[] = [];
    for (const z of this.zombies.values()) {
      zombies.push({ id: z.id, x: r3(z.x), y: r3(z.y), z: r3(z.z), yaw: r3(z.yaw), anim: z.anim, kind: z.kind, look: z.look });
    }
    return {
      time: r3(this.time),
      round: this.round,
      startRound: this.firstRound,
      state: this.state,
      stateTimer: r3(Math.max(0, this.stateTimer)),
      hell: this.hell,
      power: this.power,
      bus: this.bus ? { x: r3(this.bus.x), z: r3(this.bus.z), yaw: r3(this.bus.yaw), stop: this.bus.stop, wait: r3(Math.max(0, this.bus.wait)) } : null,
      boss: (() => {
        const b = [...this.zombies.values()].find((z) => z.boss || z.panzer);
        if (!b) return null;
        return b.panzer
          ? { hp: r3(Math.max(0, b.hp) / b.panzer.maxHp), armor: b.panzer.visor }
          : { hp: r3(Math.max(0, b.hp) / b.boss!.maxHp), armor: b.boss!.armor };
      })(),
      ritual: this.ritual ? { candles: [...this.ritual.candles], state: this.ritual.state } : null,
      bispo: (() => {
        const b = [...this.zombies.values()].find((z) => z.bispo);
        return b ? { hp: r3(Math.max(0, b.hp) / b.bispo!.maxHp), phase: b.bispo!.phase, shield: b.bispo!.shieldT > 0 } : null;
      })(),
      zombiesLeft: this.toSpawn + this.roundZombies(),
      boards: [...this.boards],
      doors: [...this.world.openDoors],
      projectiles: [
        ...this.grenades.map((g) => ({ id: g.id, kind: g.kind, x: r3(g.x), y: r3(g.y), z: r3(g.z) })),
        ...this.orbs.map((o) => ({ id: o.id, kind: 'orb' as const, x: r3(o.x), y: r3(o.y), z: r3(o.z) })),
      ],
      vortices: this.vortices.map((v) => ({ id: v.id, x: r3(v.x), y: r3(v.y), z: r3(v.z), r: v.r, t: r3(v.t), dur: v.dur })),
      box: { ...this.box, t: r3(Math.max(0, this.box.t)) },
      powerups: this.powerups.map((p) => ({ id: p.id, kind: p.kind, x: r3(p.x), y: r3(p.y), z: r3(p.z), t: r3(p.t) })),
      effects: { insta: r3(this.effects.insta), double: r3(this.effects.double), firesale: r3(this.effects.firesale) },
      forge: { ...this.forge, candles: [...this.forge.candles], t: r3(Math.max(0, this.forge.t)) },
      players,
      zombies,
      ...(this.tr ? { tr: this.tr.snap() } : {}),
    };
  }
}
