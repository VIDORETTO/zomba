// Bebidas de vantagem. Nomes, cores e efeitos próprios do Zomba.

export type PerkId = 'couraca' | 'folego' | 'reflexo' | 'gatilho' | 'passo' | 'mula' | 'faisca' | 'olho-frio' | 'casca-grossa';

export interface PerkDef {
  id: PerkId;
  name: string;
  price: number;
  soloPrice?: number;
  color: string;
  icon: string;
  desc: string;
}

export const PERKS: Record<PerkId, PerkDef> = {
  couraca: { id: 'couraca', name: 'Couraça', price: 2500, color: '#b8352b', icon: 'C', desc: 'Vida de 100 para 250' },
  folego: { id: 'folego', name: 'Segundo Fôlego', price: 1500, soloPrice: 500, color: '#2fa39a', icon: 'F', desc: 'Reanima mais rápido; no solo, levanta sozinho' },
  reflexo: { id: 'reflexo', name: 'Reflexo', price: 3000, color: '#8a5cd6', icon: 'R', desc: 'Recarga 50% mais rápida' },
  gatilho: { id: 'gatilho', name: 'Gatilho', price: 2000, color: '#e39b22', icon: 'G', desc: 'Atira 33% mais rápido e causa 30% mais dano' },
  passo: { id: 'passo', name: 'Passo Firme', price: 2000, color: '#4aa3e0', icon: 'P', desc: 'Corre 10% mais rápido e pelo dobro do tempo' },
  mula: { id: 'mula', name: 'Mula', price: 4000, color: '#8f8a3a', icon: 'M', desc: 'Carrega uma 3ª arma' },
  // bebidas exclusivas da Fonte da Sorte (só nos mapas que as listam em MapDef.fizzExtra; nunca em máquina fixa)
  faisca: { id: 'faisca', name: 'Faísca', price: 1500, color: '#3ad8ff', icon: 'S', desc: 'Ao recarregar, um choque em volta; quanto mais vazio o pente, maior o dano' },
  'olho-frio': { id: 'olho-frio', name: 'Olho Frio', price: 1500, color: '#9fe6a0', icon: 'O', desc: 'Mira na cabeça: +25% de dano na cabeça e menos dispersão' },
  'casca-grossa': { id: 'casca-grossa', name: 'Casca Grossa', price: 1500, color: '#e0703a', icon: 'K', desc: 'Imune às próprias explosões; cair de alto solta uma onda de choque' },
};

// as 6 de sempre (máquinas, Bebida Grátis, prêmios) e as 3 que só saem da Fonte da Sorte
export const BASE_PERKS: PerkId[] = ['couraca', 'folego', 'reflexo', 'gatilho', 'passo', 'mula'];
export const FIZZ_PERKS: PerkId[] = ['faisca', 'olho-frio', 'casca-grossa'];

export const MAX_PERKS = 4;
export const SOLO_SELF_REVIVES = 3;
export const SELF_REVIVE_TIME = 4;

// Efeitos numéricos (usados pela simulação e pelo navegador)
export const PERK_FX = {
  couracaHealth: 250,
  folegoReviveMult: 0.5,
  reflexoReloadMult: 0.5,
  gatilhoFireMult: 0.75,
  gatilhoDamageMult: 1.3,
  passoSpeedMult: 1.1,
  passoStaminaMult: 2,
  // Faísca: raio do choque (m), espera entre choques (s) e dano (cresce com o pente vazio: 200 cheio ... 1200 vazio)
  faiscaRadius: 3,
  faiscaCooldown: 3,
  faiscaMinDamage: 200,
  faiscaMaxDamage: 1200,
  // Olho Frio: dano na cabeça, dispersão e quão baixo (m acima dos pés) o peito ainda conta como cabeça
  olhoHeadMult: 1.25,
  olhoSpreadMult: 0.7,
  olhoNeckY: 1.15,
  // Casca Grossa: queda mínima (m) para soltar a onda, raio da onda (m) e dano base
  cascaFall: 1.5,
  cascaRadius: 4,
  cascaDamage: 400,
};

export function perkPrice(id: PerkId, solo: boolean): number {
  const p = PERKS[id];
  return solo && p.soloPrice !== undefined ? p.soloPrice : p.price;
}
