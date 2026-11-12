# Mi IPTV backend image baseline (INF-005 / ADR-002).
# Multi-stage, non-root (uid 10001). Never bake secrets into the image.
#
# Build:  docker build -t mi-iptv-backend .
# Run:    docker run --rm -p 3000:3000 -e APP_ENV=dev -e PORT=3000 mi-iptv-backend

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN npm run build \
  && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    APP_ENV=prod \
    PORT=3000 \
    npm_config_update_notifier=false

RUN groupadd --system --gid 10001 app \
  && useradd --system --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app

COPY --from=build --chown=app:app /app/package.json /app/package-lock.json ./
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist

USER app
EXPOSE 3000

# ALB / ECS health probe target (Infra §2.2).
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "dist/main.js"]
