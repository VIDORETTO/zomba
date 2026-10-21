#!/usr/bin/env bash
# Constrói o jogo e copia só os arquivos estáticos para a pasta que o Caddy serve.
# Uso: hospedagem/publicar.sh [pasta de destino]   (padrão: /srv/zomba)
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="${1:-/srv/zomba}"
npm ci --no-audit --no-fund
npm run build
mkdir -p "$DEST"
# copia primeiro os arquivos novos (assets com resumo no nome) e a página por último: nunca há página apontando para arquivo que ainda não chegou
rsync -a --exclude index.html dist/ "$DEST"/
cp dist/index.html "$DEST"/index.html
# apaga assets antigos com mais de 7 dias (quem está com a página aberta ainda os usa por um tempo)
find "$DEST/assets" -type f -mtime +7 -delete 2>/dev/null || true
echo "Publicado em $DEST"
