import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err, user) {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid token');
    }

    console.log('🔐 JwtAuthGuard - Authentication successful, user:', user);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return user;
  }
}
