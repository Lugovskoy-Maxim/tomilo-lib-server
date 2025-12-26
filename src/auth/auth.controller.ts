import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { ApiResponseDto } from '../common/dto/api-response.dto';
import { AuthGuard } from '@nestjs/passport';
import { OAuthLoginDto } from './dto/oauth-login.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Request() req): ApiResponseDto<any> {
    try {
      const data = this.authService.login(req.user);

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

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() createUserDto: CreateUserDto,
  ): Promise<ApiResponseDto<any>> {
    try {
      const user = await this.authService.register(createUserDto);
      const data = this.authService.login(user);

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
  ): ApiResponseDto<any> {
    try {
      const data = this.authService.login(req.user);

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
  yandexTokenLogin(@Request() req): ApiResponseDto<any> {
    try {
      const data = this.authService.login(req.user);

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
  ): ApiResponseDto<any> {
    try {
      const data = this.authService.login(req.user);

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

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body('email') email: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      if (!email) {
        throw new BadRequestException('Email is required');
      }

      await this.authService.forgotPassword(email);

      return {
        success: true,
        message:
          'If an account with that email exists, a password reset link has been sent.',
        timestamp: new Date().toISOString(),
        path: 'auth/forgot-password',
        method: 'POST',
      };
    } catch (error) {
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
    @Body('token') token: string,
    @Body('password') password: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      if (!token || !password) {
        throw new BadRequestException('Token and password are required');
      }

      await this.authService.resetPassword(token, password);

      return {
        success: true,
        message: 'Password has been reset successfully',
        timestamp: new Date().toISOString(),
        path: 'auth/reset-password',
        method: 'POST',
      };
    } catch (error) {
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

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body('token') token: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      if (!token) {
        throw new BadRequestException('Verification token is required');
      }

      await this.authService.verifyEmail(token);

      return {
        success: true,
        message: 'Email has been verified successfully',
        timestamp: new Date().toISOString(),
        path: 'auth/verify-email',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to verify email',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'auth/verify-email',
        method: 'POST',
      };
    }
  }
}
