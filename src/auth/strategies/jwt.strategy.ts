import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../common/logger/logger.service';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new LoggerService();

  constructor(private usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
    });
    this.logger.setContext(JwtStrategy.name);

    // Log the JWT secret being used (without revealing the actual secret)
    const secretSource = process.env.JWT_SECRET
      ? 'environment variable'
      : 'default value';
    this.logger.log(
      `JWT Strategy initialized with secret from ${secretSource}`,
    );
  }

  async validate(payload: any) {
    this.logger.log(
      `Validating JWT token with payload: ${JSON.stringify(payload)}`,
    );

    // Check if all required fields are present
    if (!payload.userId || !payload.email) {
      this.logger.warn(`Invalid token payload: ${JSON.stringify(payload)}`);
      return null; // Return null to indicate authentication failure
    }

    // Проверяем наличие обязательных полей
    if (!payload.userId || !payload.email) {
      this.logger.warn(`Invalid token payload: ${JSON.stringify(payload)}`);
      return null; // Return null to indicate authentication failure
    }

    // Проверяем, существует ли пользователь в базе данных
    try {
      const existingUser = await this.usersService.findById(payload.userId);
      if (!existingUser) {
        this.logger.warn(`User not found in database: ${payload.userId}`);
        return null; // Return null to indicate authentication failure
      }
    } catch (error) {
      this.logger.warn(`Error checking user existence: ${error.message}`);
      return null; // Return null to indicate authentication failure
    }

    const user = {
      userId: payload.userId,
      email: payload.email,
      username: payload.username || '', // Добавляем значение по умолчанию
      role: payload.role ? [payload.role] : [], // Используем payload.role и преобразуем в массив
    };

    this.logger.log(
      `JWT token validated successfully for user: ${user.email} (${user.userId}) with roles: ${user.role.join(', ')}`,
    );
    return user;
  }
}

export default JwtStrategy;
