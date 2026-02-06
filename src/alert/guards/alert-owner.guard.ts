import { Injectable, CanActivate, ExecutionContext, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../services/prisma.service';

/**
 * AlertOwnerGuard
 * 
 * Verifies that the authenticated user is the creator of the alert.
 * Attaches the alert to the request object for use in the controller.
 * 
 * Usage:
 * @UseGuards(BearerTokenGuard, AlertOwnerGuard)
 * 
 * Task 2.12
 */
@Injectable()
export class AlertOwnerGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const userId = request.session?.userId;
        const alertId = parseInt(request.params.id);

        if (!userId) {
            throw new ForbiddenException('Authentication required');
        }

        if (!alertId || isNaN(alertId)) {
            throw new NotFoundException('Invalid alert ID');
        }

        // Fetch the alert
        const alert = await this.prisma.alert.findUnique({
            where: { id: alertId },
        });

        if (!alert) {
            throw new NotFoundException(`Alert with ID ${alertId} not found`);
        }

        // Verify ownership
        if (alert.creator_id !== userId) {
            throw new ForbiddenException('You do not have permission to access this alert');
        }

        // Attach alert to request for controller use
        request.alert = alert;

        return true;
    }
}
