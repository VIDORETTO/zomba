import type { PerkId } from './perks';
import type { PowerupKind } from './powerups';
import type { HitPart, SightKind } from './weapons';

export type PlayerLife = 'alive' | 'downed' | 'dead';
// orb = bola de fogo do Bispo
// orb = bola de fogo do Bispo; fogo = bola do Cajado de Fogo; artilharia = Granada de Artilharia; orbRaio = bola elétrica do Cajado de Raio desperto
export type ProjectileKind = 'grenade' | 'launcher' | 'bolt' | 'ray' | 'rocket' | 'blade' | 'drum' | 'wind' | 'arc' | 'vortex' | 'orb' | 'fogo' | 'artilharia' | 'orbRaio';

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
export type ZombieKind = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; // anda, corre, dispara, Cão Infernal, Carrasco, Vulto, Bispo, Blindado, Cruzado

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
  // ---------- Trincheira (só existem nesse mapa) ----------
  // pá, Pá Dourada, Capacete Dourado
  shovel?: boolean;
  goldShovel?: boolean;
  helmet?: boolean;
  // vida do Escudo de Trincheira (0 = sem escudo) e se ele está na mão (senão fica nas costas)
  shield?: number;
  shieldHand?: boolean;
  // cabine do colosso em que o jogador está (senão ausente)
  cabine?: 'atlas' | 'golias' | 'tita';
  // Punho de Ferro no lugar da faca
  punho?: boolean;
  // Granadas de Artilharia
  artilharia?: number;
  // segundos que faltam de Sangue Morto
  zblood?: number;
  // progresso dos 4 desafios pessoais e os já retirados
  challenges?: number[];
  claimed?: boolean[];
  // vaga extra de bebida (4º desafio)
  extraPerk?: boolean;
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
  // sistemas da Trincheira (só nesse mapa)
  tr?: TrincheiraSnap;
}

export type Weather = 'limpo' | 'chuva' | 'neve';
export type Element = 'fogo' | 'gelo' | 'vento' | 'raio';

export interface TrGen {
  on: boolean;
  // 0 a 1 enquanto captura
  progress: number;
  capturing: boolean;
  // Cruzados atacando
  attacked: boolean;
}

// Colosso: id, fase (aviso antes de entrar, passos, pausa), passo atual (0 a 3), parte do passo e direção
export interface TrRobot {
  id: 'atlas' | 'golias' | 'tita';
  phase: 'aviso' | 'passos';
  // aviso: segundos que faltam para entrar
  warn: number;
  // índice da pegada onde o pé atual vai pisar (0 = a primeira na direção do caminho)
  step: number;
  sub: 'sobe' | 'move' | 'desce' | 'fica';
  // 0 a 1 dentro da parte do passo
  t: number;
  // 1 = do começo da lista de pegadas para o fim; -1 = ao contrário
  dir: 1 | -1;
}

export type StaffState = 'faltando' | 'pedestal' | 'mao' | 'altar';

export interface TrStaff {
  el: Element;
  st: StaffState;
  // versão desperta
  awake: boolean;
  owner: string;
  // enchimento do altar (0 a 1) quando st = altar
  charge: number;
  // enigma resolvido e progresso (baús: abates de cada; lápides/domos: 0 ou 1; raio: quantas placas acertou)
  solved: boolean;
  puzzle: number[];
  // enigma do raio: sequência de placas que as lâmpadas mostram (1 a 6)
  seq: number[];
  // 2ª etapa: a esfera dos anéis da Escavação já foi acertada com o cajado deste elemento
  rings: boolean;
}

export interface TrincheiraSnap {
  gens: TrGen[];
  weather: Weather;
  // Forja já subiu
  forjaUp: boolean;
  // Fonte da Sorte: local atual e estado ('idle' | 'spin')
  fizz: { loc: number; state: 'idle' | 'spin'; t: number; uses: number };
  // montes de terra ativos (índices de TrincheiraData.mounds)
  mounds: number[];
  // tanque
  tank: { x: number; z: number; yaw: number; state: 'parado' | 'volta' | 'espera'; stop: string | null; wait: number; cooldown: number };
  robot: TrRobot | null;
  // itens da equipe (chaves)
  team: string[];
  // peças e coisas no chão que dá para pegar agora (ids de interactables); peças soltas por zumbis/Blindado em drops
  pick: string[];
  drops: { id: string; key: string; x: number; z: number }[];
  // caixotes das peças do Vento já abertos
  windOpen: boolean;
  build: {
    escudo: { built: boolean; bench: number };
    drone: { built: boolean; bench: number; state: 'banco' | 'voo' | 'espera'; owner: string; t: number; x: number; y: number; z: number };
  };
  portals: boolean[];
  // local sorteado do Disco Negro (-1 = já pego)
  disco: number;
  staffs: TrStaff[];
  tabua: 'cripta' | 'equipe' | 'altar' | 'cheia';
  tabuaCharge: number;
  // missão principal
  missao: { step: number; count: number; t: number };
  // recaptura em andamento (Cruzados vivos)
  recapture: boolean;
  // anéis da Escavação: símbolo (0 fogo, 1 gelo, 2 vento, 3 raio) que cada um mostra na marca, e a esfera acesa do centro
  rings: number[];
  orb: Element | null;
  // cabines cujo prêmio já foi levado (ids dos colossos)
  cabinTaken: ('atlas' | 'golias' | 'tita')[];
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
  // by: id de quem reanimou, ou 'cajado' (disparo do cajado desperto); from: quem atirou (só no caso do cajado)
  | { e: 'previve'; pid: string; by: string; from?: string }
  | { e: 'bash'; pid: string }
  // um anel da Escavação girou 90° (pos = símbolo que ficou na marca)
  | { e: 'aneis'; pid: string; ring: number; pos: number }
  // choque da Faísca e onda da Casca Grossa (só efeito visual e som)
  | { e: 'bebida'; perk: 'faisca' | 'casca-grossa'; pid: string; x: number; z: number; r: number }
  | { e: 'pdead'; pid: string }
  | { e: 'prespawn'; pid: string; x: number; z: number }
  | { e: 'shot'; pid: string; weapon: string }
  | { e: 'knife'; pid: string }
  // boss: a rodada tem Blindado (Trincheira)
  | { e: 'roundStart'; round: number; hell: boolean; boss?: boolean }
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
  | { e: 'deny'; pid: string; reason: 'pontos' | 'limite' | 'possui' | 'longe' | 'esgotado' | 'cheio' | 'desligada' | 'unica' | 'mira' | 'trancado' | 'faltam' | 'ocupado' | 'aneis' }
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
  | { e: 'bank'; pid: string; action: 'deposit' | 'withdraw'; amount: number }
  // ---------- Trincheira ----------
  // gerador: ligou/desligou (on), começou a captura ou foi atacado pelos Cruzados
  | { e: 'gen'; gen: number; on: boolean; pid: string | null; phase: 'start' | 'cancel' | 'done' | 'lost' | 'attack' }
  | { e: 'forjaSobe' }
  | { e: 'clima'; weather: Weather; round: number }
  // Fonte da Sorte: girou, entregou, foi embora
  | { e: 'fizz'; phase: 'spin' | 'give' | 'leave' | 'arrive'; loc: number; pid: string | null; perk: PerkId | null }
  // cavar: resultado (powerup, granadas, pontos, zumbi, terra, arma, bebida, peça, capacete)
  | { e: 'dig'; pid: string; mound: number; result: 'powerup' | 'granadas' | 'pontos' | 'zumbi' | 'terra' | 'arma' | 'bebida' | 'peca' | 'capacete' | 'pa-dourada'; x: number; z: number; text: string }
  | { e: 'tank'; phase: 'chamado' | 'chegou' | 'sai' | 'volta' | 'pronto'; stop: string | null }
  // esmagado pelo tanque, queimado pelo lança-chamas dele
  | { e: 'esmaga'; zid: number }
  // colosso: buzina (vai entrar), pisada (pegada, quem morreu), entrou na cabine
  | { e: 'buzina'; robot: 'atlas' | 'golias' | 'tita'; dir: 1 | -1 }
  | { e: 'pisada'; robot: 'atlas' | 'golias' | 'tita'; foot: string; x: number; z: number; killed: string[]; zombies: number }
  // phase: 'entra' (levado à cabine), 'premio' (pegou o prêmio) ou 'volta' (de volta à pegada); x e z = para onde o navegador leva quem entra ou sai
  | { e: 'cabine'; pid: string; robot: 'atlas' | 'golias' | 'tita'; prize: string; phase?: 'entra' | 'premio' | 'volta'; x?: number; z?: number }
  // Cruzados: recaptura começou (gerador alvo), terminou
  | { e: 'recaptura'; phase: 'start' | 'win' | 'lose'; gen: number }
  // Blindado: chegou, lança-chamas (ligado/desligado), garra, salto, visor quebrou, morreu
  | { e: 'blindado'; phase: 'spawn' | 'flame' | 'claw' | 'jump' | 'visor' | 'death'; zid: number; x: number; z: number; pid?: string }
  // peça ou item da equipe pego; montagem concluída (escudo ou drone) e retirada
  | { e: 'peca'; pid: string; key: string }
  | { e: 'craft'; pid: string; what: 'escudo' | 'drone' | 'cajado'; phase: 'start' | 'done' | 'take' | 'expire' | 'drone-revive' | 'drone-leave'; el?: Element }
  // portal: aberto (música), teletransporte (ida e volta)
  | { e: 'portal'; el: Element; pid: string }
  | { e: 'teleporte'; pid: string; el: Element; to: 'camara' | 'tunel' }
  // alvo de enigma acertado
  | { e: 'alvo'; kind: 'bau' | 'lapide' | 'domo' | 'placa' | 'sola' | 'olho' | 'esfera'; idx: number; pid: string; ok: boolean }
  // cajado: montado, pego, devolvido, no altar, desperto; enigma resolvido
  | { e: 'cajado'; el: Element; phase: 'monta' | 'pega' | 'devolve' | 'altar' | 'cheio' | 'perde'; pid: string }
  | { e: 'desperto'; el: Element; pid: string }
  | { e: 'enigma'; el: Element }
  // Tábua de Pedra e Punho de Ferro
  | { e: 'tabua'; phase: 'pega' | 'altar' | 'cheia' | 'punho'; pid: string }
  | { e: 'desafio'; pid: string; idx: number; prize: string }
  // Granada de Artilharia: arremessada, bombas caindo (pontos x,z), fim
  | { e: 'artilharia'; phase: 'throw' | 'marca' | 'bomba'; pid: string; x: number; z: number }
  // missão principal
  | { e: 'missao'; step: number; phase: 'passo' | 'falha' | 'defesa' | 'fim'; text: string }
  // fogo do Cajado de Fogo carregado, nevasca, redemoinho, bola de raio (efeitos de área, só visuais)
  | { e: 'area'; kind: 'pilar' | 'nevasca' | 'redemoinho' | 'orbRaio' | 'choque'; x: number; y: number; z: number; r: number; dur: number }
  // queimadura, congelamento e fim do Sangue Morto em jogador/zumbi (só visuais)
  | { e: 'fx'; kind: 'queima' | 'congela' | 'estilhaca' | 'chama' | 'sangue'; zid?: number; pid?: string; x: number; y: number; z: number };

export type PlayerInput =
  | { t: 'state'; x: number; y: number; z: number; yaw: number; pitch: number; crouch: boolean; speed: number }
  // ray = origem e direção do tiro (para acertar alvos de enigma e olhos dos colossos)
  | { t: 'shoot'; weapon: string; hits: { zid: number; part: HitPart }[]; ray?: [number, number, number, number, number, number] }
  | { t: 'knife'; zid: number | null }
  // escudo na mão (liga/desliga) e pancada com ele
  | { t: 'shield'; on: boolean }
  | { t: 'bash' }
  // recarga começou com `ammo` tiros no pente (Faísca) / acabou de cair `h` metros (Casca Grossa)
  | { t: 'reload'; weapon: string; ammo: number }
  | { t: 'land'; h: number }
  | { t: 'revive'; target: string | null }
  | { t: 'interact'; id: string; weapon: string }
  | { t: 'repair'; entry: number | null }
  | { t: 'grenade'; x: number; y: number; z: number; vx: number; vy: number; vz: number }
  // charged = ataque carregado do cajado desperto (segurou o gatilho)
  | { t: 'launch'; weapon: string; x: number; y: number; z: number; dx: number; dy: number; dz: number; charged?: boolean }
  // segurar F num monte de terra ou numa bancada (id) ou soltar (null)
  | { t: 'hold'; id: string | null }
  // Granada de Artilharia
  | { t: 'artillery'; x: number; y: number; z: number; vx: number; vy: number; vz: number };

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
