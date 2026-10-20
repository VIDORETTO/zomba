// Confere um servidor pelo link público (túnel): página, /api/info e WebSocket (o Origin certo entra,
// o de outro site é recusado). Uso: node tools/probe-tunnel.mjs https://xxxx.trycloudflare.com
import { WebSocket } from 'ws';

const base = (process.argv[2] ?? '').replace(/\/+$/, '');
if (!base) {
  console.error('uso: node tools/probe-tunnel.mjs <link>');
  process.exit(2);
}

async function retry(fn, tries = 20) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= tries) throw err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

function ws(origin) {
  return new Promise((ok) => {
    const url = base.replace(/^http/, 'ws');
    const s = new WebSocket(url, origin ? { headers: { origin } } : {});
    const got = [];
    s.on('message', (d) => got.push(JSON.parse(String(d))));
    s.on('close', () => ok(got));
    s.on('error', (e) => ok([{ t: 'socket-error', msg: e.message }]));
    setTimeout(() => s.close(), 2500);
  });
}

let fail = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'ok ' : 'FALHOU'} ${name} ${extra}`);
  if (!cond) fail++;
};

const info = await retry(async () => {
  const r = await fetch(`${base}/api/info`);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
});
check('api/info', info.ok === true, JSON.stringify(info));
const page = await fetch(`${base}/`);
check('página', page.ok && (await page.text()).includes('ZOMBA'), String(page.status));
check('CSP', !!page.headers.get('content-security-policy'));
const own = await ws(base);
check('ws com o Origin do próprio link', own.some((m) => m.t === 'welcome'), JSON.stringify(own[0]));
const evil = await ws('https://site-malicioso.example');
check('ws de outro site recusado', !evil.some((m) => m.t === 'welcome'), JSON.stringify(evil[0]));
const bare = await ws(null);
check('ws sem Origin (programa)', bare.some((m) => m.t === 'welcome'));
process.exit(fail ? 1 : 0);
