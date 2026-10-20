#!/usr/bin/env sh
# Zomba - servidor em um clique (Linux e Mac): ./servidor/iniciar.sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "O Node.js nao esta instalado. Instale a versao LTS em https://nodejs.org e rode de novo."
  exit 1
fi
exec node iniciar.mjs "$@"
