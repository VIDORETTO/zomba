import * as THREE from 'three';
import { MAPS, getMap, isMapId } from '../shared/map';
import type { LobbyPlayer } from '../shared/protocol';
import { PLAYER_COLORS } from '../shared/constants';
import { AudioEngine } from './audio';
import { EXPOSURE, Game, type Settings } from './game';
import { controlsEditor } from './controlsUi';
import { loadKeys } from './keys';
import { LocalTransport, NetClient, defaultServerUrl, type Transport } from './net';
import { downloadProgress, importProgress } from './backup';
import { P2PClient } from './p2p/client';
import { CODE_LENGTH, CODE_RE, cleanCode } from './p2p/codes';
import { QUALITY, detectGpu, initialLevel } from './quality';
import { MenuScene } from './menuScene';
import { buildTextures, type TexSet } from './textures';
import { animateEmblem, emblemCanvas } from './emblems';
import { allProfiles, bankBalance, favoriteWeapon, getProfile, levelOf, runs } from './profile';
import { MAX_START_ROUND, levelFromXp, rankOf, startPoints } from '../shared/progress';
import { WEAPONS } from '../shared/weapons';
import type { BoardMode, BoardStart, RunInput } from '../shared/board';
import { apiBase, fetchRuns, getAccount, login, setAccount, submitRun } from './online';
import './styles.css';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // armazenamento indisponível: segue sem salvar
  }
}

let settings: Settings = load<Settings>('zomba.settings', { sensitivity: 1, volume: 0.8, fov: 75, quality: 'auto', music: 1, brightness: 1, invertY: false });
const prefs = load('zomba.prefs', { name: '', server: '', startRound: 1, mapId: 'cidade' as string });

// Descobre a placa antes de criar o renderizador: sem aceleração, o antisserrilhado sai caro demais.
const gpu = (() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return { renderer: '', software: true };
  const info = detectGpu(gl);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return info;
})();
if (gpu.software) $('gpu-warning').classList.remove('hidden');

const renderer = new THREE.WebGLRenderer({ antialias: !gpu.software, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = EXPOSURE * (settings.brightness ?? 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('app').appendChild(renderer.domElement);

let tex: TexSet | null = null;
let audio: AudioEngine | null = null;
let game: Game | null = null;
// co-op: por padrão sem servidor (P2PClient); com ?servidor=ws://... usa o servidor de salas antigo (rede local)
type Coop = NetClient | P2PClient;
let net: Coop | null = null;
const LEGACY_SERVER = new URLSearchParams(location.search).get('servidor');
// placar online só existe se o jogo for construído com um servidor de placar (VITE_PLACAR_URL); sem ele, tudo fica no navegador
const ONLINE_BOARD = !!LEGACY_SERVER || !!(import.meta.env as Record<string, string | undefined>).VITE_PLACAR_URL;
let menuBg: MenuScene | null = null;
let menuBgTimer = 0;

// Fundo do menu: o mapa escolhido em 3D. Sem aceleração gráfica fica só o fundo pintado.
function startMenuBg(delay = 60) {
  clearTimeout(menuBgTimer);
  if (gpu.software || game) return;
  menuBgTimer = window.setTimeout(() => {
    if (game || $('menu').classList.contains('hidden')) return;
    if (menuBg?.map.id === prefs.mapId) return;
    menuBg?.dispose();
    if (!tex) tex = buildTextures();
    menuBg = new MenuScene(renderer, getMap(prefs.mapId), tex, QUALITY[initialLevel(settings.quality, gpu)]);
    menuBg.start();
    $('menu').classList.add('live');
    if (import.meta.env.DEV) (window as unknown as { __menu: MenuScene }).__menu = menuBg;
  }, delay);
}
function stopMenuBg() {
  clearTimeout(menuBgTimer);
  menuBg?.dispose();
  menuBg = null;
}

const panels = ['panel-main', 'panel-coop', 'panel-lobby', 'panel-controls', 'panel-board'];
let stopKeys: (() => void) | null = null;
function show(id: string) {
  for (const p of panels) $(p).classList.toggle('hidden', p !== id);
  if (id === 'panel-coop') coopName.value = nameInput.value;
  stopKeys?.();
  stopKeys = null;
  if (id === 'panel-controls') {
    ($('opt-tips') as HTMLInputElement).checked = settings.tips !== false;
    stopKeys = controlsEditor($('controls-editor'), loadKeys(settings.keys), (keys) => {
      settings.keys = keys;
      save('zomba.settings', settings);
    });
  }
  document.querySelector('.menu-inner')!.classList.toggle('wide', id === 'panel-board' || id === 'panel-controls');
  $('map-card').classList.toggle('hidden', id !== 'panel-main' && id !== 'panel-coop');
  if (id === 'panel-main') refreshProfile();
}

const fmt = (n: number) => n.toLocaleString('pt-BR');

// ---------- cartão do perfil (emblema, nível, XP e banco) ----------

function refreshProfile() {
  const name = nameInput.value.trim() || 'Sobrevivente';
  const p = getProfile(name);
  const lv = levelFromXp(p.xp);
  const rank = rankOf(lv.level);
  animateEmblem($<HTMLCanvasElement>('profile-emblem'), lv.level);
  $('profile-rank').textContent = `Nível ${lv.level} · ${rank.name}`;
  $('profile-xp').style.width = lv.need ? `${Math.round((lv.into / lv.need) * 100)}%` : '100%';
  $('profile-sub').textContent = `${lv.need ? `${fmt(lv.into)} / ${fmt(lv.need)} XP` : 'Nível máximo'} · Banco: ${fmt(p.bank)} pontos`;
}

// ---------- rodada inicial ----------

const roundInput = $<HTMLInputElement>('in-round');
function setRound(v: number) {
  const r = Math.max(1, Math.min(MAX_START_ROUND, Math.round(v) || 1));
  roundInput.value = String(r);
  $('out-round').textContent = String(r);
  $('round-points').textContent = r === 1 ? 'Começa com 500 pontos' : `Começa com ${fmt(startPoints(r))} pontos (fora do recorde "desde a rodada 1")`;
  prefs.startRound = r;
  save('zomba.prefs', prefs);
}
roundInput.addEventListener('input', () => setRound(Number(roundInput.value)));

// Escolha do mapa: botões lado a lado (no menu e no lobby, onde só o anfitrião escolhe).
function renderMapChoice(el: string, current: string, locked: boolean, pick: (id: string) => void) {
  const box = $(el);
  box.innerHTML = '';
  for (const m of MAPS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = m.name;
    b.dataset.map = m.id;
    b.classList.toggle('on', m.id === current);
    b.disabled = locked;
    b.addEventListener('click', () => pick(m.id));
    box.appendChild(b);
  }
}
function setMap(id: string) {
  prefs.mapId = isMapId(id) ? id : 'cidade';
  save('zomba.prefs', prefs);
  renderMapChoice('map-choice', prefs.mapId, false, setMap);
  const m = MAPS.find((x) => x.id === prefs.mapId)!;
  $('map-name').textContent = m.name;
  $('map-desc').textContent = m.desc;
  if (menuBg) startMenuBg(150);
}
setMap(prefs.mapId ?? 'cidade');

function playerLevel() {
  return levelOf(playerName()).level;
}

const nameInput = $<HTMLInputElement>('in-name');
nameInput.value = prefs.name;
nameInput.addEventListener('input', () => refreshProfile());
// o nome também fica na tela do co-op (quem chega por convite ou pelo iniciador do servidor não passa pelo menu)
const coopName = $<HTMLInputElement>('in-coop-name');
coopName.addEventListener('input', () => {
  nameInput.value = coopName.value;
  playerName();
});
// sem servidor de placar nem de salas: esconde o que dependeria dele
if (!ONLINE_BOARD) document.querySelector('#board-tabs [data-tab="online"]')?.classList.add('hidden');
if (!LEGACY_SERVER) $('server-adv').classList.add('hidden');
$<HTMLInputElement>('in-code').maxLength = LEGACY_SERVER ? 4 : CODE_LENGTH;
const serverInput = $<HTMLInputElement>('in-server');
serverInput.value = prefs.server || defaultServerUrl();

function playerName() {
  const n = nameInput.value.trim().slice(0, 16) || 'Sobrevivente';
  prefs.name = nameInput.value.trim();
  save('zomba.prefs', prefs);
  return n;
}

// Envolve o motor de som: se um navegador não suportar algo, o som falha calado e o jogo segue.
function safeAudio(engine: AudioEngine): AudioEngine {
  const warned = new Set<PropertyKey>();
  return new Proxy(engine, {
    get(target, key) {
      const v = Reflect.get(target, key, target);
      if (typeof v !== 'function') return v;
      return (...args: unknown[]) => {
        try {
          return v.apply(target, args);
        } catch (e) {
          if (!warned.has(key)) {
            warned.add(key);
            console.warn(`som "${String(key)}" falhou:`, e);
          }
        }
      };
    },
  });
}

function ensureAudio(): AudioEngine {
  if (!audio) audio = safeAudio(new AudioEngine());
  audio.resume();
  audio.setVolume(settings.volume);
  audio.setMusicVolume(settings.music ?? 1);
  return audio;
}

const TIPS: { text: string; map?: string }[] = [
  { text: 'Consertar barricadas dá pontos: segure F perto de uma janela quebrada.' },
  { text: 'Tiro na cabeça mata mais rápido e vale 100 pontos no abate, contra 60 no corpo.' },
  { text: 'Matar com a faca (V ou E) vale 130 pontos: ótimo nas primeiras rodadas.' },
  { text: 'A Caixa sorteia uma arma por 950 pontos. Se aparecer o Corvo, ela muda de lugar.' },
  { text: 'A Couraça aumenta sua vida de 100 para 250. Costuma ser a primeira bebida.' },
  { text: 'No solo, o Segundo Fôlego custa só 500 pontos e deixa você levantar sozinho.' },
  { text: 'A Forja deixa qualquer arma mais forte por 5.000 pontos.' },
  { text: 'Com a Mula você carrega uma terceira arma.' },
  { text: 'Os itens que caem dos zumbis piscam antes de sumir. Pegue logo.' },
  { text: 'Na Liquidação, a Caixa custa só 10 pontos por 30 segundos.' },
  { text: 'Você ganha 2 granadas (G) a cada rodada, até o máximo de 4.' },
  { text: 'Na rodada dos cães, fique num canto: eles só chegam pela frente.' },
  { text: 'Correr gasta fôlego. Ele volta enquanto você anda.' },
  { text: 'Esc abre o menu: dá para trocar as teclas, o brilho e o volume da música no meio da partida.' },
  { text: 'Pontos guardados no banco ficam para as próximas partidas.' },
  { text: 'Ninguém sabe para que servem as velas pretas da Igreja.', map: 'cidade' },
  { text: 'As bebidas só funcionam depois de ligar a energia na Usina.', map: 'rota' },
  { text: 'Na névoa entre as paradas moram os Vultos. Vá de ônibus ou corra.', map: 'rota' },
  { text: 'O painel no alto da tela mostra onde está o ônibus e quando ele sai.', map: 'rota' },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Tela de carregamento: monta o jogo em etapas para a barra andar, compila os shaders antes
// do primeiro quadro e some num esmaecer.
async function startGame(transport: Transport, mapId: string) {
  const map = getMap(mapId);
  stopMenuBg();
  $('menu').classList.add('hidden');
  const ld = $('loading');
  const bar = $('load-bar');
  const tips = TIPS.filter((t) => !t.map || t.map === map.id);
  $('load-map').textContent = map.name;
  $('load-tip').textContent = tips[Math.floor(Math.random() * tips.length)].text;
  bar.style.width = '8%';
  ld.classList.remove('hidden', 'out');
  const t0 = performance.now();
  lostWhileLoading = false;
  loading = true;
  await wait(40);
  if (!tex) tex = buildTextures();
  bar.style.width = '35%';
  await wait(40);
  const g = new Game({
    renderer,
    container: document.body,
    transport,
    map,
    tex,
    audio: ensureAudio(),
    settings,
    gpu,
    playerName: playerName(),
    onSettings: (s) => {
      settings = s;
      save('zomba.settings', s);
    },
    onExit: exitGame,
    onRestart: transport.solo ? () => {
      exitGame(false);
      startSolo();
    } : undefined,
    onlineRun: onlineRunFor(transport),
  });
  bar.style.width = '75%';
  await wait(40);
  await g.warmup();
  bar.style.width = '100%';
  // tempo mínimo para dar para ler a dica (o co-op já está rodando: espera menos)
  await wait(Math.max(0, (transport.solo ? 1500 : 700) - (performance.now() - t0)));
  loading = false;
  game = g;
  ld.classList.add('out');
  setTimeout(() => ld.classList.add('hidden'), 650);
  g.start();
  if (lostWhileLoading) g.connectionLost();
  if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = g;
}
let loading = false;
let lostWhileLoading = false;

// placar online: no solo o jogo envia a partida; no co-op o servidor já registrou
function onlineRunFor(transport: Transport): ((run: RunInput) => Promise<string>) | undefined {
  if (!getAccount()) return undefined;
  if (!transport.solo) return () => Promise.resolve('O servidor registrou a partida no placar online.');
  const base = apiUrl();
  return (run) => submitRun(base, run).then((r) => (r.best ? 'Novo recorde seu no placar online!' : 'Partida enviada ao placar online.'));
}

const apiUrl = () => apiBase(serverInput.value.trim() || defaultServerUrl());

function exitGame(toMenu = true) {
  game?.dispose();
  game = null;
  net?.close();
  net = null;
  renderer.clear();
  if (!toMenu) return;
  $('menu').classList.remove('hidden');
  show('panel-main');
  startMenuBg();
}

// ---------- solo ----------

function startSolo() {
  ensureAudio();
  startGame(new LocalTransport(getMap(prefs.mapId), playerName(), { startRound: prefs.startRound, level: playerLevel(), bank: bankBalance(playerName()), log: import.meta.env.DEV && /[?&](autoplay|registro)\b/.test(location.search) }), prefs.mapId);
}
$('btn-solo').addEventListener('click', startSolo);

// ---------- co-op ----------

$('btn-coop').addEventListener('click', () => {
  ensureAudio();
  $('coop-msg').textContent = '';
  show('panel-coop');
});
$('btn-controls').addEventListener('click', () => show('panel-controls'));
$('btn-save-progress').addEventListener('click', () => {
  downloadProgress();
  $('progress-msg').textContent = 'Arquivo salvo na pasta de downloads.';
});
$('btn-load-progress').addEventListener('click', () => $('file-progress').click());
$<HTMLInputElement>('file-progress').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const r = importProgress(await file.text());
  if (typeof r === 'string') {
    $('progress-msg').textContent = r;
    return;
  }
  $('progress-msg').textContent = 'Progresso carregado. Recarregando…';
  setTimeout(() => location.reload(), 600);
});
$('opt-tips').addEventListener('change', (e) => {
  settings.tips = (e.target as HTMLInputElement).checked;
  save('zomba.settings', settings);
});
$('btn-board').addEventListener('click', () => {
  show('panel-board');
  renderBoard();
});

// ---------- placar ----------

let boardTab = 'runs';
let boardFilter = 'zero';
document.querySelectorAll<HTMLButtonElement>('#board-tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    boardTab = b.dataset.tab!;
    document.querySelectorAll('#board-tabs button').forEach((x) => x.classList.toggle('on', x === b));
    $('board-filter').classList.toggle('hidden', boardTab === 'players');
    $('board-online-filter').classList.toggle('hidden', boardTab !== 'online');
    $('board-account').classList.toggle('hidden', boardTab !== 'online');
    $('board-note').textContent = boardTab === 'online'
      ? 'Placar do servidor do jogo (o mesmo do co-op). Partidas de co-op são conferidas pelo servidor (✓).'
      : 'Placar deste computador.';
    renderBoard();
  }),
);
document.querySelectorAll<HTMLButtonElement>('#board-filter button').forEach((b) =>
  b.addEventListener('click', () => {
    boardFilter = b.dataset.filter!;
    document.querySelectorAll('#board-filter button').forEach((x) => x.classList.toggle('on', x === b));
    renderBoard();
  }),
);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// ---------- placar online ----------

let onlineMode: BoardMode = 'solo';
let onlineMap = 'cidade';
let onlineReq = 0;
document.querySelectorAll<HTMLButtonElement>('#board-online-filter button').forEach((b) =>
  b.addEventListener('click', () => {
    if (b.dataset.mode) onlineMode = b.dataset.mode as BoardMode;
    if (b.dataset.omap) onlineMap = b.dataset.omap;
    document.querySelectorAll<HTMLButtonElement>('#board-online-filter button').forEach((x) =>
      x.classList.toggle('on', x.dataset.mode ? x.dataset.mode === onlineMode : x.dataset.omap === onlineMap));
    renderBoard();
  }),
);

function renderAccount(msg = '', bad = false) {
  const box = $('board-account');
  const acc = getAccount();
  const note = msg ? `<span class="msg ${bad ? 'bad' : ''}">${esc(msg)}</span>` : '';
  if (acc) {
    box.innerHTML = `<span>Conectado como <b>${esc(acc.name)}</b>. Suas partidas entram no placar.</span><button class="btn ghost" id="acc-out">Sair</button>${note}`;
    $('acc-out').addEventListener('click', () => {
      setAccount(null);
      renderAccount('Você saiu da conta.');
    });
    return;
  }
  box.innerHTML = `<input id="acc-name" maxlength="16" placeholder="Nome" value="${esc(nameInput.value.trim())}"><input id="acc-pass" type="password" maxlength="64" placeholder="Senha"><button class="btn primary" id="acc-in">Entrar ou criar conta</button>${note || '<span class="msg">Com uma conta, suas partidas aparecem no placar online. Se o nome for novo, a conta é criada.</span>'}`;
  const go = async () => {
    const name = $<HTMLInputElement>('acc-name').value.trim();
    const pass = $<HTMLInputElement>('acc-pass').value;
    renderAccount('Conectando…');
    try {
      const r = await login(apiUrl(), name, pass);
      // o nome do jogo passa a ser o da conta
      nameInput.value = r.name;
      playerName();
      refreshProfile();
      renderAccount(r.created ? 'Conta criada.' : 'Bem-vindo de volta.');
      renderBoard();
    } catch (err) {
      renderAccount((err as Error).message, true);
    }
  };
  $('acc-in').addEventListener('click', go);
  $('acc-pass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') go();
  });
}

async function renderOnline() {
  const body = $('board-body');
  if (!$('board-account').innerHTML) renderAccount();
  const req = ++onlineReq;
  body.innerHTML = '<p class="muted">Carregando…</p>';
  try {
    const list = await fetchRuns(apiUrl(), onlineMode, boardFilter as BoardStart, onlineMap);
    if (req !== onlineReq) return;
    if (!list.length) {
      body.innerHTML = '<p class="muted">Nenhuma partida nesta categoria ainda.</p>';
      return;
    }
    const custom = boardFilter === 'custom';
    body.innerHTML = `<table><thead><tr><th>#</th><th>Jogador</th><th class="num">Rodada</th>${custom ? '<th class="num">Início</th>' : ''}<th class="num">Abates</th><th class="num">Cabeça</th><th>Data</th><th></th></tr></thead><tbody>${list
      .map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}${r.missao ? ' <span title="Missão concluída">★</span>' : ''}${r.mode === 'coop' ? ` <span class="muted">(${r.players})</span>` : ''}</td><td class="num">${r.round}</td>${custom ? `<td class="num">${r.startRound}</td>` : ''}<td class="num">${fmt(r.kills)}</td><td class="num">${fmt(r.headshots)}</td><td>${r.date.split('-').reverse().join('/')}</td><td>${r.verified ? '<span class="ok" title="Conferida pelo servidor">✓</span>' : ''}</td></tr>`)
      .join('')}</tbody></table>`;
  } catch (err) {
    if (req === onlineReq) body.innerHTML = `<p class="muted">${esc((err as Error).message)} Confira o endereço do servidor na tela de co-op.</p>`;
  }
}

function renderBoard() {
  const body = $('board-body');
  if (boardTab === 'online') {
    renderOnline();
    return;
  }
  if (boardTab === 'runs') {
    const list = runs().filter((r) => (boardFilter === 'zero' ? r.startRound === 1 : r.startRound > 1));
    if (!list.length) {
      body.innerHTML = '<p class="muted">Nenhuma partida registrada ainda.</p>';
      return;
    }
    body.innerHTML = `<table><thead><tr><th>#</th><th>Jogador</th><th class="num">Rodada</th>${boardFilter === 'custom' ? '<th class="num">Início</th>' : ''}<th>Modo</th><th class="num">Abates</th><th class="num">Cabeça</th><th>Data</th></tr></thead><tbody>${list
      .map((r, i) => `<tr><td>${i + 1}</td><td data-lv="${levelOf(r.name).level}">${esc(r.name)}</td><td class="num">${r.round}</td>${boardFilter === 'custom' ? `<td class="num">${r.startRound}</td>` : ''}<td>${r.mode === 'solo' ? 'Solo' : `Co-op (${r.players})`}</td><td class="num">${r.kills}</td><td class="num">${r.headshots}</td><td>${r.date.split('-').reverse().join('/')}</td></tr>`)
      .join('')}</tbody></table>`;
  } else {
    const list = allProfiles().sort((a, b) => b.xp - a.xp);
    if (!list.length) {
      body.innerHTML = '<p class="muted">Nenhum jogador registrado ainda.</p>';
      return;
    }
    body.innerHTML = `<table><thead><tr><th>Jogador</th><th class="num">Nível</th><th class="num">Partidas</th><th class="num">Melhor solo</th><th class="num">Melhor co-op</th><th class="num">Abates</th><th class="num">Cabeça</th><th class="num">Reanim.</th><th class="num">Tempo</th><th>Arma favorita</th></tr></thead><tbody>${list
      .map((p) => {
        const lv = levelFromXp(p.xp).level;
        const s = p.stats;
        const fav = favoriteWeapon(s);
        const h = Math.floor(s.seconds / 3600);
        const m = Math.floor((s.seconds % 3600) / 60);
        return `<tr><td data-lv="${lv}">${esc(p.name)}</td><td class="num">${lv}</td><td class="num">${s.games}</td><td class="num">${s.bestSolo || '—'}</td><td class="num">${s.bestCoop || '—'}</td><td class="num">${fmt(s.kills)}</td><td class="num">${fmt(s.headshots)}</td><td class="num">${s.revives}</td><td class="num">${h}h${String(m).padStart(2, '0')}</td><td>${fav ? esc(WEAPONS[fav]?.name ?? fav) : '—'}</td></tr>`;
      })
      .join('')}</tbody></table>`;
  }
  // emblema ao lado de cada nome
  body.querySelectorAll<HTMLElement>('td[data-lv]').forEach((td) => {
    const c = emblemCanvas(Number(td.dataset.lv), 56);
    td.prepend(c);
    animateEmblem(c, Number(td.dataset.lv));
  });
}
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => show('panel-main')));

async function connect(): Promise<Coop | null> {
  if (net) return net;
  const url = serverInput.value.trim();
  if (LEGACY_SERVER) {
    prefs.server = url === defaultServerUrl() ? '' : url;
    save('zomba.prefs', prefs);
  }
  $('coop-msg').textContent = LEGACY_SERVER ? 'Conectando…' : '';
  try {
    const c = LEGACY_SERVER ? await NetClient.connect(url) : await P2PClient.connect();
    net = c;
    c.onLobby = renderLobby;
    if (c instanceof P2PClient) {
      c.onRoute = (r) => {
        $('lobby-route').textContent = r === 'direta' ? 'Ligação direta com o anfitrião.' : r === 'retransmitida' ? 'Ligação por retransmissão (a rede de um dos dois não aceita ligação direta): pode ter um pouco mais de atraso.' : '';
      };
    }
    c.onError = (m) => {
      $('coop-msg').textContent = m;
      $('lobby-msg').textContent = m;
    };
    c.onLeft = (m) => {
      show('panel-coop');
      $('coop-msg').textContent = m;
    };
    c.onStarted = () => startGame(c, c.mapId);
    c.onClose = () => {
      net = null;
      if (game) game.connectionLost();
      else if (loading) lostWhileLoading = true;
      else {
        show('panel-coop');
        $('coop-msg').textContent = LEGACY_SERVER ? 'Desconectado do servidor.' : 'A ligação com o anfitrião caiu.';
      }
    };
    $('coop-msg').textContent = '';
    return c;
  } catch (e) {
    $('coop-msg').textContent = `${(e as Error).message}${LEGACY_SERVER ? ' Verifique se o servidor está ligado.' : ''}`;
    return null;
  }
}

// ---------- convite por link ----------
// O link é o endereço do servidor com #sala=CÓDIGO: quem abre já cai na tela de entrar nessa sala.

function inviteLink(code: string) {
  // sem servidor, o link é o endereço em que o jogo está aberto: o código da sala vai depois do #
  const base = net?.publicUrl || `${location.origin}${location.pathname}`;
  return `${base.replace(/\/+$/, '')}/#sala=${code}`;
}

let invitedCode: string | null = null;
function showInvite(code: string | null) {
  invitedCode = code;
  $('invite-box').classList.toggle('hidden', !code);
  $('btn-invite-join').classList.toggle('hidden', !code);
  $('btn-create').classList.toggle('hidden', !!code);
  document.querySelector('#panel-coop > .row')!.classList.toggle('hidden', !!code);
  if (!code) return;
  $('invite-code').textContent = code;
  show('panel-coop');
  // o mapa quem escolhe é o anfitrião
  $('map-card').classList.add('hidden');
  $('coop-msg').textContent = '';
}

// lê o convite do endereço e limpa (atualizar a página depois não tenta entrar de novo). Também vale quando o link é colado
// no endereço de uma aba que já está com o jogo aberto (só o # muda, a página não recarrega).
function readInvite() {
  const m = new RegExp(`(?:^|[#&?])sala=([A-Za-z0-9]{${LEGACY_SERVER ? 4 : CODE_LENGTH}})(?![A-Za-z0-9])`).exec(location.hash + '&' + location.search.slice(1));
  // o iniciador do servidor abre o jogo de quem hospeda direto no co-op
  const host = location.hash === '#criar';
  if (m || host) history.replaceState(null, '', location.pathname);
  // no meio de uma partida o convite não faz nada (e não deve tirar o jogador dela)
  if (game || loading) return;
  if (m) {
    exitLobbyForInvite();
    showInvite(m[1].toUpperCase());
  } else if (host) show('panel-coop');
}
// quem estava no lobby de outra sala e cola um convite novo sai da sala antiga
function exitLobbyForInvite() {
  net?.close();
  net = null;
}
readInvite();
window.addEventListener('hashchange', readInvite);

$('btn-invite-join').addEventListener('click', async () => {
  if (!invitedCode) return;
  ensureAudio();
  const code = invitedCode;
  const c = await connect();
  if (c instanceof P2PClient) $('coop-msg').textContent = 'Procurando a sala…';
  c?.join(code, playerName(), playerLevel(), getAccount()?.token, bankBalance(playerName()));
});

$('btn-copy-invite').addEventListener('click', () => {
  const input = $<HTMLInputElement>('lobby-link');
  const btn = $('btn-copy-invite');
  // copia na hora, ainda dentro do clique (funciona também sem https); se não der, tenta a área de
  // transferência nova. O link fica selecionado para um Ctrl+C, se nada funcionar.
  input.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  if (!copied) navigator.clipboard?.writeText(input.value).catch(() => {});
  btn.textContent = 'Copiado!';
  btn.classList.add('done');
  setTimeout(() => {
    btn.textContent = 'Copiar convite';
    btn.classList.remove('done');
  }, 2000);
});

let lobbyMap = 'cidade';
function renderLobby(code: string, hostId: string, players: LobbyPlayer[], startRound: number, mapId: string) {
  lobbyMap = mapId;
  if (invitedCode) showInvite(null);
  show('panel-lobby');
  $('lobby-code').textContent = code;
  const link = inviteLink(code);
  $<HTMLInputElement>('lobby-link').value = link;
  const isHost = net?.localId === hostId;
  const p2p = net instanceof P2PClient;
  $('lobby-invite-note').textContent = /^https?:\/\/(localhost|127\.)/.test(link)
    ? 'Esse link só abre neste computador (endereço de teste). Pela internet, use o endereço oficial do jogo.'
    : p2p && isHost
      ? 'Mande o link para seus amigos: quem abrir já cai nesta sala. A partida roda no seu computador: mantenha esta aba aberta.'
      : 'Mande o link para seus amigos: quem abrir já cai nesta sala.';
  const ul = $('lobby-players');
  ul.innerHTML = '';
  for (const p of [...players].sort((a, b) => a.slot - b.slot)) {
    const li = document.createElement('li');
    li.style.color = PLAYER_COLORS[p.slot % PLAYER_COLORS.length];
    const c = emblemCanvas(p.level, 60);
    li.append(c, `${p.name} · Nv ${p.level}${p.id === hostId ? '  (anfitrião)' : ''}${p.id === net?.localId ? '  — você' : ''}`);
    animateEmblem(c, p.level);
    if (isHost && p.id !== net?.localId) {
      const kick = document.createElement('button');
      kick.className = 'btn ghost kick';
      kick.textContent = 'Tirar';
      kick.title = `Tirar ${p.name} da sala`;
      kick.addEventListener('click', () => net?.kick(p.id));
      li.appendChild(kick);
    }
    ul.appendChild(li);
  }
  const lr = $<HTMLInputElement>('lobby-round');
  lr.value = String(startRound);
  lr.disabled = !isHost;
  $('lobby-round-out').textContent = String(startRound);
  $('lobby-round-points').textContent = startRound === 1 ? 'Começa com 500 pontos' : `Começa com ${fmt(startPoints(startRound))} pontos`;
  renderMapChoice('lobby-map', mapId, !isHost, (id) => net?.config(Number(lr.value), id));
  $('btn-start').classList.toggle('hidden', !isHost);
  $('lobby-msg').textContent = isHost ? '' : 'Aguardando o anfitrião iniciar…';
}

$('btn-create').addEventListener('click', async () => {
  const c = await connect();
  c?.create(playerName(), playerLevel(), prefs.startRound, prefs.mapId, getAccount()?.token, bankBalance(playerName()));
});
$('btn-join').addEventListener('click', async () => {
  const code = LEGACY_SERVER ? $<HTMLInputElement>('in-code').value.trim().toUpperCase() : cleanCode($<HTMLInputElement>('in-code').value);
  if (LEGACY_SERVER ? code.length !== 4 : !CODE_RE.test(code)) {
    $('coop-msg').textContent = LEGACY_SERVER ? 'O código da sala tem 4 letras.' : `O código da sala tem ${CODE_LENGTH} letras ou números.`;
    return;
  }
  const c = await connect();
  if (c instanceof P2PClient) $('coop-msg').textContent = 'Procurando a sala…';
  c?.join(code, playerName(), playerLevel(), getAccount()?.token, bankBalance(playerName()));
});
$('btn-start').addEventListener('click', () => net?.start());
$('lobby-round').addEventListener('input', () => {
  const v = Number($<HTMLInputElement>('lobby-round').value);
  $('lobby-round-out').textContent = String(v);
  net?.config(v, lobbyMap);
});

setRound(prefs.startRound ?? 1);
refreshProfile();
startMenuBg();
$('btn-leave').addEventListener('click', () => {
  net?.close();
  net = null;
  show('panel-coop');
});
