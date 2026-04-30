# Codex Instructions

## Project Overview

This is the **fifi-alert-server** project —

## Tech Stack

- **Runtime**: Bun (not Node.js)
- **Language**: TypeScript
- **ORM**: Prisma (PostgreSQL)
- **Database**: PostgreSQL (target), MySQL 5.6 via Docker (legacy source)
- **Package manager**: Bun (`bun install`, not `npm install`)

## Key Commands

```bash

# Install dependencies
bun install

# Prisma schema migration
bunx prisma migrate dev --name <migration_name>

# Generate Prisma client
bunx prisma generate

# Run migration script
bun run scripts/migrate.ts

# Tear down Docker
docker compose down
```



## Database Connections

Defined in `.env`:

- `DATABASE_URL` — PostgreSQL target (Prisma)
- `SHADOW_DATABASE_URL` — Prisma shadow database

## Prisma Schema

The Prisma schema at `prisma/schema.prisma` is the **single source of truth** for the database structure. 

All models use `@map()` for snake_case PostgreSQL column names and `@@map()` for table names.

## Conventions

- **SQL column names**: `snake_case` (enforced via Prisma `@map`)
- **TypeScript/Prisma fields**: `camelCase`
- **Table names**: plural, `snake_case` (`recipe_sections`, `recipe_ingredients`)
- **Boolean flags**: prefix with `is_` in DB (`is_optional`, `is_main`)
- **Sort ordering**: `sort_order` column, 0-based, local to parent (e.g., per-section for ingredients)
- **Timestamps**: `created_at` / `updated_at` as nullable `DateTime`
- **IDs**: integer autoincrement, preserve legacy IDs during migration


# Symdex Usage Guidelines
- Use Symdex for repository exploration before broad manual searching when the task involves finding symbols, tracing callers/callees, understanding file relationships, or building a repo outline.
- If Symdex is not indexed or may be stale, index the workspace with the repo name `fifi-alert-server` before relying on Symdex results.
- Prefer Symdex symbol and semantic search over repeated ad hoc grep/read cycles when locating implementations, related services, controllers, DTOs, or cross-module call paths.
- Use Symdex index status and repo stats tools to confirm the index is healthy before drawing conclusions from missing results.
- Use Symdex caller/callee and graph tools when changing shared services, auth flows, Prisma access paths, or event-driven code so downstream impact is understood before editing.
- Use Symdex text search for fast indexed lookups, but verify final edits against the actual source files before making changes.
- Do not treat Symdex as the source of truth for exact code content; use it to discover targets, then read the relevant files directly before modifying code.

# Lessons

Lessons capture knowledge from prior sessions that cannot be expressed as executable code. They are a **last resort**, not the default place to record what you learned. Prefer tests, lint rules, canonical examples, and ADRs — in that order — before writing a lesson.

## Loading Lessons

Do not read the `lessons/` directory at session start. It is loaded on demand.

1. At session start, read only `lessons/INDEX.md`. Nothing else from `lessons/`.
2. Before editing any module, grep `INDEX.md` for: the module name, the filenames you will touch, and the domain concept of the change (e.g. `migration`, `auth`, `cache`, `idempotency`).
3. Open a full lesson file only when a tag, title, or file path in the index matches your current task. Do not speculatively load lessons because they "might be relevant."
4. If you load a lesson and it does not apply, say so in your response. It signals that the lesson's tags need tightening.

If `lessons/INDEX.md` is missing or older than any file in `lessons/`, regenerate it with `scripts/lessons_index.sh` before relying on it.

## Writing a Lesson

Before writing a lesson, walk this ladder and stop at the first rung that fits:

1. **Regression test** — the knowledge is "X breaks when Y." Write the test.
2. **Lint / semgrep / AST rule** — the knowledge is "we don't do pattern Z here." Encode the rule.
3. **Pre-commit or CI assertion** — the knowledge is "A and B must stay in sync." Write the check.
4. **Canonical example** — the knowledge is "here's how we do this pattern." Add or update a file under `examples/` and reference it from the nearest `AGENTS.md`.
5. **ADR** — the knowledge is an architectural *why* with tradeoffs.
6. **Lesson** — only if none of the above fit.

Do not write lessons for: syntax reminders, style rules a linter could enforce, "don't forget to…" notes that belong in tests, or restatements of what the code already shows. If you cannot answer the question "why isn't this a test or rule?" in one sentence, it should not be a lesson.

## Lesson File Format

One lesson per file. Path: `lessons/YYYY-MM-DD-short-slug.md`. All fields required; use `N/A` only when truly inapplicable.

```markdown
---
id: 2026-04-24-payments-idempotency-keys
tags: [payments, idempotency, stripe, retries]
files: [src/payments/processor.py, src/payments/webhook.py]
related_commits: [a3f2c1b]
supersedes: []
expires_on_change_to: [src/payments/processor.py::process_charge]
last_verified: 2026-04-24
---

# Short, declarative title

## Context
One paragraph. What situation does this apply to? What signals should make a
future session load this lesson?

## Lesson
The actual knowledge. 3–8 sentences. If it's longer, it should have been an
ADR or a canonical example instead.

## Why not a test / lint / example
One or two sentences. If you can't answer this cleanly, delete the file and
write the executable version instead.

## Canary
A concrete artifact whose change invalidates this lesson — a file path, a
function signature, or a commit reference. This is what keeps the lesson
falsifiable.
```

### Field rules

- `id` matches the filename slug.
- `tags` are lowercase, kebab-case, 2–6 items. Include the module, the domain concept, and the failure mode. Tags are the only thing scanned at load time — make them discriminating, not generic (`general`, `python`, `backend` are banned).
- `files` lists exact paths. If any listed file is moved or deleted, the lesson is flagged for review.
- `supersedes` lists IDs of lessons this replaces. Move superseded files to `lessons/archive/` in the same commit.
- `expires_on_change_to` points at a path or symbol. CI compares its current state against `last_verified` and flags drift.
- `last_verified` is an ISO date. Bump it whenever you confirm the lesson still applies, even without edits.

## Retiring Lessons

Move a lesson to `lessons/archive/` when any of the following is true:

- The canary has fired and the lesson no longer matches reality.
- The knowledge has been promoted to a test, rule, or canonical example. Reference the replacement in the archived file's frontmatter before moving it.
- A superseding lesson has been written.
- The referenced files no longer exist.

Archived lessons are not indexed and are never loaded during sessions.

## End-of-Session Protocol

Before ending a non-trivial session, for each piece of knowledge gained, walk the ladder in *Writing a Lesson* and land it at the highest rung that fits. A session that produces multiple lessons and zero executable artifacts is a smell — reconsider whether those lessons should have been tests or rules.

## Review Cadence

Lessons whose `last_verified` is older than 90 days, or whose canary has fired, surface via `scripts/lessons_review.sh`. Each flagged lesson must be re-verified, rewritten, promoted to executable form, or archived. Lessons flagged across two consecutive review cycles are archived automatically.

## Anti-Patterns

- Lessons without a canary — they cannot visibly go stale, which is the exact failure mode this system exists to prevent.
- Lessons that restate what a well-named test or type already expresses.
- Lessons longer than ~8 sentences in the `Lesson` section — promote to an ADR or canonical example.
- Tags so broad they match every task and get ignored.
- Lesson count growing faster than test and rule count. The healthy trend is the opposite.


# Session Journal

The journal is working memory for an in-flight task — decisions made, paths rejected, and where to resume. It is **not** durable knowledge. Lessons, tests, rules, examples, and ADRs cover durable knowledge; the journal covers the narrative of the current task only.

Journals are per-task, not per-session. A task may span many sessions; each session updates the same journal file.

## Location and Lifecycle

- Path: `.agent/journal/<task-slug>.md`
- The `.agent/` directory is gitignored. Journals are local and ephemeral.
- One journal per active task. Do not create per-session files.
- When the task ships (merge, deploy, or abandonment), the journal is walked through the lessons ladder and then deleted. Journals never accumulate.

## Loading the Journal

Journal loading takes precedence over all other context sources.

1. At session start, before reading `CLAUDE.md`, `AGENTS.md`, or `lessons/INDEX.md`, check `.agent/journal/` for a file matching the user's stated task or current branch.
2. If a matching journal exists, read it in full. It is the highest-signal context available — decisions, rejected paths, and the explicit next step were written by you in a prior session.
3. If no journal matches but the task is non-trivial (more than ~30 minutes of expected work, or touches more than one module), create one before starting.
4. If the user's task clearly does not match any journal and is trivial, no journal is needed.

## Journal File Format

```markdown
---
task: migrate-payments-to-stripe-v2
started: 2026-04-22
status: in-progress
branch: feat/stripe-v2
---

## Goal
One paragraph describing what "done" looks like. Concrete enough that a cold
reader can tell whether a given change moves toward or away from it.

## Decisions
Chronological, dated. One line each. Include the *why*, briefly.
- 2026-04-22: chose webhook-first over polling — Stripe's retry semantics make polling redundant
- 2026-04-23: keeping old processor behind feature flag until refund parity confirmed

## Tried and rejected
What was considered and ruled out, with the reason. Prevents re-litigating
dead ends in the next session.
- Parallel dual-write: idempotency keys collide across versions
- Shadow mode in prod: ops vetoed

## Open questions
Unresolved items. Check them off or convert to Decisions as they resolve.
- [ ] Does the refund flow need the same migration path?
- [ ] Confirm retention policy with legal

## Next step
The single most important field. Must be concrete enough to act on cold:
a command to run, a file and line, or a specific question to answer.
"Continue the migration" is not a next step.
Example: "Resume by running `pytest tests/payments/test_webhook_v2.py::test_replay`
— it's red and the fix is probably in `processor.py:184`."
```

### Field rules

- `task` matches the filename slug.
- `status` is one of: `in-progress`, `blocked`, `paused`, `shipping`, `abandoned`.
- `branch` is the git branch the work lives on. Used to auto-match journals at session start.
- Sections may be empty but must be present. An empty `Tried and rejected` is meaningful information.

## Update Rules

- Update `Decisions` and `Tried and rejected` **inline**, as they happen, not at session end. End-of-session updates get skipped under time pressure; inline updates do not.
- Update `Next step` as the **last thing** before ending a session, every time. If the session ends without a concrete next step written, the journal has failed at its one job.
- Do not rewrite history. Journals are append-mostly; if a decision is reversed, add a new dated Decision entry rather than editing the old one.
- Do not let the journal grow unbounded. If `Decisions` passes ~20 entries or the file passes ~300 lines, the task is either too large (split it) or finished in substance (ship it and retire the journal).

## Interaction with /compact

If context compaction is imminent during a session, dump current state to the journal **before** compacting, not after. Post-compact summarization loses nuance; an explicit pre-compact journal update preserves it.

## Retirement Protocol

When a task ships or is abandoned, walk the journal through the lessons ladder before deleting it:

1. **Decisions** with lasting architectural weight → ADR.
2. **Tried and rejected** entries that future contributors might re-attempt → either a regression test that would fail on the rejected approach, a comment in the relevant file (`# rejected: <approach> because <reason>`), or, if neither fits, a lesson.
3. **Patterns discovered during the work** → canonical example under `examples/`, referenced from the nearest `AGENTS.md`.
4. **Open questions** that remain open → move to an issue tracker, not a lesson.
5. Delete the journal file.

A journal that retires without producing any of (1)–(4) is suspicious — either the task was trivial (fine, delete and move on) or knowledge is being lost (reconsider).

## Anti-Patterns

- Keeping journals after the task ships. They rot into a shadow docs folder — the exact anti-pattern this whole system exists to avoid.
- Committing journals to the repo. They are local working memory, not shared artifacts.
- Using a journal as a substitute for a lesson, ADR, or test. The journal is ephemeral by design; durable knowledge goes elsewhere.
- Vague `Next step` entries. If the next action cannot be taken cold by a future session, the field is not done.
- One journal covering multiple unrelated tasks. Split them.
- Editing past `Decisions` entries instead of appending new ones. Destroys the reasoning trail.

## Relationship to Lessons

| Concern | Goes in |
|---|---|
| "In this codebase, X is always true" | Lesson (or preferably test / rule / example) |
| "On this task, we decided X because Y" | Journal → ADR at retirement if durable |
| "On this task, we tried X and it failed" | Journal → test or code comment at retirement |
| "Resume here next time" | Journal `Next step` only |
| "This user prefers X" | Not here. AGENTS.md if it affects the codebase; otherwise nowhere. |

The journal feeds the lessons system at retirement time. It is never a substitute for it.