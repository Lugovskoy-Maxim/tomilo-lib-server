import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { EmailService } from './email.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('send-registration')
  async sendRegistrationEmail(
    @Body('to') to: string,
    @Body('username') username: string,
  ) {
    await this.emailService.sendRegistrationEmail(to, username);
    return { message: 'Регистрационное письмо отправлено успешно' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('send-verification')
  async sendEmailVerification(
    @Body('to') to: string,
    @Body('verificationToken') verificationToken: string,
  ) {
    await this.emailService.sendEmailVerification(to, verificationToken);
    return { message: 'Письмо с подтверждением отправлено успешно' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('send-reset')
  async sendPasswordReset(
    @Body('to') to: string,
    @Body('resetToken') resetToken: string,
  ) {
    await this.emailService.sendPasswordReset(to, resetToken);
    return { message: 'Письмо для сброса пароля отправлено успешно' };
  }
}
