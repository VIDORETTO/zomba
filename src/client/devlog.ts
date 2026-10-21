// Registro de partida para ajuste dos números da Trincheira (ticket F1). SÓ EM DESENVOLVIMENTO: este módulo só é importado
// dentro de `if (import.meta.env.DEV)`, então não entra na versão de produção (o teste confere pela marca abaixo).
export const MARCA_REGISTRO = 'zomba-registro-dev';

// baixa o registro como JSON (nome com a data); nada é enviado para servidor nenhum
export function baixarRegistro(log: unknown) {
  const blob = new Blob([JSON.stringify({ marca: MARCA_REGISTRO, quando: new Date().toISOString(), registro: log }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `trincheira-registro-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
