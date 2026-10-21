# Zomba

Jogo de sobrevivência contra zumbis em rodadas, inspirado no modo Zombies clássico.
Roda no navegador; o mesmo código depois vira versão de PC (Electron ou Tauri).

**Estado atual: protótipo 0.3.** Mapa Cidade, solo e co-op online até 4 jogadores, com barricadas, portas, armas de parede, Caixa Misteriosa, bebidas, itens que caem e a Forja.

## Como rodar

Precisa do [Node.js](https://nodejs.org) 20 ou mais novo.

```bash
npm install      # só na primeira vez
npm run dev      # sobe o jogo e o servidor do co-op
```

Abra **http://localhost:5173** no Chrome, Edge ou Firefox e clique em **Solo**.

## Co-op

**Para jogar com amigos pela internet**, o jeito fácil: dê dois cliques em **`servidor/Iniciar servidor.bat`** (ou `npm run servidor`). Ele prepara o jogo, liga o servidor e abre um túnel seguro da Cloudflare (sem conta, sem abrir portas no roteador, sem mostrar seu IP). Aparece um link e o jogo abre no seu navegador: clique em **Criar sala → Copiar convite** e mande para os amigos. Quem abrir o convite cai direto na sala, sem instalar nada.

Ao ligar, ele pergunta o modo: **Cloudflare** (padrão, funciona em qualquer internet), **Direto** (sem Cloudflare: você é o servidor, com o menor atraso; o roteador precisa deixar a porta aberta e o iniciador tenta abrir sozinho pelo UPnP) ou **só rede local**. Para um link fixo e ligado o tempo todo, há um instalador de um comando para VPS.

Passo a passo de ligar, criar a sala, jogar e desligar: [`servidor/TUTORIAL.md`](servidor/TUTORIAL.md). Detalhes técnicos e segurança: [`servidor/LEIA-ME.md`](servidor/LEIA-ME.md).

No lobby, o anfitrião vê o link do convite e pode **tirar** alguém da sala.

Em desenvolvimento (`npm run dev`), na mesma rede: quem hospeda clica em **Co-op online → Criar sala**, e os amigos abrem o jogo pelo endereço `Network` do terminal (por exemplo `http://192.168.1.110:5173`) e entram pelo convite ou pelo código de 4 letras.

Versão "de produção" sem túnel (um único servidor entrega o jogo e o co-op na porta 3001):

```bash
npm run build
npm run server   # depois abra http://localhost:3001
```

## Placar online

No menu, **Placar → Online**: digite nome e senha para entrar (se o nome for novo, a conta é criada). Com a conta conectada, cada partida solo é enviada no fim do jogo, e as de co-op o próprio servidor registra (aparecem com ✓, conferidas). O placar mostra a melhor partida de cada jogador por modo (solo/co-op), mapa e rodada inicial.

O placar mora no mesmo servidor do co-op, no arquivo `data/placar.json` (ou na pasta indicada pela variável `ZOMBA_DATA`). As senhas não são guardadas, só um resumo delas (scrypt). Partidas impossíveis (rápidas demais, abates demais) são recusadas. Para o placar valer para todo mundo o tempo todo, use o servidor fixo numa VPS (ver `servidor/LEIA-ME.md`).

## Controles

Teclas padrão. Todas podem ser trocadas em **Controles**, no menu principal ou no menu de jogo (Esc); setas também andam.

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
| Esc | Menu de jogo: continuar, reiniciar, sair; vídeo (qualidade, campo de visão, brilho), áudio (volume geral e da música) e controles (sensibilidade, mouse invertido, troca de teclas) |

## O que já tem

- Movimento em primeira pessoa: aceleração rápida, corrida com fôlego, pulo, agachar, degraus automáticos, balanço de câmera e zumbis que bloqueiam a passagem.
- Pistola com mira, recuo, dispersão, recarga animada (com troca de pente e ferrolho travado quando esvazia) e faca.
- Zumbis que saem da terra, andam, correm e disparam conforme a rodada; procuram o caminho pela cidade e atacam de perto. Tiro na cabeça arranca a cabeça.
- Rodadas com quantidade e vida de zumbis crescentes (fórmula do modo clássico), contador de rodadas em marcas de giz e vinhetas sonoras entre rodadas.
- Pontos: 10 por acerto, 60 por abate, 100 na cabeça e 130 na faca.
- Vida que regenera, queda (caído, o jogador rasteja devagar e saca a pistola), reanimação por aliado (co-op), sangramento de 30 s e volta na rodada seguinte.
- Mapa **Cidade**: cruzamento com fenda de lava (queima quem pisa), doze prédios em que se entra (banco, bar, hotel, cinema, igreja, correio, mercearia, farmácia, lanchonete, oficina, barbearia e armazém), cemitério e becos que formam voltas.
- Áudio sintetizado (gemidos posicionais, música das rodadas, vento) com gravações CC0 para tiros, vozes dos zumbis, passos por tipo de chão, tábuas e impactos (`public/sfx`).
- HUD: pontos com cor por jogador, munição, mira dinâmica, marcador de acerto, direção do dano, aliados caídos na tela e tela de fim de jogo com estatísticas.

### Fase 1 (pronta)

- **Barricadas**: zumbis chegam pelas barricadas do fim das ruas, arrancam tábuas e pulam para dentro; segure F para consertar (+10 por tábua).
- **Portas e áreas**: o jogo começa no cruzamento; Banco e Bar (750), quintais (1000) e Cemitério (1250) abrem com pontos.
- **Armas de parede** (desenho a giz): Carabina, Escopeta de dois canos, Submetralhadora, Fuzil, Escopeta de repetição, granadas e faca pesada.
- **Caixa Misteriosa** (950): 4 locais, 7 armas exclusivas (metralhadora, fuzil de precisão com luneta, pistolas duplas, escopeta automática, lança-granadas, besta explosiva e o Desintegrador) e o Corvo, que leva a caixa embora.
- **Bebidas**: Couraça, Segundo Fôlego, Reflexo, Gatilho, Passo Firme e Mula; caixotes de munição.
- **Itens que caem**: Munição Cheia, Golpe Fatal, Pontos em Dobro, Bomba, Carpinteiro e Liquidação.
- **Forja** (5000): acenda as 3 velas do cemitério; cada arma vira uma versão melhorada com pintura de brasa.

### Fase 2 (pronta)

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
- **Interiores de todos os prédios da Cidade**: Hotel (escada que desaba no primeiro lance), Armazém, Barbearia, Oficina, Mercearia, Cinema, Farmácia, Correio, Lanchonete e Igreja (entra-se pela torre do sino). Cada um abre com a sua porta (750 a 1250), tem janelas com tábuas por onde os zumbis entram depois que ele abre, e uma arma de parede nova (Metralhadora leve, Pistola de rajada, Fuzil de atirador, Revólver, Metralhadora de mão, Escopeta automática, Fuzil de precisão) ou um local novo da Caixa (Hotel, Cinema, Lanchonete; agora são 7).
- **Armas maravilha** (só na Caixa, 2% cada, uma de cada por partida): **Canhão de Vento** (rajada em cone que arremessa os zumbis), **Arpão Elétrico** (raio que salta entre até 10 zumbis) e **Vórtice** (esfera que abre um buraco negro e suga os zumbis por 6 s). Na Forja: Furacão, Tempestade de Ferro (16 saltos) e Singularidade (buraco maior, 8 s).
- **Ritual do Bispo** (segredo da Cidade): com a Forja acesa, acenda as três velas pretas do altar da Igreja. O Bispo sobe da lava do cruzamento: lança bolas de fogo, chama zumbis, e em cada troca de fase fica imune num anel de fogo e muda de lugar; na fase 2 vêm pilares de fogo (com aviso no chão) e na fase 3 ele lança três bolas de fogo e chama Cães Infernais. Derrotado, dá todas as bebidas e 5000 pontos a cada jogador. Uma vez por partida.
- **Placar online**: contas com nome e senha, partidas solo enviadas no fim do jogo e as de co-op registradas pelo servidor (ver *Placar online* acima).

### Fase 3: mapa Rota (estilo TranZit)

Escolha **Rota** no menu (ou no lobby do co-op). Cinco paradas ligadas por uma estrada em anel de uns 1.300 m na névoa: **Rodoviária** (início), **Lanchonete**, **Fazenda**, **Usina** e **Cidade**.

- **Ônibus**: dá a volta sozinho, para 20 s em cada parada e buzina antes de sair. Sai devagar e anda um pouco abaixo da velocidade da corrida, então dá para alcançar correndo. Entre e ele leva você junto; zumbis na frente são atropelados.
- **Energia**: a alavanca fica no salão da Usina. Sem ela as bebidas ficam apagadas e o cofre da Forja (no banco da Cidade) fechado.
- **Névoa e Vultos**: a estrada fica numa névoa cinzenta fechada, com bancos de neblina rasteira passando com o vento. Andar fora das paradas e do ônibus atrai Vultos, criaturas pequenas e rápidas que somem quando você volta para uma parada.
- **Entre as paradas**: mata de pinheiros e árvores em manchas, moitas, capim alto que balança, dois milharais cercados, pedras, tocos, casas em ruína, caminhão tombado, postes de telefone, placas de estrada e outdoors. Troncos, pedras e ruínas têm colisão.
- **Itens que caem** (em todos os mapas): coluna de luz verde que atravessa a névoa, anel no chão, som ao cair e marcador na tela com o nome e a distância (na borda, se estiver fora da vista).
- Cada parada tem prédios em que se entra, barricadas, bebidas, armas de parede e um local da Caixa; o nome da parada aparece ao chegar.

### Mapa Trincheira (em construção, estilo Origins)

Escolha **Trincheira** no menu. É uma frente de batalha de 1918, com lama, trincheiras, uma igreja, uma oficina, uma casamata, um quartel e uma escavação antiga no centro, onde fica a Forja. O jogo começa no **Posto de Comando**.

- Saída por dois portões de 750 (Casamata ou Estação do Tanque); qualquer um dá na lama da Terra de Ninguém.
- Os portões da Oficina, da Vala Sul, do Quartel Norte e da Igreja abrem as outras áreas.
- Por enquanto as bebidas funcionam sem gerador.

A especificação completa (planta, regras e as 9 fases) está em [`docs/trincheira/README.md`](docs/trincheira/README.md). A Fase 1 está pronta (o mapa jogável). Os geradores, o tanque, os colossos e os cajados vêm nas próximas fases.

## Próximos passos

O planejamento completo está no documento de planejamento do projeto. As Fases 1, 2 e 3 estão prontas. O servidor para jogar com amigos pela internet está pronto (pasta `servidor/`). O terceiro mapa, Trincheira, segue as fases de `docs/trincheira/README.md`.

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
  audio.ts      sons sintetizados e gravações (public/sfx)
  menuScene.ts  fundo do menu: o mapa em 3D com a câmera passando devagar
src/server/   servidor das salas do co-op (guard.ts: proteções)
servidor/     ligar o servidor em um clique (túnel) ou numa VPS (Docker + HTTPS)
tools/        testes automáticos com capturas de tela (usam o Chrome instalado)
```

## Testes

- Regras (sem navegador): `npx tsx tools/test-sim.ts` e `npx tsx tools/test-board.ts` (placar online); co-op registrado no placar: `node tools/test-coop-board.mjs` (sobe um servidor de teste separado, leva uns 2 minutos)
- No navegador, sem janela (com `npm run dev` rodando): `node tools/<teste>.mjs <pasta-de-capturas>`, com `test-buy`, `test-barricade`, `test-doors`, `test-weapons`, `test-box`, `test-powerups`, `test-forge`, `test-progress`, `test-reload`, `test-sights`, `test-hell`, `test-boss`, `test-rota`, `test-wonder`, `test-bispo`, `test-online`, `test-menu` (menu 3D, carregamento e jogar de novo), `test-pause` (menu de jogo com Esc, opções e troca de teclas), `test-sfx` (sons gravados; aceita `firefox`), `test-trincheira` (mapa Trincheira), `coop` e `firefox-sim` (os dois aceitam `rota` ou `trincheira` como segundo argumento). Para revisar animações: `tools/reload.mjs` (capturas da recarga em câmera lenta) `tools/dog-shot.mjs` e `tools/boss-shot.mjs` (Cão Infernal e Carrasco de perto) e `tools/sheet.mjs` (junta capturas numa folha), `tools/probe-hits.mjs` (dano e marcador de acerto de cada arma), `tools/guns-shot.mjs` (armas na mão) e `tools/forge-fx.mjs` (efeitos da Forja) e `tools/rota-tour.mjs` (fotos de cada parada do Rota), `tools/trincheira-tour.mjs <pasta> [aberto]` (fotos de cada área da Trincheira), `npx tsx tools/trincheira-navpng.ts` (grade dos zumbis da Trincheira numa imagem), `tools/rota-look.mjs` (estrada, mata, milharal e um item visto de longe), `tools/polish-look.mjs <pasta> [mapa]` (menu, HUD em combate, zumbi de perto, caixa, máquina, pausa e fim de jogo), `tools/town-tour.mjs` (fotos de dentro de cada prédio da Cidade), `tools/bispo-shot.mjs` (o Bispo de perto) `tools/view.mjs` (vistas avulsas), `tools/menu-shots.mjs` (cada plano de câmera do fundo do menu e a tela de carregamento), `tools/crop.mjs` (amplia um pedaço de uma captura), `tools/menu-frame.mjs` (um instante de um plano do menu, sem os botões), `tools/feet-shot.mjs` (pés do zumbi mais perto), `tools/blob-count.mjs` (sombras dos personagens no fundo do menu), `tools/menu-controls-shot.mjs` (editor de teclas do menu principal), `tools/probe-pause-hit.mjs` (quem recebe o clique no menu de jogo) e `tools/sfx-levels.mjs` (volume de cada som gravado comparado com o sintetizado). Sons gravados: `tools/build-sfx.mjs` gera `public/sfx` a partir dos pacotes CC0 (ver `assets/LICENSES.md`). Para achar problemas: `tools/soak.mjs` (joga sozinho por minutos e mede memória, objetos e FPS), `tools/menu-cycle.mjs` (entra e sai de partidas e confere se nada fica preso na placa de vídeo), `tools/leak-probe.mjs` (confere se a partida anterior sai da memória), `tools/menu-leak.mjs` (troca o mapa do menu várias vezes e mede a placa de vídeo), `tools/probe-dead-hud.mjs` (posição dos pontos e da munição com o jogador caído) `npx tsx tools/map-info.ts` (resumo dos mapas), `npx tsx tools/rota-stats.ts` (vegetação do Rota e o que ficou em cima da estrada) e `npx tsx tools/passthru.ts [mapa]` (objetos na altura do corpo que não colidem).

Em desenvolvimento a página **não recarrega sozinha** quando o código muda: atualize com F5 para ver as novidades.
