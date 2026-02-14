import { EMAIL_STYLES, SITE_NAME, COPYRIGHT } from './shared.styles';

export const emailVerificationTemplate = (verificationUrl: string) => `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>Подтверждение адреса электронной почты — ${SITE_NAME}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style type="text/css">
    @media only screen and (max-width: 620px) {
      .wrapper { width: 100% !important; padding: 16px !important; }
      .btn { width: 100% !important; box-sizing: border-box; }
    }
  </style>
</head>
<body style="margin:0; padding:0; font-family: ${EMAIL_STYLES.fontFamily}; line-height: 1.5; color: ${EMAIL_STYLES.textColor}; background-color: #eceff1;">
  <div style="display: none; max-height: 0; overflow: hidden;">Подтвердите адрес электронной почты для аккаунта ${SITE_NAME}. Ссылка действительна 1 час.</div>
  <div class="wrapper" style="max-width: 600px; margin: 0 auto; padding: 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: ${EMAIL_STYLES.borderRadius}; box-shadow: 0 2px 8px rgba(0,0,0,0.06); overflow: hidden;">
      <tr>
        <td style="padding: 32px 28px 24px;">
          <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 600; color: ${EMAIL_STYLES.primaryColor}; text-align: center;">
            Подтверждение email
          </h1>
          <p style="margin: 0; font-size: 14px; color: ${EMAIL_STYLES.textMuted}; text-align: center;">${SITE_NAME}</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 28px 28px;">
          <p style="margin: 0 0 16px; font-size: 16px; color: ${EMAIL_STYLES.textColor};">
            Нажмите кнопку ниже, чтобы подтвердить свой адрес электронной почты. Это поможет защитить аккаунт и упростит восстановление доступа.
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${verificationUrl}" class="btn" style="display: inline-block; background-color: ${EMAIL_STYLES.primaryColor}; color: #ffffff !important; padding: 14px 28px; text-decoration: none; border-radius: ${EMAIL_STYLES.borderRadius}; font-weight: 600; font-size: 15px;">
              Подтвердить email
            </a>
          </div>
          <div style="margin: 24px 0; padding: 16px; background-color: ${EMAIL_STYLES.bgLinkBlock}; border-radius: 6px; border: 1px dashed ${EMAIL_STYLES.borderColor};">
            <p style="margin: 0 0 8px; font-size: 13px; color: ${EMAIL_STYLES.textMuted}; font-weight: 500;">
              Если кнопка не срабатывает, скопируйте ссылку:
            </p>
            <div style="word-break: break-all; font-size: 13px; color: ${EMAIL_STYLES.textColor}; padding: 10px; background: #fff; border-radius: 4px; border: 1px solid ${EMAIL_STYLES.borderColor};">
              ${verificationUrl}
            </div>
          </div>
          <p style="margin: 20px 0 0; font-size: 14px; color: ${EMAIL_STYLES.textMuted};">
            Если вы не запрашивали подтверждение, это письмо можно проигнорировать.
          </p>
          <p style="margin: 12px 0 0; font-size: 13px; color: ${EMAIL_STYLES.textMuted};">
            <strong>Безопасность:</strong> ссылка действует в течение 1 часа.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding: 20px 28px; background-color: ${EMAIL_STYLES.bgCard}; border-top: 1px solid ${EMAIL_STYLES.borderColor}; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: ${EMAIL_STYLES.textMuted};">
            Это автоматическое сообщение, не отвечайте на него.
          </p>
          <p style="margin: 6px 0 0; font-size: 12px; color: ${EMAIL_STYLES.textMuted};">
            ${COPYRIGHT}
          </p>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
`;
