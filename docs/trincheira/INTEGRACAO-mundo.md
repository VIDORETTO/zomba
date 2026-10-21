# Integração: cliente "mundo" da Trincheira

Tudo em `src/client/trincheira/` (classe `TrincheiraClient`, em `index.ts`). Só desenha o que `Snapshot.tr` e os eventos mandam; não tem regra de jogo. Painéis do HUD em `hud.ts` (classe `TrHud`, acessada por `hud.tr`) e `styles.css` (seção "Trincheira"). Teste visual sem a simulação: `npx vite --port 5201` e `node tools/tr-shots.mjs <pasta>` (página `tools/tr-harness.html`, objeto `window.__h`); `node tools/tr-events.mjs` dispara todos os eventos e prompts e confere que nada quebra.

## O que ligar no `game.ts`

1. **Criar** (só se `o.map.trincheira`), depois do `mapView`, do `audio` e do `hud`:
   ```ts
   this.tr = new TrincheiraClient(this.scene, o.map, o.tex, { quality: this.q, audio: this.audio, mapView: this.mapView });
   this.tr.attachHud(this.hud);
   this.tr.setLocal(this.transport.localId, (pid) => this.nameOf(pid));   // localId pode mudar depois do welcome: chame de novo
   ```
   Em `setQuality()` (o mapa é refeito): `this.tr.setMapView(this.mapView)`. O `TrincheiraClient` cria a própria camada de partículas, o clima e as telas; não precisa de nada de `FX`.
2. **Todo quadro**, em `step()`, depois de `updateMood()` e antes de `render` (a Câmara Antiga reafirma a névoa roxa depois do `updateMood`):
   ```ts
   const s = this.buffer.latest?.s;
   if (this.tr && s) {
     this.tr.update(sample, s, dt, this.t, this.me, this.camera);
     this.shake = Math.max(this.shake, this.tr.quake); this.tr.quake = 0;
   }
   ```
   `sample` é o mesmo que alimenta `zombies.update` (o tanque, o colosso e o drone se interpolam nele). `update` já chama `mapView.setSnow/setGens/setDim` e `hud.tr.*`.
3. **Tamanho das partículas**: em `resize()` chame `this.tr.resize(h * this.renderer.getPixelRatio(), this.camera.fov)` (se não chamar, ele calcula sozinho a partir da janela e do campo de visão da câmera).
4. **Eventos**: em `onEvents`, para cada `e`: `this.tr?.onEvent(e, { local, me: this.me })`. Ele ignora o que não é da Trincheira. Ele já toca os sons `trSound(...)` (inclusive os do Blindado: `blindado-chega/fogo/garra/salto`, então o `zombies`/`game` não devem repetir) e mostra os avisos (`hud.notify`/`showBanner`). Eventos `fx` e `area` viram partículas; `shot` de cajados **não** é tratado aqui: se quiser o raio de gelo ou o clarão na boca do cajado chame `this.tr.iceBeam(origem, direção, alcance)` e `this.tr.staffMuzzle(el, pos, dir)`.
5. **Projéteis em voo** (`updateGrenades`): `fogo`, `orbRaio`, `artilharia` → `this.tr.projectileTrail(kind, posAnterior, posAtual)` a cada quadro.
6. **Aviso de F** (`updateInteract`):
   - candidatos = `map.interactables` + `this.tr.extraInteractables(snap)` (peças soltas por zumbis, ids `drop-N`);
   - alcance `it.reach ?? 1.9`, e `it.minY` (peça só de cima do tanque) contra `pc.pos.y`;
   - para o mais perto: `const r = this.tr.promptFor(it, snap, me, { useKey, solo, weaponName })`. **`null` = interação inativa agora: pule e tente o próximo mais perto.** Senão: `hud.prompt(r.text, progresso, poor)`; `poor = r.can && me.points < r.price`; se `!r.can` não mande nada;
   - **`r.hold === true`** (cavar monte, montar na bancada): enquanto F estiver segurado mande `{t:'hold', id}` e, ao soltar ou sair do alcance, `{t:'hold', id:null}` (como o conserto de barricada); senão, `{t:'interact', id, weapon}` ao apertar.
7. **Tanque**: `this.tr.tankPose()` devolve a pose desenhada agora (`{x,z,yaw}`), igual a `busView.pose`; passe para o controlador junto com as medidas de `TANK_BODY`.
8. **Câmara Antiga**: `this.tr.inChamber` (verdadeiro quando a câmera está em `chamberRect`) para o que precisar saber (passos de pedra, etc.). O cliente já escurece o sol (`mapView.setDim`), põe céu preto com estrelas e névoa roxa.

## O que ele espera de `Hud` e dos outros

- `hud.tr` (criado sob demanda): `setGens, setTeam, setChallenges, setRobot, setMission, setRecapture, setZblood, setStatus`. Já usados pelo `TrincheiraClient`; o `game.ts` não precisa chamar.
- `hud.notify`, `hud.showBanner`, `hud.whiteFlash` existentes.
- `mapView.setSnow(k)`, `setDim(k)`, `setGens(on[])` (novos). `setGens` acende/apaga com suavidade as luzes com `LightDef.gen`.
- `NetPlayer` opcionais: `shovel, goldShovel, helmet, shield, punho, artilharia, zblood, challenges, claimed, extraPerk`. O HUD mostra Sangue Morto (borda vermelha + segundos), vida do Escudo, Artilharias, Punho, Pá Dourada e o clima.
- Jogadores remotos com `shield > 0` mostram o escudo nas costas; com `zblood > 0` ficam translúcidos (`players.ts`).
- Item `sangue` (gota vermelha com brilho vermelho) em `powerupView.ts`.
- `buildStaffMesh(el, awake)` de `gunModels.ts` (pedestais e altares).
- Áudio: `audio.trSound(nome, pos?, vol?)` e `audio.setWeather('limpo'|'chuva'|'neve')` (qualquer um que faltar é ignorado sem erro).

## Pontos que o `TrincheiraClient` desenha por conta própria

Geradores (círculo, parede de progresso, feixe ciano), Fonte da Sorte (máquina no local ativo, o pedestal apagado vem do mapa), coluna da Forja que sobe (o mapa não a cria), alavanca e tanque, três colossos (usando `shared/colossus.ts`: a pose, o pé e o olho são os da simulação), chuva e neve (neve também clareia o chão), montes e pás, peças e caixotes do Vento, Escudo e Drone na bancada e o drone voando, pedestais/altares/baús de almas/lápides/domos/placas e lâmpadas do Raio, Tábua no altar, feixes e anel da missão, portais, Câmara Antiga.
