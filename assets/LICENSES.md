# Registro de licenças dos assets

Regra do projeto: como o jogo pode ser vendido, só entram assets **CC0** ou com licença que permita
uso comercial sem atribuição obrigatória. Nada com cláusula "NC" (não comercial). Nenhum arquivo,
nome ou marca do Black Ops 2 / Activision.

Antes de adicionar um pacote: conferir a licença na página de download no dia, salvar uma cópia
dos termos em `assets/licenses/<pacote>.txt` e registrar aqui.

## Em uso

| Asset | Origem | Licença |
| --- | --- | --- |
| Texturas (asfalto, tijolo, madeira, lava etc.) | Geradas por código em `src/client/textures.ts` | Próprias |
| Modelos (prédios, carros, zumbis, arma) | Montados por código com blocos | Próprios |
| Sons e música (o resto) | Sintetizados em `src/client/audio.ts` | Próprios |
| Tiros gravados (`public/sfx/gun-*`, `tail-*`) | [The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library), recortados por `tools/build-sfx.mjs` | CC0 — `licenses/free-firearm-sound-library.txt` |
| Passos, tábuas e impactos no corpo (`public/sfx/step-*`, `board-*`, `flesh-*`) | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 — `licenses/kenney-impact-sounds.txt` |
| Vozes dos zumbis (`public/sfx/z-*`) | [Zombies Sound Pack](https://opengameart.org/content/zombies-sound-pack) (artisticdude), [Zombie noises and moans](https://opengameart.org/content/zombie-noises-and-moans) (ianzazz) e [Zombie moans](https://opengameart.org/content/zombie-moans) (Darsycho, que pede crédito por gentileza) | CC0 — `licenses/zombie-voices.txt` |

Os arquivos de terceiros ficam só em `public/sfx`. Para refazê-los, baixe os pacotes e rode
`node tools/build-sfx.mjs <pasta "Prepared SFX Library"> <pasta Audio do Kenney> <pasta com os sons de zumbi>`.

## Candidatos para a arte definitiva (ainda não baixados)

| Pacote | Uso pretendido | Licença informada | Situação |
| --- | --- | --- | --- |
| Kenney Animated Characters 1, 2 e 3 | Base de personagens | CC0 | Verificar no download; há relatos de problema na importação |
| Mixamo (Adobe) | Animações de ataque, morte e janela | Licença Adobe, uso comercial permitido | Não é CC0: ler os termos |
| Majadroid Apocalyptic City | Prédios em ruínas | CC0 | Vem em .blend; converter para glTF |
| Atomic Realm Post-Apocalyptic World | Adereços da cidade | Não é CC0 | Ler os termos antes de usar |
| Quaternius (pacotes diversos) | Adereços e armas | CC0 | Verificar |
| Poly Haven / ambientCG | Texturas PBR e céu | CC0 | Verificar |
| Styloo Guns Pack | Armas | CC0 | Download em glTF pode ser pago (pague quanto quiser) |
| Silent Horror Bundle | Ambiência e música | CC0 | Verificar |
| SnakeF8 gun sounds | Tiros | Uso comercial permitido, não CC0 | Ler os termos |
| Zombie Massacre starter pack | Vozes de zumbi | Sem licença formal | Evitar até haver licença escrita |
