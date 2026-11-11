# Proposed packages for BE-002 (lint/format + toolchain)

**Status:** Approved and installed (human: approve BE-002 packages).

| Package | Purpose | Alternatives |
| --- | --- | --- |
| `typescript` | `typecheck` / `build` | — |
| `tsx` | `dev` / `test` runner for TypeScript | `ts-node` (heavier) |
| `@types/node` | Node typings for strict TS | — |
| `eslint` | Lint | Biome (would replace prettier too) |
| `typescript-eslint` | TS-aware ESLint | — |
| `prettier` | Format | Biome |
| `eslint-config-prettier` | Disable ESLint rules that fight Prettier | — |

Optional later (not requested for BE-002 DoD): `pino` for logger (replace `JsonConsoleLogger` behind the same `Logger` port).
