#!/usr/bin/env bash
# Sobe um Postgres temporário, aplica as migrações e roda os testes. Não precisa de Supabase.
# Uso: sistema/scripts/testar-banco.sh [arquivo.sql extra para rodar depois das migrações]
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
[ -n "$BIN" ] || { echo "Postgres não encontrado em /usr/lib/postgresql"; exit 1; }

TMP="$(mktemp -d)"
cp -r "$RAIZ/db" "$TMP/db"
EXTRA=""
if [ $# -gt 0 ]; then cp "$1" "$TMP/extra.sql"; EXTRA="$TMP/extra.sql"; fi

# O Postgres não roda como root.
COMO=()
if [ "$(id -u)" = 0 ]; then chown -R postgres "$TMP"; COMO=(runuser -u postgres --); fi

limpa() { "${COMO[@]}" "$BIN/pg_ctl" -D "$TMP/dados" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap limpa EXIT

"${COMO[@]}" "$BIN/initdb" -D "$TMP/dados" -U postgres -A trust -E UTF8 --locale=C.UTF-8 >/dev/null
"${COMO[@]}" "$BIN/pg_ctl" -D "$TMP/dados" -o "-k $TMP -c listen_addresses=''" -w start >/dev/null

psql_() { "${COMO[@]}" "$BIN/psql" -h "$TMP" -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

for f in "$TMP"/db/migrations/*.sql; do
  echo "migração $(basename "$f")"
  psql_ -f "$f"
done

for f in $( [ -n "${SEM_TESTES:-}" ] || echo "$TMP"/db/testes/*.sql ); do
  echo "teste $(basename "$f")"
  psql_ -f "$f" 2>&1 | sed "s/^psql:[^ ]* NOTICE:  /  /" | grep -v "^$"
done

if [ -n "$EXTRA" ]; then
  echo "extra $(basename "$1")"
  psql_ -f "$EXTRA"
fi
