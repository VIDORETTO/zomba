import { rankOf, type Patente, type Tier } from '../shared/progress';

// Emblemas das patentes, desenhados em canvas: osso, ossos cruzados, caveira, caveira com faca,
// caveira e escopetas, e a Lenda (caveira de ferro em chamas, com faíscas e moldura de metal).

type Ctx = CanvasRenderingContext2D;

const PALETTE: Record<Tier, { base: string; dark: string; light: string }> = {
  ferro: { base: '#8d939a', dark: '#2f3338', light: '#c9cfd5' },
  bronze: { base: '#b5763c', dark: '#3e2310', light: '#e8ac70' },
  prata: { base: '#cfd5db', dark: '#4a5058', light: '#ffffff' },
  ouro: { base: '#e2b041', dark: '#5a3c08', light: '#fff0a6' },
  brilho: { base: '#ffcf3e', dark: '#6a3c00', light: '#fffbe2' },
};

function bone(ctx: Ctx, cx: number, cy: number, len: number, rot: number, w: number, c: { base: string; dark: string; light: string }) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  const half = len / 2;
  const r = w * 0.36;
  ctx.beginPath();
  ctx.rect(-half + r, -w * 0.22, len - r * 2, w * 0.44);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) ctx.arc(sx * (half - r), sy * w * 0.24, r, 0, Math.PI * 2);
  }
  ctx.fillStyle = c.base;
  ctx.strokeStyle = c.dark;
  ctx.lineWidth = 3;
  // contorno do conjunto: desenha o traço antes do preenchimento para as junções ficarem limpas
  ctx.stroke();
  ctx.fill();
  ctx.fillStyle = c.light;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(-half + r, -w * 0.18, len - r * 2, w * 0.1);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function skull(ctx: Ctx, cx: number, cy: number, s: number, c: { base: string; dark: string; light: string }, eyes = c.dark) {
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = c.dark;
  ctx.fillStyle = c.base;
  ctx.beginPath();
  ctx.ellipse(cx, cy - s * 0.12, s * 0.5, s * 0.47, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(cx - s * 0.3, cy + s * 0.18, s * 0.6, s * 0.34, s * 0.08);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = c.light;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.18, cy - s * 0.38, s * 0.16, s * 0.08, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = eyes;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + sx * s * 0.19, cy - s * 0.04, s * 0.14, s * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.08);
  ctx.lineTo(cx - s * 0.07, cy + s * 0.2);
  ctx.lineTo(cx + s * 0.07, cy + s * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * s * 0.1, cy + s * 0.28);
    ctx.lineTo(cx + i * s * 0.1, cy + s * 0.48);
    ctx.stroke();
  }
  ctx.restore();
}

function knife(ctx: Ctx, cx: number, top: number, s: number, c: { base: string; dark: string; light: string }) {
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = c.dark;
  // lâmina entrando no topo da caveira
  ctx.fillStyle = '#d8dde2';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.08, top);
  ctx.lineTo(cx + s * 0.08, top);
  ctx.lineTo(cx + s * 0.06, top + s * 0.62);
  ctx.lineTo(cx, top + s * 0.72);
  ctx.lineTo(cx - s * 0.06, top + s * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = c.base;
  ctx.fillRect(cx - s * 0.2, top - s * 0.06, s * 0.4, s * 0.08);
  ctx.strokeRect(cx - s * 0.2, top - s * 0.06, s * 0.4, s * 0.08);
  ctx.fillStyle = '#3a2418';
  ctx.fillRect(cx - s * 0.07, top - s * 0.36, s * 0.14, s * 0.3);
  ctx.strokeRect(cx - s * 0.07, top - s * 0.36, s * 0.14, s * 0.3);
  ctx.restore();
}

function shotgun(ctx: Ctx, cx: number, cy: number, len: number, rot: number, c: { base: string; dark: string; light: string }) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = c.dark;
  ctx.fillStyle = '#5a5e64';
  ctx.fillRect(-len / 2, -4, len * 0.62, 8);
  ctx.strokeRect(-len / 2, -4, len * 0.62, 8);
  ctx.fillStyle = c.base;
  ctx.beginPath();
  ctx.moveTo(len * 0.12, -5);
  ctx.lineTo(len / 2, -2);
  ctx.lineTo(len / 2, 12);
  ctx.lineTo(len * 0.12, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function frame(ctx: Ctx, S: number, c: { base: string; dark: string; light: string }) {
  ctx.save();
  ctx.lineWidth = S * 0.05;
  ctx.strokeStyle = c.dark;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = S * 0.025;
  ctx.strokeStyle = c.base;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = c.light;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(S / 2 + Math.cos(a) * S * 0.45, S / 2 + Math.sin(a) * S * 0.45, S * 0.018, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Desenha o emblema do nível. t = tempo (s), usado para animar a Lenda e o brilho do ouro.
export function drawEmblem(canvas: HTMLCanvasElement, level: number, t = 0) {
  const S = canvas.width;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);
  const { patente, tier } = rankOf(level);
  const c = PALETTE[tier];
  const k = S / 128;
  ctx.save();
  if (tier === 'brilho' && patente !== 'lenda') {
    ctx.shadowColor = 'rgba(255,200,60,0.9)';
    ctx.shadowBlur = 10 * k + Math.sin(t * 3) * 4 * k;
  }
  const draw: Record<Patente, () => void> = {
    osso: () => bone(ctx, S / 2, S / 2, 88 * k, -0.6, 22 * k, c),
    ossos: () => {
      bone(ctx, S / 2, S / 2, 92 * k, -0.78, 20 * k, c);
      bone(ctx, S / 2, S / 2, 92 * k, 0.78, 20 * k, c);
    },
    caveira: () => skull(ctx, S / 2, S * 0.55, 70 * k, c),
    faca: () => {
      skull(ctx, S / 2, S * 0.6, 64 * k, c);
      knife(ctx, S / 2, S * 0.28, 64 * k, c);
    },
    escopetas: () => {
      shotgun(ctx, S / 2, S / 2, 110 * k, -0.72, c);
      shotgun(ctx, S / 2, S / 2, 110 * k, Math.PI + 0.72, c);
      skull(ctx, S / 2, S * 0.55, 60 * k, c);
    },
    lenda: () => legend(ctx, S, t),
  };
  if (patente !== 'lenda') frame(ctx, S, c);
  draw[patente]();
  ctx.restore();
}

// Lenda: chamas atrás, caveira de ferro escuro com olhos em brasa, moldura de metal batido e faíscas.
function legend(ctx: Ctx, S: number, t: number) {
  const cx = S / 2;
  const cy = S * 0.56;
  // chamas
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const flick = 0.75 + 0.25 * Math.sin(t * 7 + i * 1.7) + 0.1 * Math.sin(t * 13 + i);
    const r = S * 0.34 * flick;
    const g = ctx.createRadialGradient(cx, cy, S * 0.1, cx, cy - S * 0.05, r);
    g.addColorStop(0, 'rgba(255,220,120,0.9)');
    g.addColorStop(0.5, 'rgba(255,110,20,0.6)');
    g.addColorStop(1, 'rgba(140,20,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy - S * 0.04, r, a, a + 0.5);
    ctx.closePath();
    ctx.fill();
  }
  const top = ctx.createLinearGradient(cx, cy - S * 0.5, cx, cy);
  top.addColorStop(0, 'rgba(255,120,30,0)');
  top.addColorStop(1, 'rgba(255,120,30,0.5)');
  ctx.fillStyle = top;
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const x = cx - S * 0.3 + (i / 6) * S * 0.6;
    const h = S * (0.28 + 0.1 * Math.sin(t * 6 + i * 2));
    if (i === 0) ctx.moveTo(x, cy - S * 0.1);
    ctx.quadraticCurveTo(x - S * 0.05, cy - S * 0.1 - h, x, cy - S * 0.1);
  }
  ctx.fill();
  // moldura de ferro batido
  frame(ctx, S, { base: '#4a4e55', dark: '#121417', light: '#c8742c' });
  const iron = { base: '#3b3f45', dark: '#0e0f11', light: '#8a9098' };
  const pulse = 0.6 + 0.4 * Math.sin(t * 4);
  ctx.save();
  ctx.shadowColor = 'rgba(255,90,10,0.9)';
  ctx.shadowBlur = S * 0.08 * pulse;
  skull(ctx, cx, cy, S * 0.52, iron, `rgba(255,${Math.round(120 + 80 * pulse)},30,1)`);
  ctx.restore();
  // faíscas subindo
  for (let i = 0; i < 10; i++) {
    const p = (t * 0.6 + i / 10) % 1;
    const x = cx + Math.sin(i * 12.9 + t) * S * 0.3;
    const y = cy - p * S * 0.55;
    ctx.fillStyle = `rgba(255,${150 + i * 8},60,${1 - p})`;
    ctx.fillRect(x, y, S * 0.02, S * 0.02);
  }
}

export function emblemCanvas(level: number, size = 64): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  drawEmblem(c, level);
  return c;
}

// Anima os emblemas da Lenda e do ouro brilhante presentes na página (menu, placar).
const animated = new Set<{ canvas: HTMLCanvasElement; level: number }>();
let raf = 0;
export function animateEmblem(canvas: HTMLCanvasElement, level: number) {
  const { patente, tier } = rankOf(level);
  drawEmblem(canvas, level);
  if (patente !== 'lenda' && tier !== 'brilho') return;
  animated.add({ canvas, level });
  if (raf) return;
  const loop = (now: number) => {
    for (const a of [...animated]) {
      if (!a.canvas.isConnected) animated.delete(a);
      else drawEmblem(a.canvas, a.level, now / 1000);
    }
    raf = animated.size ? requestAnimationFrame(loop) : 0;
  };
  raf = requestAnimationFrame(loop);
}
