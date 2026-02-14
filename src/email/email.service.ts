import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { registrationTemplate } from './templates/registration.template';
import { emailVerificationTemplate } from './templates/email-verification.template';
import { passwordResetTemplate } from './templates/password-reset.template';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.yandex.ru',
      port: 465,
      secure: true,
      auth: {
        user: this.configService.get('YANDEX_EMAIL'),
        pass: this.configService.get('YANDEX_PASSWORD'),
      },
    });
  }

  async sendRegistrationEmail(to: string, username: string) {
    const subject = 'Добро пожаловать в Tomilo Lib!';
    const appUrl = this.configService.get('FRONTEND_URL') ?? '';
    const html = registrationTemplate(username, appUrl);

    await this.sendEmail(to, subject, html);
  }

  async sendEmailVerification(to: string, verificationToken: string) {
    const subject = 'Подтверждение адреса электронной почты';
    const verificationUrl = `${this.configService.get('FRONTEND_URL')}/verify-email?token=${verificationToken}`;
    const html = emailVerificationTemplate(verificationUrl);

    await this.sendEmail(to, subject, html);
  }

  async sendPasswordReset(to: string, resetToken: string) {
    const subject = 'Сброс пароля';
    const resetUrl = `${this.configService.get('FRONTEND_URL')}/reset-password?token=${resetToken}`;
    const html = passwordResetTemplate(resetUrl);

    await this.sendEmail(to, subject, html);
  }

  private async sendEmail(to: string, subject: string, html: string) {
    const mailOptions = {
      from: this.configService.get('YANDEX_EMAIL'),
      to,
      subject,
      html,
    };

    await this.transporter.sendMail(mailOptions);
  }
}
