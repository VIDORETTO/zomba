export type Vec3 = [number, number, number];

export type MaterialId =
  | 'asphalt'
  | 'sidewalk'
  | 'dirt'
  | 'concrete'
  | 'brick'
  | 'brickDark'
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
  | 'neon';

// Um bloco é ao mesmo tempo visual e colisão (quando solid=true).
// Blocos sólidos são sempre alinhados aos eixos; só os decorativos podem girar.
export interface Block {
  min: Vec3;
  max: Vec3;
  mat: MaterialId;
  solid: boolean;
  rot?: Vec3;
  tint?: number;
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

export interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

// Objeto com que o jogador interage pela tecla F.
export interface Interactable {
  id: string;
  kind: 'ammo' | 'perk' | 'door' | 'weapon' | 'grenade' | 'knife' | 'box' | 'forge' | 'candle' | 'bank' | 'sight' | 'power';
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
}

// Entrada de zumbis com tábuas (barricada). (nx, nz) aponta para dentro da área jogável.
export interface Entry {
  id: number;
  x: number;
  z: number;
  nx: number;
  nz: number;
  w: number;
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

// Ponto onde zumbis surgem da terra; area = porta que precisa estar aberta (null = sempre).
export interface SpawnPoint {
  x: number;
  z: number;
  area: string | null;
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
  // até onde (m) os zumbis acham caminho em volta dos jogadores
  navRange?: number;
}
