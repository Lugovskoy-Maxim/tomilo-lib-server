import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../common/logger/logger.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new LoggerService();

  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
    });
    this.logger.setContext(JwtStrategy.name);
  }

  validate(payload: any) {
    this.logger.log(
      `Validating JWT token with payload: ${JSON.stringify(payload)}`,
    );

    // Проверяем наличие обязательных полей
    if (!payload.userId || !payload.email) {
      this.logger.warn(`Invalid token payload: ${JSON.stringify(payload)}`);
      return null; // Return null to indicate authentication failure
    }

    const user = {
      userId: payload.userId,
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
