// Bebidas de vantagem. Nomes, cores e efeitos próprios do Zomba.

export type PerkId = 'couraca' | 'folego' | 'reflexo' | 'gatilho' | 'passo' | 'mula';

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
};

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
};

export function perkPrice(id: PerkId, solo: boolean): number {
  const p = PERKS[id];
  return solo && p.soloPrice !== undefined ? p.soloPrice : p.price;
}
