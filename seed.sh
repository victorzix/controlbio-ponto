#!/usr/bin/env bash
#
# seed.sh — cria/garante o usuário ADMIN inicial do controlbio-ponto.
#
# Idempotente: se o usuário (login) já existir, não faz nada. Roda o seed dentro
# do container de ferramentas do compose (serviço "migrate", que tem tsx e o
# código-fonte) — então use no mesmo diretório do docker-compose.yml, com o
# banco já no ar (o serviço sobe a dependência do db automaticamente).
#
# Uso:
#   ./seed.sh -p SENHA [-n "NOME"] [-u USUARIO]
#   bash seed.sh -p SENHA            # se não estiver com permissão de execução
#
# Flags:
#   -n  Nome do admin     (opcional; padrão "Administrador")
#   -u  Usuário / login   (opcional; padrão derivado do nome, ex.: "administrador")
#   -p  Senha             (obrigatória; use >= 8 caracteres)
#   -h  Ajuda
#
# Exemplos:
#   ./seed.sh -p "SenhaForte123" -n "Victor Raphael" -u victor
#   ./seed.sh -p "SenhaForte123"

set -euo pipefail

usage() {
  sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
}

NAME=""
USERNAME=""
PASSWORD=""

while getopts "n:u:p:h" opt; do
  case "$opt" in
    n) NAME="$OPTARG" ;;
    u) USERNAME="$OPTARG" ;;
    p) PASSWORD="$OPTARG" ;;
    h) usage; exit 0 ;;
    *) usage; exit 1 ;;
  esac
done

if [ -z "$PASSWORD" ]; then
  echo "Erro: a senha (-p) é obrigatória." >&2
  echo >&2
  usage
  exit 1
fi

echo "Criando/garantindo o admin (usuário: ${USERNAME:-<derivado do nome>})..."

docker compose run --rm \
  -e SEED_ADMIN_NAME="$NAME" \
  -e SEED_ADMIN_USERNAME="$USERNAME" \
  -e SEED_ADMIN_PASSWORD="$PASSWORD" \
  migrate \
  node --import tsx src/db/seed.ts