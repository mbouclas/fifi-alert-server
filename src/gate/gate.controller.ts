import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { GateService } from './gate.service';
import { CreateGateDto, UpdateGateDto } from './dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * Gate Controller
 *
 * Manages feature gates (feature flags) that can be assigned to users.
 * All endpoints require admin role.
 */
@ApiTags('Gates')
@ApiBearerAuth()
@Controller('gates')
@UseGuards(RolesGuard)
@Roles('admin')
export class GateController {
  constructor(private readonly gateService: GateService) {}

  /**
   * Create a new gate
   */
  @Post()
  @ApiOperation({
    summary: 'Create a new gate',
    description: 'Creates a new feature gate. Admin only.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Gate created successfully',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Gate with this name already exists',
  })
  async create(@Body() createGateDto: CreateGateDto) {
    return this.gateService.create(createGateDto);
  }

  /**
   * Get all gates
   */
  @Get()
  @ApiOperation({
    summary: 'Get all gates',
    description: 'Retrieves a list of all feature gates. Admin only.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of gates retrieved successfully',
  })
  async findAll() {
    return this.gateService.findAll();
  }

  /**
   * Get a gate by ID
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get a gate by ID',
    description: 'Retrieves a specific gate by its ID. Admin only.',
  })
  @ApiParam({
    name: 'id',
    description: 'Gate ID',
    type: Number,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Gate retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Gate not found',
  })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.gateService.findOne(id);
  }

  /**
   * Get users who have a specific gate
   */
  @Get(':id/users')
  @ApiOperation({
    summary: 'Get users with this gate',
    description:
      'Retrieves all users who have been assigned this gate. Admin only.',
  })
  @ApiParam({
    name: 'id',
    description: 'Gate ID',
    type: Number,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Users retrieved successfully',
  })
  async getUsersWithGate(@Param('id', ParseIntPipe) id: number) {
    return this.gateService.getUsersWithGate(id);
  }

  /**
   * Update a gate
   */
  @Put(':id')
  @ApiOperation({
    summary: 'Update a gate',
    description: 'Updates an existing gate. Admin only.',
  })
  @ApiParam({
    name: 'id',
    description: 'Gate ID',
    type: Number,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Gate updated successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Gate not found',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateGateDto: UpdateGateDto,
  ) {
    return this.gateService.update(id, updateGateDto);
  }

  /**
   * Delete a gate
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a gate',
    description: 'Deletes a gate and all user-gate associations. Admin only.',
  })
  @ApiParam({
    name: 'id',
    description: 'Gate ID',
    type: Number,
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Gate deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Gate not found',
  })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.gateService.remove(id);
  }
}
