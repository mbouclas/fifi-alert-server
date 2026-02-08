import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ListAdminsCommand } from './list-admins.command';
import { UserService } from '../../../user/user.service';
import { PrismaService } from '@services/prisma.service';

describe('ListAdminsCommand', () => {
  let command: ListAdminsCommand;
  let userService: jest.Mocked<UserService>;
  let prismaService: jest.Mocked<PrismaService>;

  const mockAdminRole = {
    id: 1,
    name: 'Admin',
    slug: 'admin',
    level: 10,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUsers = [
    {
      id: 1,
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      emailVerified: true,
      roles: [{ role: mockAdminRole }],
    },
    {
      id: 2,
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      emailVerified: true,
      roles: [{ role: mockAdminRole }],
    },
  ];

  const mockPaginatedResponse = {
    data: mockUsers,
    meta: {
      pages: 1,
      page: 1,
      count: 2,
      limit: 100,
      offset: 0,
    },
  };

  beforeEach(async () => {
    const mockUserService = {
      findMany: jest.fn(),
    };

    const mockPrismaService = {
      role: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListAdminsCommand,
        { provide: UserService, useValue: mockUserService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    command = module.get<ListAdminsCommand>(ListAdminsCommand);
    userService = module.get(UserService);
    prismaService = module.get(PrismaService);

    // Suppress console output during tests
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(process, 'exit').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('run', () => {
    it('should query for admin role by slug', async () => {
      (prismaService.role.findFirst as jest.Mock).mockResolvedValue(
        mockAdminRole,
      );
      userService.findMany.mockResolvedValue(mockPaginatedResponse);

      await command.run();

      expect(prismaService.role.findFirst).toHaveBeenCalledWith({
        where: { slug: 'admin' },
      });
    });

    it('should call userService.findMany with admin role level as maxLevel', async () => {
      (prismaService.role.findFirst as jest.Mock).mockResolvedValue(
        mockAdminRole,
      );
      userService.findMany.mockResolvedValue(mockPaginatedResponse);

      await command.run();

      expect(userService.findMany).toHaveBeenCalledWith(
        {},
        100,
        0,
        ['roles'],
        'firstName',
        'asc',
        mockAdminRole.level,
      );
    });

    it('should throw NotFoundException when admin role does not exist', async () => {
      (prismaService.role.findFirst as jest.Mock).mockResolvedValue(null);

      await command.run();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Admin role not found'),
      );
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should display admin list when users are found', async () => {
      (prismaService.role.findFirst as jest.Mock).mockResolvedValue(
        mockAdminRole,
      );
      userService.findMany.mockResolvedValue(mockPaginatedResponse);

      await command.run();

      expect(console.log).toHaveBeenCalled();
      // Verify the output contains user information
      const logCalls = (console.log as jest.Mock).mock.calls;
      const output = logCalls.map((call) => call[0]).join('\n');
      expect(output).toContain('System Administrators');
      expect(output).toContain('John');
      expect(output).toContain('Doe');
      expect(output).toContain('john@example.com');
      expect(output).toContain('Jane');
      expect(output).toContain('Smith');
      expect(output).toContain('jane@example.com');
      expect(output).toContain('Total: 2 administrator(s)');
    });

    it('should display message when no admins are found', async () => {
      (prismaService.role.findFirst as jest.Mock).mockResolvedValue(
        mockAdminRole,
      );
      userService.findMany.mockResolvedValue({
        data: [],
        meta: { pages: 0, page: 1, count: 0, limit: 100, offset: 0 },
      });

      await command.run();

      const logCalls = (console.log as jest.Mock).mock.calls;
      const output = logCalls.map((call) => call[0]).join('\n');
      expect(output).toContain('No administrators found');
    });

    it('should handle errors gracefully', async () => {
      (prismaService.role.findFirst as jest.Mock).mockRejectedValue(
        new Error('Database connection failed'),
      );

      await command.run();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to list administrators'),
      );
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });
});
