# Trincheira: contrato entre simulação, mapa e cliente (fases 2 a 9)

Complementa o `README.md` desta pasta. Aqui está **o que a simulação manda e o que o navegador deve desenhar/tocar**. Se algo daqui conflitar com o código de `src/shared`, o código manda. Quem escreveu a simulação (`src/shared/trincheira.ts`) e o mapa (`src/shared/map/trincheira.ts`) não deve ser editado pelo cliente: se faltar um dado, peça.

Tipos prontos: `src/shared/protocol.ts` (`TrincheiraSnap`, eventos novos, `NetPlayer` com campos opcionais), `src/shared/map/types.ts` (`TrincheiraData`, `Interactable.ref/reach/minY`, `MapDef.*`), `src/shared/constants.ts` (`TRINCHEIRA`), `src/shared/weapons.ts` (cajados), `src/shared/trincheira-info.ts` (nomes, cores, ids de interações).

## 1. Quem mexe em quê

| Dono | Arquivos |
| --- | --- |
| Simulação/mapa (principal) | `src/shared/**`, `src/server/**`, `src/client/game.ts`, `controller.ts`, `net.ts`, `keys.ts`, `tools/test-*` |
| **Cliente: mundo** | `src/client/trincheira/**` (pasta nova), `hud.ts`, `styles.css`, `textures.ts` (só materiais novos), `mapView.ts` (só neve/materiais), `players.ts` (escudo nas costas), `powerupView.ts` (item Sangue Morto) |
| **Cliente: armas, inimigos e som** | `gunModels.ts`, `weapon.ts`, `zombies.ts`, `humanoid.ts`, `audio.ts`, `fx.ts`, `boss.ts` e novos arquivos de modelos (`src/client/blindado.ts`, `src/client/cruzado.ts`) |

Ninguém além do dono mexe em `game.ts`. Cada lado entrega **uma API** (abaixo) e eu ligo no `game.ts`. Se precisar de algo de `game.ts`, descreva em `docs/trincheira/INTEGRACAO.md` (um arquivo por lado: `INTEGRACAO-mundo.md`, `INTEGRACAO-armas.md`) o que precisa ser chamado, quando e com quais argumentos.

Regras do projeto valem (README seção 0.2): nada da Activision, assets gerados por código, comentários curtos em português, 60 FPS (instancing para o que se repete), Firefox, nada de regra no cliente.

## 2. Ids de interações (`map.interactables`)

O construtor do mapa cria **todas** as interações possíveis; a simulação diz o que está ativo agora. O cliente decide o texto do aviso na tela (F) e só manda `{t:'interact', id, weapon}`. Ids (função `ids` em `trincheira-info.ts`):

| id | kind | `ref` | Ativo quando |
| --- | --- | --- | --- |
| `gen-0..5` | `generator` | índice | sempre (gerador desligado e ninguém capturando); `use` = centro do círculo, `reach` = 3,5 |
| `fizz-0..5` | `fizz` | índice | `tr.fizz.loc === i` e gerador daquele local ligado |
| `tank-lever` | `tank` | | tanque `parado` |
| `pa-0..4` | `shovel` | | jogador sem pá |
| `monte-0..20` | `mound` | índice (18..20 = gelo) | índice em `tr.mounds`; **segurar** F (manda `{t:'hold', id}` enquanto segura e `{t:'hold', id:null}` ao soltar), exige pá |
| `part:<chave>:<local>` | `part` | chave do item | id em `tr.pick` (peça, gramofone, disco, tábua, cristal). Ver `TEAM_ITEMS` |
| `bench-0..2` | `bench` | | segurar F (`hold`) 2 s monta, se a equipe tiver as 3 peças; se já montado, F pega |
| `portal-<el>` | `portal` | elemento | laje do túnel; equipe tem `gramofone` e `disco` e `tr.portals[i]` falso |
| `staff-<el>` | `staffPedestal` | elemento | pedestal da Mesa dos Cajados |
| `altar-<el>` | `altar` | elemento | altar da Câmara |
| `tabua-altar` | `tabuaAltar` | | altar da Igreja |
| `desafio-0..1` | `challenge` | | baús de desafios |
| `poco` | `missao` | | poço da Escavação (defesa final) |

Peças soltas no chão por zumbis (3ª peça de Fogo) vêm em `tr.drops` com id `drop-N`; o cliente trata como `part` (manda `{t:'interact', id:'drop-N'}`).

Chaves das peças/itens da equipe (`tr.team`): `escudo-rodas|trava|armacao`, `drone-cerebro|helice|corpo`, `gramofone`, `disco`, `tabua`, `fogo-1..3`, `gelo-1..3`, `raio-1..3`, `vento-1..3`, `cristal-<el>`.

## 3. Snapshot (`Snapshot.tr`)

Só existe na Trincheira. O navegador já interpola `Snapshot` pelo `SnapBuffer`; para o que se mexe (`tank`, `robot`, `drone`) interpole entre `sample.a.s.tr` e `sample.b.s.tr` com `sample.k` como o `BusView` faz.

- `gens[6]`: `on`, `progress` (0..1), `capturing`, `attacked`. Bebidas fixas só vendem com o gerador ligado (`map.perkGen`).
- `weather`: `limpo|chuva|neve`. Chuva e neve só visual/som (neve também libera os montes de gelo).
- `forjaUp`: a Forja já subiu. Enquanto falso, a coluna da Forja está escondida no poço (o cliente desenha a coluna: **o construtor do mapa não a cria**). O evento `forjaSobe` dispara a animação de 6 s (a coluna sobe de y=-4,4 a 0). Se o cliente entra com `forjaUp` já verdadeiro, mostra a coluna pronta.
- `fizz`: local atual, `state`, `t` (segundos restantes do giro), `uses`.
- `mounds`: índices de `map.trincheira.mounds` com monte agora.
- `tank`: pose (x,z,yaw), `state`, `stop` (`estacao|igreja|norte|null`), `wait`, `cooldown`.
- `robot`: colosso em cena (ver 5.6) ou null.
- `team`: chaves dos itens da equipe.
- `pick`: ids de `part:*` ativos. `drops`: peças soltas.
- `windOpen`: caixotes das peças do Vento abertos (antes disso as peças do Vento aparecem em caixotes trancados).
- `build.escudo/drone`: montado, em qual bancada (`bench`, índice), `drone.state` (`banco|voo|espera`), dono, tempo restante, pose.
- `portals[4]` na ordem `fogo, gelo, vento, raio`. `disco`: local sorteado ou -1.
- `staffs[4]` na ordem `fogo, gelo, vento, raio` (ver `TrStaff`).
- `tabua`, `tabuaCharge`, `missao`, `recapture`.

`NetPlayer` (opcionais): `shovel, goldShovel, helmet, shield, punho, artilharia, zblood, challenges[4], claimed[4], extraPerk`.

Ordem dos elementos em todo array de 4: `fogo, gelo, vento, raio` (`ELEMENT_LIST`).

## 4. Dados fixos (`map.trincheira`)

`gens, fizzGen, groups (grade 1 m com a letra da área), feet, mounds, shovels, benches, tank, ring, portals, chamber, staffTable, chests, tombstones, domes, tabuaAltar, challengeChests, pickups, tankPart, windCrates, chamberRect`. `map.fizzSpots` são os 6 locais da Fonte (`BoxSpot`). A Câmara Antiga fica em x 140..190 (`chamberRect`), longe do mapa principal.

O mapa **já desenha** (blocos): geradores (motor e base), bancadas, pedestais, altares, baús de almas, lápides, domos, lajes dos túneis (blocos com `door: 'portal-<el>'`, somem quando o portal abre), as paredes e o piso da Câmara, placas numeradas do Raio, carroças. O cliente **soma** a camada dinâmica (brilho, feixes, peças flutuando, estados).

## 5. O que o navegador desenha

### 5.1 Pasta `src/client/trincheira/` (dono: mundo)

Entregar a classe:

```ts
export class TrincheiraClient {
  constructor(scene: THREE.Scene, map: MapDef, tex: TexSet, opts: { quality: QualityConfig; audio: AudioEngine });
  // todo quadro: amostra interpolada, o último snapshot cru, jogador local, câmera
  update(sample: Sample | null, snap: Snapshot, dt: number, t: number, me: NetPlayer | null, cam: THREE.PerspectiveCamera): void;
  // cada evento de jogo (só os da Trincheira interessam)
  onEvent(e: GameEvent, ctx: { local: string; me: NetPlayer | null; playerPos: (pid: string) => THREE.Vector3 | null }): void;
  // aviso de F: devolve null se a interação não está ativa agora (para ser ignorada)
  promptFor(it: Interactable, snap: Snapshot, me: NetPlayer, ctx: { useKey: string; solo: boolean; weaponName: string }): { text: string; can: boolean; price: number } | null;
  // interações extras a considerar (ex.: peças soltas em tr.drops viram interações virtuais)
  extraInteractables(snap: Snapshot): Interactable[];
  // estado para o HUD (tela cheia: neve na câmera, borda de sangue, etc.) é aplicado pelo próprio objeto via o Hud passado em attachHud
  attachHud(hud: Hud): void;
  // tanque/vagão: pose desenhada agora (o controlador leva quem está em cima)
  tankPose(): { x: number; z: number; yaw: number } | null;
  // jogador está dentro da Câmara Antiga (névoa roxa, céu preto) — o game.ts usa para ajustar a névoa
  setChamber(inside: boolean): void;
  dispose(): void;
}
```

Dentro dela (arquivos sugeridos): `generatorView`, `fizzView`, `forjaView` (a coluna que sobe), `tankView` (a partir de `busView.ts`), `colossusView`, `weatherFx`, `moundView` (montes e pás), `partsView` (peças flutuando, caixotes do Vento, cristais, disco, gramofone, tábua), `benchView` (Escudo e Drone montados na bancada), `staffView` (pedestais, altares, baús de almas, lápides, domos, placas, lâmpadas do Raio), `camaraFx`, `droneView`, `trFx.ts` (efeitos de partículas em lote).

Também: HUD (em `hud.ts`): fileira de 6 engrenagens (cinza/ciano/vermelho piscando), painel da equipe (ícones por conjunto), painel de desafios, aviso do colosso (barra com nome e segundos + seta), painel da missão, seta do gerador atacado, borda vermelha do Sangue Morto, ícone do clima, vida do Escudo, contagem de Granadas de Artilharia. Textos em português simples.

Tanque: corpo 7 × 4 m (`TRINCHEIRA.tankHalfLen/HalfWidth`), convés a `TRINCHEIRA.tankDeck` (1,15 m), frente para +z local, como o ônibus. Torre decorativa no meio (a simulação tem uma caixa de colisão 1,6×1,6 até 3 m de altura no centro do convés), esteiras que rolam, fumaça do escape, canhão que gira, lança-chamas na traseira (efeito só quando `tr.tank.state === 'volta'`).

### 5.2 Colossos (5.6 do doc principal)

`tr.robot` tem `id`, `phase` (`aviso`|`passos`), `warn`, `step` (índice da pegada), `sub` (`sobe|move|desce|fica`), `t` (0..1), `dir`. As pegadas de cada colosso estão em `map.trincheira.feet` (filtrar por `robot`, na ordem da lista; `dir === -1` anda do fim ao começo). Corpo de ~30 m, modelo procedural em blocos (pernas, tronco, braços, cabeça com olho na cor de `COLOSSI`), `fog: false` nos materiais. O pé que pisa está no centro da pegada; o corpo fica entre o pé que pisa e o pé anterior (o anterior da primeira passada fica fora do mapa). Pé alterna L/R a cada passo. Em `sub === 'move'` desenhe a sombra escura crescendo no chão da pegada; em `desce` o pé baixa; em `fica` poeira. Silhueta na névoa de longe. A pisada em si (tremor, som, poeira) vem do evento `pisada`.

### 5.3 Efeitos de área e status (eventos `area` e `fx`)

- `area` `pilar` (pilar de fogo: raio `r`, `dur` s), `nevasca`, `redemoinho`, `orbRaio` (bola elétrica), `choque` (descarga).
- `fx` `queima|congela|estilhaca|chama|sangue` em `zid` (zumbi) ou `pid` (jogador): tinta/partículas curtas no corpo. Os zumbis são do `zombies.ts` (armas): `ZombieManager.setStatus(zid, 'queima'|'congela'|null, secs)`.

### 5.4 Som (dono: armas/inimigos/som)

`AudioEngine.trSound(name: TrSound, pos?: THREE.Vector3, vol?: number)` com estes nomes (todos sintetizados, nada de assets de terceiros): `gerador-liga`, `gerador-perde`, `gerador-captura`, `alarme`, `forja-sobe`, `fonte-gira`, `fonte-bebida`, `fonte-foge`, `cavar`, `cavar-fim`, `achou-peca`, `bancada`, `monta`, `drone-liga`, `escudo-pega`, `tanque-motor`, `tanque-chamado`, `tanque-fogo`, `buzina-colosso`, `pisada-colosso`, `passo-colosso`, `blindado-chega`, `blindado-fogo`, `blindado-garra`, `blindado-salto`, `cruzado-grito`, `portal-musica`, `portal-abre`, `teleporte`, `cristal`, `cajado-monta`, `cajado-desperto`, `alvo-ok`, `alvo-erro`, `tabua`, `desafio`, `artilharia-lanca`, `artilharia-apito`, `artilharia-bomba`, `sangue-morto`, `missao-passo`, `missao-fim`, `fogo-bola`, `fogo-pilar`, `gelo-raio`, `gelo-quebra`, `nevasca`, `redemoinho`, `raio-bola`, `trovao`, `artilharia-longe`.
Além disso: `audio.setWeather('limpo'|'chuva'|'neve')` (chuva contínua), `audio.mudStep()`/`Surface 'mud'` nos passos, artilharia distante periódica (`audio.startTrincheira()` liga o ambiente: tambor distante, vento, artilharia a cada 20–50 s).

### 5.5 Armas (dono: armas/inimigos/som)

- `gunModels.ts`: `export function buildStaffMesh(el: Element, awake: boolean): THREE.Group` (cajado de madeira escura, cabeça de metal antigo, cristal da cor do elemento; desperto tem anéis de pedra girando) e os modelos de mão dos 8 ids `cajado-<el>` e `cajado-<el>-d` registrados como as outras armas. Punho de Ferro: luva de aço na mão no lugar da faca quando `me.punho`.
- `weapon.ts`: armas com `def.charge` (cajados despertos): segurar o gatilho por `def.charge` s dispara o ataque **carregado**: chamar o callback novo `fire(spread, charged: boolean)`; anel de carga na mira (`weapon.chargeFrac` 0..1 para o HUD, que desenha o anel). O Cajado de Gelo é automático (`def.auto`) e só dispara `launch`. Fogo, Vento e Raio: um `launch` por disparo. A Granada de Artilharia: `weapon.startAction('throw', …)` com a mesma animação da granada, vinda de uma tecla própria (eu cuido de `keys.ts` e do `game.ts`).
- `fx.ts`/`trFx.ts`: ver 5.1 (o dono do mundo escreve os efeitos de partículas novos em `trFx.ts`; o dono das armas só mexe em `fx.ts` se precisar de algo dentro do que já existe).

### 5.6 Inimigos (dono: armas/inimigos/som)

- `kind 7` Blindado: soldado dentro de armadura a vapor (sem insígnias), lança-flamas no braço esquerdo, garra com corrente no direito, mochila-foguete; animações: andar lento, `attack` (lança-chamas, cone de 6 m), `chain` (garra, use a mesma do Carrasco), `charge` (salto de mochila), `rise` (desce do céu). Visor que quebra: evento `blindado phase:'visor'`. Chega descendo com a mochila (`rise`).
- `kind 8` Cruzado: zumbi de armadura medieval enferrujada, olhos vermelhos, capa rasgada; anda devagar e ignora jogadores (só visual).
- Zumbis comuns (kinds 0, 1, 2) com visual 1918 neste mapa: capote marrom/cinza, capacete redondo ou boné, alguns com máscara de gás, bandoleira, lama na roupa; escolhidos por `look`. `ZombieManager.era = 'ww1' | 'padrao'` é ligado pelo `game.ts` conforme o mapa.
- Barra de vida do chefe: `hud.setBoss({hp, armor}, 'O BLINDADO')` já existe; o snapshot ganha `boss` normal (o Blindado conta como chefão; `armor` = visor ainda inteiro).

## 6. Atalhos de teste (só em desenvolvimento, `?autoplay`)

`window.__game.debugTr(cmd, arg?)` (eu implemento) aceita: `gens`, `itens`, `clima:neve|chuva|limpo`, `colosso:atlas|golias|tita`, `rodada:N`, `sangue`, `tp:X,Z`, `pontos:N`, `cajados`, `portais`, `blindado`, `cruzados`, `missao:N`, `tanque`, `tabua`, `montes`, `drone`, `escudo`, `desafios`. Use para ver o que precisa; nada disso existe em produção nem no servidor.

## 7. Entregar

Cada lado: código tipado (`npx tsc --noEmit` sem erros nos seus arquivos), nada quebrando as outras telas (Cidade e Rota seguem iguais), e o `INTEGRACAO-*.md` curto com o que ligar no `game.ts`. Não faça commit.
