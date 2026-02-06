import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@services/prisma.service';
import {
  formatResultToPaginatedResponse,
  IPaginatedResponse,
} from '@services/base-prisma.service';
import { Prisma, User } from '@prisma-lib/client';
import { buildIncludeObject } from '@shared/helpers/prisma-include.helper';
import {
  getUserFieldMetadata,
  sanitizeUpdateData,
} from '@shared/helpers/prisma-model-fields.helper';
import { hashPassword } from 'better-auth/crypto';
import { auth } from '../auth';
import { SharedModule } from '@shared/shared.module';

/**
 * Data transfer object for creating a new user
 */
export interface CreateUserDto {
  /** User's first name */
  firstName: string;
  /** User's last name */
  lastName: string;
  /** User's email address */
  email: string;
  /** User's password (will be hashed by Better Auth) */
  password: string;
  /** Array of role slugs to assign to the user */
  roles?: string[];
  /** Optional profile image URL */
  image?: string;
  /** Whether the email is pre-verified */
  emailVerified?: boolean;
}

export enum UserServiceEventNames {
  UPLOAD_PROFILE_IMAGE = 'UPLOAD_PROFILE_IMAGE',
  UPDATED = 'UPDATED',
  DELETED = 'DELETED',
  CREATED = 'CREATED',
  IMPORTED_VIA_EXELSYS = 'IMPORTED_VIA_EXELSYS',
  PASSWORD_UPDATED = 'PASSWORD_UPDATED',
}

/**
 * UserService handles user management operations including
 * creating users with Better Auth and assigning roles via Prisma.
 */
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * Creates a new user with the provided details and assigns roles.
   *
   * @param data - The user creation data
   * @returns The created user with their assigned roles
   * @throws ConflictException if a user with the email already exists
   * @throws BadRequestException if required fields are missing
   * @throws NotFoundException if specified roles don't exist
   */
  async store(data: CreateUserDto) {
    // Validate required fields
    this.validateCreateUserData(data);

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException(
        `A user with email "${data.email}" already exists`,
      );
    }

    // Determine roles to assign
    const rolesToAssign = await this.resolveRoles(data.roles || []);

    // Create user using Better Auth's API (handles password hashing)
    const fullName = `${data.firstName} ${data.lastName}`.trim();

    try {
      // Use Better Auth's server-side API to create the user
      const signUpResult = await auth.api.signUpEmail({
        body: {
          email: data.email.toLowerCase(),
          password: data.password,
          name: fullName,
          image: data.image,
        },
      });

      if (!signUpResult?.user) {
        throw new BadRequestException('Failed to create user via Better Auth');
      }

      const createdUserId = signUpResult.user.id;

      // Update the user with firstName and lastName (Better Auth only stores name)
      const updatedUser = await this.prisma.user.update({
        where: { id: Number(createdUserId) },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          emailVerified: data.emailVerified ?? false,
        },
      });

      // Assign roles to the user
      await this.assignRolesToUser(updatedUser.id, rolesToAssign);

      // Fetch and return the complete user with roles
      const userWithRoles = await this.prisma.user.findUnique({
        where: { id: updatedUser.id },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });

      this.logger.log(
        `User created successfully: ${userWithRoles?.email} with ${rolesToAssign.length} role(s)`,
      );

      SharedModule.eventEmitter.emit(UserServiceEventNames.CREATED, { id: userWithRoles?.id, ...data });

      return userWithRoles;
    } catch (error) {
      // If the error is already one of our custom exceptions, rethrow it
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      this.logger.error(`Failed to create user: ${error}`);
      throw new BadRequestException(
        `Failed to create user: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Updates an existing user with the provided data.
   * If a password is provided, it will be hashed and updated in the user's credential account.
   *
   * @param data - Prisma unique input to identify the user (id, email, etc.)
   * @param userData - The data to update on the user
   * @returns The updated user
   * @throws NotFoundException if the user doesn't exist
   * @throws BadRequestException if password update fails (e.g., no credential account exists)
   *
   * @example
   * // Update user's name
   * const user = await userService.update({ id: 1 }, { firstName: 'John', lastName: 'Doe' });
   *
   * @example
   * // Update user by email
   * const user = await userService.update({ email: 'john@example.com' }, { image: 'https://example.com/avatar.jpg' });
   *
   * @example
   * // Update user's password (will be hashed automatically)
   * const user = await userService.update({ id: 1 }, { password: 'newPassword123' } as any);
   */
  async update(
    data: Prisma.UserWhereUniqueInput,
    userData: Prisma.UserUpdateInput & { password?: string },
  ) {
    // Check if the user exists
    const existingUser = await this.prisma.user.findUnique({
      where: data,
    });

    if (!existingUser) {
      throw new NotFoundException(
        `User not found with the provided identifier`,
      );
    }

    // Extract password from userData if present (password is stored in Account, not User)
    const { password, ...userDataWithoutPassword } = userData as Record<string, unknown> & { password?: string };

    // Handle password update separately (stored in Account table)
    if (password !== undefined && password !== null && password !== '') {
      await this.updateUserPassword(existingUser.id, password);
    }

    // Get field metadata dynamically from Prisma
    const fieldMetadata = getUserFieldMetadata();

    // Filter userData to only include valid updatable fields (excluding password)
    const sanitizedData = sanitizeUpdateData(
      userDataWithoutPassword,
      fieldMetadata,
    ) as Prisma.UserUpdateInput;

    // If no valid fields to update, return the existing user (or refreshed if password was updated)
    if (Object.keys(sanitizedData).length === 0) {
      if (password) {
        this.logger.log(`Password updated for user: ${existingUser.email}`);
        return existingUser;
      }
      this.logger.warn('No valid fields provided for user update');
      return existingUser;
    }

    // Perform the update
    const updatedUser = await this.prisma.user.update({
      where: data,
      data: sanitizedData,
    });

    this.logger.log(`User updated successfully: ${updatedUser.email}`);

    SharedModule.eventEmitter.emit(UserServiceEventNames.UPDATED, { id: updatedUser.id, ...userData });
    return updatedUser;
  }

  /**
   * Updates the password for a user's credential account.
   * The password will be hashed using Better Auth's hashing algorithm before storage.
   *
   * @param userId - The user's ID
   * @param newPassword - The new plain text password to set
   * @throws BadRequestException if no credential account exists for the user
   * @throws BadRequestException if password doesn't meet minimum length requirements
   */
  private async updateUserPassword(userId: number, newPassword: string): Promise<void> {
    // Validate password length
    const minPasswordLength = this.configService.get<number>('auth.password.minLength', 4);
    if (newPassword.length < minPasswordLength) {
      throw new BadRequestException(
        `Password must be at least ${minPasswordLength} characters long`,
      );
    }

    // Find the credential account for this user
    const credentialAccount = await this.prisma.account.findFirst({
      where: {
        userId: userId,
        providerId: 'credential',
      },
    });

    if (!credentialAccount) {
      throw new BadRequestException(
        'Cannot update password: User does not have a credential account. ' +
        'This user may have signed up using a social provider.',
      );
    }

    // Hash the password using Better Auth's hashing function
    const hashedPassword = await hashPassword(newPassword);

    // Update the account with the new hashed password
    await this.prisma.account.update({
      where: { id: credentialAccount.id },
      data: { password: hashedPassword },
    });

    this.logger.log(`Password updated for user ID: ${userId}`);
    SharedModule.eventEmitter.emit(UserServiceEventNames.PASSWORD_UPDATED, { id: userId });


  }

  /**
   * Finds a single user by unique identifier with optional relationship includes.
   *
   * @param data - Prisma unique input to identify the user (id, email, etc.)
   * @param include - Array of relationship names to include (e.g., ['roles', 'sessions', 'accounts'])
   * @returns The user with requested relationships, or null if not found
   *
   * @example
   * // Find by id with no relationships
   * const user = await userService.findOne({ id: 1 });
   *
   * @example
   * // Find by email with roles relationship
   * const user = await userService.findOne({ email: 'john@example.com' }, ['roles']);
   *
   * @example
   * // Find with multiple relationships
   * const user = await userService.findOne({ id: 1 }, ['roles', 'sessions', 'accounts']);
   */
  async findOne(
    data: Prisma.UserWhereUniqueInput,
    include: string[] = [],
  ) {
    const includeObject = buildIncludeObject<Prisma.UserInclude>(include);

    const user = await this.prisma.user.findUnique({
      where: data,
      ...(Object.keys(includeObject).length > 0 && { include: includeObject }),
    });

    return user;
  }

  /**
   * Finds multiple users with pagination, filtering, and optional role level filtering.
   *
   * @param data - Prisma where input for filtering users
   * @param limit - Maximum number of results to return (default: 10)
   * @param offset - Number of results to skip for pagination (default: 0)
   * @param include - Array of relationship names to include (e.g., ['roles', 'sessions'])
   * @param orderBy - Field to order results by (default: 'id')
   * @param orderDir - Sort direction, 'asc' or 'desc' (default: 'asc')
   * @param maxLevel - Optional maximum role level filter (users with at least one role <= maxLevel)
   * @returns Paginated response with users and metadata
   *
   * @example
   * // Basic pagination
   * const result = await userService.findMany({}, 10, 0);
   *
   * @example
   * // Filter by email domain with roles included
   * const result = await userService.findMany(
   *   { email: { contains: '@example.com' } },
   *   20,
   *   0,
   *   ['roles'],
   * );
   *
   * @example
   * // Find admin users (role level <= 10)
   * const result = await userService.findMany({}, 10, 0, ['roles'], 'id', 'asc', 10);
   */
  async findMany(
    data: Prisma.UserWhereInput,
    limit = 10,
    offset = 0,
    include: string[] = [],
    orderBy = 'id',
    orderDir: 'asc' | 'desc' = 'asc',
    maxLevel?: number,
    minLevel?: number,
  ): Promise<IPaginatedResponse<User>> {
    const includeObject = buildIncludeObject<Prisma.UserInclude>(include);

    // Build the query object
    const query: Prisma.UserFindManyArgs = {
      where: { ...data },
      take: limit,
      skip: offset,
      orderBy: { [orderBy]: orderDir },
    };

    // Add include if relationships are specified
    if (Object.keys(includeObject).length > 0) {
      query.include = includeObject;
    }

    // Filter by maximum role level if specified
    if (maxLevel !== undefined) {
      query.where = {
        ...query.where,
        roles: {
          some: {
            role: {
              level: {
                lte: maxLevel,
              },
            },
          },
        },
      };
    }

    if (minLevel !== undefined) {
      query.where = {
        ...query.where,
        roles: {
          some: {
            role: {
              level: {
                gte: minLevel,
              },
            },
          },
        },
      };
    }

    // Execute queries in parallel for better performance
    const [results, countResult] = await Promise.all([
      this.prisma.user.findMany(query),
      this.prisma.user.count({ where: query.where }),
    ]);

    return formatResultToPaginatedResponse(results, countResult, limit, offset);
  }

  /**
   * Validates the required fields for user creation
   */
  private validateCreateUserData(data: CreateUserDto): void {
    if (!data.email || data.email.trim() === '') {
      throw new BadRequestException('Email is required');
    }

    if (!data.password || data.password.trim() === '') {
      throw new BadRequestException('Password is required');
    }

    if (!data.firstName || data.firstName.trim() === '') {
      throw new BadRequestException('First name is required');
    }

    if (!data.lastName || data.lastName.trim() === '') {
      throw new BadRequestException('Last name is required');
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      throw new BadRequestException('Invalid email format');
    }

    // Password length validation
    const minPasswordLength = this.configService.get<number>('auth.password.minLength', 4);
    if (data.password.length < minPasswordLength) {
      throw new BadRequestException(
        `Password must be at least ${minPasswordLength} characters long`,
      );
    }
  }

  /**
   * Resolves the roles to assign to the user.
   * If no roles are provided, fetches the default role (lowest level).
   *
   * @param roleSlugs - Array of role slugs to resolve
   * @returns Array of Role records
   */
  private async resolveRoles(roleSlugs: string[]) {
    if (roleSlugs.length === 0) {
      // Get the default role (lowest level, active)
      const defaultRole = await this.prisma.role.findFirst({
        where: { active: true },
        orderBy: { level: 'asc' },
      });

      if (!defaultRole) {
        throw new NotFoundException(
          'No active roles found in the system. Please create at least one role.',
        );
      }

      return [defaultRole];
    }

    // Find all specified roles by slug
    const roles = await this.prisma.role.findMany({
      where: {
        slug: { in: roleSlugs },
        active: true,
      },
    });

    // Check if all specified roles were found
    const foundSlugs = roles.map((r) => r.slug);
    const missingSlugs = roleSlugs.filter((slug) => !foundSlugs.includes(slug));

    if (missingSlugs.length > 0) {
      throw new NotFoundException(
        `The following roles were not found: ${missingSlugs.join(', ')}`,
      );
    }

    return roles;
  }

  /**
   * Assigns roles to a user by creating UserRole records
   *
   * @param userId - The user's ID
   * @param roles - Array of Role records to assign
   */
  private async assignRolesToUser(
    userId: number,
    roles: { id: number; slug: string }[],
  ): Promise<void> {
    const userRoleData = roles.map((role) => ({
      user_id: userId,
      role_id: role.id,
    }));

    await this.prisma.userRole.createMany({
      data: userRoleData,
      skipDuplicates: true,
    });
  }

  /**
   * Deletes a user by unique identifier.
   * This will cascade delete related records (sessions, accounts, roles) based on schema configuration.
   *
   * @param data - Prisma unique input to identify the user (id, email, etc.)
   * @returns The deleted user
   * @throws NotFoundException if the user doesn't exist
   *
   * @example
   * // Delete by id
   * await userService.delete({ id: 1 });
   *
   * @example
   * // Delete by email
   * await userService.delete({ email: 'john@example.com' });
   */
  async delete(data: Prisma.UserWhereUniqueInput): Promise<User> {
    // Check if the user exists
    const existingUser = await this.prisma.user.findUnique({
      where: data,
    });

    if (!existingUser) {
      throw new NotFoundException(
        `User not found with the provided identifier`,
      );
    }

    // Delete the user (cascades to related records based on schema)
    const deletedUser = await this.prisma.user.delete({
      where: data,
    });

    this.logger.log(`User deleted successfully: ${deletedUser.email}`);

    return deletedUser;
  }

  static async userMaxLevel(user: User) {
    if (!user['roles'] || !Array.isArray(user['roles'])) {
      // get the user roles from the database

      const userWithRoles = await (new PrismaService()).user.findUnique({
        where: { id: parseInt(user.id as any, 10) },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });
      return UserService.userMaxLevel(userWithRoles!);
    }

    return user['roles'].reduce((max, r) => {
      if (!r.role) {
        return max;
      }

      const role = r.role;
      return role.level > max ? role.level : max;
    }, 0);
  }

  static userMaxRole(user: User) {
    const maxLevel = UserService.userMaxLevel(user);

    return user['roles'].find((r) => r.role.level === maxLevel);
  }

  static userMinLevel(user: User) {
    if (!user['roles'] || !Array.isArray(user['roles'])) {
      return 0;
    }

    return user['roles'].reduce((min, r) => {
      return r.role.level < min.role.level ? r.role.level : min.role.level;
    });
  }

  static userMinRole(user: User) {
    const minLevel = UserService.userMinLevel(user);

    return user['roles'].find((r) => r.role.level === minLevel);
  }

  static userHasRole(
    user: User,
    role: string,
    searchKey: 'name' | 'slug' = 'name',
  ) {
    if (!user['roles'] || !Array.isArray(user['roles'])) {
      return false;
    }

    return user['roles'].find((r) => r.role[searchKey] === role);
  }

  /**
   * Assign a gate to a user
   */
  async assignGate(userId: number, gateId: number) {
    // Check if user exists
    const user = await this.findOne({ id: userId });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Check if gate exists
    const gate = await this.prisma.gate.findUnique({
      where: { id: gateId },
    });
    if (!gate) {
      throw new NotFoundException(`Gate with ID ${gateId} not found`);
    }

    // Check if user already has this gate
    const existingUserGate = await this.prisma.userGate.findUnique({
      where: {
        user_id_gate_id: {
          user_id: userId,
          gate_id: gateId,
        },
      },
    });

    if (existingUserGate) {
      throw new ConflictException(`User already has gate "${gate.name}"`);
    }

    // Assign the gate
    const userGate = await this.prisma.userGate.create({
      data: {
        user_id: userId,
        gate_id: gateId,
      },
      include: {
        gate: true,
      },
    });

    this.logger.log(`Gate "${gate.name}" assigned to user ${user.email}`);
    return userGate;
  }

  /**
   * Remove a gate from a user
   */
  async removeGate(userId: number, gateId: number) {
    // Check if user exists
    const user = await this.findOne({ id: userId });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Check if gate exists
    const gate = await this.prisma.gate.findUnique({
      where: { id: gateId },
    });
    if (!gate) {
      throw new NotFoundException(`Gate with ID ${gateId} not found`);
    }

    // Check if user has this gate
    const userGate = await this.prisma.userGate.findUnique({
      where: {
        user_id_gate_id: {
          user_id: userId,
          gate_id: gateId,
        },
      },
    });

    if (!userGate) {
      throw new NotFoundException(`User does not have gate "${gate.name}"`);
    }

    // Remove the gate
    await this.prisma.userGate.delete({
      where: {
        user_id_gate_id: {
          user_id: userId,
          gate_id: gateId,
        },
      },
    });

    this.logger.log(`Gate "${gate.name}" removed from user ${user.email}`);
  }

  /**
   * Get all gates assigned to a user
   */
  async getUserGates(userId: number) {
    // Check if user exists
    const user = await this.findOne({ id: userId });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const userGates = await this.prisma.userGate.findMany({
      where: { user_id: userId },
      include: {
        gate: true,
      },
      orderBy: {
        gate: {
          name: 'asc',
        },
      },
    });

    return {
      userId,
      userEmail: user.email,
      gates: userGates.map(ug => ug.gate),
      count: userGates.length,
    };
  }


}
