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

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    this.logger.log(`JWT Auth Guard handling request with user: ${user}`);
    if (err) {
      this.logger.warn(`JWT Auth Guard failed with error: ${err.message}`);
      throw new UnauthorizedException('Invalid token');
    }

    if (!user) {
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
