# IP Tracking API Documentation

## Обзор

Система отслеживания подозрительной активности неавторизованных пользователей по IP-адресам.

## Конфигурация

| Параметр | Значение | Описание |
|----------|----------|----------|
| Rate limit (анонимы) | 50 запросов/мин | Лимит для неавторизованных пользователей |
| Rate limit (подозрительные) | 10 запросов/мин | Строгий лимит для подозрительных IP |
| Порог подозрительности | 50 баллов | Превышение = статус "подозрительный" |
| Порог блокировки | 100 баллов | Превышение = автоматическая блокировка на 1 час |

---

## API Endpoints для Админов

### Получить статистику по IP активности

```
GET /ip-stats
```

**Response:**
```json
{
  "totalIPs": 150,
  "blockedIPs": 5,
  "suspiciousIPs": 12,
  "totalRequests": 45000
}
```

### Получить заблокированные IP

```
GET /blocked-ips
```

**Response:**
```json
[
  {
    "ip": "192.168.1.1",
    "isBlocked": true,
    "blockedAt": "2024-01-15T10:30:00Z",
    "blockedUntil": "2024-01-15T11:30:00Z",
    "blockedReason": "Auto-blocked: score=100, reasons=...",
    "botScore": 100,
    "totalRequests": 5000
  }
]
```

### Получить подозрительные IP

```
GET /suspicious-ips?limit=50
```

**Query Parameters:**
- `limit` (опционально): количество записей, по умолчанию 50

### Заблокировать IP

```
POST /block-ip
Content-Type: application/json

{
  "ip": "192.168.1.100",
  "reason": "Manual block - detected bot activity",
  "durationMinutes": 60
}
```

**Параметры:**
- `ip` (обязательный): IP адрес для блокировки
- `reason` (обязательный): причина блокировки
- `durationMinutes` (опционально): длительность в минутах, по умолчанию 60

### Разблокировать IP

```
POST /unblock-ip
Content-Type: application/json

{
  "ip": "192.168.1.100"
}
```

### Сбросить активность IP

```
POST /reset-ip-activity
Content-Type: application/json

{
  "ip": "192.168.1.100"
}
```

Сбрасывает счетчики и статус подозрительности для IP.

---

## Frontend Integration

### Как система работает для неавторизованных пользователей

1. Каждый публичный запрос проверяется по IP
2. При превышении rate limit возвращается 429 Too Many Requests
3. При блокировке возвращается 403 Forbidden
4. В заголовках ответа передается информация:

```
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 60000
X-Blocked: false
X-Block-Remaining: 0
```

### Пример обработки на фронтенде

```javascript
async function fetchWithRateLimit(url, options = {}) {
  const response = await fetch(url, options);
  
  // Проверяем rate limit
  const remaining = response.headers.get('X-RateLimit-Remaining');
  const resetTime = response.headers.get('X-RateLimit-Reset');
  
  if (response.status === 429) {
    // Превышен лимит - показываем сообщение
    const waitTime = parseInt(resetTime) || 60000;
    showNotification(`Слишком много запросов. Подождите ${Math.ceil(waitTime/1000)} сек.`);
    
    // Повторяем запрос после паузы
    setTimeout(() => {
      return fetchWithRateLimit(url, options);
    }, waitTime);
    return;
  }
  
  if (response.status === 403) {
    showNotification('Ваш IP временно заблокирован из-за подозрительной активности.');
    return;
  }
  
  return response.json();
}
```

### Публичные endpoints (требуют проверки IP)

- `GET /chapters/:id` - просмотр главы
- `GET /titles` - список тайтлов
- `GET /titles/:id` - информация о тайтле
- `GET /search` - поиск
- `GET /titles/popular` - популярные тайтлы

---

## Мониторинг

### Логирование подозрительной активности

Подозрительная активность логируется в консоль сервера:

```
[WARN] BotDetectionService: Suspicious activity from IP 192.168.1.100: score=55, reasons=["Nighttime activity", "High request frequency"]
```

### Метрики для мониторинга

- `ip_activity_total` - общее количество отслеживаемых IP
- `ip_blocked_total` - количество заблокированных IP
- `ip_suspicious_total` - количество подозрительных IP
- `request_total_by_ip` - общее количество запросов по всем IP

---

## Расширенные методы (для внутреннего использования)

### Проверить может ли IP делать запросы

```
POST /can-make-request
Content-Type: application/json

{
  "ip": "192.168.1.100"
}
```

**Response:**
```json
{
  "allowed": true,
  "blocked": false,
  "remainingMs": 0
}
```

### Получить активность конкретного IP

```
GET /ip-activity/:ip
```

---

## База данных

Коллекция: `ip_activities`

Структура документа:
```json
{
  "_id": "ObjectId",
  "ip": "192.168.1.100",
  "isBlocked": false,
  "isSuspicious": true,
  "botScore": 55,
  "totalRequests": 1500,
  "requestsToday": 450,
  "activityLog": [
    {
      "endpoint": "/chapters/123",
      "method": "GET",
      "timestamp": "2024-01-15T10:30:00Z",
      "userAgent": "Mozilla/5.0..."
    }
  ],
  "suspiciousActivityLog": [
    {
      "score": 55,
      "reasons": ["Nighttime activity"],
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ],
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

---

## Troubleshooting

### IP заблокирован, но не должен был быть

1. Проверьте `suspiciousActivityLog` в базе данных
2. Проверьте `botScore` - возможно была накоплена история
3. Используйте `POST /reset-ip-activity` для сброса

### Rate limit слишком строгий

Измените константы в `bot-detection.service.ts`:
```typescript
private readonly RATE_LIMIT_ANONYMOUS = 50; // Увеличьте значение
private readonly IP_SUSPICIOUS_THRESHOLD = 50; // Увеличьте для менее агрессивной блокировки
```

### Ложные срабатывания

Ночная активность (+5 баллов) может давать ложные срабатывания для пользователей из разных часовых поясов. Рассмотрите возможность отключения этой проверки.
