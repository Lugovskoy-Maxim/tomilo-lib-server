import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Request,
  Response,
  HttpCode,
  HttpStatus,
  ConflictException,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import * as express from 'express';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { ApiResponseDto } from '../common/dto/api-response.dto';
import { AuthGuard } from '@nestjs/passport';
import { OAuthLoginDto } from './dto/oauth-login.dto';
import { VkIdLoginDto } from './dto/vk-id-login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RegisterWithCodeDto } from './dto/register-with-code.dto';

const COOKIE_ACCESS_TOKEN = 'access_token';
const COOKIE_REFRESH_TOKEN = 'refresh_token';
const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000; // 15 min
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function setAuthCookies(
  res: express.Response,
  accessToken: string,
  refreshToken: string,
) {
  const isProduction = process.env.NODE_ENV === 'production';
  // В production: SameSite=None и Secure для отправки cookies при cross-origin (фронт и API на разных поддоменах/портах)
  const cookieOptions = {
    httpOnly: true,
    sameSite: (isProduction ? 'none' : 'lax') as 'lax' | 'none',
    secure: isProduction,
  };
  res.cookie(COOKIE_ACCESS_TOKEN, accessToken, {
    ...cookieOptions,
    maxAge: ACCESS_TOKEN_MAX_AGE_MS,
  });
  res.cookie(COOKIE_REFRESH_TOKEN, refreshToken, {
    ...cookieOptions,
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Request() req,
    @Response({ passthrough: true }) res: express.Response,
  ): ApiResponseDto<any> {
    try {
      const data = this.authService.login(req.user);
      setAuthCookies(res, data.access_token, data.refresh_token);

      return {
        success: true,
        data,
        message: 'Login successful',
        timestamp: new Date().toISOString(),
        path: 'auth/login',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Login failed',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'auth/login',
        method: 'POST',
      };
    }
  }

  /** Шаг 1: запрос кода на email (форма: email, username, password). Не чаще раза в минуту. */
  @Post('send-registration-code')
  @HttpCode(HttpStatus.OK)
  async sendRegistrationCode(
    @Body() createUserDto: CreateUserDto,
    @Response({ passthrough: true }) res: express.Response,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.authService.requestRegistrationCode(createUserDto);
      return {
        success: true,
        data,
        message: 'Код отправлен на email',
        timestamp: new Date().toISOString(),
        path: 'auth/send-registration-code',
        method: 'POST',
      };
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429) {
        res.status(HttpStatus.TOO_MANY_REQUESTS);
        return {
          success: false,
          message: error.message,
          errors: [error.message],
          timestamp: new Date().toISOString(),
          path: 'auth/send-registration-code',
          method: 'POST',
        };
      }
      if (error instanceof ConflictException) {
        return {
          success: false,
          message: error.message,
          errors: [error.message],
          timestamp: new Date().toISOString(),
          path: 'auth/send-registration-code',
          method: 'POST',
        };
      }
      return {
        success: false,
        message: 'Failed to send code',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'auth/send-registration-code',
        method: 'POST',
      };
    }
  }

  /** Шаг 2: регистрация с кодом из письма (форма + code). Создаёт пользователя и логинит. */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() registerDto: RegisterWithCodeDto,
    @Response({ passthrough: true }) res: express.Response,
  ): Promise<ApiResponseDto<any>> {
    try {
      const user = await this.authService.registerWithCode(registerDto);
      const data = this.authService.login(user);
      setAuthCookies(res, data.access_token, data.refresh_token);
      return {
        success: true,
        data,
        message: 'Registration successful',
        timestamp: new Date().toISOString(),
        path: 'auth/register',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Registration failed',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'auth/register',
        method: 'POST',
      };
    }
  }

  @UseGuards(AuthGuard('yandex'))
  @Post('yandex')
  @HttpCode(HttpStatus.OK)
  yandexLogin(
    @Body() oauthLoginDto: OAuthLoginDto,
    @Request() req,
    @Response({ passthrough: true }) res: express.Response,
  ): ApiResponseDto<any> {
    try {
      const data = this.authService.login(req.user);
      setAuthCookies(res, data.access_token, data.refresh_token);

      return {
        success: true,
        data,
        message: 'Yandex login successful',
        timestamp: new Date().toISOString(),
        path: 'auth/yandex',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Yandex login failed',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'auth/yandex',
        method: 'POST',
      };
    }
  }

  @UseGuards(AuthGuard('yandex-token'))
  @Post('yandex-token')
  @HttpCode(HttpStatus.OK)
  yandexTokenLogin(
    @Request() req,
    @Response({ passthrough: true }) res: express.Response,
  ): ApiResponseDto<any> {
    try {
      const data = this.authService.login(req.user);
      setAuthCookies(res, data.access_token, data.refresh_token);

      return {
        success: true,
        data,
        message: 'Yandex login successful',
        timestamp: new Date().toISOString(),
        path: 'auth/yandex-token',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Yandex login failed',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'auth/yandex-token',
        method: 'POST',
      };
    }
  }

  @UseGuards(AuthGuard('vk'))
  @Post('vk')
  @HttpCode(HttpStatus.OK)
  vkLogin(
    @Body() oauthLoginDto: OAuthLoginDto,
    @Request() req,
    @Response({ passthrough: true }) res: express.Response,
  ): ApiResponseDto<any> {
    try {
      const data = this.authService.login(req.user);
      setAuthCookies(res, data.access_token, data.refresh_token);

      return {
        success: true,
        data,
        message: 'VK login successful',
        timestamp: new Date().toISOString(),
        path: 'auth/vk',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'VK login failed',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'auth/vk',
        method: 'POST',
      };
    }
  }

  @UseGuards(AuthGuard('vk-id'))
  @Post('vk-id')
  @HttpCode(HttpStatus.OK)
  vkIdLogin(
    @Body() vkIdLoginDto: VkIdLoginDto,
    @Request() req,
    @Response({ passthrough: true }) res: express.Response,
  ): ApiResponseDto<any> {
    try {
      const data = this.authService.login(req.user);
      setAuthCookies(res, data.access_token, data.refresh_token);

      return {
        success: true,
        data,
        message: 'VK ID login successful',
        timestamp: new Date().toISOString(),
        path: 'auth/vk-id',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'VK ID login failed',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'auth/vk-id',
        method: 'POST',
      };
    }
  }

  /** Alias for vk-id: POST /api/auth/vk-token (same body: code, code_verifier, device_id, state). */
  @UseGuards(AuthGuard('vk-id'))
  @Post('vk-token')
  @HttpCode(HttpStatus.OK)
  vkTokenLogin(
    @Body() vkIdLoginDto: VkIdLoginDto,
    @Request() req,
    @Response({ passthrough: true }) res: express.Response,
  ): ApiResponseDto<any> {
    try {
      const data = this.authService.login(req.user);
      setAuthCookies(res, data.access_token, data.refresh_token);

      return {
        success: true,
        data,
        message: 'VK ID login successful',
        timestamp: new Date().toISOString(),
        path: 'auth/vk-token',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'VK ID login failed',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'auth/vk-token',
        method: 'POST',
      };
    }
  }

  /** Привязать ВКонтакте к текущему аккаунту (JWT). Тело: классический VK — { code [, redirect_uri ] }; VK ID (code_v2) — { code, code_verifier, device_id, state [, redirect_uri ] }. При конфликте + resolve: 'use_existing'|'link_here'|'merge'. */
  @UseGuards(JwtAuthGuard)
  @Post('link/vk')
  @HttpCode(HttpStatus.OK)
  async linkVk(
    @Request() req,
    @Response({ passthrough: true }) res: express.Response,
    @Body() body: {
      code: string;
      redirect_uri?: string;
      code_verifier?: string;
      device_id?: string;
      state?: string;
      resolve?: 'use_existing' | 'link_here' | 'merge';
    },
  ): Promise<ApiResponseDto<any>> {
    if (!body?.code) {
      throw new UnauthorizedException('Authorization code is required');
    }
    const useVkId =
      !!body.code_verifier?.trim() &&
      !!body.device_id?.trim() &&
      !!body.state?.trim();
    const providerId = useVkId
      ? await this.authService.getVkIdProviderId(
          body.code,
          body.code_verifier!,
          body.device_id!,
          body.state!,
          body.redirect_uri,
        )
      : await this.authService.getVkProviderId(body.code, body.redirect_uri);
    const provider: 'vk' | 'vk_id' = useVkId ? 'vk_id' : 'vk';
    const userId = String(req.user?.userId ?? req.user?._id ?? '');

    if (body.resolve) {
      const result = await this.authService.resolveLinkConflict(
        userId,
        provider,
        providerId,
        body.resolve,
      );
      if (result.switchToUser) {
        setAuthCookies(res, result.switchToUser.access_token, result.switchToUser.refresh_token);
        return {
          success: true,
          data: result.switchToUser,
          message: 'Switched to existing account',
          timestamp: new Date().toISOString(),
          path: 'auth/link/vk',
          method: 'POST',
        };
      }
      return {
        success: true,
        data: { linked: true },
        message: 'VK account linked',
        timestamp: new Date().toISOString(),
        path: 'auth/link/vk',
        method: 'POST',
      };
    }

    const linkResult = await this.authService.linkProvider(userId, provider, providerId);
    if ('conflict' in linkResult && linkResult.conflict) {
      res.status(HttpStatus.CONFLICT);
      return {
        success: false,
        data: { conflict: true, existingAccount: linkResult.existingAccount },
        message: 'This VK is already linked to another account',
        timestamp: new Date().toISOString(),
        path: 'auth/link/vk',
        method: 'POST',
      } as ApiResponseDto<any>;
    }
    return {
      success: true,
      data: { linked: true },
      message: 'VK account linked',
      timestamp: new Date().toISOString(),
      path: 'auth/link/vk',
      method: 'POST',
    };
  }

  /** Привязать Яндекс к текущему аккаунту (JWT). Тело: { code } или { access_token }, при конфликте + resolve: 'use_existing'|'link_here'|'merge'. */
  @UseGuards(JwtAuthGuard)
  @Post('link/yandex')
  @HttpCode(HttpStatus.OK)
  async linkYandex(
    @Request() req,
    @Response({ passthrough: true }) res: express.Response,
    @Body() body: {
      code?: string;
      access_token?: string;
      resolve?: 'use_existing' | 'link_here' | 'merge';
    },
  ): Promise<ApiResponseDto<any>> {
    if (!body?.code && !body?.access_token) {
      throw new UnauthorizedException('code or access_token is required');
    }
    const providerId = await this.authService.getYandexProviderId({
      code: body.code,
      access_token: body.access_token,
    });
    const userId = String(req.user?.userId ?? req.user?._id ?? '');

    if (body.resolve) {
      const result = await this.authService.resolveLinkConflict(
        userId,
        'yandex',
        providerId,
        body.resolve,
      );
      if (result.switchToUser) {
        setAuthCookies(res, result.switchToUser.access_token, result.switchToUser.refresh_token);
        return {
          success: true,
          data: result.switchToUser,
          message: 'Switched to existing account',
          timestamp: new Date().toISOString(),
          path: 'auth/link/yandex',
          method: 'POST',
        };
      }
      return {
        success: true,
        data: { linked: true },
        message: 'Yandex account linked',
        timestamp: new Date().toISOString(),
        path: 'auth/link/yandex',
        method: 'POST',
      };
    }

    const linkResult = await this.authService.linkProvider(userId, 'yandex', providerId);
    if ('conflict' in linkResult && linkResult.conflict) {
      res.status(HttpStatus.CONFLICT);
      return {
        success: false,
        data: { conflict: true, existingAccount: linkResult.existingAccount },
        message: 'This Yandex account is already linked to another account',
        timestamp: new Date().toISOString(),
        path: 'auth/link/yandex',
        method: 'POST',
      } as ApiResponseDto<any>;
    }
    return {
      success: true,
      data: { linked: true },
      message: 'Yandex account linked',
      timestamp: new Date().toISOString(),
      path: 'auth/link/yandex',
      method: 'POST',
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Request() req,
    @Body() body: { refresh_token?: string },
    @Response({ passthrough: true }) res: express.Response,
  ): Promise<ApiResponseDto<any>> {
    const refreshToken =
      req.cookies?.[COOKIE_REFRESH_TOKEN] ?? body?.refresh_token;
    const data = await this.authService.refreshTokens(refreshToken);
    if (!data) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    setAuthCookies(res, data.access_token, data.refresh_token);
    return {
      success: true,
      data,
      message: 'Tokens refreshed',
      timestamp: new Date().toISOString(),
      path: 'auth/refresh',
      method: 'POST',
    };
  }

  @Post('send-verification-email')
  @HttpCode(HttpStatus.OK)
  async sendEmailVerification(
    @Body() emailDto: { email: string },
  ): Promise<ApiResponseDto<any>> {
    try {
      await this.authService.sendEmailVerification(emailDto.email);
      return {
        success: true,
        message: 'Verification email sent successfully',
        timestamp: new Date().toISOString(),
        path: 'auth/send-verification-email',
        method: 'POST',
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        return {
          success: false,
          message: 'User not found',
          errors: [error.message],
          timestamp: new Date().toISOString(),
          path: 'auth/send-verification-email',
          method: 'POST',
        };
      }
      return {
        success: false,
        message: 'Failed to send verification email',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'auth/send-verification-email',
        method: 'POST',
      };
    }
  }

  @Post('verify-email/token')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body() tokenDto: { token: string },
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.authService.verifyEmail(tokenDto.token);
      return {
        success: true,
        data,
        message: 'Email verified successfully',
        timestamp: new Date().toISOString(),
        path: 'auth/verify-email/token',
        method: 'POST',
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        return {
          success: false,
          message: 'Invalid verification token',
          errors: [error.message],
          timestamp: new Date().toISOString(),
          path: 'auth/verify-email/token',
          method: 'POST',
        };
      }
      return {
        success: false,
        message: 'Failed to verify email',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'auth/verify-email/token',
        method: 'POST',
      };
    }
  }

  @Get('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmailGet(
    @Query('token') token: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.authService.verifyEmail(token);
      return {
        success: true,
        data,
        message: 'Email verified successfully',
        timestamp: new Date().toISOString(),
        path: 'auth/verify-email',
        method: 'GET',
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        return {
          success: false,
          message: 'Invalid verification token',
          errors: [error.message],
          timestamp: new Date().toISOString(),
          path: 'auth/verify-email',
          method: 'GET',
        };
      }
      return {
        success: false,
        message: 'Failed to verify email',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'auth/verify-email',
        method: 'GET',
      };
    }
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async sendPasswordReset(
    @Body() emailDto: { email: string },
  ): Promise<ApiResponseDto<any>> {
    try {
      await this.authService.sendPasswordReset(emailDto.email);
      return {
        success: true,
        message: 'Password reset email sent successfully',
        timestamp: new Date().toISOString(),
        path: 'auth/forgot-password',
        method: 'POST',
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        return {
          success: false,
          message: 'User not found',
          errors: [error.message],
          timestamp: new Date().toISOString(),
          path: 'auth/forgot-password',
          method: 'POST',
        };
      }
      return {
        success: false,
        message: 'Failed to send password reset email',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'auth/forgot-password',
        method: 'POST',
      };
    }
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() resetDto: ResetPasswordDto,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.authService.resetPassword(
        resetDto.token,
        resetDto.password,
      );
      return {
        success: true,
        data,
        message: 'Password reset successfully',
        timestamp: new Date().toISOString(),
        path: 'auth/reset-password',
        method: 'POST',
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        return {
          success: false,
          message: 'Invalid or expired reset token',
          errors: [error.message],
          timestamp: new Date().toISOString(),
          path: 'auth/reset-password',
          method: 'POST',
        };
      }
      return {
        success: false,
        message: 'Failed to reset password',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'auth/reset-password',
        method: 'POST',
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Request() req,
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.authService.changePassword(
        req.user.userId,
        changePasswordDto.currentPassword,
        changePasswordDto.newPassword,
      );
      return {
        success: true,
        data,
        message: 'Password changed successfully',
        timestamp: new Date().toISOString(),
        path: 'auth/change-password',
        method: 'POST',
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        return {
          success: false,
          message: 'Invalid old password or user not found',
          errors: [error.message],
          timestamp: new Date().toISOString(),
          path: 'auth/change-password',
          method: 'POST',
        };
      }
      return {
        success: false,
        message: 'Failed to change password',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'auth/change-password',
        method: 'POST',
      };
    }
  }
}
