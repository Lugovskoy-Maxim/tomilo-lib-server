import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { registrationTemplate } from './templates/registration.template';
import { emailVerificationTemplate } from './templates/email-verification.template';
import { emailVerificationCodeTemplate } from './templates/email-verification-code.template';
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
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
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

  async sendEmailVerificationCode(to: string, username: string, code: string) {
    const subject = 'Код подтверждения регистрации — Tomilo Lib';
    const html = emailVerificationCodeTemplate(username, code);
    await this.sendEmail(to, subject, html);
  }

  /** Отправка кода в фоне, без ожидания (ответ API возвращается сразу). */
  sendEmailVerificationCodeBackground(
    to: string,
    username: string,
    code: string,
    onError?: (err: Error) => void,
  ): void {
    this.sendEmailVerificationCode(to, username, code).catch((err) => {
      onError?.(err);
    });
  }

  async sendPasswordReset(to: string, resetToken: string) {
    const subject = 'Сброс пароля';
    const resetUrl = `${this.configService.get('FRONTEND_URL')}/reset-password?token=${resetToken}`;
    const html = passwordResetTemplate(resetUrl);

    await this.sendEmail(to, subject, html);
  }

  /** Ежедневный архив дампа БД (JSON-коллекции, tar.gz). */
  async sendDatabaseBackupArchive(
    to: string,
    archivePath: string,
    dateStr: string,
    sizeBytes: number,
  ) {
    const subject = `Tomilo Lib — бэкап БД ${dateStr}`;
    const mb = (sizeBytes / (1024 * 1024)).toFixed(2);
    const html = `<p>Автоматический дамп MongoDB за ${dateStr}.</p><p>Размер архива: ${mb} МБ.</p>`;
    await this.transporter.sendMail({
      from: this.configService.get('YANDEX_EMAIL'),
      to,
      subject,
      html,
      attachments: [
        {
          filename: `tomilo-db-${dateStr}.tar.gz`,
          path: archivePath,
        },
      ],
    });
  }

  async sendBackupTooLargeEmail(
    to: string,
    dateStr: string,
    sizeBytes: number,
    maxBytes: number,
  ) {
    const subject = `Tomilo Lib — бэкап БД ${dateStr} (вложение слишком большое)`;
    const html = `<p>Дамп за ${dateStr} собран, но архив (${sizeBytes} байт) превышает лимит отправки (${maxBytes} байт). Увеличьте BACKUP_EMAIL_MAX_BYTES или храните бэкапы на диске/S3.</p>`;
    await this.sendEmail(to, subject, html);
  }

  async sendBackupFailureNotice(
    to: string,
    dateStr: string,
    errorMessage: string,
  ) {
    const subject = `Tomilo Lib — ошибка бэкапа БД ${dateStr}`;
    const html = `<p>Не удалось выполнить или отправить бэкап.</p><pre style="white-space:pre-wrap;font-family:monospace;">${escapeHtml(
      errorMessage,
    )}</pre>`;
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
