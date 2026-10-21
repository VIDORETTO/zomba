import * as THREE from 'three';
import { mulberry32 } from '../shared/rng';

// Texturas procedurais desenhadas em canvas. Servem até trocarmos por arte definitiva.

type Ctx = CanvasRenderingContext2D;

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, seed: number, period: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const w = (a: number) => ((a % period) + period) % period;
  const a = hash(w(xi), w(yi), seed);
  const b = hash(w(xi + 1), w(yi), seed);
  const c = hash(w(xi), w(yi + 1), seed);
  const d = hash(w(xi + 1), w(yi + 1), seed);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Ruído fractal que fecha nas bordas (textura repetível).
function fbm(x: number, y: number, size: number, base: number, oct: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let freq = base;
  for (let o = 0; o < oct; o++) {
    sum += vnoise((x / size) * freq, (y / size) * freq, seed + o * 17, freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function canvas(size: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

type RGB = [number, number, number];

function noiseFill(ctx: Ctx, size: number, base: RGB, amount: number, freq: number, seed: number, oct = 4) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = (fbm(x, y, size, freq, oct, seed) - 0.5) * 2 * amount;
      const g = (hash(x, y, seed + 99) - 0.5) * amount * 0.35;
      const i = (y * size + x) * 4;
      d[i] = clamp255(base[0] * (1 + n + g));
      d[i + 1] = clamp255(base[1] * (1 + n + g));
      d[i + 2] = clamp255(base[2] * (1 + n + g));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function clamp255(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function blotches(ctx: Ctx, size: number, n: number, color: string, rMin: number, rMax: number, rnd: () => number) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = rMin + rnd() * (rMax - rMin);
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
}

function cracks(ctx: Ctx, size: number, n: number, color: string, width: number, rnd: () => number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let x = rnd() * size;
    let y = rnd() * size;
    let a = rnd() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 6 + Math.floor(rnd() * 14);
    for (let s = 0; s < steps; s++) {
      a += (rnd() - 0.5) * 1.2;
      x += Math.cos(a) * size * 0.03;
      y += Math.sin(a) * size * 0.03;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function finish(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function bricks(size: number, mortar: RGB, palette: RGB[], seed: number, rows = 16): HTMLCanvasElement {
  const [c, ctx] = canvas(size);
  noiseFill(ctx, size, mortar, 0.2, 8, seed);
  const rnd = mulberry32(seed);

  const bh = size / rows;
  const bw = bh * 2.1;
  const cols = Math.round(size / bw);
  const w = size / cols;
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? w / 2 : 0;
    for (let k = -1; k < cols; k++) {
      const col = palette[Math.floor(rnd() * palette.length)];
      const shade = 0.82 + rnd() * 0.3;
      const x0 = Math.round(k * w + off + 1.5);
      const x1 = Math.round((k + 1) * w + off - 1.5);
      const y0 = Math.round(r * bh + 1.5);
      const y1 = Math.round((r + 1) * bh - 1.5);
      for (let y = y0; y < y1; y++) {
        for (let xx = x0; xx < x1; xx++) {
          const x = ((xx % size) + size) % size;
          const n = 1 + (fbm(x, y, size, 32, 2, seed + 5) - 0.5) * 0.35;
          const i = (y * size + x) * 4;
          d[i] = clamp255(col[0] * shade * n);
          d[i + 1] = clamp255(col[1] * shade * n);
          d[i + 2] = clamp255(col[2] * shade * n);
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  blotches(ctx, size, 10, 'rgba(10,8,6,0.25)', size * 0.05, size * 0.2, rnd);
  return c;
}

function planks(size: number, base: RGB, count: number, vertical: boolean, seed: number, gap = 2): HTMLCanvasElement {
  const [c, ctx] = canvas(size);
  const rnd = mulberry32(seed);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const pw = size / count;
  const shades = Array.from({ length: count }, () => 0.75 + rnd() * 0.4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = vertical ? x : y;
      const b = vertical ? y : x;
      const p = Math.floor(a / pw);
      const inGap = a - p * pw < gap;
      const grain = fbm(vertical ? x * 6 : x, vertical ? y : y * 6, size, 4, 3, seed + p) - 0.5;
      const s = inGap ? 0.25 : shades[p] * (1 + grain * 0.5) * (1 + (hash(b >> 3, p, seed) - 0.5) * 0.08);
      const i = (y * size + x) * 4;
      d[i] = clamp255(base[0] * s);
      d[i + 1] = clamp255(base[1] * s);
      d[i + 2] = clamp255(base[2] * s);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  blotches(ctx, size, 6, 'rgba(15,10,5,0.3)', size * 0.05, size * 0.2, rnd);
  return c;
}

export interface TexSet {
  [name: string]: THREE.Texture;
}

export function buildTextures(): TexSet {
  const t: TexSet = {};
  let rnd = mulberry32(7);

  {
    const s = 512;
    const [c, ctx] = canvas(s);
    noiseFill(ctx, s, [62, 60, 58], 0.28, 6, 1);
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = `rgba(${150 + rnd() * 60},${150 + rnd() * 60},${150 + rnd() * 50},${0.15 + rnd() * 0.25})`;
      ctx.fillRect(rnd() * s, rnd() * s, 1.5, 1.5);
    }
    blotches(ctx, s, 14, 'rgba(10,10,12,0.35)', 20, 70, rnd);
    cracks(ctx, s, 14, 'rgba(15,14,13,0.8)', 1.6, rnd);
    t.asphalt = finish(c);
  }
  {
    const s = 256;
    const [c, ctx] = canvas(s);
    noiseFill(ctx, s, [140, 136, 128], 0.18, 6, 2);
    ctx.strokeStyle = 'rgba(40,38,34,0.75)';
    ctx.lineWidth = 2;
    for (let k = 0; k <= 2; k++) {
      ctx.beginPath();
      ctx.moveTo(0, k * 128);
      ctx.lineTo(s, k * 128);
      ctx.moveTo(k * 128, 0);
      ctx.lineTo(k * 128, s);
      ctx.stroke();
    }
    blotches(ctx, s, 8, 'rgba(30,26,20,0.3)', 10, 40, rnd);
    cracks(ctx, s, 4, 'rgba(40,38,34,0.7)', 1, rnd);
    t.sidewalk = finish(c);
  }
  {
    const s = 256;
    const [c, ctx] = canvas(s);
    noiseFill(ctx, s, [78, 62, 46], 0.35, 5, 3);
    for (let i = 0; i < 300; i++) {
      const g = 60 + rnd() * 60;
      ctx.fillStyle = `rgba(${g},${g * 0.9},${g * 0.8},0.6)`;
      ctx.beginPath();
      ctx.arc(rnd() * s, rnd() * s, 0.8 + rnd() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    blotches(ctx, s, 10, 'rgba(25,20,12,0.35)', 15, 50, rnd);
    t.dirt = finish(c);
  }
  {
    const s = 256;
    const [c, ctx] = canvas(s);
    noiseFill(ctx, s, [150, 146, 140], 0.2, 5, 4);
    for (let i = 0; i < 25; i++) {
      const x = rnd() * s;
      const g = ctx.createLinearGradient(x, 0, x, s);
      g.addColorStop(0, 'rgba(30,26,22,0.0)');
      g.addColorStop(0.5, 'rgba(30,26,22,0.18)');
      g.addColorStop(1, 'rgba(30,26,22,0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 3 + rnd() * 8, s);
    }
    blotches(ctx, s, 6, 'rgba(20,18,16,0.25)', 15, 50, rnd);
    t.concrete = finish(c);
    // pedra em blocos grandes (Igreja, Cripta, Escavação)
    t.stone = finish(bricks(256, [52, 50, 47], [[150, 146, 138], [132, 128, 120], [160, 154, 142], [120, 117, 110]], 12, 5));
  }
  {
    // piso de concreto: placas de 3 m com juntas, manchas de óleo, rachaduras e mato nas frestas
    const s = 512;
    const [c, ctx] = canvas(s);
    noiseFill(ctx, s, [128, 124, 116], 0.16, 6, 41);
    for (let i = 0; i < 1800; i++) {
      const g = 90 + rnd() * 80;
      ctx.fillStyle = `rgba(${g},${g * 0.97},${g * 0.92},0.35)`;
      ctx.fillRect(rnd() * s, rnd() * s, 1.5, 1.5);
    }
    blotches(ctx, s, 9, 'rgba(18,16,14,0.32)', 14, 60, rnd);
    blotches(ctx, s, 5, 'rgba(40,46,30,0.22)', 10, 30, rnd);
    ctx.strokeStyle = 'rgba(38,35,31,0.85)';
    ctx.lineWidth = 2.5;
    for (let k = 0; k <= 2; k++) {
      ctx.beginPath();
      ctx.moveTo(0, k * 256);
      ctx.lineTo(s, k * 256);
      ctx.moveTo(k * 256, 0);
      ctx.lineTo(k * 256, s);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(70,82,48,0.6)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 40; i++) {
      const along = rnd() < 0.5, k = rnd() < 0.5 ? 0 : 256, p = rnd() * s;
      ctx.beginPath();
      if (along) {
        ctx.moveTo(p, k);
        ctx.lineTo(p + 3, k - 4 - rnd() * 4);
      } else {
        ctx.moveTo(k, p);
        ctx.lineTo(k + 4 + rnd() * 4, p + 3);
      }
      ctx.stroke();
    }
    cracks(ctx, s, 10, 'rgba(30,28,25,0.7)', 1.2, rnd);
    t.pavement = finish(c);
  }
  t.brick = finish(bricks(512, [110, 104, 96], [[138, 62, 42], [120, 52, 36], [150, 74, 50], [104, 48, 34]], 5));
  t.brickDark = finish(bricks(512, [70, 66, 62], [[78, 40, 30], [66, 34, 28], [90, 50, 36], [58, 36, 30]], 6));
  {
    const s = 256;
    const [c, ctx] = canvas(s);
    noiseFill(ctx, s, [222, 222, 220], 0.12, 4, 7);
    blotches(ctx, s, 12, 'rgba(60,50,40,0.16)', 10, 60, rnd);
    cracks(ctx, s, 4, 'rgba(70,60,50,0.35)', 1, rnd);
    t.plaster = finish(c);
  }
  {
    const s = 256;
    const [c, ctx] = canvas(s);
    noiseFill(ctx, s, [190, 186, 180], 0.1, 4, 8);
    blotches(ctx, s, 10, 'rgba(50,40,30,0.3)', 10, 50, rnd);
    t.ceiling = finish(c);
    t.trim = t.ceiling;
  }
  t.wood = finish(planks(256, [118, 84, 56], 8, true, 9));
  t.woodDark = finish(planks(256, [72, 50, 34], 8, true, 10));
  t.floorWood = finish(planks(256, [110, 78, 50], 6, false, 11));
  {
    const c = planks(128, [120, 92, 64], 4, false, 12, 6);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(20,16,12,0.9)';
    for (let r = 0; r < 4; r++) {
      for (const x of [10, 118]) {
        ctx.beginPath();
        ctx.arc(x, r * 32 + 18, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const tex = finish(c);
    t.boards = tex;
  }
  {
    const s = 256;
    const [c, ctx] = canvas(s);
    const n = 8;
    const w = s / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = (x + y) % 2 ? 200 : 40;
        ctx.fillStyle = `rgb(${v},${v * 0.97},${v * 0.92})`;
        ctx.fillRect(x * w, y * w, w, w);
      }
    }
    ctx.globalAlpha = 0.5;
    const [c2, ctx2] = canvas(s);
    noiseFill(ctx2, s, [128, 120, 110], 0.5, 4, 13);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(c2, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    blotches(ctx, s, 10, 'rgba(30,20,10,0.35)', 10, 50, rnd);
    t.tile = finish(c);
  }
  {
    const s = 256;
    const [c, ctx] = canvas(s);
    noiseFill(ctx, s, [44, 42, 40], 0.3, 6, 14);
    t.roof = finish(c);
  }
  {
    const s = 256;
    const [c, ctx] = canvas(s);
    noiseFill(ctx, s, [170, 170, 170], 0.12, 6, 15);
    ctx.strokeStyle = 'rgba(230,230,230,0.15)';
    for (let i = 0; i < 60; i++) {
      ctx.beginPath();
      const x = rnd() * s;
      const y = rnd() * s;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 40, y + (rnd() - 0.5) * 10);
      ctx.stroke();
    }
    blotches(ctx, s, 14, 'rgba(110,55,20,0.35)', 6, 30, rnd);
    t.metal = finish(c);
    t.carPaint = t.metal;
  }
  {
    const s = 256;
    const [c, ctx] = canvas(s);
    noiseFill(ctx, s, [92, 60, 42], 0.3, 6, 16);
    blotches(ctx, s, 20, 'rgba(30,20,14,0.35)', 6, 30, rnd);
    blotches(ctx, s, 10, 'rgba(140,80,40,0.22)', 6, 20, rnd);
    t.rust = finish(c);
  }
  {
    const s = 128;
    const [c, ctx] = canvas(s);
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#1b2328');
    g.addColorStop(0.45, '#2b363c');
    g.addColorStop(0.55, '#141a1e');
    g.addColorStop(1, '#0e1215');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    blotches(ctx, s, 5, 'rgba(70,60,50,0.35)', 10, 30, rnd);
    cracks(ctx, s, 3, 'rgba(200,210,220,0.35)', 1, rnd);
    t.glass = finish(c);
  }
  {
    const s = 128;
    const [c, ctx] = canvas(s);
    const g = ctx.createLinearGradient(0, s, 0, 0);
    g.addColorStop(0, '#ffb060');
    g.addColorStop(1, '#a04a18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(40,14,4,0.75)';
    ctx.fillRect(0, 0, s * 0.22, s);
    ctx.fillRect(s * 0.78, 0, s * 0.22, s);
    ctx.fillRect(0, s * 0.48, s, 4);
    t.glassLit = finish(c);
  }
  {
    const s = 64;
    const [c, ctx] = canvas(s);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#e8e2d6' : '#9a948a';
      ctx.fillRect((i * s) / 8, 0, s / 8, s);
    }
    t.awning = finish(c);
  }
  {
    const s = 128;
    const [c, ctx] = canvas(s);
    noiseFill(ctx, s, [128, 112, 82], 0.25, 8, 17);
    ctx.strokeStyle = 'rgba(40,32,20,0.7)';
    ctx.lineWidth = 3;
    for (let r = 0; r < 4; r++) {
      const off = r % 2 ? 32 : 0;
      for (let k = -1; k < 2; k++) {
        ctx.beginPath();
        ctx.roundRect(k * 64 + off + 2, r * 32 + 2, 60, 28, 12);
        ctx.stroke();
      }
    }
    t.sandbag = finish(c);
  }
  {
    const s = 64;
    const [c, ctx] = canvas(s);
    noiseFill(ctx, s, [24, 24, 24], 0.3, 4, 18);
    t.tire = finish(c);
  }
  {
    const s = 64;
    const [c, ctx] = canvas(s);
    noiseFill(ctx, s, [200, 160, 50], 0.25, 4, 19);
    t.paintYellow = finish(c);
    const [c2, ctx2] = canvas(s);
    noiseFill(ctx2, s, [200, 198, 190], 0.25, 4, 20);
    t.paintWhite = finish(c2);
  }
  {
    const s = 32;
    const [c, ctx] = canvas(s);
    ctx.fillStyle = '#fff3d6';
    ctx.fillRect(0, 0, s, s);
    t.lamp = finish(c);
  }
  {
    // lava: crosta escura com veios brilhantes
    const s = 256;
    const [c, ctx] = canvas(s);
    const img = ctx.createImageData(s, s);
    const d = img.data;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const n = fbm(x, y, s, 4, 5, 21);
        const v = Math.abs(n - 0.5) * 2;
        const hot = Math.pow(1 - Math.min(1, v * 3), 2.2);
        const i = (y * s + x) * 4;
        d[i] = clamp255(40 + hot * 255);
        d[i + 1] = clamp255(10 + hot * 150 + Math.pow(hot, 4) * 90);
        d[i + 2] = clamp255(4 + Math.pow(hot, 5) * 60);
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    t.lava = finish(c);
  }

  rnd = mulberry32(31);
  {
    // textura de sujeira para roupas e pele dos zumbis
    const s = 128;
    const [c, ctx] = canvas(s);
    noiseFill(ctx, s, [205, 205, 205], 0.22, 4, 22);
    blotches(ctx, s, 10, 'rgba(60,40,25,0.45)', 6, 26, rnd);
    blotches(ctx, s, 7, 'rgba(90,8,6,0.65)', 4, 18, rnd);
    cracks(ctx, s, 6, 'rgba(30,20,15,0.5)', 1.2, rnd);
    t.grime = finish(c);
  }
  {
    const s = 128;
    const [c, ctx] = canvas(s);
    noiseFill(ctx, s, [215, 215, 215], 0.15, 4, 23);
    t.cloth = finish(c);
  }
  {
    // lama: marrom bem escuro, poças mais lisas e marcas de bota e de roda
    const s = 256;
    const [c, ctx] = canvas(s);
    const mr = mulberry32(41);
    noiseFill(ctx, s, [58, 44, 32], 0.4, 4, 24);
    blotches(ctx, s, 9, 'rgba(18,14,10,0.55)', 14, 46, mr);
    blotches(ctx, s, 6, 'rgba(95,88,80,0.35)', 8, 26, mr);
    ctx.strokeStyle = 'rgba(20,15,10,0.45)';
    ctx.lineWidth = 5;
    for (let i = 0; i < 2; i++) {
      const y = mr() * s;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(s * 0.3, y + 20, s * 0.6, y - 20, s, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(25,18,12,0.5)';
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.ellipse(mr() * s, mr() * s, 3 + mr() * 3, 6 + mr() * 4, mr() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    t.mud = finish(c);
  }
  return t;
}

// Pintura das armas da Forja: metal escuro com veios em brasa.
export function emberTexture(): THREE.CanvasTexture {
  const s = 128;
  const [c, ctx] = canvas(s);
  const img = ctx.createImageData(s, s);
  const d = img.data;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const n = fbm(x, y, s, 3, 4, 77);
      const v = Math.abs(n - 0.5) * 2;
      const hot = Math.pow(1 - Math.min(1, v * 4), 3);
      const i = (y * s + x) * 4;
      d[i] = clamp255(30 + hot * 255);
      d[i + 1] = clamp255(12 + hot * 70);
      d[i + 2] = clamp255(10 + hot * 15);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Textura redonda e suave para partículas.
export function particleTexture(): THREE.Texture {
  const s = 64;
  const [c, ctx] = canvas(s);
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function muzzleTexture(): THREE.Texture {
  const s = 128;
  const [c, ctx] = canvas(s);
  ctx.translate(s / 2, s / 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s / 2);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(0.2, 'rgba(255,200,90,0.9)');
  g.addColorStop(0.6, 'rgba(255,110,20,0.25)');
  g.addColorStop(1, 'rgba(255,80,0,0)');
  ctx.fillStyle = g;
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(0, -s / 2);
    ctx.lineTo(6, 0);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function signTexture(text: string, fg: string, bg: string, w: number, h: number, glow: boolean): THREE.Texture {
  const px = 128;
  const cw = Math.round(w * px);
  const ch = Math.round(h * px);
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cw, ch);
  if (!glow) {
    const [n, nctx] = canvas(128);
    noiseFill(nctx, 128, [128, 128, 128], 0.6, 4, 40);
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.5;
    for (let x = 0; x < cw; x += 128) ctx.drawImage(n, x, 0, 128, ch);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.strokeStyle = fg;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = ch * 0.05;
  ctx.strokeRect(ch * 0.08, ch * 0.08, cw - ch * 0.16, ch - ch * 0.16);
  ctx.globalAlpha = 1;
  let size = ch * 0.62;
  ctx.font = `900 ${size}px Georgia, 'Times New Roman', serif`;
  const maxW = cw * 0.86;
  const mw = ctx.measureText(text).width;
  if (mw > maxW) {
    size *= maxW / mw;
    ctx.font = `900 ${size}px Georgia, 'Times New Roman', serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (glow) {
    ctx.shadowColor = fg;
    ctx.shadowBlur = ch * 0.15;
  }
  ctx.fillStyle = fg;
  ctx.fillText(text, cw / 2, ch / 2 + size * 0.04);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Desenho a giz na parede: silhueta da arma/item, nome e preço, com fundo transparente.
export function chalkTexture(item: string, label: string): THREE.Texture {
  const W = 384;
  const H = 192;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const rnd = mulberry32(item.length * 97 + label.length);
  ctx.strokeStyle = 'rgba(240,236,226,0.92)';
  ctx.fillStyle = 'rgba(240,236,226,0.92)';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // contorno tremido, como giz na parede
  const shape = (pts: [number, number][]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const jx = x + (rnd() - 0.5) * 3;
      const jy = y + (rnd() - 0.5) * 3;
      if (i) ctx.lineTo(jx, jy);
      else ctx.moveTo(jx, jy);
    });
    ctx.closePath();
    ctx.stroke();
  };
  const rect = (x: number, y: number, w: number, h: number) => shape([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
  const cx = W / 2;
  switch (item) {
    case 'pistol':
      rect(cx - 70, 40, 140, 26);
      shape([[cx + 30, 66], [cx + 62, 66], [cx + 70, 120], [cx + 40, 120]]);
      break;
    case 'burstrifle':
      // fuzil de rajada: cano, corpo, alça de transporte, pente reto e coronha
      rect(cx - 160, 52, 110, 10);
      rect(cx - 50, 44, 120, 26);
      rect(cx - 30, 28, 70, 10);
      rect(cx - 6, 70, 22, 46);
      shape([[cx + 70, 50], [cx + 155, 54], [cx + 155, 84], [cx + 70, 70]]);
      break;
    case 'carbine':
    case 'rifle':
      rect(cx - 160, 52, 120, 10);
      rect(cx - 40, 44, 110, 26);
      shape([[cx + 70, 48], [cx + 160, 58], [cx + 160, 92], [cx + 70, 72]]);
      if (item === 'rifle') shape([[cx - 20, 70], [cx + 4, 70], [cx - 2, 118], [cx - 30, 112]]);
      else rect(cx - 10, 70, 22, 30);
      break;
    case 'smg':
      rect(cx - 110, 54, 40, 10);
      rect(cx - 70, 44, 130, 28);
      rect(cx - 40, 72, 20, 46);
      shape([[cx + 30, 72], [cx + 50, 72], [cx + 58, 110], [cx + 38, 110]]);
      rect(cx + 60, 50, 60, 10);
      break;
    case 'doublebarrel':
    case 'pump':
      rect(cx - 170, 48, 220, 10);
      rect(cx - 170, 60, 200, 10);
      if (item === 'pump') rect(cx - 110, 70, 60, 14);
      rect(cx + 30, 46, 40, 28);
      shape([[cx + 70, 50], [cx + 165, 62], [cx + 165, 96], [cx + 70, 74]]);
      break;
    case 'lmg':
      // metralhadora: cano comprido com bipé, caixa de munição embaixo e coronha
      rect(cx - 170, 50, 120, 10);
      rect(cx - 50, 40, 130, 32);
      rect(cx - 30, 72, 50, 34);
      shape([[cx - 140, 60], [cx - 160, 112]]);
      shape([[cx - 130, 60], [cx - 110, 112]]);
      shape([[cx + 80, 46], [cx + 160, 54], [cx + 160, 88], [cx + 80, 72]]);
      break;
    case 'sniper':
    case 'dmr':
      // fuzil comprido com luneta (ou ponto vermelho) no alto
      rect(cx - 175, 54, 135, 9);
      rect(cx - 40, 46, 105, 24);
      if (item === 'sniper') rect(cx - 30, 26, 80, 14);
      else rect(cx - 6, 30, 28, 16);
      rect(cx + 6, 70, 18, 30);
      shape([[cx + 65, 48], [cx + 160, 56], [cx + 160, 92], [cx + 65, 70]]);
      break;
    case 'autoshotgun':
      rect(cx - 160, 50, 170, 12);
      rect(cx - 10, 42, 80, 30);
      rect(cx + 2, 72, 30, 40);
      shape([[cx + 70, 48], [cx + 160, 58], [cx + 160, 92], [cx + 70, 72]]);
      break;
    case 'revolver':
      // cano, tambor redondo e cabo curvo
      rect(cx - 110, 48, 100, 16);
      ctx.beginPath();
      ctx.ellipse(cx + 10, 62, 22, 18, 0, 0, Math.PI * 2);
      ctx.stroke();
      shape([[cx + 30, 52], [cx + 60, 54], [cx + 80, 120], [cx + 50, 124], [cx + 34, 76]]);
      break;
    case 'burstpistol':
    case 'machinepistol':
      rect(cx - 80, 42, 150, 26);
      shape([[cx + 30, 68], [cx + 58, 68], [cx + 64, 118], [cx + 36, 118]]);
      if (item === 'machinepistol') rect(cx - 30, 68, 20, 50);
      else rect(cx - 110, 50, 30, 10);
      break;
    case 'grenade':
      ctx.beginPath();
      ctx.ellipse(cx, 80, 32, 40, 0, 0, Math.PI * 2);
      ctx.stroke();
      rect(cx - 12, 30, 24, 14);
      shape([[cx + 12, 34], [cx + 40, 44], [cx + 36, 60]]);
      break;
    case 'knife':
      shape([[cx - 150, 76], [cx + 20, 60], [cx + 30, 92], [cx - 120, 92]]);
      rect(cx + 30, 64, 100, 26);
      rect(cx + 26, 52, 8, 50);
      break;
  }
  // nome e preço cabem na largura do desenho
  let fs = 30;
  ctx.font = `700 ${fs}px Georgia, 'Times New Roman', serif`;
  const tw = ctx.measureText(label).width;
  if (tw > W - 24) {
    fs = Math.floor((fs * (W - 24)) / tw);
    ctx.font = `700 ${fs}px Georgia, 'Times New Roman', serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, cx, H - 22);
  // falhas do giz: apaga pontinhos aleatórios
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.3 + rnd() * 0.7})`;
    ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2.5, 1 + rnd() * 2.5);
  }
  ctx.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
