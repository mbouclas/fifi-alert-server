import petConfig, {
  DEFAULT_MAX_PET_PHOTOS,
  getMaxPetPhotos,
} from './pet.config';

describe('pet.config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.MAX_PET_PHOTOS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getMaxPetPhotos', () => {
    it('returns the default when MAX_PET_PHOTOS is unset', () => {
      expect(getMaxPetPhotos()).toBe(DEFAULT_MAX_PET_PHOTOS);
    });

    it('returns the configured value', () => {
      process.env.MAX_PET_PHOTOS = '3';
      expect(getMaxPetPhotos()).toBe(3);
    });

    it.each(['0', '-2', 'abc', ''])(
      'falls back to the default for invalid value %p',
      (value) => {
        process.env.MAX_PET_PHOTOS = value;
        expect(getMaxPetPhotos()).toBe(DEFAULT_MAX_PET_PHOTOS);
      },
    );
  });

  describe('petConfig namespace', () => {
    it('exposes maxPhotos under the pet key', () => {
      process.env.MAX_PET_PHOTOS = '7';
      expect(petConfig.KEY).toBe('CONFIGURATION(pet)');
      expect(petConfig()).toEqual({ maxPhotos: 7 });
    });
  });
});
