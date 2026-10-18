import { defineConfig, type Plugin } from 'vite';

// Não recarrega a página sozinho quando um arquivo muda: dá para jogar enquanto o código
// é editado, e as mudanças entram quando a página é atualizada (F5).
// A conexão com o Vite continua aberta, então erros do navegador seguem aparecendo no terminal.
const noAutoReload = (): Plugin => ({
  name: 'zomba-no-auto-reload',
  hotUpdate() {
    return [];
  },
});

export default defineConfig({
  plugins: [noAutoReload()],
  server: { host: true, port: 5173 },
  build: { outDir: 'dist', target: 'es2022', chunkSizeWarningLimit: 2000 },
});
