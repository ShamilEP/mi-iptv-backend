# Mi IPTV Backend

Node.js + TypeScript backend for Mi IPTV / Media Center, structured with Clean Architecture.

## Status

Harness and skeleton only. `GET /health` is implemented. Business features are not implemented yet.

Third-party packages require **human approval** before install. See `AGENTS.md` and `.cursor/rules/`.

## Quick start (after approved tooling packages are installed)

```bash
npm install
npm run dev
```

Health check: `GET http://localhost:3000/health`

## Layout

- `src/domain` — domain model
- `src/application` — use cases + ports
- `src/infrastructure` — third-party adapters
- `src/presentation` — HTTP adapters
- `src/main.ts` — composition root
- `db/migrations` — PostgreSQL schema

## Specs

Product specs live at `C:\Users\shami\OneDrive\Documents\Projects\Mi IPTV` (reference only; never read secrets).
