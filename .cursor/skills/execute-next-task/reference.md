# Task tracker reference

## Sheets

| Sheet | Auto-select? |
| --- | --- |
| Backend | Yes |
| Infra | Yes |
| Security | Yes |
| Product, Design, Android TV, Companion, QA | No (deps only) |
| Read me, Dashboard | Never edit |

## Columns

| Col | Field | Editable by agent |
| --- | --- | --- |
| A | ID | No |
| B | Epic | No |
| C | Task | No |
| D | Status | Yes |
| E | Owner | Yes |
| F | Phase | No |
| G | Priority | No |
| H | Details / Definition of Done | No |
| I | Refs | No |
| J | Depends on | No |
| K | Origin | No |
| L | Est. (pts) | Yes |
| M | Notes | Yes |

## Status values

`Not started` → `In progress` → `In review` → `Done`, or `Blocked`.

## Ready rule

Task is ready when sheet is executable, status is `Not started`, every dependency ID exists and is `Done`, and no other scoped task is `In progress`.

## Selection order

Phase (Sprint 0 → Release 2), then Priority (Critical → Low), then ID ascending.
