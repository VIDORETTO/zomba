// Formato dos dados da planta da Trincheira (docs/trincheira/layout.json). Tudo em metros.

export type P2 = [number, number];
export type R4 = [number, number, number, number];

export interface TrincheiraLayout {
  _leia: string;
  // área = id da porta que libera (null = início; 'lama' = Terra de Ninguém)
  areas: { id: string; name: string; area: string | null; kind: 'chao' | 'tanque'; poly: P2[]; pillar?: R4 }[];
  feet: { id: string; robot: 'atlas' | 'golias' | 'tita'; area: string; r: R4 }[];
  mud: { id: string; width: number; path: P2[] }[];
  ring: { c: P2; r: number; hole: number };
  tankNorth: { poly: P2[] };
  tankPath: (P2 | [number, number, string])[];
  doors: { id: string; name: string; cost: number; gates: { at: P2; n: P2; w: number }[] }[];
  entries: { area: string; at: P2; n: P2 }[];
  points: {
    gen: Record<'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6', P2>;
    box: Record<'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6', P2>;
    fizz: Record<'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6', P2>;
    perk: Record<'folego' | 'reflexo' | 'couraca' | 'gatilho', P2>;
    forja: P2;
    gramofone: P2;
    disco: P2[];
    peca_fogo: P2[];
    peca_gelo: P2[];
    peca_raio: P2[];
    peca_vento: P2[];
    portal: Record<'fogo' | 'vento' | 'raio' | 'gelo', P2>;
    bau: P2[];
    lapide: P2[];
    domo: P2[];
    carroca: P2[];
    tabua: P2;
    altar_igreja: P2;
    desafio: P2[];
    escudo_rodas: P2[];
    escudo_trava: P2[];
    escudo_armacao: P2[];
    drone_cerebro: P2;
    drone_helice: P2;
    drone_corpo: P2[];
    pa: P2[];
    monte: P2[];
    bancada: P2[];
    spawn: P2[];
  };
}
