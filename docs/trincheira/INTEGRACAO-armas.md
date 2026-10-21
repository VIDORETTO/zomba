# Integração: armas, inimigos e som (o que ligar no `game.ts`)

Tudo abaixo já existe e compila. Teste no navegador: `node tools/test-trincheira-armas.mjs <pasta> [porta]` (Vite ligado; capturas na pasta).

## Som (`audio.ts`, `trSound.ts`)

- `audio.trSound(name, pos?, vol = 1)`: os 51 nomes do contrato (`TrSound`, lista em `TR_SOUNDS`). Sem `pos` toca no ouvido; com `pos` é posicional. Vinhetas (`missao-passo`, `missao-fim`, `desafio`, `cajado-*`, `achou-peca`, `alvo-ok`, `cristal`) saem pelo canal de música.
- `audio.setWeather('limpo' | 'chuva' | 'neve')`: chuva contínua; neve só reforça o vento. Chamar no evento `clima` e ao entrar na partida com `snap.tr.weather`.
- `audio.startTrincheira()` / `stopTrincheira()`: vento, tambor distante e artilharia ao longe. **Chamar `audio.trUpdate(dt)` a cada quadro** (é quem dispara a artilharia a cada 20 a 50 s). Ligar no `start()` do jogo quando `map.id === 'trincheira'`.
- Passo na lama: `Surface` agora aceita `'mud'`. Em `Game.surface()`, onde a grade do mapa devolve a letra `m`, retornar `'mud'` (hoje cai em `'dirt'`).
- Sugestão de eventos para sons: `gen` (`done` → `gerador-liga`, `lost` → `gerador-perde`, `start` → `gerador-captura`, `attack` → `alarme`), `forjaSobe` → `forja-sobe`, `fizz` (`spin` → `fonte-gira`, `give` → `fonte-bebida`, `leave` → `fonte-foge`), `dig`, `buzina` → `buzina-colosso`, `pisada` → `pisada-colosso` (+ tremor), `portal` → `portal-musica` (6 s) e depois `portal-abre`, `teleporte`, `alvo` (`ok` → `alvo-ok`, senão `alvo-erro`), `artilharia` (`throw` → `artilharia-lanca`, `marca` → `artilharia-apito`, `bomba` → `artilharia-bomba`), `area` (`pilar` → `fogo-pilar`, `nevasca`, `redemoinho`, `orbRaio` → `raio-bola`), `missao`, `tabua`, `desafio`, `craft`, `cajado` (`monta` → `cajado-monta`), `desperto` → `cajado-desperto`.
- Tiro dos cajados (som do disparo): `fogo-bola`, `gelo-raio` (limitado a ~8 por segundo), e os já existentes `windBlast`/`arcZap` para Vento e Raio.

## Cajados e armas (`gunModels.ts`, `weapon.ts`)

- Os 8 ids (`cajado-fogo|gelo|vento|raio` e `-d`) já têm modelo na mão (`buildGun`); basta a simulação entregar a arma.
- `buildStaffMesh(el, awake)` (`gunModels.ts`): cajado em pé (~1,6 m, base na origem, cabeça para cima) para pedestal e altar. Animar com `group.userData.tick(tempoEmSegundos, carga01)` (brilho, anéis, chamas).
- **Callback do tiro mudou de assinatura (compatível):** `WeaponCallbacks.fire(spread, charged?)`. No `Game`, trocar `fire: (spread) => this.fire(spread)` por `fire: (spread, charged) => this.fire(spread, charged)` e, para `def.projectile` ('fogo', 'frost', 'wind', 'arc'), mandar `{ t: 'launch', ..., charged }`. `charged` só vem verdadeiro nos cajados despertos.
- Carga: segurar o gatilho por `def.charge` (1,5 s) enche `weapon.chargeFrac` (0 a 1; fica 0 nos primeiros 0,2 s, para um aperto rápido não piscar o anel). Soltar com a carga cheia dispara com `charged = true`; soltar antes é um disparo comum (sai ao soltar). O **Cajado de Gelo desperto** (automático) segura o raio normalmente e, ao completar 1,5 s de gatilho, solta o carregado **uma vez**; para repetir, soltar e apertar de novo. O `hud` desenha o anel com `weapon.chargeFrac`.
- Punho de Ferro: `weapon.punho = me.punho` a cada snapshot. Troca a faca por uma luva de aço, com soco reto (`knife` segue o mesmo callback e a mesma tecla).
- Granada de Artilharia: `weapon.throwArtillery(): boolean` (devolve `false` se as mãos estão ocupadas). O callback novo é `WeaponCallbacks.throwArtillery?()`, chamado no instante do arremesso (aí o `Game` calcula a velocidade como em `throwGrenade` e manda `{ t: 'artillery', ... }`). Tecla própria e contagem (`me.artilharia`) ficam com o `Game` (`keys.ts`). A animação é a da granada, com a esfera vermelha escura.

## Inimigos (`zombies.ts`, `blindado.ts`, `cruzado.ts`)

- `zombies.era = 'ww1'` antes da partida começar (se `map.id === 'trincheira'`): zumbis comuns viram soldados de 1918 (capote, capacete, boné, máscara de gás, bandoleira, lama). Sem isso o visual é o de sempre.
- Kinds novos: 7 (Blindado) e 8 (Cruzado) são criados sozinhos pelo snapshot. Chefão: o `hud.setBoss` para o Blindado fica com o `Game`.
- `zombies.onEvent(e)` agora aceita `blindado` (spawn, flame, claw, jump, visor, death) e `fx` com `zid` (`queima`, `congela` aplicam a camada de cor por 2,5 s; `estilhaca` tira a camada, toca `gelo-quebra` e solta cacos). **Basta repassar esses dois eventos** (e `zattack`, `zkill`, como hoje).
- `zombies.setStatus(zid, 'queima' | 'congela' | null, segundos)` para chamar direto.
- Animações usadas pelo Blindado (vindas de `NetZombie.anim`): `attack` = lança-chamas, `chain` = garra (mesma linha de corrente do Carrasco, alvo vem de `blindado claw` com `pid`), `charge` = salto de mochila, `rise` = descida do céu (mochila acesa, ~2,4 s). O visor quebra no evento `blindado visor`.
- Tremor dos passos/pouso: `zombies.quake` (mesmo mecanismo do Carrasco).

## Observação (fora do meu escopo)

Com o mapa atual, `Game.updateInteract` quebra (`Cannot read properties of undefined (reading 'id')`, no ramo final que trata tudo como bebida) quando o jogador chega perto das interações novas (gerador etc.). Como o erro sai no meio do `step`, a tela fica preta. Os testes desta pasta ficam em pontos da lama longe delas.
