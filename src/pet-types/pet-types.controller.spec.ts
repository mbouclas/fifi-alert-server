import { Test, TestingModule } from '@nestjs/testing';
import { PetTypesController } from './pet-types.controller';
import { PetTypesService } from './pet-types.service';

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
    }).compile();

    controller = module.get<PetTypesController>(PetTypesController);
    service = module.get<PetTypesService>(PetTypesService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create a pet type', async () => {
    const dto = { name: 'Dog', slug: 'dog' };
    const created = { id: 1, ...dto };
    mockPetTypesService.create.mockResolvedValue(created);

    await expect(controller.create(dto)).resolves.toEqual(created);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('should list pet types', async () => {
    const petTypes = [{ id: 1, name: 'Dog', slug: 'dog' }];
    mockPetTypesService.findAll.mockResolvedValue(petTypes);

    await expect(controller.findAll()).resolves.toEqual(petTypes);
    expect(service.findAll).toHaveBeenCalled();
  });

  it('should get pet type by id', async () => {
    const petType = { id: 1, name: 'Dog', slug: 'dog' };
    mockPetTypesService.findOne.mockResolvedValue(petType);

    await expect(controller.findOne(1)).resolves.toEqual(petType);
    expect(service.findOne).toHaveBeenCalledWith(1);
  });

  it('should get pet type by slug', async () => {
    const petType = { id: 1, name: 'Dog', slug: 'dog' };
    mockPetTypesService.findBySlug.mockResolvedValue(petType);

    await expect(controller.findBySlug('dog')).resolves.toEqual(petType);
    expect(service.findBySlug).toHaveBeenCalledWith('dog');
  });

  it('should update a pet type', async () => {
    const updated = { id: 1, name: 'Dog', slug: 'dog' };
    mockPetTypesService.update.mockResolvedValue(updated);

    await expect(controller.update(1, { name: 'Dog' })).resolves.toEqual(updated);
    expect(service.update).toHaveBeenCalledWith(1, { name: 'Dog' });
  });

  it('should delete a pet type', async () => {
    mockPetTypesService.remove.mockResolvedValue(undefined);

    await expect(controller.remove(1)).resolves.toBeUndefined();
    expect(service.remove).toHaveBeenCalledWith(1);
  });
});
