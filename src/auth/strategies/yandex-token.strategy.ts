import { Strategy } from 'passport-custom';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import axios from 'axios';

@Injectable()
export class YandexTokenStrategy extends PassportStrategy(
  Strategy,
  'yandex-token',
) {
  constructor(private authService: AuthService) {
    super();
  }

  async validate(req: any): Promise<any> {
    // Извлекаем токен из тела запроса
    const { access_token } = req.body || {};

    if (!access_token) {
      throw new UnauthorizedException('Access token is required');
    }

    // Получаем информацию о пользователе
    const userResponse = await axios.get('https://login.yandex.ru/info', {
      headers: {
        Authorization: `OAuth ${access_token}`,
      },
    });

    const yandexUser = userResponse.data;

    // Проверяем или создаем пользователя в нашей системе
    const user = await this.authService.validateOAuthUser({
      provider: 'yandex',
      providerId: yandexUser.id,
      email: yandexUser.default_email || yandexUser.emails?.[0],
      username: yandexUser.login,
    });

    if (!user) {
      throw new UnauthorizedException('Unable to authenticate user');
    }

    return user;
  }
}
