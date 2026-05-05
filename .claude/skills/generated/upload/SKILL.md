---
name: upload
description: "Skill for the Upload area of fifi-alert-server. 15 symbols across 5 files."
---

# Upload

15 symbols | 5 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how S3StorageStrategy, LocalStorageStrategy, uploadImage work
- Modifying upload-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/upload/cloudinary.service.ts` | uploadImage, deleteImageByUrl, ensureConfigured, buildFolder, buildPublicId (+1) |
| `src/upload/local-storage.strategy.ts` | LocalStorageStrategy, constructor, ensureUploadDir, upload, sanitizeFilename |
| `src/upload/upload.service.ts` | uploadImage, uploadImages |
| `src/upload/storage.strategy.ts` | StorageStrategy |
| `src/upload/s3-storage.strategy.ts` | S3StorageStrategy |

## Entry Points

Start here when exploring this area:

- **`S3StorageStrategy`** (Class) — `src/upload/s3-storage.strategy.ts:41`
- **`LocalStorageStrategy`** (Class) — `src/upload/local-storage.strategy.ts:11`
- **`uploadImage`** (Method) — `src/upload/cloudinary.service.ts:34`
- **`deleteImageByUrl`** (Method) — `src/upload/cloudinary.service.ts:81`
- **`ensureConfigured`** (Method) — `src/upload/cloudinary.service.ts:93`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `S3StorageStrategy` | Class | `src/upload/s3-storage.strategy.ts` | 41 |
| `LocalStorageStrategy` | Class | `src/upload/local-storage.strategy.ts` | 11 |
| `StorageStrategy` | Interface | `src/upload/storage.strategy.ts` | 4 |
| `uploadImage` | Method | `src/upload/cloudinary.service.ts` | 34 |
| `deleteImageByUrl` | Method | `src/upload/cloudinary.service.ts` | 81 |
| `ensureConfigured` | Method | `src/upload/cloudinary.service.ts` | 93 |
| `buildFolder` | Method | `src/upload/cloudinary.service.ts` | 105 |
| `buildPublicId` | Method | `src/upload/cloudinary.service.ts` | 114 |
| `extractPublicId` | Method | `src/upload/cloudinary.service.ts` | 125 |
| `uploadImage` | Method | `src/upload/upload.service.ts` | 42 |
| `uploadImages` | Method | `src/upload/upload.service.ts` | 82 |
| `constructor` | Method | `src/upload/local-storage.strategy.ts` | 16 |
| `ensureUploadDir` | Method | `src/upload/local-storage.strategy.ts` | 99 |
| `upload` | Method | `src/upload/local-storage.strategy.ts` | 34 |
| `sanitizeFilename` | Method | `src/upload/local-storage.strategy.ts` | 110 |

## How to Explore

1. `gitnexus_context({name: "S3StorageStrategy"})` — see callers and callees
2. `gitnexus_query({query: "upload"})` — find related execution flows
3. Read key files listed above for implementation details
