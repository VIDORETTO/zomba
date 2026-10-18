// Predefinições de qualidade gráfica. "auto" escolhe pela placa e ainda reduz se o FPS cair.

export type QualityLevel = 'alta' | 'media' | 'baixa';
export type QualitySetting = 'auto' | QualityLevel;

export interface QualityConfig {
  level: QualityLevel;
  maxPixelRatio: number;
  minScale: number;
  bloom: boolean;
  shadows: boolean;
  shadowSize: number;
  lights: number;
  simpleMaterials: boolean;
  particles: number;
}

export const QUALITY: Record<QualityLevel, QualityConfig> = {
  alta: { level: 'alta', maxPixelRatio: 1.5, minScale: 0.6, bloom: true, shadows: true, shadowSize: 2048, lights: 8, simpleMaterials: false, particles: 1 },
  media: { level: 'media', maxPixelRatio: 1, minScale: 0.55, bloom: false, shadows: true, shadowSize: 1024, lights: 4, simpleMaterials: false, particles: 0.7 },
  baixa: { level: 'baixa', maxPixelRatio: 1, minScale: 0.35, bloom: false, shadows: false, shadowSize: 512, lights: 2, simpleMaterials: true, particles: 0.35 },
};

export const LOWER: Record<QualityLevel, QualityLevel | null> = { alta: 'media', media: 'baixa', baixa: null };

export const QUALITY_LABEL: Record<QualitySetting, string> = {
  auto: 'Automática',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

export interface GpuInfo {
  renderer: string;
  software: boolean;
}

// Descobre qual placa o WebGL está usando e se é renderização por software (sem aceleração).
export function detectGpu(gl: WebGLRenderingContext | WebGL2RenderingContext): GpuInfo {
  let renderer = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
  } catch {
    renderer = '';
  }
  const software = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|warp/i.test(renderer);
  return { renderer, software };
}

export function initialLevel(setting: QualitySetting, gpu: GpuInfo): QualityLevel {
  if (setting !== 'auto') return setting;
  return gpu.software ? 'baixa' : 'alta';
}
