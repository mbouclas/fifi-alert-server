---
name: pet
description: "Skill for the Pet area of fifi-alert-server. 21 symbols across 3 files."
---

# Pet

21 symbols | 3 files | Cohesion: 81%

## When to Use

- Working with code in `src/`
- Understanding how run, orderedPetPhotos, validatePhotos work
- Modifying pet-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/pet/pet.service.ts` | validatePhotos, requirePetType, generateTagId, createPet, updatePet (+7) |
| `src/pet/pet.controller.ts` | update, localize, create, findAll, findByTagId (+3) |
| `src/pet/pet.mapper.ts` | orderedPetPhotos |

## Entry Points

Start here when exploring this area:

- **`run`** (Function) — `src/pet/pet.service.ts:233`
- **`orderedPetPhotos`** (Function) — `src/pet/pet.mapper.ts:37`
- **`validatePhotos`** (Method) — `src/pet/pet.service.ts:39`
- **`requirePetType`** (Method) — `src/pet/pet.service.ts:58`
- **`generateTagId`** (Method) — `src/pet/pet.service.ts:76`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `run` | Function | `src/pet/pet.service.ts` | 233 |
| `orderedPetPhotos` | Function | `src/pet/pet.mapper.ts` | 37 |
| `validatePhotos` | Method | `src/pet/pet.service.ts` | 39 |
| `requirePetType` | Method | `src/pet/pet.service.ts` | 58 |
| `generateTagId` | Method | `src/pet/pet.service.ts` | 76 |
| `createPet` | Method | `src/pet/pet.service.ts` | 104 |
| `updatePet` | Method | `src/pet/pet.service.ts` | 196 |
| `syncAlertSnapshots` | Method | `src/pet/pet.service.ts` | 265 |
| `update` | Method | `src/pet/pet.controller.ts` | 196 |
| `findAllByUser` | Method | `src/pet/pet.service.ts` | 144 |
| `localize` | Method | `src/pet/pet.controller.ts` | 76 |
| `create` | Method | `src/pet/pet.controller.ts` | 103 |
| `findAll` | Method | `src/pet/pet.controller.ts` | 123 |
| `findByTagId` | Method | `src/pet/pet.controller.ts` | 173 |
| `markAsMissing` | Method | `src/pet/pet.controller.ts` | 283 |
| `markAsFound` | Method | `src/pet/pet.controller.ts` | 308 |
| `findOne` | Method | `src/pet/pet.service.ts` | 156 |
| `deletePet` | Method | `src/pet/pet.service.ts` | 291 |
| `markAsMissing` | Method | `src/pet/pet.service.ts` | 310 |
| `markAsFound` | Method | `src/pet/pet.service.ts` | 331 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `UploadPhotos → PickTranslation` | cross_community | 6 |
| `UploadPhotos → GetActive` | cross_community | 6 |
| `Create → PickTranslation` | cross_community | 5 |
| `Create → GetActive` | cross_community | 5 |
| `Update → PickTranslation` | cross_community | 5 |
| `Update → GetActive` | cross_community | 5 |
| `Update → OrderedPetPhotos` | intra_community | 5 |
| `MarkAsMissing → PickTranslation` | cross_community | 5 |
| `MarkAsMissing → GetActive` | cross_community | 5 |
| `MarkAsFound → PickTranslation` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Adoption | 1 calls |
| Pet-types | 1 calls |

## How to Explore

1. `gitnexus_context({name: "run"})` — see callers and callees
2. `gitnexus_query({query: "pet"})` — find related execution flows
3. Read key files listed above for implementation details
