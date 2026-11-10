# Mi IPTV Backend — Agent Guide

Node.js + TypeScript backend for Mi IPTV / Media Center. Follow Clean Architecture, Clean Code, DRY, and SOLID.

## Rules (authoritative)

Project rules live in `.cursor/rules/`. Obey them on every change.

## Hard constraints

- Never read `*.env*` files or any secrets.
- Never commit credentials, tokens, private keys, or ciphertext keys.
- Always write Clean Code; keep files small (~300 lines soft limit).
- Follow Clean Architecture layer boundaries.
- Follow DRY and SOLID.
- Propose third-party packages; install or wire them only after explicit human approval.
- Wrap every approved third-party package behind a simple adapter. Domain and use cases never import vendor SDKs.

## Product context

Specs (read-only product context, not secrets):

`C:\Users\shami\OneDrive\Documents\Projects\Mi IPTV`

Key backend concerns: `/api/v1` auth, sources/catalog, sync, devices, realtime; PostgreSQL + Redis/Valkey; LWW sync; canonical catalog model.

## Layout

- `src/domain` — entities, value objects, domain errors
- `src/application` — use cases and ports
- `src/infrastructure` — adapters for approved third-party packages
- `src/presentation` — HTTP (and later realtime) adapters
- `src/main.ts` — composition root only
- `db/migrations` — SQL schema / migrations
