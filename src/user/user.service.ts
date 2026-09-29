import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Logger,
  Inject,
} from '@nestjs/common';
import { getWebAppUrl } from '@config/web-app.config';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
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
import {
  auth,
  getEmailVerificationCallbackURL,
  AUTH_PASSWORD_RESET_TOKEN_EXPIRES_IN,
  AUTH_EMAIL_VERIFICATION_EXPIRES_IN,
  AUTH_DELETE_ACCOUNT_TOKEN_EXPIRES_IN,
} from '../auth';
import type {
  IAccountDeletionPayload,
  IAccountDeletionVerificationRequestedPayload,
  IAuthEventUser,
  IEmailChangeConfirmationRequestedPayload,
  IEmailVerifiedPayload,
  IPasswordResetEmailRequestedPayload,
  IPasswordUpdatedPayload,
} from '../auth/auth-events';
import { SharedModule } from '@shared/shared.module';

/** The subset of a user record the email templates need. */
export type IEmailRecipient = Pick<IAuthEventUser, 'id' | 'email'> &
  Partial<Pick<IAuthEventUser, 'firstName' | 'lastName' | 'name'>>;
import { AUDIT_EVENT_NAMES } from '../audit/audit-event-names';
import { IAuditEventPayload } from '../audit/interfaces/audit-event-payload.interface';
import { EmailService, IEmailTemplate } from '@shared/email/email.service';
import type { IEmailProvider } from '@shared/email/interfaces/email-provider.interface';

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
  // The following mirror AUTH_EVENT_NAMES (src/auth/auth-events.ts); they are
  // emitted by the better-auth hooks in src/auth.ts and handled below.
  ACCOUNT_VERIFICATION_EMAIL_REQUESTED = 'ACCOUNT_VERIFICATION_EMAIL_REQUESTED',
  PASSWORD_RESET_EMAIL_REQUESTED = 'PASSWORD_RESET_EMAIL_REQUESTED',
  PASSWORD_UPDATED = 'PASSWORD_UPDATED',
  EMAIL_VERIFIED = 'EMAIL_VERIFIED',
  EMAIL_CHANGE_CONFIRMATION_REQUESTED = 'EMAIL_CHANGE_CONFIRMATION_REQUESTED',
  ACCOUNT_DELETION_VERIFICATION_REQUESTED = 'ACCOUNT_DELETION_VERIFICATION_REQUESTED',
  ACCOUNT_DELETION_STARTED = 'ACCOUNT_DELETION_STARTED',
  ACCOUNT_DELETED = 'ACCOUNT_DELETED',
}

const userServiceEmailTemplateNames: Record<string, IEmailTemplate> = {
  welcome: {
    subject: 'Welcome to Our Service!',
    file: `notifications/email/user/welcome.njk`,
  },
  invite: {
    subject: 'Invitation to Join Our Service',
    file: `notifications/email/user/invite.njk`,
  },
  forgotPassword: {
    subject: 'Reset Your FiFi Alert Password',
    file: `notifications/email/user/forgotPassword.njk`,
  },
  passwordChanged: {
    subject: 'Your FiFi Alert Password Has Been Changed',
    file: `notifications/email/auth/passwordChanged.njk`,
  },
  accountVerification: {
    subject: 'Verify Your FiFi Alert Account',
    file: `notifications/email/user/emailVerification.njk`,
  },
  emailChangeConfirmation: {
    subject: 'Confirm Your FiFi Alert Email Change',
    file: `notifications/email/user/emailChangeConfirmation.njk`,
  },
  accountDeletionVerification: {
    subject: 'Confirm Deletion of Your FiFi Alert Account',
    file: `notifications/email/user/accountDeletionVerification.njk`,
  },
};

/** Human-readable token lifetime for email copy, e.g. "1 hour", "24 hours". */
export function formatExpiresIn(seconds: number): string {
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * UserService handles user management operations including
 * creating users with Better Auth and assigning roles via Prisma.
 */
/** Slug of the role granted to every self-registered account. */
export const DEFAULT_ROLE_SLUG = 'user';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    @Inject('IEmailProvider') private readonly emailProvider: IEmailProvider,
  ) {}

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
          meta: { firstTime: true },
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

      // Emit audit event
      try {
        const auditPayload: IAuditEventPayload = {
          eventType: 'CREATE',
          entityType: 'USER',
          entityId: updatedUser.id,
          userId: updatedUser.id,
          action: 'user_created',
          description: `User account created: ${data.email}`,
          newValues: {
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
            roles: rolesToAssign.map((r) => r.slug),
            emailVerified: data.emailVerified ?? false,
          },
          success: true,
        };
        this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.CREATED, auditPayload);
        this.eventEmitter.emit(UserServiceEventNames.CREATED, {
          user: updatedUser,
        });
      } catch (error) {
        this.logger.error(
          'Failed to emit audit event for user creation:',
          error,
        );
      }

      // Send welcome email (non-blocking - log error but don't fail user creation)
      if (userWithRoles) {
        try {
          await this.sendWelcomeEmail(userWithRoles);
        } catch (error) {
          this.logger.error(
            `Welcome email send failed for user ${userWithRoles.id} but user creation succeeded:`,
            error,
          );
        }
      }

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
    const { password, ...userDataWithoutPassword } = userData as Record<
      string,
      unknown
    > & { password?: string };

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

    // Capture oldValues for audit
    const oldValues: any = {};
    for (const key of Object.keys(sanitizedData)) {
      oldValues[key] = existingUser[key];
    }

    // Perform the update
    const updatedUser = await this.prisma.user.update({
      where: data,
      data: sanitizedData,
    });

    this.logger.log(`User updated successfully: ${updatedUser.email}`);

    // Emit audit event
    try {
      const auditPayload: IAuditEventPayload = {
        eventType: 'UPDATE',
        entityType: 'USER',
        entityId: updatedUser.id,
        userId: updatedUser.id,
        action: 'user_updated',
        description: `User profile updated: ${updatedUser.email}`,
        oldValues,
        newValues: sanitizedData,
        success: true,
      };
      this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.UPDATED, auditPayload);
    } catch (error) {
      this.logger.error('Failed to emit audit event for user update:', error);
    }

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
  private async updateUserPassword(
    userId: number,
    newPassword: string,
  ): Promise<void> {
    // Validate password length
    const minPasswordLength = this.configService.get<number>(
      'auth.password.minLength',
      4,
    );
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

    // Emit audit event for password change
    try {
      const auditPayload: IAuditEventPayload = {
        eventType: 'UPDATE',
        entityType: 'USER',
        entityId: userId,
        userId: userId,
        action: 'user_password_changed',
        description: `Password changed for user ID ${userId}`,
        success: true,
      };
      this.eventEmitter.emit(
        AUDIT_EVENT_NAMES.USER.PASSWORD_CHANGED,
        auditPayload,
      );
      // Triggers the "password changed" security email (see handlePasswordUpdated).
      const passwordUpdated: IPasswordUpdatedPayload = {
        userId,
        source: 'admin',
      };
      this.eventEmitter.emit(
        UserServiceEventNames.PASSWORD_UPDATED,
        passwordUpdated,
      );
    } catch (error) {
      this.logger.error(
        'Failed to emit audit event for password change:',
        error,
      );
    }
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
  async findOne(data: Prisma.UserWhereUniqueInput, include: string[] = []) {
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
    const minPasswordLength = this.configService.get<number>(
      'auth.password.minLength',
      4,
    );
    if (data.password.length < minPasswordLength) {
      throw new BadRequestException(
        `Password must be at least ${minPasswordLength} characters long`,
      );
    }
  }

  /**
   * Assigns the default (`user`) role to an existing user.
   * Idempotent: already-assigned roles are skipped.
   * Used by the public signup flow, which creates the account via Better Auth
   * directly and therefore bypasses `store()`.
   *
   * @param userId - The user's ID
   */
  async assignDefaultRole(userId: number): Promise<void> {
    const roles = await this.resolveRoles([]);
    await this.assignRolesToUser(userId, roles);
  }

  /**
   * Resolves the roles to assign to the user.
   * If no roles are provided, fetches the default role (`user`, least privileged).
   *
   * @param roleSlugs - Array of role slugs to resolve
   * @returns Array of Role records
   */
  private async resolveRoles(roleSlugs: string[]) {
    if (roleSlugs.length === 0) {
      // Resolve the default role by slug only. Do NOT fall back to
      // "lowest/highest level": the meaning of `level` is inconsistent
      // (seed and MinUserLevelGuard treat lower = more privilege, the live
      // DB has admin=10 / user=1), so a level-ordered fallback could silently
      // hand out admin. Failing loudly is safer.
      const defaultRole = await this.prisma.role.findFirst({
        where: { slug: DEFAULT_ROLE_SLUG, active: true },
      });

      if (!defaultRole) {
        throw new NotFoundException(
          `Default role "${DEFAULT_ROLE_SLUG}" not found or inactive. Please create it.`,
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

    // Capture oldValues for audit
    const oldValues = {
      email: existingUser.email,
      firstName: existingUser.firstName,
      lastName: existingUser.lastName,
      emailVerified: existingUser.emailVerified,
    };

    // Delete the user (cascades to related records based on schema)
    const deletedUser = await this.prisma.user.delete({
      where: data,
    });

    this.logger.log(`User deleted successfully: ${deletedUser.email}`);

    // Emit audit event
    try {
      const auditPayload: IAuditEventPayload = {
        eventType: 'DELETE',
        entityType: 'USER',
        entityId: deletedUser.id,
        action: 'user_deleted',
        description: `User account deleted: ${deletedUser.email}`,
        oldValues,
        success: true,
      };
      this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.DELETED, auditPayload);
    } catch (error) {
      this.logger.error('Failed to emit audit event for user deletion:', error);
    }

    return deletedUser;
  }

  static async userMaxLevel(user: User) {
    if (!user['roles'] || !Array.isArray(user['roles'])) {
      // get the user roles from the database

      const userWithRoles = await new PrismaService().user.findUnique({
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
      gates: userGates.map((ug) => ug.gate),
      count: userGates.length,
    };
  }

  /**
   * Check if user has a role with at least the specified level.
   * Lower role level values are more privileged, so a role satisfies the
   * requirement when its level is less than or equal to the required level.
   *
   * @param user User object with roles included
   * @param minLevel Minimum role level required
   * @returns true if user has a role with level <= minLevel
   */
  static userHasMinLevel(user: User, minLevel: number): boolean {
    const roles = user['roles'];

    if (!Array.isArray(roles)) {
      return false;
    }

    return roles.some((roleAssignment) => {
      const level = UserService.getRoleLevel(roleAssignment);

      return level !== undefined && level <= minLevel;
    });
  }

  private static getRoleLevel(roleAssignment: unknown): number | undefined {
    if (!roleAssignment || typeof roleAssignment !== 'object') {
      return undefined;
    }

    const assignment = roleAssignment as {
      level?: unknown;
      role?: { level?: unknown };
    };
    const level = assignment.role?.level ?? assignment.level;

    return typeof level === 'number' ? level : undefined;
  }

  // ============================================================
  // Email Methods
  // ============================================================

  @OnEvent(UserServiceEventNames.CREATED, { async: true })
  async handleUserCreatedEvent(payload: { user: User }): Promise<void> {
    if (payload.user.emailVerified) {
      return;
    }

    try {
      await auth.api.sendVerificationEmail({
        body: {
          email: payload.user.email,
          callbackURL: getEmailVerificationCallbackURL(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to request account verification email for user ${payload.user.id}:`,
        error,
      );
    }
  }

  @OnEvent(UserServiceEventNames.ACCOUNT_VERIFICATION_EMAIL_REQUESTED, {
    async: true,
  })
  async handleAccountVerificationEmailRequested(payload: {
    user: User;
    verificationUrl: string;
  }): Promise<void> {
    try {
      await this.sendAccountVerificationEmail(
        payload.user,
        payload.verificationUrl,
      );
    } catch (error) {
      this.logger.error(
        `Account verification email send failed for user ${payload.user.id}:`,
        error,
      );
    }
  }

  // ------------------------------------------------------------------
  // better-auth hook listeners (emitted from src/auth.ts)
  // ------------------------------------------------------------------

  @OnEvent(UserServiceEventNames.PASSWORD_RESET_EMAIL_REQUESTED, {
    async: true,
  })
  async handlePasswordResetEmailRequested(
    payload: IPasswordResetEmailRequestedPayload,
  ): Promise<void> {
    const userId = Number(payload.user.id);
    try {
      await this.sendForgotPasswordEmail(
        payload.user,
        payload.resetUrl,
        formatExpiresIn(payload.expiresInSeconds),
      );
      this.emitAudit(AUDIT_EVENT_NAMES.USER.PASSWORD_RESET_REQUESTED, {
        eventType: 'UPDATE',
        entityType: 'USER',
        entityId: userId,
        userId,
        action: 'user_password_reset_requested',
        description: `Password reset link sent to ${payload.user.email}`,
        success: true,
      });
    } catch (error) {
      this.logger.error(
        `Password reset email send failed for user ${userId}:`,
        error,
      );
    }
  }

  @OnEvent(UserServiceEventNames.PASSWORD_UPDATED, { async: true })
  async handlePasswordUpdated(payload: IPasswordUpdatedPayload): Promise<void> {
    try {
      const user =
        payload.user ??
        (await this.prisma.user.findUnique({
          where: { id: payload.userId },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            name: true,
          },
        }));

      if (!user) {
        this.logger.warn(
          `Password updated for unknown user ${payload.userId}; no email sent`,
        );
        return;
      }

      await this.sendPasswordChangedEmail(user);

      if (payload.source === 'reset') {
        this.emitAudit(AUDIT_EVENT_NAMES.USER.PASSWORD_RESET_COMPLETED, {
          eventType: 'UPDATE',
          entityType: 'USER',
          entityId: payload.userId,
          userId: payload.userId,
          action: 'user_password_reset_completed',
          description: `Password reset completed for ${user.email}`,
          success: true,
        });
      }
    } catch (error) {
      this.logger.error(
        `Password changed email send failed for user ${payload.userId}:`,
        error,
      );
    }
  }

  @OnEvent(UserServiceEventNames.EMAIL_VERIFIED, { async: true })
  handleEmailVerified(payload: IEmailVerifiedPayload): void {
    const userId = Number(payload.user.id);
    this.logger.log(`Email verified for user ${userId}: ${payload.user.email}`);
    this.emitAudit(AUDIT_EVENT_NAMES.USER.EMAIL_VERIFIED, {
      eventType: 'UPDATE',
      entityType: 'USER',
      entityId: userId,
      userId,
      action: 'user_email_verified',
      description: `Email address verified: ${payload.user.email}`,
      success: true,
    });
  }

  @OnEvent(UserServiceEventNames.EMAIL_CHANGE_CONFIRMATION_REQUESTED, {
    async: true,
  })
  async handleEmailChangeConfirmationRequested(
    payload: IEmailChangeConfirmationRequestedPayload,
  ): Promise<void> {
    const userId = Number(payload.user.id);
    try {
      await this.sendEmailChangeConfirmationEmail(
        payload.user,
        payload.newEmail,
        payload.confirmUrl,
        formatExpiresIn(payload.expiresInSeconds),
      );
      this.emitAudit(AUDIT_EVENT_NAMES.USER.UPDATED, {
        eventType: 'UPDATE',
        entityType: 'USER',
        entityId: userId,
        userId,
        action: 'user_email_change_requested',
        description: `Email change requested: ${payload.user.email} -> ${payload.newEmail}`,
        newValues: { email: payload.newEmail },
        success: true,
      });
    } catch (error) {
      this.logger.error(
        `Email change confirmation send failed for user ${userId}:`,
        error,
      );
    }
  }

  @OnEvent(UserServiceEventNames.ACCOUNT_DELETION_VERIFICATION_REQUESTED, {
    async: true,
  })
  async handleAccountDeletionVerificationRequested(
    payload: IAccountDeletionVerificationRequestedPayload,
  ): Promise<void> {
    const userId = Number(payload.user.id);
    try {
      await this.sendAccountDeletionVerificationEmail(
        payload.user,
        payload.deleteUrl,
        formatExpiresIn(payload.expiresInSeconds),
      );
      this.emitAudit(AUDIT_EVENT_NAMES.USER.UPDATED, {
        eventType: 'UPDATE',
        entityType: 'USER',
        entityId: userId,
        userId,
        action: 'user_account_deletion_requested',
        description: `Account deletion verification sent to ${payload.user.email}`,
        success: true,
      });
    } catch (error) {
      this.logger.error(
        `Account deletion verification send failed for user ${userId}:`,
        error,
      );
    }
  }

  @OnEvent(UserServiceEventNames.ACCOUNT_DELETION_STARTED, { async: true })
  handleAccountDeletionStarted(payload: IAccountDeletionPayload): void {
    this.logger.warn(
      `Deleting account ${payload.user.id} (${payload.user.email}) via better-auth`,
    );
  }

  @OnEvent(UserServiceEventNames.ACCOUNT_DELETED, { async: true })
  handleAccountDeleted(payload: IAccountDeletionPayload): void {
    const userId = Number(payload.user.id);
    this.logger.log(`Account ${userId} (${payload.user.email}) deleted`);
    this.emitAudit(AUDIT_EVENT_NAMES.USER.DELETED, {
      eventType: 'DELETE',
      entityType: 'USER',
      entityId: userId,
      userId,
      action: 'user_account_deleted',
      description: `User account deleted by owner: ${payload.user.email}`,
      oldValues: {
        email: payload.user.email,
        firstName: payload.user.firstName,
        lastName: payload.user.lastName,
      },
      success: true,
    });
  }

  private emitAudit(event: string, payload: IAuditEventPayload): void {
    try {
      this.eventEmitter.emit(event, payload);
    } catch (error) {
      this.logger.error(`Failed to emit audit event ${event}:`, error);
    }
  }

  async sendAccountVerificationEmail(
    user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'name'>,
    verificationUrl: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(
      `Sending account verification email to user ${user.id}: ${user.email}`,
    );

    const emailService = new EmailService(
      this.emailProvider,
      this.eventEmitter,
      userServiceEmailTemplateNames,
    );

    try {
      await emailService.sendHtml('accountVerification', {
        from: String(process.env.MAIL_NOTIFICATIONS_FROM),
        to: user.email,
        templateData: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            name: user.name,
          },
          verificationUrl,
          expirationHours: 24,
          appUrl: getWebAppUrl(),
        },
      });

      this.logger.log(
        `Account verification email sent successfully to user ${user.id}`,
      );

      return {
        success: true,
        message: `Account verification email sent to ${user.email}`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send account verification email to user ${user.id}:`,
        error,
      );
      throw new Error('FAILED_TO_SEND_ACCOUNT_VERIFICATION_EMAIL');
    }
  }

  /**
   * Send welcome email to a newly registered user
   * @param user User to send welcome email to
   * @returns Success message
   */
  async sendWelcomeEmail(
    user: User,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Sending welcome email to user ${user.id}: ${user.email}`);

    // Instantiate EmailService with local templates
    const emailService = new EmailService(
      this.emailProvider,
      this.eventEmitter,
      userServiceEmailTemplateNames,
    );

    try {
      await emailService.sendHtml('welcome', {
        from: String(process.env.MAIL_NOTIFICATIONS_FROM),
        to: user.email,
        templateData: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            name: user.name,
          },
          appUrl: getWebAppUrl(),
        },
      });

      this.logger.log(`Welcome email sent successfully to user ${user.id}`);

      return {
        success: true,
        message: `Welcome email sent to ${user.email}`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send welcome email to user ${user.id}:`,
        error,
      );
      throw new Error('FAILED_TO_SEND_WELCOME_EMAIL');
    }
  }

  /**
   * Send forgot password email with reset link.
   *
   * The link is built by `buildWebResetPasswordUrl` in src/auth.ts from the
   * token better-auth generated; this method never sees the raw token.
   *
   * @param user User requesting password reset
   * @param resetLink Absolute web-app URL carrying the reset token
   * @param expiresIn Token expiration duration (e.g., "1 hour")
   * @returns Success message
   */
  async sendForgotPasswordEmail(
    user: IEmailRecipient,
    resetLink: string,
    expiresIn: string = formatExpiresIn(AUTH_PASSWORD_RESET_TOKEN_EXPIRES_IN),
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(
      `Sending forgot password email to user ${user.id}: ${user.email}`,
    );

    const emailService = this.createEmailService();

    try {
      await emailService.sendHtml('forgotPassword', {
        from: String(process.env.MAIL_NOTIFICATIONS_FROM),
        to: user.email,
        templateData: {
          user: this.toTemplateUser(user),
          resetLink,
          expiresIn,
          appUrl: getWebAppUrl(),
        },
      });

      this.logger.log(
        `Forgot password email sent successfully to user ${user.id}`,
      );

      return {
        success: true,
        message: `Password reset email sent to ${user.email}`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send forgot password email to user ${user.id}:`,
        error,
      );
      throw new Error('FAILED_TO_SEND_FORGOT_PASSWORD_EMAIL');
    }
  }

  /**
   * Send the "your password has been changed" security notice.
   * @param user User whose password was changed
   */
  async sendPasswordChangedEmail(
    user: IEmailRecipient,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(
      `Sending password changed email to user ${user.id}: ${user.email}`,
    );

    const emailService = this.createEmailService();

    try {
      const timestamp = new Date();
      await emailService.sendHtml('passwordChanged', {
        from: String(process.env.MAIL_NOTIFICATIONS_FROM),
        to: user.email,
        templateData: {
          user: this.toTemplateUser(user),
          timestamp,
          timestampFormatted: timestamp.toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            hour12: true,
          }),
          appUrl: getWebAppUrl(),
        },
      });

      this.logger.log(`Password changed email sent to user ${user.id}`);

      return {
        success: true,
        message: `Password change confirmation sent to ${user.email}`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send password changed email to user ${user.id}:`,
        error,
      );
      throw new Error('FAILED_TO_SEND_PASSWORD_CHANGED_EMAIL');
    }
  }

  /**
   * Send the email-change confirmation to the user's CURRENT address.
   * Approving it makes better-auth send a verification email to the new one.
   */
  async sendEmailChangeConfirmationEmail(
    user: IEmailRecipient,
    newEmail: string,
    confirmLink: string,
    expiresIn: string = formatExpiresIn(AUTH_EMAIL_VERIFICATION_EXPIRES_IN),
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(
      `Sending email change confirmation to user ${user.id}: ${user.email} -> ${newEmail}`,
    );

    const emailService = this.createEmailService();

    try {
      await emailService.sendHtml('emailChangeConfirmation', {
        from: String(process.env.MAIL_NOTIFICATIONS_FROM),
        to: user.email,
        templateData: {
          user: this.toTemplateUser(user),
          newEmail,
          confirmLink,
          expiresIn,
          appUrl: getWebAppUrl(),
        },
      });

      this.logger.log(
        `Email change confirmation sent successfully to user ${user.id}`,
      );

      return {
        success: true,
        message: `Email change confirmation sent to ${user.email}`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send email change confirmation to user ${user.id}:`,
        error,
      );
      throw new Error('FAILED_TO_SEND_EMAIL_CHANGE_CONFIRMATION_EMAIL');
    }
  }

  /**
   * Send the account-deletion verification link.
   */
  async sendAccountDeletionVerificationEmail(
    user: IEmailRecipient,
    deleteLink: string,
    expiresIn: string = formatExpiresIn(AUTH_DELETE_ACCOUNT_TOKEN_EXPIRES_IN),
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(
      `Sending account deletion verification to user ${user.id}: ${user.email}`,
    );

    const emailService = this.createEmailService();

    try {
      await emailService.sendHtml('accountDeletionVerification', {
        from: String(process.env.MAIL_NOTIFICATIONS_FROM),
        to: user.email,
        templateData: {
          user: this.toTemplateUser(user),
          deleteLink,
          expiresIn,
          appUrl: getWebAppUrl(),
        },
      });

      this.logger.log(
        `Account deletion verification sent successfully to user ${user.id}`,
      );

      return {
        success: true,
        message: `Account deletion verification sent to ${user.email}`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send account deletion verification to user ${user.id}:`,
        error,
      );
      throw new Error('FAILED_TO_SEND_ACCOUNT_DELETION_VERIFICATION_EMAIL');
    }
  }

  private createEmailService(): EmailService {
    return new EmailService(
      this.emailProvider,
      this.eventEmitter,
      userServiceEmailTemplateNames,
    );
  }

  private toTemplateUser(user: IEmailRecipient) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      name: user.name ?? '',
    };
  }

  /**
   * Send invitation email to a new user
   * @param user User being invited
   * @param inviteToken Invitation token
   * @param invitedBy User who sent the invitation
   * @param expiresIn Token expiration duration (e.g., "7 days")
   * @returns Success message
   */
  async sendInviteEmail(
    user: User,
    inviteToken: string,
    invitedBy?: User,
    expiresIn: string = '7 days',
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Sending invite email to user ${user.id}: ${user.email}`);

    const appUrl = getWebAppUrl();
    const inviteLink = `${appUrl}/accept-invite?token=${inviteToken}`;

    // Instantiate EmailService with local templates
    const emailService = new EmailService(
      this.emailProvider,
      this.eventEmitter,
      userServiceEmailTemplateNames,
    );

    try {
      await emailService.sendHtml('invite', {
        from: String(process.env.MAIL_NOTIFICATIONS_FROM),
        to: user.email,
        templateData: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            name: user.name,
          },
          inviteLink,
          expiresIn,
          invitedBy: invitedBy
            ? {
                firstName: invitedBy.firstName,
                lastName: invitedBy.lastName,
                name: invitedBy.name,
                email: invitedBy.email,
              }
            : undefined,
        },
      });

      this.logger.log(`Invite email sent successfully to user ${user.id}`);

      return {
        success: true,
        message: `Invitation email sent to ${user.email}`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send invite email to user ${user.id}:`,
        error,
      );
      throw new Error('FAILED_TO_SEND_INVITE_EMAIL');
    }
  }
}
