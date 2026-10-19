import * as THREE from 'three';
import { MAPS, getMap, isMapId } from '../shared/map';
import type { LobbyPlayer } from '../shared/protocol';
import { PLAYER_COLORS } from '../shared/constants';
import { AudioEngine } from './audio';
import { Game, type Settings } from './game';
import { LocalTransport, NetClient, defaultServerUrl, type Transport } from './net';
import { detectGpu } from './quality';
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

let settings: Settings = load<Settings>('zomba.settings', { sensitivity: 1, volume: 0.8, fov: 75, quality: 'auto' });
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
renderer.toneMappingExposure = 1.25;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('app').appendChild(renderer.domElement);

let tex: TexSet | null = null;
let audio: AudioEngine | null = null;
let game: Game | null = null;
let net: NetClient | null = null;

const panels = ['panel-main', 'panel-coop', 'panel-lobby', 'panel-controls', 'panel-board'];
function show(id: string) {
  for (const p of panels) $(p).classList.toggle('hidden', p !== id);
  document.querySelector('.menu-inner')!.classList.toggle('wide', id === 'panel-board');
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
  $('map-desc').textContent = MAPS.find((m) => m.id === prefs.mapId)!.desc;
}
setMap(prefs.mapId ?? 'cidade');

function playerLevel() {
  return levelOf(playerName()).level;
}

const nameInput = $<HTMLInputElement>('in-name');
nameInput.value = prefs.name;
nameInput.addEventListener('input', () => refreshProfile());
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
  return audio;
}

function startGame(transport: Transport, mapId: string) {
  const map = getMap(mapId);
  $('menu').classList.add('hidden');
  $('loading').classList.remove('hidden');
  // deixa o navegador desenhar a tela de carregamento antes do trabalho pesado
  setTimeout(() => {
    if (!tex) tex = buildTextures();
    game = new Game({
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
      onlineRun: onlineRunFor(transport),
    });
    $('loading').classList.add('hidden');
    game.start();
    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
  }, 30);
}

// placar online: no solo o jogo envia a partida; no co-op o servidor já registrou
function onlineRunFor(transport: Transport): ((run: RunInput) => Promise<string>) | undefined {
  if (!getAccount()) return undefined;
  if (!transport.solo) return () => Promise.resolve('O servidor registrou a partida no placar online.');
  const base = apiUrl();
  return (run) => submitRun(base, run).then((r) => (r.best ? 'Novo recorde seu no placar online!' : 'Partida enviada ao placar online.'));
}

const apiUrl = () => apiBase(serverInput.value.trim() || defaultServerUrl());

function exitGame() {
  game?.dispose();
  game = null;
  net?.close();
  net = null;
  $('menu').classList.remove('hidden');
  show('panel-main');
  renderer.clear();
}

// ---------- solo ----------

$('btn-solo').addEventListener('click', () => {
  ensureAudio();
  startGame(new LocalTransport(getMap(prefs.mapId), playerName(), { startRound: prefs.startRound, level: playerLevel(), bank: bankBalance(playerName()) }), prefs.mapId);
});

// ---------- co-op ----------

$('btn-coop').addEventListener('click', () => {
  ensureAudio();
  $('coop-msg').textContent = '';
  show('panel-coop');
});
$('btn-controls').addEventListener('click', () => show('panel-controls'));
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
      .map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}${r.mode === 'coop' ? ` <span class="muted">(${r.players})</span>` : ''}</td><td class="num">${r.round}</td>${custom ? `<td class="num">${r.startRound}</td>` : ''}<td class="num">${fmt(r.kills)}</td><td class="num">${fmt(r.headshots)}</td><td>${r.date.split('-').reverse().join('/')}</td><td>${r.verified ? '<span class="ok" title="Conferida pelo servidor">✓</span>' : ''}</td></tr>`)
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

async function connect(): Promise<NetClient | null> {
  if (net) return net;
  const url = serverInput.value.trim();
  prefs.server = url === defaultServerUrl() ? '' : url;
  save('zomba.prefs', prefs);
  $('coop-msg').textContent = 'Conectando…';
  try {
    const c = await NetClient.connect(url);
    net = c;
    c.onLobby = renderLobby;
    c.onError = (m) => {
      $('coop-msg').textContent = m;
      $('lobby-msg').textContent = m;
    };
    c.onStarted = () => startGame(c, c.mapId);
    c.onClose = () => {
      net = null;
      if (game) game.connectionLost();
      else {
        show('panel-coop');
        $('coop-msg').textContent = 'Desconectado do servidor.';
      }
    };
    $('coop-msg').textContent = '';
    return c;
  } catch (e) {
    $('coop-msg').textContent = `${(e as Error).message} Verifique se o servidor está rodando (npm run dev).`;
    return null;
  }
}

let lobbyMap = 'cidade';
function renderLobby(code: string, hostId: string, players: LobbyPlayer[], startRound: number, mapId: string) {
  lobbyMap = mapId;
  show('panel-lobby');
  $('lobby-code').textContent = code;
  const ul = $('lobby-players');
  ul.innerHTML = '';
  for (const p of [...players].sort((a, b) => a.slot - b.slot)) {
    const li = document.createElement('li');
    li.style.color = PLAYER_COLORS[p.slot % PLAYER_COLORS.length];
    const c = emblemCanvas(p.level, 60);
    li.append(c, `${p.name} · Nv ${p.level}${p.id === hostId ? '  (anfitrião)' : ''}${p.id === net?.localId ? '  — você' : ''}`);
    animateEmblem(c, p.level);
    ul.appendChild(li);
  }
  const isHost = net?.localId === hostId;
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
  const code = $<HTMLInputElement>('in-code').value.trim().toUpperCase();
  if (code.length !== 4) {
    $('coop-msg').textContent = 'O código da sala tem 4 letras.';
    return;
  }
  const c = await connect();
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
$('btn-leave').addEventListener('click', () => {
  net?.close();
  net = null;
  show('panel-coop');
});
