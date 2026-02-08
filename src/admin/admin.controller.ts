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
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { UserService } from '../user/user.service';
import { TokenService } from '../auth/services/token.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MinUserLevelGuard } from '../auth/guards/min-user-level.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinUserLevel } from '../auth/decorators/min-user-level.decorator';
import { PrismaService } from '../services/prisma.service';

/**
 * Admin Controller
 *
 * Admin-only endpoints for user management, session management, and system operations.
 * All endpoints require admin role. Specific operations require minimum user levels
 * (lower level = higher privilege):
 * - Level 10: Super admin operations (ban users, manage roles)
 * - Level 50: Moderate admin operations (revoke sessions)
 * - Level 100: Basic admin operations (view statistics, list sessions)
 */
@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(RolesGuard, MinUserLevelGuard)
@Roles('admin')
@MinUserLevel(100) // Default: all admins can access
export class AdminController {
  constructor(
    private readonly userService: UserService,
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
  ) { }

  // ==================== User Management ====================

  /**
   * Ban a user
   * 
   * Requires super admin privileges (level <= 10)
   */
  @Post('users/:id/ban')
  @HttpCode(HttpStatus.OK)
  @MinUserLevel(10)
  @ApiOperation({
    summary: 'Ban a user',
    description:
      'Bans a user account with optional reason and expiration. Super admin only (level <= 10).',
  })
  @ApiParam({ name: 'id', description: 'User ID', type: Number })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', example: 'Violation of terms of service' },
        expiresInMinutes: {
          type: 'number',
          example: 1440,
          description: 'Ban duration in minutes. Omit for permanent ban.',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User banned successfully',
  })
  async banUser(
    @Param('id', ParseIntPipe) userId: number,
    @Body() body: { reason?: string; expiresInMinutes?: number },
  ) {
    const user = await this.userService.findOne({ id: userId });
    if (!user) {
      throw new Error('User not found');
    }

    const banExpires = body.expiresInMinutes
      ? new Date(Date.now() + body.expiresInMinutes * 60 * 1000)
      : null;

    await this.userService.update({ id: userId }, {
      banned: true,
      banReason: body.reason || 'Banned by administrator',
      banExpires,
    } as any);

    return {
      message: 'User banned successfully',
      userId,
      banReason: body.reason || 'Banned by administrator',
      banExpires: banExpires?.toISOString() || 'permanent',
    };
  }

  /**
   * Unban a user
   * 
   * Requires super admin privileges (level <= 10)
   */
  @Post('users/:id/unban')
  @HttpCode(HttpStatus.OK)
  @MinUserLevel(10)
  @ApiOperation({
    summary: 'Unban a user',
    description: 'Removes ban from a user account. Super admin only (level <= 10).',
  })
  @ApiParam({ name: 'id', description: 'User ID', type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User unbanned successfully',
  })
  async unbanUser(@Param('id', ParseIntPipe) userId: number) {
    const user = await this.userService.findOne({ id: userId });
    if (!user) {
      throw new Error('User not found');
    }

    await this.userService.update({ id: userId }, {
      banned: false,
      banReason: null,
      banExpires: null,
    } as any);

    return {
      message: 'User unbanned successfully',
      userId,
    };
  }

  // ==================== Session Management ====================

  /**
   * List all active sessions
   */
  @Get('sessions')
  @ApiOperation({
    summary: 'List all active sessions',
    description: 'Retrieves all active user sessions. Admin only.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Sessions retrieved successfully',
  })
  async listSessions(
    @Query('userId') userId?: string,
    @Query('limit') limit: string = '50',
  ) {
    const where: any = {
      revoked: false,
    };

    if (userId) {
      where.userId = parseInt(userId, 10);
    }

    const sessions = await this.prisma.session.findMany({
      where,
      take: parseInt(limit, 10),
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    return {
      sessions,
      count: sessions.length,
    };
  }

  /**
   * Revoke a specific session
   * 
   * Requires moderate admin privileges (level <= 50)
   */
  @Post('sessions/:sessionId/revoke')
  @HttpCode(HttpStatus.OK)
  @MinUserLevel(50)
  @ApiOperation({
    summary: 'Revoke a session',
    description: 'Revokes a specific session by ID. Moderate admin only (level <= 50).',
  })
  @ApiParam({ name: 'sessionId', description: 'Session ID', type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Session revoked successfully',
  })
  async revokeSession(@Param('sessionId') sessionId: string) {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        revoked: true,
        revokedAt: new Date(),
      },
    });

    return {
      message: 'Session revoked successfully',
      sessionId,
    };
  }

  /**
   * Revoke all sessions for a user
   * 
   * Requires moderate admin privileges (level <= 50)
   */
  @Post('users/:id/revoke-sessions')
  @HttpCode(HttpStatus.OK)
  @MinUserLevel(50)
  @ApiOperation({
    summary: 'Revoke all user sessions',
    description: 'Revokes all active sessions for a specific user. Moderate admin only (level <= 50).',
  })
  @ApiParam({ name: 'id', description: 'User ID', type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Sessions revoked successfully',
  })
  async revokeUserSessions(@Param('id', ParseIntPipe) userId: number) {
    const revokedCount = await this.tokenService.revokeAllUserTokens(userId);

    return {
      message: 'All user sessions revoked successfully',
      userId,
      revokedCount,
    };
  }

  // ==================== Role Management ====================

  /**
   * Assign a role to a user
   * 
   * Requires super admin privileges (level <= 10)
   */
  @Post('users/:id/roles')
  @HttpCode(HttpStatus.CREATED)
  @MinUserLevel(10)
  @ApiOperation({
    summary: 'Assign role to user',
    description: 'Assigns a role to a user. Super admin only (level <= 10).',
  })
  @ApiParam({ name: 'id', description: 'User ID', type: Number })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['roleId'],
      properties: {
        roleId: { type: 'number', example: 1 },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Role assigned successfully',
  })
  async assignRole(
    @Param('id', ParseIntPipe) userId: number,
    @Body() body: { roleId: number },
  ) {
    // Check if user exists
    const user = await this.userService.findOne({ id: userId });
    if (!user) {
      throw new Error('User not found');
    }

    // Check if role exists
    const role = await this.prisma.role.findUnique({
      where: { id: body.roleId },
    });
    if (!role) {
      throw new Error('Role not found');
    }

    // Check if user already has this role
    const existingUserRole = await this.prisma.userRole.findUnique({
      where: {
        user_id_role_id: {
          user_id: userId,
          role_id: body.roleId,
        },
      },
    });

    if (existingUserRole) {
      throw new Error('User already has this role');
    }

    // Assign the role
    const userRole = await this.prisma.userRole.create({
      data: {
        user_id: userId,
        role_id: body.roleId,
      },
      include: {
        role: true,
      },
    });

    return {
      message: 'Role assigned successfully',
      userId,
      role: userRole.role,
    };
  }

  /**
   * Remove a role from a user
   * 
   * Requires super admin privileges (level <= 10)
   */
  @Delete('users/:id/roles/:roleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @MinUserLevel(10)
  @ApiOperation({
    summary: 'Remove role from user',
    description: 'Removes a role from a user. Super admin only (level <= 10).',
  })
  @ApiParam({ name: 'id', description: 'User ID', type: Number })
  @ApiParam({ name: 'roleId', description: 'Role ID', type: Number })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Role removed successfully',
  })
  async removeRole(
    @Param('id', ParseIntPipe) userId: number,
    @Param('roleId', ParseIntPipe) roleId: number,
  ) {
    // Check if user has this role
    const userRole = await this.prisma.userRole.findUnique({
      where: {
        user_id_role_id: {
          user_id: userId,
          role_id: roleId,
        },
      },
    });

    if (!userRole) {
      throw new Error('User does not have this role');
    }

    // Remove the role
    await this.prisma.userRole.delete({
      where: {
        user_id_role_id: {
          user_id: userId,
          role_id: roleId,
        },
      },
    });
  }

  // ==================== System Statistics ====================

  /**
   * Get system statistics
   */
  @Get('stats')
  @ApiOperation({
    summary: 'Get system statistics',
    description: 'Retrieves system-wide statistics. Admin only.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Statistics retrieved successfully',
  })
  async getStats() {
    const [totalUsers, bannedUsers, activeSessions, totalRoles, totalGates] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { banned: true } }),
        this.prisma.session.count({ where: { revoked: false } }),
        this.prisma.role.count(),
        this.prisma.gate.count(),
      ]);

    return {
      users: {
        total: totalUsers,
        banned: bannedUsers,
        active: totalUsers - bannedUsers,
      },
      sessions: {
        active: activeSessions,
      },
      roles: {
        total: totalRoles,
      },
      gates: {
        total: totalGates,
      },
    };
  }

  /**
   * Get comprehensive dashboard data
   */
  @Get('dashboard')
  @ApiOperation({
    summary: 'Get admin dashboard data',
    description:
      'Retrieves comprehensive dashboard statistics including user metrics, session analytics, gate usage, and role distribution. Admin only.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Dashboard data retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        users: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            banned: { type: 'number' },
            active: { type: 'number' },
            recent: {
              type: 'number',
              description: 'Users created in last 7 days',
            },
          },
        },
        sessions: {
          type: 'object',
          properties: {
            active: { type: 'number' },
            revoked: { type: 'number' },
            expired: { type: 'number' },
            recent: {
              type: 'number',
              description: 'Sessions created in last 24 hours',
            },
          },
        },
        gates: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            active: { type: 'number' },
            inactive: { type: 'number' },
            topUsed: { type: 'array', description: 'Most assigned gates' },
          },
        },
        roles: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            distribution: { type: 'array', description: 'User count per role' },
          },
        },
      },
    },
  })
  async getDashboard() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // User statistics
    const [totalUsers, bannedUsers, recentUsers] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { banned: true } }),
      this.prisma.user.count({
        where: { createdAt: { gte: sevenDaysAgo } },
      }),
    ]);

    // Session statistics
    const [activeSessions, revokedSessions, expiredSessions, recentSessions] =
      await Promise.all([
        this.prisma.session.count({
          where: { revoked: false, expiresAt: { gt: now } },
        }),
        this.prisma.session.count({ where: { revoked: true } }),
        this.prisma.session.count({
          where: { revoked: false, expiresAt: { lte: now } },
        }),
        this.prisma.session.count({
          where: { createdAt: { gte: oneDayAgo } },
        }),
      ]);

    // Gate statistics
    const [totalGates, activeGates, gateUsage] = await Promise.all([
      this.prisma.gate.count(),
      this.prisma.gate.count({ where: { active: true } }),
      this.prisma.gate.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          active: true,
          _count: {
            select: { users: true },
          },
        },
        orderBy: {
          users: { _count: 'desc' },
        },
        take: 10,
      }),
    ]);

    // Role distribution
    const roleDistribution = await this.prisma.role.findMany({
      select: {
        id: true,
        name: true,
        level: true,
        _count: {
          select: { users: true },
        },
      },
      orderBy: { level: 'desc' },
    });

    return {
      users: {
        total: totalUsers,
        banned: bannedUsers,
        active: totalUsers - bannedUsers,
        recent: recentUsers,
      },
      sessions: {
        active: activeSessions,
        revoked: revokedSessions,
        expired: expiredSessions,
        recent: recentSessions,
      },
      gates: {
        total: totalGates,
        active: activeGates,
        inactive: totalGates - activeGates,
        topUsed: gateUsage.map((gate) => ({
          id: gate.id,
          name: gate.name,
          slug: gate.slug,
          active: gate.active,
          userCount: gate._count.users,
        })),
      },
      roles: {
        total: roleDistribution.length,
        distribution: roleDistribution.map((role) => ({
          id: role.id,
          name: role.name,
          level: role.level,
          userCount: role._count.users,
        })),
      },
      timestamp: now.toISOString(),
    };
  }
}
