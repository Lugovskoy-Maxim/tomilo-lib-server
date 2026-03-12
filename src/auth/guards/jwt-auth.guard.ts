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
    const authHeader = request.headers.authorization;
    // Не логируем сам токен — попадает в логи и может быть украден (как в HttpExceptionFilter)
    const tokenInfo =
      process.env.NODE_ENV === 'production'
        ? authHeader
          ? 'present'
          : 'absent'
        : authHeader
          ? `present (length ${authHeader?.length ?? 0})`
          : 'absent';
    this.logger.log(`JWT Auth Guard token: ${tokenInfo}`);

    this.logger.log(`Request URL: ${request.url}`);
    this.logger.log(`Request method: ${request.method}`);

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    this.logger.log(
      `JWT Auth Guard handling request with user: ${user?.email ?? 'unknown'} (${user?.userId ?? 'n/a'})`,
    );

    if (err) {
      const errMessage =
        err instanceof Error ? err.message : String(err ?? 'unknown');
      this.logger.warn(`JWT Auth Guard verify error: ${errMessage}`);
      throw new UnauthorizedException('Invalid token');
    }

    if (!user) {
      const infoMsg = info?.message ?? '';
      this.logger.warn(
        `JWT Auth Guard no user (strategy returned null). info: ${infoMsg}`,
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
