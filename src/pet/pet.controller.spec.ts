import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PetController } from './pet.controller';
import { PetService } from './pet.service';
import { UploadService } from '../upload/upload.service';
import { BearerTokenGuard } from '../auth/guards/bearer-token.guard';

describe('PetController', () => {
  let controller: PetController;

  const mockPetService = {
    findOne: jest.fn(),
  };

  const mockUploadService = {
    uploadImages: jest.fn(),
  };

  const createMockFile = (filename: string): Express.Multer.File => ({
    fieldname: 'photos',
    originalname: filename,
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: 1024,
    buffer: Buffer.from('test-image'),
    stream: null as any,
    destination: '',
    filename: '',
    path: '',
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PetController],
      providers: [
        {
          provide: PetService,
          useValue: mockPetService,
        },
        {
          provide: UploadService,
          useValue: mockUploadService,
        },
      ],
    })
      .overrideGuard(BearerTokenGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<PetController>(PetController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('uploadPhotos', () => {
    it('should verify ownership, upload files under the pet folder, and return URLs', async () => {
      const petId = 123;
      const userId = 456;
      const files = [createMockFile('buddy.jpg'), createMockFile('side.jpg')];
      const photoUrls = [
        'https://res.cloudinary.com/demo/image/upload/v1714074520/fifi-alert/pets/123/buddy.jpg',
        'https://res.cloudinary.com/demo/image/upload/v1714074521/fifi-alert/pets/123/side.jpg',
      ];

      mockPetService.findOne.mockResolvedValue({ id: petId, userId });
      mockUploadService.uploadImages.mockResolvedValue(photoUrls);

      const result = await controller.uploadPhotos(petId, { userId }, files);

      expect(mockPetService.findOne).toHaveBeenCalledWith(petId, userId);
      expect(mockUploadService.uploadImages).toHaveBeenCalledWith(
        files,
        'pets/123',
      );
      expect(result).toEqual({ photoUrls });
    });

    it('should not upload files when the authenticated user does not own the pet', async () => {
      const error = new ForbiddenException(
        'You do not have permission to access this pet',
      );

      mockPetService.findOne.mockRejectedValue(error);

      await expect(
        controller.uploadPhotos(123, { userId: 999 }, [
          createMockFile('buddy.jpg'),
        ]),
      ).rejects.toThrow(ForbiddenException);

      expect(mockUploadService.uploadImages).not.toHaveBeenCalled();
    });

    it('should return 404 when uploading photos for a missing pet', async () => {
      mockPetService.findOne.mockRejectedValue(
        new NotFoundException('Pet with ID 123 not found'),
      );

      await expect(
        controller.uploadPhotos(123, { userId: 456 }, [
          createMockFile('buddy.jpg'),
        ]),
      ).rejects.toThrow(NotFoundException);

      expect(mockUploadService.uploadImages).not.toHaveBeenCalled();
    });
  });
});
