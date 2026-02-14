import { Strategy } from 'passport-custom';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import axios, { AxiosError } from 'axios';

const VK_ID_TOKEN_URL = 'https://id.vk.ru/oauth2/auth';
const VK_ID_USER_INFO_URL = 'https://id.vk.ru/oauth2/user_info';

/** Ответ токен-эндпоинта VK ID */
interface VkIdTokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
  user_id: string;
  state: string;
  scope?: string;
}

/** Ответ user_info VK ID (немаскированные данные по access_token) */
interface VkIdUserInfoResponse {
  user: {
    user_id: string;
    first_name: string;
    last_name: string;
    phone?: string;
    email?: string;
    avatar?: string;
    sex?: number; // 0 — не указан, 1 — женский, 2 — мужской
    verified?: boolean;
    birthday?: string;
  };
}

@Injectable()
export class VkIdStrategy extends PassportStrategy(Strategy, 'vk-id') {
  constructor(private authService: AuthService) {
    super();
  }

  async validate(req: any): Promise<any> {
    const { code, code_verifier, device_id, state } = req.body || {};

    if (!code || !code_verifier || !device_id || !state) {
      throw new UnauthorizedException(
        'VK ID: code, code_verifier, device_id and state are required',
      );
    }

    const clientId = process.env.VK_ID_CLIENT_ID;
    const redirectUri = process.env.VK_ID_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      throw new UnauthorizedException(
        'VK ID is not configured (VK_ID_CLIENT_ID, VK_ID_REDIRECT_URI)',
      );
    }

    const tokenParams = new URLSearchParams();
    tokenParams.append('grant_type', 'authorization_code');
    tokenParams.append('code_verifier', code_verifier);
    tokenParams.append('redirect_uri', redirectUri);
    tokenParams.append('code', code);
    tokenParams.append('client_id', clientId);
    tokenParams.append('device_id', device_id);
    tokenParams.append('state', state);

    let tokenResponse: { data: VkIdTokenResponse };
    try {
      tokenResponse = await axios.post(VK_ID_TOKEN_URL, tokenParams, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string; error_description?: string }>;
      const message =
        axiosErr.response?.data?.error_description ||
        axiosErr.response?.data?.error ||
        'VK ID token exchange failed';
      throw new UnauthorizedException(message);
    }

    const { access_token, user_id } = tokenResponse.data;

    const userInfoParams = new URLSearchParams();
    userInfoParams.append('client_id', clientId);
    userInfoParams.append('access_token', access_token);

    let userInfoResponse: { data: VkIdUserInfoResponse };
    try {
      userInfoResponse = await axios.post(VK_ID_USER_INFO_URL, userInfoParams, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string; error_description?: string }>;
      const message =
        axiosErr.response?.data?.error_description ||
        axiosErr.response?.data?.error ||
        'VK ID user info failed';
      throw new UnauthorizedException(message);
    }

    const vkUser = userInfoResponse.data.user;
    const sexMap: Record<number, string | undefined> = {
      0: undefined,
      1: 'female',
      2: 'male',
    };

    const birthDate = vkUser.birthday
      ? this.parseBirthday(vkUser.birthday)
      : undefined;

    const user = await this.authService.validateOAuthUser({
      provider: 'vk_id',
      providerId: vkUser.user_id || user_id,
      email: vkUser.email,
      username: [vkUser.first_name, vkUser.last_name].filter(Boolean).join(' ') || vkUser.user_id,
      firstName: vkUser.first_name,
      lastName: vkUser.last_name,
      birthDate,
      gender: vkUser.sex !== undefined ? sexMap[vkUser.sex] : undefined,
    });

    if (!user) {
      throw new UnauthorizedException('Unable to authenticate user');
    }

    return user;
  }

  private parseBirthday(birthday: string): Date | undefined {
    if (!birthday) return undefined;
    const d = new Date(birthday);
    return isNaN(d.getTime()) ? undefined : d;
  }
}
