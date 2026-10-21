export type Vec3 = [number, number, number];

export type MaterialId =
  | 'asphalt'
  | 'sidewalk'
  | 'dirt'
  | 'concrete'
  // piso de concreto (pátios, galpões): placas com juntas, sem as manchas escorridas da parede
  | 'pavement'
  | 'brick'
  | 'brickDark'
  // Trincheira: madeira apodrecida e concreto rachado das paredes
  | 'rotWood'
  | 'brickDirty'
  | 'crackConcrete'
  | 'plaster'
  | 'wood'
  | 'woodDark'
  | 'boards'
  | 'floorWood'
  | 'tile'
  | 'roof'
  | 'ceiling'
  | 'metal'
  | 'rust'
  | 'glass'
  | 'glassLit'
  | 'trim'
  | 'paintYellow'
  | 'paintWhite'
  | 'carPaint'
  | 'tire'
  | 'lamp'
  | 'lava'
  | 'awning'
  | 'sandbag'
  | 'stone'
  | 'neon'
  // lama molhada da Terra de Ninguém (Trincheira)
  | 'mud'
  // pedra com runas gravadas (Escavação e Câmara Antiga) e aço rebitado (tanque, colossos)
  | 'rune'
  | 'rivet';

// Um bloco é ao mesmo tempo visual e colisão (quando solid=true).
// Blocos sólidos são sempre alinhados aos eixos; só os decorativos podem girar.
export interface Block {
  min: Vec3;
  max: Vec3;
  mat: MaterialId;
  solid: boolean;
  rot?: Vec3;
  tint?: number;
  // variação de brilho por bloco (ruído, 0,8 a 1,2): o navegador põe como cor de vértice, sem gerar material novo
  shade?: number;
  hidden?: boolean;
  // barreira invisível das barricadas: bloqueia gente, mas tiros passam
  bulletThrough?: boolean;
  // faz parte de uma porta/entulho comprável: some quando a porta abre
  door?: string;
}

export type LightKind = 'fire' | 'lamp' | 'lava' | 'interior' | 'machine';

export interface LightDef {
  pos: Vec3;
  color: number;
  intensity: number;
  distance: number;
  kind: LightKind;
  // luz de máquina de bebida (apaga sem energia no mapa Rota)
  perk?: boolean;
  // Trincheira: índice do gerador que alimenta a luz (apaga com ele desligado)
  gen?: number;
}

export interface SignDef {
  pos: Vec3;
  w: number;
  h: number;
  normal: [number, number];
  text: string;
  fg: string;
  bg: string;
  glow?: boolean;
  door?: string;
  // desenho a giz de uma arma/item (id da arma, 'grenade' ou 'knife') em vez de letreiro
  chalk?: string;
}

export type P2 = [number, number];

export interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

// Objeto com que o jogador interage pela tecla F.
export interface Interactable {
  id: string;
  kind: 'ammo' | 'perk' | 'door' | 'weapon' | 'grenade' | 'knife' | 'box' | 'forge' | 'candle' | 'bank' | 'sight' | 'power' | 'ritual'
    // Trincheira
    | 'generator' | 'fizz' | 'tank' | 'shovel' | 'mound' | 'part' | 'bench' | 'gramofone' | 'disco'
    | 'portal' | 'crystal' | 'staffPedestal' | 'altar' | 'tabua' | 'tabuaAltar' | 'challenge' | 'missao' | 'ring' | 'cabine';
  perk?: import('../perks').PerkId;
  door?: string;
  weapon?: string;
  box?: number;
  candle?: number;
  bank?: 'deposit' | 'withdraw';
  sight?: import('../weapons').SightKind;
  // ponto onde o jogador fica para usar (frente do objeto)
  use: [number, number];
  y: number;
  // Trincheira: qual peça, gerador, monte, elemento etc. (índice ou chave)
  ref?: string;
  // alcance de uso em metros (padrão 1,9 no navegador e 2,6 na simulação)
  reach?: number;
  // altura mínima dos pés para usar (peça que só se pega de cima do tanque)
  minY?: number;
}

// Entrada de zumbis com tábuas (barricada). (nx, nz) aponta para dentro da área jogável.
export interface Entry {
  id: number;
  x: number;
  z: number;
  nx: number;
  nz: number;
  w: number;
  // janela de um prédio fechado: só vira entrada de zumbis depois que essa porta abre
  area?: string;
}

export const ENTRY_BOARDS = 6;

export function entryPoints(e: Entry) {
  return {
    outside: [e.x - e.nx * 2.4, e.z - e.nz * 2.4] as [number, number],
    window: [e.x - e.nx * 0.55, e.z - e.nz * 0.55] as [number, number],
    inside: [e.x + e.nx * 0.85, e.z + e.nz * 0.85] as [number, number],
  };
}

// Porta ou entulho que abre uma área por pontos.
export interface DoorDef {
  id: string;
  name: string;
  cost: number;
  // power = abre sozinha quando a energia liga (não se compra)
  kind: 'door' | 'debris' | 'power';
}

// Parada do mapa grande: área iluminada com nome. Fora de todas as paradas é névoa.
export interface Zone {
  id: string;
  name: string;
  rect: Rect;
}

// Rota do ônibus: caminho fechado (pontos no chão) e as paradas (índice do ponto no caminho).
export interface BusRoute {
  path: [number, number][];
  stops: { at: number; zone: string }[];
}

// Local possível da Caixa Misteriosa: centro, para onde a frente olha e nome.
export interface BoxSpot {
  x: number;
  z: number;
  nx: number;
  nz: number;
  name: string;
}

// Vegetação e pedras desenhadas em lote pelo navegador (só visual; a colisão de troncos e pedras vai em blocos escondidos).
export type FoliageKind = 'pine' | 'oak' | 'bush' | 'grass' | 'corn' | 'rock' | 'stump';
export interface Foliage {
  kind: FoliageKind;
  x: number;
  z: number;
  // escala (1 = tamanho normal do tipo) e giro em torno do eixo vertical
  s: number;
  r: number;
}

// Ponto onde zumbis surgem da terra; area = porta que precisa estar aberta (null = sempre).
// Com uma lista, basta qualquer uma das portas estar aberta.
export interface SpawnPoint {
  x: number;
  z: number;
  area: string | string[] | null;
  // Trincheira: letra do grupo (TrincheiraData.groups) onde fica; um ponto também vale se há jogador vivo no grupo
  zone?: string;
}

// Tipo de chão em grade de 1 m (som dos passos): d = terra, h = duro, w = madeira, m = lama
export interface SurfaceGrid {
  ox: number;
  oz: number;
  w: number;
  h: number;
  data: string;
}

export interface MapDef {
  id: string;
  name: string;
  bounds: Rect;
  blocks: Block[];
  lights: LightDef[];
  signs: SignDef[];
  fires: Vec3[];
  lava: Rect[];
  playerSpawns: [number, number][];
  zombieSpawns: SpawnPoint[];
  interactables: Interactable[];
  doors: DoorDef[];
  entries: Entry[];
  boxSpots: BoxSpot[];
  // Forja: ponto da bigorna (arma flutua aqui), boca da fornalha e velas do ritual
  forge: { anvil: Vec3; mouth: Vec3; mouthNormal: [number, number]; candles: Vec3[] };
  // ritual secreto (Cidade): velas pretas (chama em cima de cada uma) e lugares onde o Bispo aparece (o primeiro é onde ele sobe)
  ritual?: { candles: Vec3[]; arena: [number, number][] };
  // ---------- mapas grandes (Rota) ----------
  zones?: Zone[];
  bus?: BusRoute;
  // bebidas e Forja só funcionam com a energia ligada (alavanca 'power')
  perksNeedPower?: boolean;
  forgeNeedsPower?: boolean;
  // Vultos atacam quem anda na névoa (fora das paradas)
  fogCreatures?: boolean;
  // névoa nas paradas e na estrada (padrão: a da Cidade)
  fogDensity?: number;
  fogRoad?: number;
  // cor da névoa nas paradas e na estrada (padrão: a da Cidade)
  fogColor?: number;
  fogRoadColor?: number;
  // árvores, moitas, capim, milharal e pedras
  foliage?: Foliage[];
  // áreas com névoa rasteira (cemitério)
  mist?: Rect[];
  // até onde (m) os zumbis acham caminho em volta dos jogadores
  navRange?: number;
  // chão de cada lugar (sem isso o navegador adivinha pelo mapa)
  surface?: SurfaceGrid;
  // subtítulo da abertura (padrão: "Algum lugar no interior")
  place?: string;
  // céu: cor do alto e do brilho do sol (padrão: fim de tarde alaranjado)
  // warm: faixa quente logo acima do horizonte (opcional)
  sky?: { top: number; sun: number; warm?: number };
  // ---------- Trincheira ----------
  // chefão do mapa (padrão: Carrasco); sem rodada infernal de cães
  boss?: 'carrasco' | 'blindado';
  hellRounds?: boolean;
  // itens que podem cair dos zumbis neste mapa (padrão: os de sempre, sem o Sangue Morto)
  powerupPool?: import('../powerups').PowerupKind[];
  // armas que não saem na Caixa Misteriosa
  boxExclude?: string[];
  // bebidas a mais que a Fonte da Sorte deste mapa pode dar (as máquinas fixas nunca as vendem)
  fizzExtra?: import('../perks').PerkId[];
  // arma com que o jogador começa e renasce (padrão: a pistola .45)
  startWeapon?: string;
  // armas a mais no sorteio da Caixa Misteriosa deste mapa: [id, peso]
  boxExtra?: [string, number][];
  // a Forja só sobe com os 6 geradores ligados
  forgeNeedsGenerators?: boolean;
  // gerador (índice) que alimenta cada bebida fixa
  perkGen?: Partial<Record<import('../perks').PerkId, number>>;
  // locais da Fonte da Sorte (mesmo formato dos da Caixa); o gerador do local fica em trincheira.fizzGen
  fizzSpots?: BoxSpot[];
  // tudo o mais da Trincheira (pontos, portais, Câmara Antiga...)
  trincheira?: TrincheiraData;
}

// Retângulo [minX, minZ, maxX, maxZ]
export type R4 = [number, number, number, number];

export type Element4 = 'fogo' | 'gelo' | 'vento' | 'raio';

// Dados fixos da Trincheira, montados pelo construtor do mapa (navegador e servidor têm os mesmos).
export interface TrincheiraData {
  // cabines dos colossos (C4): 3 salas de 6 x 6 m fora do mapa; c = centro, r = retângulo interno [x0, z0, x1, z1]
  cabins: { id: 'atlas' | 'golias' | 'tita'; c: P2; r: R4 }[];
  // área (largura x altura em m²) de parede por estilo e material: confere a variedade das paredes (ticket B5)
  wallMix?: Record<string, Record<string, number>>;
  // 6 geradores: centro, raio do círculo, nome da área
  gens: { x: number; z: number; r: number; name: string }[];
  // gerador de cada local da Fonte da Sorte (mesma ordem de MapDef.fizzSpots)
  fizzGen: number[];
  // grade de 1 m com a área de cada ponto: p posto, c casamata, e estação, o oficina, v vala, q quartel, i igreja, l lama, m Câmara Antiga, . fora
  groups: { ox: number; oz: number; w: number; h: number; data: string };
  // para cada letra de grupo, as portas que liberam (null = sempre aberta)
  groupDoor: Record<string, string | string[] | null>;
  // pegadas dos colossos (a ordem da lista de cada colosso vai de norte a sul, ou de oeste a leste)
  feet: { id: string; robot: 'atlas' | 'golias' | 'tita'; r: R4 }[];
  // pontos de cavar: 18 montes comuns seguidos de 3 de gelo; pás espetadas
  mounds: P2[];
  shovels: P2[];
  // bancadas
  benches: P2[];
  // tanque: laço fechado, paradas (índice no caminho) e alavanca
  tank: { path: P2[]; stops: { at: number; zone: 'estacao' | 'igreja' | 'norte' }[]; lever: P2; leverNormal: P2 };
  // Escavação: centro do poço e raio do anel
  ring: { c: P2; r: number; hole: number };
  // túneis dos portais: boca (teletransporta), laje (onde se toca o disco), saída (onde se volta)
  portals: { el: Element4; mouth: P2; slab: P2; exit: P2; r: number }[];
  // Câmara Antiga: salão e alcovas (por elemento), portal de volta, pedestal do cristal, altar
  chamber: {
    center: P2;
    hall: number;
    alcoves: { el: Element4; c: P2; back: P2; crystal: P2; altar: P2 }[];
    // placas numeradas do enigma do Raio (posição no mundo; ficam na alcova do Raio)
    plates: [number, number, number][];
  };
  // Mesa dos Cajados: um pedestal por elemento
  staffTable: { el: Element4; x: number; z: number }[];
  // alvos dos enigmas dos cajados
  chests: P2[];
  tombstones: P2[];
  domes: P2[];
  // altar da Tábua de Pedra (Igreja) e onde ela fica (Cripta)
  tabuaAltar: P2;
  // baús de desafios
  challengeChests: P2[];
  // peças com mais de um local (sorteia um): chave -> locais
  pickups: Record<string, P2[]>;
  // peça do Raio que só se pega de cima do tanque: ponto no caminho
  tankPart: P2;
  // pegadas ou áreas onde caixotes de peças do Vento abrem
  windCrates: P2[];
  // a Câmara fica fora do mapa principal: retângulo andável da Câmara
  chamberRect: R4;
}
