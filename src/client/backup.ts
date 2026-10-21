// Cópia do progresso (nível, banco, recordes, opções). Sem servidor, tudo fica só neste navegador: limpar os dados do
// navegador apaga o progresso. Por isso o jogador pode salvar um arquivo e trazê-lo de volta (ou levar para outro computador).

const PREFIX = 'zomba.';
const MARK = 'zomba-progresso';
// a conta do placar online (token) não vai para o arquivo
const SKIP = new Set(['zomba.account']);

export function exportProgress(): string {
  const data: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith(PREFIX) && !SKIP.has(k)) data[k] = localStorage.getItem(k) ?? '';
    }
  } catch {
    // sem armazenamento: arquivo vazio
  }
  return JSON.stringify({ marca: MARK, quando: new Date().toISOString(), dados: data }, null, 1);
}

export function downloadProgress() {
  const blob = new Blob([exportProgress()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `zomba-progresso-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// devolve quantos itens foram restaurados, ou um texto de erro
export function importProgress(text: string): number | string {
  let j: { marca?: unknown; dados?: unknown };
  try {
    j = JSON.parse(text);
  } catch {
    return 'O arquivo não é um progresso do Zomba.';
  }
  if (j?.marca !== MARK || !j.dados || typeof j.dados !== 'object') return 'O arquivo não é um progresso do Zomba.';
  const entries = Object.entries(j.dados as Record<string, unknown>).filter(([k, v]) => k.startsWith(PREFIX) && !SKIP.has(k) && typeof v === 'string');
  if (!entries.length) return 'O arquivo não tem nenhum progresso guardado.';
  // cada valor tem de ser JSON válido (é assim que o jogo lê); um arquivo estragado não pode derrubar o jogo no próximo início
  for (const [, v] of entries) {
    try {
      JSON.parse(v as string);
    } catch {
      return 'O arquivo está estragado e não foi usado.';
    }
  }
  try {
    for (const [k, v] of entries) localStorage.setItem(k, v as string);
  } catch {
    return 'Não foi possível gravar no navegador (armazenamento bloqueado).';
  }
  return entries.length;
}
