// Constantes e códigos de sala do co-op sem servidor (sem nada de navegador, para os testes de regra rodarem no Node).

// nome do "grupo" nos relés de encontro: só quem usa este jogo (e esta versão do protocolo) se enxerga
export const APP_ID = 'zomba-gvidoretto-coop';
// muda quando as mensagens deixam de ser compatíveis: quem estiver com a versão velha recebe um aviso para atualizar a página
export const PROTOCOL = 1;

// código da sala: sem letras e números que se confundem (0/O, 1/I)
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function newCode(): string {
  const buf = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(buf);
  let s = '';
  for (const n of buf) s += CODE_ALPHABET[n % CODE_ALPHABET.length];
  return s;
}

// aceita minúsculas, espaços e traços ao digitar ou colar o código
export function cleanCode(raw: string): string {
  return [...raw.toUpperCase()].filter((c) => CODE_ALPHABET.includes(c)).join('').slice(0, CODE_LENGTH);
}

