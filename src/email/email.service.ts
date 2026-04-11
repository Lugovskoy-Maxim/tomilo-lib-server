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

  /** Отправка email со ссылкой на бекап в S3 */
  async sendDatabaseBackupS3Link(
    to: string,
    dateStr: string,
    s3Url: string,
    sizeBytes: number,
    s3Key: string,
  ) {
    const subject = `Tomilo Lib — бэкап БД ${dateStr} (S3)`;
    const mb = (sizeBytes / (1024 * 1024)).toFixed(2);
    const gb = (sizeBytes / (1024 * 1024 * 1024)).toFixed(3);
    const sizeDisplay =
      sizeBytes > 1024 * 1024 * 1024 ? `${gb} ГБ` : `${mb} МБ`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2>Бэкап базы данных Tomilo Lib</h2>
        <p><strong>Дата:</strong> ${dateStr}</p>
        <p><strong>Размер:</strong> ${sizeDisplay} (${sizeBytes.toLocaleString()} байт)</p>
        <p><strong>Ключ в S3:</strong> ${s3Key}</p>
        <p><strong>Ссылка для скачивания:</strong></p>
        <p style="background-color: #f5f5f5; padding: 10px; border-radius: 4px; word-break: break-all;">
          <a href="${s3Url}" target="_blank">${s3Url}</a>
        </p>
        <p>Ссылка будет доступна до удаления файла из облачного хранилища.</p>
        <hr>
        <p style="color: #666; font-size: 12px;">
          Это автоматическое сообщение. Бекап создан и загружен в облачное хранилище S3.
          Для настройки периода хранения проверьте переменные окружения BACKUP_S3_DAYS_TO_KEEP.
        </p>
      </div>
    `;

    await this.transporter.sendMail({
      from: this.configService.get('YANDEX_EMAIL'),
      to,
      subject,
      html,
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
