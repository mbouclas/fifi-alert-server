import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UseGuards,
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
import { CreateUserDto, UpdateUserDto, FindUsersQueryDto } from './dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Audit } from '../auth/decorators/audit.decorator';
import { CurrentUser } from '../decorators/session.decorator';
import { ITokenUser } from '../auth/interfaces/token-user.interface';
import { Session } from '@thallesp/nestjs-better-auth';

/**
 * User Controller
 *
 * Handles CRUD operations for user management.
 * All routes are prefixed with /users.
 */
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) { }

  /**
   * Create a new user
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({
    summary: 'Create a new user',
    description: 'Creates a new user with the provided details and assigns roles. Admin only.',
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
    description: 'Retrieves a paginated list of users with optional filtering and includes.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of users retrieved successfully',
  })
  async findAll(@Query() query: FindUsersQueryDto, @Session() session: any,) {
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
    description: 'Retrieves a single user by their ID with optional relationship includes.',
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
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({
    summary: 'Update a user',
    description: 'Updates an existing user with the provided data. Password will be hashed if provided. Admin or Manager only.',
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
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.userService.update({ id }, updateUserDto as any);
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
    description: 'Permanently deletes a user by their ID. This will cascade delete related records. Admin only.',
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
  @Audit('gate_assigned')
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
  @Audit('gate_removed')
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
}

