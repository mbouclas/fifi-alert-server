---
name: upload
description: "Skill for the Upload area of fifi-alert-server. 21 symbols across 8 files."
---

# Upload

21 symbols | 8 files | Cohesion: 95%

## When to Use

- Working with code in `src/`
- Understanding how sniffImageType, getMaxPetPhotos, S3StorageStrategy work
- Modifying upload-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/upload/cloudinary.service.ts` | uploadImage, deleteImageByUrl, ensureConfigured, buildFolder, buildPublicId (+1) |
| `src/upload/local-storage.strategy.ts` | LocalStorageStrategy, constructor, ensureUploadDir, upload, sanitizeFilename |
| `src/upload/upload.service.ts` | resolveMimeType, uploadImage, uploadImages, deleteFile |
| `src/pet/pet.controller.ts` | findOne, uploadPhotos |
| `src/upload/image-type.ts` | sniffImageType |
| `src/config/pet.config.ts` | getMaxPetPhotos |
| `src/upload/storage.strategy.ts` | StorageStrategy |
| `src/upload/s3-storage.strategy.ts` | S3StorageStrategy |

## Entry Points

Start here when exploring this area:

- **`sniffImageType`** (Function) — `src/upload/image-type.ts:17`
- **`getMaxPetPhotos`** (Function) — `src/config/pet.config.ts:12`
- **`S3StorageStrategy`** (Class) — `src/upload/s3-storage.strategy.ts:41`
- **`LocalStorageStrategy`** (Class) — `src/upload/local-storage.strategy.ts:11`
- **`resolveMimeType`** (Method) — `src/upload/upload.service.ts:54`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `S3StorageStrategy` | Class | `src/upload/s3-storage.strategy.ts` | 41 |
| `LocalStorageStrategy` | Class | `src/upload/local-storage.strategy.ts` | 11 |
| `sniffImageType` | Function | `src/upload/image-type.ts` | 17 |
| `getMaxPetPhotos` | Function | `src/config/pet.config.ts` | 12 |
| `StorageStrategy` | Interface | `src/upload/storage.strategy.ts` | 4 |
| `resolveMimeType` | Method | `src/upload/upload.service.ts` | 54 |
| `uploadImage` | Method | `src/upload/upload.service.ts` | 69 |
| `uploadImages` | Method | `src/upload/upload.service.ts` | 114 |
| `findOne` | Method | `src/pet/pet.controller.ts` | 145 |
| `uploadPhotos` | Method | `src/pet/pet.controller.ts` | 228 |
| `deleteFile` | Method | `src/upload/upload.service.ts` | 141 |
| `uploadImage` | Method | `src/upload/cloudinary.service.ts` | 51 |
| `deleteImageByUrl` | Method | `src/upload/cloudinary.service.ts` | 117 |
| `ensureConfigured` | Method | `src/upload/cloudinary.service.ts` | 129 |
| `buildFolder` | Method | `src/upload/cloudinary.service.ts` | 141 |
| `buildPublicId` | Method | `src/upload/cloudinary.service.ts` | 150 |
| `extractPublicId` | Method | `src/upload/cloudinary.service.ts` | 161 |
| `constructor` | Method | `src/upload/local-storage.strategy.ts` | 16 |
| `ensureUploadDir` | Method | `src/upload/local-storage.strategy.ts` | 99 |
| `upload` | Method | `src/upload/local-storage.strategy.ts` | 34 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `UploadPhotos → PickTranslation` | cross_community | 6 |
| `UploadPhotos → GetActive` | cross_community | 6 |
| `UploadPhotos → SniffImageType` | cross_community | 5 |
| `UploadPhotos → SniffImageType` | intra_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Pet | 1 calls |

## How to Explore

1. `gitnexus_context({name: "sniffImageType"})` — see callers and callees
2. `gitnexus_query({query: "upload"})` — find related execution flows
3. Read key files listed above for implementation details
