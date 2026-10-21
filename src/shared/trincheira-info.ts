// Nomes, cores e textos da Trincheira usados pela simulação e pelo navegador.
import type { Element } from './protocol';

export const ELEMENT_LIST: Element[] = ['fogo', 'gelo', 'vento', 'raio'];

export const ELEMENTS: Record<Element, { name: string; color: string; hex: number; staff: string; awake: string }> = {
  fogo: { name: 'Fogo', color: '#ff7a2a', hex: 0xff7a2a, staff: 'cajado-fogo', awake: 'cajado-fogo-d' },
  gelo: { name: 'Gelo', color: '#6ab8ff', hex: 0x6ab8ff, staff: 'cajado-gelo', awake: 'cajado-gelo-d' },
  vento: { name: 'Vento', color: '#ffe14a', hex: 0xffe14a, staff: 'cajado-vento', awake: 'cajado-vento-d' },
  raio: { name: 'Raio', color: '#b06aff', hex: 0xb06aff, staff: 'cajado-raio', awake: 'cajado-raio-d' },
};

export const COLOSSI = {
  atlas: { name: 'Atlas', eye: '#ffd23a', eyeHex: 0xffd23a },
  golias: { name: 'Golias', eye: '#4aa8ff', eyeHex: 0x4aa8ff },
  tita: { name: 'Titã', eye: '#ff3a2a', eyeHex: 0xff3a2a },
} as const;

// Itens da equipe: chave -> nome e grupo (para o painel do canto da tela)
export interface TeamItem {
  name: string;
  group: 'escudo' | 'drone' | 'portal' | 'tabua' | Element | 'cristal';
}
export const TEAM_ITEMS: Record<string, TeamItem> = {
  'escudo-rodas': { name: 'Rodas do Escudo', group: 'escudo' },
  'escudo-trava': { name: 'Trava do Escudo', group: 'escudo' },
  'escudo-armacao': { name: 'Armação do Escudo', group: 'escudo' },
  'drone-cerebro': { name: 'Cérebro do Drone', group: 'drone' },
  'drone-helice': { name: 'Hélice do Drone', group: 'drone' },
  'drone-corpo': { name: 'Corpo do Drone', group: 'drone' },
  gramofone: { name: 'Gramofone', group: 'portal' },
  disco: { name: 'Disco Negro', group: 'portal' },
  tabua: { name: 'Tábua de Pedra', group: 'tabua' },
  artilharia: { name: '3 Granadas de Artilharia', group: 'tabua' },
};
for (const el of ELEMENT_LIST) {
  for (let i = 1; i <= 3; i++) TEAM_ITEMS[`${el}-${i}`] = { name: `Peça ${i} do Cajado de ${ELEMENTS[el].name}`, group: el };
  TEAM_ITEMS[`cristal-${el}`] = { name: `Cristal de ${ELEMENTS[el].name}`, group: 'cristal' };
}

export const SET_PARTS: Record<'escudo' | 'drone', string[]> = {
  escudo: ['escudo-rodas', 'escudo-trava', 'escudo-armacao'],
  drone: ['drone-cerebro', 'drone-helice', 'drone-corpo'],
};

export const CHALLENGE_TEXT = [
  { name: 'Matar 115 zumbis', prize: 'um item sai do baú' },
  { name: 'Estar no círculo quando 3 geradores terminarem de ligar', prize: '3 Granadas de Artilharia' },
  { name: '50 abates com tiro na cabeça', prize: 'Desintegrador' },
  { name: 'Chegar viva(o) ao fim da rodada 15', prize: '+1 vaga de bebida' },
];

export const MISSAO_STEPS = [
  'Despertar os 4 cajados',
  'Colocar os 4 cajados despertos na Mesa dos Cajados',
  'Colheita: 100 abates dentro do anel da Escavação',
  'Os olhos dos colossos: acerte cada um com Sangue Morto',
  'Defesa final: aperte F no poço',
  'Canção da Escavação concluída',
];

// resultados do monte de terra (id, chance acumulada): sorteados pela simulação
export const MOUND_ODDS: ['powerup' | 'granadas' | 'pontos' | 'zumbi' | 'terra' | 'arma' | 'bebida', number][] = [
  ['powerup', 0.25], ['granadas', 0.2], ['pontos', 0.18], ['zumbi', 0.15], ['terra', 0.12], ['arma', 0.07], ['bebida', 0.03],
];

// ids de interações (convenção do construtor do mapa)
export const ids = {
  gen: (i: number) => `gen-${i}`,
  fizz: (i: number) => `fizz-${i}`,
  tank: 'tank-lever',
  shovel: (i: number) => `pa-${i}`,
  mound: (i: number) => `monte-${i}`,
  part: (key: string, loc: number) => `part:${key}:${loc}`,
  bench: (i: number) => `bench-${i}`,
  portal: (el: Element) => `portal-${el}`,
  staff: (el: Element) => `staff-${el}`,
  altar: (el: Element) => `altar-${el}`,
  tabuaAltar: 'tabua-altar',
  challenge: (i: number) => `desafio-${i}`,
  poco: 'poco',
  ring: (i: number) => `anel-${i}`,
};
