import type { PerkId } from './perks';
import type { PowerupKind } from './powerups';
import type { HitPart, SightKind } from './weapons';

export type PlayerLife = 'alive' | 'downed' | 'dead';
// orb = bola de fogo do Bispo
export type ProjectileKind = 'grenade' | 'launcher' | 'bolt' | 'ray' | 'rocket' | 'blade' | 'drum' | 'wind' | 'arc' | 'vortex' | 'orb';

export interface ForgeState {
  on: boolean;
  candles: boolean[];
  state: 'idle' | 'working' | 'ready';
  t: number;
  weapon: string | null;
  pid: string | null;
}

export interface BoxState {
  loc: number;
  state: 'idle' | 'spinning' | 'offer' | 'moving';
  t: number;
  weapon: string | null;
  pid: string | null;
  fireSale: boolean;
}
export type RoundState = 'waiting' | 'active' | 'intermission' | 'gameover';
export type ZombieAnim = 'rise' | 'move' | 'attack' | 'tear' | 'climb' | 'slam' | 'chain' | 'charge' | 'cast';
export type ZombieKind = 0 | 1 | 2 | 3 | 4 | 5 | 6; // anda, corre, dispara, Cão Infernal, Carrasco, Vulto, Bispo

export interface NetPlayer {
  id: string;
  name: string;
  slot: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  crouch: boolean;
  speed: number;
  life: PlayerLife;
  health: number;
  points: number;
  kills: number;
  headshots: number;
  downs: number;
  revives: number;
  bleed: number;
  revive: number;
  maxHealth: number;
  perks: PerkId[];
  selfRevives: number;
  weapons: string[];
  grenades: number;
  heavyKnife: boolean;
  // miras compradas na Oficina, por arma (id sem a versão da Forja)
  sights: Record<string, SightKind>;
  level: number;
  // pontos ganhos na partida (sem contar gastos)
  earned: number;
}

export interface NetZombie {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  anim: ZombieAnim;
  kind: ZombieKind;
  look: number;
}

export interface Snapshot {
  time: number;
  round: number;
  startRound: number;
  state: RoundState;
  stateTimer: number;
  // rodada infernal em andamento (névoa vermelha, só cães)
  hell: boolean;
  // Carrasco vivo: fração da vida e se ainda tem o capacete
  boss: { hp: number; armor: boolean } | null;
  // ritual do Bispo (só na Cidade): velas pretas acesas e em que pé está
  ritual: { candles: boolean[]; state: 'idle' | 'summoning' | 'fight' | 'done' } | null;
  // Bispo vivo: fração da vida, fase (1 a 3) e se está imune (trocando de fase)
  bispo: { hp: number; phase: number; shield: boolean } | null;
  // mapa Rota: energia e ônibus (posição, para onde olha, parada atual e espera)
  power: boolean;
  bus: { x: number; z: number; yaw: number; stop: string | null; wait: number } | null;
  zombiesLeft: number;
  boards: number[];
  doors: string[];
  projectiles: { id: number; kind: ProjectileKind; x: number; y: number; z: number }[];
  // buracos negros do Vórtice abertos: centro, raio, tempo aberto e duração
  vortices: { id: number; x: number; y: number; z: number; r: number; t: number; dur: number }[];
  box: BoxState;
  powerups: { id: number; kind: PowerupKind; x: number; y: number; z: number; t: number }[];
  effects: { insta: number; double: number; firesale: number };
  forge: ForgeState;
  players: NetPlayer[];
  zombies: NetZombie[];
}

export type GameEvent =
  // blast = dano de explosão ou projétil (o navegador do atirador não viu o acerto, então marca agora)
  | { e: 'zhit'; zid: number; pid: string; part: HitPart; blast?: boolean }
  // fling = arremessado pelo vento (velocidade); sucked = engolido pelo vórtice; shock = morto pelo arpão
  | { e: 'zkill'; zid: number; pid: string; part: HitPart | 'knife'; x: number; y: number; z: number; yaw: number; kind: ZombieKind; look: number; fling?: [number, number, number]; sucked?: boolean; shock?: boolean }
  | { e: 'zattack'; zid: number }
  | { e: 'zrise'; zid: number; x: number; z: number }
  | { e: 'points'; pid: string; delta: number }
  | { e: 'phurt'; pid: string; dmg: number; fromX: number; fromZ: number; lava: boolean }
  | { e: 'pdown'; pid: string }
  | { e: 'previve'; pid: string; by: string }
  | { e: 'pdead'; pid: string }
  | { e: 'prespawn'; pid: string; x: number; z: number }
  | { e: 'shot'; pid: string; weapon: string }
  | { e: 'knife'; pid: string }
  | { e: 'roundStart'; round: number; hell: boolean }
  | { e: 'roundEnd'; round: number; hell: boolean }
  // Carrasco: chegou, perdeu o capacete, golpe no chão, corrente, investida, bateu na parede, morreu
  | { e: 'boss'; phase: 'spawn' | 'armor' | 'slam' | 'chain' | 'charge' | 'wall' | 'death'; zid: number; x: number; z: number; pid?: string }
  // a corrente pegou o jogador: o navegador dele o arrasta até perto do Carrasco
  | { e: 'bosspull'; pid: string; x: number; z: number; stop: number }
  // energia ligada (mapa Rota)
  | { e: 'power'; pid: string }
  // ônibus: chegou na parada, buzinou (vai sair) ou saiu
  | { e: 'bus'; phase: 'arrive' | 'honk' | 'leave'; zone: string }
  // Vulto sumiu na névoa (não morreu)
  | { e: 'zvanish'; zid: number }
  // atropelado pelo ônibus
  | { e: 'runover'; zid: number }
  // raio de fogo onde um Cão Infernal vai aparecer
  | { e: 'dogspawn'; zid: number; x: number; z: number }
  // Canhão de Vento: origem, direção e alcance do cone
  | { e: 'wind'; pid: string; x: number; y: number; z: number; dx: number; dy: number; dz: number; range: number }
  // Arpão Elétrico: pontos por onde o raio passou (x, y, z em sequência)
  | { e: 'arc'; pid: string; pts: number[] }
  // Vórtice abriu ou fechou
  | { e: 'vortex'; phase: 'open' | 'close'; id: number; x: number; y: number; z: number; r: number; dur: number }
  // ritual: uma vela preta acesa ou as três (o Bispo vem)
  | { e: 'ritual'; phase: 'candle' | 'start'; pid: string; candle: number }
  // Bispo: subiu da lava, trocou de fase, lançou fogo, marcou pilares (pts = x, z em sequência), chamou zumbis, morreu
  | { e: 'bispo'; phase: 'spawn' | 'phase' | 'orb' | 'pillar' | 'summon' | 'death'; zid: number; x: number; z: number; n?: number; pts?: number[] }
  | { e: 'gameover'; round: number }
  | { e: 'pjoin'; pid: string; name: string }
  | { e: 'pleave'; pid: string; name: string }
  | { e: 'refill'; pid: string; weapon: string }
  | { e: 'perk'; pid: string; perk: PerkId }
  | { e: 'deny'; pid: string; reason: 'pontos' | 'limite' | 'possui' | 'longe' | 'esgotado' | 'cheio' | 'desligada' | 'unica' | 'mira' }
  | { e: 'sight'; pid: string; weapon: string; sight: SightKind }
  | { e: 'forge'; phase: 'candle' | 'on' | 'start' | 'ready' | 'take' | 'expire'; pid: string | null; weapon: string | null }
  | { e: 'weapon'; pid: string; weapon: string; replaced: string | null }
  | { e: 'gear'; pid: string; item: 'grenades' | 'knife' }
  | { e: 'throw'; pid: string }
  | { e: 'boom'; x: number; y: number; z: number; kind: ProjectileKind | 'fire' }
  | { e: 'powerup'; kind: PowerupKind; pid: string }
  | { e: 'box'; phase: 'spin' | 'offer' | 'take' | 'crow' | 'arrive' | 'expire'; loc: number; pid: string | null; weapon: string | null }
  | { e: 'selfrevive'; pid: string }
  | { e: 'board'; entry: number; boards: number; kind: 'tear' | 'fix' }
  | { e: 'door'; id: string; pid: string }
  | { e: 'bank'; pid: string; action: 'deposit' | 'withdraw'; amount: number };

export type PlayerInput =
  | { t: 'state'; x: number; y: number; z: number; yaw: number; pitch: number; crouch: boolean; speed: number }
  | { t: 'shoot'; weapon: string; hits: { zid: number; part: HitPart }[] }
  | { t: 'knife'; zid: number | null }
  | { t: 'revive'; target: string | null }
  | { t: 'interact'; id: string; weapon: string }
  | { t: 'repair'; entry: number | null }
  | { t: 'grenade'; x: number; y: number; z: number; vx: number; vy: number; vz: number }
  | { t: 'launch'; weapon: string; x: number; y: number; z: number; dx: number; dy: number; dz: number };

export interface LobbyPlayer {
  id: string;
  name: string;
  slot: number;
  level: number;
}

export type ClientMsg =
  | PlayerInput
  // token = conta do placar online (opcional): o servidor registra a partida de co-op no nome dela
  // bank = saldo do banco guardado no navegador (limita os saques na partida)
  | { t: 'create'; name: string; level: number; startRound: number; mapId: string; token?: string; bank?: number }
  | { t: 'join'; code: string; name: string; level: number; token?: string; bank?: number }
  | { t: 'config'; startRound: number; mapId: string }
  | { t: 'start' }
  // anfitrião tira um jogador do lobby
  | { t: 'kick'; id: string }
  | { t: 'ping'; n: number };

export type ServerMsg =
  // url = endereço público do servidor (vai no convite), se ele souber
  | { t: 'welcome'; id: string; url?: string }
  // saiu da sala sem querer: tirado pelo anfitrião ou sala fechada
  | { t: 'left'; msg: string }
  | { t: 'lobby'; code: string; hostId: string; players: LobbyPlayer[]; startRound: number; mapId: string }
  | { t: 'started'; mapId: string; you: string }
  | { t: 'snap'; s: Snapshot }
  | { t: 'ev'; list: GameEvent[] }
  | { t: 'error'; msg: string }
  | { t: 'pong'; n: number };
