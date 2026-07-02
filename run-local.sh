#!/usr/bin/env bash
# One-line native launcher — checks/installs Node, pnpm, and Foundry (anvil) if
# missing, then builds and runs the cockpit directly on the host (no Docker).
#
#   ./run-local.sh                  # check prerequisites, build, serve on :4040
#   NIGHTSMITH_YES=1 ./run-local.sh # skip install confirmation prompts
#
# Each missing prerequisite is installed via its standard, well-known method
# (nvm/Homebrew for Node, corepack for pnpm, the official Foundry installer for
# anvil) and requires your confirmation first, unless NIGHTSMITH_YES=1.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
YES="${NIGHTSMITH_YES:-0}"
MIN_NODE_MAJOR=20

log() { echo "[run-local] $*" >&2; }

confirm() {
  local prompt="$1"
  if [ "$YES" = "1" ]; then
    return 0
  fi
  if [ ! -t 0 ]; then
    log "Non-interactive shell and NIGHTSMITH_YES not set — refusing to install without consent."
    return 1
  fi
  read -r -p "$prompt [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]]
}

require_node() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -p 'process.versions.node.split(".")[0]')"
    if [ "$major" -ge "$MIN_NODE_MAJOR" ]; then
      log "node $(node -v) OK"
      return 0
    fi
    log "node $(node -v) found, but Nightsmith needs >= $MIN_NODE_MAJOR"
  else
    log "node not found"
  fi

  if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    confirm "Install Node $MIN_NODE_MAJOR via nvm?" || { log "Node >= $MIN_NODE_MAJOR is required — aborting."; exit 1; }
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
    nvm install "$MIN_NODE_MAJOR"
    nvm use "$MIN_NODE_MAJOR"
  elif command -v brew >/dev/null 2>&1; then
    confirm "Install node@$MIN_NODE_MAJOR via Homebrew?" || { log "Node >= $MIN_NODE_MAJOR is required — aborting."; exit 1; }
    brew install "node@$MIN_NODE_MAJOR"
    export PATH="$(brew --prefix "node@$MIN_NODE_MAJOR")/bin:$PATH"
  elif command -v apt-get >/dev/null 2>&1; then
    confirm "Install nodejs via apt-get (uses sudo)?" || { log "Node >= $MIN_NODE_MAJOR is required — aborting."; exit 1; }
    curl -fsSL "https://deb.nodesource.com/setup_${MIN_NODE_MAJOR}.x" | sudo -E bash -
    sudo apt-get install -y nodejs
  else
    log "No supported installer found (nvm/Homebrew/apt-get). Install Node >= $MIN_NODE_MAJOR manually: https://nodejs.org/"
    exit 1
  fi

  command -v node >/dev/null 2>&1 || { log "Node install finished but 'node' is still not on PATH. Open a new shell and retry."; exit 1; }
}

require_pnpm() {
  local want="$1" # e.g. "pnpm@11.8.0"
  if command -v pnpm >/dev/null 2>&1; then
    log "pnpm $(pnpm --version) OK"
    return 0
  fi
  log "pnpm not found"
  if command -v corepack >/dev/null 2>&1; then
    confirm "Enable pnpm via corepack (bundled with Node)?" || { log "pnpm is required — aborting."; exit 1; }
    corepack enable
    corepack prepare "$want" --activate
  else
    confirm "Install pnpm globally via npm?" || { log "pnpm is required — aborting."; exit 1; }
    npm install -g "$want"
  fi
  command -v pnpm >/dev/null 2>&1 || { log "pnpm install finished but 'pnpm' is still not on PATH. Open a new shell and retry."; exit 1; }
}

require_anvil() {
  local bin_dir="${FOUNDRY_BIN_DIR:-$HOME/.foundry/bin}"
  if command -v anvil >/dev/null 2>&1 || [ -x "$bin_dir/anvil" ]; then
    export PATH="$bin_dir:$PATH"
    log "anvil OK ($(anvil --version 2>/dev/null | head -1 || echo "$bin_dir/anvil"))"
    return 0
  fi
  log "anvil (Foundry) not found"
  case "$(uname -s)" in
    Darwin|Linux) ;;
    *)
      log "Automatic Foundry install only supports macOS/Linux. Install manually: https://book.getfoundry.sh/getting-started/installation"
      exit 1
      ;;
  esac
  confirm "Install Foundry via the official installer (curl -L https://foundry.paradigm.xyz | bash && foundryup)?" \
    || { log "anvil is required — aborting."; exit 1; }
  # Same fixed, hardcoded pipeline the app itself uses for its consented
  # install flow (apps/server/src/anvil/install.ts) — no shell rc files run.
  curl -L https://foundry.paradigm.xyz | bash
  "$bin_dir/foundryup"
  export PATH="$bin_dir:$PATH"
  command -v anvil >/dev/null 2>&1 || { log "Foundry install finished but anvil is still not found on PATH."; exit 1; }
}

require_node

PNPM_WANT="$(node -p "require('$HERE/package.json').packageManager" 2>/dev/null || echo 'pnpm@11.8.0')"
require_pnpm "$PNPM_WANT"

require_anvil

cd "$HERE"
log "Installing workspace dependencies…"
pnpm install
log "Building…"
pnpm build
log "Starting the cockpit on http://${NIGHTSMITH_HOST:-127.0.0.1}:${NIGHTSMITH_PORT:-4040} …"
# Not `exec nightsmith` — pnpm doesn't self-link a workspace package's own
# bin into its node_modules/.bin, so invoke the built entrypoint directly.
exec pnpm --filter @nightsmith/server exec node dist/cli.js serve
