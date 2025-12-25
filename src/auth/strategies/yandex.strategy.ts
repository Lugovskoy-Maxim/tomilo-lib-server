import { Strategy } from 'passport-custom';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import axios from 'axios';

@Injectable()
export class YandexStrategy extends PassportStrategy(Strategy, 'yandex') {
  constructor(private authService: AuthService) {
    super();
  }

  async validate(req: any): Promise<any> {
    // Для GET запросов (callback) извлекаем код из query параметров
    let { code } = req.body || {};
    const { access_token } = req.body || {};

    // Если это GET запрос (callback), код будет в query параметрах
    if (req.method === 'GET' && req.query && req.query.code) {
      code = req.query.code;
    }

    let accessToken = access_token;

    // Если передан код авторизации, обмениваем его на токен доступа
    if (code && !accessToken) {
      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('code', code);
      params.append('client_id', process.env.YANDEX_CLIENT_ID || '');
      params.append('client_secret', process.env.YANDEX_CLIENT_SECRET || '');

      const tokenResponse = await axios.post(
        'https://oauth.yandex.ru/token',
        params,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      accessToken = tokenResponse.data.access_token;
    }

    if (!accessToken) {
      throw new UnauthorizedException(
        'Authorization code or access token is required',
      );
    }

    // Получаем информацию о пользователе
    const userResponse = await axios.get('https://login.yandex.ru/info', {
      headers: {
        Authorization: `OAuth ${accessToken}`,
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
