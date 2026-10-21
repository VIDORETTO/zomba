// Dicas de primeira vez (Trincheira): uma linha na primeira vez que o jogador chega perto de uma pá, gerador, tanque, peça, bancada
// ou monte de terra. O que já foi mostrado fica guardado no navegador; se o armazenamento falhar, o jogo segue (a dica só se repete
// em outra partida). A opção "Dicas" nos Controles desliga tudo.

export const TIP_KEY = 'zomba.tips';

export const TIP_TEXT: Record<string, string> = {
  shovel: 'Pegue a pá e segure <b>F</b> nos montes de terra.',
  generator: 'Fique dentro do círculo até o gerador ligar: com um aliado ele liga mais rápido.',
  tank: 'A alavanca chama o tanque: suba nele para atravessar a lama.',
  part: 'Peças soltas se pegam com <b>F</b>: leve-as até uma bancada.',
  bench: 'Na bancada, segure <b>F</b> para montar as peças que o grupo já tem.',
  mound: 'Com a pá na mão, segure <b>F</b> no monte de terra para cavar.',
};

export class Tips {
  enabled = true;
  // o que já apareceu nesta partida (para os testes e para a conferência)
  readonly log: string[] = [];
  private seen = new Set<string>();

  constructor() {
    try {
      const v = localStorage.getItem(TIP_KEY);
      if (v) this.seen = new Set(JSON.parse(v) as string[]);
    } catch {
      // sem armazenamento: começa vazio
    }
  }

  // true se a dica `id` deve aparecer agora (primeira vez e opção ligada); marca como vista
  take(id: string): boolean {
    if (!this.enabled || this.seen.has(id) || !TIP_TEXT[id]) return false;
    this.seen.add(id);
    this.log.push(id);
    try {
      localStorage.setItem(TIP_KEY, JSON.stringify([...this.seen]));
    } catch {
      // idem
    }
    return true;
  }

  // esquece o que já foi mostrado (opção de recomeçar as dicas e os testes)
  reset() {
    this.seen.clear();
    this.log.length = 0;
    try {
      localStorage.removeItem(TIP_KEY);
    } catch {
      // idem
    }
  }
}
