# ---- Сборка колёс зависимостей: компилятор нужен только здесь ----
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt


# ---- Рантайм: без компилятора и dev-заголовков, процессы от non-root ----
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# libpq5 — рантайм PostgreSQL-клиента; gosu — сброс привилегий из entrypoint.
# gcc/libpq-dev в финальный образ не тащим — это лишняя поверхность атаки.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 gosu \
    && rm -rf /var/lib/apt/lists/*

# Ставим зависимости из готовых колёс — в рантайме компилятор не нужен.
COPY requirements.txt .
COPY --from=builder /wheels /wheels
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r requirements.txt \
    && rm -rf /wheels

# Непривилегированный пользователь: под ним работают gunicorn и celery.
# entrypoint стартует от root (чинит права на тома) и сбрасывает привилегии
# на appuser через gosu — см. entrypoint.sh.
RUN groupadd --system --gid 1001 appuser \
    && useradd --system --uid 1001 --gid appuser --home /app appuser

# Copy project
COPY . .

# Make entrypoint executable
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
