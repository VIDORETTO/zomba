// Mede o tempo de ida e volta (ping) até um servidor do Zomba pelo WebSocket.
// Uso: node tools/ping-server.mjs <link ou ws://...> [quantos]
import { WebSocket } from 'ws';
const url = (process.argv[2] ?? 'http://localhost:3001').replace(/^http/, 'ws');
const n = Number(process.argv[3] ?? 20);
const ws = new WebSocket(url, { headers: { origin: url.replace(/^ws/, 'http') } });
const times = [];
ws.on('message', (d) => {
  const m = JSON.parse(String(d));
  if (m.t === 'welcome' || m.t === 'pong') {
    if (m.t === 'pong') times.push(performance.now() - m.n);
    if (times.length >= n) {
      times.sort((a, b) => a - b);
      console.log(`ping: menor ${times[0].toFixed(0)} ms, mediana ${times[n >> 1].toFixed(0)} ms, maior ${times[n - 1].toFixed(0)} ms`);
      ws.close();
    } else setTimeout(() => ws.send(JSON.stringify({ t: 'ping', n: performance.now() })), 150);
  }
});
