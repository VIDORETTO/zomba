// Abre o Chromium dos testes: usa o Chrome instalado e, na falta dele, o Chromium do Playwright (renderização por software).
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export async function launch() {
  const args = ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'];
  try {
    return await chromium.launch({ channel: 'chrome', headless: true, args });
  } catch {
    const base = join(homedir(), '.cache', 'ms-playwright');
    const dirs = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse() : [];
    for (const d of dirs) {
      const exe = join(base, d, 'chrome-linux', 'chrome');
      if (existsSync(exe)) return chromium.launch({ executablePath: exe, headless: true, args });
    }
    throw new Error('Chrome não encontrado');
  }
}
