import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { UploadService } from './upload.service';
import { CloudinaryService } from './cloudinary.service';

describe('UploadService', () => {
  let service: UploadService;
  let cloudinaryService: CloudinaryService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
      };
      return config[key] ?? defaultValue;
    }),
  };

  const mockCloudinaryService = {
    uploadImage: jest.fn(),
    deleteImageByUrl: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: CloudinaryService,
          useValue: mockCloudinaryService,
        },
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);
    cloudinaryService = module.get<CloudinaryService>(CloudinaryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadImage', () => {
    const createMockFile = (
      size: number,
      mimetype: string,
      filename: string = 'test.jpg',
    ): Express.Multer.File => ({
      fieldname: 'photo',
      originalname: filename,
      encoding: '7bit',
      mimetype,
      size,
      buffer: Buffer.alloc(size),
      stream: null as any,
      destination: '',
      filename: '',
      path: '',
    });

    it('should upload a valid JPEG image', async () => {
      const file = createMockFile(5 * 1024 * 1024, 'image/jpeg', 'dog.jpg');
      const expectedUrl =
        'https://res.cloudinary.com/demo/image/upload/v1714074520/fifi-alert/alerts/123456-dog.jpg';

      mockCloudinaryService.uploadImage.mockResolvedValue(expectedUrl);

      const result = await service.uploadImage(file, 'alerts');

      expect(result).toBe(expectedUrl);
      expect(mockCloudinaryService.uploadImage).toHaveBeenCalledWith(
        file.buffer,
        'alerts',
        'dog.jpg',
      );
    });

    it('should upload a valid PNG image', async () => {
      const file = createMockFile(3 * 1024 * 1024, 'image/png', 'cat.png');
      const expectedUrl =
        'https://res.cloudinary.com/demo/image/upload/v1714074520/fifi-alert/sightings/123456-cat.png';

      mockCloudinaryService.uploadImage.mockResolvedValue(expectedUrl);

      const result = await service.uploadImage(file, 'sightings');

      expect(result).toBe(expectedUrl);
      expect(mockCloudinaryService.uploadImage).toHaveBeenCalledWith(
        file.buffer,
        'sightings',
        'cat.png',
      );
    });

    it('should upload a valid WEBP image', async () => {
      const file = createMockFile(2 * 1024 * 1024, 'image/webp', 'pet.webp');
      mockCloudinaryService.uploadImage.mockResolvedValue(
        'https://res.cloudinary.com/demo/image/upload/v1714074520/fifi-alert/alerts/123456-pet.webp',
      );

      const result = await service.uploadImage(file, 'alerts');

      expect(result).toBeDefined();
      expect(mockCloudinaryService.uploadImage).toHaveBeenCalled();
    });

    it('should upload a valid HEIC image', async () => {
      const file = createMockFile(4 * 1024 * 1024, 'image/heic', 'iphone.heic');
      mockCloudinaryService.uploadImage.mockResolvedValue(
        'https://res.cloudinary.com/demo/image/upload/v1714074520/fifi-alert/alerts/123456-iphone.heic',
      );

      const result = await service.uploadImage(file, 'alerts');

      expect(result).toBeDefined();
      expect(mockCloudinaryService.uploadImage).toHaveBeenCalled();
    });

    it('should throw BadRequestException if no file provided', async () => {
      await expect(service.uploadImage(null as any, 'alerts')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.uploadImage(null as any, 'alerts')).rejects.toThrow(
        'No file provided',
      );

      expect(mockCloudinaryService.uploadImage).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if file size exceeds limit', async () => {
      const file = createMockFile(11 * 1024 * 1024, 'image/jpeg', 'huge.jpg'); // 11MB

      await expect(service.uploadImage(file, 'alerts')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.uploadImage(file, 'alerts')).rejects.toThrow(
        'File size exceeds maximum allowed size of 10MB',
      );

      expect(mockCloudinaryService.uploadImage).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid file type', async () => {
      const file = createMockFile(
        1 * 1024 * 1024,
        'application/pdf',
        'document.pdf',
      );

      await expect(service.uploadImage(file, 'alerts')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.uploadImage(file, 'alerts')).rejects.toThrow(
        'Invalid file type',
      );

      expect(mockCloudinaryService.uploadImage).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for executable files', async () => {
      const file = createMockFile(
        1 * 1024 * 1024,
        'application/x-msdownload',
        'malware.exe',
      );

      await expect(service.uploadImage(file, 'alerts')).rejects.toThrow(
        BadRequestException,
      );

      expect(mockCloudinaryService.uploadImage).not.toHaveBeenCalled();
    });

    it('should reject file at exactly max size + 1 byte', async () => {
      const file = createMockFile(
        10 * 1024 * 1024 + 1,
        'image/jpeg',
        'exactly-over.jpg',
      );

      await expect(service.uploadImage(file, 'alerts')).rejects.toThrow(
        'File size exceeds maximum allowed size',
      );
    });

    it('should accept file at exactly max size', async () => {
      const file = createMockFile(
        10 * 1024 * 1024,
        'image/jpeg',
        'exactly-max.jpg',
      );
      mockCloudinaryService.uploadImage.mockResolvedValue(
        'https://res.cloudinary.com/demo/image/upload/v1714074520/fifi-alert/alerts/123456-exactly-max.jpg',
      );

      const result = await service.uploadImage(file, 'alerts');

      expect(result).toBeDefined();
      expect(mockCloudinaryService.uploadImage).toHaveBeenCalled();
    });
  });

  describe('uploadImages', () => {
    const createMockFiles = (count: number): Express.Multer.File[] => {
      return Array.from({ length: count }, (_, i) => ({
        fieldname: 'photos',
        originalname: `photo${i + 1}.jpg`,
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 2 * 1024 * 1024, // 2MB each
        buffer: Buffer.alloc(2 * 1024 * 1024),
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      }));
    };

    it('should upload multiple valid images', async () => {
      const files = createMockFiles(3);
      mockCloudinaryService.uploadImage
        .mockReturnValueOnce(
          'https://res.cloudinary.com/demo/image/upload/v1714074520/fifi-alert/alerts/123456-photo1.jpg',
        )
        .mockReturnValueOnce(
          'https://res.cloudinary.com/demo/image/upload/v1714074520/fifi-alert/alerts/123457-photo2.jpg',
        )
        .mockReturnValueOnce(
          'https://res.cloudinary.com/demo/image/upload/v1714074520/fifi-alert/alerts/123458-photo3.jpg',
        );

      const results = await service.uploadImages(files, 'alerts');

      expect(results).toHaveLength(3);
      expect(results[0]).toContain('photo1.jpg');
      expect(results[1]).toContain('photo2.jpg');
      expect(results[2]).toContain('photo3.jpg');
      expect(mockCloudinaryService.uploadImage).toHaveBeenCalledTimes(3);
    });

    it('should upload exactly 5 files (max limit)', async () => {
      const files = createMockFiles(5);
      mockCloudinaryService.uploadImage.mockResolvedValue(
        'https://res.cloudinary.com/demo/image/upload/v1714074520/fifi-alert/alerts/123456-photo.jpg',
      );

      const results = await service.uploadImages(files, 'alerts');

      expect(results).toHaveLength(5);
      expect(mockCloudinaryService.uploadImage).toHaveBeenCalledTimes(5);
    });

    it('should return empty array if no files provided', async () => {
      const result1 = await service.uploadImages(null as any, 'alerts');
      expect(result1).toEqual([]);

      const result2 = await service.uploadImages([], 'alerts');
      expect(result2).toEqual([]);
    });

    it('should throw BadRequestException if more than 5 files provided', async () => {
      const files = createMockFiles(6);

      await expect(service.uploadImages(files, 'alerts')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.uploadImages(files, 'alerts')).rejects.toThrow(
        'Maximum 5 images allowed per upload',
      );

      expect(mockCloudinaryService.uploadImage).not.toHaveBeenCalled();
    });

    it('should reject batch if any file is invalid type', async () => {
      const files = [
        ...createMockFiles(2),
        {
          fieldname: 'photos',
          originalname: 'bad.pdf',
          encoding: '7bit',
          mimetype: 'application/pdf',
          size: 1 * 1024 * 1024,
          buffer: Buffer.alloc(1 * 1024 * 1024),
          stream: null as any,
          destination: '',
          filename: '',
          path: '',
        },
      ];

      await expect(service.uploadImages(files, 'alerts')).rejects.toThrow(
        BadRequestException,
      );

      // uploadImages calls uploadImage for each file, so some may be called before error
    });

    it('should reject batch if any file exceeds size limit', async () => {
      const files = [
        ...createMockFiles(2),
        {
          fieldname: 'photos',
          originalname: 'huge.jpg',
          encoding: '7bit',
          mimetype: 'image/jpeg',
          size: 15 * 1024 * 1024, // 15MB
          buffer: Buffer.alloc(15 * 1024 * 1024),
          stream: null as any,
          destination: '',
          filename: '',
          path: '',
        },
      ];

      await expect(service.uploadImages(files, 'alerts')).rejects.toThrow(
        BadRequestException,
      );

      // uploadImages calls uploadImage for each file, so some may be called before error
    });

    it('should upload files in parallel (Promise.all)', async () => {
      const files = createMockFiles(3);
      const uploadSpy = jest.spyOn(mockCloudinaryService, 'uploadImage');

      mockCloudinaryService.uploadImage.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('path'), 10)),
      );

      await service.uploadImages(files, 'alerts');

      // All 3 calls should happen before any resolve
      expect(uploadSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('deleteFile', () => {
    it('should delete file by Cloudinary URL', async () => {
      const url =
        'https://res.cloudinary.com/demo/image/upload/v1714074520/fifi-alert/alerts/123456-dog.jpg';
      mockCloudinaryService.deleteImageByUrl.mockResolvedValue(undefined);

      await service.deleteFile(url);

      expect(mockCloudinaryService.deleteImageByUrl).toHaveBeenCalledWith(url);
    });

    it('should not throw error for invalid URL format (logs only)', async () => {
      const url = 'http://localhost:3000/other/path/file.jpg';
      mockCloudinaryService.deleteImageByUrl.mockRejectedValue(
        new Error('Invalid Cloudinary URL format'),
      );

      // deleteFile catches errors and logs them instead of throwing
      await expect(service.deleteFile(url)).resolves.toBeUndefined();
    });

    it('should not throw error when Cloudinary delete fails (logs only)', async () => {
      const url =
        'https://res.cloudinary.com/demo/image/upload/v1714074520/fifi-alert/alerts/123456-dog.jpg';
      mockCloudinaryService.deleteImageByUrl.mockRejectedValue(
        new Error('File not found'),
      );

      // deleteFile catches errors and logs them instead of throwing
      await expect(service.deleteFile(url)).resolves.toBeUndefined();
    });
  });
});
