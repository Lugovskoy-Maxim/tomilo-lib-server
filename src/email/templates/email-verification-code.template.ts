import { EMAIL_STYLES, SITE_NAME, COPYRIGHT } from './shared.styles';

export const emailVerificationCodeTemplate = (
  username: string,
  code: string,
) => `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>Код подтверждения — ${SITE_NAME}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style type="text/css">
    @media only screen and (max-width: 620px) {
      .wrapper { width: 100% !important; padding: 16px !important; }
      .code-box { font-size: 24px !important; letter-spacing: 8px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; font-family: ${EMAIL_STYLES.fontFamily}; line-height: 1.5; color: ${EMAIL_STYLES.textColor}; background-color: #eceff1;">
  <div style="display: none; max-height: 0; overflow: hidden;">Код подтверждения регистрации на ${SITE_NAME}: ${code}. Код действителен 15 минут.</div>
  <div class="wrapper" style="max-width: 600px; margin: 0 auto; padding: 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: ${EMAIL_STYLES.borderRadius}; box-shadow: 0 2px 8px rgba(0,0,0,0.06); overflow: hidden;">
      <tr>
        <td style="padding: 32px 28px 24px;">
          <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 600; color: ${EMAIL_STYLES.primaryColor}; text-align: center;">
            Подтверждение регистрации
          </h1>
          <p style="margin: 0; font-size: 14px; color: ${EMAIL_STYLES.textMuted}; text-align: center;">${SITE_NAME}</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 28px 28px;">
          <p style="margin: 0 0 16px; font-size: 16px; color: ${EMAIL_STYLES.textColor};">
            Здравствуйте, ${username}! Введите этот код на сайте для подтверждения адреса электронной почты:
          </p>
          <div class="code-box" style="text-align: center; margin: 28px 0; padding: 20px; background-color: ${EMAIL_STYLES.bgLinkBlock}; border-radius: ${EMAIL_STYLES.borderRadius}; border: 2px dashed ${EMAIL_STYLES.borderColor}; font-size: 28px; font-weight: 700; letter-spacing: 10px; color: ${EMAIL_STYLES.primaryColor};">
            ${code}
          </div>
          <p style="margin: 20px 0 0; font-size: 14px; color: ${EMAIL_STYLES.textMuted};">
            Если вы не регистрировались на ${SITE_NAME}, это письмо можно проигнорировать.
          </p>
          <p style="margin: 12px 0 0; font-size: 13px; color: ${EMAIL_STYLES.textMuted};">
            <strong>Код действителен 15 минут.</strong>
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
