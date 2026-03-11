import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../common/logger/logger.service';
import { UsersService } from '../../users/users.service';
import { getJwtSecret } from '../../config/jwt.config';

const COOKIE_ACCESS_TOKEN = 'access_token';

/** Extract JWT: prefer Authorization Bearer (reliable cross-origin), then cookie. */
function jwtFromCookieOrHeader(req: any): string | null {
  const fromHeader = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (fromHeader) return fromHeader;
  return req?.cookies?.[COOKIE_ACCESS_TOKEN] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new LoggerService();

  constructor(private usersService: UsersService) {
    super({
      jwtFromRequest: jwtFromCookieOrHeader,
      ignoreExpiration: false,
      secretOrKeyProvider: (_req, _token, done) => {
        try {
          done(null, getJwtSecret());
        } catch (e) {
          done(e as Error, undefined);
        }
      },
      algorithms: ['HS256'],
    });
    this.logger.setContext(JwtStrategy.name);

    const secretSource = process.env.JWT_SECRET
      ? 'environment variable'
      : 'dev default';
    this.logger.log(
      `JWT Strategy initialized with secret from ${secretSource}`,
    );
  }

  async validate(payload: any) {
    this.logger.log(
      `Validating JWT token with payload: ${JSON.stringify(payload)}`,
    );

    const userId =
      typeof payload.userId === 'string'
        ? payload.userId
        : payload.userId?.toString?.();
    if (!userId || !payload.email) {
      this.logger.warn(`Invalid token payload: ${JSON.stringify(payload)}`);
      return null;
    }

    try {
      const existingUser = await this.usersService.findById(userId);
      if (!existingUser) {
        this.logger.warn(`User not found in database: ${userId}`);
        return null;
      }
    } catch (error) {
      this.logger.warn(`Error checking user existence: ${error.message}`);
      return null;
    }

    const user = {
      userId,
      email: payload.email,
      username: payload.username || '', // Добавляем значение по умолчанию
      roles: payload.role ? [payload.role] : [], // Используем payload.role и преобразуем в массив
    };

    this.logger.log(
      `JWT token validated successfully for user: ${user.email} (${user.userId}) with roles: ${user.roles.join(', ')}`,
    );
    return user;
  }
}

export default JwtStrategy;
