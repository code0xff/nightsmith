#!/usr/bin/env bash
# One-line Nightsmith launcher — the only host dependency is Docker.
#
#   ./nightsmith.sh                 # build if needed, then serve on :4040
#   ./nightsmith.sh doctor          # run any nightsmith subcommand
#   OPENAI_API_KEY=sk-... ./nightsmith.sh
#
# The OpenAI key is optional; without it the planner uses the offline mock.
set -euo pipefail

IMAGE="${NIGHTSMITH_IMAGE:-nightsmith:local}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Publish ports to loopback only — Anvil's dev accounts are unlocked. Set
# NIGHTSMITH_BIND_HOST=0.0.0.0 to intentionally expose the cockpit/RPC on the LAN.
BIND="${NIGHTSMITH_BIND_HOST:-127.0.0.1}"

# Build the image on first run (or when NIGHTSMITH_REBUILD=1).
if [ "${NIGHTSMITH_REBUILD:-0}" = "1" ] || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Building $IMAGE …" >&2
  docker build -t "$IMAGE" "$HERE"
fi

exec docker run --rm -it \
  -p "${BIND}:4040:4040" \
  -p "${BIND}:8545:8545" \
  -e OPENAI_API_KEY="${OPENAI_API_KEY:-}" \
  -e NIGHTSMITH_OPENAI_MODEL="${NIGHTSMITH_OPENAI_MODEL:-}" \
  -v nightsmith-data:/data \
  "$IMAGE" "$@"
