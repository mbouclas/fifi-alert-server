---
name: pet
description: "Skill for the Pet area of fifi-alert-server. 10 symbols across 2 files."
---

# Pet

10 symbols | 2 files | Cohesion: 89%

## When to Use

- Working with code in `src/`
- Understanding how requirePetType, generateTagId, createPet work
- Modifying pet-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/pet/pet.service.ts` | requirePetType, generateTagId, createPet, updatePet, findOne (+3) |
| `src/pet/pet.controller.ts` | findOne, uploadPhotos |

## Entry Points

Start here when exploring this area:

- **`requirePetType`** (Method) — `src/pet/pet.service.ts:29`
- **`generateTagId`** (Method) — `src/pet/pet.service.ts:47`
- **`createPet`** (Method) — `src/pet/pet.service.ts:75`
- **`updatePet`** (Method) — `src/pet/pet.service.ts:163`
- **`findOne`** (Method) — `src/pet/pet.service.ts:123`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `requirePetType` | Method | `src/pet/pet.service.ts` | 29 |
| `generateTagId` | Method | `src/pet/pet.service.ts` | 47 |
| `createPet` | Method | `src/pet/pet.service.ts` | 75 |
| `updatePet` | Method | `src/pet/pet.service.ts` | 163 |
| `findOne` | Method | `src/pet/pet.service.ts` | 123 |
| `deletePet` | Method | `src/pet/pet.service.ts` | 202 |
| `markAsMissing` | Method | `src/pet/pet.service.ts` | 221 |
| `markAsFound` | Method | `src/pet/pet.service.ts` | 242 |
| `findOne` | Method | `src/pet/pet.controller.ts` | 103 |
| `uploadPhotos` | Method | `src/pet/pet.controller.ts` | 178 |

## How to Explore

1. `gitnexus_context({name: "requirePetType"})` — see callers and callees
2. `gitnexus_query({query: "pet"})` — find related execution flows
3. Read key files listed above for implementation details
