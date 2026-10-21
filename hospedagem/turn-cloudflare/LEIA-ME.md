# TURN gratuito (Cloudflare) para o co-op

> **Estado atual (2026-10-21):** já está configurado. Worker `zomba-turn` em `https://zomba-turn.gvidoretto.workers.dev` (conta da Cloudflare de gvidoretto@gmail.com, chave TURN `zomba`), liberado só para `https://zomba.gabrielvidoretto.com.br`, e o endereço está em `.env.production` (`VITE_TURN_ENDPOINT`). Foi criado pela API (MCP da Cloudflare); o passo a passo abaixo serve para refazer à mão. Para trocar a chave: crie outra em Calls → TURN e atualize os segredos do Worker.

**Para que serve.** O co-op do Zomba liga os navegadores direto uns nos outros. Em cerca de 1 a 2 de cada 10 duplas isso não fecha (internet de celular, CGNAT, roteadores fechados). Para essas, é preciso um **TURN**: um servidor que repassa os dados (cifrados). Não existe TURN público gratuito confiável, então o jogo busca as credenciais de um TURN seu.

**Custo.** A Cloudflare dá 1 TB por mês grátis no TURN. Só passa por lá quem não conseguiu ligação direta, e o jogo usa poucos KB/s por jogador. O VPS não participa.

## Passo a passo (uns 5 minutos)

1. No painel da Cloudflare: **Calls → TURN → Create** (dê um nome, ex. `zomba`). Anote o **Turn Token ID** e o **API Token**.
2. **Workers & Pages → Create → Worker**, nome `zomba-turn`, cole o conteúdo de `worker.js` e publique.
3. Em **Settings → Variables** do Worker:
   - `TURN_KEY_ID` = o Turn Token ID
   - `TURN_KEY_API_TOKEN` = o API Token (marque como **Secret**)
   - `ALLOWED_ORIGINS` = `https://zomba.gabrielvidoretto.com.br`
4. Anote o endereço do Worker (algo como `https://zomba-turn.SEU-USUARIO.workers.dev`).
5. Construa o jogo com esse endereço:
   ```bash
   VITE_TURN_ENDPOINT=https://zomba-turn.SEU-USUARIO.workers.dev npm run build
   ```
   (ou ponha a linha `VITE_TURN_ENDPOINT=...` em um arquivo `.env.production` na raiz do projeto).

## Como conferir
Abra o endereço do Worker no navegador, pelo site do jogo (o Worker só responde à origem permitida): deve voltar um JSON com `iceServers`.
Para testar de verdade sem depender da Cloudflare: `RELAY=1 node tools/test-p2p.mjs <pasta>` sobe um TURN local e força todo o tráfego por ele.

## Sem TURN
Se `VITE_TURN_ENDPOINT` não estiver definido, o jogo funciona só com STUN: a maioria das duplas conecta, e quem não conectar vê o aviso "Não encontrei essa sala…" (o jogo não trava).
