import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserService, CreateUserDto } from './user.service';
import { PrismaService } from '@services/prisma.service';

// Mock the auth module
const mockSignUpEmail = jest.fn();
jest.mock('../auth', () => ({
  auth: {
    api: {
      signUpEmail: mockSignUpEmail,
    },
  },
}));

// Mock ConfigService
const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: any) => {
    const config: Record<string, any> = {
      'auth.password.minLength': 4,
      'auth.password.maxLength': 128,
    };
    return config[key] ?? defaultValue;
  }),
};

describe('UserService', () => {
  let service: UserService;
  let prismaService: jest.Mocked<PrismaService>;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    role: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    userRole: {
      createMany: jest.fn(),
    },
  };

  const mockUser = {
    id: 1,
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    emailVerified: false,
    image: null,
    name: 'John Doe',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRole = {
    id: 1,
    name: 'User',
    slug: 'user',
    level: 100,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAdminRole = {
    id: 2,
    name: 'Admin',
    slug: 'admin',
    level: 0,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    prismaService = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('store', () => {
    const validCreateUserDto: CreateUserDto = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      password: 'securePassword123',
      roles: [],
    };

    beforeEach(() => {
      // Setup default mock implementations
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.role.findFirst.mockResolvedValue(mockRole);
      mockPrismaService.role.findMany.mockResolvedValue([]);
      mockPrismaService.user.update.mockResolvedValue(mockUser);
      mockPrismaService.userRole.createMany.mockResolvedValue({ count: 1 });

      mockSignUpEmail.mockResolvedValue({
        user: { id: 1, email: 'john.doe@example.com', name: 'John Doe' },
        session: { id: 'session-123' },
      });

      // Mock final user fetch with roles
      mockPrismaService.user.findUnique.mockImplementation(
        ({ where, include }) => {
          if (include?.roles) {
            return Promise.resolve({
              ...mockUser,
              roles: [{ role: mockRole, user_id: 1, role_id: 1 }],
            });
          }
          return Promise.resolve(null);
        },
      );
    });

    describe('validation', () => {
      it('should throw BadRequestException when email is missing', async () => {
        const dto = { ...validCreateUserDto, email: '' };

        await expect(service.store(dto)).rejects.toThrow(BadRequestException);
        await expect(service.store(dto)).rejects.toThrow('Email is required');
      });

      it('should throw BadRequestException when email is whitespace only', async () => {
        const dto = { ...validCreateUserDto, email: '   ' };

        await expect(service.store(dto)).rejects.toThrow(BadRequestException);
        await expect(service.store(dto)).rejects.toThrow('Email is required');
      });

      it('should throw BadRequestException when email format is invalid', async () => {
        const dto = { ...validCreateUserDto, email: 'invalid-email' };

        await expect(service.store(dto)).rejects.toThrow(BadRequestException);
        await expect(service.store(dto)).rejects.toThrow('Invalid email format');
      });

      it('should throw BadRequestException when password is missing', async () => {
        const dto = { ...validCreateUserDto, password: '' };

        await expect(service.store(dto)).rejects.toThrow(BadRequestException);
        await expect(service.store(dto)).rejects.toThrow('Password is required');
      });

      it('should throw BadRequestException when password is too short', async () => {
        const dto = { ...validCreateUserDto, password: 'short' };

        await expect(service.store(dto)).rejects.toThrow(BadRequestException);
        await expect(service.store(dto)).rejects.toThrow(
          'Password must be at least 4 characters long',
        );
      });

      it('should throw BadRequestException when first name is missing', async () => {
        const dto = { ...validCreateUserDto, firstName: '' };

        await expect(service.store(dto)).rejects.toThrow(BadRequestException);
        await expect(service.store(dto)).rejects.toThrow(
          'First name is required',
        );
      });

      it('should throw BadRequestException when last name is missing', async () => {
        const dto = { ...validCreateUserDto, lastName: '' };

        await expect(service.store(dto)).rejects.toThrow(BadRequestException);
        await expect(service.store(dto)).rejects.toThrow(
          'Last name is required',
        );
      });
    });

    describe('user existence check', () => {
      it('should throw ConflictException when user already exists', async () => {
        // Override the mock implementation for this specific test
        mockPrismaService.user.findUnique.mockImplementation(
          ({ where, include }) => {
            // First call is for existence check (no include)
            // Return the existing user to trigger conflict
            if (!include) {
              return Promise.resolve(mockUser);
            }
            // Second call would be for fetching with roles (shouldn't reach here)
            return Promise.resolve({
              ...mockUser,
              roles: [{ role: mockRole, user_id: 1, role_id: 1 }],
            });
          },
        );

        await expect(service.store(validCreateUserDto)).rejects.toThrow(
          ConflictException,
        );
        await expect(service.store(validCreateUserDto)).rejects.toThrow(
          `A user with email "${validCreateUserDto.email}" already exists`,
        );
      });

      it('should normalize email to lowercase when checking existence', async () => {
        const dto = { ...validCreateUserDto, email: 'JOHN.DOE@EXAMPLE.COM' };

        await service.store(dto);

        expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
          where: { email: 'john.doe@example.com' },
        });
      });
    });

    describe('role assignment', () => {
      it('should assign default role when no roles provided', async () => {
        const dto = { ...validCreateUserDto, roles: [] };

        await service.store(dto);

        expect(mockPrismaService.role.findFirst).toHaveBeenCalledWith({
          where: { active: true },
          orderBy: { level: 'asc' },
        });
        expect(mockPrismaService.userRole.createMany).toHaveBeenCalledWith({
          data: [{ user_id: 1, role_id: mockRole.id }],
          skipDuplicates: true,
        });
      });

      it('should assign default role when roles array is undefined', async () => {
        const dto = { ...validCreateUserDto };
        delete dto.roles;

        await service.store(dto);

        expect(mockPrismaService.role.findFirst).toHaveBeenCalled();
      });

      it('should throw NotFoundException when no default role exists', async () => {
        mockPrismaService.role.findFirst.mockResolvedValue(null);

        await expect(service.store(validCreateUserDto)).rejects.toThrow(
          NotFoundException,
        );
        await expect(service.store(validCreateUserDto)).rejects.toThrow(
          'No active roles found in the system',
        );
      });

      it('should assign specified roles when provided', async () => {
        const dto = { ...validCreateUserDto, roles: ['admin', 'user'] };
        mockPrismaService.role.findMany.mockResolvedValue([
          mockRole,
          mockAdminRole,
        ]);

        await service.store(dto);

        expect(mockPrismaService.role.findMany).toHaveBeenCalledWith({
          where: {
            slug: { in: ['admin', 'user'] },
            active: true,
          },
        });
        expect(mockPrismaService.userRole.createMany).toHaveBeenCalledWith({
          data: expect.arrayContaining([
            { user_id: 1, role_id: mockRole.id },
            { user_id: 1, role_id: mockAdminRole.id },
          ]),
          skipDuplicates: true,
        });
      });

      it('should throw NotFoundException when specified roles do not exist', async () => {
        const dto = { ...validCreateUserDto, roles: ['admin', 'nonexistent'] };
        mockPrismaService.role.findMany.mockResolvedValue([mockAdminRole]);

        await expect(service.store(dto)).rejects.toThrow(NotFoundException);
        await expect(service.store(dto)).rejects.toThrow(
          'The following roles were not found: nonexistent',
        );
      });
    });

    describe('user creation', () => {
      it('should create user via Better Auth API', async () => {
        await service.store(validCreateUserDto);

        expect(mockSignUpEmail).toHaveBeenCalledWith({
          body: {
            email: 'john.doe@example.com',
            password: 'securePassword123',
            name: 'John Doe',
            image: undefined,
          },
        });
      });

      it('should update user with firstName and lastName after creation', async () => {
        await service.store(validCreateUserDto);

        expect(mockPrismaService.user.update).toHaveBeenCalledWith({
          where: { id: 1 },
          data: {
            firstName: 'John',
            lastName: 'Doe',
            emailVerified: false,
          },
        });
      });

      it('should set emailVerified to true when specified', async () => {
        const dto = { ...validCreateUserDto, emailVerified: true };

        await service.store(dto);

        expect(mockPrismaService.user.update).toHaveBeenCalledWith({
          where: { id: 1 },
          data: {
            firstName: 'John',
            lastName: 'Doe',
            emailVerified: true,
          },
        });
      });

      it('should include image in signup when provided', async () => {
        const dto = {
          ...validCreateUserDto,
          image: 'https://example.com/avatar.png',
        };

        await service.store(dto);

        expect(mockSignUpEmail).toHaveBeenCalledWith({
          body: expect.objectContaining({
            image: 'https://example.com/avatar.png',
          }),
        });
      });

      it('should throw BadRequestException when Better Auth fails', async () => {
        mockSignUpEmail.mockResolvedValue(null);

        await expect(service.store(validCreateUserDto)).rejects.toThrow(
          BadRequestException,
        );
        await expect(service.store(validCreateUserDto)).rejects.toThrow(
          'Failed to create user via Better Auth',
        );
      });

      it('should throw BadRequestException when Better Auth returns error', async () => {
        mockSignUpEmail.mockRejectedValue(
          new Error('Auth service unavailable'),
        );

        await expect(service.store(validCreateUserDto)).rejects.toThrow(
          BadRequestException,
        );
        await expect(service.store(validCreateUserDto)).rejects.toThrow(
          'Failed to create user: Auth service unavailable',
        );
      });

      it('should return the created user with roles', async () => {
        const result = await service.store(validCreateUserDto);

        expect(result).toMatchObject({
          email: 'john.doe@example.com',
          firstName: 'John',
          lastName: 'Doe',
          roles: expect.arrayContaining([
            expect.objectContaining({
              role: expect.objectContaining({ slug: 'user' }),
            }),
          ]),
        });
      });
    });

    describe('error handling', () => {
      it('should rethrow ConflictException without wrapping', async () => {
        mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);

        await expect(service.store(validCreateUserDto)).rejects.toBeInstanceOf(
          ConflictException,
        );
      });

      it('should rethrow BadRequestException without wrapping', async () => {
        const dto = { ...validCreateUserDto, email: '' };

        await expect(service.store(dto)).rejects.toBeInstanceOf(
          BadRequestException,
        );
      });

      it('should rethrow NotFoundException without wrapping', async () => {
        mockPrismaService.role.findFirst.mockResolvedValue(null);

        await expect(service.store(validCreateUserDto)).rejects.toBeInstanceOf(
          NotFoundException,
        );
      });
    });
  });

  describe('findOne', () => {
    beforeEach(() => {
      mockPrismaService.user.findUnique.mockReset();
    });

    it('should find a user by id without includes', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findOne({ id: 1 });

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(result).toEqual(mockUser);
    });

    it('should find a user by email without includes', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findOne({ email: 'john.doe@example.com' });

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'john.doe@example.com' },
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.findOne({ id: 999 });

      expect(result).toBeNull();
    });

    it('should include roles relationship with nested role when specified', async () => {
      const userWithRoles = {
        ...mockUser,
        roles: [{ user_id: 1, role_id: 1, role: mockRole }],
      };
      mockPrismaService.user.findUnique.mockResolvedValue(userWithRoles);

      const result = await service.findOne({ id: 1 }, ['roles']);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });
      expect(result).toEqual(userWithRoles);
    });

    it('should include sessions relationship when specified', async () => {
      const userWithSessions = {
        ...mockUser,
        sessions: [{ id: 'session-1', userId: 1 }],
      };
      mockPrismaService.user.findUnique.mockResolvedValue(userWithSessions);

      const result = await service.findOne({ id: 1 }, ['sessions']);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          sessions: true,
        },
      });
      expect(result).toEqual(userWithSessions);
    });

    it('should include accounts relationship when specified', async () => {
      const userWithAccounts = {
        ...mockUser,
        accounts: [{ id: 'account-1', userId: 1 }],
      };
      mockPrismaService.user.findUnique.mockResolvedValue(userWithAccounts);

      const result = await service.findOne({ id: 1 }, ['accounts']);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          accounts: true,
        },
      });
      expect(result).toEqual(userWithAccounts);
    });

    it('should include multiple relationships when specified', async () => {
      const userWithMultipleRelations = {
        ...mockUser,
        roles: [{ user_id: 1, role_id: 1, role: mockRole }],
        sessions: [{ id: 'session-1', userId: 1 }],
        accounts: [{ id: 'account-1', userId: 1 }],
      };
      mockPrismaService.user.findUnique.mockResolvedValue(
        userWithMultipleRelations,
      );

      const result = await service.findOne({ id: 1 }, [
        'roles',
        'sessions',
        'accounts',
      ]);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
          sessions: true,
          accounts: true,
        },
      });
      expect(result).toEqual(userWithMultipleRelations);
    });

    it('should handle empty include array', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findOne({ id: 1 }, []);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(result).toEqual(mockUser);
    });

    it('should use default empty include when not provided', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findOne({ id: 1 });

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('findMany', () => {
    const mockUsers = [mockUser, { ...mockUser, id: 2, email: 'jane@example.com' }];

    beforeEach(() => {
      mockPrismaService.user.findMany.mockReset();
      mockPrismaService.user.count.mockReset();
      mockPrismaService.user.findMany.mockResolvedValue(mockUsers);
      mockPrismaService.user.count.mockResolvedValue(2);
    });

    it('should return paginated results with default parameters', async () => {
      const result = await service.findMany({});

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: {},
        take: 10,
        skip: 0,
        orderBy: { id: 'asc' },
      });
      expect(mockPrismaService.user.count).toHaveBeenCalledWith({ where: {} });
      expect(result).toEqual({
        data: mockUsers,
        meta: {
          pages: 1,
          page: 1,
          count: 2,
          limit: 10,
          offset: 0,
        },
      });
    });

    it('should apply custom limit and offset', async () => {
      mockPrismaService.user.count.mockResolvedValue(100);

      const result = await service.findMany({}, 20, 40);

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: {},
        take: 20,
        skip: 40,
        orderBy: { id: 'asc' },
      });
      expect(result.meta).toEqual({
        pages: 5,
        page: 3,
        count: 100,
        limit: 20,
        offset: 40,
      });
    });

    it('should include relationships when specified', async () => {
      const usersWithRoles = mockUsers.map((u) => ({
        ...u,
        roles: [{ user_id: u.id, role_id: 1, role: mockRole }],
      }));
      mockPrismaService.user.findMany.mockResolvedValue(usersWithRoles);

      const result = await service.findMany({}, 10, 0, ['roles']);

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: {},
        take: 10,
        skip: 0,
        orderBy: { id: 'asc' },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });
      expect(result.data).toEqual(usersWithRoles);
    });

    it('should apply custom orderBy and orderDir', async () => {
      await service.findMany({}, 10, 0, [], 'email', 'desc');

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: {},
        take: 10,
        skip: 0,
        orderBy: { email: 'desc' },
      });
    });

    it('should apply where filter', async () => {
      const whereFilter = { email: { contains: '@example.com' } };

      await service.findMany(whereFilter);

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: { email: { contains: '@example.com' } },
        take: 10,
        skip: 0,
        orderBy: { id: 'asc' },
      });
      expect(mockPrismaService.user.count).toHaveBeenCalledWith({
        where: { email: { contains: '@example.com' } },
      });
    });

    it('should filter by maxLevel when specified', async () => {
      await service.findMany({}, 10, 0, [], 'id', 'asc', 10);

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: {
          roles: {
            some: {
              role: {
                level: {
                  lte: 10,
                },
              },
            },
          },
        },
        take: 10,
        skip: 0,
        orderBy: { id: 'asc' },
      });
    });

    it('should combine where filter and maxLevel', async () => {
      const whereFilter = { emailVerified: true };

      await service.findMany(whereFilter, 10, 0, [], 'id', 'asc', 5);

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: {
          emailVerified: true,
          roles: {
            some: {
              role: {
                level: {
                  lte: 5,
                },
              },
            },
          },
        },
        take: 10,
        skip: 0,
        orderBy: { id: 'asc' },
      });
    });

    it('should handle maxLevel of 0', async () => {
      await service.findMany({}, 10, 0, [], 'id', 'asc', 0);

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: {
          roles: {
            some: {
              role: {
                level: {
                  lte: 0,
                },
              },
            },
          },
        },
        take: 10,
        skip: 0,
        orderBy: { id: 'asc' },
      });
    });

    it('should return empty data with correct meta when no results', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);
      mockPrismaService.user.count.mockResolvedValue(0);

      const result = await service.findMany({});

      expect(result).toEqual({
        data: [],
        meta: {
          pages: 0,
          page: 1,
          count: 0,
          limit: 10,
          offset: 0,
        },
      });
    });

    it('should include multiple relationships', async () => {
      await service.findMany({}, 10, 0, ['roles', 'sessions', 'accounts']);

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: {},
        take: 10,
        skip: 0,
        orderBy: { id: 'asc' },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
          sessions: true,
          accounts: true,
        },
      });
    });
  });
});
