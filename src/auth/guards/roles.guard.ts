import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { LoggerService } from '../../common/logger/logger.service';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new LoggerService();

  constructor(private reflector: Reflector) {
    this.logger.setContext(RolesGuard.name);
  }

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    this.logger.log(
      `Roles Guard checking required roles: ${requiredRoles?.join(', ') || 'none'}`,
    );

    if (!requiredRoles) {
      this.logger.log('No roles required, allowing access');
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      this.logger.warn('User not authenticated');
      throw new ForbiddenException('User not authenticated');
    }

    this.logger.log(
      `User roles: ${user.roles?.join(', ') || 'none'}, Required roles: ${requiredRoles.join(', ')}`,
    );

    const hasRole = requiredRoles.some((role) => user.roles?.includes(role));

    if (!hasRole) {
      this.logger.warn(
        `User ${user.email} (${user.userId}) does not have required roles: ${requiredRoles.join(', ')}`,
      );
      throw new ForbiddenException('Insufficient permissions');
    }

    this.logger.log(
      `User ${user.email} (${user.userId}) has required role, access granted`,
    );
    return true;
  }
}
