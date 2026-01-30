import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { LoggerService } from '../../common/logger/logger.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new LoggerService();

  constructor() {
    super();
    this.logger.setContext(JwtAuthGuard.name);
  }

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization;
    this.logger.log(`JWT Auth Guard checking token: ${token}`);

    // Log request details for debugging
    this.logger.log(`Request URL: ${request.url}`);
    this.logger.log(`Request method: ${request.method}`);

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    this.logger.log(`JWT Auth Guard handling request with user: ${user}`);

    if (err) {
      this.logger.warn(`JWT Auth Guard failed with error: ${err.message}`);
      this.logger.warn(`Error details: ${JSON.stringify(err)}`);
      throw new UnauthorizedException('Invalid token');
    }

    if (!user) {
      // Check if it's a missing/empty token issue
      if (info && info.message) {
        const msg = info.message.toLowerCase();
        if (
          msg.includes('no auth token') ||
          msg.includes('jwt expired') ||
          msg.includes('invalid token')
        ) {
          this.logger.warn(`JWT Auth Guard failed: ${info.message}`);
          throw new UnauthorizedException(`Invalid token: ${info.message}`);
        }
      }
      this.logger.warn(
        'JWT Auth Guard failed: User not found or invalid token',
      );
      throw new UnauthorizedException('Invalid token');
    }

    this.logger.log(
      `JWT Auth Guard successful for user: ${user.email} (${user.userId})`,
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return user;
  }
}
