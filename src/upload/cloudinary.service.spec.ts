import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryService } from './cloudinary.service';

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: jest.fn(),
      destroy: jest.fn(),
    },
  },
}));

describe('CloudinaryService', () => {
  let service: CloudinaryService;

  const defaultConfig: Record<string, string> = {
    CLOUDINARY_CLOUD_NAME: 'test-cloud',
    CLOUDINARY_API_KEY: 'test-key',
    CLOUDINARY_SECRET: 'test-secret',
    CLOUDINARY_FOLDER: 'fifi-alert',
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfigService.get.mockImplementation(
      (key: string, defaultValue?: string) =>
        defaultConfig[key] ?? defaultValue,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CloudinaryService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<CloudinaryService>(CloudinaryService);
  });

  it('should configure Cloudinary from CLOUDINARY_ environment values', () => {
    expect(cloudinary.config).toHaveBeenCalledWith({
      cloud_name: 'test-cloud',
      api_key: 'test-key',
      api_secret: 'test-secret',
      secure: true,
    });
  });

  it('should upload a buffer to the configured Cloudinary folder and return secure_url', async () => {
    const secureUrl =
      'https://res.cloudinary.com/test-cloud/image/upload/v1714074520/fifi-alert/pets/123/buddy.jpg';
    const uploadStream = { end: jest.fn() };

    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
      (options, callback) => {
        uploadStream.end.mockImplementation(() => {
          callback(undefined, {
            public_id: 'fifi-alert/pets/123/buddy',
            secure_url: secureUrl,
          });
        });

        return uploadStream;
      },
    );

    const result = await service.uploadImage(
      Buffer.from('image'),
      'pets/123',
      'buddy.jpg',
    );

    expect(result).toBe(secureUrl);
    expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: 'fifi-alert/pets/123',
        resource_type: 'image',
        overwrite: false,
        unique_filename: true,
      }),
      expect.any(Function),
    );
    expect(uploadStream.end).toHaveBeenCalledWith(Buffer.from('image'));
  });

  it('should fail uploads when Cloudinary config is incomplete', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      const config: Record<string, string | undefined> = {
        CLOUDINARY_CLOUD_NAME: 'test-cloud',
        CLOUDINARY_API_KEY: 'test-key',
        CLOUDINARY_SECRET: undefined,
      };

      return config[key];
    });

    await expect(
      service.uploadImage(Buffer.from('image'), 'pets/123', 'buddy.jpg'),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('should delete a Cloudinary asset by extracting its public ID from a secure URL', async () => {
    (cloudinary.uploader.destroy as jest.Mock).mockResolvedValue({
      result: 'ok',
    });

    await service.deleteImageByUrl(
      'https://res.cloudinary.com/test-cloud/image/upload/v1714074520/fifi-alert/pets/123/buddy.jpg',
    );

    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
      'fifi-alert/pets/123/buddy',
      { resource_type: 'image' },
    );
  });
});
