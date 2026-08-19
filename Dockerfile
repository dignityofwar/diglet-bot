FROM node:24.19.0

ARG VERSION
ENV VERSION=${VERSION}

# pnpm ships with the image rather than being fetched at boot. Corepack is bundled with Node, so
# the version stays declared once in package.json's packageManager field. COREPACK_HOME is moved
# out of root's home and made world-readable: corepack downloads pnpm lazily on first use, and
# without this the tarball would land in /root/.cache, unreadable to the `node` user the container
# runs as, so every start would re-download pnpm from the registry.
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable

WORKDIR /app

# Own layer so it's only redone when the manifests change. Dev deps are kept, entrypoint.sh runs
# migrations through the MikroORM CLI.
#
# pnpm-workspace.yaml is a manifest too, not an extra: it carries settings the lockfile records,
# so copying the lockfile without it makes --frozen-lockfile fail on the mismatch.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack install && chmod -R a+rX "$COREPACK_HOME"
RUN pnpm install --frozen-lockfile --ignore-scripts

# Many things are ignored, check .dockerignore
COPY . /app

# Build, then lock execution down to the unprivileged node user.
#
# The heartbeat directory is created here rather than using /tmp: /tmp is
# world-writable, so any other process could pre-create or symlink a file the
# deploy gate trusts (Sonar S5443, CodeQL). This one is owned by the runtime user
# and writable by nobody else.
RUN pnpm build \
    && mkdir -p /var/run/digletbot \
    && chown node:node /app /var/run/digletbot

USER node

# The bot is a standalone Nest application context — no HTTP server, no port to
# probe — so liveness is a heartbeat file that HealthcheckService touches on its
# one-minute cron. Stale means the scheduler has stopped, which is what a wedged
# or crash-looping bot looks like from the outside. A process check would prove
# nothing: the bot is PID 1, so if it dies the container dies and Docker already
# knows.
#
# This lives here rather than in the server's compose file because that file is
# not mirrored in any repo — shipping the check with the image means every box
# gets it without a config change, and there is nothing to drift.
#
# start-period covers boot plus up to a minute of waiting for the first tick.
# The deploy is gated on this: the shared update.sh runs `up -d --wait`, so a bot
# that starts and wedges now fails the deploy instead of reporting success.
HEALTHCHECK --interval=30s --timeout=5s --start-period=150s --retries=3 \
  CMD ["node", "-e", "const{statSync}=require('node:fs');try{process.exit(Date.now()-statSync('/var/run/digletbot/heartbeat').mtimeMs<180000?0:1)}catch{process.exit(1)}"]

ENTRYPOINT ["/app/entrypoint.sh"]
