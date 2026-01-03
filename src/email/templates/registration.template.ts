export const registrationTemplate = (username: string) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Добро пожаловать в Tomilo Lib!</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #4CAF50;">Добро пожаловать в Tomilo Lib!</h1>
    </div>
    
    <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
        <h2 style="color: #333;">Здравствуйте, ${username}!</h2>
        <p>Спасибо за регистрацию в Tomilo Lib.</p>
        <p>Наслаждайтесь чтением manga и другими возможностями нашей платформы!</p>
    </div>
    
    <div style="text-align: center; margin-top: 30px; color: #888; font-size: 12px;">
        <p>Это автоматическое сообщение, пожалуйста, не отвечайте на него.</p>
        <p>© 2026 Tomilo Lib. Все права защищены.</p>
    </div>
</body>
</html>
`;
