# WebSocket: парсинг тайтлов

Gateway: `ParsingGateway` (модуль `MangaParserModule`). События отправляются в комнату по `sessionId`, чтобы один клиент видел только свой прогресс.

## События от клиента

| Событие         | Payload | Описание |
|-----------------|--------|----------|
| `parse_title`   | `ParseTitleDto` + `sessionId` | Парсинг и импорт одного тайтла. |
| `parse_chapters`| `ParseChaptersDto` + `sessionId` | Парсинг глав по URL. |
| `parse_batch`   | `{ dtos: ParseTitleDto[], sessionId }` | Парсинг нескольких тайтлов подряд. |

## События от сервера (клиент подписывается)

Все ответы приходят одним событием: **`parsing_progress`**.

Payload — `ParsingProgressDto`:

- **type**: `'chapters_info'` | `'chapter_import'` | `'title_import'` | `'batch_import'`
- **sessionId**: строка
- **status**: `'started'` | `'progress'` | `'completed'` | `'error'`
- **message**: текст для UI (например «Тайтл 2 из 5», «Глава 3 из 10»)
- **data**: опционально (список глав, ошибка и т.д.)
- **progress**: `{ current, total, percentage }` — для одиночного тайтла/глав
- **batch**: только при **batch_import** — `{ currentTitleIndex, totalTitles, currentTitleName?, titleProgress? }`

### Примеры при одиночном тайтле (`parse_title`)

- `type: 'title_import'`, `status: 'started'`, `message: 'Парсинг...'`
- `type: 'title_import'`, `status: 'progress'`, `data.chapterProgress` — прогресс по главам
- `type: 'title_import'`, `status: 'completed'` — тайтл импортирован
- `type: 'title_import'`, `status: 'error'`, `message`, `data` — ошибка

### Примеры при пакетном парсинге (`parse_batch`)

- `type: 'batch_import'`, `status: 'started'`, `batch: { totalTitles }`
- `type: 'batch_import'`, `status: 'progress'`, `message: 'Тайтл 2 из 5: Название'`, `batch: { currentTitleIndex, totalTitles, currentTitleName, titleProgress }`
- `type: 'batch_import'`, `status: 'completed'` — все тайтлы обработаны
- При ошибке по одному тайтлу: `status: 'progress'` с сообщением об ошибке, затем переход к следующему; финальный `completed` — после всех.

Типы и интерфейсы: `src/manga-parser/dto/parsing-progress.dto.ts`.
