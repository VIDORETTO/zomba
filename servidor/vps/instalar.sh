#!/usr/bin/env bash
# Zomba · servidor fixo numa VPS (Ubuntu ou Debian), com HTTPS automático.
#
# Numa VPS nova, como root, um comando só:
#   curl -fsSL https://raw.githubusercontent.com/VIDORETTO/zomba/main/servidor/vps/instalar.sh | bash
# Com domínio próprio (o domínio já apontando para o IP da VPS):
#   curl -fsSL https://raw.githubusercontent.com/VIDORETTO/zomba/main/servidor/vps/instalar.sh | bash -s -- jogo.meudominio.com.br
#
# Rodar de novo atualiza o jogo para a versão mais nova do GitHub (o placar fica guardado).
# Sem domínio, o endereço vira <ip-com-tracinhos>.sslip.io, que aponta para o IP da VPS.
set -euo pipefail

REPO="${ZOMBA_REPO:-https://github.com/VIDORETTO/zomba.git}"
DIR="${ZOMBA_DIR:-/opt/zomba}"
DOMINIO="${1:-}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode como root (ou com sudo)."
  exit 1
fi

echo "==> Preparando a VPS"
if ! command -v git >/dev/null 2>&1; then
  apt-get update -y && apt-get install -y git curl
fi
if ! command -v docker >/dev/null 2>&1; then
  # instalador oficial do Docker
  curl -fsSL https://get.docker.com | sh
fi

echo "==> Baixando o jogo"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only
else
  git clone --depth 1 "$REPO" "$DIR"
fi
cd "$DIR/servidor"

# domínio: o informado, o da instalação anterior ou o do IP público
if [ -z "$DOMINIO" ] && [ -f .env ]; then
  DOMINIO="$(sed -n 's/^DOMINIO=//p' .env)"
fi
if [ -z "$DOMINIO" ]; then
  IP="$(curl -fsS4 https://api.ipify.org)"
  DOMINIO="${IP//./-}.sslip.io"
fi
printf 'DOMINIO=%s\n' "$DOMINIO" > .env

# firewall: só web (80 e 443); o servidor do jogo fica escondido atrás do Caddy
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 443/udp
fi

echo "==> Montando e ligando (a primeira vez leva uns minutos)"
docker compose up -d --build
docker image prune -f >/dev/null

echo
echo "Pronto! O jogo está em:  https://$DOMINIO"
echo "Mande esse link para os amigos. O certificado HTTPS pode levar até um minuto na primeira vez."
echo "Para atualizar depois, rode este mesmo comando de novo."
