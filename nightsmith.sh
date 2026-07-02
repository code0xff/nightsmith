#!/usr/bin/env bash
# One-line Nightsmith launcher — the only host dependency is Docker.
#
#   ./nightsmith.sh                 # build if needed, then serve on :4040
#   ./nightsmith.sh doctor          # run any nightsmith subcommand
#
# The OpenAI key is read automatically from ./.env (or $NIGHTSMITH_ENV_FILE) if
# present; a shell export of OPENAI_API_KEY overrides it. No key → offline mock.
set -euo pipefail

IMAGE="${NIGHTSMITH_IMAGE:-nightsmith:local}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Publish ports to loopback only — Anvil's dev accounts are unlocked. Set
# NIGHTSMITH_BIND_HOST=0.0.0.0 to intentionally expose the cockpit/RPC on the LAN.
BIND="${NIGHTSMITH_BIND_HOST:-127.0.0.1}"

# Read one KEY from a .env file, mirroring the server's loader: tolerate a
# leading `export `, strip an inline ` #` comment and surrounding quotes.
env_from_file() {
  local name="$1" file="$2"
  [ -f "$file" ] || return 0
  grep -E "^[[:space:]]*(export[[:space:]]+)?${name}=" "$file" 2>/dev/null | tail -1 \
    | sed -E "s/^[[:space:]]*(export[[:space:]]+)?${name}=//; s/[[:space:]]+#.*$//; s/^\"(.*)\"$/\1/; s/^'(.*)'$/\1/"
}

# Shell env wins; otherwise fall back to the .env file (default ./.env).
ENV_FILE="${NIGHTSMITH_ENV_FILE:-$HERE/.env}"
OPENAI_API_KEY="${OPENAI_API_KEY:-$(env_from_file OPENAI_API_KEY "$ENV_FILE")}"
NIGHTSMITH_OPENAI_MODEL="${NIGHTSMITH_OPENAI_MODEL:-$(env_from_file NIGHTSMITH_OPENAI_MODEL "$ENV_FILE")}"

# Build the image on first run (or when NIGHTSMITH_REBUILD=1).
if [ "${NIGHTSMITH_REBUILD:-0}" = "1" ] || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Building $IMAGE …" >&2
  docker build --provenance=false --sbom=false -t "$IMAGE" "$HERE"
fi

exec docker run --rm -it \
  -p "${BIND}:4040:4040" \
  -p "${BIND}:8545:8545" \
  -e OPENAI_API_KEY="${OPENAI_API_KEY:-}" \
  -e NIGHTSMITH_OPENAI_MODEL="${NIGHTSMITH_OPENAI_MODEL:-}" \
  -v nightsmith-data:/data \
  "$IMAGE" "$@"
