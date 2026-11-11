# Multi-stage image for Mi IPTV backend (ADR-002 modular monolith).
# Build: docker build -t mi-iptv-backend .
# Run:   docker run --rm -p 3000:3000 -e APP_ENV=dev -e PORT=3000 mi-iptv-backend
#
# Note: `npm run build` requires TypeScript toolchain packages (see package proposal for BE-002).

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV APP_ENV=prod
ENV PORT=3000

RUN groupadd --system --gid 10001 app \
  && useradd --system --uid 10001 --gid app --create-home app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
  && chown -R app:app /app

COPY --from=build --chown=app:app /app/dist ./dist

USER app
EXPOSE 3000
CMD ["node", "dist/main.js"]
