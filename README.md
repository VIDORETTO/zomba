# Zomba

Jogo de sobrevivência contra zumbis em rodadas, inspirado no modo Zombies clássico.
Roda no navegador; o mesmo código depois vira versão de PC (Electron ou Tauri).

**Estado atual: protótipo 0.2.** Mapa Cidade, solo e co-op online até 4 jogadores, com barricadas, portas, armas de parede, Caixa Misteriosa, bebidas, itens que caem e a Forja.

## Como rodar

Precisa do [Node.js](https://nodejs.org) 20 ou mais novo.

```bash
npm install      # só na primeira vez
npm run dev      # sobe o jogo e o servidor do co-op
```

Abra **http://localhost:5173** no Chrome, Edge ou Firefox e clique em **Solo**.

## Co-op

1. Rode `npm run dev` no computador que vai hospedar.
2. Quem hospeda clica em **Co-op online → Criar sala** e recebe um código de 4 letras.
3. Os amigos abrem o jogo pelo endereço do computador que hospeda (o terminal mostra os endereços em `Network`, por exemplo `http://192.168.1.110:5173`), clicam em **Co-op online**, digitam o código e clicam em **Entrar**.
4. O anfitrião clica em **Iniciar partida**.

Na mesma rede (Wi-Fi/cabo) funciona direto. Pela internet, a forma mais simples é todos entrarem na mesma rede do Tailscale e usarem o endereço do Tailscale; a outra opção é hospedar o servidor numa VPS.

Versão "de produção" (um único servidor entrega o jogo e o co-op na porta 3001):

```bash
npm run build
npm run server   # depois abra http://localhost:3001
```

## Controles

| Tecla | Ação |
| --- | --- |
| W A S D | Andar |
| Shift | Correr (fôlego limitado) |
| Espaço | Pular |
| C / Ctrl | Agachar (alternar / segurar) |
| Botão esquerdo | Atirar |
| Botão direito | Mirar |
| R | Recarregar |
| 1 / 2 / 3 ou roda do mouse | Trocar de arma |
| G | Granada |
| V ou E | Faca |
| F | Comprar / abrir / usar (caixa, máquinas, paredes, velas, Forja) |
| F (segurar) | Reanimar aliado caído ou consertar barricada |
| Esc | Pausa e opções (sensibilidade, campo de visão, volume) |

## O que já tem

- Movimento em primeira pessoa: aceleração rápida, corrida com fôlego, pulo, agachar, degraus automáticos, balanço de câmera e zumbis que bloqueiam a passagem.
- Pistola com mira, recuo, dispersão, recarga animada (com troca de pente e ferrolho travado quando esvazia) e faca.
- Zumbis que saem da terra, andam, correm e disparam conforme a rodada; procuram o caminho pela cidade e atacam de perto. Tiro na cabeça arranca a cabeça.
- Rodadas com quantidade e vida de zumbis crescentes (fórmula do modo clássico), contador de rodadas em marcas de giz e vinhetas sonoras entre rodadas.
- Pontos: 10 por acerto, 60 por abate, 100 na cabeça e 130 na faca.
- Vida que regenera, queda, reanimação por aliado (co-op), sangramento de 30 s e volta na rodada seguinte.
- Mapa **Cidade**: cruzamento com fenda de lava (queima quem pisa), banco e bar com interior, hotel, cinema, igreja com cemitério e becos que formam voltas.
- Áudio todo sintetizado (tiros, gemidos posicionais, passos por tipo de chão, música das rodadas, vento).
- HUD: pontos com cor por jogador, munição, mira dinâmica, marcador de acerto, direção do dano, aliados caídos na tela e tela de fim de jogo com estatísticas.

### Fase 1 (pronta)

- **Barricadas**: zumbis chegam pelas barricadas do fim das ruas, arrancam tábuas e pulam para dentro; segure F para consertar (+10 por tábua).
- **Portas e áreas**: o jogo começa no cruzamento; Banco e Bar (750), quintais (1000) e Cemitério (1250) abrem com pontos.
- **Armas de parede** (desenho a giz): Carabina, Escopeta de dois canos, Submetralhadora, Fuzil, Escopeta de repetição, granadas e faca pesada.
- **Caixa Misteriosa** (950): 4 locais, 7 armas exclusivas (metralhadora, fuzil de precisão com luneta, pistolas duplas, escopeta automática, lança-granadas, besta explosiva e o Desintegrador) e o Corvo, que leva a caixa embora.
- **Bebidas**: Couraça, Segundo Fôlego, Reflexo, Gatilho, Passo Firme e Mula; caixotes de munição.
- **Itens que caem**: Munição Cheia, Golpe Fatal, Pontos em Dobro, Bomba, Carpinteiro e Liquidação.
- **Forja** (5000): acenda as 3 velas do cemitério; cada arma vira uma versão melhorada com pintura de brasa.

### Fase 2 (em andamento)

- **Rodada inicial** de 1 a 100, começando com pontos proporcionais (rodada 20 = 37.740).
- **Banco**: depósito e saque de 1000 pontos (taxa de 100 no saque), guardados no navegador do jogador.
- **Níveis** fora da partida (XP por abates, tiros na cabeça, reanimações e rodadas) com emblemas: osso, ossos cruzados, caveira, caveira com faca, caveira com escopetas e a patente final com brilho.
- **Placar** deste computador: recordes (desde a rodada 1 ou com rodada escolhida) e estatísticas de cada jogador.
- **Recargas animadas** em todas as armas: a mão esquerda troca o pente, o pente vazio cai, cápsulas saltam ao atirar, a escopeta de repetição carrega cartucho por cartucho (atirar interrompe), os canos basculam e ejetam os cartuchos, a besta recebe a seta nova e o Desintegrador troca a célula.
- **Bancada de miras** na Oficina: ponto vermelho (1000; Carabina, Submetralhadora, Fuzil e Metralhadora) e luneta 2× (1500; Carabina e Fuzil). A mira fica na arma, inclusive depois da Forja.
- **Rodada infernal**: a primeira cai entre as rodadas 5 e 7, depois a cada 4 a 6. A névoa fica vermelha, o céu escurece, toca uma vinheta própria e os Cães Infernais caem em raios de fogo perto dos jogadores (6 por jogador, mais 2 a cada infernal, até 30). Cada cão explode em fogo ao morrer e o último deixa Munição Cheia.
- **Mais armas (21 no total)**: Fuzil de rajada (parede da Farmácia, 1200, rajada de 3) e, na Caixa, Revólver .44, Pistola de rajada, Metralhadora de mão, Fuzil de atirador (com ponto vermelho de fábrica), Lança-foguetes, Faca balística (lâmina que corta, o dobro na cabeça) e Lança-granadas de tambor (granadas que quicam). Todas têm versão da Forja.
- **Acertos de explosão e projétil** (lança-granadas, besta, Desintegrador, granadas) agora marcam na mira.
- **Forja com efeitos**: chama ao entrar a arma, faíscas a cada martelada, coluna de fogo quando fica pronta, brasas em volta da arma, clarão de brasa e a arma mostrada na mão ao pegar, e rastro de brasa nos tiros das armas forjadas.
- **Chefão Carrasco**: zumbi de 3 m com armadura e corrente com gancho, a partir da rodada 12 e depois a cada 6 a 9 rodadas, no meio de uma rodada normal (sino e tremor). Golpeia com a corrente, bate no chão (dano em área), lança o gancho e puxa o jogador e faz investidas. O capacete cai depois de 30% do dano e aí tiro na cabeça vale o triplo. Morto, dá 1000 pontos para cada jogador, um item e 25% de chance de Bebida Grátis.

### Fase 3: mapa Rota (estilo TranZit)

Escolha **Rota** no menu (ou no lobby do co-op). Cinco paradas ligadas por uma estrada em anel de uns 1.200 m na névoa: **Rodoviária** (início), **Lanchonete**, **Fazenda**, **Usina** e **Cidade**.

- **Ônibus**: dá a volta sozinho, para 20 s em cada parada e buzina antes de sair. Entre e ele leva você junto; zumbis na frente são atropelados.
- **Energia**: a alavanca fica no salão da Usina. Sem ela as bebidas ficam apagadas e o cofre da Forja (no banco da Cidade) fechado.
- **Névoa e Vultos**: andar fora das paradas e do ônibus atrai Vultos, criaturas pequenas e rápidas que somem quando você volta para uma parada.
- Cada parada tem prédios em que se entra, barricadas, bebidas, armas de parede e um local da Caixa; o nome da parada aparece ao chegar.

## Próximos passos

O planejamento completo está no documento de planejamento do projeto. Faltam da Fase 2: chefão final (Bispo), interiores de todos os prédios, armas maravilha e o placar online.

## Estrutura

```
src/shared/   regras do jogo (rodam no navegador e no servidor)
  sim.ts        simulação: rodadas, zumbis, pontos, queda e reanimação
  map/town.ts   o mapa Cidade, descrito em blocos (visual e colisão)
  world.ts      colisão e raios
  navgrid.ts    caminho dos zumbis até os jogadores
  weapons.ts    dados das armas
src/client/   o que o jogador vê e ouve
  game.ts       laço principal da partida
  weapon.ts     arma em primeira pessoa
  zombies.ts    zumbis na tela e suas animações
  audio.ts      sons sintetizados
src/server/   servidor das salas do co-op
tools/        testes automáticos com capturas de tela (usam o Chrome instalado)
```

## Testes

- Regras (sem navegador): `npx tsx tools/test-sim.ts`
- No navegador, sem janela (com `npm run dev` rodando): `node tools/<teste>.mjs <pasta-de-capturas>`, com `test-buy`, `test-barricade`, `test-doors`, `test-weapons`, `test-box`, `test-powerups`, `test-forge`, `test-progress`, `test-reload`, `test-sights`, `test-hell`, `test-boss`, `test-rota`, `coop` e `firefox-sim` (os dois aceitam `rota` como segundo argumento para testar o mapa Rota). Para revisar animações: `tools/reload.mjs` (capturas da recarga em câmera lenta) `tools/dog-shot.mjs` e `tools/boss-shot.mjs` (Cão Infernal e Carrasco de perto) e `tools/sheet.mjs` (junta capturas numa folha), `tools/probe-hits.mjs` (dano e marcador de acerto de cada arma), `tools/guns-shot.mjs` (armas na mão) e `tools/forge-fx.mjs` (efeitos da Forja) e `tools/rota-tour.mjs` (fotos de cada parada do Rota).

Em desenvolvimento a página **não recarrega sozinha** quando o código muda: atualize com F5 para ver as novidades.
