# Настройка OAuth авторизации

## Поддерживаемые провайдеры

1. Яндекс
2. ВКонтакте (старый OAuth, oauth.vk.com)
3. VK ID (id.vk.ru, OAuth 2.0 + PKCE)

## Настройка Яндекс OAuth

1. Перейдите в [Яндекс OAuth](https://oauth.yandex.ru/)
2. Создайте новое приложение
3. Укажите следующие настройки:
   - Название: Tomilo-lib.ru
   - Права доступа: Доступ к email адресу
   - Callback URI: http://localhost:3000/auth/yandex/callback (или ваш домен)
4. После создания приложения вы получите Client ID и Client Secret
5. Добавьте их в ваш .env файл:
   ```
   YANDEX_CLIENT_ID=ваш_client_id
   YANDEX_CLIENT_SECRET=ваш_client_secret
   ```

## Настройка ВКонтакте OAuth (старый)

1. Перейдите в [VK Developers](https://vk.com/dev)
2. Создайте новое приложение
3. Укажите следующие настройки:
   - Название: Tomilo-lib.ru
   - Тип приложения: Standalone-приложение
   - Callback URI: http://localhost:3000/auth/vk/callback (или ваш домен)
4. После создания приложения вы получите Application ID и Secure key
5. Добавьте их в ваш .env файл:
   ```
   VK_CLIENT_ID=ваш_application_id
   VK_CLIENT_SECRET=ваш_secure_key
   VK_REDIRECT_URI=http://localhost:3000/auth/vk/callback
   ```

## Настройка VK ID (id.vk.ru)

1. Перейдите в [VK ID](https://id.vk.com/) и создайте приложение
2. В настройках приложения укажите доверенный Redirect URL (например `https://your.domain/auth/vk-id/callback`)
3. Добавьте в .env:
   ```
   VK_ID_CLIENT_ID=идентификатор_приложения
   VK_ID_REDIRECT_URI=https://your.domain/auth/vk-id/callback
   ```
   Секрет клиента для VK ID не используется — применяется PKCE.

## Использование OAuth

### Авторизация через Яндекс

1. Перенаправьте пользователя на URL авторизации Яндекса
2. После авторизации пользователь будет перенаправлен на ваш callback URL с кодом
3. Отправьте POST запрос на `/auth/yandex` с телом:
   ```json
   {
     "code": "код_авторизации"
   }
   ```

### Авторизация через ВКонтакте (старый OAuth)

1. Перенаправьте пользователя на URL авторизации ВКонтакте
2. После авторизации пользователь будет перенаправлен на ваш callback URL с кодом
3. Отправьте POST запрос на `/auth/vk` с телом:
   ```json
   {
     "code": "код_авторизации"
   }
   ```

### Авторизация через VK ID (id.vk.ru, PKCE)

Документация: [VK ID API](https://id.vk.com/about/business/go/docs/ru/vkid/latest/vk-id/connection/api-description).

1. Создайте приложение в [VK ID](https://id.vk.com/), укажите доверенный Redirect URL (например `https://your.domain/auth/vk-id/callback`).
2. В .env задайте:
   ```
   VK_ID_CLIENT_ID=идентификатор_приложения
   VK_ID_REDIRECT_URI=https://your.domain/auth/vk-id/callback
   ```
3. На клиенте:
   - Сгенерируйте `code_verifier` (43–128 символов: a-z, A-Z, 0-9, _, -).
   - Посчитайте `code_challenge = base64url(sha256(code_verifier))`, метод `S256`.
   - Сгенерируйте `state` (не менее 32 символов).
   - Откройте в браузере:
     `https://id.vk.ru/authorize?response_type=code&client_id=<VK_ID_CLIENT_ID>&redirect_uri=<VK_ID_REDIRECT_URI>&state=<state>&code_challenge=<code_challenge>&code_challenge_method=S256`
   - После входа пользователя VK перенаправит на `redirect_uri?code=...&device_id=...&state=...`.
   - Сохраните `code_verifier` до этого шага (например в sessionStorage).
4. Отправьте POST на `/auth/vk-id` с телом:
   ```json
   {
     "code": "код_подтверждения",
     "code_verifier": "ваш_code_verifier",
     "device_id": "идентификатор_устройства",
     "state": "ваша_строка_state"
   }
   ```
   Сервер обменяет код на токены и получит данные пользователя, создаст/обновит пользователя и вернёт JWT.

## Особенности

- Пользователи, авторизованные через OAuth, получают случайно сгенерированный пароль
- Они могут использовать функцию восстановления пароля для установки собственного пароля
- OAuth пользователи могут использовать как OAuth, так и обычную авторизацию после установки пароля