#!/bin/bash
set -e

APP_USER=appuser

# ── Сброс привилегий ──────────────────────────────────────────────────────
# Контейнер стартует от root: примонтированные тома (django_static,
# django_media) создаёт Docker от root, и без chown запись collectstatic и
# загрузка медиа из-под appuser упали бы на уже существующих (root-овых) томах.
# Поэтому от root чиним владельца, а всю остальную работу делаем от appuser.
#
# static чистим рекурсивно: collectstatic перезаписывает файлы, а root-овые
# перезаписать нельзя. media — только сам каталог (право дописывать новые
# файлы); чужие старые загрузки appuser не трогает, рекурсия по ним была бы
# лишней и на проде долгой. У celery-контейнеров этих томов нет — chown по
# отсутствующему пути гасится в `|| true`.
if [ "$(id -u)" = "0" ]; then
    chown -R "$APP_USER":"$APP_USER" /app/static 2>/dev/null || true
    chown "$APP_USER":"$APP_USER" /app/media 2>/dev/null || true
    exec gosu "$APP_USER" "$0" "$@"
fi

# ── Дальше уже от appuser ─────────────────────────────────────────────────
# Если контейнеру переданы аргументы — выполняем их вместо стандартного запуска.
# Так работают celery_worker и celery_beat: их `command:` из compose приходит
# сюда аргументами, и exec запускает celery вместо gunicorn.
# Это же позволяет выполнить разовую команду: `docker compose run backend bash`.
if [ $# -gt 0 ]; then
    echo "Выполняю переданную команду: $@"
    exec "$@"
else
    # Аргументов нет — стандартный запуск бэкенда.
    # Ожидание PostgreSQL не нужно: compose стартует контейнер только после
    # healthcheck БД (depends_on: condition: service_healthy).
    echo "Примение миграции..."
    python manage.py migrate --noinput
    echo "Сбор статики..."
    python manage.py collectstatic --noinput
    # Иконки и порядок справочника лежат в репозитории и едут в образе, но
    # применить их надо к базе. Обе команды идемпотентны: загруженное
    # пропускается, порядок переписывается тем же значением.
    # `|| true` — отсутствие папки или файла не повод не поднять сервис:
    # интерфейс переживёт это на эмодзи и алфавите.
    echo "Иконки справочника..."
    python manage.py import_icons || true
    echo "Порядок справочника..."
    python manage.py apply_catalog_order || true
    echo "Создание суперпользователя..."
    python manage.py createsuperuser --noinput || true
    echo "Запуск сервера..."
    exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 2
fi
