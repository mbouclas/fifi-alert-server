# Cloudinary Uploads

## Purpose

Image uploads are stored in Cloudinary through the shared `UploadService`. Controllers and services should keep using `UploadService.uploadImage()` or `UploadService.uploadImages()` so validation, folder selection, and URL handling stay consistent across modules.

## Configuration

Set the Cloudinary connection values in `.env`:

```dotenv
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_SECRET=your-cloudinary-api-secret
CLOUDINARY_FOLDER=fifi-alert
```

`CLOUDINARY_FOLDER` is the top-level destination folder. Domain-specific folders are appended by callers.

## Upload Paths

The shared service stores images under:

```text
{CLOUDINARY_FOLDER}/{domain-folder}
```

Examples:

```text
fifi-alert/alerts
fifi-alert/sightings
fifi-alert/pets/{petId}
```

`POST /pets/{id}/photos` uploads to `fifi-alert/pets/{id}` and returns Cloudinary `secure_url` values in `photoUrls`.

## Dependencies

- `cloudinary` Node.js SDK
- NestJS `ConfigService`
- `UploadModule`, which exports both `UploadService` and `CloudinaryService`

## Example

```typescript
const photoUrls = await this.uploadService.uploadImages(files, `pets/${petId}`);
```

The returned values are HTTPS Cloudinary delivery URLs and can be stored in pet, alert, or sighting photo URL fields.
