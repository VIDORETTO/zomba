// Confere a versão de produção da Trincheira: o registro de ajuste (F1) e a função que o baixa não entram no pacote.
// Uso: node tools/test-trincheira-prod.mjs   (gera o pacote numa pasta temporária)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let ok = 0, bad = 0;
const check = (name, cond, detail = '') => { cond ? ok++ : bad++; console.log(`${cond ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` (${detail})` : ''}`); };
const out = mkdtempSync(join(tmpdir(), 'zomba-prod-'));
try {
  execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], { stdio: 'pipe', cwd: new URL('..', import.meta.url).pathname });
  const arquivos = [];
  const anda = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) (e.isDirectory() ? anda(join(d, e.name)) : arquivos.push(join(d, e.name))); };
  anda(out);
  const js = arquivos.filter((f) => f.endsWith('.js')).map((f) => readFileSync(f, 'utf8')).join('\n');
  check('o pacote de produção foi gerado', js.length > 100000, `${(js.length / 1e6).toFixed(1)} MB de JS`);
  check('produção: a função que baixa o registro de ajuste não existe', !js.includes('zomba-registro-dev') && !js.includes('trincheira-registro-'));
  check('produção: a Trincheira continua no pacote (o jogo não foi cortado)', js.includes('Pistola de Cano Longo'));
} finally {
  rmSync(out, { recursive: true, force: true });
}
console.log(`\n${ok} ok, ${bad} falharam`);
process.exit(bad ? 1 : 0);
