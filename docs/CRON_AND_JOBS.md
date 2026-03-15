# Cron-задачи и фоновые задания

Сводка всех запланированных задач (NestJS `@nestjs/schedule`). Очередей (Bull и т.п.) в проекте нет — длительные операции выполняются по HTTP/WebSocket или по крону.

## 1. Магазин (Shop)

| Сервис | Расписание | Описание |
|--------|------------|----------|
| `ShopSchedulerService.acceptWeeklyWinnerJob` | `0 0 * * 1` (понедельник 00:00) | Выбор еженедельного победителя предложений декоров и добавление в магазин |

**Файл:** `src/shop/shop-scheduler.service.ts`

---

## 2. Авто-парсинг (Auto-parsing)

| Сервис | Расписание | Описание |
|--------|------------|----------|
| `AutoParsingService.handleDailyJobs` | `EVERY_6_HOURS` (0, 6, 12, 18) | Ежедневные задания без `scheduleHour` (legacy) |
| `AutoParsingService.handleWeeklyJobs` | `EVERY_WEEK` (воскресенье 00:00) | Еженедельные задания без `scheduleHour` |
| `AutoParsingService.handleMonthlyJobs` | `EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT` | Ежемесячные задания без `scheduleHour` |
| `AutoParsingService.handleScheduledByHourAndMinuteJobs` | `*/10 * * * *` (каждые 10 мин) | Задания с `scheduleHour` и `scheduleMinute`: проверка текущего слота (час + минута 0/10/20/30/40/50), запуск daily/weekly/monthly по расписанию |

**Файл:** `src/auto-parsing/auto-parsing.service.ts`

---

## 3. Пользователи (Users)

| Сервис | Расписание | Описание |
|--------|------------|----------|
| `UsersService.runScheduledDeletionsCron` | `0 3 * * *` (ежедневно в 03:00) | Обработка запланированного удаления аккаунтов: `scheduledDeletionAt <= now` → проставить `deletedAt` |

**Файл:** `src/users/users.service.ts`

---

## 4. Файлы и S3 (Files)

| Сервис | Расписание | Описание |
|--------|------------|----------|
| `FilesSyncService.scheduledFullSync` | `EVERY_DAY_AT_4AM` (04:00) | Полная синхронизация uploads ↔ S3 и очистка сирот |

**Файл:** `src/files/files-sync.service.ts`

---

## 5. Статистика (Stats)

| Сервис | Расписание | Описание |
|--------|------------|----------|
| `StatsService.recordPreviousDayStatsCron` | `5 0 * * *` (00:05 ежедневно) | Запись статистики за предыдущий день |

**Файл:** `src/stats/stats.service.ts`

---

## Зависимости

- **ScheduleModule** подключается в `app.module.ts` через `ScheduleModule.forRoot()`.
- Все перечисленные сервисы помечены декоратором `@Cron(...)` и выполняются в процессе приложения.

Версия: 1.0. Обновляйте при добавлении или изменении крон-задач.
