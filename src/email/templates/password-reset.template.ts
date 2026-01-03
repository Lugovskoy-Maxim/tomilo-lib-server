export const passwordResetTemplate = (resetUrl: string) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Сброс пароля</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #FF9800;">Сброс пароля</h1>
    </div>
    
    <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
        <h2 style="color: #333;">Запрос на сброс пароля</h2>
        <p>Нажмите на кнопку ниже, чтобы сбросить свой пароль:</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #FF9800; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;
                      font-weight: bold;">
                Сбросить пароль
            </a>
        </div>
        <p>Если вы не запрашивали сброс пароля, проигнорируйте это сообщение.</p>
    </div>
    
    <div style="text-align: center; margin-top: 30px; color: #888; font-size: 12px;">
        <p>Это автоматическое сообщение, пожалуйста, не отвечайте на него.</p>
        <p>© 2026 Tomilo Lib. Все права защищены.</p>
    </div>
</body>
</html>
`;
