# Tutorial: jogar Zomba com os amigos

Do começo ao fim: ligar o servidor, criar a sala, jogar e desligar. Quem hospeda é o **anfitrião** (o computador onde o servidor roda). Os amigos só precisam de um navegador no computador (Chrome, Edge ou Firefox).

## Antes da primeira vez (uma vez só)

1. Instale o [Node.js](https://nodejs.org), versão **LTS**, e aceite tudo o que o instalador propõe.
2. Pronto. O resto o servidor prepara sozinho na primeira vez (uns 2 minutos).

## 1. Ligar o servidor

1. Abra a pasta `servidor` e dê dois cliques em **`Iniciar servidor.bat`**. Abre uma janela preta: ela **é** o servidor e precisa ficar aberta enquanto vocês jogam.
2. Escolha como os amigos vão entrar, digitando o número e apertando Enter:

   | Opção | Quando usar |
   | --- | --- |
   | **1 · Cloudflare** (Enter já escolhe esta) | O normal. Funciona em qualquer internet, sem mexer no roteador, com link `https` e o seu IP escondido. |
   | **2 · Direto** | Quer menos atraso e ser o servidor "puro", sem ninguém no meio. O link mostra o seu IP e o roteador precisa deixar (veja [Modo direto](#modo-direto-sem-cloudflare)). |
   | **3 · Só rede local** | Todo mundo no mesmo Wi-Fi ou cabo (na mesma casa, lan house). |

3. Se o Windows perguntar sobre o **Firewall** (modos 2 e 3), clique em **Permitir acesso**.
4. Espere aparecer **PRONTO!** com o link. Ele já fica copiado, e o jogo abre sozinho no seu navegador, na tela do co-op.

## 2. Criar a sala (anfitrião)

1. Na tela do co-op, digite **seu nome** e clique em **Criar sala**.
2. No lobby aparecem o **código da sala** (4 letras) e o **link do convite**.
3. Escolha o **mapa** (Cidade ou Rota) e a **rodada inicial**. Só o anfitrião escolhe.
4. Clique em **Copiar convite** e mande no WhatsApp ou Discord.

> O jogo não abriu sozinho? Abra no navegador o endereço `http://localhost:3001` que aparece na janela do servidor (o número pode ser outro, como 3002) e clique em **Co-op online**.

## 3. Os amigos entram

- **Com o convite** (mais fácil): o amigo abre o link, digita o nome e clica em **Entrar na sala**. Pronto, ele aparece no seu lobby.
- **Com o código**: o amigo abre o link do servidor (o do PRONTO!), clica em **Co-op online**, digita o código de 4 letras e clica em **Entrar**.
- Cabem até **4 jogadores** por sala.
- Entrou alguém que você não conhece? No lobby, clique em **Tirar** ao lado do nome. Essa pessoa não volta para a sala.

## 4. Jogar

1. Com todo mundo no lobby, o anfitrião clica em **Iniciar partida**.
2. Clique na tela para o jogo pegar o mouse. **Esc** abre o menu de jogo (continuar, opções, sair).
3. No canto de cima aparece o atraso (por exemplo `144 FPS · 40 ms`). Até uns 100 ms fica liso; acima de 200 ms dá para jogar, mas sente-se o atraso.
4. Caiu? Um aliado chega perto e **segura F** para reanimar você.
5. Quem sai no meio da partida não consegue voltar para ela, só para a próxima.

## 5. Finalizar

- **Fim de jogo**: quando todos morrem, aparece **FIM DE JOGO** com as estatísticas de cada um. Clique em **Voltar ao menu**. Quem entrou numa conta no placar online tem a partida registrada sozinha.
- **Sair antes do fim**: **Esc** → **Sair da partida** → clique de novo para confirmar. Os outros continuam jogando.
- **Jogar de novo**: no menu, **Co-op online** → **Criar sala**. A sala nova tem outro código, então mande o convite novo (o antigo não vale mais). O link do servidor continua o mesmo enquanto ele estiver ligado.
- **Desligar o servidor**: feche a janela preta ou aperte **Ctrl+C** nela. Ele guarda o placar e, no modo direto, fecha a porta que abriu no roteador. Só desligue quando todo mundo tiver terminado: quem estiver jogando vê "Conexão perdida".

## Modo direto (sem Cloudflare)

Você é o servidor puro: os amigos se conectam direto no seu computador. É o caminho mais curto, com o menor atraso possível, e não depende da Cloudflare.

O que muda:

- O link é `http://<seu IP>:<porta>`: **sem cadeado (https)** e **mostra o seu IP**. Mande só para quem você conhece.
- No placar online, não use uma senha que você usa em outros lugares: no modo direto ela viaja sem criptografia.
- O roteador precisa deixar os amigos entrarem. O servidor tenta abrir a porta sozinho (UPnP) e fecha quando desliga. Se não conseguir, ele explica na janela o que fazer.

Situações que a janela do servidor mostra:

| Aviso | O que fazer (uma vez só) |
| --- | --- |
| "porta aberta no roteador" | Nada. Mande o link. |
| "Abra a porta na mão" | No painel do roteador (normalmente `http://192.168.1.1` ou `http://192.168.0.1`), procure **Redirecionamento de portas** (ou **Port forwarding** / **Servidor virtual**) e crie a regra: a porta mostrada, protocolo **TCP**, para o endereço do seu computador mostrado na janela. Ou ative o **UPnP** no roteador. |
| "Há dois roteadores em sequência" | Comum quando a operadora deixa um modem e você tem outro roteador. No painel do **modem da operadora** (o endereço aparece na janela), procure **DMZ** e coloque o endereço do seu roteador (também aparece), ou peça à operadora para pôr o modem em **modo bridge**. |
| "Sua operadora usa CGNAT" | Nessa internet ninguém de fora chega direto. Use o modo 1 (Cloudflare) ou peça à operadora um **IP público** (às vezes chamado de "IP fixo" ou "IP válido"). |

> Dentro de casa, muitos roteadores não deixam abrir o próprio link público. Para testar, peça para um amigo abrir o link (ou abra pelo 4G do celular).

Para conferir a sua internet antes de jogar, sem abrir nada: `node tools/upnp-probe.mjs`.

## Problemas comuns

| Problema | Solução |
| --- | --- |
| "Sala não encontrada" | O código está errado ou a sala já fechou. Peça um convite novo. |
| "A partida dessa sala já começou" | Espere a próxima partida e entre na sala nova. |
| "Muitos códigos errados" | Espere um minuto e confira o código. |
| O link do modo 1 não abre | Espere uns 30 segundos depois do PRONTO!. Se o túnel cair, a janela mostra um link novo sozinha. |
| O amigo não entra no modo 2 | Veja a tabela do [Modo direto](#modo-direto-sem-cloudflare). Se nada resolver, use o modo 1. |
| Muito atraso | Tente o modo 2. Para o menor atraso sempre, use um servidor fixo numa VPS em São Paulo (veja `LEIA-ME.md`). |
| "Conexão perdida" no meio do jogo | O servidor foi desligado ou a internet do anfitrião caiu. Ligue de novo e crie uma sala nova. |
| "porta ocupada" na janela | Nada a fazer: o servidor escolhe outra porta sozinho (o link já sai com ela). |
