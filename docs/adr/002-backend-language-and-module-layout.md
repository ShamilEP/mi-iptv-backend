# ADR-002: Backend language, runtime, and module layout

- **Status:** Accepted
- **Date:** 2026-11-10
- **Deciders:** Backend (BE-001)
- **Refs:** SRS §1.3, §5, §17; Backend spec §1; ADR-001 (AWS)

## Context

SRS §1.3 allows a simple backend for low concurrent MVP load: a **modular monolith or few services**, without designing for massive scale on day one. SRS §5 and §17 (and Backend spec §1) require clear service boundaries for Auth, Profiles, Favorites/Progress Sync, Source Registry, Catalog, Devices, and Realtime/Notifications, fronted by a versioned API (`/api/v1`) acting as BFF/gateway.

This repository already scaffolds Clean Architecture (`domain` → `application` → `infrastructure` / `presentation`) with Node.js tooling. BE-001 freezes language, deployment shape, and bounded modules so later tasks do not fork the stack.

## Decision

### Language and runtime

| Choice | Detail |
| --- | --- |
| Language | **TypeScript** (strict) |
| Runtime | **Node.js ≥ 22** (ESM) |
| Process shape | **Single deployable modular monolith** (one ECS Fargate service per ADR-001), not a mesh of microservices for MVP |
| HTTP transport | Port `HttpServer` in application; MVP adapter uses **Node built-in `node:http`**. A third-party framework (e.g. Fastify) may replace the adapter later **only after explicit package approval** and still behind the same port |
| Persistence / cache | PostgreSQL + Redis via infrastructure adapters (wired in later tasks); domain/application never import vendor SDKs |

### Module boundaries (logical contexts inside the monolith)

Map 1:1 to folders under `src/domain/<context>` and `src/application/<context>`:

| Module | Responsibility (MVP) |
| --- | --- |
| **Auth** | Account register/login, JWT access + refresh (device-bound), logout/reset flows |
| **Profiles** | Profiles under an account (single profile MVP; multi-profile later) |
| **Sync** | Offline-first favorites, playback progress, related sync state (LWW + `syncVersion`, server clock, `clientEventId`) |
| **Sources** | User IPTV source registry (M3U / Xtream); credential ciphertext only at rest |
| **Catalog** | Canonical content model; proprietary catalog exposure and normalization entry points |
| **Devices** | Device register/list/pairing/heartbeat (TV + companion) |
| **Realtime** | Companion↔TV notifications / remote commands (WebSocket or equivalent later) |

Cross-cutting:

- **Presentation** — HTTP (and later realtime) routes under `/api/v1`; DTO validation at the boundary
- **Infrastructure** — DB, cache/pubsub, crypto/KMS, outbound HTTP to sources
- **`src/main.ts`** — composition root only

EPG ingestion (SRS §17) stays **Release 1** and is not a required MVP module folder yet.

### Rejected for MVP

- Separate deployable microservices per SRS backend box (Auth Service, Sync Service, …) — premature ops cost
- Non-TypeScript stacks (Go, JVM, Python, NestJS-first greenfield) — would discard the existing harness and agent rules
- Framework-first coupling (Nest modules owning domain) — violates Clean Architecture / port-adapter rules in this repo

## Consequences

- New features land as use cases + ports inside the matching module; adapters stay in infrastructure/presentation
- API versioning and BFF concerns live in presentation, not domain
- Splitting a module into its own service later requires a new ADR; until then, deploy one artifact
- Package additions (HTTP framework, ORM, Redis client, etc.) still need human approval and adapters

## Alignment evidence in repo

- `package.json` — Node ≥ 22, TypeScript scripts
- Module context folders already scaffolded (`.gitkeep` placeholders until use cases land):
  - `src/domain/{auth,profiles,sync,sources,catalog,devices,realtime}`
  - `src/application/{auth,profiles,sync,sources,catalog,devices,realtime}`
- `AGENTS.md` and `.cursor/rules/clean-architecture.mdc`
