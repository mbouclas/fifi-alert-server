import { Test, TestingModule } from '@nestjs/testing';
import { PetTypesController } from './pet-types.controller';
import { PetTypesService } from './pet-types.service';
import { MIN_USER_LEVEL_KEY } from '../auth/decorators/min-user-level.decorator';
import { BearerTokenGuard } from '../auth/guards/bearer-token.guard';
import { MinUserLevelGuard } from '../auth/guards/min-user-level.guard';

describe('PetTypesController', () => {
  let controller: PetTypesController;
  let service: PetTypesService;

  const mockPetTypesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    findBySlug: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PetTypesController],
      providers: [
        {
          provide: PetTypesService,
          useValue: mockPetTypesService,
        },
      ],
    })
      .overrideGuard(BearerTokenGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(MinUserLevelGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<PetTypesController>(PetTypesController);
    service = module.get<PetTypesService>(PetTypesService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create a pet type', async () => {
    const dto = { name: 'Dog', slug: 'dog', order: 10 };
    const created = { id: 1, ...dto };
    mockPetTypesService.create.mockResolvedValue(created);

    await expect(controller.create(dto)).resolves.toEqual(created);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('should list pet types', async () => {
    const petTypes = [{ id: 1, name: 'Dog', slug: 'dog', order: 10 }];
    const query = { orderBy: 'order' as const, orderDir: 'asc' as const };
    mockPetTypesService.findAll.mockResolvedValue(petTypes);

    await expect(controller.findAll(query)).resolves.toEqual(petTypes);
    expect(service.findAll).toHaveBeenCalledWith('order', 'asc');
  });

  it('should allow regular authenticated users to list pet types', () => {
    expect(
      Reflect.getMetadata(
        MIN_USER_LEVEL_KEY,
        PetTypesController.prototype.findAll,
      ),
    ).toBe(100);
  });

  it('should get pet type by id', async () => {
    const petType = { id: 1, name: 'Dog', slug: 'dog' };
    mockPetTypesService.findOne.mockResolvedValue(petType);

    await expect(controller.findOne(1)).resolves.toEqual(petType);
    expect(service.findOne).toHaveBeenCalledWith(1);
  });

  it('should allow regular authenticated users to get pet types by id', () => {
    expect(
      Reflect.getMetadata(
        MIN_USER_LEVEL_KEY,
        PetTypesController.prototype.findOne,
      ),
    ).toBe(100);
  });

  it('should get pet type by slug', async () => {
    const petType = { id: 1, name: 'Dog', slug: 'dog' };
    mockPetTypesService.findBySlug.mockResolvedValue(petType);

    await expect(controller.findBySlug('dog')).resolves.toEqual(petType);
    expect(service.findBySlug).toHaveBeenCalledWith('dog');
  });

  it('should allow regular authenticated users to get pet types by slug', () => {
    expect(
      Reflect.getMetadata(
        MIN_USER_LEVEL_KEY,
        PetTypesController.prototype.findBySlug,
      ),
    ).toBe(100);
  });

  it('should update a pet type', async () => {
    const updated = { id: 1, name: 'Dog', slug: 'dog' };
    mockPetTypesService.update.mockResolvedValue(updated);

    await expect(controller.update(1, { name: 'Dog' })).resolves.toEqual(
      updated,
    );
    expect(service.update).toHaveBeenCalledWith(1, { name: 'Dog' });
  });

  it('should delete a pet type', async () => {
    mockPetTypesService.remove.mockResolvedValue(undefined);

    await expect(controller.remove(1)).resolves.toBeUndefined();
    expect(service.remove).toHaveBeenCalledWith(1);
  });
});
