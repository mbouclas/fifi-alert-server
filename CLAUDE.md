@AGENTS.md
<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **fifi-alert-server** (3635 symbols, 6602 relationships, 102 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/fifi-alert-server/context` | Codebase overview, check index freshness |
| `gitnexus://repo/fifi-alert-server/clusters` | All functional areas |
| `gitnexus://repo/fifi-alert-server/processes` | All execution flows |
| `gitnexus://repo/fifi-alert-server/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |
| Work in the User area (53 symbols) | `.claude/skills/generated/user/SKILL.md` |
| Work in the Scripts area (16 symbols) | `.claude/skills/generated/scripts/SKILL.md` |
| Work in the Alert area (16 symbols) | `.claude/skills/generated/alert/SKILL.md` |
| Work in the Upload area (15 symbols) | `.claude/skills/generated/upload/SKILL.md` |
| Work in the Audit area (12 symbols) | `.claude/skills/generated/audit/SKILL.md` |
| Work in the Sighting area (11 symbols) | `.claude/skills/generated/sighting/SKILL.md` |
| Work in the Services area (11 symbols) | `.claude/skills/generated/services/SKILL.md` |
| Work in the Scenarios area (10 symbols) | `.claude/skills/generated/scenarios/SKILL.md` |
| Work in the Device area (10 symbols) | `.claude/skills/generated/device/SKILL.md` |
| Work in the Pet area (10 symbols) | `.claude/skills/generated/pet/SKILL.md` |
| Work in the Notification area (10 symbols) | `.claude/skills/generated/notification/SKILL.md` |
| Work in the Subcommands area (10 symbols) | `.claude/skills/generated/subcommands/SKILL.md` |
| Work in the Location area (9 symbols) | `.claude/skills/generated/location/SKILL.md` |
| Work in the Mailgun area (9 symbols) | `.claude/skills/generated/mailgun/SKILL.md` |
| Work in the Email area (7 symbols) | `.claude/skills/generated/email/SKILL.md` |
| Work in the Commands area (7 symbols) | `.claude/skills/generated/commands/SKILL.md` |
| Work in the Auth area (6 symbols) | `.claude/skills/generated/auth/SKILL.md` |
| Work in the Health area (6 symbols) | `.claude/skills/generated/health/SKILL.md` |
| Work in the Interceptors area (6 symbols) | `.claude/skills/generated/interceptors/SKILL.md` |
| Work in the Smtp area (6 symbols) | `.claude/skills/generated/smtp/SKILL.md` |

<!-- gitnexus:end -->
