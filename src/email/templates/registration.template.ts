import { EMAIL_STYLES, SITE_NAME, COPYRIGHT } from './shared.styles';

export const registrationTemplate = (username: string, appUrl: string) => `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>Добро пожаловать в ${SITE_NAME}!</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style type="text/css">
    @media only screen and (max-width: 620px) {
      .wrapper { width: 100% !important; padding: 16px !important; }
      .btn { width: 100% !important; box-sizing: border-box; }
    }
  </style>
</head>
<body style="margin:0; padding:0; font-family: ${EMAIL_STYLES.fontFamily}; line-height: 1.5; color: ${EMAIL_STYLES.textColor}; background-color: #eceff1;">
  <div style="display: none; max-height: 0; overflow: hidden;">Ваш аккаунт в ${SITE_NAME} создан. Начните читать мангу, манхву и маньхуа.</div>
  <div class="wrapper" style="max-width: 600px; margin: 0 auto; padding: 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: ${EMAIL_STYLES.borderRadius}; box-shadow: 0 2px 8px rgba(0,0,0,0.06); overflow: hidden;">
      <tr>
        <td style="padding: 32px 28px 24px;">
          <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 600; color: ${EMAIL_STYLES.primaryColor}; text-align: center;">
            Добро пожаловать!
          </h1>
          <p style="margin: 0; font-size: 14px; color: ${EMAIL_STYLES.textMuted}; text-align: center;">${SITE_NAME}</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 28px 28px;">
          <p style="margin: 0 0 16px; font-size: 16px; color: ${EMAIL_STYLES.textColor};">
            Здравствуйте, <strong>${username}</strong>!
          </p>
          <p style="margin: 0 0 16px; font-size: 16px; color: ${EMAIL_STYLES.textColor};">
            Спасибо за регистрацию. Ваш аккаунт создан, вы можете пользоваться библиотекой манги, манхвы и маньхуа.
          </p>
          <div style="margin: 24px 0; padding: 16px; background-color: #e8f5e9; border-radius: 6px; border-left: 4px solid ${EMAIL_STYLES.successBorder};">
            <p style="margin: 0; font-size: 14px; color: ${EMAIL_STYLES.textColor}; line-height: 1.5;">
              <strong>С чего начать:</strong> зайдите в раздел «Популярное» или воспользуйтесь поиском, чтобы найти интересные тайтлы.
            </p>
          </div>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${appUrl}" class="btn" style="display: inline-block; background-color: ${EMAIL_STYLES.primaryColor}; color: #ffffff !important; padding: 14px 28px; text-decoration: none; border-radius: ${EMAIL_STYLES.borderRadius}; font-weight: 600; font-size: 15px;">
              Перейти на сайт
            </a>
          </div>
          <p style="margin: 20px 0 0; font-size: 14px; color: ${EMAIL_STYLES.textMuted};">
            Если возникнут вопросы, обратитесь в раздел помощи или в службу поддержки.
          </p>
          <p style="margin: 12px 0 0; font-size: 14px; color: ${EMAIL_STYLES.textColor};">
            Спасибо, что выбрали ${SITE_NAME}. Приятного чтения!
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
