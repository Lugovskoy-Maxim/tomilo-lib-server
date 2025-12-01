import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
    });
  }

  validate(payload: any) {
    // Проверяем наличие обязательных полей
    if (!payload.userId || !payload.email) {
      throw new Error('Invalid token payload');
    }

    const user = {
      userId: payload.userId,
      email: payload.email,
      username: payload.username || '', // Добавляем значение по умолчанию
      roles: payload.role ? [payload.role] : [], // Используем payload.role и преобразуем в массив
    };

    return user;
  }
}

export default JwtStrategy;
