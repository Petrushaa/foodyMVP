# Foody — инфраструктура

Reference-документ для агентов и человека. Описывает: production-сервер, Docker-стек, env, домен/DNS, bootstrap нового сервера и команды эксплуатации.

Дата сборки: 2026-05-17. Worktree: `/Users/maksim/PycharmProjects/foody/.claude/worktrees/bold-roentgen-221bba/`, ветка `claude/bold-roentgen-221bba` (от `prod2`).

---

## Production-сервер

| Параметр | Значение |
|---|---|
| IP | `176.108.251.124` (публичный, dynamic lease 41601 sec) |
| Интерфейс | `enp3s0`, MAC `fa:16:3e:50:db:5d` |
| OS | Ubuntu 22.04.5 LTS (Jammy) |
| Kernel | `5.15.0-161-generic` x86_64 |
| CPU | 2 vCPU |
| RAM | 3.8 GiB (свободно ~3.3 GiB, swap отсутствует) |
| Диск | `/dev/vda2`, 20 GiB (использовано 4.8G, свободно 14G) |
| Hostname | `foody` |
| Виртуализация | OpenStack-подобная (cloud-init, open-vm-tools, qemu mount) — VPS |

### Доступ

```bash
ssh -i ~/.ssh/claude-access maksim@176.108.251.124
```

- Пользователь: `maksim` (UID 1000), shell — `/bin/sh`
- `sudo -n` работает без пароля (NOPASSWD) → passwordless root
- Аутентификация: только SSH-ключ (`~/.ssh/claude-access`), `.bash_history` почти пустой → свежий сервер
- Кроме `maksim` и `root` обычных пользователей нет

### Открытые/слушаемые порты

| Порт | Источник | Назначение |
|---|---|---|
| 22 (tcp, 0.0.0.0 и [::]) | `sshd` | SSH |
| 53 (tcp, 127.0.0.53) | systemd-resolved | локальный DNS-стаб, наружу не торчит |

Снаружи доступен только SSH. Веб-портов нет — на сервере ещё ничего не задеплоено.

### Firewall

- `ufw status` → **inactive**
- `iptables -L INPUT` → policy ACCEPT, цепочка пустая
- Защиты на уровне ОС нет. Скорее всего фильтрация только на уровне облачного провайдера (Security Group), но это не подтверждено — нужно проверить через панель провайдера или попробовать открыть лишние порты.

---

## Установленный софт

| Пакет | Версия | Источник | Зачем |
|---|---|---|---|
| `git` | 2.34.1 | apt jammy | склонировать репо |
| `curl` | 7.81.0 | apt jammy | скачать docker, проверить health |
| `wget` | 1.21.2 | apt jammy | то же |
| `python3` | 3.10.6 | apt jammy | системный, не для Django (Django крутится в контейнере на 3.12) |
| `ca-certificates` | 20240203 | apt jammy | HTTPS/TLS |
| `open-vm-tools` | — | apt | гость на гипервизоре |
| `cloud-init` | — | apt | первичная настройка VPS |

Включённые systemd-юниты (выборка): `ssh`, `cron`, `apparmor`, `networkd-dispatcher`, `open-iscsi`, `multipathd`, `lxd-agent`, snap-маунты для core20/lxd/snapd.

## Что НЕ установлено (но должно быть для деплоя)

| Чего нет | Зачем нужно |
|---|---|
| `docker` (`docker.io` / `docker-ce`) | весь стек живёт в Docker |
| `docker compose` (плагин v2) | оркестрация compose-файла |
| `nginx` (системный) | НЕ нужен — nginx крутится контейнером, порты 80/443 пробрасываются |
| `certbot` | HTTPS для домена foody.press (когда дойдёт) |
| `ufw` (правила) | защита от лишних портов, открытых наружу |
| Сам репозиторий | `git clone` ещё не делался — `/opt`, `/srv`, `/var/www`, `~/` пустые |

---

## Домен и DNS

Проверено 19.08.2026 через DNS-over-HTTPS (`https://dns.google/resolve`).

| Запись | Значение | Статус |
|---|---|---|
| NS | `ns1.reg.ru`, `ns2.reg.ru` | делегирован, зона на reg.ru |
| A | `51.250.21.16` | реальный адрес (диапазон Yandex Cloud) |
| TXT (SPF) | `v=spf1 a mx include:spf.smtp.bz ~all` | есть, include разрешается |
| TXT (DKIM) | `smtpbz._domainkey` → `v=DKIM1; k=rsa; p=…` | есть |
| TXT (DMARC) | `_dmarc.foody.press` | **нет** |
| MX | — | нет, и не нужно: почта только исходящая |

**Не проверяйте DNS этой зоны обычным `dig` с рабочей машины.** Там стоит
VPN или фильтр, подменяющий A-записи на диапазон `198.18.0.0/15` (TEST-NET,
RFC 2544). Адрес в подмене каждый раз разный, из-за чего в прошлой редакции
этого документа домен был записан как неделегированный — а он делегирован.
Другие типы записей подмена не трогает, поэтому SPF через `dig` виден верно,
а A — нет. Проверять через DoH:

```bash
curl -s -H 'accept: application/dns-json' \
  'https://dns.google/resolve?name=foody.press&type=A'
```

Расхождение, которое надо закрыть: A-запись ведёт на `51.250.21.16`, а в этом
документе прод записан как `176.108.251.124`, в `infra/.env` же
`DOMAIN_NAME=155.212.136.226` — три разных адреса. Перед следующим деплоем
свериться, какой сервер живой, и привести к одному значению.

Осталось по почте: добавить DMARC. Без него письма уходят и доставляются
(SPF и DKIM на месте), но у принимающей стороны нет указания, что делать с
подделками под ваш домен.

---

## Docker-стек (compose)

Файлы: `infra/docker-compose.yml` + `infra/docker-compose.override.yml` (последний открывает порт 8000 у backend для dev).

```
                          Internet
                              │
                              ▼
                     ┌──────────────────┐
                     │  nginx:alpine    │  80, 443
                     │  (default network)│
                     └─────────┬────────┘
                               │
              ┌────────────────┼──────────────────┐
              │                │                  │
              ▼                ▼                  ▼
        ┌──────────┐    ┌────────────┐    /static/, /media/
        │ frontend │    │  backend   │     (alias из volume)
        │ next:3000│    │ django:8000│
        └────┬─────┘    └─────┬──────┘
             │ (depends_on)   │
             └────────────────┤
                              │ depends_on (healthy)
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
           ┌────────┐    ┌──────┐     ┌──────────────┐
           │   db   │    │redis │ ◄── │celery_worker │
           │postgres│    │  7   │     │celery_beat   │
           │  15    │    └──────┘     └──────────────┘
           └────────┘
```

### Сервисы

| Сервис | Образ / build | Порты (host) | Volumes | env_file | Зависит от |
|---|---|---|---|---|---|
| `db` | `postgres:15-alpine` | — (только внутри сети) | `postgres_data:/var/lib/postgresql/data` | `.env` | — |
| `redis` | `redis:7-alpine` | — | — (данные in-memory, не персистятся) | — | — |
| `backend` | build `../backend` (Dockerfile, python:3.12-slim) | `8000:8000` (override.yml, dev) | `../backend:/app`, `django_static:/app/static`, `django_media:/app/media` | `.env` | `db (healthy)`, `redis (healthy)` |
| `frontend` | build `../frontend`, ARG `NEXT_PUBLIC_API_URL` | — | — (image-only, без bind-mount после ребилда) | `.env` | `backend` |
| `celery_worker` | build `../backend`, command `celery -A config worker -l info` | — | `../backend:/app` | `.env` | `db`, `redis` |
| `celery_beat` | build `../backend`, command `celery -A config beat -l info` | — | `../backend:/app` | `.env` | `db`, `redis` |
| `nginx` | `nginx:alpine` | `80:80`, `443:443` | `./nginx/default.conf.template:/etc/nginx/templates/default.conf.template`, `django_static:/var/www/static`, `django_media:/var/www/media` | — (только `DOMAIN_NAME`, `NGINX_ENVSUBST_OUTPUT_DIR` через environment) | `frontend`, `backend` |

### Сеть

Compose не объявляет именованных сетей → используется дефолтная `infra_default` (bridge). Все сервисы резолвят друг друга по имени (`db`, `redis`, `backend`, `frontend`).

### Backend entrypoint (`backend/entrypoint.sh`)

При старте контейнера:
1. ждёт PostgreSQL (TCP-чек `db:5432`),
2. `python manage.py migrate --noinput`,
3. `python manage.py collectstatic --noinput`,
4. `createsuperuser --noinput || true` (берёт `DJANGO_SUPERUSER_*` из env),
5. `gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 2`.

### Frontend Dockerfile — отсутствует

В `frontend/` сейчас Dockerfile **удалён** (`git status` показывает `deleted: frontend/Dockerfile`, `Dockerfile.dev`). Compose-сервис `frontend` сейчас **не собирается** — это блокер для `docker compose up`. Агент 1 перезаливает фронт.

---

## Volumes (named)

| Volume | Что хранит | Бэкап |
|---|---|---|
| `postgres_data` | данные Postgres (`/var/lib/postgresql/data`) | нет |
| `django_static` | результат `collectstatic` (раздаётся nginx-ом из `/var/www/static`) | нет (можно перегенерировать) |
| `django_media` | загруженные пользователями файлы (аватары, фото блюд) | нет |
| `redis` | — (в compose не указан volume, при рестарте теряется кэш и очередь celery) | — |

Бэкапов нет. Cron-задач для бэкапа нет (сервер пустой, кроны не настроены).

---

## Env-переменные

Источник истины: `infra/.env` (в `.gitignore`, **не коммитится**). Шаблон: `infra/.env.example` (коммитится).

| Переменная | Где используется | Текущее значение (`.env`) | Нужна в проде |
|---|---|---|---|
| `DJANGO_SECRET_KEY` | Django settings | `ULJhnI2^P*gsoGCc@STA#45QW#dwNy_l^6rp6nynZxnv@fB4hR` | Да, **сменить** перед прод-деплоем |
| `DJANGO_DEBUG` | Django settings | `0` | Да (`0`) |
| `DJANGO_ALLOWED_HOSTS` | Django middleware | `*` | сузить до `foody.press,176.108.251.124` |
| `CORS_ALLOWED_ORIGINS` | django-cors-headers | `http://localhost,http://localhost:3000,http://155.212.136.226` | заменить IP на актуальный/домен |
| `DJANGO_SUPERUSER_USERNAME/EMAIL/PASSWORD` | entrypoint `createsuperuser` | `admin / admin@example.com / admin123` | **обязательно сменить пароль** |
| `POSTGRES_DB / USER / PASSWORD` | Postgres + Django | `foody / foody / foody_secret` | сменить пароль |
| `POSTGRES_HOST / PORT` | Django | `db / 5432` | оставить |
| `REDIS_URL` | Django + Celery | `redis://redis:6379/0` | оставить |
| `UPDATE_STATS_INTERVAL` | Celery Beat | `1s` (агрессивно для прода) | `1m`+ |
| `NEXT_PUBLIC_API_URL` | Next.js build-time | `http://155.212.136.226/api/v1` | переписать под актуальный домен/IP |
| `INTERNAL_API_URL` | Next.js server-side | `http://backend:8000/api/v1` | оставить |
| `AUTH_SECRET` | NextAuth | `f2af45cf39d4fd279723f8d882b7542818bcf7f2b1d797c36aa097f86f05ba2c` | сменить |
| `AUTH_TRUST_HOST` | NextAuth | `true` | оставить |
| `AUTH_URL` | NextAuth | `http://155.212.136.226` | переписать |
| `DOMAIN_NAME` | nginx envsubst | `155.212.136.226` | `foody.press` или актуальный IP |

`NEXT_PUBLIC_API_URL` зашивается в **build-time** фронта (см. `ARG` в compose). Смена этой переменной требует **rebuild** фронта, не просто рестарт.

---

## Точки доступа (когда задеплоено)

Поведение по `infra/nginx/default.conf.template`:

| URL | Куда роутится | Источник |
|---|---|---|
| `http://<DOMAIN>/` | `frontend:3000` (Next.js) | nginx |
| `http://<DOMAIN>/api/auth/` | `frontend:3000` (NextAuth) | nginx — **до** `/api/` правила, чтобы перехватить |
| `http://<DOMAIN>/api/v1/` | `backend:8000` (Django REST) | nginx |
| `http://<DOMAIN>/api/docs/` | `backend:8000` (drf-spectacular Swagger) | nginx (через `/api/`) |
| `http://<DOMAIN>/admin/` | `backend:8000` (Django Admin) | nginx |
| `http://<DOMAIN>/media/` | `alias /var/www/media/` (volume `django_media`) | nginx напрямую |
| `http://<DOMAIN>/static/` | `alias /var/www/static/` (volume `django_static`) | nginx напрямую |
| `https://...` | **не настроено** — порт 443 открыт в compose, но `server { listen 443 }` отсутствует | — |

`client_max_body_size 20m` → загрузка фото до 20 МБ.

---

## Bootstrap нового сервера (с нуля, Ubuntu 22.04)

```bash
# 0. SSH под maksim, sudo без пароля
ssh -i ~/.ssh/claude-access maksim@176.108.251.124

# 1. Apt + базовые утилиты
sudo apt update && sudo apt -y upgrade
sudo apt -y install ca-certificates curl gnupg ufw

# 2. Docker Engine + compose plugin v2 (официальный репо)
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker maksim
newgrp docker   # или перелогин

# 3. Клон репо
sudo mkdir -p /opt/foody && sudo chown maksim:maksim /opt/foody
git clone <repo-url> /opt/foody
cd /opt/foody

# 4. .env
cp infra/.env.example infra/.env
# Отредактировать infra/.env:
#   - DJANGO_SECRET_KEY (openssl rand -base64 50)
#   - DJANGO_SUPERUSER_PASSWORD (что-то нормальное)
#   - POSTGRES_PASSWORD
#   - AUTH_SECRET (openssl rand -hex 32)
#   - DOMAIN_NAME=foody.press
#   - NEXT_PUBLIC_API_URL=https://foody.press/api/v1 (или http:// пока без SSL)
#   - AUTH_URL=https://foody.press
#   - CORS_ALLOWED_ORIGINS=https://foody.press
#   - DJANGO_ALLOWED_HOSTS=foody.press,176.108.251.124
#   - UPDATE_STATS_INTERVAL=1m

# 5. Поднять стек (БЕЗ override.yml в проде — иначе торчит 8000)
cd /opt/foody/infra
docker compose -f docker-compose.yml up -d --build

# 6. Firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# 7. SSL (когда DNS foody.press будет указывать на 176.108.251.124)
#    Самый простой путь — добавить отдельный контейнер с certbot + nginx-companion,
#    либо временно остановить compose-nginx, выпустить cert хостовым certbot, подмонтировать в nginx.
#    Прямой path-команды пока нет — настраивается отдельно.

# 8. Healthcheck
curl -I http://176.108.251.124/
curl -I http://176.108.251.124/api/v1/
curl -I http://176.108.251.124/admin/
docker compose ps
docker compose logs --tail=50 backend
```

---

## Команды повседневной эксплуатации

Все команды запускаются из `infra/` на сервере (или локально, для разработки).

| Операция | Команда |
|---|---|
| Поднять стек | `docker compose up -d --build` |
| Остановить | `docker compose down` |
| Перезапустить сервис | `docker compose restart backend` |
| Логи бэка (стрим) | `docker compose logs -f backend` |
| Логи nginx | `docker compose logs -f nginx` |
| Логи celery | `docker compose logs -f celery_worker celery_beat` |
| Shell внутри бэка | `docker compose exec backend bash` |
| Django shell | `docker compose exec backend python manage.py shell` |
| Применить миграции вручную | `docker compose exec backend python manage.py migrate` |
| Создать миграцию | `docker compose exec backend python manage.py makemigrations` |
| Создать суперюзера интерактивно | `docker compose exec backend python manage.py createsuperuser` |
| Collectstatic | `docker compose exec backend python manage.py collectstatic --noinput` |
| Psql внутри db | `docker compose exec db psql -U foody -d foody` |
| Бэкап БД | `docker compose exec -T db pg_dump -U foody foody | gzip > backup_$(date +%F).sql.gz` |
| Восстановление БД | `gunzip -c backup.sql.gz | docker compose exec -T db psql -U foody -d foody` |
| Pull последних изменений | `git pull && docker compose up -d --build` |
| Очистка томов (ОПАСНО — удалит данные) | `docker compose down -v` |
| Очистка неиспользуемых образов | `docker image prune -a` |
| Просмотр томов | `docker volume ls` |
| Инспект тома | `docker volume inspect infra_postgres_data` |
| Health всех сервисов | `docker compose ps` |

---

## Известные проблемы / технический долг

| Проблема | Статус |
|---|---|
| Порты 5432 / 6379 проброшены наружу | **Нет** — Postgres и Redis торчат только во внутренней сети compose |
| `infra/.env` в гите | **Нет** — есть в `.gitignore` (строка `infra/.env`). Хорошо. |
| Дефолтный пароль `admin/admin123` создаётся entrypoint-ом | **Да** — критично, обязательно переопределить `DJANGO_SUPERUSER_PASSWORD` перед прод-запуском |
| Bind-mount `../backend:/app` в проде | **Да** — `docker-compose.yml` монтирует исходники, что удобно для dev, но в проде смешивает образ и worktree (любой `git checkout` на хосте мгновенно меняет код в контейнере). Решение для прода — отдельный compose-файл без volume. |
| `docker-compose.override.yml` пробрасывает `8000:8000` | По умолчанию compose грузит и его → в проде backend будет торчать на 8000 без nginx. Использовать `-f docker-compose.yml` явно. |
| Redis без volume | потеря очередей celery при рестарте |
| HTTPS не настроен | listen 443 не описан в nginx, certbot не установлен |
| Бэкапов нет | ни Postgres, ни media |
| Мониторинг / алерты | отсутствуют |
| UFW выключен | при деплое включить (см. bootstrap §6) |
| `DJANGO_ALLOWED_HOSTS=*` | в проде сузить |
| `frontend/Dockerfile` удалён | блокирует `docker compose up` → ждём агента 1 |
| `infra/.env` указывает на старый IP `155.212.136.226` | переписать под `176.108.251.124` или `foody.press` |
| DNS `foody.press` → `198.18.0.48` | TEST-NET, домен не делегирован на прод-сервер |
| Postgres-пароль в `.env` хранится в plaintext | приемлемо для single-host stack, для масштабирования — секрет-менеджер |
| `UPDATE_STATS_INTERVAL=1s` | агрессивно для прода, нагрузит celery |

---

## Что нужно от других агентов / ad-hoc заметки

- **Агент 1 (frontend):** после перезаливки фронта должен появиться `frontend/Dockerfile` (multi-stage, production: `npm run build` + `npm run start`). Без него `docker compose up` падает на `build frontend`.
- **Агент 2 (локальный docker compose):** убедиться, что текущий `infra/.env` подхватывается. Учитывая, что `NEXT_PUBLIC_API_URL` указывает на `155.212.136.226`, локальный фронт будет ходить **не** в локальный бэк — нужно временно править env под `localhost` либо собирать с `NEXT_PUBLIC_API_URL=http://localhost/api/v1`.
- **Агент 3 (бэк):** при чтении кода учитывать, что `entrypoint.sh` сам делает `migrate`/`collectstatic`/`createsuperuser` → не дублировать вручную при дев-запуске.
- **Агент 4 (домен foody.press):** A-запись сейчас указывает в TEST-NET (`198.18.0.48`). Нужно:
  1. Подтвердить регистратора домена.
  2. Поставить A-запись `176.108.251.124`.
  3. Решить вопрос с SSL (Let's Encrypt через standalone certbot, либо отдельный nginx-companion-контейнер).
  4. После делегирования — обновить в `infra/.env`: `DOMAIN_NAME`, `NEXT_PUBLIC_API_URL`, `AUTH_URL`, `CORS_ALLOWED_ORIGINS`, `DJANGO_ALLOWED_HOSTS`.

### Открытые вопросы (требуют человеческого ответа)

- Какой провайдер VPS (по интерфейсу `enp3s0` + cloud-init похоже на OpenStack — Selectel / Timeweb / Servers.ru)?
- Есть ли cloud-firewall на уровне провайдера (security group), который сейчас закрывает 80/443?
- Где зарегистрирован `foody.press` и кто управляет DNS-зоной?
- Нужно ли в проде сохранить два режима (dev/prod) compose, или сразу делать `docker-compose.prod.yml`?
