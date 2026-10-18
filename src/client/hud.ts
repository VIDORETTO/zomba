import { PLAYER_COLORS } from '../shared/constants';
import { PERKS, type PerkId } from '../shared/perks';
import { POWERUPS, type PowerupKind } from '../shared/powerups';
import { emblemCanvas } from './emblems';
import type { NetPlayer } from '../shared/protocol';

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
}

export class Hud {
  readonly root: HTMLElement;
  private readonly round: HTMLElement;
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
  private last = { gap: -1, cross: true, hit: '', vig: '', hurt: '', mag: '', res: '', name: '', low: false };
  private lastRound = -1;
  private scoreRows = new Map<string, HTMLElement>();

  constructor(container: HTMLElement) {
    this.root = el('div', 'hud', container);
    this.scopeEl = el('div', 'scope hidden', this.root);
    this.flashEl = el('div', 'flash', this.root);
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
      row.classList.toggle('downed', p.life !== 'alive');
    }
  }

  popPoints(delta: number, slot: number) {
    const e = el('div', `popup ${delta < 0 ? 'neg' : ''}`, this.popups, `${delta > 0 ? '+' : ''}${delta}`);
    e.style.color = delta < 0 ? '#d23a2a' : PLAYER_COLORS[slot % PLAYER_COLORS.length];
    e.style.setProperty('--dx', `${-20 - Math.random() * 60}px`);
    e.style.setProperty('--dy', `${-30 - Math.random() * 40}px`);
    setTimeout(() => e.remove(), 1000);
  }

  setAmmo(mag: number, reserve: number, name: string, magSize: number) {
    const L = this.last;
    if (L.name !== name) this.weapon.textContent = L.name = name;
    if (L.mag !== String(mag)) this.ammoMag.textContent = L.mag = String(mag);
    if (L.res !== String(reserve)) this.ammoRes.textContent = L.res = String(reserve);
    const low = mag <= Math.ceil(magSize * 0.25);
    if (L.low !== low) this.ammoMag.classList.toggle('low', (L.low = low));
    let hint = '';
    if (mag === 0 && reserve === 0) hint = 'Sem munição';
    else if (mag < magSize && mag <= Math.ceil(magSize * 0.25) && reserve > 0) hint = 'Pressione <b>R</b> para recarregar';
    if (this.hint.innerHTML !== hint) this.hint.innerHTML = hint;
  }

  setGrenades(n: number) {
    if (n === this.nadesN) return;
    this.nadesN = n;
    this.nades.innerHTML = '<i></i>'.repeat(Math.max(0, n));
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
      const e = el('div', `perk-icon${id === added ? ' new' : ''}`, this.perksEl, d.icon);
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

  netinfo(text: string) {
    if (this.info.textContent !== text) this.info.textContent = text;
  }

  showIntro(lines: string[]) {
    this.intro.innerHTML = '';
    lines.forEach((l, i) => {
      const d = el('div', 'intro-line', this.intro, '');
      d.style.animationDelay = `${0.4 + i * 0.9}s`;
      let k = 0;
      setTimeout(() => {
        const iv = setInterval(() => {
          d.textContent = l.slice(0, ++k);
          if (k >= l.length) clearInterval(iv);
        }, 45);
      }, 400 + i * 900);
    });
    this.intro.classList.remove('fade');
    setTimeout(() => this.intro.classList.add('fade'), 6500);
  }

  showOverlay(html: string): HTMLElement {
    this.overlay.innerHTML = html;
    this.overlay.classList.remove('hidden');
    return this.overlay;
  }

  hideOverlay() {
    this.overlay.classList.add('hidden');
    this.overlay.innerHTML = '';
  }

  get overlayOpen() {
    return !this.overlay.classList.contains('hidden');
  }

  dispose() {
    this.root.remove();
  }
}
