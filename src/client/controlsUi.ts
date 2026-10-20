import { ACTIONS, DEFAULT_KEYS, RESERVED, bindKey, keyName, loadKeys, type Action, type KeyMap } from './keys';

// Editor de teclas: uma linha por ação com a tecla principal e a alternativa. Clicou num botão, a próxima
// tecla, botão do mouse ou giro da roda vira a tecla daquela ação. Esc cancela; Delete/Backspace apaga.
// Usado no menu principal e no menu de pausa.
export function controlsEditor(box: HTMLElement, start: KeyMap, onChange: (keys: KeyMap) => void): () => void {
  const keys = loadKeys(start);
  let stop: (() => void) | null = null;
  const note = document.createElement('p');
  note.className = 'keys-note muted';

  const render = () => {
    let group = '';
    let html = '<table class="keys"><thead><tr><th>Ação</th><th>Principal</th><th>Alternativa</th></tr></thead><tbody>';
    for (const a of ACTIONS) {
      if (a.group !== group) {
        group = a.group;
        html += `<tr class="keys-group"><td colspan="3">${group}</td></tr>`;
      }
      html += `<tr><td>${a.label}</td>${([0, 1] as const)
        .map((slot) => `<td><button type="button" class="keybtn ${keys[a.id][slot] ? '' : 'empty'}" data-a="${a.id}" data-s="${slot}">${keys[a.id][slot] ? keyName(keys[a.id][slot]) : '—'}</button></td>`)
        .join('')}</tr>`;
    }
    html += '</tbody></table>';
    box.innerHTML = `<div class="keys-scroll">${html}</div>`;
    const foot = document.createElement('div');
    foot.className = 'keys-foot';
    foot.append(note);
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'btn ghost small';
    reset.textContent = 'Restaurar padrão';
    reset.addEventListener('click', () => {
      for (const a of ACTIONS) keys[a.id] = [...DEFAULT_KEYS[a.id]];
      note.textContent = 'Teclas padrão restauradas.';
      onChange(loadKeys(keys));
      render();
    });
    foot.append(reset);
    box.append(foot);
    box.querySelectorAll<HTMLButtonElement>('.keybtn').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      listen(b, b.dataset.a as Action, Number(b.dataset.s) as 0 | 1);
    }));
  };

  const listen = (btn: HTMLButtonElement, action: Action, slot: 0 | 1) => {
    stop?.();
    box.querySelectorAll('.keybtn.wait').forEach((x) => x.classList.remove('wait'));
    btn.classList.add('wait');
    btn.textContent = 'Aperte…';
    note.textContent = 'Aperte a tecla ou o botão do mouse. Esc cancela, Delete apaga.';
    const done = (code: string | null) => {
      stop?.();
      if (code === '') {
        keys[action][slot] = '';
        note.textContent = 'Tecla apagada.';
      } else if (code) {
        const moved = bindKey(keys, action, slot, code);
        const label = ACTIONS.find((x) => x.id === moved)?.label;
        note.textContent = moved ? `${keyName(code)} estava em "${label}": as duas trocaram de tecla.` : `${keyName(code)} agora é "${ACTIONS.find((x) => x.id === action)!.label}".`;
      } else note.textContent = '';
      onChange(loadKeys(keys));
      render();
    };
    const kd = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') return done(null);
      if (e.code === 'Delete' || e.code === 'Backspace') return done('');
      if (RESERVED.has(e.code)) return;
      done(e.code);
    };
    const md = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      done(`Mouse${e.button}`);
    };
    const wh = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      done(e.deltaY > 0 ? 'WheelDown' : 'WheelUp');
    };
    const ctx = (e: Event) => e.preventDefault();
    // o clique que abriu a escuta não conta: só a partir do próximo evento
    setTimeout(() => {
      window.addEventListener('keydown', kd, true);
      window.addEventListener('mousedown', md, true);
      window.addEventListener('wheel', wh, { capture: true, passive: false });
      window.addEventListener('contextmenu', ctx, true);
    }, 0);
    stop = () => {
      window.removeEventListener('keydown', kd, true);
      window.removeEventListener('mousedown', md, true);
      window.removeEventListener('wheel', wh, true);
      window.removeEventListener('contextmenu', ctx, true);
      stop = null;
    };
  };

  render();
  // quem abriu o editor chama isto ao fechar (para de escutar)
  return () => stop?.();
}

// true enquanto o editor espera uma tecla (o menu não deve fechar com o Esc dessa hora)
export function isListening(box: HTMLElement): boolean {
  return !!box.querySelector('.keybtn.wait');
}
