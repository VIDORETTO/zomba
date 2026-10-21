# Trincheira: plano de polimento (tickets, esforço, especificação e testes)

Complementa o `README.md` desta pasta, que é a especificação do mapa, e o `CONTRATO.md`, que diz o que a simulação manda e o navegador desenha. O objetivo continua o mesmo: **jogar como Origins do Black Ops 2**, com nomes, modelos e sons próprios (regras da seção 0.2 do README: nada da Activision, assets gerados por código ou CC0, simulação autoritativa, Firefox, 60 FPS).

Levantamento feito em 2026-10-21, sobre o commit `869d8d7`.

---

## 0. Como usar este documento

### 0.1 Formato dos tickets

Cada ticket tem:

- **Tipo:** `bug`, `visual`, `jogo` (regra nova), `som`, `tela` (HUD e menus), `teste` ou `ajuste`.
- **Prioridade:**
  - `P0`: quebra algo prometido;
  - `P1`: muda muito a experiência;
  - `P2`: importante;
  - `P3`: extra.
- **Esforço:** escala abaixo.
- **Depende de:** tickets que precisam estar prontos antes.
- **Especificação:** o comportamento esperado, com números.
- **Testes primeiro (TDD):** os testes que se escrevem **antes** do código. Eles precisam falhar no início, porque é isso que prova que testam a coisa certa.
- **Implementação:** onde mexer (dicas, não ordens).
- **Aceite:** quando o ticket está pronto.

### 0.2 Escala de esforço

| Sigla | Tamanho | Referência |
| --- | --- | --- |
| XS | até 1 h | trocar uma constante, consertar um teste |
| P | 1 a 3 h | um bug localizado, um painel simples |
| M | meio dia a 1 dia | um sistema pequeno ou uma área redesenhada |
| G | 1 a 3 dias | um sistema novo com cliente, som e testes |
| GG | mais de 3 dias | quebrar em tickets menores antes de começar |

### 0.3 Ciclo de cada ticket (TDD)

1. Escrever os testes do ticket e rodar. Eles devem **falhar**. Se passarem, o teste está errado ou o problema não existe.
2. Implementar o mínimo para passar.
3. Rodar a bateria completa (0.4).
4. Nos tickets visuais, tirar capturas com `tools/trincheira-tour.mjs` e registrar na tabela de capturas (seção 10).
5. Registrar a mudança na seção 10.1 do `README.md` ("Andamento") e marcar o ticket aqui como pronto.

### 0.4 Bateria de testes (vale para todo ticket)

- `npx tsc --noEmit`, sem erros;
- `npx tsx tools/test-sim.ts` (regras gerais; hoje 213 ok);
- `npx tsx tools/test-trincheira-sim.ts` (regras da Trincheira; hoje 151 ok);
- `node tools/test-trincheira-jogo.mjs <pasta>` com o Vite ligado (hoje 15 ok);
- `node tools/test-trincheira-coop.mjs` nos tickets que mexem em regra;
- os mapas Cidade e Rota continuam iguais: `tools/test-rota.mjs`, `tools/test-doors.mjs` e `tools/test-box.mjs`.

### 0.5 Pronto quer dizer

- todos os testes do ticket e da bateria passando;
- nenhuma regra só no navegador;
- nenhum nome, som ou modelo do original;
- o FPS não cai mais de 5% em relação à medição anterior (F3);
- texto ao jogador em português simples.

---

## 1. Diagnóstico (o que foi medido)

| Item | Resultado |
| --- | --- |
| Tipos (`tsc`) | sem erros |
| `test-sim.ts` | 213 ok |
| `test-trincheira-sim.ts` | 151 ok, mas **1 falha em cada ~7 execuções** (montes, ver A4) |
| `test-trincheira-jogo.mjs` | 15 ok, sem erros no navegador |
| Memória | estável: 60 s parado com chuva e depois com um colosso passando, as geometrias e texturas não crescem sem motivo |
| FPS | 20 a 30 no navegador de teste, que desenha **sem placa de vídeo**. Não vale como medida, por isso existe o F3 |
| Capturas | Escavação plana e vazia; igreja sem interior; feixe do gerador com mancha preta e estourando a tela de perto; Blindado parecendo zumbi grande de boina; tijolo da Oficina vermelho demais; vários avisos empilhados no topo da tela |

**Resumo:** todos os sistemas de Origins estão implementados e testados. Falta **acabamento visual**, algumas **regras de Origins que foram simplificadas** e **um bug na missão final**.

---

## 2. Visão geral dos tickets

| Id | Título | Tipo | Prio | Esforço | Depende de |
| --- | --- | --- | --- | --- | --- |
| **A1** | Cajados voltam às mãos no fim da missão | bug | P0 | P | A6 |
| **A2** | Feixe do gerador: mancha preta e estouro de perto | bug | P0 | P | |
| **A3** | Conferir o título de entrada cortado | bug | P2 | XS | |
| **A4** | Teste instável dos montes | teste | P1 | XS | |
| **A5** | Testes de navegador rodando no Linux | teste | P1 | XS | |
| **A6** | Teste da missão inteira sem atalhos | teste | P0 | M | |
| **A7** | Sorteios com o sorteio da partida | bug | P3 | M | |
| **A8** | Recompensa do Blindado com constante própria | bug | P3 | XS | |
| **B1** | Escavação completa | visual | P1 | G | |
| **B2** | Céu e clima de Origins | visual | P1 | G | |
| **B3** | Lama molhada | visual | P2 | M | |
| **B4** | Interior da Igreja | visual | P2 | M | |
| **B5** | Materiais e variedade das paredes | visual | P2 | M | |
| **B6** | Colossos sempre visíveis ao longe | visual | P2 | M | |
| **B7** | Blindado com cara de armadura a vapor | visual | P1 | M | |
| **B8** | Câmara Antiga detalhada | visual | P2 | M | |
| **B9** | Geradores: lâmpadas e anel de progresso | visual | P2 | P | A2 |
| **C1** | Cajado desperto reanima aliado | jogo | P1 | M | |
| **C2** | Armas de 1918 | jogo | P1 | G | |
| **C3** | Bebidas exclusivas da Fonte da Sorte | jogo | P1 | G | |
| **C4** | Cabine de verdade na cabeça do colosso | jogo | P2 | G | |
| **C5** | Escudo na mão | jogo | P2 | M | |
| **C6** | Anéis da Escavação (2ª etapa da melhoria) | jogo | P2 | G | B1 |
| **C7** | Zumbis sobem no tanque | jogo | P3 | M | |
| **C8** | Segredo musical | jogo | P3 | M | D1 |
| **C9** | Rádios com a história | jogo | P3 | P | |
| **C10** | Punhos elementais | jogo | P3 | M | A1 |
| **D1** | Vinhetas próprias das rodadas | som | P2 | M | |
| **D2** | Colossos ao longe (som) | som | P3 | P | B6 |
| **D3** | Gerador com som contínuo | som | P3 | P | |
| **E1** | Pilha de avisos no topo | tela | P1 | P | |
| **E2** | Mapa no menu de pausa | tela | P2 | M | |
| **E3** | Dicas de primeira vez | tela | P2 | P | |
| **F1** | Registro de partida para ajuste | ajuste | P2 | M | |
| **F2** | Rodada de ajuste dos números | ajuste | P2 | M | F1 |
| **F3** | Orçamento de desempenho | teste | P1 | P | |

**Total aproximado:**

- 8 XS
- 10 P
- 15 M
- 7 G

Isso dá cerca de **25 a 35 dias de trabalho**.

---

## 3. Épico A: correções

### A1. Cajados voltam às mãos no fim da missão

- **Tipo:** bug · **Prio:** P0 · **Esforço:** P · **Depende de:** A6 (o teste que pega o bug)

**Contexto**

`finishMission` devolve cada cajado a `s.prevOwner` (`src/shared/trincheira.ts:2188`). Esse campo só é preenchido no atalho de teste `debug('missao')` (linha 2406). No jogo de verdade, o jogador devolve o cajado ao pedestal com `returnStaff`, e lá o dono vira `''` sem ser anotado. Resultado: o prêmio "cajados de volta para quem os tinha" nunca acontece. O teste atual passa porque usa o atalho.

**Especificação**

- Ao devolver um cajado desperto a um pedestal da Mesa, anotar quem o devolveu (`prevOwner = p.id`).
- Ao entrar na etapa 3 da missão, congelar `prevOwner` de cada cajado.
- Se o anotado tiver saído ou estiver morto, o cajado vai para o primeiro jogador vivo sem cajado. Se não houver ninguém, fica no pedestal.
- Um cajado por jogador continua valendo.

**Testes primeiro** (em `tools/test-trincheira-sim.ts`)

1. "missão real: quem pôs o cajado no pedestal o recebe de volta":
   - 4 jogadores, cada um pega um cajado desperto e o devolve ao pedestal;
   - forçar as etapas 3 a 5 só por regras, sem `debug('missao')`;
   - no fim, cada um tem o seu cajado.
2. "missão real: dono que saiu, o cajado vai para um vivo sem cajado".
3. "missão real: ninguém livre, o cajado fica no pedestal".

**Implementação:** em `returnStaff`, preencher `prevOwner` se `s.awake`. Em `finishMission`, aplicar a regra de reserva.

**Aceite:** os 3 testes passam sem usar `debug`. O teste antigo continua passando.

---

### A2. Feixe do gerador: mancha preta e estouro de perto

- **Tipo:** bug · **Prio:** P0 · **Esforço:** P

**Contexto**

Nas capturas de gerador ligado, o feixe ciano tem uma **mancha preta** no meio. Perto do gerador, ele vira uma coluna branca que tampa a tela.

- O feixe é `beamMesh(0x6af2ff, 0.7, 170, 0.55)` (`src/client/trincheira/generatorView.ts:35`, `common.ts:178`).
- É aditivo, dos dois lados e sem névoa.
- A mancha provavelmente é fumaça escura do escape (partícula normal) desenhada por cima de um material aditivo, ou o brilho (`glowSprite`) com ordem de desenho errada.

**Especificação**

- Nenhuma mancha escura dentro do feixe, de qualquer ângulo.
- O feixe fica mais transparente quando a câmera chega perto:
  - opacidade × `smoothstep(2, 12, distância)`;
  - abaixo de 2 m, quase invisível.
- De longe (mais de 60 m), continua bem visível, como em Origins.

**Testes primeiro** (novo `tools/test-trincheira-visual.mjs`)

1. "feixe de perto não estoura": com a câmera a 1,5 m do G1 ligado, olhando para o feixe, a luminância média do centro da tela (200×200 px) fica abaixo de 0,85.
2. "sem mancha preta no feixe": a 25 m, nenhuma coluna de pixels dentro do feixe tem luminância menor que 50% da mediana do feixe.
3. "feixe visível de longe": a 120 m, a média do feixe fica acima do céu ao redor.

**Implementação**

- Desenhar a fumaça antes do feixe (`renderOrder`) ou com `depthTest` correto.
- Mudar a opacidade por quadro em `generatorView.update`, usando a distância da câmera.

**Aceite:** os 3 testes passam. Capturas `tr21-gerador-ligado` antes e depois na seção 10.

---

### A3. Conferir o título de entrada cortado

- **Tipo:** bug · **Prio:** P2 · **Esforço:** XS

**Contexto:** no primeiro segundo da partida, a captura mostrou "TRINCHE / Norte / Qua" (`hud.showIntro`, `src/client/game.ts:300`). Provavelmente é só a animação de máquina de escrever.

**Especificação:** depois de 4 s, as três linhas aparecem inteiras: "TRINCHEIRA", "Norte da França, 1918" e o dia e a hora.

**Teste primeiro:** em `test-trincheira-jogo.mjs`, "título de entrada completo depois de 4 s", lendo o texto do elemento do HUD.

**Aceite:** o teste passa. Se já passar de primeira, fechar o ticket como "não é bug".

---

### A4. Teste instável dos montes

- **Tipo:** teste · **Prio:** P1 · **Esforço:** XS

**Contexto**

`tools/test-trincheira-sim.ts:218` espera de 1 a 17 montes depois de `onRoundStart(3)`. Os montes das rodadas 1 e 2, criados no início da partida, se somam. Às vezes dá 18 e o teste falha. O jogo está certo.

**Especificação:** o teste limpa `mounds` antes de chamar `onRoundStart(3)` e confere a proporção em muitas rodadas, com uma média de 45% ± 10%.

**Teste primeiro:** rodar o arquivo 30 vezes seguidas; precisa dar 0 falhas.

**Aceite:** 30 de 30 execuções sem falha.

---

### A5. Testes de navegador rodando no Linux

- **Tipo:** teste · **Prio:** P1 · **Esforço:** XS

**Contexto:** `tools/test-trincheira.mjs` e `tools/trincheira-tour.mjs` abrem o Chrome do Windows (`channel: 'chrome'`, `--use-angle=d3d11`). Na VPS não rodam. O `tools/launch.mjs` já resolve isso.

**Especificação:** os dois usam `launch()` de `tools/launch.mjs`.

**Teste primeiro:** rodar os dois na VPS; hoje falham ao abrir o navegador.

**Aceite:** os dois rodam na VPS e no Windows.

---

### A6. Teste da missão inteira sem atalhos

- **Tipo:** teste · **Prio:** P0 · **Esforço:** M

**Contexto:** os testes de missão usam `debug('missao', N)`, que pula o caminho real e esconde bugs como o A1.

**Especificação**

Um teste de regras que percorre a missão **só com interações e abates simulados**. Os atalhos permitidos são só os de "dar peças" e "ligar geradores", que encurtam a coleta mas não mudam regra de missão. O roteiro:

1. montar os 4 cajados;
2. resolver os 4 enigmas pelo sistema de alvos (`rayShot`, `onKill`);
3. pôr os cajados nos altares e encher com 20 abates;
4. pegar os despertos e pô-los na Mesa;
5. fazer 100 abates no anel;
6. acertar os 3 olhos com Sangue Morto;
7. fazer a defesa de 90 s;
8. conferir o fim da missão.

**Testes primeiro:** "missão de ponta a ponta sem debug('missao')", em `tools/test-trincheira-sim.ts`. Deve falhar hoje na conferência dos cajados (A1).

**Aceite:** passa depois do A1 e roda em menos de 20 s.

---

### A7. Sorteios com o sorteio da partida

- **Tipo:** bug · **Prio:** P3 · **Esforço:** M

**Contexto:** `trincheira.ts` usa `Math.random()` em tudo: peças, clima, montes, Fonte, Cruzados, Blindado. A especificação (4.9) pede "o rng da partida", para que a mesma semente gere a mesma partida.

**Especificação:** a classe recebe o gerador de números da `GameSim` pelo `TrHost` (por exemplo, `rand(): number`) e não usa mais `Math.random`.

**Testes primeiro:** "mesma semente, mesmas peças, clima das rodadas 1 a 20 e montes". Duas simulações com a mesma semente dão resultados iguais.

**Aceite:** o teste passa e `grep Math.random src/shared/trincheira.ts` não encontra nada.

---

### A8. Recompensa do Blindado com constante própria

- **Tipo:** bug · **Prio:** P3 · **Esforço:** XS

**Contexto:** `onPanzerDeath` paga `T.templarReward`, a constante dos Cruzados. O valor é o mesmo (500) por coincidência.

**Especificação:** criar `TRINCHEIRA.panzerReward = 500` e usá-la.

**Teste primeiro:** "Blindado morto paga panzerReward". Mudar a constante no teste e conferir.

**Aceite:** o teste passa e a tabela 10 do README ganha o valor.

---

## 4. Épico B: visual e clima

Regras de todo ticket B:

- O que se repete vai em lote (instancing).
- Decoração sem colisão é `solid: false`.
- Nada de regra no navegador.
- Efeitos só visuais podem sortear no próprio navegador (relâmpago, fumaça).

**Teste de cena padrão de B** (em `tools/test-trincheira-visual.mjs`):

1. sem erros na página;
2. as chamadas de desenho por quadro não passam do orçamento do F3;
3. os objetos esperados existem na cena (por nome, `object.name`);
4. as capturas da área entram na seção 10 para o aceite do usuário.

### B1. Escavação completa

- **Tipo:** visual · **Prio:** P1 · **Esforço:** G

**Contexto:** hoje é um anel plano com um bloco preto no meio. Em Origins, é o coração do mapa: um buraco fundo com escadas, andaimes e a Forja subindo do centro.

**Especificação** (README 4.7)

- **Poço em degraus.** Três anéis de pedra descendo visualmente até o poço central.
  - O piso continua plano em y = 0, porque o motor tem um andar só.
  - O efeito vem de paredes internas decorativas abaixo do chão, vistas por um vão escuro. O poço já é sólido.
- **Andaimes** de madeira em 2 lados, com escadas e tábuas.
- **Guindaste** de madeira apontando para o poço, com corda e balde.
- **Lonas** em estacas, com 2 mesas de arqueólogo, lampiões (luz quente fraca), baldes, pás encostadas e caixotes.
- **Runas no chão do anel:** 3 círculos concêntricos que pulsam em azul-claro (já existe a cor; falta o desenho das runas).
- **Coluna da Forja:** pedra com runas e brasa na boca. Hoje o bloco preto tampa a vista.
- **Pedestais dos cajados:** pedra trabalhada, com a cor do elemento e a runa acesa quando o cajado está lá.
- **Os 4 anéis de pedra do C6** já entram desenhados, mas parados.

**Testes primeiro**

1. Cena: `escavacao-andaime`, `escavacao-guindaste`, `escavacao-lona` e `escavacao-runas` existem.
2. Navegação: com tudo aberto, todos os pontos de interação da Escavação continuam alcançáveis. Reaproveitar a checagem de alcance de `test-sim.ts`.
3. Desempenho: cabe no orçamento do F3.

**Implementação:** blocos em `src/shared/map/trincheira.ts` (seção da Escavação) e camada animada (runas, brasa) em `src/client/trincheira/forjaView.ts` e `staffView.ts`.

**Aceite:** os testes passam e o usuário aprova as capturas `tr05-escavacao` e `tr06-forja`.

---

### B2. Céu e clima de Origins

- **Tipo:** visual · **Prio:** P1 · **Esforço:** G

**Especificação**

- **Céu:** laranja-avermelhado perto do horizonte e cinza-chumbo em cima, com uma camada de nuvens pesadas que se move devagar.
- **Relâmpagos** (só visual), a cada 15 a 40 s:
  - clarão de 0,15 s no céu e na luz do sol;
  - trovão atrasado pela distância.
  - Na chuva, a cada 6 a 15 s.
- **Clarões de artilharia** no horizonte, sincronizados com `artilharia-longe`, que já existe.
- **4 colunas de fumaça** fixas fora do mapa (instancing) e **sinalizadores** que caem devagar com luz vermelha, a cada 30 a 60 s.
- **Neve:** a névoa clareia (já existe) e um "pó" de neve se acumula aos poucos no chão durante a rodada.

**Testes primeiro**

1. Cena: `ceu-nuvens`, `fumaca-colunas` e `sinalizador`.
2. Com o relógio de teste avançado 60 s, ao menos 1 relâmpago aconteceu (contador no `weatherFx`).
3. Neve: a mistura de neve do chão sobe de 0 a mais de 0,5 em 60 s de neve.

**Implementação:** `src/client/trincheira/weatherFx.ts`, `mapView.ts` (céu) e `trFx.ts`.

**Aceite:** os testes passam e o usuário aprova `tr04-lama-sul` e `tr12-lama-norte`.

---

### B3. Lama molhada

- **Tipo:** visual · **Prio:** P2 · **Esforço:** M

**Especificação**

- Poças que refletem o céu: brilho especular forte em manchas, com uma textura de máscara.
- Crateras rasas com água.
- Tábuas jogadas por cima (decoração).
- Respingos na chuva, em lote perto da câmera.
- Pegadas de bota e marcas de esteira do tanque (já existem; reforçar).

**Testes primeiro:** cena `lama-pocas` e `lama-tabuas` existem; desempenho no orçamento.

**Aceite:** captura aprovada.

---

### B4. Interior da Igreja

- **Tipo:** visual · **Prio:** P2 · **Esforço:** M

**Especificação** (README 4.5)

- Nave alta de 8 m.
- Bancos tombados, com colisão baixa só nos que bloqueiam pouco.
- Altar com a Tábua.
- Vitrais quebrados com raios de luz colorida fraca, em lote.
- Telhado desabado: vigas à mostra e buracos com céu. Hoje há placas escuras "flutuando".
- Escombros no chão e o sino caído.

**Testes primeiro**

1. Cena: `igreja-bancos`, `igreja-vitral` e `igreja-vigas`.
2. Navegação: o altar da Tábua e o Baú de Desafios do Posto Oeste continuam alcançáveis.

**Aceite:** captura `tr07-igreja` aprovada.

---

### B5. Materiais e variedade das paredes

- **Tipo:** visual · **Prio:** P2 · **Esforço:** M

**Especificação**

- Tijolo da Oficina menos saturado (marrom-avermelhado sujo).
- Novas texturas em `textures.ts`:
  - madeira podre;
  - concreto rachado da Casamata;
  - aço rebitado (`rivet`, previsto no README 8).
- Variação de cor por bloco (ruído) para quebrar a repetição.
- Sacos de areia com mais volume.

**Testes primeiro:** as texturas novas existem no `TexSet`; nenhuma área usa só uma textura em mais de 80% das paredes (conferência no construtor).

**Aceite:** capturas `tr09-oficina` e `tr10-casamata` aprovadas.

---

### B6. Colossos sempre visíveis ao longe

- **Tipo:** visual · **Prio:** P2 · **Esforço:** M

**Contexto:** em Origins, os robôs estão sempre andando no horizonte. Hoje só aparecem na passagem.

**Especificação**

- Fora da passagem, os 2 colossos que não estão em cena caminham em laços **fora do mapa** (mais de 150 m do centro), como silhuetas na névoa.
- Fumaça nas chaminés e olho aceso.
- Desenho barato: um único modelo com nível de detalhe baixo, a até 4 chamadas de desenho cada.
- Na passagem, o colosso sai do laço e entra pela borda do mapa, sem aparecer do nada.

**Testes primeiro**

1. Com `robot = null`, existem 2 silhuetas visíveis a mais de 150 m.
2. Durante a passagem, a silhueta do colosso em cena some e o modelo completo aparece.
3. Desempenho no orçamento.

**Implementação:** `src/client/trincheira/colossusView.ts`. A pose da passagem continua vindo de `shared/colossus.ts`.

**Aceite:** os testes passam e a captura aprovada.

---

### B7. Blindado com cara de armadura a vapor

- **Tipo:** visual · **Prio:** P1 · **Esforço:** M

**Contexto:** de perto ele parece um zumbi grande de boina, com o rosto à mostra.

**Especificação** (README 6.9.3)

- Armadura de placas rebitadas cobrindo o corpo todo.
- Elmo fechado com **visor** que racha e cai no evento `blindado visor`.
- Lança-chamas no braço esquerdo, com chama-piloto acesa.
- Garra com corrente no direito.
- Mochila-foguete com 2 bocais acesos ao descer e ao saltar.
- Tanque de combustível nas costas.
- Placas que caem como pedaços ao chegar a 75%, 50% e 25% da vida (só visual).

**Testes primeiro** (cena, com `debugTr('blindado')`)

1. `blindado-visor`, `blindado-mochila`, `blindado-lancachamas` e `blindado-garra` existem.
2. Depois do evento `visor`, `blindado-visor` fica invisível e aparecem cacos.

**Implementação:** `src/client/blindado.ts`.

**Aceite:** os testes passam e a captura de perto aprovada.

---

### B8. Câmara Antiga detalhada

- **Tipo:** visual · **Prio:** P2 · **Esforço:** M

**Especificação**

- Pedras flutuando com borda iluminada da cor da alcova mais perto.
- Colunas de luz caindo do "céu".
- Portal de volta visível em cada alcova: anel de luz com partículas.
- Runas acesas nas paredes por elemento.
- Pilares quebrados.
- Névoa roxa (já existe).

**Testes primeiro:** cena `camara-pedras`, `camara-portal-<el>` (4) e `camara-luz`.

**Aceite:** captura `tr15-camara` aprovada.

---

### B9. Geradores: lâmpadas e anel de progresso

- **Tipo:** visual · **Prio:** P2 · **Esforço:** P · **Depende de:** A2

**Especificação**

- Durante a captura, um anel no chão enche conforme `gens[i].progress` e fica vermelho quando o progresso volta.
- Ao ligar, cordões de lâmpadas na área acendem em sequência, ao longo de 1,5 s.

**Testes primeiro:** com `progress = 0.5`, o anel está a 50% (uniforme do material). Ao ligar, as lâmpadas da área estão acesas depois de 2 s.

**Aceite:** os testes passam e a captura aprovada.

---

## 5. Épico C: fidelidade a Origins

Em todo ticket C, a regra fica em `src/shared` e o teste de regra vem primeiro.

### C1. Cajado desperto reanima aliado

- **Tipo:** jogo · **Prio:** P1 · **Esforço:** M

**Contexto:** em Origins, os cajados melhorados disparam algo que levanta quem caiu. É central no co-op.

**Especificação**

- Um disparo normal de **cajado desperto** que passe a até 0,7 m de um aliado **caído**, a até 25 m, reanima esse aliado na hora.
  - A vida dele volta cheia.
  - Evento `previve` com `by: 'cajado'`.
- O disparo gasta 1 munição normal.
- Funciona com os 4 elementos e conta como reanimação nas estatísticas.
- Cajado comum (não desperto) não reanima.
- No solo não existe aliado, então não muda nada.

**Testes primeiro** (`test-trincheira-sim.ts`)

1. "cajado desperto reanima aliado caído a 10 m".
2. "cajado comum não reanima".
3. "longe demais (30 m) não reanima".
4. "parede no meio não reanima".
5. "reanimação conta para quem atirou".

**Implementação:** em `launchStaff`, antes do dano, testar o raio contra os jogadores caídos (cilindro) com `world.raycast` para parede.

**Aceite:** os 5 testes passam e funciona no co-op (`test-trincheira-coop.mjs`).

---

### C2. Armas de 1918

- **Tipo:** jogo · **Prio:** P1 · **Esforço:** G

**Contexto:** Origins tem um arsenal de época: pistola inicial de cano longo, submetralhadora, fuzil de assalto antigo e metralhadora pesada. A Trincheira usa as armas modernas da Cidade. O README (4.10) já prevê armas com cara de 1918, com nomes próprios.

**Especificação** (nomes provisórios, próprios, nenhum nome de fabricante)

| id | Nome | Papel | Onde |
| --- | --- | --- | --- |
| `cano-longo` | Pistola de Cano Longo | pistola inicial **só na Trincheira**, 10 tiros, semiautomática | mão inicial |
| `ferrolho` | Fuzil de Ferrolho | um tiro forte, atravessa 2 zumbis | parede do Posto, no lugar da Carabina, 500 |
| `trincheira-smg` | Submetralhadora de Trincheira | automática, 32 tiros | parede da Casamata, no lugar da Submetralhadora, 1000 |
| `assalto-antigo` | Fuzil de Assalto Antigo | automático, 30 tiros, médio alcance | parede da Oficina, no lugar do Fuzil, 1400 |
| `tripe` | Metralhadora de Tripé | 100 tiros, lenta para mirar e para andar (−10%) | Caixa Misteriosa |

- Cada uma ganha versão da Forja.
- A da `cano-longo` é especial, como em Origins: vira uma pistola automática com coronha e pente de 40 ("Velha Senhora").
- **Novo em `MapDef`:** `startWeapon?: string`, se ainda não existir. Os outros mapas continuam com a pistola atual.
- Modelos em `gunModels.ts` com cara de época: madeira escura e metal oxidado.
- Sons a partir das gravações CC0 que já existem, com o tom alterado.

**Testes primeiro**

1. `test-sim.ts`:
   - "cada arma nova tem versão da Forja";
   - "a Trincheira começa com cano-longo e a Cidade com a pistola";
   - "as paredes da Trincheira vendem as armas da tabela".
2. "faixa de dano por segundo": a nova fica entre as armas da mesma faixa de preço (±20%).
3. Navegador: `test-weapons.mjs` estendido para os modelos novos (constroem sem erro e trocam de arma).

**Aceite:** os testes passam e as 4 tabelas do README (4.10 e 10) foram atualizadas.

---

### C3. Bebidas exclusivas da Fonte da Sorte

- **Tipo:** jogo · **Prio:** P1 · **Esforço:** G

**Contexto:** em Origins, a máquina giratória tem bebidas que não existem em máquina fixa. O Zomba tem só 6 bebidas, todas já usadas.

**Especificação**

Três bebidas novas, que **só saem da Fonte da Sorte** e só existem nos mapas que as listarem em `MapDef.fizzExtra`:

| id | Nome | Efeito |
| --- | --- | --- |
| `faisca` | Faísca | ao recarregar, um choque em volta (raio de 3 m). O dano cresce quanto mais vazio estava o pente. Recarga em 3 s |
| `olho-frio` | Olho Frio | mira cai direto na cabeça, dispersão 30% menor e +25% de dano na cabeça |
| `casca-grossa` | Casca Grossa | imune ao dano das próprias explosões. Ao cair de mais de 1,5 m, solta uma onda de choque de 4 m |

- O limite de bebidas continua em `MAX_PERKS` (+1 do desafio 4).
- O prêmio da missão "todas as bebidas" inclui as novas.
- Ícone e cor própria no HUD.
- A Cidade e a Rota não ganham essas bebidas.

**Testes primeiro** (`test-sim.ts` e `test-trincheira-sim.ts`)

1. "a Fonte pode dar as 3 novas; a máquina fixa não existe para elas".
2. "Cidade e Rota nunca sorteiam as novas".
3. "Faísca: recarregar com o pente vazio fere zumbis a 2 m e não a 4 m".
4. "Olho Frio: +25% na cabeça".
5. "Casca Grossa: a própria granada não fere; queda de 2 m fere zumbis em volta".
6. "prêmio da missão dá as 9 bebidas".

**Implementação:** `src/shared/perks.ts`, `sim.ts` (efeitos), `trincheira.ts` (`interactFizz`) e `hud.ts` (ícones).

**Aceite:** os 6 testes passam e a bateria completa também.

---

### C4. Cabine de verdade na cabeça do colosso

- **Tipo:** jogo · **Prio:** P2 · **Esforço:** G

**Contexto:** a especificação 6.8 pede a cabine como uma sala fora do mapa, mas a versão atual dá o prêmio e deixa o jogador na pegada.

**Especificação**

- 3 salas pequenas de 6 × 6 m, uma por colosso.
  - Ficam fora do mapa principal e da Câmara, por exemplo em x de 200 a 230 (ajustar `bounds`).
  - Paredes de aço rebitado, painéis com luzes, a janela do "olho" mostrando névoa e céu.
- Quem estiver na pegada com a escotilha aberta quando o pé desce é teletransportado para a cabine do colosso, como no portal.
- Na cabine:
  - pedestal com o prêmio (os mesmos da tabela 6.8, uma vez por colosso por partida), pego com F;
  - sem zumbis.
- Ao fim da passagem (ou depois de 15 s, o que vier antes), o jogador volta à última pegada com 3 s de invulnerabilidade.
- Snapshot: `NetPlayer.cabine?: 'atlas' | 'golias' | 'tita'`.

**Testes primeiro**

1. "escotilha aberta, pé desce: o jogador vai para a cabine e não cai".
2. "o prêmio se pega com F uma vez por colosso".
3. "volta à última pegada no fim da passagem, invulnerável por 3 s".
4. "zumbis não nascem na cabine".
5. "dois jogadores na mesma pegada vão juntos".

**Aceite:** os testes passam e a seção 10.1 do README sai de "simplificada".

---

### C5. Escudo na mão

- **Tipo:** jogo · **Prio:** P2 · **Esforço:** M

**Contexto:** em Origins, o escudo também se segura na mão. Ele bloqueia pela frente e dá pancada, e vai para as costas ao trocar de arma.

**Especificação**

- Tecla própria configurável (padrão `X`) alterna entre escudo na mão e arma.
- **Na mão:**
  - bloqueia 100% do dano de zumbi vindo de frente (120°);
  - não atira;
  - o botão de atirar dá pancada: 2 m, empurra e causa dano de faca;
  - cada bloqueio gasta vida do escudo, como hoje.
- **Nas costas:** igual a hoje.
- Andar com o escudo na mão: −10% de velocidade.

**Testes primeiro**

1. "na mão bloqueia de frente e não de costas".
2. "nas costas bloqueia de costas e não de frente" (o atual continua).
3. "pancada empurra e fere".
4. "com o escudo na mão não sai tiro".
5. "vida do escudo cai com os bloqueios".

**Aceite:** os testes passam, a tecla aparece em Controles e o modelo do escudo aparece na mão.

---

### C6. Anéis da Escavação (2ª etapa da melhoria)

- **Tipo:** jogo · **Prio:** P2 · **Esforço:** G · **Depende de:** B1

**Contexto:** o enigma mais marcante de Origins é girar os anéis de pedra até alinhar o símbolo do elemento. Hoje cada melhoria tem uma etapa só.

**Especificação**

- 4 anéis concêntricos em volta da Forja, cada um com 4 símbolos (um por elemento).
- 4 alavancas no anel: F gira o anel correspondente em 90°.
- **Com o enigma do elemento já resolvido:** alinhar os 4 anéis no símbolo desse elemento e atirar com o cajado dele na esfera que acende no centro conclui a 2ª etapa. Só então o altar da Câmara aceita o cajado.
- Snapshot: `rings: number[4]` e `orb: Element | null`.
- Vale para os 4 elementos. A ordem é livre.
- Constante `TRINCHEIRA.ringsStep = true`. Com `false`, volta ao comportamento atual.

**Testes primeiro**

1. "F na alavanca gira o anel em 90°".
2. "anéis alinhados no Fogo, com o enigma do Fogo resolvido: a esfera acende".
3. "acertar a esfera com o Cajado de Fogo conclui a etapa".
4. "sem a etapa, o altar recusa o cajado".
5. "com ringsStep = false, o altar aceita direto" (o comportamento atual).

**Aceite:** os testes passam, o A6 continua passando (ajustado para a nova etapa) e o README 6.13 está atualizado.

---

### C7. Zumbis sobem no tanque

- **Tipo:** jogo · **Prio:** P3 · **Esforço:** M

**Especificação**

- Com o tanque parado ou abaixo de 1,5 m/s, um zumbi a até 1,2 m da lateral e com o alvo em cima do convés sobe em 1 s (animação `climb`).
- No convés, anda e ataca normalmente.
- Com o tanque andando acima de 1,5 m/s, quem está no chão na frente é esmagado (já existe).

**Testes primeiro**

1. "jogador no tanque parado: um zumbi chega ao convés em menos de 6 s".
2. "tanque a 5 m/s: zumbi não sobe".
3. "zumbi no convés é levado junto".

**Aceite:** os testes passam e o visual da escalada está aprovado.

---

### C8. Segredo musical

- **Tipo:** jogo · **Prio:** P3 · **Esforço:** M · **Depende de:** D1

**Especificação**

- 3 objetos escondidos, por exemplo cantis de metal pendurados: um no Quartel, um na Vala Sul e um no Posto Oeste.
- F em cada um toca um sino.
- Com os 3, toca uma música própria e sintetizada de cerca de 90 s, pelo canal de música.
- Uma vez por partida.
- Evento `segredo`.

**Testes primeiro:** "3 objetos ativados disparam `segredo` uma vez"; "o mesmo objeto 2 vezes não conta 2"; no navegador, a função da música existe e toca sem erro.

**Aceite:** os testes passam e o usuário aprova a música.

---

### C9. Rádios com a história

- **Tipo:** jogo · **Prio:** P3 · **Esforço:** P

**Especificação**

- 6 rádios de campanha espalhados pelo mapa.
- F toca chiado e mostra 2 ou 3 linhas de texto da história, própria, no tom do jogo: a escavação, os colossos, a frente de batalha.
- Cada rádio uma vez por jogador.

**Testes primeiro:** "6 interações de rádio existem e são alcançáveis"; "o evento do rádio leva o índice certo".

**Aceite:** textos revisados pelo usuário.

---

### C10. Punhos elementais

- **Tipo:** jogo · **Prio:** P3 · **Esforço:** M · **Depende de:** A1

**Especificação**

- Depois da missão concluída, quem tem o Punho de Ferro pode, no altar de um elemento na Câmara, trocá-lo pelo punho daquele elemento.
- Efeitos por elemento:
  - Fogo: queima por 3 s;
  - Gelo: congela e estilhaça abaixo de 40% da vida;
  - Vento: arremessa longe;
  - Raio: salta em 2 zumbis.
- Pode trocar de elemento quantas vezes quiser.

**Testes primeiro:** um teste por elemento ("o soco aplica o efeito"); "sem missão concluída, o altar recusa".

**Aceite:** os testes passam.

---

## 6. Épico D: som

### D1. Vinhetas próprias das rodadas

- **Tipo:** som · **Prio:** P2 · **Esforço:** M

**Especificação**

- Na Trincheira, o começo e o fim da rodada tocam vinhetas próprias: tambor de guerra, coral grave e metais distantes, tudo sintetizado.
- Os outros mapas não mudam.
- A rodada de Blindado tem um começo mais pesado.

**Testes primeiro:**

1. No navegador, espionar `audio`: na Trincheira, `roundStart` chama a vinheta da Trincheira; na Cidade, a de sempre.
2. `tools/sfx-levels.mjs`: o volume da vinheta fica na mesma faixa das atuais.

**Aceite:** os testes passam e o usuário aprova de ouvido.

---

### D2. Colossos ao longe (som)

- **Tipo:** som · **Prio:** P3 · **Esforço:** P · **Depende de:** B6

**Especificação:** passos graves e abafados das silhuetas ao longe, a cada passo, mais baixos com a distância. Rangido metálico quando o colosso em cena está a menos de 40 m.

**Teste primeiro:** com uma silhueta a 200 m, ao menos 1 passo tocado em 10 s, com volume menor que 0,2.

**Aceite:** o teste passa.

---

### D3. Gerador com som contínuo

- **Tipo:** som · **Prio:** P3 · **Esforço:** P

**Especificação**

- Gerador ligado: motor contínuo posicional e baixo, até 25 m.
- Atacado por Cruzados: o motor falha (cortes).
- Desligado: silêncio.

**Teste primeiro:** perto do G1 ligado existe uma fonte de som em laço; ela some ao desligar.

**Aceite:** o teste passa.

---

## 7. Épico E: tela e conforto

### E1. Pilha de avisos no topo

- **Tipo:** tela · **Prio:** P1 · **Esforço:** P

**Contexto:** a barra do Blindado, o aviso do colosso e o dos Cruzados ficam um em cima do outro, tampando o meio da tela.

**Especificação**

- A barra de chefe fica fixa no topo.
- Embaixo dela, no máximo **2** avisos de cada vez, por prioridade:
  1. colosso a menos de 8 s ou passando a menos de 60 m;
  2. Cruzados;
  3. colosso longe.
- Os avisos ficam compactos: 1 linha, fonte menor.
- O que não cabe vira um ícone pequeno com contagem.

**Testes primeiro:** no navegador, com Blindado, colosso perto e Cruzados ao mesmo tempo, no máximo 2 avisos visíveis abaixo da barra, e o do colosso perto é o primeiro.

**Aceite:** o teste passa e a captura aprovada.

---

### E2. Mapa no menu de pausa

- **Tipo:** tela · **Prio:** P2 · **Esforço:** M

**Especificação**

- Na Trincheira, o menu de pausa mostra a planta, desenhada a partir de `layout.json`:
  - áreas abertas em cor e fechadas em cinza;
  - geradores (cinza, ciano ou vermelho);
  - Fonte da Sorte, Caixa e tanque;
  - portais abertos;
  - seta "você está aqui" e aliados.
- Os outros mapas não mostram.

**Testes primeiro:** o menu de pausa da Trincheira tem o desenho da planta; o da Cidade não. Com o G1 ligado, o ícone do G1 é ciano.

**Aceite:** os testes passam e a captura aprovada.

---

### E3. Dicas de primeira vez

- **Tipo:** tela · **Prio:** P2 · **Esforço:** P

**Especificação**

- A primeira vez perto de uma pá, um gerador, o tanque, uma peça, uma bancada ou um monte mostra uma dica de 1 linha. Por exemplo: "Pegue a pá e segure F nos montes de terra".
- Lembrado no navegador (pode falhar sem quebrar nada).
- Opção "Dicas" em Controles para desligar.

**Testes primeiro:** a dica aparece uma vez; depois de recarregar, não aparece; com a opção desligada, nunca aparece; com a memória do navegador bloqueada, o jogo não quebra.

**Aceite:** os testes passam.

---

## 8. Épico F: equilíbrio e desempenho

### F1. Registro de partida para ajuste

- **Tipo:** ajuste · **Prio:** P2 · **Esforço:** M

**Especificação**

Só em desenvolvimento, com `?autoplay` ou uma opção escondida. A simulação anota:

- a rodada e o tempo de cada gerador ligado e perdido;
- as quedas por causa (zumbi, Blindado, pisada, fogo);
- as recapturas ganhas e perdidas;
- as passagens de colosso e quantos foram esmagados;
- a rodada em que cada cajado foi montado e despertado.

No fim, o registro é baixado como JSON. Nada disso vai para o servidor nem para a versão de produção.

**Testes primeiro:** depois de uma partida simulada curta, o registro tem os campos e os números batem com os eventos. Na versão de produção, a função não existe.

**Aceite:** os testes passam.

---

### F2. Rodada de ajuste dos números

- **Tipo:** ajuste · **Prio:** P2 · **Esforço:** M · **Depende de:** F1

**Especificação**

Jogar 3 partidas até a rodada 20 ou mais, com registro, e ajustar a tabela 10 do README. Pontos a observar:

- **Colosso a cada 20 s de pausa:** pode estar frequente demais.
- **Recaptura de 30% por rodada:** pode cansar.
- **Preço e tempo dos geradores.**
- **Blindado a cada 3 a 5 rodadas.**
- **Pá Dourada em 30 montes.**

**Testes primeiro:** os testes de regra que usam esses números leem `TRINCHEIRA`, para não ficarem presos a valores antigos.

**Aceite:** a tabela 10 está atualizada, com o motivo de cada mudança.

---

### F3. Orçamento de desempenho

- **Tipo:** teste · **Prio:** P1 · **Esforço:** P

**Contexto:** o navegador de teste da VPS desenha sem placa de vídeo, então o FPS de lá não serve de medida. É preciso medir no PC do usuário (Firefox) e ter um número que os testes conferem.

**Especificação**

- **Contagem real de chamadas de desenho por quadro:** `renderer.info.autoReset = false`, zerar no começo do quadro e ler no fim.
- O contador de FPS que já existe mostra também chamadas e triângulos, com uma tecla de depuração.
- **Linha de base:** medir em 6 pontos do mapa (os da tour) e anotar aqui.
- O teste falha se algum ponto passar da linha de base + 10%.
- O usuário mede o FPS no Firefox nos mesmos 6 pontos, e o valor fica anotado aqui.

**Testes primeiro:** `tools/test-trincheira-visual.mjs`, "chamadas de desenho dentro do orçamento nos 6 pontos". No começo, sem linha de base, só imprime e falha de propósito até a linha de base ser preenchida.

**Aceite:** linha de base e FPS no Firefox anotados aqui; o teste passa.

Linha de base medida em 2026-10-21 (qualidade "baixa" do navegador de teste da VPS, com os 6 geradores ligados, tempo limpo e rodada congelada). O arquivo `docs/trincheira/orcamento.json` guarda os mesmos números e é o que `tools/test-trincheira-visual.mjs` confere (margem de 10%). Para regravar depois de uma mudança de propósito: `node tools/test-trincheira-visual.mjs --gravar`. **Falta o usuário medir o FPS no Firefox** (tecla F3 no jogo mostra FPS, chamadas e triângulos). A Câmara é o ponto mais pesado em chamadas (611): é o primeiro candidato a lotes (B8).

| Ponto | Chamadas | Triângulos | FPS no Firefox |
| --- | --- | --- | --- |
| Posto (103, 50) | 408 | 59956 | |
| Lama sul (30, 27) | 397 | 61951 | |
| Escavação (-15, -22) | 381 | 62113 | |
| Igreja (-84, 18) | 292 | 51434 | |
| Quartel (2, -64) | 303 | 47210 | |
| Câmara (165, 6) | 611 | 54356 | |

---

## 9. Ordem de execução (sprints)

| Sprint | Tickets | Resultado |
| --- | --- | --- |
| **S1: correções** | A4, A5, A6, A1, A2, A3, A8, F3, E1 | Base de testes confiável, bug da missão corrigido, feixe consertado, orçamento de desempenho medido |
| **S2: primeira impressão** | B1, B2, B9 | Escavação e céu com cara de Origins |
| **S3: o que falta de Origins (alto)** | C1, C2, C3 | Reanimar com cajado, armas de 1918 e bebidas da Fonte |
| **S4: visual restante** | B7, B3, B4, B5, B6, B8 | Blindado, lama, igreja, materiais, colossos ao longe e Câmara |
| **S5: som e conforto** | D1, D2, D3, E2, E3 | Vinhetas, sons de ambiente, mapa na pausa e dicas |
| **S6: Origins (médio)** | C4, C5, C6 | Cabine, escudo na mão e anéis da Escavação |
| **S7: extras e ajuste** | C7, C8, C9, C10, A7, F1, F2 | Tanque escalável, segredos, história, punhos, sorteio da partida e números ajustados |

Cada sprint termina com:

- a bateria completa (0.4);
- a tour de capturas;
- commit;
- explicação ao usuário em português simples.

---

## 10. Capturas (antes e depois)

Pasta sugerida: `docs/trincheira/capturas/` (só capturas do nosso jogo).

| Ticket | Antes | Depois |
| --- | --- | --- |
| A2 | `tr21-gerador-ligado` (e `capturas/a2-gerador-antes-8m.png`) | `capturas/a2-gerador-depois-8m.png`, `capturas/a2-gerador-depois-perto.png` |
| B1 | `capturas/antes-tr05-escavacao.png`, `capturas/antes-tr06-forja.png` | `capturas/depois-b1-escavacao.png`, `capturas/depois-b1-escavacao-poco.png` |
| B2 | `capturas/antes-tr04-lama-sul.png` | `capturas/depois-b2-ceu.png`, `capturas/depois-b2-relampago.png` |
| B4 | `capturas/antes-tr07-igreja.png` | |
| B5 | `capturas/antes-tr09-oficina.png`, `capturas/antes-tr10-casamata.png` | |
| B7 | `e2-blindado` | |
| B8 | `tr15-camara` | |
| B9 | | `capturas/depois-b9-lampadas.png` |
| E1 | `e3-cruzados` | `capturas/e1-avisos-depois.png` |

---

## 11. Andamento

| Id | Situação | Data | Observação |
| --- | --- | --- | --- |
| A1 | pronto | 2026-10-21 | `returnStaff` anota `prevOwner`; `handBackStaffs` aplica a reserva (vivo sem cajado, senão pedestal). 3 testes novos |
| A2 | pronto | 2026-10-21 | A mancha era a fumaça escura do escape sob o feixe aditivo: trocada por vapor claro aditivo. Feixe e brilho desbotam pela distância (smoothstep 2 a 12 m). 3 testes visuais (+1 a 8 m) |
| A3 | pronto, era bug | 2026-10-21 | A digitação contava ticks de `setInterval`, que atrasam com o quadro pesado; agora vai pelo relógio. Teste: 3 linhas inteiras 4 s depois da primeira |
| A4 | pronto | 2026-10-21 | Montes: média de 45% ± 10% em 400 rodadas. Também estabilizados: Blindado (linha de visão), Cruzados (espera até 100 s) e Fonte (sem recaptura sorteada). 60 de 60 execuções limpas |
| A5 | pronto | 2026-10-21 | `test-trincheira.mjs`, `trincheira-tour.mjs`, `test-rota/doors/box.mjs` usam `launch()` e `127.0.0.1` |
| A6 | pronto | 2026-10-21 | Missão de ponta a ponta sem `debug('missao')` (só `itens` e `gens`), cerca de 6 s |
| A8 | pronto | 2026-10-21 | `TRINCHEIRA.panzerReward = 500`; tabela da seção 10 do README atualizada |
| F3 | pronto, falta o FPS do Firefox | 2026-10-21 | Contador real de chamadas e triângulos (`game.perf`, tecla F3), linha de base e teste dentro de +10% |
| E1 | pronto | 2026-10-21 | `TrHud.setAlerts`: no máximo 2 avisos abaixo da barra do chefe, por prioridade, o resto vira "+N" |

| B1 | pronto, falta aprovação das capturas | 2026-10-21 | `escavacaoView.ts`: poço em degraus (3 degraus), 2 andaimes, guindaste com corda e balde, 2 lonas com mesa e lampião, runas que pulsam (3 círculos), 4 anéis de pedra parados (C6), pedestais com laje e runa acesa. `ForjaView`: brasa na boca e runas na coluna. Removida a tampa preta do poço no construtor. Tudo sem colisão; geometria juntada por material |
| B2 | pronto, falta aprovação das capturas | 2026-10-21 | `skyFx.ts`: nuvens que andam, 4 colunas de fumaça, sinalizadores, relâmpago de 0,15 s com trovão atrasado, clarão de artilharia no horizonte sincronizado com o estrondo (o sorteio saiu do `trSound`). Céu com faixa laranja e topo cinza-chumbo. Neve: o chão enche em 80 s (`snowGround`) e a névoa continua clareando rápido. `mapView.setSkyFlash` |
| B9 | pronto | 2026-10-21 | Anel de progresso (shader, vermelho quando volta) e cordões de lâmpadas (20 por gerador, acendem em 1,5 s) |

**Observações do S1**

- `test-rota.mjs` tem 1 falha constante (FPS, por software) e 2 verificações de tempo do ônibus que oscilam. Medido nos dois lados (com e sem as mudanças do S1): igual, não é regressão.
- Os demais tickets estão a fazer.

**Observações do S2**

- O orçamento de desempenho subiu com o conteúdo novo (B1, B2, B9): até +8% em chamadas e +12% em triângulos nos pontos que enxergam a Escavação, dentro da margem de 10% depois de trocar as lâmpadas esféricas por octaedros. Linha de base mantida.
- `test-box.mjs` falhou uma vez em 3 execuções (tempo, por software); o mesmo vale para `test-rota.mjs` (ver S1).
