import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UseGuards,
  ForbiddenException,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { AlertZoneService } from './alert-zone.service';
import {
  CreateUserDto,
  UpdateUserDto,
  FindUsersQueryDto,
  CreateAlertZoneDto,
  UpdateAlertZoneDto,
  AlertZoneResponseDto,
} from './dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Session } from '@thallesp/nestjs-better-auth';
import { PetService } from '../pet/pet.service';
import { CreatePetDto, UpdatePetDto, PetResponseDto } from '../pet/dto';
import { SanitizeUserInterceptor } from '../shared/interceptors/sanitize-user.interceptor';

const CROSS_USER_UPDATE_ROLES = new Set(['admin', 'manager']);

/**
 * User Controller
 *
 * Handles CRUD operations for user management.
 * All routes are prefixed with /users.
 */
@ApiTags('Users')
@ApiBearerAuth()
@UseInterceptors(SanitizeUserInterceptor)
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly petService: PetService,
    private readonly alertZoneService: AlertZoneService,
  ) { }

  /**
   * Create a new user
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({
    summary: 'Create a new user',
    description:
      'Creates a new user with the provided details and assigns roles. Admin only.',
  })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'User created successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'User with this email already exists',
  })
  async create(@Body() createUserDto: CreateUserDto) {
    return this.userService.store(createUserDto);
  }

  /**
   * Get all users with pagination
   */
  @Get()
  @ApiOperation({
    summary: 'Get all users',
    description:
      'Retrieves a paginated list of users with optional filtering and includes.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of users retrieved successfully',
  })
  async findAll(@Query() query: FindUsersQueryDto, @Session() session: any) {
    const {
      limit = 10,
      offset = 0,
      include,
      orderBy = 'id',
      orderDir = 'asc',
      email,
    } = query;

    // Parse include string to array
    const includeArray = include ? include.split(',').map((s) => s.trim()) : [];

    // Build where clause for filtering
    const where: Record<string, unknown> = {};
    if (email) {
      where.email = { contains: email, mode: 'insensitive' };
    }

    const userLevel = await UserService.userMaxLevel(session.user);

    return this.userService.findMany(
      where,
      Number(limit),
      Number(offset),
      includeArray,
      orderBy,
      orderDir,
      99,
    );
  }

  /**
   * Get a user by ID
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get user by ID',
    description:
      'Retrieves a single user by their ID with optional relationship includes.',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    type: Number,
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User not found',
  })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('include') include?: string,
  ) {
    const includeArray = include ? include.split(',').map((s) => s.trim()) : [];
    const user = await this.userService.findOne({ id }, includeArray);

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  /**
   * Get a user by email
   */
  @Get('email/:email')
  @ApiOperation({
    summary: 'Get user by email',
    description: 'Retrieves a single user by their email address.',
  })
  @ApiParam({
    name: 'email',
    description: 'User email address',
    type: String,
    example: 'john@example.com',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User not found',
  })
  async findByEmail(
    @Param('email') email: string,
    @Query('include') include?: string,
  ) {
    const includeArray = include ? include.split(',').map((s) => s.trim()) : [];
    const user = await this.userService.findOne(
      { email: email.toLowerCase() },
      includeArray,
    );

    if (!user) {
      throw new NotFoundException(`User with email ${email} not found`);
    }

    return user;
  }

  /**
   * Update a user
   */
  @Put(':id')
  @ApiOperation({
    summary: 'Update a user',
    description:
      'Updates an existing user with the provided data. Users can update themselves; admins and managers can update other users.',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    type: Number,
    example: 1,
  })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User updated successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'User cannot update another user without admin or manager role',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
    @Session() session: any,
  ) {
    const canManageUsers = this.hasCrossUserUpdateRole(session);

    if (session?.userId !== id && !canManageUsers) {
      throw new ForbiddenException(
        'You do not have permission to update this user',
      );
    }

    if (!canManageUsers && updateUserDto.emailVerified !== undefined) {
      throw new ForbiddenException(
        'You do not have permission to update email verification status',
      );
    }

    return this.userService.update({ id }, updateUserDto as any);
  }

  private hasCrossUserUpdateRole(
    session: { userId?: number; roles?: Array<{ slug?: string }> },
  ): boolean {
    return Boolean(
      session?.roles?.some((role) =>
        role.slug ? CROSS_USER_UPDATE_ROLES.has(role.slug) : false,
      ),
    );
  }

  /**
   * Delete a user
   */
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a user',
    description:
      'Permanently deletes a user by their ID. This will cascade delete related records. Admin only.',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    type: Number,
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'User deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User not found',
  })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.userService.delete({ id });
  }

  /**
   * Assign a gate to a user
   */
  @Post(':id/gates')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Assign a gate to a user',
    description: 'Assigns a feature gate to a user. Admin or Manager only.',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    type: Number,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Gate assigned successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User or gate not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'User already has this gate',
  })
  async assignGate(
    @Param('id', ParseIntPipe) userId: number,
    @Body() body: { gateId: number },
  ) {
    return this.userService.assignGate(userId, body.gateId);
  }

  /**
   * Remove a gate from a user
   */
  @Delete(':id/gates/:gateId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove a gate from a user',
    description: 'Removes a feature gate from a user. Admin or Manager only.',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    type: Number,
  })
  @ApiParam({
    name: 'gateId',
    description: 'Gate ID',
    type: Number,
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Gate removed successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User, gate, or assignment not found',
  })
  async removeGate(
    @Param('id', ParseIntPipe) userId: number,
    @Param('gateId', ParseIntPipe) gateId: number,
  ) {
    await this.userService.removeGate(userId, gateId);
  }

  /**
   * Get all gates assigned to a user
   */
  @Get(':id/gates')
  @ApiOperation({
    summary: 'Get user gates',
    description: 'Retrieves all feature gates assigned to a user.',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    type: Number,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User gates retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User not found',
  })
  async getUserGates(@Param('id', ParseIntPipe) userId: number) {
    return this.userService.getUserGates(userId);
  }

  // ============================================================================
  // Pet Management Endpoints
  // ============================================================================

  /**
   * Get all pets for a specific user
   */
  @Get(':userId/pets')
  @ApiOperation({
    summary: 'Get all pets for a user',
    description:
      'Retrieves all pets owned by the specified user. Users can only access their own pets unless they are admins.',
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID',
    type: Number,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of user pets',
    type: [PetResponseDto],
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "Forbidden - cannot access other user's pets",
  })
  async getUserPets(
    @Param('userId', ParseIntPipe) userId: number,
    @Session() session: any,
  ): Promise<PetResponseDto[]> {
    // Check if user is accessing their own pets (or is admin)
    if (session.userId !== userId) {
      // TODO: Add admin role check when roles are implemented
      throw new ForbiddenException('You can only access your own pets');
    }

    return this.petService.findAllByUser(userId);
  }

  /**
   * Get a specific pet for a user
   */
  @Get(':userId/pets/:petId')
  @ApiOperation({
    summary: 'Get a specific pet for a user',
    description: 'Retrieves details of a specific pet owned by the user.',
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID',
    type: Number,
  })
  @ApiParam({
    name: 'petId',
    description: 'Pet ID',
    type: Number,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Pet details',
    type: PetResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Forbidden - not your pet',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Pet not found',
  })
  async getUserPet(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('petId', ParseIntPipe) petId: number,
    @Session() session: any,
  ): Promise<PetResponseDto> {
    // Check if user is accessing their own pet
    if (session.userId !== userId) {
      throw new ForbiddenException('You can only access your own pets');
    }

    return this.petService.findOne(petId, userId);
  }

  /**
   * Register a new pet for a user
   */
  @Post(':userId/pets')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new pet for a user',
    description:
      'Create a new pet for the specified user. Users can only register pets for themselves.',
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID',
    type: Number,
  })
  @ApiBody({ type: CreatePetDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Pet registered successfully',
    type: PetResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Forbidden - cannot register pets for other users',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Validation failed',
  })
  async registerPet(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() createPetDto: CreatePetDto,
    @Session() session: any,
  ): Promise<PetResponseDto> {
    // Check if user is registering for themselves
    if (session.userId !== userId) {
      throw new ForbiddenException('You can only register pets for yourself');
    }

    return this.petService.createPet(userId, createPetDto);
  }

  /**
   * Update a user's pet
   */
  @Put(':userId/pets/:petId')
  @ApiOperation({
    summary: "Update a user's pet",
    description:
      'Update details of a specific pet. Users can only update their own pets.',
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID',
    type: Number,
  })
  @ApiParam({
    name: 'petId',
    description: 'Pet ID',
    type: Number,
  })
  @ApiBody({ type: UpdatePetDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Pet updated successfully',
    type: PetResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Forbidden - not your pet',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Pet not found',
  })
  async updateUserPet(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('petId', ParseIntPipe) petId: number,
    @Body() updatePetDto: UpdatePetDto,
    @Session() session: any,
  ): Promise<PetResponseDto> {
    // Check if user owns the pet
    if (session.userId !== userId) {
      throw new ForbiddenException('You can only update your own pets');
    }

    return this.petService.updatePet(petId, userId, updatePetDto);
  }

  /**
   * Delete a user's pet
   */
  @Delete(':userId/pets/:petId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete a user's pet",
    description:
      'Delete a pet from the system. Users can only delete their own pets.',
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID',
    type: Number,
  })
  @ApiParam({
    name: 'petId',
    description: 'Pet ID',
    type: Number,
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Pet deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Forbidden - not your pet',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Pet not found',
  })
  async deleteUserPet(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('petId', ParseIntPipe) petId: number,
    @Session() session: any,
  ): Promise<void> {
    // Check if user owns the pet
    if (session.userId !== userId) {
      throw new ForbiddenException('You can only delete your own pets');
    }

    return this.petService.deletePet(petId, userId);
  }

  // ============================================================================
  // Alert Zones
  // ============================================================================

  /**
   * Create a new alert zone for the current user
   */
  @Post('me/alert-zones')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new alert zone',
    description:
      'Creates a new alert zone for the authenticated user. Alert zones are user-scoped ' +
      'geographic areas where the user wants to receive notifications. Max 10 zones per user.',
  })
  @ApiBody({ type: CreateAlertZoneDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Alert zone created successfully',
    type: AlertZoneResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Max zones exceeded or invalid input',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Not authenticated',
  })
  async createAlertZone(
    @Body() createAlertZoneDto: CreateAlertZoneDto,
    @Session() session: any,
  ): Promise<AlertZoneResponseDto> {
    return this.alertZoneService.create(createAlertZoneDto, session.userId);
  }

  /**
   * Get all alert zones for the current user
   */
  @Get('me/alert-zones')
  @ApiOperation({
    summary: 'Get all alert zones for current user',
    description:
      'Retrieves all alert zones for the authenticated user, ordered by priority.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Alert zones retrieved successfully',
    type: [AlertZoneResponseDto],
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Not authenticated',
  })
  async getAlertZones(
    @Session() session: any,
  ): Promise<AlertZoneResponseDto[]> {
    return this.alertZoneService.findByUser(session.userId);
  }

  /**
   * Get a single alert zone by ID
   */
  @Get('me/alert-zones/:id')
  @ApiOperation({
    summary: 'Get a single alert zone',
    description: 'Retrieves a single alert zone by ID. User must own the zone.',
  })
  @ApiParam({
    name: 'id',
    description: 'Alert zone ID',
    type: Number,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Alert zone retrieved successfully',
    type: AlertZoneResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Alert zone not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Not the owner of this alert zone',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Not authenticated',
  })
  async getAlertZone(
    @Param('id', ParseIntPipe) id: number,
    @Session() session: any,
  ): Promise<AlertZoneResponseDto> {
    return this.alertZoneService.findOne(id, session.userId);
  }

  /**
   * Update an alert zone
   */
  @Patch('me/alert-zones/:id')
  @ApiOperation({
    summary: 'Update an alert zone',
    description:
      'Updates an existing alert zone. User must own the zone. All fields are optional.',
  })
  @ApiParam({
    name: 'id',
    description: 'Alert zone ID',
    type: Number,
  })
  @ApiBody({ type: UpdateAlertZoneDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Alert zone updated successfully',
    type: AlertZoneResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Alert zone not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Not the owner of this alert zone',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Not authenticated',
  })
  async updateAlertZone(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateAlertZoneDto: UpdateAlertZoneDto,
    @Session() session: any,
  ): Promise<AlertZoneResponseDto> {
    return this.alertZoneService.update(id, updateAlertZoneDto, session.userId);
  }

  /**
   * Delete an alert zone
   */
  @Delete('me/alert-zones/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an alert zone',
    description: 'Deletes an alert zone. User must own the zone.',
  })
  @ApiParam({
    name: 'id',
    description: 'Alert zone ID',
    type: Number,
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Alert zone deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Alert zone not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Not the owner of this alert zone',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Not authenticated',
  })
  async deleteAlertZone(
    @Param('id', ParseIntPipe) id: number,
    @Session() session: any,
  ): Promise<void> {
    return this.alertZoneService.delete(id, session.userId);
  }
}
