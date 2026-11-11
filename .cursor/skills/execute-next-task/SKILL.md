---
name: execute-next-task
description: >-
  Selects the next ready Backend/Infra/Security task from the Excel task tracker,
  implements it under Clean Architecture, validates, sets In review, and waits for
  human approval before Done. Use when the user says execute next task, continue
  tasks, approve a task ID, or work from the MiIPTV task tracker.
---

# Execute Next Task

## Prerequisites

- Tracker path: `task-tracker/MiIPTV_Project_Task_Tracker.xlsx` (gitignored, local).
- CLI (Windows):

```bash
tools/task_tracker/.venv/Scripts/python.exe -m tools.task_tracker <command>
```

If the venv is missing, create it and install `tools/task_tracker/requirements.txt` (openpyxl is approved for this tooling only).

## Commands

| Intent | CLI |
| --- | --- |
| List ready | `list-ready` |
| Pick one | `next` (exit 2 if none) |
| Claim | `claim <ID>` |
| After work | `set-status <ID> "In review" --notes "..."` |
| Block | `set-status <ID> Blocked --notes "..."` |
| Human approved | `set-status <ID> Done --approve-done` |
| Inspect | `get <ID>` |

## Workflow: execute next

Copy and track:

```
Task Progress:
- [ ] 1. Git safety check
- [ ] 2. Select task via CLI
- [ ] 3. Claim task
- [ ] 4. Analyze codebase + DoD
- [ ] 5. Implement one task
- [ ] 6. Validate (typecheck/test/build)
- [ ] 7. Run verifier subagent
- [ ] 8. Write docs/task-reports/<ID>.md
- [ ] 9. set-status In review
- [ ] 10. Stop for human review
```

### 1. Git safety

- If unrelated dirty files exist, **stop** and ask the human. Do not overwrite their work.
- Create/switch branch: `task/<ID>-short-slug` from the current default branch tip when claiming.
- Never force-push, hard-reset, or amend others' commits.
- Do not `git add -f` the gitignored Excel file.

### 2–3. Select and claim

1. Run `next`.
2. If no selection: report blockers and **stop** (do not pick Product/Design/TV/Companion/QA).
3. Run `claim <ID>`.
4. Resume an existing scoped `In progress` task instead of claiming another.

### 4. Analyze before coding

- Read task DoD via `get <ID>`.
- Map impact to `src/domain`, `src/application`, `src/infrastructure`, `src/presentation`, `db/migrations`.
- Obey `.cursor/rules/*` and `AGENTS.md`.
- Propose third-party packages; install only after explicit human approval.

### 5–6. Implement and validate

- Implement only this task's Definition of Done.
- Prefer: `npm run typecheck`, `npm test`, `npm run build` (and `npm run lint` if configured).
- If npm deps are missing, record that in the report; do not install unapproved packages.

### 7–9. Verify, report, In review

- Invoke the **verifier** subagent (`.cursor/agents/verifier.md`).
- Write `docs/task-reports/<ID>.md` using the template below.
- `set-status <ID> "In review" --notes "Report: docs/task-reports/<ID>.md"`.
- **Stop.** Do not mark Done. Do not start another task.

### Report template

```markdown
# Task <ID> — <title>

## Summary
<1-3 sentences>

## Status
In review

## Modified files
- path — why

## Changes
- bullet list

## Validation
- command — pass/fail/skipped (reason)

## Verifier
- pass/fail notes

## Risks / follow-ups
- ...
```

## Workflow: human approval

When the user explicitly approves a task (e.g. `approve BE-021`):

1. Confirm wording names the task ID.
2. `get <ID>` — must be `In review`.
3. `set-status <ID> Done --approve-done`.
4. Stop, or ask whether to run execute-next again. Never auto-chain unless asked.

## Blocked path

If DoD is ambiguous, deps incomplete, or work is unsafe:

1. `set-status <ID> Blocked --notes "<reason>"`.
2. Report the reason and stop.

## Anti-patterns

- Do not edit Dashboard formulas or non-editable columns.
- Do not change Done tasks.
- Do not implement multiple backlog items in one run.
- Do not treat Product/Design/TV/Companion/QA as auto-selectable in this repo.
