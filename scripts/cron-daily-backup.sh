#!/usr/bin/env bash
# Ежедневный бэкап БД. Запускать из cron, например в 02:00:
#   0 2 * * * /path/to/tomilo-lib-server/scripts/cron-daily-backup.sh >> /var/log/tomilo-backup.log 2>&1
# Установить права: chmod +x scripts/cron-daily-backup.sh

set -e
cd "$(dirname "$0")/.."

# Подгружаем .env из корня проекта (опционально)
if [ -f .env ]; then
  set -a
  source .env 2>/dev/null || true
  set +a
fi

npm run backup:db
