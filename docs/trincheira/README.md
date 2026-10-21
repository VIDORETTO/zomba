# Mapa "Trincheira": especificação para implementação

Este documento descreve, do começo ao fim, o terceiro mapa do Zomba: **Trincheira**. Ele recria, do jeito do Zomba, o mapa Origins do Zombies do Black Ops 2 (campo de batalha de 1918, lama, seis geradores, robôs gigantes, tanque, cajados elementais e uma escavação antiga no centro).

Foi escrito para **uma IA implementar sozinha**. Leia inteiro antes de começar. Quando este texto e o código discordarem, o código atual manda nos detalhes técnicos e este texto manda nas regras do jogo. Tudo o que não estiver aqui fica a seu critério, seguindo o estilo dos mapas Cidade (`src/shared/map/town.ts`) e Rota (`src/shared/map/rota.ts`).

## 0. Antes de começar

### 0.1 Arquivos desta pasta

| Arquivo | Para que serve |
| --- | --- |
| `README.md` | Este documento: regras, números, arquitetura e fases. |
| `POLIMENTO.md` | Plano de polimento depois das fases 1 a 9: tickets com esforço, especificação, testes primeiro (TDD) e ordem dos sprints. |
| `planta.svg` | Planta de trabalho desenhada por nós, em **metros**, com grade de 10 m. Abra no navegador. |
| `layout.json` | Os mesmos dados da planta, em metros, prontos para o construtor do mapa ler (áreas, lama, pegadas, portões, barricadas, rota do tanque e todos os pontos). |
| `fonte/layout-src.mjs` | O traçado original, em pixels da planta de referência. **É a fonte**: para mudar o mapa, edite aqui. |
| `fonte/gerar.mjs` | Gera `planta.svg`, `layout.json` e a cópia que o jogo importa, `src/shared/map/trincheira-layout.ts` (tipos em `trincheira-types.ts`). Rode com `node docs/trincheira/fonte/gerar.mjs docs/trincheira` **sempre que mudar o traçado**. Se passar a imagem de referência como 2º argumento, também gera `overlay.html` (o traçado por cima da planta original, para conferir). |

Referência usada (só para consulta, **não copie a imagem para o repositório**, ela não é nossa): planta de Origins feita por ZedzDEMIZie no guia da Steam `https://steamcommunity.com/sharedfiles/filedetails/?id=2577072143`, imagem `https://images.steamusercontent.com/ugc/1715295700887879346/89477003EB1E35CDB9000A4B3E1DCF6C84C18208/`.

### 0.2 Regras do projeto (valem para tudo)

- **Nada da Activision.** Nenhum nome, logotipo, som, música, modelo ou textura do jogo original. Use só os nomes deste documento. Nada de cruzes de ferro, suásticas ou insígnias militares reais. Os uniformes e robôs são genéricos.
- **Assets só CC0** (ou licença comercial sem "NC"). Todo asset baixado entra em `assets/LICENSES.md`. O normal no Zomba é gerar tudo por código: blocos, texturas procedurais (`src/client/textures.ts`) e áudio sintetizado (`src/client/audio.ts`). Gravações CC0 ficam em `public/sfx` (ver `tools/build-sfx.mjs`).
- **O usuário não programa.** Ele delegou as decisões técnicas. Explique o que foi feito em português simples, sem jargão.
- **Simulação autoritativa.** Toda regra de jogo roda em `src/shared` (`GameSim`). O solo roda a mesma simulação no navegador, e o co-op roda no servidor (`src/server`). O navegador só desenha e manda comandos. Nada de regra só no cliente.
- **O usuário joga no Firefox.** Evite APIs sem alternativa no Firefox. Os testes rodam no Chrome headless (`tools/firefox-sim.mjs` simula diferenças).
- **Ambiente:** a ferramenta PowerShell está quebrada aqui, então use Bash. Scripts com `import 'playwright-core'` precisam ficar dentro de `tools/`. Nunca ponha crases ou `${` dentro de `node -e` no Bash. Escreva arquivos com a ferramenta de escrita.
- **Testes antes de encerrar cada fase:**
  - regras: `npx tsx tools/test-sim.ts`;
  - navegador: os `tools/test-*.mjs`, com `npm run dev` ligado.
  - Crie `tools/test-trincheira.mjs` (modelo: `tools/test-rota.mjs`) e aumente esse teste a cada fase.
- **Desempenho:** o jogo precisa manter 60 FPS em PC médio. Desenhe o que se repete em lote (instancing), como a vegetação faz em `src/client/foliageView.ts`.

### 0.3 Como o motor funciona (o que limita o mapa)

- O mapa é um `MapDef` (`src/shared/map/types.ts`) montado uma vez por `getMap(id)` (`src/shared/map/index.ts`) no navegador e no servidor.
- Tudo é feito de **blocos** (`Block`). Blocos sólidos são **sempre alinhados aos eixos**. Só os decorativos (`solid: false`) podem girar.
- A colisão (`src/shared/world.ts`) e o caminho dos zumbis (`src/shared/navgrid.ts`, grade de 0,5 m, **um andar só**) saem dos blocos sólidos.
  - O chão é plano em y = 0. Degraus de até 0,45 m são subidos sozinhos.
  - Não existe um andar em cima de outro, então não há túnel por baixo de área jogável.
  - A Câmara Antiga fica num lugar separado do mesmo plano e o jogador chega lá por teletransporte.
- Já existem e devem ser reaproveitados:
  - portas por pontos: `DoorDef`, `woodDoor`, `debris`. Vários portões com o mesmo `id` abrem juntos;
  - barricadas (`zombieEntry`);
  - armas de parede (`wallBuy`, desenho a giz);
  - máquinas de bebida (`machine`);
  - Caixa Misteriosa com vários locais (`boxSpot`);
  - Forja (versão melhorada da arma);
  - itens que caem (`src/shared/powerups.ts`);
  - ônibus que anda num caminho fechado com paradas (`MapDef.bus`, `src/shared/busBody.ts`, `src/client/busView.ts`). É a base do tanque;
  - energia (`MapDef.perksNeedPower`, alavanca `power`) e névoa por zona (`MapDef.zones`, Rota);
  - chefão Carrasco, que puxa o jogador com a corrente pelo evento `bosspull`. É a base do Blindado;
  - armas maravilha `wind`, `arc` e `vortex`, com dano por `wonderDamage` em `src/shared/sim.ts`. São a base dos cajados de Vento e de Raio.
- `src/shared/sim.ts` já tem mais de 2400 linhas. **Não ponha os sistemas novos lá dentro.** Crie `src/shared/trincheira.ts` (classe `TrincheiraSystems`) e chame-a do `GameSim` em poucos pontos: no `tick`, ao interagir, ao matar zumbi, ao montar o `snapshot`, ao dar dano no jogador e no movimento. Veja a seção 8.

---

## 1. Visão geral

**Sensação:** fim de tarde nublado na frente de batalha. Lama até o tornozelo, trincheiras de tábua e sacos de areia, arame farpado, crateras, carroças pegando fogo, tiros de artilharia ao longe. Três robôs gigantes cruzam o mapa e esmagam quem estiver embaixo. No centro há uma escavação com um poço de pedra cheio de runas que brilham.

**Ciclo de jogo:**

1. Começa no **Posto de Comando**. Abre portões e liga os **6 geradores**: paga, fica em cima e segura a posição.
2. Cada gerador ligado acende a **bebida** e a **Fonte da Sorte** daquela área. Com os 6 ligados, a **Forja** sobe do poço da Escavação.
3. Enquanto isso o jogador:
   - cava montes de terra com a **pá**;
   - anda de **tanque**;
   - foge dos **colossos**;
   - enfrenta o **Blindado** e os **Cruzados**, que tentam desligar geradores.
4. Junta peças para o **Escudo** e o **Drone**.
5. Para quem quer mais: gramofone e disco abrem os **portais** para a **Câmara Antiga**. As peças viram os **4 cajados elementais**, cada cajado tem uma **melhoria** e há uma **missão final**.

**Escala:** o mapa tem cerca de 245 m × 155 m (a Rota tem 570 m × 510 m e a Cidade é bem menor). Andando sem correr, ir do Posto de Comando à Igreja pela lama leva uns 50 s.

---

## 2. Nomes (original → Zomba)

Use **só** a coluna Zomba no jogo, no código e nos textos.

| Origins (referência) | Zomba | id no código |
| --- | --- | --- |
| Origins | Trincheira | `trincheira` |
| Spawn / Generator 1 | Posto de Comando | `posto` |
| Generator 2 (bunker) | Casamata (com a Cripta) | `casamata` |
| Generator 3 / Tank Station | Oficina / Estação do Tanque | `oficina` / `estacao` |
| Generator 4 | Vala Sul | `vala` |
| Generator 5 | Quartel Norte | `quartel` |
| Generator 6 / Church | Posto Oeste / Igreja | `oeste` / `igreja` |
| No Man's Land | Terra de Ninguém (lama) | `lama` |
| Excavation Site | Escavação | `escavacao` |
| Crazy Place | Câmara Antiga | `camara` |
| Pack-a-Punch | Forja (já existe) | `forge` |
| Der Wunderfizz | Fonte da Sorte | `fizz` |
| Juggernog / Quick Revive / Speed Cola / Double Tap | Couraça / Segundo Fôlego / Reflexo / Gatilho (já existem) | `couraca` / `folego` / `reflexo` / `gatilho` |
| Stamin-Up / Mule Kick | Passo Firme / Mula (já existem) | `passo` / `mula` |
| Giant Robots (Freya, Odin, Thor) | Colossos (Atlas, Golias, Titã) | `atlas` / `golias` / `tita` |
| Panzer Soldat | Blindado | zumbi `kind 7` |
| Templar Zombies | Cruzados | zumbi `kind 8` |
| Zombie Blood | Sangue Morto | powerup `sangue` |
| Elemental Staffs | Cajados (Fogo, Gelo, Vento, Raio) | `cajado-fogo`... |
| Upgraded Staffs | Cajados Despertos | `cajado-fogo-d`... |
| One Inch Punch | Punho de Ferro | `punho` |
| G-Strike | Granada de Artilharia | `artilharia` |
| Maxis Drone | Drone de Campo | `drone` |
| Zombie Shield | Escudo de Trincheira | `escudo` |
| Mystery Box | Caixa Misteriosa (já existe) | `box` |
| Reward boxes / Challenges | Baús de Desafios | `desafio` |
| Ancient tablet | Tábua de Pedra | `tabua` |
| Gramophone / Records | Gramofone / Disco Negro | `gramofone` / `disco` |
| Golden shovel / helmet | Pá Dourada / Capacete Dourado | `pa-dourada` / `capacete` |
| Main Easter egg | Missão "Canção da Escavação" | `missao` |

---

## 3. Coordenadas

- Unidade: **metro**. Eixo `x` cresce para o **leste** (direita da planta) e `z` cresce para o **sul** (para baixo na planta). Norte = `-z`.
- A origem (0, 0) fica perto da Escavação. Os limites jogáveis são aproximadamente x de -125 a 125 e z de -80 a 80. A Câmara Antiga fica fora disso (seção 6.12), então `bounds` deve cobrir x de -128 a 200 e z de -84 a 84.
- Conversão da planta de referência (pixels na imagem exibida em 2000×1125): `x = (px - 1000) × 0,15` e `z = (py - 560) × 0,15`.
- Os valores das tabelas abaixo estão arredondados a 0,5 m. Os exatos estão em `layout.json`. **Ao construir, leia o `layout.json`** em vez de copiar números à mão. O builder pode importar o JSON direto, porque o Vite e o tsx aceitam `import layout from '...json'`, ou você pode convertê-lo para um `.ts`.

---

## 4. A planta

Abra `planta.svg`. Legenda:

| Na planta | Significado |
| --- | --- |
| cinza | piso firme |
| marrom | pegada de colosso, que também é piso firme |
| roxo | plataforma do tanque |
| faixa escura | lama |
| tracejado roxo | rota do tanque |
| traço laranja | portão comprado, com o preço |
| tracejado bege | barricada |

O preto é **fora do mapa**: um campo de crateras que se vê mas onde não se entra.

### 4.1 Áreas e como se abrem

| Área (id em `layout.json`) | Libera com | Conteúdo principal |
| --- | --- | --- |
| `posto` Posto de Comando | início | G1, Segundo Fôlego, Fonte (G1), Caixa (início), Baú de Desafios, 2 pás, cérebro do Drone, bancada, Fuzil de Ferrolho e Escopeta de dois canos na parede, granadas |
| `trinch-leste-*`, `casamata`, `casamata-norte`, `casamata-ponte`, `bunker`, `bunker-lajes` | portão **Casamata, 750** | G2, Caixa, Fonte, 3 peças de Gelo, Tábua de Pedra (Cripta), pegada J, Submetralhadora de Trincheira |
| `estacao`, `estacao-plat`, `estacao-rampa` | portão **Estação do Tanque, 750** | tanque estacionado, túnel do portal de Fogo, Revólver .44 |
| `oficina-galpao`, `oficina-liga`, `oficina` | portões **Oficina, 1000** (3 portões, abrem juntos) | G3, Reflexo, Caixa, Fonte, pegada I, bancada, Fuzil de Assalto Antigo |
| Terra de Ninguém: faixas de `mud` e `faixa` | **qualquer um** dos portões Casamata ou Estação | montes de terra, lápide, rota do tanque |
| Escavação: `cunha`, `esc-*`, anel, pegadas A, C, E, F | livre a partir da lama | Forja (poço central), gramofone, discos, Mesa dos Cajados, plataforma norte do tanque, Fuzil de rajada |
| `vala`, `vala-portao-leste` | portões **Vala Sul, 1000** (2 portões) | G4, Couraça, Caixa, Fonte, túnel do portal de Vento, peças de Raio, pegadas G e H, Escopeta de repetição |
| `quartel`, `quartel-desce` | portões **Quartel Norte, 1250** (2 portões) | G5, Gatilho, Caixa, Fonte, túnel do portal de Raio, peças de Vento, pegadas K e B, Metralhadora leve |
| `igreja`, `igreja-plat`, `oeste-liga`, `oeste` | portão **Igreja, 1250**, **ou de graça pelo tanque** | G6, Caixa, Fonte (G6), túnel do portal de Gelo, altar da Tábua, peças de Fogo, bancada, Baú de Desafios, pegada D, Fuzil de precisão |
| `camara` Câmara Antiga | portal aberto (seção 6.12) | cristais, altares dos cajados, enigma do Raio |

Mudanças necessárias no motor:

- **`SpawnPoint.area` passa a aceitar uma lista** (`string | string[] | null`). O ponto vale se **qualquer** porta da lista estiver aberta. A lama e a Escavação usam `['casamata', 'estacao']`.
- **Área ocupada vale como aberta.** Quem chega à Igreja pelo tanque sem abrir o portão precisa ter zumbis por perto. Regra: um ponto de nascimento vale se a porta estiver aberta **ou** se houver um jogador vivo dentro da área (teste de ponto no polígono de `layout.json`). O mesmo vale para a Câmara Antiga.

### 4.2 Portões (`layout.json → doors`)

| id | Preço | Portões: centro (x, z), lado de quem compra, largura |
| --- | --- | --- |
| `casamata` | 750 | (97.5, 39), quem compra fica ao sul, 4 m |
| `estacao` | 750 | (95, 54.5), quem compra fica a leste, 4,5 m |
| `oficina` | 1000 | (64.5, -24.5) a leste; (39.5, -26) a oeste; (53.5, 22.5) ao sul |
| `vala` | 1000 | (-19.5, 47) ao norte; (7, 32) ao norte |
| `quartel` | 1250 | (-20, -44.5) ao sul; (2, -34.5) ao sul |
| `igreja` | 1250 | (-73.5, 7.5) a leste |

Visual:

- **trincheiras:** portão de tábuas com arame (`woodDoor`);
- **lama:** entulho de sacos de areia e madeira (`debris`), com placa de preço.

### 4.3 Barricadas (`layout.json → entries`)

São 9 janelas com tábuas: 2 no Posto e 1 em cada uma destas áreas: Estação, Casamata, Oficina, Quartel, Vala, Igreja e Posto Oeste. Use `zombieEntry` com a normal do JSON, que aponta para dentro. Do lado de fora de cada janela precisa haver 3 m livres e um ponto de nascimento para os zumbis subirem até ela. Como no original, **a maior parte dos zumbis sai da terra** (pontos de nascimento), não das janelas.

### 4.4 Pontos de nascimento dos zumbis

Gere por código, não à mão:

- **em cada área:** de 3 a 6 pontos dentro do polígono, a pelo menos 6 m de portões, máquinas, geradores e pegadas;
- **na lama:** um ponto a cada 18–22 m ao longo das faixas, alternando o lado (a 2 m da borda);
- **na Câmara:** 2 pontos por alcova e 4 no salão.

Confira se todos ficam dentro da área andável da grade de navegação.

### 4.5 Bordas e paredes

Cada tipo de lugar tem uma borda, que é o que dá a cara do mapa:

| Onde | Borda visual | Colisão |
| --- | --- | --- |
| Trincheiras (Posto, Estação, Trincheira Leste, Casamata, corredores) | parede de tábuas verticais (`boards`/`woodDark`) com sacos de areia (`sandbag`) no topo, 2,4 m, degrau de tiro de 0,4 m em alguns trechos, escoras de madeira | sólida |
| Prédios (Oficina, Quartel Norte, Igreja, Posto Oeste, Cripta) | alvenaria (`brick`, `stone`, `plaster`), telhado meio desabado, vigas à mostra, janelas quebradas. A Igreja tem nave alta (8 m), bancos tombados e vitrais quebrados com luz colorida fraca | sólida |
| Lama e Escavação (abertas) | sacos de areia baixos (1,1 m), cercas quebradas e **arame farpado** com estacas em X | **sólida mas atravessável por tiro** (`bulletThrough: true`) até 3 m, para que se veja e se atire no campo lá fora |
| Fora do mapa (preto) | campo de crateras (`dirt` escuro), árvores secas, estacas, carroças, canhões quebrados, poças, fumaça. Ao longe, clarões de artilharia e os colossos | não se entra |

**Como montar a colisão de qualquer formato:**

1. **Rasterize** a área andável numa grade de 1 m. A área andável é a união dos polígonos de `areas`, das faixas de `mud` (polilinha com largura) e do círculo `ring`. Um quadrado de 1 m conta como andável se o centro estiver dentro.
2. Todo quadrado **não andável** a até 2 quadrados de um andável vira bloco sólido escondido. Junte os quadrados de cada linha em retângulos para gerar poucos blocos.
3. O desenho das paredes é feito à parte, com blocos decorativos **girados** ao longo das arestas dos polígonos, no tipo de borda da tabela acima.

Assim a colisão e a navegação ficam fiéis ao formato e o visual fica bonito.

**Como ficou implementado (Fase 1, `src/shared/map/trincheira.ts`):**

- Entre duas áreas que só se ligam por portão, a parede tem 1 célula de espessura, do lado da área mais cara: a lama vem antes do Posto, que vem antes das outras.
- **Cada portão recorta essa parede.** As células de parede da área fechada que encostam no lado de quem compra, dentro da largura do vão, voltam a ser chão. O bloco da porta cobre exatamente esse recorte.
- Não use uma "zona livre" em volta do portão, porque ela deixa passar pelos lados quando a borda é diagonal. Isso já aconteceu na Vala Sul.
- A Casamata e a Estação ficam ligadas à lama de graça, então abrir qualquer uma das duas portas do Posto libera as duas áreas e a lama, como no original. Os pontos de nascimento delas usam `['casamata', 'estacao']`.
- As plataformas do tanque não têm nascimento de zumbi. A da Igreja fica isolada até a Fase 3.
- Para ver a grade dos zumbis numa imagem: `npx tsx tools/trincheira-navpng.ts <saida.png> [portas|all] [x0 z0 x1 z1]`.

### 4.6 Lama (Terra de Ninguém)

- São as faixas de `layout.json → mud` (largura de 6,9 m e 10,8 m no trecho largo do sul).
- **O jogador anda 30% mais devagar na lama** (multiplicador 0,7 em andar e correr, pulo 0,85). Os zumbis não perdem velocidade.
- Passo com som de lama (a fazer: gravação CC0 ou som sintetizado por ruído filtrado).
- Precalcule uma máscara de 1 m (`mudMask`) para a simulação consultar em O(1).
- Visual: material novo `mud`, marrom bem escuro, molhado e brilhante, com poças que refletem o céu, marcas de pneu e de botas, e algumas tábuas jogadas por cima (decoração, mas as tábuas não tiram a lentidão).

### 4.7 Escavação (centro)

- **Anel de pedra:** centro (-15, -7), raio externo de 10,5 m. O piso é de pedra antiga com runas gravadas em círculos.
- **Poço central:** raio de 2 m, sólido, com borda de pedra de 0,5 m. De dentro sai a **Forja** (seção 6.4).
- A ambientação do resto do anel:
  - andaimes de madeira;
  - baldes e cordas;
  - lonas;
  - mesas de arqueólogo com lampiões;
  - um guindaste de madeira apontando para o poço.
- **Mesa dos Cajados:** 4 pedestais de pedra dentro do anel, a 6 m do centro, nas direções N, L, S e O. Cada um tem a cor do seu elemento: Raio ao norte (roxo), Fogo a leste (laranja), Vento ao sul (amarelo) e Gelo a oeste (azul).
- O gramofone fica numa mesa do anel, em (-20, -5.5).
- **Plataforma norte do tanque:** é a faixa curva roxa dentro da `cunha`.

### 4.8 Pegadas dos colossos (`layout.json → feet`)

São retângulos de piso firme de cerca de 9 × 20 m, de terra batida afundada, com marcas de rebite. Quando um pé desce, **tudo o que estiver dentro morre** (seção 6.8). Elas pertencem à área em que estão.

| Colosso | Pegadas, na ordem em que pisa |
| --- | --- |
| Atlas (norte ↔ sul, x ≈ -22) | K (-27.5..-19, -77..-57.5), A (-27.5..-18.5, -39..-19.5), F (-26.5..-16, 14.5..34.5), H (-26.5..-16.5, 56..77) |
| Golias (norte ↔ sul, x ≈ 4) | B (-3..7, -55.5..-34.5), E (-0.5..10, -3.5..17.5), G (-0.5..10.5, 36..58) |
| Titã (oeste ↔ leste) | D (-99.5..-89, 7..27), C (-69..-59, -9..12), I (56..65.5, -2.5..17.5), J (79.5..89, -21.5..-0.5) |

### 4.9 Tabela de pontos (resumo)

Fonte completa: `layout.json → points`. "1 de 3" quer dizer que, **a cada partida**, a simulação sorteia um dos locais com o rng da partida e o item só aparece ali.

| O quê | Onde (x, z) |
| --- | --- |
| Geradores | G1 (103, 46) · G2 (68, -14) · G3 (42, 6.5) · G4 (-11, 54) · G5 (-11, -70.5) · G6 (-113, 18.5) |
| Caixa Misteriosa (o 1º é o inicial) | Posto (118, 57) · Casamata (77.5, -17) · Oficina (46.5, 1) · Vala (-4.5, 44.5) · Quartel (-11, -75.5) · Igreja (-87, 18.5) |
| Fonte da Sorte | G1 (118, 63.5) · G2 (73, -16) · G3 (47, 11.5) · G4 (-14, 61) · G5 (-5.5, -67.5) · G6 (-107, 13) |
| Bebidas fixas | Segundo Fôlego (107.5, 53) · Reflexo (62.5, 14.5) · Couraça (-20.5, 52) · Gatilho (-16, -66.5) |
| Forja | (-15, -7), sobe do poço |
| Gramofone | (-20, -5.5) |
| Disco Negro (1 de 3) | (-36.5, -14.5) · (-7.5, -6) · (7, -7) |
| Peças de Fogo | (-79, 3.5) · (-74.5, 13.5) · (-107, 23.5) |
| Peças de Gelo | (80, -16.5) · (79, -4) · (92, -3) |
| Peças de Raio | (-9, 32.5) · (8, 52) · (-15.5, 57.5) |
| Peças de Vento | (4, -72) · (-19.5, -66.5) · (-12.5, -57) |
| Túneis dos portais | Fogo (86.5, 55.5) · Vento (5.5, 48) · Raio (-1.5, -60.5) · Gelo (-86, 26.5) |
| Baús de Almas (melhoria do Fogo) | (-22.5, -62) · (-64, 7) · (5, 13) · (-21.5, 60.5) |
| Lápides (melhoria do Gelo) | (89.5, -42.5) · (-24.5, 9.5) · (-32, 68) |
| Domos de fumaça (melhoria do Vento) | (-46, -24) · (-16.5, -49.5) · (-2, 54) |
| Carroças em chamas (decoração com fogo e luz) | (-8, -45.5) · (15.5, -14) · (-31, 32.5) |
| Tábua de Pedra / altar | Cripta (92, -6.5) / Igreja (-81.5, 13.5) |
| Baús de Desafios | Posto (103.5, 61) · Posto Oeste (-112.5, 27.5) |
| Peças do Escudo | rodas (1 de 3): (78.5, -45.5) · (84, -19.5) · (86.5, 19.5); trava (1 de 3): (51, 4.5) · (79, 39) · (85, 61); armação (1 de 3): (-21.5, -36) · (-18.5, 22) · (-22, 74.5) |
| Peças do Drone | cérebro (112, 62) · hélice (-11, -1.5) · corpo (1 de 3): (-55, -31.5) · (-46.5, 41) · (-84, 29.5) |
| Pás | (90, 55) · (113.5, 53) · (-10.5, -57) · (5, 54) · (-91.5, -4.5) |
| Montes de terra (18) | ver `points.monte` |
| Bancadas | Posto (99, 42) · Oficina (49.5, -25) · Igreja (-84, 0) |
| Jogadores começam | (99, 43.5) · (107, 43.5) · (99, 57) · (107, 57) |

Alguns pontos ficam **fora do piso**, no campo de crateras ao lado: lápides, domos e carroças. É de propósito, porque são alvos para **atirar** de onde se vê, não para tocar. Garanta que haja linha de visão a partir do piso mais próximo, já que a borda ali é baixa (4.5).

### 4.10 Armas de parede (desenho a giz em tábuas)

| Onde | Arma (id existente) | Preço |
| --- | --- | --- |
| Posto | `ferrolho` (era `carbine`), `doublebarrel`, `grenade` | 500, 500, 250 |
| Casamata | `trincheira-smg` (era `smg`) | 1000 |
| Estação | `revolver` | 1100 |
| Oficina | `assalto-antigo` (era `rifle`) | 1400 |
| Escavação (parede da cunha) | `burstrifle` | 1200 |
| Vala Sul | `pump` | 1500 |
| Quartel Norte | `lmg` | 2500 |
| Igreja | `sniper` e `knife` (faca pesada) | 2400 e o preço atual |

Cada caixa de munição (`ammoCrate`) segue o padrão atual.

**Armas de 1918 (feitas no polimento C2).** Nomes e modelos próprios, nunca de fabricante. Só existem na Trincheira (`MapDef.startWeapon` e `MapDef.boxExtra`); a Cidade e a Rota seguem como eram.

| id | Nome | Papel | Onde |
| --- | --- | --- | --- |
| `cano-longo` | Pistola de Cano Longo | inicial, 10 tiros, semiautomática. Na Forja vira a **Velha Senhora** (automática, coronha, pente de 40) | mão inicial |
| `ferrolho` | Fuzil de Ferrolho | um tiro forte (260), atravessa 2 zumbis, 5 tiros | parede do Posto, 500 |
| `trincheira-smg` | Submetralhadora de Trincheira | automática, 32 tiros | parede da Casamata, 1000 |
| `assalto-antigo` | Fuzil de Assalto Antigo | automático, 30 tiros, médio alcance | parede da Oficina, 1400 |
| `tripe` | Metralhadora de Tripé | 100 tiros; mira lenta e anda −10% (`moveMult` 0,9) | Caixa Misteriosa |

O som é o gravado de sempre, tocado mais devagar (`WeaponDef.pitch`).

---

## 5. Ambiente, luz e som

- **Céu e névoa:**
  - céu de fim de tarde encoberto, marrom-acinzentado;
  - névoa cor `0x6b6458`, densidade de 0,014;
  - na lama, use uma névoa um pouco mais densa (0,02) pelo mesmo esquema de "zona" da Rota.
  - **Os colossos ignoram a névoa** (material com `fog: false` ou névoa reduzida), para serem vistos de longe.
- **Clima por rodada** (simulação, seção 6.5): limpo, chuva ou neve. No cliente:
  - **chuva:** partículas em lote em volta da câmera, chão mais brilhante, som de chuva sintetizado;
  - **neve:** flocos lentos, névoa mais clara (`0x9a9a9e`), chão com camada branca leve (mistura de cor no shader do chão).
- **Luz:**
  - Cada gerador desligado tem uma luz fraca e alaranjada. Quando liga, a área ganha lâmpadas penduradas quentes e um **feixe de luz ciano** que sobe do gerador até o céu, como no original, visível de longe.
  - As carroças em chamas iluminam em laranja (use `fires` e `lights`).
  - As runas da Escavação pulsam em azul-claro.
  - As luzes das bebidas apagam quando o gerador da área está desligado, igual ao `perk: true` da Rota.
- **Zumbis:** soldados de 1918 genéricos, sem bandeira nem insígnia:
  - capote marrom ou cinza;
  - capacete redondo ou boné;
  - alguns com máscara de gás;
  - bandoleiras;
  - lama na roupa.
  
  São variações da roupa em `src/client/humanoid.ts`/`zombies.ts`, escolhidas pelo `look`.
- **Música e sons:** tudo próprio, nada do original.
  - Rodadas com tambor de guerra e coral grave sintetizados.
  - Som de gerador ligando: motor a diesel subindo e um "zumbido" elétrico.
  - **Buzina grave** antes de cada colosso entrar.
  - Pisada do colosso: um estrondo grave que treme a câmera conforme a distância.
  - Artilharia distante de tempos em tempos.

---

## 6. Sistemas

Para cada sistema: regras, números, o que vai no snapshot e nos eventos, e o que o cliente desenha. Os valores ficam numa constante `TRINCHEIRA` em `src/shared/constants.ts`. A seção 10 tem a tabela completa.

### 6.1 Geradores

- São 6, todos **desligados no início** (inclusive o G1, como no original).
- Cada gerador é um motor grande com uma plataforma redonda de 3,5 m de raio no chão, com aro de metal e luzes ao redor.
- **Para ligar:** um jogador vivo para dentro do círculo e aperta F.
  - Paga **200 × número de jogadores dentro do círculo** naquele momento. Se faltar pontos para alguém, nega com a mensagem "pontos insuficientes".
  - A captura começa. O tempo base é de 20 s, dividido por `1 + 0,5 × (jogadores dentro - 1)`.
  - Se ninguém estiver dentro, o progresso **volta** à mesma velocidade. Se zerar, a captura cancela **sem devolver os pontos**.
  - Durante a captura nascem zumbis extras perto do gerador: 1 a cada 4 s, além do ritmo normal da rodada, sem contar para o total da rodada.
  - No fim: evento `gen` com `on: true`, som de motor, a luz da área acende e o feixe ciano sobe.
- **Efeitos de cada gerador ligado:** liga a bebida fixa e a Fonte da Sorte daquela área e acende as luzes.
- **Os 6 ligados** fazem a **Forja subir** (6.4).
- **Quem capturou** ganha +1 no desafio "capturar geradores" (6.15).
- **Recaptura pelos Cruzados** (6.9.2): um gerador pode desligar. A bebida dele para de vender, mas **quem já comprou não perde a bebida**. Para religar, captura de novo, **de graça**.
- **Snapshot:**

  ```
  gens: { on: boolean; progress: number; capturing: boolean; attacked: boolean }[6]
  ```

- **HUD:** uma fileira de 6 ícones de engrenagem numerados no canto. Cinza = desligado, ciano = ligado, vermelho piscando = sendo atacado.

### 6.2 Bebidas e Fonte da Sorte

- **Bebidas fixas** (máquinas normais via `machine`), cada uma ligada ao seu gerador:

  | Gerador | Bebida |
  | --- | --- |
  | G1 | Segundo Fôlego |
  | G3 | Reflexo |
  | G4 | Couraça |
  | G5 | Gatilho |

  Troque `perksNeedPower` por uma regra por máquina: `MapDef.perkGen?: Partial<Record<PerkId, number>>` (índice do gerador). A simulação nega com "desligada" se o gerador estiver desligado.
- **Fonte da Sorte** (`kind: 'fizz'`): uma máquina de bebidas giratória.
  - Fica em **um** dos 6 locais por vez (começa no G1). Só funciona se o gerador daquele local estiver ligado.
  - Custa **1500**. Gira por 4 s e entrega uma bebida aleatória que o jogador **não tem**, entre as 6 existentes (inclusive Passo Firme e Mula, que **só saem aqui**). Se ele já estiver no limite de bebidas, nega antes de cobrar.
  - Depois de 4 a 6 usos, ela "foge": cai um raio de luz e ela vai para outro local cujo gerador esteja ligado. Funciona como a Caixa Misteriosa, inclusive o valor de 950 na Liquidação. Use a lógica de mudança da Caixa como modelo.
  - Os locais inativos mostram só um pedestal apagado, e o local ativo tem um feixe de luz branca.
  - **Bebidas exclusivas da Fonte (C3).** Além das 6, ela entrega 3 que não existem em máquina fixa nem na Bebida Grátis (`MapDef.fizzExtra`; a Cidade e a Rota não as têm):

    | id | Nome | Efeito |
    | --- | --- | --- |
    | `faisca` | Faísca | ao recarregar, choque de 3 m; dano de 200 (pente cheio) a 1200 (vazio); espera de 3 s entre choques. O navegador manda `{t:'reload', weapon, ammo}` |
    | `olho-frio` | Olho Frio | +25% de dano na cabeça, dispersão −30%, e o tiro no peito alto (acima de 1,15 m dos pés) vale cabeça |
    | `casca-grossa` | Casca Grossa | imune às **próprias** explosões; cair de mais de 1,5 m solta uma onda de 4 m (400 de dano por metro de queda). O navegador manda `{t:'land', h}` |

    **Decisão:** antes, a explosão do próprio jogador nunca o feria. Na Trincheira ela agora fere (60 no centro a 12 na borda; `selfBlastMax` e `selfBlastMin`), como em Origins, e a Casca Grossa anula. O prêmio da missão dá as 9 bebidas.
- O limite de bebidas continua sendo `MAX_PERKS` (4). O 4º desafio dá **+1 vaga** só para aquele jogador (6.15).

### 6.3 Caixa Misteriosa

- São 6 locais (`boxSpots`, na ordem da tabela 4.9) e ela começa no Posto. A regra é a atual.
- **Novo em `MapDef`:** `boxExclude?: string[]`. Na Trincheira, exclua `wind`, `arc` e `vortex`, porque os cajados ocupam esse papel. O `raygun` (Desintegrador) continua.
- Inclua a **Granada de Artilharia** como resultado raro da Caixa: 3% de chance, entrega 3 cargas e ocupa a vaga de granada especial.

### 6.4 Forja na Escavação

- É a Forja atual, com a bigorna e a boca da fornalha numa coluna de pedra com runas que fica **escondida dentro do poço** (y = -3, invisível).
- Quando o 6º gerador liga:
  - evento `forjaSobe`;
  - a coluna sobe em 6 s com tremor, poeira e coral;
  - a Forja fica liberada.
- **Depois de subir, a Forja fica para sempre**, mesmo que um gerador seja recapturado depois. Assim a partida não trava.
- Em `MapDef`: `forgeNeedsGenerators: true`. As velas do ritual não existem neste mapa (`candles: []`).

### 6.5 Clima

- A simulação sorteia o clima **no início de cada rodada**:

  | Clima | Chance |
  | --- | --- |
  | limpo | 50% |
  | chuva | 30% |
  | neve | 20% |

- As rodadas 1 e 2 são sempre limpas.
- **Garantia:** se até o fim da rodada 6 ainda não tiver nevado, a rodada 7 neva. Depois disso, se passar 8 rodadas sem neve, a próxima neva.
- **Snapshot:** `weather: 'limpo' | 'chuva' | 'neve'`. **Evento:** `clima` ao mudar.
- Efeito no jogo:
  - **Neve:** libera as peças de Gelo (6.13) e o enigma das lápides.
  - **Chuva:** só visual e som.

### 6.6 Pá e montes de terra

- **Pá:**
  - Nas posições de `points.pa`, cada jogador pega **uma** pá com F. A pá não ocupa vaga de arma; é um item de inventário pessoal.
  - O ponto fica sempre lá, com uma pá espetada na terra.
  - Quem morre e sangra até o fim perde a pá e precisa pegar de novo.
- **Montes:**
  - Há 18 locais (`points.monte`). No início de cada rodada, cada local vazio tem 45% de chance de ganhar um monte, um amontoado de terra com uma luz fraca.
  - **Cavar:** segure F por 1,2 s com a pá (0,6 s com a Pá Dourada). O monte some.
  - **Resultado** (sorteado na simulação):

    | Chance | Resultado |
    | --- | --- |
    | 25% | um powerup aleatório no chão, entre os normais e o Sangue Morto. Não conta no limite por rodada |
    | 20% | +2 granadas, até o máximo |
    | 18% | pontos: 50 × rodada, até 500 |
    | 15% | **um zumbi sobe dali na hora** (não conta para o total da rodada) |
    | 12% | só terra |
    | 7% | arma de parede aleatória entregue na mão |
    | 3% | **Bebida Grátis** (`freeperk`) |

- **Pá Dourada:** aparece na mão de quem cavar 30 montes. Com ela os montes saem mais rápido e o "só terra" vira pontos. A primeira vez que alguém com a Pá Dourada cava, sai o **Capacete Dourado**: metade do dano do fogo do Blindado, para esse jogador, até sangrar.
- **Montes de Gelo:** os 3 locais das peças de Gelo só têm monte **durante a neve** e brilham azul. Cavar dá a peça (6.13).
- **Snapshot:** `mounds: number[]` (índices ativos), mais `shovel`, `goldShovel` e `helmet` por jogador. **Evento:** `dig` (com o resultado, para som e texto).

### 6.7 Tanque

Reaproveite o ônibus. Generalize `MapDef.bus` para `vehicle`:

```
{ kind: 'bus' | 'tank'; path; stops; callCost?; home?; lapOnly? }
```

- **Caminho:** `layout.json → tankPath`. É um laço fechado que passa pela Estação (casa), pela parada `igreja` e pela parada `norte` (plataforma da Escavação).
- **Funcionamento:**
  - O tanque fica parado na Estação. Uma alavanca na traseira custa **500** (`callCost`).
  - Pago, ele faz **uma volta**: sai, para 10 s na Igreja, para 10 s na plataforma norte e volta à Estação. Depois espera 30 s antes de poder ser chamado de novo.
  - Velocidade: 5 m/s. É mais lento que correr; o tanque é um transporte, não uma fuga.
- **Em cima do tanque:**
  - Os jogadores ficam numa plataforma a 1,7 m de altura. Use `busGround` e `busCollide`, de `busBody.ts`, com as medidas do tanque: 7 × 4 m e 2,4 m de altura.
- **Quem está em volta:**
  - O tanque **esmaga** zumbis na frente: eles morrem sem dar pontos.
  - Jogadores na frente são empurrados, sem dano.
  - Um **lança-chamas na traseira** queima zumbis até 4 m atrás: 300 de dano por segundo mais 10% do dano normal da rodada.
- **Igreja:** descer na parada `igreja` deixa o jogador dentro da área da Igreja **sem pagar o portão** (por isso existe a regra "área ocupada vale como aberta", 4.1).
- **Visual:**
  - tanque losango de 1917, genérico, cor de lama, sem insígnia;
  - esteiras que andam (textura rolando) e fumaça do escape;
  - o canhão gira devagar como enfeite.
- **Snapshot:** igual ao do ônibus, mais `state: 'parado' | 'volta' | 'espera'` e `cooldown`.

### 6.8 Colossos

São três robôs de cerca de 30 m de altura que atravessam o mapa pisando nas pegadas (4.8).

- **Visual:**
  - corpo blocado de aço rebitado, enferrujado, chaminés soltando fumaça;
  - olho com cor própria: Atlas amarelo, Golias azul, Titã vermelho;
  - sem cruzes nem insígnias;
  - modelo procedural de blocos, à mão, com pernas, tronco, braços e cabeça.
  - **Quando estão longe**, aparecem como silhuetas na névoa.
- **Ciclo:**
  - Começa na rodada 2.
  - **Um colosso por vez**, em ordem: Atlas, Golias, Titã, Atlas...
  - Antes de cada passagem toca a **buzina** e há um aviso de 8 s.
  - A passagem leva cerca de 6 s por passo.
  - Entre uma passagem e outra há 20 s de pausa.
  - A direção alterna a cada vez que o mesmo colosso passa: norte → sul, depois sul → norte; oeste → leste, depois leste → oeste.
- **Passo:** cada passo põe um pé numa pegada, na ordem. Entre pegadas, o pé "pisa fora", no campo de crateras.
  1. **Levantar:** 1,5 s.
  2. **Mover:** 2 s. Uma sombra escura cresce no chão da próxima pegada e o chão vibra.
  3. **Descer:** 1,5 s, com estrondo.
  4. **Ficar:** 1 s. O pé vira um obstáculo sólido temporário; os zumbis e a grade de navegação desviam por 1 s.
- **Esmagar:** quando o pé toca o chão, tudo dentro do retângulo da pegada morre:
  - jogador cai na hora;
  - zumbi e Cruzado morrem sem dar pontos;
  - o Blindado recebe 50% da vida máxima de dano.
  
  Mensagem: "Esmagado por Atlas".
- **Cabeça do colosso** (extra, Fase 9):
  - Quando o pé está **levantado** sobre uma pegada, a sola tem uma luz. Acertar 3 tiros nela abre a escotilha.
  - Quem estiver na pegada quando esse pé descer **não morre**: é levado para a **cabine**, uma sala de 6 × 6 m fora do mapa (x de 209 a 221; os limites do mapa foram para x = 240). Uma sala por colosso (`TrincheiraData.cabins`), de aço rebitado, com janela do "olho", painel de luzes e o pedestal do prêmio no meio. Dois jogadores na mesma pegada vão juntos; sem escotilha aberta, a pegada esmaga como sempre.
  - Na cabine há 1 prêmio por colosso por partida:

    | Colosso | Prêmio |
    | --- | --- |
    | Atlas | Bebida Grátis |
    | Golias | 2000 pontos |
    | Titã | 3 Granadas de Artilharia |

  - O prêmio se pega com F no pedestal (`cabine-atlas`, `cabine-golias`, `cabine-tita`), uma vez por colosso por partida.
  - Ao fim da passagem, ou depois de 15 s (`TRINCHEIRA.cabinMax`), o que vier primeiro, o jogador volta à pegada de onde saiu, com 3 s de invulnerabilidade. Nesse tempo ele não toma dano de ninguém (a cabine não tem zumbis, porque nenhum ponto de surgir cai lá).
  - Snapshot: `NetPlayer.cabine` e `TrincheiraSnap.cabinTaken`. O evento `cabine` ganhou `phase` (`entra`, `premio`, `volta`) e `x`, `z` (para onde o navegador leva o jogador).
- **Snapshot:**

  ```
  robot: { id; phase; foot: 'L' | 'R'; step; t; dir } | null
  ```

  O cliente anima o corpo a partir disso. A animação é só visual; o que vale é o momento em que o pé toca, decidido pela simulação.
- **Eventos:** `buzina`, `pisada` (com a pegada e quem morreu) e `cabine`.

### 6.9 Inimigos

#### 6.9.1 Zumbis comuns

Seguem as regras atuais (`ZOMBIE`, `zombiesForRound`), mudando só a aparência (5).

#### 6.9.2 Cruzados (`kind 8`) e recaptura de gerador

Os Cruzados são zumbis de armadura medieval enferrujada, olhos vermelhos e capa rasgada.

- **Quando aparecem:** a partir da rodada seguinte à captura do **3º** gerador, no início de cada rodada há 30% de chance de começar uma **recaptura**. Se passar 4 rodadas sem recaptura, a seguinte tem recaptura garantida. Não há recaptura em rodada de Blindado.
- **Recaptura:**
  1. Toca um alarme.
  2. Escolhe um gerador ligado que não esteja sendo capturado.
  3. Nascem **4 + 2 × jogadores** Cruzados a 25–40 m dele.
  4. Eles **andam até o gerador e ignoram os jogadores**: só atacam quem estiver a menos de 1,5 m bloqueando o caminho.
- **Vida e velocidade:** vida = 2 × zumbi da rodada; velocidade = 1,6 m/s.
- **Perda do gerador:** se um Cruzado ficar **8 s** dentro do círculo do gerador, ele desliga (evento `gen` `on: false`). Os que sobrarem vão para o próximo gerador ligado mais perto.
- **Vitória dos jogadores:** se matarem todos, o último deixa cair um powerup aleatório e todos ganham 500 pontos.
- Durante a recaptura, os zumbis comuns nascem na metade do ritmo.
- **HUD:** o gerador atacado pisca em vermelho e aparece uma seta na direção dele.

#### 6.9.3 Blindado (`kind 7`), substitui o Carrasco neste mapa

O Blindado é um soldado dentro de uma armadura mecânica a vapor (sem insígnias), com lança-chamas no braço esquerdo, garra com corrente no direito e uma mochila-foguete.

- **Quando aparece:**
  - a primeira vez na rodada 8;
  - depois, a cada 3 a 5 rodadas;
  - na rodada 16 e depois, podem vir 2 juntos se houver 3 ou mais jogadores.
  
  Use o esquema de `nextBossRound` do Carrasco. Ele chega descendo do céu com a mochila-foguete, perto do jogador com mais pontos.
- **Vida:** `bossHealth(round, players)`, a mesma fórmula do Carrasco.
- **Ataques:**
  - **Lança-chamas:** cone de 6 m e 40°, 30 de dano por segundo, deixa o jogador pegando fogo por 2 s.
  - **Garra:** puxa um jogador a até 15 m. Reaproveite o evento `bosspull` do Carrasco. Recarrega em 12 s.
  - **Salto com a mochila:** se nenhum jogador estiver a menos de 25 m dele por 6 s, ele salta para perto de alguém.
- **Ponto fraco:** o visor. Depois de levar 20% da vida em tiros na cabeça, o visor quebra (visual) e a cabeça passa a levar ×2 de dano.
- **Ao morrer:** deixa **Munição Cheia** e dá 500 pontos a quem matou.
- **Em `MapDef`:**
  - `boss: 'blindado'`;
  - `hellRounds: false`: **não há rodada infernal de cães neste mapa**, como no original.

### 6.10 Sangue Morto (powerup novo `sangue`)

- Entra no sorteio normal de itens que caem **só neste mapa**. Use `MapDef.powerupPool?: PowerupKind[]`.
- Também sai dos montes de terra (6.6).
- **Efeito:** só para **quem pegou**, por 20 s, os zumbis comuns, os Cruzados e o Blindado **ignoram** o jogador:
  - ele sai dos alvos da grade de navegação;
  - não é atacado;
  - os zumbis que já estavam atrás dele escolhem outro alvo.
  
  Ele continua podendo atirar.
- **Visual:** tela com borda vermelha e um tom avermelhado. O personagem fica translúcido para os outros. Cor do item: `#9b1b1b`, símbolo de uma gota.
- Usado também na missão final (6.16).

### 6.11 Inventário da equipe e construíveis

- **Inventário da equipe:** as peças, o gramofone, o disco, os cristais e a tábua são **da equipe**. Quem pega, pega para todos, e qualquer jogador pode usá-los.
  - Mensagem: "Fulano pegou a Hélice do Drone".
  - **Snapshot:** `team: { items: string[] }`.
  - **HUD:** painel no canto superior direito com os ícones das peças por objeto, em cinza o que falta e colorido o que já tem, como no original.
- **Peças:**
  - Ficam flutuando devagar, girando, com uma luz fraca. F pega.
  - As de local sorteado (1 de 3) **só aparecem** no local sorteado da partida.
- **Bancadas:** são 3 (`points.bancada`). Qualquer bancada monta qualquer coisa. Com as 3 peças na equipe, segurar F por 2 s monta; o item passa a existir **naquela** bancada.
- **Escudo de Trincheira** (rodas + trava + armação):
  - Depois de montado, cada jogador pode pegar um na bancada onde foi montado.
  - Fica **nas costas**, sem ocupar vaga de arma.
  - Bloqueia **100% do dano de zumbi vindo de trás** (ângulo de 120° às costas).
  - Aguenta 1500 de dano e então quebra. Quem teve o escudo quebrado pode pegar outro na rodada seguinte.
  - **Na mão (C5):** a tecla `Escudo na mão (alternar)` (padrão X) tira o escudo das costas. Na mão ele bloqueia 100% do dano que vem da frente (arco de 120°), mas **não** o das costas; não se atira, e o botão de atirar dá a **pancada** (zumbi a até 2 m, à frente: dano de faca, empurrão de 2,2 m, espera de 0,8 s; chefões levam o dano e não saem do lugar). Anda 10% mais devagar. Mensagens `shield` e `bash`; o snapshot leva `shieldHand`. Quebrando, o escudo sai da mão.
  - Visual: placa de aço rebitada com visor estreito, nas costas do personagem.
- **Drone de Campo** (cérebro + hélice + corpo):
  - Existe **um só** para a equipe.
  - Quem pega na bancada o solta. Ele voa a 2,5 m de altura, seguindo o dono a 2 m, por **60 s**.
  - Atira nos zumbis a até 18 m: 150 de dano a cada 0,5 s, com tiro direto e mira na cabeça.
  - **Se o dono cair**, o drone o reanima em 3 s (uma vez por voo).
  - Depois volta para a bancada e espera 90 s.
  - Visual: corpo de latão com hélice e um olho verde.
- **Snapshot:** `buildables: { escudo: { built; bench }, drone: { built; bench; owner; t; x; y; z } }` e `shield: number` (vida do escudo) por jogador.

### 6.12 Gramofone, Disco Negro, portais e Câmara Antiga

- **Gramofone:** na Escavação. F pega para a equipe.
- **Disco Negro:** num dos 3 locais sorteados. F pega para a equipe.
- **Túneis:**
  - São 4, cada um uma boca de túnel de pedra com moldura de vigas e a **runa do elemento** brilhando numa laje que fecha a entrada:

    | Túnel | Fica em | Laje |
    | --- | --- | --- |
    | Fogo | Estação | laranja |
    | Vento | pegada G, Vala Sul | amarela |
    | Raio | Quartel Norte | roxa |
    | Gelo | sul da Igreja | azul |

  - Com gramofone e disco na equipe, F na laje toca a música do disco por 6 s (sintetizada) e **a laje afunda para sempre**.
  - O túnel aberto mostra uma luz da cor do elemento dentro. Ficar 1 s dentro da boca do túnel **teletransporta** o jogador para a alcova daquele elemento na Câmara, com clarão branco e som grave.
- **Câmara Antiga** (área separada, fora do mapa principal, no mesmo plano y = 0):
  - **Salão circular:** centro (165, 0), raio de 10 m.
  - **4 alcovas** de 9 × 9 m ligadas ao salão por corredores de 3 m: norte = Raio, leste = Fogo, sul = Vento, oeste = Gelo.
  - **Visual:**
    - pedra escura (`stone`) com runas da cor de cada alcova;
    - pedras flutuando;
    - névoa roxa mais densa (0,03);
    - luz baixa;
    - pilares quebrados;
    - um "céu" preto com pontos de luz.
  - **Cada alcova tem:**
    - o **portal de volta**: entrar nele leva de volta à boca do túnel daquele elemento, 2 m para fora;
    - o **pedestal do cristal**: F pega o Cristal do elemento para a equipe;
    - o **altar do elemento**, usado na melhoria (6.13).
  - O salão e as alcovas são uma única área conectada; **qualquer portal leva a todas as alcovas**. Abrir os outros portais só cria atalhos.
  - **Zumbis nascem na Câmara enquanto houver jogador lá** (regra "área ocupada", 4.1). Os zumbis do mapa principal não seguem o jogador pelo portal; ele escapa, como no original.
- **Snapshot:**

  ```
  portals: boolean[4]
  disco: number          // local sorteado; -1 depois de pego
  ```

- **Eventos:** `portal` (abriu) e `teleporte`.

### 6.13 Cajados elementais

#### Peças, montagem e posse

- **Peças:** são 3 por cajado. Cada elemento tem um jeito de conseguir as peças:

  | Elemento | Onde ficam as peças | Como se consegue |
  | --- | --- | --- |
  | **Fogo** (Igreja e Posto Oeste) | 2 nos pontos | 2 soltas nos pontos. A 3ª **só aparece depois que o primeiro Blindado morre**, no lugar onde ele caiu (o local do ponto vira lugar de reserva) |
  | **Gelo** (Casamata) | montes que só existem **na neve** | cavar (6.6) |
  | **Raio** (Vala Sul e lama ao sul) | 3 soltas | uma delas fica **sobre a rota do tanque**, no ponto da rota mais perto de (-9, 32.5): só se pega **de cima do tanque**, a peça flutua a 2,5 m |
  | **Vento** (Quartel Norte) | dentro de caixotes trancados | **um colosso precisa pisar perto**: quando o pé desce na pegada K ou B, todos os caixotes do Quartel abrem. Antes disso, F mostra a mensagem "trancado" |

- **Montagem:**
  - Na **Mesa dos Cajados** (4 pedestais na Escavação), com 3 peças + o Cristal do elemento, F no pedestal daquele elemento monta o cajado.
  - O cajado fica em pé no pedestal, brilhando.
- **Posse:**
  - Cada cajado é **único na partida**. F no pedestal pega: o cajado ocupa uma vaga de arma, como uma compra de parede.
  - Cada jogador pode carregar **no máximo um cajado**.
  - F de novo no pedestal, com o cajado na mão, **devolve** o cajado e libera a vaga.
  - Se o dono sangrar até o fim ou sair, o cajado volta sozinho ao pedestal.
  - Munição Cheia recarrega os cajados.

#### 2ª etapa da melhoria: os anéis da Escavação (C6)

Depois do enigma do elemento (e antes do altar da Câmara), cada cajado precisa passar pelos **4 anéis de pedra** em volta da Forja:

- Cada anel tem os 4 símbolos de elemento a 90° um do outro. Os anéis começam embaralhados (`[1, 2, 3, 0]`, nenhum alinhado).
- 4 alavancas (`anel-0` a `anel-3`, uma por diagonal, logo depois do último anel): F gira o anel em 90°, sempre para o mesmo lado.
- Com os **4 anéis no símbolo de um elemento cujo enigma já está resolvido** (e a etapa ainda não feita), acende uma **esfera** acima da Forja (`orb` no snapshot). Acertá-la com um cajado **daquele elemento** (comum ou desperto) conclui a etapa (`ringsDone`; `TrStaff.rings` no snapshot). O altar da Câmara recusa o cajado enquanto a etapa não está feita (`deny` com `aneis`).
- A ordem dos elementos é livre. `TRINCHEIRA.ringsStep = false` volta ao comportamento antigo.
- Os atalhos de teste `debug('cajados')` e `debug('missao')` já marcam a etapa como feita.

#### Armas

São armas maravilha (`source: 'wonder'`, `unique: true`). Use `wonderDamage` para escalar com a rodada.

| Cajado | Disparo | Pente / reserva | Desperto |
| --- | --- | --- | --- |
| **Fogo** | 3 bolas de fogo em leque, 600 de dano de impacto mais queimadura de 150/s por 3 s | 8 / 48 | 1500 de impacto, queimadura de 400/s. **Segurar o disparo por 1,5 s:** pilar de fogo de 4 m de raio por 5 s, com 2000/s |
| **Gelo** | raio contínuo, 10 acertos/s. Cada acerto acumula frio: o zumbi fica lento e **congela e estilhaça** ao chegar no limite (cerca de 1,5 s numa rodada 10) | 30 s de raio / 180 s | congela 2× mais rápido. **Carregado:** nevasca de 6 m de raio por 6 s, congelando tudo |
| **Vento** | rajada em cone, reaproveitando o `wind` (empurra e mata perto) | 6 / 36 | **Carregado:** redemoinho que anda devagar por 5 s e suga zumbis, reaproveitando o `vortex` |
| **Raio** | arco que salta entre zumbis, reaproveitando o `arc` (até 6 saltos) | 10 / 60 | até 10 saltos. **Carregado:** bola elétrica lenta que dá choque em tudo a até 4 m, a cada 0,3 s, por 4 s |

- Modelos (em `gunModels.ts`): cajado de madeira escura com cabeça de metal antigo e cristal da cor do elemento, com partículas da cor. A versão desperta tem anéis de pedra girando em volta do cristal.
- O "segurar para carregar" usa o botão de atirar segurado. Mostre um anel de carga na mira.

#### Melhoria (despertar)

Um enigma por cajado e, depois, o altar na Câmara:

- **Fogo, Baús de Almas:**
  - Os 4 baús (`points.bau`) são caixões de pedra com tampa aberta e chama fraca dentro.
  - Cada baú precisa de **6 abates com o Cajado de Fogo a até 8 m dele**. A alma do zumbi voa para dentro, a chama cresce e a tampa fecha.
  - Os 4 fechados completam o enigma.
- **Gelo, Lápides:**
  - **Só durante a neve.** Acerte cada uma das 3 lápides (`points.lapide`) com o Cajado de Gelo: ela congela e racha, mostrando uma runa azul.
  - Se a neve acabar antes das 3, as rachadas continuam valendo.
- **Vento, Domos de fumaça:**
  - Os 3 domos (`points.domo`) são cúpulas de metal soltando anéis de fumaça.
  - Acerte cada um com a rajada do Cajado do Vento, de qualquer distância. A fumaça para.
- **Raio, Teclado:**
  - Na alcova do Raio na Câmara há **6 placas de metal numeradas** na parede e **3 lâmpadas** sobre o altar.
  - As lâmpadas mostram em laço uma sequência sorteada de 3 placas (por exemplo, 2-5-3).
  - Acerte as placas com o Cajado do Raio **nessa ordem**. Se errar, a sequência recomeça.
- **Depois do enigma:**
  1. Leve o cajado ao **altar do seu elemento na Câmara** e aperte F. O cajado fica no altar.
  2. Ele **enche com 20 abates** feitos por qualquer jogador, em qualquer lugar. Mostre a contagem no altar e no HUD.
  3. Cheio, vira **Cajado Desperto** no próprio altar. F pega.
  4. A partir daí, o pedestal dele na Escavação passa a guardar a versão desperta.
- **Alvos de tiro:** os enigmas usam um sistema genérico na simulação:

  ```
  targets: { id; x; y; z; r; weapon?; weather?; active }
  ```

  Um projétil ou tiro direto que passe a menos de `r` de um alvo ativo, feito com a arma exigida, gera o evento `alvo`. Lápides, domos, placas e a sola dos colossos usam esse mesmo sistema.
- **Snapshot:**

  ```
  staffs: { el; state: 'faltando' | 'pedestal' | 'mao' | 'altar' | 'desperto'; owner?; puzzle: number[]; charge }[4]
  ```

### 6.14 Punho de Ferro

1. **Tábua de Pedra:** fica na Cripta, apoiada nas lajes, e F a pega para a equipe.
2. **Altar da Igreja:** F coloca a tábua no altar, que acende fraco.
3. **Carga:** **20 abates com faca** (qualquer faca), feitos por qualquer jogador **dentro da Igreja** enquanto a tábua está no altar. As almas voam para a tábua.
4. **Prêmio:** cheia, a tábua brilha. Cada jogador aperta F uma vez e ganha o **Punho de Ferro**, que **substitui a faca**:
   - golpe de 2 m;
   - dano = 3 × faca pesada, com escala por rodada igual à faca;
   - **arremessa** o zumbi (reaproveite o `fling` do `killFx`).
   
   Dura até o jogador sangrar até o fim.
- **Snapshot:** `tabua: 'cripta' | 'equipe' | 'altar' | 'cheia'`, `tabuaCharge` e `punho` por jogador.

### 6.15 Baús de Desafios

Há 2 baús (Posto e Posto Oeste), com a mesma lista. Cada jogador tem **4 desafios pessoais**, mostrados num painel ao apertar F no baú. O prêmio é retirado em **qualquer** dos dois baús.

| # | Desafio | Prêmio |
| --- | --- | --- |
| 1 | Matar 115 zumbis | um powerup aleatório sai do baú |
| 2 | Estar dentro do círculo quando 3 geradores terminarem de ligar | 3 Granadas de Artilharia |
| 3 | 50 abates com tiro na cabeça | Desintegrador (`raygun`) na mão |
| 4 | Chegar viva(o) ao fim da rodada 15 | **+1 vaga de bebida** (5 no total) |

- **Granada de Artilharia** (granada especial, tecla própria configurável, padrão `4`):
  - Arremessada, solta fumaça vermelha.
  - 2 s depois caem 6 bombas de artilharia num raio de 6 m, ao longo de 2 s.
  - Cada bomba causa dano de explosão alto, mata até a rodada 25 e não fere jogadores.
- **Snapshot:** `challenges: number[4]` (progresso), `claimed: boolean[4]` e `artilharia: number` por jogador.

### 6.16 Missão principal: "Canção da Escavação"

É opcional, para equipe dedicada. Passos:

1. **Os 4 cajados despertos.**
2. **Os 4 cajados despertos nos 4 pedestais da Mesa dos Cajados**, com a Forja já erguida.
   - O anel de pedra gira, e 4 feixes coloridos sobem.
   - Durante este passo e o 3, os cajados ficam presos nos pedestais.
3. **Colheita:** 100 abates dentro do anel da Escavação (16 m do centro), no prazo de até 3 rodadas.
   - As almas voam para o poço.
   - Se o prazo acabar, o contador zera e se tenta de novo.
4. **Os olhos dos colossos:** a cada passagem, o olho do colosso fica vulnerável. É preciso acertar o olho de **cada um** dos 3, com qualquer arma, **enquanto o atirador estiver com Sangue Morto**. Nessa etapa, o Sangue Morto passa a cair 3× mais.
5. **Defesa final:** F no poço começa uma defesa de 90 s com zumbis sem parar e 2 Blindados.
6. **Fim:**
   - uma luz sobe do poço;
   - todos os zumbis vivos morrem;
   - tela branca por 2 s e um texto final curto, nosso, escrito no tom do jogo;
   - a partida continua.
   
   Prêmio para todos:
   - todas as 6 bebidas, sem limite;
   - os cajados voltam para a mão de quem estava com eles;
   - a partida fica marcada como `missao: true` no placar (campo novo no registro de partida).
- **Snapshot:** `missao: { step; count; t }`.

---

## 7. Mudanças em tipos e protocolo (resumo)

### `MapDef` (`src/shared/map/types.ts`)

Campos opcionais novos (os mapas antigos não mudam):

```ts
mud?: { width: number; path: [number, number][] }[];
generators?: { x: number; z: number; r: number; area: string }[];
perkGen?: Partial<Record<PerkId, number>>;
fizzSpots?: BoxSpot[];
forgeNeedsGenerators?: boolean;
boxExclude?: string[];
powerupPool?: PowerupKind[];
boss?: 'carrasco' | 'blindado';
hellRounds?: boolean;
weather?: boolean;
vehicle?: { kind: 'bus' | 'tank'; path: [number, number][]; stops: { at: number; zone: string }[]; callCost?: number };
robots?: { id: 'atlas' | 'golias' | 'tita'; feet: Rect[] }[];
areas?: { id: string; poly: [number, number][] }[]; // para "área ocupada" e onde está o jogador
trincheira?: TrincheiraData; // todo o resto (pontos de peças, alvos, portais, câmara...)
```

- `bus` vira `vehicle`: ajuste a Rota (`kind: 'bus'`) e todos os lugares que leem `map.bus`.
- `SpawnPoint.area` aceita `string | string[] | null`.

### `Interactable.kind`

Novos tipos:

```
'generator' | 'fizz' | 'tank' | 'shovel' | 'mound' | 'part' | 'bench' | 'gramofone' | 'disco'
| 'portal' | 'crystal' | 'staffPedestal' | 'altar' | 'tabua' | 'tabuaAltar' | 'challenge'
| 'robotCab' | 'missao'
```

Mais o campo `ref?: string` para identificar qual peça, gerador, etc.

### Protocolo (`src/shared/protocol.ts`)

- `ZombieKind` ganha `7` (Blindado) e `8` (Cruzado).
- `PowerupKind` ganha `'sangue'`.
- `ProjectileKind` ganha `'fogo' | 'gelo' | 'artilharia' | 'orbRaio'`.
- `Snapshot` ganha `tr?: TrincheiraSnap`, com tudo das seções 6.x num objeto só (`gens`, `weather`, `fizz`, `mounds`, `vehicle`, `robot`, `team`, `buildables`, `portals`, `staffs`, `tabua`, `missao`, `forjaUp`).
- `NetPlayer` ganha `shovel`, `goldShovel`, `helmet`, `shield`, `punho`, `artilharia`, `zblood`, `challenges` e `claimed`.
- Mantenha o snapshot pequeno:
  - mande listas de booleanos e números, não objetos repetidos;
  - mande o que nunca muda (posições) uma vez, a partir do `MapDef`, que os dois lados já têm.
- **Eventos novos:** `gen`, `forjaSobe`, `clima`, `dig`, `buzina`, `pisada`, `cabine`, `recaptura`, `portal`, `teleporte`, `craft`, `peca`, `alvo`, `cajado`, `desperto`, `tabua`, `desafio`, `artilharia`, `missao`.
- O servidor valida tudo como hoje (`src/server/guard.ts`). Revise se as mensagens novas do jogador cabem nas regras de tamanho e frequência.

---

## 8. Arquitetura no código

### Arquivos novos

| Arquivo | Conteúdo |
| --- | --- |
| `src/shared/map/trincheira.ts` | `buildTrincheira()`: lê `layout.json`, monta pisos, paredes (`rasterWalls`), lama, Escavação, prédios, decoração, máquinas, portões, barricadas, pontos de nascimento e a Câmara, e preenche `MapDef` |
| `src/shared/trincheira.ts` | `TrincheiraSystems`: geradores, Fonte, clima, montes, tanque (estende a lógica do ônibus), colossos, Cruzados, Blindado, inventário da equipe, construíveis, portais, cajados, enigmas, Punho, desafios e missão. Recebe o `GameSim` e expõe `tick(dt)`, `interact(p, it)`, `onKill(z, p, how)`, `onPlayerDamage(p, dmg, from)`, `moveMult(p)`, `navTargets()` (para o Sangue Morto) e `snap()` |
| `src/client/trincheira/` | views: `generatorView`, `fizzView`, `tankView` (a partir do `busView`), `colossusView`, `weatherFx`, `moundView`, `partsView`, `staffView`, `camaraFx`, `droneView`, `shieldView` |
| `src/client/hud.ts` (aumentar) | geradores, inventário da equipe, carga de cajado, contadores dos altares e da tábua, painel de desafios, aviso de colosso, borda do Sangue Morto |
| `tools/test-trincheira.mjs` | testes no navegador headless (seção 9) |
| `tools/trincheira-tour.mjs` | volta com câmera para capturas (modelo: `tools/rota-tour.mjs`) |

### Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| `src/shared/map/index.ts` | `{ id: 'trincheira', name: 'Trincheira', desc: 'Lama, seis geradores, colossos e uma escavação antiga.' }` e `buildTrincheira` |
| `src/shared/sim.ts` | chamadas a `TrincheiraSystems`, `vehicle` no lugar de `bus`, regras de `boss`/`hellRounds`/`boxExclude`/`powerupPool`/`perkGen`, multiplicador de lama no movimento |
| `src/shared/weapons.ts` | 4 cajados mais 4 despertos, Punho de Ferro e Granada de Artilharia |
| `src/shared/powerups.ts` | `sangue` |
| `src/client/menuScene.ts` | fundo do menu com a Trincheira (tanque e colosso ao longe) |
| `src/client/textures.ts` | `mud`, `rune`, `snow` (mistura) e `rivet` (aço rebitado) |

Siga o jeito do código existente: comentários curtos em português, nomes em português para coisas do jogo, constantes em `constants.ts`, sem bibliotecas novas sem necessidade.

---

## 9. Fases de implementação

Cada fase termina **jogável**, testada e com commit. Não comece a próxima com a anterior quebrada. Ao fim de cada fase, rode **todos** os testes (0.2), confira desempenho e tire capturas com `tools/trincheira-tour.mjs`. Explique ao usuário o que mudou, em português simples.

| Fase | Conteúdo | Pronto quando |
| --- | --- | --- |
| **1. Mapa jogável** | `buildTrincheira` com todas as áreas, bordas (`rasterWalls`), lama (só visual), Escavação, prédios, decoração, portões, barricadas, nascimentos, armas de parede, Caixa nos 6 locais, máquinas de bebida (ainda sem gerador: funcionam), Forja no centro (sempre acesa por enquanto), névoa e luz. Entrada no menu | Dá para andar por todo o mapa da planta; todo portão abre; zumbis acham caminho até qualquer área aberta; 60 FPS no Chrome headless em qualidade média; capturas de cada área parecidas com a planta |
| **2. Geradores e energia** | 6 geradores (6.1), `perkGen`, Fonte da Sorte (6.2), Forja que sobe (6.4), lentidão da lama (4.6), clima (6.5), feixes de luz e HUD de geradores | Capturar um gerador acende a bebida da área; com 6, a Forja sobe; a lama deixa mais lento; a neve aparece garantida até a rodada 7 |
| **3. Tanque, pá e Sangue Morto** | `vehicle` tanque (6.7), pás e montes (6.6), Pá e Capacete Dourados, Sangue Morto (6.10), `area` em lista e "área ocupada" (4.1) | Pagar 500 leva o tanque à Igreja e de volta; quem desce na Igreja tem zumbis por perto; cavar dá os resultados da tabela; com Sangue Morto, zumbis passam reto |
| **4. Colossos** | 3 colossos, ciclo, pisadas que matam, sombra, buzina, tremor (6.8, sem a cabine) | Ficar numa pegada na descida derruba; zumbis morrem esmagados; silhuetas visíveis de longe sem perder FPS |
| **5. Blindado e Cruzados** | `kind 7` e `kind 8`, recaptura de gerador (6.9), sem cães neste mapa | Blindado na rodada 8 com fogo, garra e salto; recaptura desliga gerador se não houver defesa e dá prêmio se houver |
| **6. Construíveis, desafios e Punho** | inventário da equipe e HUD, peças sorteadas, bancadas, Escudo, Drone (6.11), Baús de Desafios e Granada de Artilharia (6.15), Punho de Ferro (6.14) | Cada objeto montável completo de ponta a ponta no solo e no co-op (`node tools/coop.mjs <pasta> trincheira`) |
| **7. Portais, Câmara e cajados** | gramofone, disco, portais, Câmara (6.12), peças por elemento, cristais, Mesa dos Cajados e as 4 armas (6.13) | Os 4 cajados montáveis e usáveis; teletransporte de ida e volta; zumbis nascem na Câmara |
| **8. Despertar os cajados** | alvos de tiro genéricos e os 4 enigmas, altares e as versões despertas com ataque carregado | Os 4 despertos, cada um com o seu enigma |
| **9. Missão e extras** | missão principal (6.16), cabine dos colossos, polimento de som, música e menu, registro de `missao` no placar | Missão completa de ponta a ponta em solo com atalhos de teste |

Para testar fases longas, crie em dev (só com `?autoplay`, igual a `window.__game`) atalhos de depuração em `window.__trincheira`: ligar todos os geradores, dar todas as peças, forçar o clima, chamar um colosso agora, ir para uma rodada, dar Sangue Morto. **Nada disso pode existir na versão de produção nem no servidor.**

O que testar em `tools/test-trincheira.mjs` (vá aumentando):

- abrir cada portão;
- capturar um gerador e comprar a bebida;
- Forja sobe com 6 geradores;
- lentidão na lama (medir velocidade);
- volta do tanque;
- cavar com pá;
- morte por pisada;
- Blindado aparece;
- recaptura;
- montar Escudo e Drone;
- abrir um portal e ir e voltar da Câmara;
- montar e usar cada cajado;
- cada enigma;
- Punho;
- desafios;
- missão.

Regras puras (contas, sorteios, ciclos) vão em `tools/test-sim.ts`.

---

## 10. Valores de ajuste (`TRINCHEIRA` em `constants.ts`)

| Nome | Valor |
| --- | --- |
| `mudMult` / `mudJump` | 0.7 / 0.85 |
| `genRadius` / `genCostPerPlayer` / `genTime` / `genExtraPlayer` / `genSpawnEvery` | 3.5 / 200 / 20 / 0.5 / 4 |
| `fizzCost` / `fizzSpin` / `fizzUsesMin` / `fizzUsesMax` | 1500 / 4 / 4 / 6 |
| `weatherChances` (limpo, chuva, neve) / `snowBy` / `snowGap` | 0.5, 0.3, 0.2 / 7 / 8 |
| `moundChance` / `digTime` / `digTimeGold` / `goldAfter` | 0.45 / 1.2 / 0.6 / 45 |
| `tankCost` / `tankSpeed` / `tankStopWait` / `tankCooldown` / `tankFlameDps` / `tankFlameRange` | 500 / 5 / 10 / 30 / 300 / 4 |
| `robotFirstRound` / `robotWarn` / `robotPause` / `stepLift` / `stepMove` / `stepDown` / `stepHold` | 2 / 8 / 45 / 1.5 / 2 / 1.5 / 1 |
| `templarAfterGens` / `templarChance` / `templarForceAfter` / `templarBase` / `templarPerPlayer` / `templarHpMult` / `templarSpeed` / `templarTakeTime` / `templarReward` | 3 / 0.25 / 5 / 4 / 2 / 2 / 1.6 / 8 / 500 |
| `panzerFirst` / `panzerGapMin` / `panzerGapMax` / `panzerFlameDps` / `panzerFlameRange` / `panzerClawRange` / `panzerClawCd` / `panzerVisorBreak` / `panzerReward` | 8 / 3 / 5 / 30 / 6 / 15 / 12 / 0.2 / 500 |
| `zbloodTime` | 20 |
| `shieldHp` / `shieldArc` | 1500 / 120° |
| `droneTime` / `droneCd` / `droneRange` / `droneDmg` / `droneRate` | 60 / 90 / 18 / 150 / 0.5 |
| `portalTime` (ficar no túnel) / `portalMusic` | 1 / 6 |
| `staffChargeKills` / `fireChestKills` / `fireChestRange` | 20 / 6 / 8 |
| `punhoKills` / `punhoMult` | 20 / 3 |
| `challenge` (abates, geradores, cabeça, rodada) | 115 / 3 / 50 / 15 |
| `artilleryShells` / `artilleryRadius` / `artilleryDelay` | 6 / 6 / 2 |
| `missaoKills` / `missaoRounds` / `missaoDefense` | 100 / 3 / 90 |
| `staffReviveRange` / `staffReviveRadius` (cajado desperto reanima) | 25 / 0,7 |
| `selfBlastMax` / `selfBlastMin` (explosão própria) | 60 / 12 |
| `PERK_FX` novos: `faiscaRadius` / `faiscaCooldown` / `faiscaMinDamage` / `faiscaMaxDamage` | 3 / 3 / 200 / 1200 |
| `PERK_FX` novos: `olhoHeadMult` / `olhoSpreadMult` / `olhoNeckY` | 1,25 / 0,7 / 1,15 |
| `PERK_FX` novos: `cascaFall` / `cascaRadius` / `cascaDamage` | 1,5 / 4 / 400 por metro |
| `tankClimb` / `tankClimbMaxV` (zumbi sobe no tanque parado) | 1 / 1,5 |
| `cabinMax` (tempo máximo na cabine do colosso, s) | 15 |
| `ringsStep` (anéis da Escavação antes do altar) | ligado |
| `shieldHandMove` / `shieldBashRange` (escudo na mão: velocidade, alcance da pancada) | 0,9 / 2 |

**Mudanças da rodada de ajuste (F2, 2026-10-21)** — medidas em 3 partidas de robôs até a rodada 22 (`tools/tr-ajuste.ts`); a dificuldade de verdade precisa ser conferida jogando, com o registro de `?autoplay`:

| Número | Antes → depois | Motivo |
| --- | --- | --- |
| `robotPause` | 20 → 45 | Com 20 s o colosso ficava em cena 59% do tempo; com 45 s fica 40% |
| `templarChance` / `templarForceAfter` | 0,3 / 4 → 0,25 / 5 | Recaptura em 35% das rodadas cansa; passou a ficar entre 25% e 30% |
| `goldAfter` | 30 → 45 | Quem só cavava recebia a Pá Dourada na rodada 4; agora na 5 ou 6 (e mais tarde para quem cava de passagem) |
| Blindado, geradores | sem mudança | Intervalo médio entre Blindados de 3,7 rodadas; os geradores dependem de jogar de verdade |

Esses números são o ponto de partida. Ajuste jogando, mas registre a mudança aqui.

---

## 10.1 Andamento

### Fase 1 (pronta em 2026-10-20)

**O que está pronto:**

- O mapa inteiro da planta: áreas, lama, Escavação, pegadas, prédios com telhado meio caído e bordas por tipo.
- Os 6 portões (10 vãos), as 9 barricadas e os pontos de nascimento gerados por código.
- As armas de parede em tábuas com desenho a giz, os caixotes de munição e a Caixa nos 6 locais (começa no Posto).
- A Forja na Escavação, sempre acesa nesta fase.
- O ambiente:
  - campo de crateras com árvores secas, estacas e arame;
  - carroças em chamas, lápides, domos e Baús de Almas como enfeite;
  - lampiões.
- Céu cinzento e o subtítulo "Norte da França, 1918".
- As tomadas do fundo do menu.
- O som dos passos pelo tipo de chão (`MapDef.surface`).

**Provisório até a Fase 2:**

- As bebidas funcionam sem gerador.
- O Passo Firme e a Mula ficam em máquinas comuns nos locais G2 e G6 da Fonte da Sorte.
- A lama ainda não deixa o jogador mais lento.

**Mudanças no motor:**

- `SpawnPoint.area` aceita uma lista de portas.
- Material `mud`.
- Textura própria de pedra em blocos.
- `MapDef.place`, `MapDef.sky` e `MapDef.surface`.
- A Forja começa acesa em mapa sem velas e sem energia.

**Testes:**

- `tools/test-sim.ts`, seção Trincheira: o que cada portão libera, alcance de tudo e montagem determinística.
- `tools/test-trincheira.mjs`.
- `tools/trincheira-tour.mjs <pasta> [aberto]`.

### Fases 2 a 9 (prontas em 2026-10-21)

Tudo da seção 6 está implementado: `src/shared/trincheira.ts` (regras, classe `TrincheiraSystems`), `src/shared/colossus.ts` (geometria dos colossos, igual no cliente), o mapa em `src/shared/map/trincheira.ts` e a camada visual em `src/client/trincheira/`. O contrato entre as partes está em `CONTRATO.md`.

**Decisões e diferenças em relação ao texto acima:**

- Cada jogador dentro do círculo do gerador paga 200 (e a captura anda mais rápido com mais gente).
- O tanque, ao parar na Igreja com alguém em cima, **abre o portão da Igreja** (de graça). A plataforma da Igreja não tem passagem própria: o portão aberto é a passagem.
- O tanque é um veículo à parte do ônibus; `busBody.ts` aceita as medidas de cada veículo (`BodyDims`). Convés a 1,15 m, sobe-se pulando.
- A cabine dos colossos agora é uma sala de verdade (C4, 6.8); a versão simplificada saiu.
- A 3ª peça do Cajado de Fogo cai do primeiro Blindado morto (peça solta, `tr.drops`).
- Cruzados nascem a 25–40 m do gerador atacado (ou mais perto se a área for pequena) onde há caminho até ele.
- A missão trava os cajados nos pedestais da colheita até o fim; ao terminar, voltam para quem os tinha (um cajado por jogador).
- Granada de Artilharia: também sai da Caixa Misteriosa (3%, entrega 3 cargas).
- Partida com a missão concluída é registrada no placar (`missao: true`, uma estrela na lista online).
- Atalhos de teste: `debugTr` (gens, itens, clima, colosso, rodada... ver `trincheira.ts → debug`), só com `?autoplay` em desenvolvimento.

## 11. Decisões já tomadas (não reabra sem motivo)

- **A planta segue a de referência** (proporções, posições e ligações). As simplificações foram feitas para caber no motor: um andar só, blocos sólidos alinhados aos eixos e a Câmara por teletransporte.
- **Regras próprias onde o original é confuso ou longo demais.**
  - O jeito de pegar cada peça foi resumido (6.13).
  - Os enigmas dos cajados têm um passo cada.
  - A missão final tem 6 passos.
  - A Forja não desce depois de subir.
  - O tanque faz uma volta por pagamento.
  - Os geradores são religados de graça.
- **Peças e itens de missão são da equipe**, não de um jogador. É mais simples no co-op e evita perder item quando alguém cai.
- **Sem cães** neste mapa; o chefão é o **Blindado**.
- Elementos do traçado que vêm da planta de referência e foram reinterpretados:
  - os "soul chests" viraram os Baús de Almas da melhoria do Fogo;
  - as "ice carts" viraram carroças em chamas decorativas;
  - os montes vermelhos ("perk slot dig") viraram os montes de terra comuns.

### Polimento S1: correções (2026-10-21)

Veja `POLIMENTO.md`, seção 11, para o estado de cada ticket.

- **Missão:** os cajados voltam a quem os pôs na Mesa (`prevOwner` anotado em `returnStaff`); sem dono válido vão para o primeiro vivo sem cajado, senão ficam no pedestal. A regra é igual no teste por atalho e na missão de verdade.
- **Constante nova:** `panzerReward` (500) na tabela da seção 10.
- **Feixe do gerador:** vapor claro aditivo em vez de fumaça escura; o feixe desbota de perto.
- **Avisos do topo:** `TrHud.setAlerts` (no máximo 2).
- **Desempenho:** `game.perf` (chamadas e triângulos por quadro), tecla F3 mostra, `docs/trincheira/orcamento.json` guarda a linha de base.
- **Testes:** `tools/test-trincheira-visual.mjs` (novo).

### Polimento S2: primeira impressão (2026-10-21)

- **Escavação:** `src/client/trincheira/escavacaoView.ts` (tudo só desenho). O vão do poço ficou aberto no construtor (a colisão vem dos blocos escondidos de sempre).
- **Céu e clima:** `src/client/trincheira/skyFx.ts`. Relâmpago, artilharia ao longe e trovão agora nascem aqui (o `trSound` só toca). `MapDef.sky.warm` pinta a faixa quente do horizonte. `mapView.setSnow(k, ground)` separa névoa (rápida) de neve no chão (lenta).
- **Geradores:** anel de progresso e cordões de lâmpadas.

### Polimento S3: o que falta de Origins (2026-10-21)

- **C1:** o disparo normal de cajado desperto levanta o aliado caído (`TrincheiraSystems.staffRevive`; evento `previve` com `by: 'cajado'` e `from`, o id de quem atirou). Ataque carregado não reanima.
- **C2:** 5 armas de 1918 (tabela em 4.10), `MapDef.startWeapon`, `MapDef.boxExtra`, `WeaponDef.pitch` e `moveMult`.
- **C3:** 3 bebidas exclusivas da Fonte (6.2), `BASE_PERKS` e `FIZZ_PERKS`, mensagens `reload` e `land`.

### Polimento S4: visual restante (2026-10-21)

- **Novos arquivos do cliente:** `igrejaView.ts`, `lamaView.ts`; `skyFx.ts` e `escavacaoView.ts` já vinham do S2. `common.ts` ganhou `Merger`, `runeTexture` e `mergeBuffers`.
- **Mapa:** `MaterialId` ganhou `rotWood`, `crackConcrete` e `brickDirty`; `Block.shade`; `TrincheiraData.wallMix`.
- **Blindado:** peças nomeadas `blindado-*`; as placas caem com a vida do chefão.
- **Colossos:** `ColossusView.farInfo()` e `fullVisible()` ajudam os testes.

### Polimento S5: som e conforto (2026-10-21)

- **Som:** `vinheta-*`, `passo-distante`, `rangido-colosso` em `trSound.ts`; motor do gerador (`genLoop`).
- **Telas:** planta na pausa (`pauseMap.ts`), dicas (`tips.ts`), pilha de avisos (S1).

### Polimento S6: Origins (médio) (2026-10-21)

- **C4:** 3 cabines de colosso (`TrincheiraData.cabins`, salas de 6 × 6 m em x 209 a 221, `LIMITS.maxX` 240), `toCabin`/`tickCabins`/`interactCabine`; `NetPlayer.cabine`, `TrincheiraSnap.cabinTaken`, evento `cabine`. Constantes `cabinMax`.
- **C5:** escudo na mão (tecla X, mensagens `shield` e `bash`, `TrPlayer.shieldHand`); `shieldHandMove`, `shieldBashRange` e outros na seção 10.
- **C6:** anéis da Escavação (`kind: 'ring'`, `ringsStep`), alvo `esfera`, `TrStaff.rings`.

### Polimento S7: extras e ajuste (2026-10-21)

- **A7:** `GameSim({ seed })` e `TrHost.rand()`; `trincheira.ts` não usa mais `Math.random`.
- **C7:** zumbis sobem no tanque parado (`tankClimb`, `tankClimbMaxV`).
- **C8, C9:** 3 cantis e 6 rádios (`kind: 'cantil'` e `'radio'`), eventos `segredo` e `radio`; textos em `RADIO_TEXT`.
- **C10:** punhos elementais (`NetPlayer.punhoEl`, evento `punho`).
- **F1:** registro de ajuste só em desenvolvimento (`GameSim({ log: true })`, `devLog()`, `src/client/devlog.ts`); `tools/test-trincheira-prod.mjs` garante que não vai para a produção.
- **F2:** `tools/tr-ajuste.ts` (partida automática de robôs) e a tabela de mudanças na seção 10.
