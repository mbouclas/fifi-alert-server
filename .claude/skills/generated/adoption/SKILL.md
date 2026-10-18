---
name: adoption
description: "Skill for the Adoption area of fifi-alert-server. 21 symbols across 4 files."
---

# Adoption

21 symbols | 4 files | Cohesion: 82%

## When to Use

- Working with code in `src/`
- Understanding how toPetResponse, toAdoptionListingResponse, findOneForRequester work
- Modifying adoption-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/adoption/adoption.controller.ts` | localize, findOne, create, update, markAdopted (+6) |
| `src/adoption/adoption.service.ts` | findOneForRequester, requireOwned, update, markAdopted, withdraw (+3) |
| `src/pet/pet.mapper.ts` | toPetResponse |
| `src/adoption/adoption.mapper.ts` | toAdoptionListingResponse |

## Entry Points

Start here when exploring this area:

- **`toPetResponse`** (Function) — `src/pet/pet.mapper.ts:17`
- **`toAdoptionListingResponse`** (Function) — `src/adoption/adoption.mapper.ts:20`
- **`findOneForRequester`** (Method) — `src/adoption/adoption.service.ts:232`
- **`localize`** (Method) — `src/adoption/adoption.controller.ts:94`
- **`findOne`** (Method) — `src/adoption/adoption.controller.ts:188`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `toPetResponse` | Function | `src/pet/pet.mapper.ts` | 17 |
| `toAdoptionListingResponse` | Function | `src/adoption/adoption.mapper.ts` | 20 |
| `findOneForRequester` | Method | `src/adoption/adoption.service.ts` | 232 |
| `localize` | Method | `src/adoption/adoption.controller.ts` | 94 |
| `findOne` | Method | `src/adoption/adoption.controller.ts` | 188 |
| `create` | Method | `src/adoption/adoption.controller.ts` | 214 |
| `update` | Method | `src/adoption/adoption.controller.ts` | 240 |
| `markAdopted` | Method | `src/adoption/adoption.controller.ts` | 266 |
| `withdraw` | Method | `src/adoption/adoption.controller.ts` | 291 |
| `relist` | Method | `src/adoption/adoption.controller.ts` | 316 |
| `requireOwned` | Method | `src/adoption/adoption.service.ts` | 269 |
| `update` | Method | `src/adoption/adoption.service.ts` | 292 |
| `markAdopted` | Method | `src/adoption/adoption.service.ts` | 352 |
| `withdraw` | Method | `src/adoption/adoption.service.ts` | 372 |
| `relist` | Method | `src/adoption/adoption.service.ts` | 392 |
| `remove` | Method | `src/adoption/adoption.service.ts` | 412 |
| `addPhotos` | Method | `src/adoption/adoption.service.ts` | 421 |
| `uploadPhotos` | Method | `src/adoption/adoption.controller.ts` | 365 |
| `localizeMany` | Method | `src/adoption/adoption.controller.ts` | 103 |
| `findMine` | Method | `src/adoption/adoption.controller.ts` | 127 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `UploadPhotos → PickTranslation` | cross_community | 6 |
| `UploadPhotos → PickTranslation` | cross_community | 6 |
| `Create → PickTranslation` | cross_community | 6 |
| `Update → PickTranslation` | cross_community | 6 |
| `MarkAdopted → PickTranslation` | cross_community | 6 |
| `Withdraw → PickTranslation` | cross_community | 6 |
| `Relist → PickTranslation` | cross_community | 6 |
| `FindOne → PickTranslation` | cross_community | 6 |
| `UploadPhotos → GetActive` | cross_community | 5 |
| `UploadPhotos → SniffImageType` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Pet-types | 3 calls |
| Upload | 1 calls |

## How to Explore

1. `gitnexus_context({name: "toPetResponse"})` — see callers and callees
2. `gitnexus_query({query: "adoption"})` — find related execution flows
3. Read key files listed above for implementation details
