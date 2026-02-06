/**
 * File Upload Integration Tests
 * Task 7.9
 * 
 * Note: These are simplified integration tests focusing on upload functionality.
 * Full e2e tests would require complete app initialization with all dependencies.
 * 
 * For manual testing of complete flow:
 * 1. Start server: bun run start:dev
 * 2. Create alert: POST /alerts with bearer token
 * 3. Upload photo: POST /alerts/:id/photos with multipart/form-data
 * 4. Verify file at: http://localhost:3000/uploads/alerts/{filename}
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { UploadService } from '../src/upload/upload.service';
import { LocalStorageStrategy } from '../src/upload/local-storage.strategy';
import { ConfigService } from '@nestjs/config';

describe('File Upload Integration (simplified)', () => {
    let uploadService: UploadService;
    let storageStrategy: LocalStorageStrategy;
    const testUploadDir = path.join(__dirname, '..', 'uploads-test-integration');

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UploadService,
                LocalStorageStrategy,
                {
                    provide: ConfigService,
                    useValue: {
                        get: (key: string, defaultValue?: any) => {
                            const config: Record<string, any> = {
                                UPLOAD_DIR: testUploadDir,
                                API_BASE_URL: 'http://localhost:3000',
                                MAX_FILE_SIZE: 10 * 1024 * 1024,
                            };
                            return config[key] ?? defaultValue;
                        },
                    },
                },
            ],
        }).compile();

        uploadService = module.get<UploadService>(UploadService);
        storageStrategy = module.get<LocalStorageStrategy>(LocalStorageStrategy);

        // Ensure test directory exists
        if (!fs.existsSync(testUploadDir)) {
            fs.mkdirSync(testUploadDir, { recursive: true });
        }
    });

    afterAll(() => {
        // Cleanup test uploads
        if (fs.existsSync(testUploadDir)) {
            fs.rmSync(testUploadDir, { recursive: true, force: true });
        }
    });

    function createMockFile(
        size: number,
        mimetype: string,
        filename: string,
    ): Express.Multer.File {
        return {
            fieldname: 'photo',
            originalname: filename,
            encoding: '7bit',
            mimetype,
            size,
            buffer: Buffer.alloc(size, 0xff),
            stream: null as any,
            destination: '',
            filename: '',
            path: '',
        };
    }

    describe('End-to-end upload flow', () => {
        it('should complete full upload cycle: validate -> save -> retrieve URL', async () => {
            const file = createMockFile(500 * 1024, 'image/jpeg', 'integration-test.jpg');

            // Upload
            const url = await uploadService.uploadImage(file, 'alerts');

            // Verify URL format
            expect(url).toContain('http://localhost:3000/uploads/alerts/');
            expect(url).toContain('integration-test.jpg');

            // Verify file exists on disk
            const relativePath = url.split('/uploads/')[1];
            const filePath = path.join(testUploadDir, relativePath);
            expect(fs.existsSync(filePath)).toBe(true);

            // Verify file size matches
            const stats = fs.statSync(filePath);
            expect(stats.size).toBe(500 * 1024);

            // Verify file can be read
            const fileContent = fs.readFileSync(filePath);
            expect(fileContent.length).toBe(500 * 1024);
        });

        it('should handle multiple files in sequence', async () => {
            const files = [
                createMockFile(100 * 1024, 'image/jpeg', 'multi1.jpg'),
                createMockFile(200 * 1024, 'image/png', 'multi2.png'),
                createMockFile(150 * 1024, 'image/webp', 'multi3.webp'),
            ];

            const urls = await uploadService.uploadImages(files, 'alerts');

            expect(urls.length).toBe(3);

            // Verify all files exist
            for (const url of urls) {
                const relativePath = url.split('/uploads/')[1];
                const filePath = path.join(testUploadDir, relativePath);
                expect(fs.existsSync(filePath)).toBe(true);
            }
        });

        it('should create folder structure automatically', async () => {
            const file = createMockFile(50 * 1024, 'image/jpeg', 'folder-test.jpg');

            await uploadService.uploadImage(file, 'sightings');

            const sightingsFolder = path.join(testUploadDir, 'sightings');
            expect(fs.existsSync(sightingsFolder)).toBe(true);
            expect(fs.statSync(sightingsFolder).isDirectory()).toBe(true);
        });

        it('should handle filename sanitization', async () => {
            const file = createMockFile(
                50 * 1024,
                'image/jpeg',
                "my dog's photo #1 (test).jpg",
            );

            const url = await uploadService.uploadImage(file, 'alerts');

            // Filename should be sanitized (special chars replaced with _)
            expect(url).toMatch(/\/uploads\/alerts\/\d+-.*\.jpg$/);

            // File should still exist
            const relativePath = url.split('/uploads/')[1];
            const filePath = path.join(testUploadDir, relativePath);
            expect(fs.existsSync(filePath)).toBe(true);
        });

        it('should prevent file overwrites with timestamps', async () => {
            const file1 = createMockFile(50 * 1024, 'image/jpeg', 'same-name.jpg');
            const file2 = createMockFile(100 * 1024, 'image/jpeg', 'same-name.jpg');

            const url1 = await uploadService.uploadImage(file1, 'alerts');
            await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
            const url2 = await uploadService.uploadImage(file2, 'alerts');

            // URLs should be different (different timestamps)
            expect(url1).not.toBe(url2);

            // Both files should exist
            const path1 = url1.split('/uploads/')[1];
            const path2 = url2.split('/uploads/')[1];
            expect(fs.existsSync(path.join(testUploadDir, path1))).toBe(true);
            expect(fs.existsSync(path.join(testUploadDir, path2))).toBe(true);

            // File sizes should be different
            const stats1 = fs.statSync(path.join(testUploadDir, path1));
            const stats2 = fs.statSync(path.join(testUploadDir, path2));
            expect(stats1.size).toBe(50 * 1024);
            expect(stats2.size).toBe(100 * 1024);
        });

        it('should enforce file size limits (10MB)', async () => {
            const largeFile = createMockFile(11 * 1024 * 1024, 'image/jpeg', 'too-large.jpg');

            await expect(uploadService.uploadImage(largeFile, 'alerts')).rejects.toThrow(
                BadRequestException,
            );
            await expect(uploadService.uploadImage(largeFile, 'alerts')).rejects.toThrow(
                'File size exceeds',
            );
        });

        it('should enforce file type restrictions', async () => {
            const invalidFiles = [
                createMockFile(100 * 1024, 'application/pdf', 'document.pdf'),
                createMockFile(100 * 1024, 'text/plain', 'text.txt'),
                createMockFile(100 * 1024, 'application/zip', 'archive.zip'),
            ];

            for (const file of invalidFiles) {
                await expect(uploadService.uploadImage(file, 'alerts')).rejects.toThrow(
                    BadRequestException,
                );
            }
        });

        it('should accept all allowed image formats', async () => {
            const validFormats = [
                { mime: 'image/jpeg', ext: 'jpg' },
                { mime: 'image/jpg', ext: 'jpg' },
                { mime: 'image/png', ext: 'png' },
                { mime: 'image/webp', ext: 'webp' },
                { mime: 'image/heic', ext: 'heic' },
            ];

            for (const format of validFormats) {
                const file = createMockFile(100 * 1024, format.mime, `test.${format.ext}`);
                const url = await uploadService.uploadImage(file, 'alerts');
                expect(url).toContain(format.ext);
            }
        });
    });

    describe('File deletion', () => {
        it('should delete uploaded file', async () => {
            const file = createMockFile(50 * 1024, 'image/jpeg', 'to-delete.jpg');

            const url = await uploadService.uploadImage(file, 'alerts');
            const relativePath = url.split('/uploads/')[1];
            const filePath = path.join(testUploadDir, relativePath);

            // Verify file exists
            expect(fs.existsSync(filePath)).toBe(true);

            // Delete
            await uploadService.deleteFile(url);

            // Verify file is gone
            expect(fs.existsSync(filePath)).toBe(false);
        });

        it('should handle deleting non-existent file gracefully', async () => {
            const fakeUrl = 'http://localhost:3000/uploads/alerts/non-existent.jpg';

            // Should not throw error
            await expect(uploadService.deleteFile(fakeUrl)).resolves.not.toThrow();
        });
    });
});

/**
 * Manual Testing Guide:
 * 
 * 1. Start the server:
 *    bun run start:dev
 * 
 * 2. Get auth token (create user or use existing):
 *    POST http://localhost:3000/auth/register
 *    Body: { "email": "test@test.com", "password": "password123", "name": "Test User" }
 * 
 * 3. Create an alert:
 *    POST http://localhost:3000/alerts
 *    Headers: Authorization: Bearer <token>
 *    Body: { pet: {...}, location: {...}, contact: {...} }
 * 
 * 4. Upload photos to alert:
 *    POST http://localhost:3000/alerts/:id/photos
 *    Headers: Authorization: Bearer <token>, Content-Type: multipart/form-data
 *    Form data: photos (file field, can select multiple files up to 5)
 * 
 * 5. Verify uploaded file:
 *    GET http://localhost:3000/uploads/alerts/{filename}
 *    Should return the image file
 * 
 * 6. Create sighting and upload photo:
 *    POST http://localhost:3000/sightings
 *    POST http://localhost:3000/sightings/:id/photo
 *    Form data: photo (single file)
 * 
 * Test cases to verify manually:
 * - Upload JPEG, PNG, WEBP, HEIC files
 * - Try uploading PDF (should fail with 400)
 * - Try uploading file > 10MB (should fail with 400)
 * - Try uploading more than 5 files to alert (should fail with 400)
 * - Verify files are accessible via /uploads/ route
 * - Verify photo URLs are saved in database (GET /alerts/:id)
 */
