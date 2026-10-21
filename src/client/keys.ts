// Ações do jogador e as teclas de cada uma (o jogador troca nas opções). Cada ação tem uma tecla principal
// e uma alternativa ('' = nenhuma). Códigos = KeyboardEvent.code; mouse = 'Mouse0'..; roda = 'WheelUp'/'WheelDown'.

export type Action =
  | 'forward' | 'back' | 'left' | 'right' | 'sprint' | 'jump' | 'crouch' | 'crouchHold'
  | 'fire' | 'aim' | 'reload' | 'use' | 'grenade' | 'artillery' | 'knife'
  | 'weapon1' | 'weapon2' | 'weapon3' | 'nextWeapon' | 'prevWeapon';

export type KeyMap = Record<Action, [string, string]>;

export const ACTIONS: { id: Action; label: string; group: string }[] = [
  { id: 'forward', label: 'Andar para a frente', group: 'Movimento' },
  { id: 'back', label: 'Andar para trás', group: 'Movimento' },
  { id: 'left', label: 'Andar para a esquerda', group: 'Movimento' },
  { id: 'right', label: 'Andar para a direita', group: 'Movimento' },
  { id: 'sprint', label: 'Correr', group: 'Movimento' },
  { id: 'jump', label: 'Pular', group: 'Movimento' },
  { id: 'crouch', label: 'Agachar (alternar)', group: 'Movimento' },
  { id: 'crouchHold', label: 'Agachar (segurar)', group: 'Movimento' },
  { id: 'fire', label: 'Atirar', group: 'Combate' },
  { id: 'aim', label: 'Mirar', group: 'Combate' },
  { id: 'reload', label: 'Recarregar', group: 'Combate' },
  { id: 'grenade', label: 'Granada', group: 'Combate' },
  { id: 'artillery', label: 'Granada de Artilharia', group: 'Combate' },
  { id: 'knife', label: 'Faca', group: 'Combate' },
  { id: 'use', label: 'Comprar, abrir, usar, reanimar', group: 'Combate' },
  { id: 'weapon1', label: 'Arma 1', group: 'Armas' },
  { id: 'weapon2', label: 'Arma 2', group: 'Armas' },
  { id: 'weapon3', label: 'Arma 3 (com a Mula)', group: 'Armas' },
  { id: 'nextWeapon', label: 'Próxima arma', group: 'Armas' },
  { id: 'prevWeapon', label: 'Arma anterior', group: 'Armas' },
];

export const DEFAULT_KEYS: KeyMap = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space', ''],
  crouch: ['KeyC', ''],
  crouchHold: ['ControlLeft', ''],
  fire: ['Mouse0', ''],
  aim: ['Mouse2', ''],
  reload: ['KeyR', ''],
  use: ['KeyF', ''],
  grenade: ['KeyG', ''],
  artillery: ['Digit4', ''],
  knife: ['KeyV', 'KeyE'],
  weapon1: ['Digit1', ''],
  weapon2: ['Digit2', ''],
  weapon3: ['Digit3', ''],
  nextWeapon: ['WheelDown', ''],
  prevWeapon: ['WheelUp', ''],
};

// Esc abre o menu; não pode virar tecla de ação.
export const RESERVED = new Set(['Escape']);

// Junta o que está salvo com o padrão (ação nova ganha a tecla padrão).
export function loadKeys(saved?: Partial<Record<string, string[]>> | null): KeyMap {
  const out = {} as KeyMap;
  for (const { id } of ACTIONS) {
    const s = saved?.[id];
    out[id] = Array.isArray(s) && s.length === 2 && s.every((c) => typeof c === 'string' && !RESERVED.has(c))
      ? [s[0], s[1]]
      : [...DEFAULT_KEYS[id]];
  }
  return out;
}

// Põe a tecla na ação (principal = slot 0, alternativa = 1). Se ela já estava em outra ação, as duas trocam
// (a outra fica com a tecla que esta tinha), para nenhuma ação ficar sem tecla sem o jogador perceber.
// Devolve a ação que perdeu a tecla, se houver.
export function bindKey(keys: KeyMap, action: Action, slot: 0 | 1, code: string): Action | null {
  const old = keys[action][slot];
  let moved: Action | null = null;
  for (const { id } of ACTIONS) {
    for (const k of [0, 1] as const) {
      if (keys[id][k] === code && !(id === action && k === slot)) {
        keys[id][k] = id === action ? '' : old;
        if (id !== action) moved = id;
      }
    }
  }
  keys[action][slot] = code;
  return moved;
}

const NAMES: Record<string, string> = {
  Mouse0: 'Botão esquerdo', Mouse1: 'Botão do meio', Mouse2: 'Botão direito', Mouse3: 'Botão lateral 1', Mouse4: 'Botão lateral 2',
  WheelUp: 'Roda para cima', WheelDown: 'Roda para baixo',
  Space: 'Espaço', ShiftLeft: 'Shift', ShiftRight: 'Shift dir.', ControlLeft: 'Ctrl', ControlRight: 'Ctrl dir.',
  AltLeft: 'Alt', AltRight: 'Alt Gr', Tab: 'Tab', CapsLock: 'Caps Lock', Enter: 'Enter', Backspace: 'Backspace',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: "'", Minus: '-', Equal: '=',
  BracketLeft: '´', BracketRight: '[', Backslash: ']', Semicolon: 'Ç', Quote: '~', Comma: ',', Period: '.', Slash: ';',
  IntlBackslash: '\\', IntlRo: '/', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'Page Up', PageDown: 'Page Down',
};

// Nome que o jogador reconhece ('KeyF' -> 'F', 'Digit1' -> '1', 'Numpad4' -> 'Num 4').
export function keyName(code: string): string {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

// Nome da tecla de uma ação para os avisos na tela ('F', ou 'F / E' se tiver as duas).
export function actionKey(keys: KeyMap, action: Action): string {
  const [a, b] = keys[action];
  return a ? keyName(a) : keyName(b);
}
