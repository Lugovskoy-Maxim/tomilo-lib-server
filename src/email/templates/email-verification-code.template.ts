import { EMAIL_STYLES, SITE_NAME, COPYRIGHT } from './shared.styles';

/** Разбивает код на цифры для посимвольного отображения (удобнее читать и копировать). */
function codeDigits(code: string): string[] {
  return code.split('').slice(0, 6);
}

export const emailVerificationCodeTemplate = (
  username: string,
  code: string,
) => {
  const digits = codeDigits(code);
  const digitCells = digits
    .map(
      (d) =>
        `<td style="padding: 12px 8px; font-size: 28px; font-weight: 700; font-family: 'SF Mono', 'Consolas', 'Monaco', monospace; color: ${EMAIL_STYLES.primaryColor}; text-align: center; background-color: #f0f4f8; border-radius: 8px; border: 2px solid ${EMAIL_STYLES.borderColor}; min-width: 44px;">${d}</td>`,
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>Код подтверждения — ${SITE_NAME}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style type="text/css">
    @media only screen and (max-width: 480px) {
      .wrapper { width: 100% !important; padding: 12px !important; }
      .code-cell { font-size: 22px !important; padding: 10px 6px !important; min-width: 36px !important; }
      .code-table { margin: 20px auto !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; font-family: ${EMAIL_STYLES.fontFamily}; line-height: 1.5; color: ${EMAIL_STYLES.textColor}; background-color: #eceff1;">
  <div style="display: none; max-height: 0; overflow: hidden;">Ваш код: ${code}. Подтвердите регистрацию на ${SITE_NAME}. Действует 15 минут.</div>
  <div class="wrapper" style="max-width: 600px; margin: 0 auto; padding: 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: ${EMAIL_STYLES.borderRadius}; box-shadow: 0 2px 12px rgba(0,0,0,0.08); overflow: hidden;">
      <tr>
        <td style="padding: 28px 28px 20px; text-align: center;">
          <h1 style="margin: 0 0 4px; font-size: 24px; font-weight: 600; color: ${EMAIL_STYLES.primaryColor};">
            Подтверждение регистрации
          </h1>
          <p style="margin: 0; font-size: 14px; color: ${EMAIL_STYLES.textMuted};">
            ${SITE_NAME}
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 28px 24px;">
          <p style="margin: 0 0 8px; font-size: 16px; color: ${EMAIL_STYLES.textColor};">
            Здравствуйте, <strong>${username}</strong>!
          </p>
          <p style="margin: 0 0 20px; font-size: 15px; color: ${EMAIL_STYLES.textColor};">
            Введите код ниже на странице регистрации, чтобы завершить создание аккаунта.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="8" align="center" class="code-table" style="margin: 24px auto;">
            <tr>
              ${digitCells}
            </tr>
          </table>
          <p style="margin: 16px 0 0; font-size: 14px; color: ${EMAIL_STYLES.textMuted}; text-align: center;">
            Код: <strong style="font-family: 'SF Mono', Consolas, monospace; color: ${EMAIL_STYLES.textColor}; letter-spacing: 2px;">${code}</strong>
          </p>
          <div style="margin: 24px 0 0; padding: 14px 16px; background-color: #fff8e1; border-radius: 6px; border-left: 4px solid #f9a825;">
            <p style="margin: 0; font-size: 13px; color: #5d4037;">
              <strong>Код действителен 15 минут.</strong> Никому не сообщайте код — сотрудники ${SITE_NAME} его не запрашивают.
            </p>
          </div>
          <p style="margin: 20px 0 0; font-size: 14px; color: ${EMAIL_STYLES.textMuted};">
            Если вы не регистрировались на ${SITE_NAME}, просто проигнорируйте это письмо.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding: 20px 28px; background-color: ${EMAIL_STYLES.bgCard}; border-top: 1px solid ${EMAIL_STYLES.borderColor}; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: ${EMAIL_STYLES.textMuted};">
            Это автоматическое сообщение, ответы на него не обрабатываются.
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
};
