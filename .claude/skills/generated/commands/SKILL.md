---
name: commands
description: "Skill for the Commands area of fifi-alert-server. 7 symbols across 1 files."
---

# Commands

7 symbols | 1 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how run, beforeHelp, afterHelp work
- Modifying commands-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/commands/help.command.ts` | run, beforeHelp, afterHelp, formatCommandList, printHelp (+2) |

## Entry Points

Start here when exploring this area:

- **`run`** (Method) — `src/commands/help.command.ts:98`
- **`beforeHelp`** (Method) — `src/commands/help.command.ts:103`
- **`afterHelp`** (Method) — `src/commands/help.command.ts:112`
- **`formatCommandList`** (Method) — `src/commands/help.command.ts:129`
- **`printHelp`** (Method) — `src/commands/help.command.ts:158`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `run` | Method | `src/commands/help.command.ts` | 98 |
| `beforeHelp` | Method | `src/commands/help.command.ts` | 103 |
| `afterHelp` | Method | `src/commands/help.command.ts` | 112 |
| `formatCommandList` | Method | `src/commands/help.command.ts` | 129 |
| `printHelp` | Method | `src/commands/help.command.ts` | 158 |
| `onModuleInit` | Method | `src/commands/help.command.ts` | 58 |
| `discoverCommands` | Method | `src/commands/help.command.ts` | 65 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Run → FormatCommandList` | intra_community | 4 |
| `Run → BeforeHelp` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "run"})` — see callers and callees
2. `gitnexus_query({query: "commands"})` — find related execution flows
3. Read key files listed above for implementation details
