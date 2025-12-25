import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
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

  @UseGuards(AuthGuard('yandex'))
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
}
