// Tenta derrubar o servidor do co-op com entradas ruins (mensagem gigante, endereço malformado).
// Uso: node tools/crash-probe.mjs [porta]   (com o servidor rodando nessa porta)
import WebSocket from 'ws';
const port = process.argv[2] ?? '3012';
const alive = async () => {
  try {
    return (await fetch(`http://localhost:${port}/api/placar`)).ok;
  } catch {
    return false;
  }
};
console.log('servidor no ar:', await alive());
// 1) mensagem maior que o limite do WebSocket
await new Promise((ok) => {
  const ws = new WebSocket(`ws://localhost:${port}`);
  ws.on('open', () => ws.send('x'.repeat(100 * 1024)));
  ws.on('close', ok);
  ws.on('error', ok);
  setTimeout(ok, 2000);
});
await new Promise((r) => setTimeout(r, 300));
console.log('depois da mensagem gigante:', await alive());
// 2) endereço com % malformado
try {
  await fetch(`http://localhost:${port}/%E0%A4%A`);
} catch {}
await new Promise((r) => setTimeout(r, 300));
console.log('depois do endereço malformado:', await alive());
