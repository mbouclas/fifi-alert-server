import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  BearerTokenGuard,
  RolesGuard,
  CurrentUser,
  Roles,
  AllowAnonymous,
  type ITokenUser,
} from '../index';

/**
 * Example controller demonstrating bearer token authentication usage
 *
 * This controller shows different authentication patterns:
 * - Public routes (no authentication)
 * - Protected routes (authentication required)
 * - Role-based routes (specific roles required)
 * - Accessing current user data
 */
@ApiTags('Examples')
@Controller('examples')
export class ExampleController {
  /**
   * Public route - No authentication required
   */
  @Get('public')
  @AllowAnonymous()
  async publicRoute() {
    return {
      message: 'This is a public route accessible to everyone',
    };
  }

  /**
   * Protected route - Authentication required
   * Apply BearerTokenGuard to validate JWT token
   */
  @Get('protected')
  @UseGuards(BearerTokenGuard)
  @ApiBearerAuth()
  async protectedRoute(@CurrentUser() user: ITokenUser) {
    return {
      message: 'This route requires authentication',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles.map((r) => r.slug),
        gates: user.gates.map((g) => g.slug),
      },
    };
  }

  /**
   * Admin-only route - Authentication + Admin role required
   * Apply both BearerTokenGuard and RolesGuard
   */
  @Get('admin')
  @UseGuards(BearerTokenGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  async adminOnlyRoute(@CurrentUser() user: ITokenUser) {
    return {
      message: 'This route is restricted to administrators only',
      adminUser: user,
    };
  }

  /**
   * Multi-role route - Authentication + Any of specified roles required
   * Users with 'admin', 'moderator', or 'editor' role can access
   */
  @Post('content')
  @UseGuards(BearerTokenGuard, RolesGuard)
  @Roles('admin', 'moderator', 'editor')
  @ApiBearerAuth()
  async contentManagement(@CurrentUser() user: ITokenUser) {
    return {
      message: 'Content management action',
      performedBy: {
        id: user.id,
        email: user.email,
        roles: user.roles.map((r) => r.slug),
      },
    };
  }

  /**
   * Feature gate example - Check if user has specific gates
   */
  @Get('premium-feature')
  @UseGuards(BearerTokenGuard)
  @ApiBearerAuth()
  async premiumFeature(@CurrentUser() user: ITokenUser) {
    // Check if user has the 'premium-features' gate
    const hasPremiumAccess = user.gates.some(
      (g) => g.slug === 'premium-features',
    );

    if (!hasPremiumAccess) {
      return {
        message: 'Premium feature access denied',
        upgrade: 'Please upgrade to premium plan',
      };
    }

    return {
      message: 'Premium feature accessed',
      data: {
        /* premium data */
      },
    };
  }

  /**
   * Hybrid authentication - Works with both session cookies and bearer tokens
   * Better-auth session OR JWT bearer token accepted
   */
  @Get('hybrid')
  @ApiBearerAuth()
  async hybridAuth(@CurrentUser() user?: ITokenUser) {
    if (!user) {
      return {
        message: 'Not authenticated',
      };
    }

    return {
      message: 'Authenticated via bearer token or session cookie',
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }

  /**
   * Example: Get user with lowest role level (highest privilege)
   */
  @Get('profile')
  @UseGuards(BearerTokenGuard)
  @ApiBearerAuth()
  async getUserProfile(@CurrentUser() user: ITokenUser) {
    // Find the role with the lowest level (highest privilege)
    const highestRole = user.roles.reduce((prev, current) =>
      current.level < prev.level ? current : prev,
    );

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      primaryRole: highestRole.slug,
      allRoles: user.roles.map((r) => r.slug),
      activeGates: user.gates.map((g) => g.slug),
    };
  }
}
