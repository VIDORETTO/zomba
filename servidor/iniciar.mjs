// Zomba · servidor em um clique.
//
// Prepara o jogo, liga o servidor e dá um link para mandar aos amigos. Três jeitos (pergunta ao abrir):
//   1. Cloudflare (padrão): túnel https, sem conta, sem abrir portas no roteador e sem mostrar o seu IP.
//   2. Direto: você é o servidor, sem ninguém no meio. Menos atraso, mas o link é http://<seu IP>, e o
//      roteador precisa deixar a porta aberta (o iniciador tenta abrir sozinho pelo UPnP).
//   3. Só rede local: quem está no mesmo Wi-Fi/cabo.
//
// Uso: node servidor/iniciar.mjs [--cloudflare | --direto | --sem-internet] [--rede] [--porta 3001] [--nao-abrir]
//   --cloudflare    modo 1, sem perguntar
//   --direto        modo 2, sem perguntar
//   --sem-internet  modo 3, sem perguntar
//   --rede          no modo Cloudflare, aceita também conexões diretas da rede local
//   --porta N       porta do servidor (padrão 3001; se estiver ocupada, usa a próxima livre)
//   --nao-abrir     não abre o jogo no navegador deste computador
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { closePort, externalIp, findRouter, openPort, unreachable } from './upnp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const BIN = join(HERE, 'bin');
const WIN = process.platform === 'win32';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const opts = {
  // 'cloudflare' | 'direto' | 'local'; null = pergunta ao abrir
  mode: flag('--direto') ? 'direto' : flag('--sem-internet') ? 'local' : flag('--cloudflare') ? 'cloudflare' : null,
  lan: flag('--rede'),
  port: Math.floor(Number(value('--porta'))) || 3001,
  open: !flag('--nao-abrir'),
};

// ---------- tela ----------

const paint = (code) => (s) => `\x1b[${code}m${s}\x1b[0m`;
const dim = paint(2);
const bold = paint(1);
const red = paint(31);
const green = paint(32);
const yellow = paint(33);
const cyan = paint(36);
const say = (s = '') => console.log(s);
const step = (n, s) => say(`${dim(`[${n}/4]`)} ${s}`);

let server = null;
let tunnel = null;
let stopping = false;
// o que desfazer ao desligar (fechar a porta aberta no roteador)
const cleanups = [];

function fail(msg, hint) {
  say();
  say(red(`✖ ${msg}`));
  if (hint) for (const line of [hint].flat()) say(`  ${line}`);
  stop(1);
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  say(dim('\n  desligando…'));
  tunnel?.kill();
  // o servidor guarda o placar antes de sair
  if (server?.connected) server.send({ stop: true });
  const undo = Promise.allSettled(cleanups.map((f) => f()));
  const timeout = new Promise((r) => setTimeout(r, 4000));
  Promise.race([Promise.all([undo, new Promise((r) => setTimeout(r, 1500))]), timeout]).then(() => {
    server?.kill();
    process.exit(code);
  });
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => stop(0));

// Pergunta o modo quando ninguém escolheu na linha de comando (Enter = Cloudflare).
async function askMode() {
  if (opts.mode) return opts.mode;
  if (!process.stdin.isTTY) return 'cloudflare';
  say('Como os amigos vão entrar?');
  say(`  ${bold('1')}  Pela Cloudflare ${dim('(recomendado: funciona em qualquer internet, link https, seu IP fica escondido)')}`);
  say(`  ${bold('2')}  Direto, você é o servidor ${dim('(sem Cloudflare: menos atraso; mostra seu IP e o roteador precisa deixar)')}`);
  say(`  ${bold('3')}  Só rede local ${dim('(mesmo Wi-Fi ou cabo)')}`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.on('SIGINT', () => {
    rl.close();
    stop(0);
  });
  const answer = (await rl.question('Escolha 1, 2 ou 3 e aperte Enter [1]: ')).trim();
  rl.close();
  say();
  return { 2: 'direto', 3: 'local' }[answer] ?? 'cloudflare';
}

// ---------- preparação ----------

function checkNode() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 20 || (major === 20 && minor < 6)) {
    fail(`O Node.js ${process.versions.node} é antigo demais.`, 'Instale a versão LTS em https://nodejs.org e rode de novo.');
    return false;
  }
  return true;
}

function installDeps() {
  const ok = ['tsx', 'ws', 'vite'].every((p) => existsSync(join(ROOT, 'node_modules', p, 'package.json')));
  if (ok) return true;
  say(dim('  instalando as peças do jogo (só na primeira vez, leva um minuto)…'));
  // npm vem junto com o Node; no Windows ele é um .cmd, que só roda pelo shell (comando fixo, sem nada de fora)
  const r = spawnSync('npm ci --no-audit --no-fund', { cwd: ROOT, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    fail('Não deu para instalar as peças do jogo.', 'Confira a internet e rode de novo.');
    return false;
  }
  return true;
}

function newest(path) {
  if (!existsSync(path)) return 0;
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  let t = 0;
  for (const name of readdirSync(path)) t = Math.max(t, newest(join(path, name)));
  return t;
}

// monta o jogo (pasta dist) quando ele não existe ou o código mudou depois da última montagem
function build() {
  const out = join(ROOT, 'dist', 'index.html');
  const built = existsSync(out) ? statSync(out).mtimeMs : 0;
  const changed = Math.max(...['src', 'public', 'index.html', 'vite.config.ts', 'package-lock.json'].map((p) => newest(join(ROOT, p))));
  if (built > changed) {
    say(dim('  o jogo já está montado e em dia'));
    return true;
  }
  say(dim('  montando o jogo (uns 30 segundos)…'));
  const r = spawnSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--logLevel', 'warn'], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    fail('Não deu para montar o jogo.', 'Veja o erro acima.');
    return false;
  }
  return true;
}

function portFree(port, host) {
  return new Promise((ok) => {
    const s = createServer();
    s.once('error', () => ok(false));
    s.listen(port, host, () => s.close(() => ok(true)));
  });
}

async function findPort(start) {
  for (let p = start; p < start + 30; p++) {
    if ((await portFree(p)) && (await portFree(p, '127.0.0.1'))) return p;
  }
  return 0;
}

function lanAddress() {
  const all = Object.values(networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal);
  return (all.find((a) => a.address.startsWith('192.168.')) ?? all.find((a) => !a.address.startsWith('169.254.')) ?? all[0])?.address ?? null;
}

async function waitFor(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (r.ok) return true;
    } catch {
      // ainda não está no ar
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}

// ---------- servidor do jogo ----------

function startServer(port, publicUrl) {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    // com a Cloudflare, só este computador (e o túnel, que roda aqui) fala com o servidor, a não ser com --rede;
    // nos modos direto e rede local, ele atende todo mundo
    HOST: opts.mode === 'cloudflare' && !opts.lan ? '127.0.0.1' : '',
    // atrás do túnel, o endereço real de quem conecta vem no cabeçalho da Cloudflare (para os limites valerem por pessoa)
    ZOMBA_PROXY: opts.mode === 'cloudflare' ? 'cloudflare' : '',
    ZOMBA_PUBLIC_URL: publicUrl ?? '',
  };
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server/main.ts'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const relay = (stream) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) if (l.trim() && !/^Servidor Zomba ouvindo|^Link público/.test(l)) say(`${dim('servidor │')} ${l}`);
    });
  };
  relay(child.stdout);
  relay(child.stderr);
  child.on('exit', (code) => {
    if (!stopping) fail(`O servidor parou (código ${code}).`, 'Veja as mensagens acima e rode de novo.');
  });
  return child;
}

// ---------- túnel (Cloudflare) ----------

// nome do arquivo do cloudflared para este sistema, como aparece nas versões publicadas no GitHub
function assetName() {
  const { platform, arch } = process;
  if (platform === 'win32') return arch === 'ia32' ? 'cloudflared-windows-386.exe' : 'cloudflared-windows-amd64.exe';
  if (platform === 'darwin') return arch === 'arm64' ? 'cloudflared-darwin-arm64.tgz' : 'cloudflared-darwin-amd64.tgz';
  if (platform === 'linux') return { x64: 'cloudflared-linux-amd64', arm64: 'cloudflared-linux-arm64', arm: 'cloudflared-linux-arm', ia32: 'cloudflared-linux-386' }[arch] ?? null;
  return null;
}

const works = (bin) => {
  try {
    return spawnSync(bin, ['--version'], { timeout: 15000, stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
};

// Baixa o cloudflared oficial do GitHub da Cloudflare e confere o resumo (sha256) que o GitHub publica
// junto do arquivo: se alguém trocar o arquivo no caminho, ele é recusado.
async function download() {
  const name = assetName();
  if (!name) throw new Error('sistema sem cloudflared publicado');
  const headers = { 'user-agent': 'zomba-servidor', accept: 'application/vnd.github+json' };
  const rel = await (await fetch('https://api.github.com/repos/cloudflare/cloudflared/releases/latest', { headers, signal: AbortSignal.timeout(20000) })).json();
  const asset = rel.assets?.find((a) => a.name === name);
  if (!asset) throw new Error(`arquivo ${name} não encontrado na versão ${rel.tag_name}`);
  const expected = asset.digest?.replace(/^sha256:/, '') ?? new RegExp(`${name.replace(/\./g, '\\.')}:\\s*([0-9a-f]{64})`).exec(rel.body ?? '')?.[1];
  if (!expected) throw new Error('a versão publicada não traz o resumo para conferir o arquivo');
  say(dim(`  baixando o cloudflared ${rel.tag_name} da Cloudflare (uns 40 MB, só na primeira vez)…`));
  const res = await fetch(asset.browser_download_url, { headers: { 'user-agent': 'zomba-servidor' }, signal: AbortSignal.timeout(300000) });
  if (!res.ok) throw new Error(`download falhou (${res.status})`);
  const data = Buffer.from(await res.arrayBuffer());
  const got = createHash('sha256').update(data).digest('hex');
  if (got !== expected) throw new Error('o arquivo baixado não confere com o publicado pela Cloudflare');
  mkdirSync(BIN, { recursive: true });
  const target = join(BIN, WIN ? 'cloudflared.exe' : 'cloudflared');
  if (name.endsWith('.tgz')) {
    const tgz = join(BIN, name);
    writeFileSync(tgz, data);
    const r = spawnSync('tar', ['-xzf', tgz, '-C', BIN], { stdio: 'ignore' });
    rmSync(tgz, { force: true });
    if (r.status !== 0 || !existsSync(target)) throw new Error('não deu para abrir o arquivo baixado');
  } else {
    writeFileSync(`${target}.part`, data);
    renameSync(`${target}.part`, target);
  }
  if (!WIN) chmodSync(target, 0o755);
  return target;
}

async function findCloudflared() {
  const own = join(BIN, WIN ? 'cloudflared.exe' : 'cloudflared');
  const list = [own, 'cloudflared'];
  if (WIN) list.push('C:\\Program Files (x86)\\cloudflared\\cloudflared.exe', 'C:\\Program Files\\cloudflared\\cloudflared.exe');
  for (const bin of list) if ((bin === 'cloudflared' || existsSync(bin)) && works(bin)) return bin;
  return download();
}

// Túnel rápido: a Cloudflare dá um endereço https://<palavras>.trycloudflare.com que chega neste computador.
// O arquivo de configuração vazio evita que uma configuração antiga do cloudflared (de outro projeto) atrapalhe.
function openTunnel(bin, port) {
  mkdirSync(BIN, { recursive: true });
  const cfg = join(BIN, 'vazio.yml');
  if (!existsSync(cfg)) writeFileSync(cfg, '# configuração vazia: o Zomba usa só o túnel rápido\n');
  return new Promise((ok, no) => {
    const proc = spawn(bin, ['tunnel', '--no-autoupdate', '--config', cfg, '--url', `http://127.0.0.1:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    let done = false;
    const timer = setTimeout(() => finish(new Error('a Cloudflare demorou demais para responder')), 45000);
    function finish(err, url) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err) {
        proc.kill();
        no(err);
      } else ok({ proc, url });
    }
    const read = (d) => {
      log = (log + d).slice(-20000);
      const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(log);
      if (m) finish(null, m[0]);
    };
    proc.stdout.on('data', read);
    proc.stderr.on('data', read);
    proc.on('error', (err) => finish(err));
    proc.on('exit', () => finish(new Error(log.trim().split('\n').slice(-3).join(' ') || 'o túnel fechou')));
  });
}

// Mantém o túnel de pé: se cair (internet oscilou), abre outro e avisa o novo link.
async function keepTunnel(bin, port, onUrl) {
  let wait = 3000;
  for (;;) {
    let t;
    try {
      t = await openTunnel(bin, port);
    } catch (err) {
      if (stopping) return;
      say(yellow(`! túnel não abriu: ${err.message}. Tentando de novo em ${Math.round(wait / 1000)} s…`));
      await new Promise((r) => setTimeout(r, wait));
      wait = Math.min(wait * 2, 60000);
      continue;
    }
    wait = 3000;
    tunnel = t.proc;
    await onUrl(t.url);
    await new Promise((r) => t.proc.once('exit', r));
    if (stopping) return;
    say(yellow('! o túnel caiu. Abrindo outro (o link vai mudar)…'));
  }
}

// ---------- área de transferência e navegador ----------

function copy(text) {
  const cmd = WIN ? ['clip'] : process.platform === 'darwin' ? ['pbcopy'] : ['xclip', '-selection', 'clipboard'];
  try {
    return spawnSync(cmd[0], cmd.slice(1), { input: text, timeout: 5000, stdio: ['pipe', 'ignore', 'ignore'] }).status === 0;
  } catch {
    return false;
  }
}

function openBrowser(url) {
  try {
    const [cmd, a] = WIN ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    spawn(cmd, a, { stdio: 'ignore', detached: true }).unref();
  } catch {
    // sem navegador: a pessoa abre o endereço na mão
  }
}

function banner(link, local, copied) {
  const line = dim('─'.repeat(Math.max(48, link.length + 6)));
  say();
  say(line);
  say(`  ${green(bold('PRONTO!'))} Link para os amigos${copied ? ' (já está copiado)' : ''}:`);
  say();
  say(`     ${cyan(bold(link))}`);
  say();
  say(line);
  say(`  1. ${opts.open ? 'O jogo abriu no seu navegador' : `Abra ${local}`} e clique em ${bold('Criar sala')}.`);
  say(`  2. No lobby, clique em ${bold('Copiar convite')} e mande no WhatsApp ou Discord:`);
  say('     quem abrir o convite cai direto na sua sala.');
  say(`  3. Para desligar, feche esta janela ou aperte ${bold('Ctrl+C')}.`);
  if (opts.mode === 'cloudflare') say(dim('  O link muda cada vez que o servidor liga. Seu IP fica escondido atrás da Cloudflare.'));
  if (opts.mode === 'direto') say(dim('  O link é o seu IP: mande só para quem você conhece. Ele muda se a operadora trocar o seu IP.'));
  say();
}

// ---------- modo direto (sem Cloudflare) ----------

async function publicIp() {
  try {
    const ip = (await (await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(8000) })).text()).trim();
    return /^\d+\.\d+\.\d+\.\d+$/.test(ip) ? ip : null;
  } catch {
    return null;
  }
}

// Abre a porta no roteador pelo UPnP e monta o link http://<IP público>:<porta>. Explica o que fazer quando a
// internet não deixa (CGNAT da operadora, dois roteadores em sequência, UPnP desligado).
async function goDirect(port, lan) {
  if (!lan) return fail('Este computador não está numa rede.');
  if (WIN) say(dim('  se o Windows perguntar sobre o Firewall, clique em "Permitir acesso"'));
  const [ip, svc] = await Promise.all([publicIp(), findRouter(lan)]);
  if (!ip) return fail('Não deu para descobrir o seu IP na internet.', 'Confira a internet e rode de novo.');
  let routerIp = null;
  let mapped = false;
  if (svc) {
    routerIp = await externalIp(svc).catch(() => null);
    try {
      const lease = await openPort(svc, lan, port);
      mapped = true;
      cleanups.push(() => closePort(svc, port));
      // porta com prazo: renova antes de vencer (se o computador desligar de repente, ela fecha sozinha)
      if (lease) setInterval(() => openPort(svc, lan, port, lease).catch(() => {}), (lease * 1000) / 2).unref();
      say(dim(`  porta ${port} aberta no roteador para este computador (${lan})`));
    } catch (err) {
      say(yellow(`! o roteador recusou abrir a porta sozinho: ${err.message}`));
    }
  }

  const gateway = lan.replace(/\.\d+$/, '.1');
  if (routerIp && unreachable(routerIp) && /^100\./.test(routerIp)) {
    return fail('Sua operadora usa CGNAT: ninguém de fora consegue chegar direto no seu computador.', [
      'Rode de novo e escolha 1 (Cloudflare), ou peça um "IP público" (ou "IP fixo") para a operadora.',
    ]);
  }
  if (routerIp && routerIp !== ip) {
    const modem = routerIp.replace(/\.\d+$/, '.1');
    say();
    say(yellow('! Há dois roteadores em sequência: o modem da operadora e o seu roteador.'));
    say('  O seu roteador já abriu a porta, mas o modem também precisa deixar. Faça isto uma vez só:');
    say(`    • abra ${bold(`http://${modem}`)} (painel do modem da operadora) e entre com a senha da etiqueta dele;`);
    say(`    • procure ${bold('DMZ')} e coloque o endereço ${bold(routerIp)} (o seu roteador), ou peça à operadora o ${bold('modo bridge')}.`);
    say(dim('  Se você já fez isso, pode ignorar este aviso.'));
  } else if (!mapped) {
    say();
    say(yellow('! Abra a porta na mão (uma vez só):'));
    say(`    • abra ${bold(`http://${gateway}`)} (painel do roteador) e procure ${bold('Redirecionamento de portas')}, ${bold('Port forwarding')} ou ${bold('Servidor virtual')};`);
    say(`    • crie a regra: porta ${bold(`${port}`)}, protocolo ${bold('TCP')}, para o endereço ${bold(lan)}.`);
    say(dim('  Ou ative o UPnP no roteador e rode de novo: o iniciador abre a porta sozinho.'));
  }

  const link = `http://${ip}:${port}`;
  server?.connected && server.send({ publicUrl: link });
  // dentro de casa muitos roteadores não deixam abrir o próprio IP público: só um teste de fora confirma de verdade
  if (await waitFor(`${link}/api/info`, 3000)) say(dim('  o link respondeu: a porta está aberta'));
  else say(dim('  não dá para testar o link de dentro de casa em muitos roteadores: peça para um amigo abrir'));
  return link;
}

// ---------- tudo junto ----------

async function main() {
  say();
  say(`${bold(red('ZOMBA'))} ${dim('· servidor para jogar com os amigos')}`);
  say();
  opts.mode = await askMode();
  if (stopping) return;
  step(1, 'Conferindo o computador…');
  if (!checkNode() || !installDeps()) return;
  step(2, 'Preparando o jogo…');
  if (!build()) return;

  step(3, 'Ligando o servidor…');
  const port = await findPort(opts.port);
  if (!port) return fail(`As portas ${opts.port} a ${opts.port + 29} estão ocupadas.`, 'Feche o outro programa ou use --porta 4000.');
  if (port !== opts.port) say(dim(`  a porta ${opts.port} está ocupada (talvez o npm run dev); usando a ${port}`));
  const local = `http://localhost:${port}`;
  const lan = opts.lan || opts.mode !== 'cloudflare' ? lanAddress() : null;
  const lanUrl = lan ? `http://${lan}:${port}` : null;
  server = startServer(port, opts.mode === 'local' ? lanUrl : null);
  if (!(await waitFor(`http://127.0.0.1:${port}/api/info`, 40000))) return fail('O servidor não respondeu.', 'Veja as mensagens acima.');
  say(dim(`  servidor no ar em ${local}${lanUrl ? ` e na rede em ${lanUrl}` : ''}`));

  let opened = false;
  const ready = (link) => {
    banner(link, local, copy(link));
    if (opts.open && !opened) {
      opened = true;
      openBrowser(`${local}/#criar`);
    }
  };

  if (opts.mode === 'local') {
    step(4, 'Só a rede local (mesmo Wi-Fi ou cabo).');
    if (!lanUrl) return fail('Este computador não está numa rede.');
    if (WIN) say(dim('  se o Windows perguntar sobre o Firewall, clique em "Permitir acesso"'));
    ready(lanUrl);
    return;
  }

  if (opts.mode === 'direto') {
    step(4, 'Modo direto: você é o servidor, sem Cloudflare…');
    const link = await goDirect(port, lan);
    if (link) ready(link);
    return;
  }

  step(4, 'Abrindo o túnel para a internet (Cloudflare)…');
  let bin;
  try {
    bin = await findCloudflared();
  } catch (err) {
    return fail(`Não deu para preparar o túnel: ${err.message}.`,
      'Instale o cloudflared na mão (no Windows: winget install Cloudflare.cloudflared), ou rode de novo e escolha 2 (direto) ou 3 (rede local).');
  }
  await keepTunnel(bin, port, async (url) => {
    server?.connected && server.send({ publicUrl: url });
    say(dim('  túnel aberto, esperando o link ficar acessível…'));
    if (!(await waitFor(`${url}/api/info`, 60000))) say(yellow('! o link ainda não respondeu daqui; ele pode levar mais alguns segundos.'));
    ready(url);
  });
}

main().catch((err) => fail(err?.message ?? String(err)));
