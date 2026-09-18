import { Test, TestingModule } from '@nestjs/testing';
import { PetTypesController } from './pet-types.controller';
import { PetTypesService } from './pet-types.service';
import { MIN_USER_LEVEL_KEY } from '../auth/decorators/min-user-level.decorator';
import { BearerTokenGuard } from '../auth/guards/bearer-token.guard';
import { MinUserLevelGuard } from '../auth/guards/min-user-level.guard';
import { LanguageService } from '../i18n/language.service';
import { ResolveLangPipe } from '../i18n/pipes/resolve-lang.pipe';
import { PetTypeOrderBy, SortDirection } from './dto';

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

  const mockLanguageService = {
    resolve: jest.fn().mockResolvedValue('el'),
    getDefaultCode: jest.fn().mockResolvedValue('el'),
  };

  const admin = { id: 1, roles: [{ id: 1, slug: 'super-admin', level: 5 }] } as any;
  const regular = { id: 2, roles: [{ id: 2, slug: 'user', level: 100 }] } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PetTypesController],
      providers: [
        { provide: PetTypesService, useValue: mockPetTypesService },
        { provide: LanguageService, useValue: mockLanguageService },
        ResolveLangPipe,
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
    const dto = { translations: { el: 'Σκύλος', en: 'Dog' }, slug: 'dog', order: 10 };
    const created = { id: 1, slug: 'dog', order: 10, name: 'Σκύλος', lang: 'el' };
    mockPetTypesService.create.mockResolvedValue(created);

    await expect(controller.create(dto, 'el')).resolves.toEqual(created);
    expect(service.create).toHaveBeenCalledWith(dto, { lang: 'el' });
  });

  it('should list pet types in the resolved language', async () => {
    const petTypes = [{ id: 1, name: 'Dog', lang: 'en', slug: 'dog', order: 10 }];
    const query = { orderBy: PetTypeOrderBy.ORDER, orderDir: SortDirection.ASC };
    mockPetTypesService.findAll.mockResolvedValue(petTypes);

    await expect(controller.findAll(query, 'en', regular)).resolves.toEqual(petTypes);
    expect(service.findAll).toHaveBeenCalledWith('order', 'asc', {
      lang: 'en',
      includeTranslations: false,
    });
  });

  it('should include all translations for administrators', async () => {
    mockPetTypesService.findAll.mockResolvedValue([]);

    await controller.findAll({}, 'el', admin);

    expect(service.findAll).toHaveBeenCalledWith(undefined, undefined, {
      lang: 'el',
      includeTranslations: true,
    });
  });

  it('should allow regular authenticated users to list pet types', () => {
    expect(
      Reflect.getMetadata(MIN_USER_LEVEL_KEY, PetTypesController.prototype.findAll),
    ).toBe(100);
  });

  it('should get pet type by id', async () => {
    const petType = { id: 1, name: 'Σκύλος', lang: 'el', slug: 'dog' };
    mockPetTypesService.findOne.mockResolvedValue(petType);

    await expect(controller.findOne(1, 'el', regular)).resolves.toEqual(petType);
    expect(service.findOne).toHaveBeenCalledWith(1, {
      lang: 'el',
      includeTranslations: false,
    });
  });

  it('should allow regular authenticated users to get pet types by id', () => {
    expect(
      Reflect.getMetadata(MIN_USER_LEVEL_KEY, PetTypesController.prototype.findOne),
    ).toBe(100);
  });

  it('should get pet type by slug', async () => {
    const petType = { id: 1, name: 'Dog', lang: 'en', slug: 'dog' };
    mockPetTypesService.findBySlug.mockResolvedValue(petType);

    await expect(controller.findBySlug('dog', 'en', admin)).resolves.toEqual(petType);
    expect(service.findBySlug).toHaveBeenCalledWith('dog', {
      lang: 'en',
      includeTranslations: true,
    });
  });

  it('should allow regular authenticated users to get pet types by slug', () => {
    expect(
      Reflect.getMetadata(MIN_USER_LEVEL_KEY, PetTypesController.prototype.findBySlug),
    ).toBe(100);
  });

  it('should update a pet type', async () => {
    const dto = { translations: { en: 'Doggo' } };
    const updated = { id: 1, name: 'Σκύλος', lang: 'el', slug: 'dog' };
    mockPetTypesService.update.mockResolvedValue(updated);

    await expect(controller.update(1, dto, 'el')).resolves.toEqual(updated);
    expect(service.update).toHaveBeenCalledWith(1, dto, { lang: 'el' });
  });

  it('should delete a pet type', async () => {
    mockPetTypesService.remove.mockResolvedValue(undefined);

    await expect(controller.remove(1)).resolves.toBeUndefined();
    expect(service.remove).toHaveBeenCalledWith(1);
  });
});
