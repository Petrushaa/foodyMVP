# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Что это

**Foody** — соцсеть про еду: лента постов с блюдами/ресторанами, лайки/сохранения/комментарии/оценки, подписки, модерация контента. Прод: https://foody.press.

Монорепо: `backend/` (Django 5 + DRF), `frontend/` (Next.js 15 + React 19, TypeScript), `infra/` (Docker Compose, Caddy, deploy.sh), `docs/` (api.md, features.md). Язык проекта — русский: комментарии в коде, verbose_name, документация и commit-сообщения пишутся по-русски (`LANGUAGE_CODE = 'ru'`).

## Команды

### Backend (из `backend/`)

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

`config/settings.py` грузит env через dotenv из `../infra/.env` — локально нужен этот файл либо переменные окружения. Дефолты БД: PostgreSQL `foody`/`foody` на `localhost:5432`, Redis `redis://localhost:6379/0`.

**Celery-воркер не перечитывает код.** Django-сервер перезапускается сам при
правке файла, воркер — нет: он держит импортированные модули в памяти до
перезапуска. После правок в `users/emails.py`, `*/tasks.py` и всём, что они
тянут, воркер надо перезапустить вручную — иначе письма продолжат уходить по
старому шаблону, а проверка «отправил скриптом, всё верно» этого не покажет:
скрипт читает файл заново, воркер — нет.

**Выгрузка справочника в таблицу:**

```bash
python manage.py export_catalog --path catalog.xlsx   # три листа: блюда, кухни, виды
python manage.py export_catalog --format csv          # три файла, utf-8 с BOM и «;»
```

Собирается из базы, поэтому расходиться с сайтом ей нечем. Файл выгрузки в git
не попадает: это результат команды, а не исходник.

### Тесты (из `backend/`)

```bash
pytest                                            # весь прогон
pytest posts/tests/test_moderation.py             # один файл
pytest posts/tests/test_posts.py::TestPostCreate  # один класс
pytest -k "test_like"                             # по имени
```

Тестам нужны живые PostgreSQL и Redis (как в CI). `conftest.py` автоматически: Celery в eager-режиме, троттлинг выключен, кэш чистится между тестами (иначе login-throttle 10/min ломает соседние тесты).

### Frontend (из `frontend/`)

```bash
npm run dev     # dev-сервер на 0.0.0.0:3000
npm run build
npm run lint
```

### Docker / деплой

```bash
cd infra && docker compose up -d --build   # локальный стек целиком
docker compose exec backend python manage.py migrate
```

Локальная разработка поверх compose — через `docker-compose.override.yml` (не в git). CI/CD: пуш в `master` → GitHub Actions собирает образы, гоняет pytest внутри боевого backend-образа, пушит в `ghcr.io/foodyco/foody-{backend,frontend}`, деплоит на сервер через `infra/deploy.sh` (rolling с healthcheck и rollback). Красный pytest блокирует деплой.

## Архитектура

### Маршрутизация (Caddy)

- `/api/auth/*` → **frontend** (NextAuth v5 — сессии фронта живут там)
- `/api/*`, `/admin/*` → **backend** (Django)
- `/static/*`, `/media/*` → volumes напрямую
- всё остальное → frontend

Auth двухслойный: NextAuth на фронте оборачивает JWT бэкенда (`/api/v1/auth/token/` — SimpleJWT, логин **по email** через `users.auth_backends.EmailBackend` + `EmailTokenObtainPairSerializer`, throttle 10/min).

### Backend

Два Django-приложения:

- **`users`** — кастомный `User` (`AUTH_USER_MODEL = 'users.User'`), `Follow`, регистрация/профиль/подписки.
- **`posts`** — всё остальное: справочники (Tag, Category, Cuisine, DishType), Restaurant/Dish, Post + модерация, лайки/сохранения/оценки/комментарии, статистика. Views разнесены по файлам в `posts/views/` (posts, restaurants, moderation, actions, comment_likes).

API: префикс `/api/v1/`, по умолчанию `IsAuthenticated` + JWT Bearer, обязательная пагинация (`PAGE_SIZE` из env), фильтры django-filter/search/ordering, Swagger на `/api/docs/`.

### Модель данных (см. `posts/models.py`, `users/models.py`)

Справочники и таксономия:
- `Tag` (с денормализованным `usage_count`), `Category`, `Cuisine` — плоские справочники.
- `DishType` — справочник блюд с FK на `Cuisine` и `Category`: юзер при создании поста выбирает тип блюда, кухня/категория выводятся из него и отдельно в Post не хранятся.
- `Restaurant` и `Dish` (уникальность `(restaurant, name)`) — **создаются автоматически при публикации поста**, ручного CRUD нет. Оба имеют M2M на Tag/Category через explicit through-модели (`RestaurantTag`, `DishTag`, `DishCategory`, `RestaurantCategory`).

Контент:
- `Post` — FK на user/restaurant/dish (все `SET_NULL`), `dish_type` (`PROTECT`), цена, теги через `PostTag`. Модерация прямо в модели: `status` (pending/approved/rejected), `moderated_by/at`, `rejection_reason`. Жизненный цикл: создание и **любое** редактирование → `pending` → стаф approve/reject; rejected виден только автору.
- `PostImage` — при первом save стрипает EXIF (включая GPS) через Pillow; файл удаляется с диска сигналом при удалении записи.
- Вовлечённость: `PostLike`, `PostSave`, `PostReview` (rating 0..`MAX_REVIEW_RATING`), `Comment`, `CommentLike` — везде `unique_together (post|comment, user)` и `user` с `SET_NULL` (контент переживает удаление юзера).

Денормализация счётчиков — центральный паттерн:
- `PostStatistics` (OneToOne к Post, создаётся сигналом при создании поста) держит `likes_count`, `saves_count`, `comments_count`, `rating`.
- Счётчики лайков/сохранений/комментариев и `Tag.usage_count`, `User.followers_count/following_count` обновляются **синхронно сигналами** через атомарный `F()` (`posts/signals.py`, `users/signals.py`; сигналы подключены в `apps.py::ready`). Декременты защищены от ухода в минус (`__gt=0`).
- `rating` пересчитывается **периодически** Celery beat-задачей `posts.tasks.update_post_ratings` (интервал `UPDATE_STATS_INTERVAL`, дефолт 5m) агрегацией по `PostReview`.

При изменении моделей помнить: денормализованные счётчики требуют либо сигнала, либо backfill-миграции (примеры: `users/0006_recalc_counters.py`, `posts/0014_backfill_dishcategory.py`, `posts/0019_seed_dish_classification.py` — data-миграции здесь норма).

## Документация

- `docs/api.md` — контракт API для фронта; `docs/features.md` — перечень функций/эндпоинтов и жизненный цикл поста.
- `PROJECT_DOCS.md` — обзор проекта; `INFRA.md` — сервер, деплой, DNS, известные проблемы.
- При изменении API обновлять `docs/api.md` и `docs/features.md`.
