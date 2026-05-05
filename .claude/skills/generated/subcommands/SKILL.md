---
name: subcommands
description: "Skill for the Subcommands area of fifi-alert-server. 10 symbols across 4 files."
---

# Subcommands

10 symbols | 4 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how run, displaySuccess, displayError work
- Modifying subcommands-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/commands/admin/subcommands/create-user.command.ts` | run, displaySuccess, displayError |
| `src/commands/admin/subcommands/create-admin.command.ts` | run, displaySuccess, displayError |
| `src/commands/admin/subcommands/list-admins.command.ts` | run, displayAdminList |
| `src/commands/admin/subcommands/convert-to-admin.command.ts` | run, displayUserInfo |

## Entry Points

Start here when exploring this area:

- **`run`** (Method) — `src/commands/admin/subcommands/create-user.command.ts:57`
- **`displaySuccess`** (Method) — `src/commands/admin/subcommands/create-user.command.ts:135`
- **`displayError`** (Method) — `src/commands/admin/subcommands/create-user.command.ts:170`
- **`run`** (Method) — `src/commands/admin/subcommands/create-admin.command.ts:71`
- **`displaySuccess`** (Method) — `src/commands/admin/subcommands/create-admin.command.ts:127`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `run` | Method | `src/commands/admin/subcommands/create-user.command.ts` | 57 |
| `displaySuccess` | Method | `src/commands/admin/subcommands/create-user.command.ts` | 135 |
| `displayError` | Method | `src/commands/admin/subcommands/create-user.command.ts` | 170 |
| `run` | Method | `src/commands/admin/subcommands/create-admin.command.ts` | 71 |
| `displaySuccess` | Method | `src/commands/admin/subcommands/create-admin.command.ts` | 127 |
| `displayError` | Method | `src/commands/admin/subcommands/create-admin.command.ts` | 148 |
| `run` | Method | `src/commands/admin/subcommands/list-admins.command.ts` | 30 |
| `displayAdminList` | Method | `src/commands/admin/subcommands/list-admins.command.ts` | 72 |
| `run` | Method | `src/commands/admin/subcommands/convert-to-admin.command.ts` | 73 |
| `displayUserInfo` | Method | `src/commands/admin/subcommands/convert-to-admin.command.ts` | 246 |

## How to Explore

1. `gitnexus_context({name: "run"})` — see callers and callees
2. `gitnexus_query({query: "subcommands"})` — find related execution flows
3. Read key files listed above for implementation details
