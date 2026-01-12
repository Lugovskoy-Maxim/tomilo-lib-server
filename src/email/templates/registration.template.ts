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
        <h1 style="color: #2196F3;">Добро пожаловать в Tomilo Lib!</h1>
    </div>
    
    <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
        <h2 style="color: #333;">Здравствуйте, ${username}!</h2>
        <p style="color: #343a40; margin: 0 0 20px; font-size: 16px; line-height: 1.5;">
            Спасибо за регистрацию на нашей платформе. Ваш аккаунт успешно создан и готов к использованию.
        </p>
        
        <p style="color: #343a40; margin: 0 0 25px; font-size: 16px; line-height: 1.5;">
            Теперь вы можете наслаждаться чтением тысяч тайтлов манги, манхвы и маньхуа из нашей обширной библиотеки.
        </p>
        
        <div style="background-color: #f0f9f0; border-radius: 6px; padding: 15px; margin: 25px 0; border-left: 3px solid #2196F3;">
            <p style="color: #495057; margin: 0; font-size: 14px; line-height: 1.5;">
                <strong>Совет для начала:</strong> Начните с раздела "Популярное" или воспользуйтесь поиском, чтобы найти любимые произведения.
            </p>
        </div>
        
        <p style="color: #343a40; margin: 0 0 25px; font-size: 16px; line-height: 1.5;">
            Если у вас возникнут вопросы, ознакомьтесь с разделом помощи или свяжитесь с нашей службой поддержки.
        </p>
        
        <p style="color: #495057; margin: 0; font-size: 14px;">
            Спасибо, что выбрали Tomilo Lib. Приятного чтения!
        </p>
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
