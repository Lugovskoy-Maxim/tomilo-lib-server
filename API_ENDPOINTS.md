# Tomilo Library Server API Endpoints

## Base URL
`http://localhost:3000` (development)

## Authentication
Most endpoints require JWT authentication. Include the token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

## Endpoints Overview

### App Controller
- `GET /` - Hello World message
- `GET /health` - Health check endpoint
- `GET /stats` - Server statistics (total titles, chapters, users, views, bookmarks)

### Authentication
- `POST /auth/login` - User login
- `POST /auth/register` - User registration
- `POST /auth/yandex` - Yandex OAuth login
- `POST /auth/vk` - VK OAuth login (oauth.vk.com)
- `POST /auth/vk-id` - VK ID OAuth login (id.vk.ru, PKCE)
- `POST /auth/change-password` - Change user password

### Users
- `GET /users` - Get all users (admin only, paginated)
- `GET /users/profile` - Get current user profile
- `PUT /users/profile` - Update current user profile
- `PUT /users/admin/:id` - Update user by admin
- `DELETE /users/admin/:id` - Delete user by admin
- `GET /users/profile/bookmarks` - Get user bookmarks (query: `category=reading|planned|completed|favorites|dropped`, `grouped=true` для разбивки по категориям)
- `POST /users/profile/bookmarks/:titleId` - Add title to bookmarks (query: `category=...`, по умолчанию `reading`)
- `PUT /users/profile/bookmarks/:titleId` - Change bookmark category (body: `{ "category": "reading"|"planned"|"completed"|"favorites"|"dropped" }`)
- `DELETE /users/profile/bookmarks/:titleId` - Remove title from bookmarks
- `GET /users/profile/history` - Get reading history (query: `page`, `limit`, `light=true` — по умолчанию лёгкий формат с пагинацией)
- `GET /users/history` - Alternative reading history endpoint (same query params)
- `GET /users/profile/history/:titleId/read-ids` - Только `chapterIds` и `chapterNumbers` прочитанных глав (для статуса «прочитано» на фронте, лёгкий ответ)
- `GET /users/profile/history/:titleId` - Полная история по тайтлу (список глав с populate)
- `POST /users/profile/history/:titleId/:chapterId` - Add to reading history
- `DELETE /users/profile/history` - Clear reading history
- `DELETE /users/profile/history/:titleId` - Remove title from history
- `DELETE /users/profile/history/:titleId/:chapterId` - Remove chapter from history
- `GET /users/profile/stats` - Get user statistics
- `PUT /users/profile/avatar` - Update user avatar
- `POST /users/avatar/admin/:id` - Update avatar by admin
- `POST /users/avatar` - Remove user avatar
- `GET /users/:id` - Get user by ID

#### Bot Detection (Admin)
- `GET /users/admin/suspicious-users` - Get list of suspicious/bot users
- `GET /users/admin/bot-stats` - Get bot detection statistics
- `POST /users/admin/:id/reset-bot-status` - Reset bot status for a user

### Titles
- `GET /titles/titles/popular` - Get popular titles
- `GET /titles/collections` - Get title collections
- `GET /titles/titles/filters/options` - Get filter options
- `GET /titles/user/reading-progress` - Get user reading progress
- `GET /titles/titles/latest-updates` - Get latest updates (query: `page`, `limit`; default limit 18, max 100)
- `GET /titles/search` - Search titles
- `POST /titles/titles` - Create new title
- `PUT /titles/titles/:id` - Update title
- `GET /titles/titles` - Get all titles (paginated)
- `GET /titles/titles/recent` - Get recent titles
- `GET /titles/titles/:id` - Get title by ID
- `DELETE /titles/titles/:id` - Delete title
- `POST /titles/titles/:id/views` - Increment title views
- `POST /titles/titles/:id/rating` - Update title rating
- `GET /titles/titles/:id/chapters/count` - Get chapters count for title

### Chapters
- `POST /chapters` - Create new chapter
- `POST /chapters/upload` - Upload chapter with pages
- `GET /chapters` - Get all chapters (paginated)
- `GET /chapters/count` - Get total chapters count
- `GET /chapters/:id` - Get chapter by ID
- `GET /chapters/:id/next` - Get next chapter
- `GET /chapters/:id/prev` - Get previous chapter
- `GET /chapters/title/:titleId` - Get chapters by title ID
- `GET /chapters/by-number/:titleId` - Get chapter by title and number
- `GET /chapters/latest/:titleId` - Get latest chapter for title
- `PATCH /chapters/:id` - Update chapter
- `DELETE /chapters/:id` - Delete chapter
- `POST /chapters/:id/view` - Increment chapter views
- `POST /chapters/:id/pages` - Add pages to chapter
- `POST /chapters/bulk-delete` - Bulk delete chapters

### Search
- `GET /search` - Search titles

### Shop
- `GET /shop/decorations` - Get all available decorations (avatar, frame, background, card)
- `GET /shop/decorations/:type` - Get decorations by type (`avatar` | `frame` | `background` | `card`)
- `GET /shop/profile/decorations` - Get current user's owned and equipped decorations (auth required). Response includes `decorations` array with `id`, `type`, `imageUrl`, `isEquipped` for use by the client (e.g. resolving frame/avatar URL by ID).
- `POST /shop/purchase/:type/:decorationId` - Purchase decoration (auth required)
- `PUT /shop/equip/:type/:decorationId` - Equip owned decoration (auth required)
- `DELETE /shop/equip/:type` - Unequip decoration by type (auth required)

### Notifications
- `GET /notifications` - Get notifications by user ID
- `GET /notifications/unread-count` - Get unread notifications count
- `POST /notifications/:id/read` - Mark notification as read
- `POST /notifications/mark-all-read` - Mark all notifications as read
- `DELETE /notifications/:id` - Delete notification

### Manga Parser
- `POST /manga-parser/parse-title` - Parse and import title
- `POST /manga-parser/parse-chapters` - Parse and import chapters
- `POST /manga-parser/parse-chapters-info` - Parse chapters info
- `GET /manga-parser/supported-sites` - Get supported sites

## Response Format
All API responses follow this structure:
```json
{
  "success": boolean,
  "data": any,
  "message": string,
  "errors": string[],
  "timestamp": string,
  "path": string,
  "method": string
}
```

## Statistics Endpoint Response
The `/stats` endpoint returns comprehensive statistics:

### Base Statistics
```json
{
  "totalTitles": number,
  "totalChapters": number,
  "totalUsers": number,
  "totalCollections": number,
  "totalViews": number,
  "totalBookmarks": number
}
```

### Daily Statistics
```json
{
  "daily": {
    "views": number,
    "newUsers": number,
    "newTitles": number,
    "newChapters": number,
    "chaptersRead": number
  }
}
```

### Weekly Statistics
```json
{
  "weekly": {
    "views": number,
    "newUsers": number,
    "newTitles": number,
    "newChapters": number,
    "chaptersRead": number
  }
}
```

### Monthly Statistics
```json
{
  "monthly": {
    "views": number,
    "newUsers": number,
    "newTitles": number,
    "newChapters": number,
    "chaptersRead": number
  }
}
```

### Popular Content
```json
{
  "popularTitles": [
    {
      "id": string,
      "name": string,
      "slug": string,
      "views": number,
      "dayViews": number,
      "weekViews": number,
      "monthViews": number
    }
  ],
  "popularChapters": [
    {
      "id": string,
      "titleId": string,
      "titleName": string,
      "chapterNumber": number,
      "name": string,
      "views": number
    }
  ]
}
```

### Additional Metrics
```json
{
  "activeUsersToday": number,
  "newUsersThisMonth": number,
  "totalRatings": number,
  "averageRating": number,
  "ongoingTitles": number,
  "completedTitles": number,
  "staleOngoingTitles": number
}
```

- **staleOngoingTitles**: Количество тайтлов со статусом "ongoing", которые не обновлялись более месяца

## Error Handling
- 400 Bad Request - Invalid input data
- 401 Unauthorized - Missing or invalid JWT token
- 403 Forbidden - Insufficient permissions
- 404 Not Found - Resource not found
- 409 Conflict - Resource already exists
- 500 Internal Server Error - Server error

## Pagination
Endpoints that return lists support pagination:
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10)

Example: `GET /titles/titles?page=2&limit=20`

## File Upload
File uploads use multipart/form-data. Supported endpoints:
- Title cover upload
- Chapter pages upload
- User avatar upload

## OAuth Authentication
For OAuth authentication, send a POST request to the respective endpoint with the authorization code:
```json
{
  "code": "authorization_code"
}
```

The response will include a JWT token and user data, similar to regular login.
