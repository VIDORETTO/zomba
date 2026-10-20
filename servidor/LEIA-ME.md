# Servidor do Zomba

Formas de jogar com os amigos pela internet. Todas entregam o jogo e o co-op pelo mesmo link: os amigos só abrem o link no navegador, sem instalar nada.

**Passo a passo completo (ligar, criar a sala, jogar e desligar): [TUTORIAL.md](TUTORIAL.md).**

| | **Seu computador · Cloudflare** | **Seu computador · Direto** | **Servidor fixo** (VPS) |
| --- | --- | --- | --- |
| Custo | grátis | grátis | uma VPS barata (uns R$ 30 por mês) |
| Para ligar | `Iniciar servidor.bat`, opção 1 | `Iniciar servidor.bat`, opção 2 | fica ligado sempre |
| Roteador | não precisa mexer | precisa deixar a porta aberta (tenta sozinho pelo UPnP) | não precisa mexer |
| Link | `https`, muda cada vez que liga | `http://<seu IP>`, muda se o IP mudar | `https`, fixo |
| Seu IP | escondido | aparece no link | escondido |
| Atraso (ping) | depende do caminho da Cloudflare: medido aqui ~250 ms | o menor possível (direto até você) | ~10–40 ms com a VPS em São Paulo |
| Seu computador | precisa ficar ligado | precisa ficar ligado | pode desligar |

## 1. No seu computador (um clique)

1. Precisa do [Node.js](https://nodejs.org) (versão LTS). Só na primeira vez.
2. Dê dois cliques em **`Iniciar servidor.bat`** (Linux/Mac: `./servidor/iniciar.sh`, ou `npm run servidor`).
3. Escolha o modo: **1** Cloudflare (Enter), **2** Direto (sem Cloudflare, você é o servidor) ou **3** só rede local.
4. Na primeira vez ele instala as peças do jogo (e, no modo 1, baixa o túnel da Cloudflare): uns 2 minutos. Depois, liga em segundos.
5. Aparece **PRONTO!** com o link (já copiado), e o jogo abre no seu navegador na tela do co-op.
6. Clique em **Criar sala** → **Copiar convite** → mande no WhatsApp ou Discord. Quem abrir o convite cai direto na sua sala.
7. Para desligar: feche a janela (ou Ctrl+C).

No **modo direto**, o iniciador pede ao roteador para abrir a porta (UPnP) e fecha de novo ao desligar. Se a internet não deixar (dois roteadores em sequência, UPnP desligado, CGNAT da operadora), ele explica na janela o que fazer; os detalhes estão no [tutorial](TUTORIAL.md#modo-direto-sem-cloudflare). Para testar a sua internet antes: `node tools/upnp-probe.mjs`.

Opções (no terminal: `node servidor/iniciar.mjs --opção`), para pular a pergunta do modo:

- `--cloudflare`, `--direto` ou `--sem-internet` (só rede local).
- `--rede`: no modo Cloudflare, aceita também conexões diretas da rede local junto com o túnel.
- `--porta 4000`: outra porta (se a 3001 estiver ocupada ele já escolhe a próxima sozinho).
- `--nao-abrir`: não abre o navegador.

## 2. Servidor fixo (VPS)

Para ter um link fixo, ligado o tempo todo e com menos atraso. Contrate uma VPS com **Ubuntu** (de preferência em **São Paulo**; 1 GB de memória basta) e, no terminal dela, como root:

```bash
curl -fsSL https://raw.githubusercontent.com/VIDORETTO/zomba/main/servidor/vps/instalar.sh | bash
```

Pronto: ele instala o Docker, baixa o jogo, liga o HTTPS e mostra o link (algo como `https://203-0-113-7.sslip.io`). Com domínio próprio, aponte o domínio para o IP da VPS e passe o nome:

```bash
curl -fsSL https://raw.githubusercontent.com/VIDORETTO/zomba/main/servidor/vps/instalar.sh | bash -s -- jogo.meudominio.com.br
```

Para atualizar o jogo depois, rode o mesmo comando de novo. O placar fica guardado num volume do Docker (`zomba_placar`).

## Segurança

- **Seu IP fica escondido** e **nenhuma porta do roteador é aberta**: no modo Cloudflare, os amigos falam com a Cloudflare, que leva até o seu computador por um túnel que ele mesmo abre. O servidor só aceita conexões do próprio computador (e do túnel).
- **HTTPS** nos modos Cloudflare e VPS (link `https://`).
- **Modo direto**: é o mais rápido, mas troca segurança por atraso: o link mostra o seu IP e não tem HTTPS. A porta só fica aberta enquanto o servidor está ligado (o iniciador fecha ao desligar; se o computador desligar de repente, ela vence sozinha em até 1 hora nos roteadores que aceitam prazo). Todas as outras proteções abaixo continuam valendo.
- **Salas fechadas**: só entra quem tem o código (ou o convite). Quem chuta códigos errados é bloqueado por um minuto depois de 12 tentativas.
- **O anfitrião manda na sala**: o botão **Tirar** no lobby expulsa alguém, que não volta para aquela sala.
- **Limites contra abuso**: no máximo 8 conexões por endereço, 400 no total, 100 salas; mensagens gigantes ou em excesso são ignoradas; sala esquecida no lobby fecha depois de 3 horas.
- **Só o jogo entra no servidor**: outros sites não conseguem conectar nas salas pelo navegador de quem os visita, e o jogo não pode ser embutido em outras páginas.
- **Senhas do placar** nunca são guardadas, só um resumo (scrypt).
- **Túnel conferido**: o `cloudflared` é baixado do GitHub oficial da Cloudflare e o arquivo é conferido pelo resumo (sha256) publicado junto; se não bater, é recusado.
- **Na VPS**: o jogo roda em contêiner sem administrador, só leitura (só o placar é gravável) e escondido atrás do Caddy; para fora ficam só as portas 80 e 443.

## O que tem nesta pasta

```
TUTORIAL.md            passo a passo: ligar, criar a sala, jogar e desligar
Iniciar servidor.bat   dois cliques no Windows
iniciar.sh             o mesmo no Linux e no Mac
iniciar.mjs            o iniciador: prepara o jogo, liga o servidor (Cloudflare, direto ou rede local), mostra o link
upnp.mjs               abre e fecha a porta no roteador (modo direto)
Dockerfile             o servidor em contêiner (VPS)
docker-compose.yml     servidor + Caddy (HTTPS automático)
Caddyfile              configuração do HTTPS
vps/instalar.sh        instala ou atualiza tudo numa VPS com um comando
bin/                   o cloudflared baixado (criada sozinha, fora do Git)
```

O código do servidor mesmo fica em `src/server/` (ele usa as mesmas regras do jogo de `src/shared/`).

## Testes

- `node tools/test-guard.mjs <endereço>`: proteções (limite de conexões, chute de códigos, tirar da sala). Para rodar local: suba um servidor com `PORT=3012 HOST=127.0.0.1 ZOMBA_PROXY=cloudflare ZOMBA_DATA=<pasta> node --import tsx src/server/main.ts`.
- `node tools/test-invite.mjs <pasta> [endereço do anfitrião]`: convite pelo link no navegador, tirar da sala e iniciar a partida (com o iniciador ligado, passe `http://localhost:<porta>` e o convite sai pelo túnel).
- `node tools/probe-tunnel.mjs <link>`: confere um servidor pelo link público.
- `node tools/ping-server.mjs <link>`: mede o atraso até o servidor.
- `node tools/upnp-probe.mjs [porta]`: diz se o modo direto funciona na sua internet (roteador com UPnP, dois roteadores, CGNAT) e se uma porta está aberta. Não abre nada.
