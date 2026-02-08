# MinUserLevel Guard - Implementation Plan

## Quick Overview
This plan outlines the implementation of a `@MinUserLevel(X)` decorator and corresponding guard that validates whether a user's role level meets a minimum threshold.

## What We're Building
- **Decorator**: `@MinUserLevel(level: number)` - Can be applied to classes or methods
- **Guard**: `MinUserLevelGuard` - Validates user role level against the decorator value
- **Behavior**: Lower level numbers = higher privileges (e.g., level 10 > level 50)

## Key Features
✅ Works at both controller and route level  
✅ Method-level decorator overrides class-level  
✅ Supports users with multiple roles (ANY role can satisfy the requirement)  
✅ Integrates with existing BearerTokenGuard  
✅ Returns clear error messages with 403 status  

## Quick Start (After Implementation)
```typescript
// Apply to entire controller
@UseGuards(BearerTokenGuard, MinUserLevelGuard)
@MinUserLevel(50)
@Controller('admin')
export class AdminController {
  // All routes require level <= 50
  
  // Override for specific route
  @MinUserLevel(10)
  @Get('critical-action')
  async criticalAction() {
    // This route requires level <= 10
  }
}
```

## Implementation Steps
1. Create decorator in `src/auth/decorators/min-user-level.decorator.ts`
2. Create guard in `src/auth/guards/min-user-level.guard.ts`
3. Write comprehensive unit tests
4. Write integration tests
5. Update documentation
6. Add example usage

## Technologies Used
- NestJS Guards & Decorators
- Reflector for metadata
- Existing role system with level field
- UserService.userHasMinLevel() helper

## Estimated Effort
- **Development**: 2-3 hours
- **Testing**: 2-3 hours
- **Documentation**: 1-2 hours
- **Total**: 5-8 hours

## Success Metrics
- All tests pass (unit + integration)
- Code coverage >80%
- Documentation complete
- At least one real-world usage example
- Zero breaking changes

## See Also
- [TASK_LIST.md](./TASK_LIST.md) - Detailed task breakdown
- `src/auth/guards/roles.guard.ts` - Similar implementation pattern
- `docs/BEARER_TOKEN_QUICKSTART.md` - Auth system overview
