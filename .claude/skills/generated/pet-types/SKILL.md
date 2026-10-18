---
name: pet-types
description: "Skill for the Pet-types area of fifi-alert-server. 17 symbols across 4 files."
---

# Pet-types

17 symbols | 4 files | Cohesion: 88%

## When to Use

- Working with code in `src/`
- Understanding how pickTranslation, toPetTypeResponse, create work
- Modifying pet-types-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/pet-types/pet-types.service.ts` | create, findAll, findOne, findBySlug, update (+2) |
| `src/i18n/language.service.ts` | getActive, getDefault, getDefaultCode, isActiveCode |
| `src/pet-types/pet-types.controller.ts` | findAll, findBySlug, findOne, isAdmin |
| `src/pet-types/pet-type.mapper.ts` | pickTranslation, toPetTypeResponse |

## Entry Points

Start here when exploring this area:

- **`pickTranslation`** (Function) — `src/pet-types/pet-type.mapper.ts:16`
- **`toPetTypeResponse`** (Function) — `src/pet-types/pet-type.mapper.ts:34`
- **`create`** (Method) — `src/pet-types/pet-types.service.ts:46`
- **`findAll`** (Method) — `src/pet-types/pet-types.service.ts:84`
- **`findOne`** (Method) — `src/pet-types/pet-types.service.ts:112`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `pickTranslation` | Function | `src/pet-types/pet-type.mapper.ts` | 16 |
| `toPetTypeResponse` | Function | `src/pet-types/pet-type.mapper.ts` | 34 |
| `create` | Method | `src/pet-types/pet-types.service.ts` | 46 |
| `findAll` | Method | `src/pet-types/pet-types.service.ts` | 84 |
| `findOne` | Method | `src/pet-types/pet-types.service.ts` | 112 |
| `findBySlug` | Method | `src/pet-types/pet-types.service.ts` | 128 |
| `update` | Method | `src/pet-types/pet-types.service.ts` | 145 |
| `assertTranslations` | Method | `src/pet-types/pet-types.service.ts` | 208 |
| `toResponse` | Method | `src/pet-types/pet-types.service.ts` | 230 |
| `getActive` | Method | `src/i18n/language.service.ts` | 37 |
| `getDefault` | Method | `src/i18n/language.service.ts` | 66 |
| `getDefaultCode` | Method | `src/i18n/language.service.ts` | 74 |
| `isActiveCode` | Method | `src/i18n/language.service.ts` | 82 |
| `findAll` | Method | `src/pet-types/pet-types.controller.ts` | 126 |
| `findBySlug` | Method | `src/pet-types/pet-types.controller.ts` | 162 |
| `findOne` | Method | `src/pet-types/pet-types.controller.ts` | 198 |
| `isAdmin` | Method | `src/pet-types/pet-types.controller.ts` | 252 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `UploadPhotos → PickTranslation` | cross_community | 6 |
| `UploadPhotos → PickTranslation` | cross_community | 6 |
| `UploadPhotos → GetActive` | cross_community | 6 |
| `Create → PickTranslation` | cross_community | 6 |
| `Update → PickTranslation` | cross_community | 6 |
| `MarkAdopted → PickTranslation` | cross_community | 6 |
| `Withdraw → PickTranslation` | cross_community | 6 |
| `Relist → PickTranslation` | cross_community | 6 |
| `FindOne → PickTranslation` | cross_community | 6 |
| `UploadPhotos → GetActive` | cross_community | 5 |

## How to Explore

1. `gitnexus_context({name: "pickTranslation"})` — see callers and callees
2. `gitnexus_query({query: "pet-types"})` — find related execution flows
3. Read key files listed above for implementation details
