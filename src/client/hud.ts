import { PLAYER_COLORS } from '../shared/constants';
import { PERKS, type PerkId } from '../shared/perks';
import { POWERUPS, type PowerupKind } from '../shared/powerups';
import { emblemCanvas } from './emblems';
import type { NetPlayer, TrGen, Weather } from '../shared/protocol';
import { CHALLENGE_TEXT, ELEMENT_LIST, ELEMENTS, MISSAO_STEPS, SET_PARTS, TEAM_ITEMS } from '../shared/trincheira-info';

// Símbolo de cada bebida (SVG 24×24, branco sobre a cor da bebida)
const PERK_SVG: Record<PerkId, string> = {
  // escudo
  couraca: '<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/>',
  // coração com cruz
  folego: '<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/><path d="M11 9h2v2h2v2h-2v2h-2v-2H9v-2h2z" fill="rgba(0,0,0,.45)"/>',
  // raio
  reflexo: '<path d="M13 2 4 14h7l-2 8 9-12h-7z"/>',
  // duas balas
  gatilho: '<path d="M7 3c1.7 1.5 2.5 3.5 2.5 6v10h-5V9C4.5 6.5 5.3 4.5 7 3zm10 0c1.7 1.5 2.5 3.5 2.5 6v10h-5V9c0-2.5.8-4.5 2.5-6z"/><path d="M4.5 16h5v1.5h-5zm10 0h5v1.5h-5z" fill="rgba(0,0,0,.45)"/>',
  // pegada
  passo: '<ellipse cx="11" cy="15" rx="4.2" ry="6"/><circle cx="8.5" cy="5.5" r="1.6"/><circle cx="12" cy="4.2" r="1.7"/><circle cx="15.3" cy="5.5" r="1.5"/><circle cx="17.4" cy="8.4" r="1.3"/>',
  // ferradura
  mula: '<path d="M5 4h4v8a3 3 0 0 0 6 0V4h4v8a7 7 0 0 1-14 0z"/><path d="M5 4h4v2.5H5zm10 0h4v2.5h-4z" fill="rgba(0,0,0,.45)"/>',
  // faísca: raio com ponto de fagulha
  faisca: '<path d="M14 2 6 13h5l-1.5 9L18 10h-5.2z"/><circle cx="18.5" cy="4.5" r="1.6"/><circle cx="5" cy="20" r="1.3"/>',
  // olho com mira
  'olho-frio': '<path d="M12 5C6.5 5 2.8 9.2 1.5 12c1.3 2.8 5 7 10.5 7s9.2-4.2 10.5-7C21.2 9.2 17.5 5 12 5zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/><circle cx="12" cy="12" r="1.8" fill="rgba(0,0,0,.55)"/>',
  // casca de tartaruga (hexágonos)
  'casca-grossa': '<path d="M12 3 20 7.5v9L12 21 4 16.5v-9z"/><path d="M12 8 15.5 10v4L12 16 8.5 14v-4z" fill="rgba(0,0,0,.4)"/>',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, html?: string) {
  const e = document.createElement(tag);
  e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

// Marcas de giz para as rodadas 1 a 5, como uma contagem na parede.
function tallySVG(n: number): string {
  const strokes: string[] = [];
  for (let i = 0; i < Math.min(n, 4); i++) {
    const x = 14 + i * 22;
    const lean = (i % 2 ? 3 : -2);
    strokes.push(`<path d="M${x + lean} 8 L${x} 92" />`);
  }
  if (n >= 5) strokes.push('<path d="M0 70 L96 24" />');
  return `<svg viewBox="-6 0 110 100" class="tally"><g>${strokes.join('')}</g></svg>`;
}

export interface Marker {
  x: number;
  y: number;
  label: string;
  color: string;
  onScreen: boolean;
  // símbolo em cima do texto (padrão: cruz de aliado caído) e estilo de item no chão
  icon?: string;
  item?: boolean;
}

const GEAR = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm9 4.5v-2l-2.2-.6a7 7 0 0 0-.8-1.9l1.2-2-1.4-1.4-2 1.2a7 7 0 0 0-1.9-.8L13 3h-2l-.6 2.2a7 7 0 0 0-1.9.8l-2-1.2-1.4 1.4 1.2 2a7 7 0 0 0-.8 1.9L3 11v2l2.2.6c.2.7.4 1.3.8 1.9l-1.2 2 1.4 1.4 2-1.2c.6.4 1.2.6 1.9.8L11 21h2l.6-2.2c.7-.2 1.3-.4 1.9-.8l2 1.2 1.4-1.4-1.2-2c.4-.6.6-1.2.8-1.9z"/></svg>';
const IC = {
  shield: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/></svg>',
  drone: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="3.6"/><rect x="2" y="4" width="8" height="2"/><rect x="14" y="4" width="8" height="2"/><rect x="2" y="18" width="8" height="2"/><rect x="14" y="18" width="8" height="2"/><path d="M9 9 6 6M15 9l3-3M9 15l-3 3M15 15l3 3" stroke="currentColor" stroke-width="1.6"/></svg>',
  fist: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 10h14v6a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5zM5 10V7.5a1.7 1.7 0 0 1 3.4 0V9M8.4 9V6.5a1.7 1.7 0 0 1 3.4 0V9M11.8 9V6a1.7 1.7 0 0 1 3.4 0v3M15.2 9V7.5a1.7 1.7 0 0 1 3.4 0V10z"/></svg>',
  shovel: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 2h2v11h-2zM7.5 13h9L15 21H9z"/></svg>',
};
const WEATHER_ICON: Record<Weather, string> = { limpo: '☀', chuva: '☂', neve: '❄' };
const WEATHER_NAME: Record<Weather, string> = { limpo: 'Tempo limpo', chuva: 'Chuva', neve: 'Neve' };

// aviso do topo da Trincheira (colosso, Cruzados...); prio menor = mais urgente
export interface TrAlert {
  id: string;
  prio: number;
  text: string;
  color: string;
  angle: number | null;
  dist: number | null;
  danger?: boolean;
}
export const TR_ALERT_MAX = 2;

// Painéis da Trincheira: geradores, itens da equipe, desafios, aviso do colosso, missão, recaptura, Sangue Morto e status.
export class TrHud {
  private readonly gens: HTMLElement;
  private readonly team: HTMLElement;
  private readonly chal: HTMLElement;
  private readonly alerts: HTMLElement;
  private readonly alertEls: HTMLElement[] = [];
  private readonly alertMore: HTMLElement;
  private readonly mission: HTMLElement;
  private readonly blood: HTMLElement;
  private readonly status: HTMLElement;
  private readonly radioBox: HTMLElement;
  private radioT = 0;
  private readonly keys = new WeakMap<HTMLElement, string>();
  private genEls: HTMLElement[] = [];

  constructor(root: HTMLElement) {
    this.gens = el('div', 'tr-gens hidden', root);
    for (let i = 0; i < 6; i++) this.genEls.push(el('i', 'gen', this.gens, `${GEAR}<b>${i + 1}</b>`));
    this.team = el('div', 'tr-team hidden', root);
    this.chal = el('div', 'tr-chal hidden', root);
    // avisos do topo: no máximo TR_ALERT_MAX por vez (os dois elementos são reaproveitados), o resto vira "+N"
    this.alerts = el('div', 'tr-alerts', root);
    for (let i = 0; i < TR_ALERT_MAX; i++) this.alertEls.push(el('div', 'tr-alert hidden', this.alerts, '<i class="tr-arrow">▲</i><span></span><em></em>'));
    this.alertMore = el('div', 'tr-more hidden', this.alerts);
    this.mission = el('div', 'tr-mission hidden', root);
    this.blood = el('div', 'tr-blood hidden', root, '<span></span>');
    this.status = el('div', 'tr-status hidden', root);
    this.radioBox = el('div', 'tr-radio hidden', root);
  }

  // rádio de campanha: as linhas aparecem uma a uma embaixo da tela e somem depois de uns 12 s
  showRadio(titulo: string, linhas: string[]) {
    const box = this.radioBox;
    box.innerHTML = `<h4>${titulo}</h4>${linhas.map((l) => `<p>${l}</p>`).join('')}`;
    box.classList.remove('hidden', 'out');
    const ps = [...box.querySelectorAll<HTMLElement>('p')];
    ps.forEach((p, i) => { p.style.animationDelay = `${i * 2.2}s`; });
    const id = ++this.radioT;
    setTimeout(() => { if (id === this.radioT) box.classList.add('out'); }, 7000 + linhas.length * 2200);
    setTimeout(() => { if (id === this.radioT) box.classList.add('hidden'); }, 8000 + linhas.length * 2200);
  }

  // só reescreve a página quando o texto muda
  private put(e: HTMLElement, key: string, html: string) {
    if (this.keys.get(e) === key) return;
    this.keys.set(e, key);
    e.innerHTML = html;
  }

  setGens(gens: TrGen[] | null, t: number) {
    this.gens.classList.toggle('hidden', !gens);
    if (!gens) return;
    gens.forEach((g, i) => {
      const e = this.genEls[i];
      e.classList.toggle('on', g.on);
      e.classList.toggle('cap', g.capturing);
      e.classList.toggle('atk', g.attacked && Math.sin(t * 9) > -0.2);
      e.style.setProperty('--p', `${Math.round((g.capturing ? g.progress : g.on ? 1 : 0) * 360)}deg`);
      e.title = g.on ? 'Ligado' : g.capturing ? 'Capturando' : 'Desligado';
    });
  }

  // itens da equipe: ícones por conjunto (cinza = falta, colorido = já tem)
  setTeam(team: string[], built: { escudo: boolean; drone: boolean }, show: boolean) {
    this.team.classList.toggle('hidden', !show);
    if (!show) return;
    const has = new Set(team);
    const key = team.join(',') + `|${built.escudo}${built.drone}`;
    const slot = (k: string, color: string, glyph = '■') => `<u class="${has.has(k) ? 'got' : ''}" style="--c:${color}" title="${TEAM_ITEMS[k]?.name ?? k}">${glyph}</u>`;
    const row = (name: string, slots: string, note = '') => `<div class="tr-row"><span>${name}</span>${slots}${note ? `<small>${note}</small>` : ''}</div>`;
    const rows = [
      row('Escudo', SET_PARTS.escudo.map((k) => slot(k, '#c8c0b0', IC.shield)).join(''), built.escudo ? 'montado' : ''),
      row('Drone', SET_PARTS.drone.map((k) => slot(k, '#6aff8a', IC.drone)).join(''), built.drone ? 'montado' : ''),
      row('Portais', slot('gramofone', '#e8c070', '♫') + slot('disco', '#e8c070', '●')),
      row('Tábua', slot('tabua', '#9fd8ff', '▤')),
      ...ELEMENT_LIST.map((e) => row(ELEMENTS[e].name, [1, 2, 3].map((n) => slot(`${e}-${n}`, ELEMENTS[e].color)).join('') + slot(`cristal-${e}`, ELEMENTS[e].color, '◆'))),
    ];
    this.put(this.team, key, `<h4>Equipe</h4>${rows.join('')}`);
  }

  setChallenges(show: boolean, ch: number[], claimed: boolean[], goals: number[]) {
    this.chal.classList.toggle('hidden', !show);
    if (!show) return;
    const key = ch.join(',') + claimed.join(',');
    const rows = CHALLENGE_TEXT.map((c, i) => {
      const done = (ch[i] ?? 0) >= goals[i];
      const state = claimed[i] ? '✔ retirado' : done ? '★ pronto' : goals[i] > 1 ? `${Math.min(ch[i] ?? 0, goals[i])}/${goals[i]}` : '…';
      return `<div class="tr-c ${claimed[i] ? 'claimed' : done ? 'done' : ''}"><b>${i + 1}</b><span>${c.name}<small>Prêmio: ${c.prize}</small></span><em>${state}</em></div>`;
    });
    this.put(this.chal, key, `<h4>Desafios</h4>${rows.join('')}`);
  }

  // Avisos do topo, por prioridade (1 = mais urgente). Mostra os TR_ALERT_MAX primeiros; o que não cabe vira "+N".
  setAlerts(list: TrAlert[]) {
    const sorted = [...list].sort((p, q) => p.prio - q.prio);
    this.alertEls.forEach((e, i) => {
      const a = sorted[i];
      e.classList.toggle('hidden', !a);
      if (!a) return;
      e.dataset.id = a.id;
      e.style.setProperty('--c', a.color);
      e.classList.toggle('danger', !!a.danger);
      const key = `${a.id}|${a.text}|${a.dist ?? ''}`;
      if (this.keys.get(e) !== key) {
        this.keys.set(e, key);
        e.querySelector('span')!.innerHTML = a.text;
        e.querySelector('em')!.textContent = a.dist === null ? '' : `${a.dist} m`;
      }
      const ar = e.querySelector<HTMLElement>('.tr-arrow')!;
      ar.style.visibility = a.angle === null ? 'hidden' : 'visible';
      if (a.angle !== null) ar.style.transform = `rotate(${a.angle.toFixed(1)}deg)`;
    });
    const extra = Math.max(0, sorted.length - TR_ALERT_MAX);
    this.alertMore.classList.toggle('hidden', extra === 0);
    const t = extra ? `+${extra}` : '';
    if (this.alertMore.textContent !== t) this.alertMore.textContent = t;
    this.alertMore.title = sorted.slice(TR_ALERT_MAX).map((a) => a.text.replace(/<[^>]+>/g, '')).join('\n');
  }

  setMission(info: { step: number; count: number; t: number } | null) {
    this.mission.classList.toggle('hidden', !info);
    if (!info) return;
    const { step, count, t } = info;
    // step: 1 a 5 = objetivo atual, 6 = concluída
    const cur = step - 1;
    const extra = step === 3 ? ` · ${count}/100 · ${Math.ceil(t)} rodada${Math.ceil(t) === 1 ? '' : 's'}` : step === 4 ? ` · ${count}/3 olhos` : step === 5 && t > 0 ? ` · ${Math.ceil(t)} s` : '';
    const key = `${step}|${count}|${Math.ceil(t)}`;
    const list = MISSAO_STEPS.map((s, i) => `<li class="${i < cur ? 'ok' : i === cur ? 'now' : ''}">${s}${i === cur ? extra : ''}</li>`).join('');
    this.put(this.mission, key, `<h4>Canção da Escavação</h4><ol>${list}</ol>`);
  }

  // Sangue Morto: borda vermelha e segundos que faltam
  setZblood(secs: number) {
    const on = secs > 0;
    this.blood.classList.toggle('hidden', !on);
    this.blood.classList.toggle('ending', on && secs < 5);
    if (!on) return;
    const t = String(Math.ceil(secs));
    const sp = this.blood.querySelector('span')!;
    if (sp.textContent !== t) sp.textContent = t;
  }

  setStatus(info: { shield: number; shieldMax: number; artilharia: number; weather: Weather; punho: boolean; golden: boolean; zone: string | null } | null) {
    this.status.classList.toggle('hidden', !info);
    if (!info) return;
    const key = `${Math.round(info.shield)}|${info.artilharia}|${info.weather}|${info.punho}|${info.golden}|${info.zone ?? ''}`;
    const parts: string[] = [];
    if (info.shield > 0) parts.push(`<div class="st shield"><b>${IC.shield}</b><div class="bar"><i style="width:${Math.round((info.shield / info.shieldMax) * 100)}%"></i></div></div>`);
    if (info.artilharia > 0) parts.push(`<div class="st art" title="Granada de Artilharia"><b>✹</b><span>${info.artilharia}</span></div>`);
    if (info.punho) parts.push('<div class="st fist" title="Punho de Ferro"><b>${IC.fist}</b></div>');
    if (info.golden) parts.push('<div class="st gold" title="Pá Dourada"><b>${IC.shovel}</b></div>');
    parts.push(`<div class="st wx" title="${WEATHER_NAME[info.weather]}"><b>${WEATHER_ICON[info.weather]}</b></div>`);
    this.put(this.status, key, parts.join(''));
  }
}

export class Hud {
  readonly root: HTMLElement;
  private readonly round: HTMLElement;
  private readonly statsEl: HTMLElement;
  private readonly leftVal: HTMLElement;
  private readonly timeVal: HTMLElement;
  private burnTimer: ReturnType<typeof setTimeout> | undefined;
  private leftKey = '';
  private timeKey = '';
  private readonly perksEl: HTMLElement;
  private perksKey = '';
  private readonly scores: HTMLElement;
  private readonly popups: HTMLElement;
  private readonly ammoMag: HTMLElement;
  private readonly ammoRes: HTMLElement;
  private readonly weapon: HTMLElement;
  private readonly nades: HTMLElement;
  private nadesN = -1;
  private readonly cross: HTMLElement;
  private readonly hit: HTMLElement;
  private readonly vignette: HTMLElement;
  private readonly hurtLayer: HTMLElement;
  private readonly dirs: HTMLElement;
  private readonly promptEl: HTMLElement;
  private readonly promptText: HTMLElement;
  private readonly promptBar: HTMLElement;
  private readonly down: HTMLElement;
  private readonly downBar: HTMLElement;
  private readonly downText: HTMLElement;
  private readonly markersEl: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly info: HTMLElement;
  private readonly feed: HTMLElement;
  private readonly click: HTMLElement;
  private readonly scopeEl: HTMLElement;
  private readonly banner: HTMLElement;
  private hellOn = false;
  private readonly bossBar: HTMLElement;
  private bossKey = '';
  private readonly effectsEl: HTMLElement;
  private readonly flashEl: HTMLElement;
  private readonly emberEl: HTMLElement;
  private effectsKey = '';
  private scopeKey = '';
  private readonly intro: HTMLElement;
  private readonly overlay: HTMLElement;
  private hitT = 0;
  private hurt = 0;
  // últimos valores escritos na página: só reescreve quando muda (evita retrabalho do navegador)
  private last = { gap: -1, cross: true, hit: '', vig: '', hurt: '', mag: '', res: '', name: '', low: false, resLow: false };
  private chargeEl: HTMLElement;
  private lastCharge = -1;
  private lastRound = -1;
  private scoreRows = new Map<string, HTMLElement>();

  constructor(container: HTMLElement) {
    this.root = el('div', 'hud', container);
    this.scopeEl = el('div', 'scope hidden', this.root);
    this.flashEl = el('div', 'flash', this.root);
    this.chargeEl = el('div', 'charge-ring hidden', this.root);
    this.emberEl = el('div', 'emberflash', this.root);
    this.effectsEl = el('div', 'effects', this.root);
    this.vignette = el('div', 'vignette', this.root);
    this.hurtLayer = el('div', 'hurt', this.root);
    this.dirs = el('div', 'hitdirs', this.root);
    this.markersEl = el('div', 'markers', this.root);

    this.cross = el('div', 'crosshair', this.root, '<i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="dot"></i>');
    this.hit = el('div', 'hitmarker', this.root, '<i></i><i></i><i></i><i></i>');

    this.perksEl = el('div', 'perks', this.root);
    this.round = el('div', 'round', this.root);
    // canto de cima à direita: zumbis que faltam para acabar a rodada e há quanto tempo a partida corre
    this.statsEl = el('div', 'stats', this.root);
    this.leftVal = el('b', '', el('div', 'stat left', this.statsEl, '<span>Zumbis restantes</span>'));
    this.timeVal = el('b', '', el('div', 'stat time', this.statsEl, '<span>Tempo de jogo</span>'));
    this.banner = el('div', 'banner hidden', this.root);
    this.bossBar = el('div', 'bossbar hidden', this.root);
    this.bossBar.innerHTML = '<span class="bossname">O CARRASCO</span><div class="bossfill"><i></i><b></b></div>';
    const right = el('div', 'bottom-right', this.root);
    this.scores = el('div', 'scores', right);
    this.popups = el('div', 'popups', right);
    const ammo = el('div', 'ammo', right);
    this.nades = el('div', 'nades', ammo);
    this.weapon = el('div', 'weapon-name', ammo);
    const nums = el('div', 'ammo-nums', ammo);
    this.ammoMag = el('span', 'mag', nums);
    el('span', 'sep', nums, '/');
    this.ammoRes = el('span', 'reserve', nums);

    this.hint = el('div', 'hint', this.root);
    this.promptEl = el('div', 'prompt hidden', this.root);
    this.promptText = el('div', 'prompt-text', this.promptEl);
    const pb = el('div', 'prompt-bar', this.promptEl);
    this.promptBar = el('i', '', pb);

    this.down = el('div', 'downed hidden', this.root);
    el('div', 'downed-title', this.down, 'VOCÊ CAIU');
    this.downText = el('div', 'downed-text', this.down);
    const db = el('div', 'downed-bar', this.down);
    this.downBar = el('i', '', db);

    this.feed = el('div', 'feed', this.root);
    this.click = el('div', 'click-to-play hidden', this.root, 'Clique na tela para jogar');
    this.info = el('div', 'netinfo', this.root);
    this.intro = el('div', 'intro', this.root);
    this.overlay = el('div', 'overlay hidden', this.root);
  }

  setRound(n: number) {
    if (n === this.lastRound) return;
    const first = this.lastRound < 0;
    this.lastRound = n;
    this.round.classList.remove('pulse');
    this.round.innerHTML = n <= 0 ? '' : n <= 5 ? tallySVG(n) : `<span class="round-num">${n}</span>`;
    if (!first) {
      this.round.classList.remove('appear');
      void this.round.offsetWidth;
      this.round.classList.add('appear');
    }
  }

  // Zumbis que faltam para acabar a rodada (null entre rodadas) e tempo de partida em segundos.
  setStats(left: number | null, secs: number) {
    const l = left === null ? '—' : String(Math.max(0, left));
    if (l !== this.leftKey) {
      this.leftKey = l;
      this.leftVal.textContent = l;
      this.leftVal.parentElement!.classList.toggle('idle', left === null);
    }
    const t = Math.max(0, Math.floor(secs));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const sec = t % 60;
    const txt = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    if (txt !== this.timeKey) {
      this.timeKey = txt;
      this.timeVal.textContent = txt;
    }
  }

  // queimando: a borda da tela acende em laranja por um instante
  burning() {
    this.root.classList.add('burning');
    clearTimeout(this.burnTimer);
    this.burnTimer = setTimeout(() => this.root.classList.remove('burning'), 700);
  }

  // rodada infernal: contador em brasa e borda vermelha na tela
  setHell(on: boolean) {
    if (on === this.hellOn) return;
    this.hellOn = on;
    this.round.classList.toggle('hell', on);
    this.root.classList.toggle('hell', on);
  }

  // barra de vida do Carrasco no alto da tela (marca dos 30% = capacete)
  // barra de vida do chefão (Carrasco ou Bispo); armor = capacete ou escudo de fogo
  setBoss(b: { hp: number; armor: boolean } | null, name = 'O CARRASCO') {
    const key = b ? name + b.hp.toFixed(3) + (b.armor ? 'a' : '') : '';
    if (key === this.bossKey) return;
    this.bossKey = key;
    this.bossBar.classList.toggle('hidden', !b);
    if (!b) return;
    (this.bossBar.querySelector('.bossname') as HTMLElement).textContent = name;
    (this.bossBar.querySelector('i') as HTMLElement).style.width = `${Math.round(b.hp * 1000) / 10}%`;
    this.bossBar.classList.toggle('armored', b.armor);
  }

  // letreiro grande no meio da tela, que some sozinho
  showBanner(text: string, kind: 'hell' | 'zone' = 'hell') {
    this.banner.textContent = text;
    this.banner.classList.toggle('zone', kind === 'zone');
    this.banner.classList.remove('hidden', 'go');
    void this.banner.offsetWidth;
    this.banner.classList.add('go');
  }

  roundEnded() {
    this.round.classList.add('pulse');
  }

  setScores(players: NetPlayer[], localId: string) {
    const ids = new Set(players.map((p) => p.id));
    for (const [id, row] of this.scoreRows) {
      if (!ids.has(id)) {
        row.remove();
        this.scoreRows.delete(id);
      }
    }
    const sorted = [...players].sort((a, b) => a.slot - b.slot);
    for (const p of sorted) {
      let row = this.scoreRows.get(p.id);
      if (!row) {
        row = el('div', 'score-row', this.scores);
        row.style.color = PLAYER_COLORS[p.slot % PLAYER_COLORS.length];
        if (p.id === localId) row.classList.add('me');
        row.append(emblemCanvas(p.level ?? 1, 44), el('span', 'pts'));
        this.scoreRows.set(p.id, row);
      }
      const txt = String(p.points);
      const span = row.querySelector('.pts')!;
      if (span.textContent !== txt) span.textContent = txt;
      row.classList.toggle('fallen', p.life !== 'alive');
    }
  }

  popPoints(delta: number, slot: number) {
    const e = el('div', `popup ${delta < 0 ? 'neg' : ''}`, this.popups, `${delta > 0 ? '+' : ''}${delta}`);
    e.style.color = delta < 0 ? '#d23a2a' : PLAYER_COLORS[slot % PLAYER_COLORS.length];
    e.style.setProperty('--dx', `${-20 - Math.random() * 60}px`);
    e.style.setProperty('--dy', `${-30 - Math.random() * 40}px`);
    setTimeout(() => e.remove(), 1000);
  }

  // Pistolas duplas: um pente por pistola (clique esquerdo = pistola da esquerda, clique direito = pistola da direita) e a reserva comum.
  setAmmoDual(right: number, left: number, reserve: number, name: string, magSize: number) {
    const L = this.last;
    if (L.name !== name) this.weapon.textContent = L.name = name;
    const key = `${right}|${left}`;
    if (L.mag !== key) {
      L.mag = key;
      const cls = (n: number) => (n <= Math.ceil(magSize * 0.25) ? ' low' : '');
      this.ammoMag.innerHTML = `<span class="dm${cls(left)}"><i>◀ clique esq.</i>${left}</span><span class="dm${cls(right)}"><i>clique dir. ▶</i>${right}</span>`;
      this.ammoMag.classList.add('dual');
      L.low = false;
    }
    if (L.res !== String(reserve)) this.ammoRes.textContent = L.res = String(reserve);
    const resLow = reserve <= magSize;
    if (L.resLow !== resLow) this.ammoRes.classList.toggle('low', (L.resLow = resLow));
    let hint = '';
    if (right === 0 && left === 0 && reserve === 0) hint = 'Sem munição';
    else if ((right <= Math.ceil(magSize * 0.25) || left <= Math.ceil(magSize * 0.25)) && reserve > 0 && (right < magSize || left < magSize)) hint = `Pressione <b>${this.reloadKey}</b> para recarregar`;
    if (this.hint.innerHTML !== hint) this.hint.innerHTML = hint;
  }

  setAmmo(mag: number, reserve: number, name: string, magSize: number) {
    const L = this.last;
    if (this.ammoMag.classList.contains('dual')) {
      // voltou a uma arma comum: refaz o número simples
      this.ammoMag.classList.remove('dual');
      this.ammoMag.textContent = '';
      L.mag = '';
    }
    if (L.name !== name) this.weapon.textContent = L.name = name;
    if (L.mag !== String(mag)) this.ammoMag.textContent = L.mag = String(mag);
    if (L.res !== String(reserve)) this.ammoRes.textContent = L.res = String(reserve);
    const low = mag <= Math.ceil(magSize * 0.25);
    if (L.low !== low) this.ammoMag.classList.toggle('low', (L.low = low));
    // reserva acabando: cor de alerta
    const resLow = reserve <= magSize;
    if (L.resLow !== resLow) this.ammoRes.classList.toggle('low', (L.resLow = resLow));
    let hint = '';
    if (mag === 0 && reserve === 0) hint = 'Sem munição';
    else if (mag < magSize && mag <= Math.ceil(magSize * 0.25) && reserve > 0) hint = `Pressione <b>${this.reloadKey}</b> para recarregar`;
    if (this.hint.innerHTML !== hint) this.hint.innerHTML = hint;
  }

  setGrenades(n: number) {
    if (n === this.nadesN) return;
    this.nadesN = n;
    this.nades.innerHTML = '<i></i>'.repeat(Math.max(0, n));
  }

  // anel de carga do cajado desperto na mira (0 = escondido)
  setCharge(f: number) {
    const k = f > 0.01 ? Math.round(f * 100) : 0;
    if (k === this.lastCharge) return;
    this.lastCharge = k;
    this.chargeEl.classList.toggle('hidden', k === 0);
    this.chargeEl.style.setProperty('--f', `${k * 3.6}deg`);
    this.chargeEl.classList.toggle('full', k >= 100);
  }

  setCrosshair(gap: number, visible: boolean) {
    const g = Math.round(gap);
    if (g !== this.last.gap) this.cross.style.setProperty('--gap', `${(this.last.gap = g)}px`);
    if (visible !== this.last.cross) this.cross.classList.toggle('hidden', !(this.last.cross = visible));
  }

  hitmarker(kill: boolean) {
    this.hitT = kill ? 0.3 : 0.18;
    this.hit.classList.toggle('kill', kill);
  }

  hurtFrom(angle: number | null) {
    this.hurt = 1;
    if (angle === null) return;
    const d = el('div', 'hitdir', this.dirs, '<i></i>');
    d.style.transform = `rotate(${angle}rad)`;
    setTimeout(() => d.remove(), 1200);
  }

  update(dt: number, health: number, maxHealth: number) {
    const L = this.last;
    this.hitT -= dt;
    const hit = this.hitT > 0 ? Math.min(1, this.hitT * 6).toFixed(2) : '0';
    if (hit !== L.hit) this.hit.style.opacity = L.hit = hit;
    this.hurt = Math.max(0, this.hurt - dt * 1.8);
    const low = 1 - Math.max(0, Math.min(1, health / maxHealth));
    const vig = Math.min(1, low * 1.1).toFixed(2);
    if (vig !== L.vig) this.vignette.style.opacity = L.vig = vig;
    const hurt = (this.hurt * 0.55).toFixed(2);
    if (hurt !== L.hurt) this.hurtLayer.style.opacity = L.hurt = hurt;
  }

  setPerks(perks: PerkId[]) {
    const key = perks.join(',');
    if (key === this.perksKey) return;
    const added = perks.find((p) => !this.perksKey.split(',').includes(p));
    this.perksKey = key;
    this.perksEl.innerHTML = '';
    for (const id of perks) {
      const d = PERKS[id];
      const e = el('div', `perk-icon${id === added ? ' new' : ''}`, this.perksEl, PERK_SVG[id] ? `<svg viewBox="0 0 24 24" fill="#fff">${PERK_SVG[id]}</svg>` : d.icon);
      e.style.setProperty('--c', d.color);
      e.title = d.name;
    }
  }

  prompt(text: string | null, progress: number | null = null, bad = false) {
    this.promptEl.classList.toggle('hidden', !text);
    if (!text) return;
    this.promptEl.classList.toggle('bad', bad);
    if (this.promptText.innerHTML !== text) this.promptText.innerHTML = text;
    (this.promptBar.parentElement as HTMLElement).classList.toggle('hidden', progress === null);
    if (progress !== null) this.promptBar.style.width = `${Math.round(progress * 100)}%`;
  }

  downed(show: boolean, bleedFrac = 0, text = '') {
    this.down.classList.toggle('hidden', !show);
    this.root.classList.toggle('is-downed', show);
    if (!show) return;
    this.downBar.style.width = `${Math.round(bleedFrac * 100)}%`;
    if (this.downText.textContent !== text) this.downText.textContent = text;
  }

  markers(list: Marker[]) {
    while (this.markersEl.children.length < list.length) el('div', 'marker', this.markersEl, '<b>✚</b><span></span>');
    while (this.markersEl.children.length > list.length) this.markersEl.lastElementChild!.remove();
    list.forEach((m, i) => {
      const e = this.markersEl.children[i] as HTMLElement;
      e.style.left = `${m.x}px`;
      e.style.top = `${m.y}px`;
      e.style.color = m.color;
      e.classList.toggle('edge', !m.onScreen);
      e.classList.toggle('pu', !!m.item);
      const b = e.querySelector('b')!;
      const icon = m.icon ?? '✚';
      if (b.textContent !== icon) b.textContent = icon;
      const span = e.querySelector('span')!;
      if (span.textContent !== m.label) span.textContent = m.label;
    });
  }

  // Efeitos ativos (Golpe Fatal, Pontos em Dobro, Liquidação) com os segundos que faltam.
  setEffects(e: { insta: number; double: number; firesale: number } | undefined) {
    const list = e ? (['insta', 'double', 'firesale'] as PowerupKind[]).filter((k) => e[k as 'insta'] > 0) : [];
    const key = list.map((k) => `${k}:${Math.ceil(e![k as 'insta'])}`).join(',');
    if (key === this.effectsKey) return;
    this.effectsKey = key;
    this.effectsEl.innerHTML = list
      .map((k) => {
        const d = POWERUPS[k];
        const left = Math.ceil(e![k as 'insta']);
        return `<div class="effect ${left <= 5 ? 'ending' : ''}" style="--c:${d.color}"><b>${d.glyph}</b><span>${left}</span></div>`;
      })
      .join('');
  }

  // clarão branco na tela (Bomba)
  // clarão alaranjado de brasa (arma forjada na mão)
  emberFlash() {
    this.emberEl.classList.remove('go');
    void this.emberEl.offsetWidth;
    this.emberEl.classList.add('go');
  }

  whiteFlash() {
    this.flashEl.classList.remove('go');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('go');
  }

  // tela da luneta: a do fuzil de precisão (cruz) ou a luneta 2× da Oficina (poste e ponto)
  scope(show: boolean, kind: 'sniper' | 'luneta' = 'sniper') {
    const key = show ? kind : '';
    if (key === this.scopeKey) return;
    this.scopeKey = key;
    this.scopeEl.classList.toggle('hidden', !show);
    this.scopeEl.classList.toggle('luneta', kind === 'luneta');
  }

  clickToPlay(show: boolean) {
    this.click.classList.toggle('hidden', !show);
  }

  notify(html: string) {
    const e = el('div', 'note', this.feed, html);
    setTimeout(() => e.classList.add('out'), 4500);
    setTimeout(() => e.remove(), 5200);
  }

  // Painel do ônibus (mapa Rota): onde ele está, quando sai e uma seta apontando para ele
  private busEl: HTMLElement | null = null;
  private busKey = '';
  setBus(info: { text: string; angle: number | null; dist: number | null; leaving: boolean } | null) {
    if (!this.busEl) this.busEl = el('div', 'bus-info hidden', this.root, '<i class="bus-arrow">▲</i><span></span><em></em>');
    const e = this.busEl;
    e.classList.toggle('hidden', !info);
    if (!info) return;
    const key = info.text + '|' + (info.dist ?? '') + '|' + info.leaving;
    if (key !== this.busKey) {
      this.busKey = key;
      e.querySelector('span')!.textContent = info.text;
      e.querySelector('em')!.textContent = info.dist === null ? '' : `${info.dist} m`;
      e.classList.toggle('leaving', info.leaving);
    }
    const arrow = e.querySelector<HTMLElement>('.bus-arrow')!;
    arrow.style.visibility = info.angle === null ? 'hidden' : 'visible';
    if (info.angle !== null) arrow.style.transform = `rotate(${info.angle.toFixed(1)}deg)`;
  }

  netinfo(text: string) {
    if (this.info.textContent !== text) this.info.textContent = text;
  }

  showIntro(lines: string[]) {
    this.intro.innerHTML = '';
    lines.forEach((l, i) => {
      const d = el('div', 'intro-line', this.intro, '');
      d.style.animationDelay = `${0.4 + i * 0.9}s`;
      // digita pelo relógio (45 ms por letra), não pela contagem de ticks: com o quadro pesado os ticks atrasam
      setTimeout(() => {
        const t0 = performance.now();
        const iv = setInterval(() => {
          const k = Math.min(l.length, Math.floor((performance.now() - t0) / 45) + 1);
          d.textContent = l.slice(0, k);
          if (k >= l.length) clearInterval(iv);
        }, 45);
      }, 400 + i * 900);
    });
    this.intro.classList.remove('fade');
    setTimeout(() => this.intro.classList.add('fade'), 6500);
  }

  // tecla de recarregar escolhida pelo jogador (para a dica de munição)
  reloadKey = 'R';

  showOverlay(html: string): HTMLElement {
    this.overlay.innerHTML = html;
    this.overlay.classList.remove('hidden');
    this.root.classList.add('menu-open');
    return this.overlay;
  }

  hideOverlay() {
    this.overlay.classList.add('hidden');
    this.overlay.innerHTML = '';
    this.root.classList.remove('menu-open');
  }

  get overlayOpen() {
    return !this.overlay.classList.contains('hidden');
  }

  // painéis da Trincheira (criados na primeira vez que alguém pede)
  private trHud: TrHud | null = null;
  get tr(): TrHud {
    if (!this.trHud) this.trHud = new TrHud(this.root);
    return this.trHud;
  }

  dispose() {
    this.root.remove();
  }
}
