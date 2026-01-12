export const emailVerificationTemplate = (verificationUrl: string) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Подтверждение адреса электронной почты</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #2196F3;">Подтверждение адреса электронной почты</h1>
    </div>
    
    <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
        <p>Нажмите на кнопку ниже, чтобы подтвердить свой адрес электронной почты:</p>
        <p style="color: #343a40; margin: 0 0 25px; font-size: 16px; line-height: 1.5;">
                Это поможет нам защитить ваш аккаунт и облегчит восстановление доступа в случае потери доступа.
            </p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background-color: #2196F3; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;
                      font-weight: bold;">
                Подтвердить email
            </a>
        </div>

        <!-- Ссылка для копирования -->
<div style="margin-bottom: 30px; padding: 20px; background-color: #f8f9fa; border-radius: 6px; border: 1px dashed #ced4da;">
            <p style="color: #495057; margin: 0 0 10px; font-size: 14px; font-weight: 500;">
                Если кнопка не работает, скопируйте ссылку:
            </p>
            <div style="background-color: #ffffff; padding: 12px; border-radius: 4px; word-break: break-all; font-size: 13px; color: #495057; border: 1px solid #dee2e6;">
                ${verificationUrl}
            </div>
        </div>

        <p>Если вы не запрашивали подтверждение, проигнорируйте это сообщение.</p>
    </div>
    
    <div style="text-align: center; margin-top: 30px; color: #888; font-size: 12px;">
        <p>Это автоматическое сообщение, пожалуйста, не отвечайте на него.</p>
          <p style="margin: 0;">
                © 2025-<script>document.write(new Date().getFullYear());</script> Tomilo Lib. Все права защищены.
            </p>
    </div>
</body>
</html>
`;
