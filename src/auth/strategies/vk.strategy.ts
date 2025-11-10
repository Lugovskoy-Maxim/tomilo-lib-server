import { Strategy } from 'passport-custom';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import axios from 'axios';

@Injectable()
export class VkStrategy extends PassportStrategy(Strategy, 'vk') {
  constructor(private authService: AuthService) {
    super();
  }

  async validate(req: any): Promise<any> {
    const { code } = req.body;

    if (!code) {
      throw new UnauthorizedException('Authorization code is required');
    }

    // Получаем токен доступа от ВКонтакте
    const tokenResponse = await axios.get(
      `https://oauth.vk.com/access_token?` +
        `client_id=${process.env.VK_CLIENT_ID || ''}&` +
        `client_secret=${process.env.VK_CLIENT_SECRET || ''}&` +
        `redirect_uri=${process.env.VK_REDIRECT_URI || ''}&` +
        `code=${code}`,
    );

    const accessToken = tokenResponse.data.access_token;
    const vkUserId = tokenResponse.data.user_id;

    // Получаем информацию о пользователе
    const userResponse = await axios.get(
      `https://api.vk.com/method/users.get?` +
        `user_ids=${vkUserId}&` +
        `fields=photo_200&` +
        `access_token=${accessToken}&` +
        `v=5.131`,
    );

    const vkUser = userResponse.data.response[0];

    // Проверяем или создаем пользователя в нашей системе
    const user = await this.authService.validateOAuthUser({
      provider: 'vk',
      providerId: vkUser.id.toString(),
      email: vkUser.email, // ВКонтакте может не возвращать email в зависимости от настроек
      username: `${vkUser.first_name} ${vkUser.last_name}`,
    });

    if (!user) {
      throw new UnauthorizedException('Unable to authenticate user');
    }

    return user;
  }
}
