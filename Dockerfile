# Nightsmith — single self-contained image: Node + Foundry (anvil/forge/cast) +
# the built server & web cockpit. Anvil runs INSIDE this container as a child
# process the server spawns/stops/restarts per world — it is deliberately NOT a
# separate service, so the executor keeps full lifecycle control.

# ---- builder: install workspace deps and build everything ----
FROM node:22-slim AS builder
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Produce a self-contained production deployment of the server (prod deps only,
# workspace packages resolved). tsup already bundles @nightsmith/* into dist, so
# the runtime only needs the real npm deps that pnpm deploy carries.
# --legacy: tsup already bundles @nightsmith/* into dist, so we don't need
# pnpm's injected-workspace-packages deploy mode.
RUN pnpm --filter @nightsmith/server deploy --prod --legacy /app \
    && mkdir -p /app/web-dist \
    && cp -r apps/web/dist/. /app/web-dist/

# ---- runtime: node + foundry only ----
FROM node:22-slim AS runtime

# Foundry — the runtime only needs `anvil` (the server spawns it per world);
# forge/cast/chisel are dev-time/diagnostic tools, so we drop them and the
# foundryup download cache to keep the image small.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates git \
    && rm -rf /var/lib/apt/lists/*
ENV PATH="/root/.foundry/bin:${PATH}"
# Remove the unused binaries and the versions cache IN THE SAME layer as the
# install (a later-layer delete wouldn't shrink the image).
RUN curl -L https://foundry.paradigm.xyz | bash \
    && foundryup \
    && rm -f /root/.foundry/bin/forge /root/.foundry/bin/cast /root/.foundry/bin/chisel \
    && rm -rf /root/.foundry/versions /tmp/*

WORKDIR /app
COPY --from=builder /app /app

# Bind so the published ports are reachable from the host; the web cockpit is
# served from the bundled build; sessions persist under the /data volume.
ENV NODE_ENV=production \
    NIGHTSMITH_HOST=0.0.0.0 \
    NIGHTSMITH_ANVIL_HOST=0.0.0.0 \
    NIGHTSMITH_WEB_DIST=/app/web-dist \
    NIGHTSMITH_DATA_DIR=/data

VOLUME /data
# 4040 = cockpit (UI + API/WS); 8545 = Anvil RPC (so a browser wallet can reach it).
EXPOSE 4040 8545

# Entrypoint is the CLI, so `docker run <image> <cmd>` maps to `nightsmith <cmd>`
# (serve/stop/doctor/export/replay). Defaults to `serve`.
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["serve"]
