"""
Клиент к API Геосаджеста Яндекс.Карт — подсказки заведений при вводе.

Зачем: пользователь выбирает заведение не из головы, а из списка настоящих организаций.
Из подсказки мы забираем `oid` — постоянный идентификатор организации в базе Яндекса,
по которому одно и то же кафе у всех пользователей склеивается в одну запись.

Три вещи, которые определяют устройство этого модуля:

1. **Лимит 1000 запросов в сутки** на весь сервис. Поэтому агрессивный кэш и суточный
   счётчик с резервом — обычный пользовательский поиск не должен съесть квоту, которая
   нужна фоновому обновлению заведений.
2. **Кэшировать данные Яндекса можно не дольше 30 дней** (условия использования API).
   Отсюда потолок времени жизни кэша.
3. **Падать нельзя.** Кончилась квота, отвалилась сеть, Яндекс ответил ошибкой — отдаём
   пустой список и пишем в лог. Создание поста не должно ломаться из-за внешнего сервиса.

Ключ живёт в переменной окружения `YANDEX_GEO_API_KEY` и привязан строго к Геосаджесту:
ключ JS API здесь работать не будет, и наоборот.
"""

import hashlib
import logging
from dataclasses import dataclass
from datetime import date
from urllib.parse import parse_qs, urlparse

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

SUGGEST_URL = 'https://suggest-maps.yandex.ru/v1/suggest'

# Префиксы ключей в Redis
_CACHE_PREFIX = 'yandex:suggest:q'
_QUOTA_PREFIX = 'yandex:suggest:quota'


class YandexSuggestError(Exception):
    """Геосаджест недоступен или ответил ошибкой."""


class YandexQuotaExceeded(YandexSuggestError):
    """Исчерпан суточный лимит запросов — до конца суток в API не ходим."""


@dataclass(frozen=True)
class SuggestedPlace:
    """Одна подсказка: всё, что нам нужно от Яндекса для создания заведения."""

    external_id: str          # oid организации — ключ склейки заведений
    name: str                 # «Cofix»
    address: str              # «Ереван, Северный проспект, 1»
    city: str                 # «Ереван», из компонента LOCALITY
    subtitle: str             # «Кофейня · Ереван, Северный проспект, 1»
    categories: tuple         # ('business', 'cafe') — подсказка формата еды

    @property
    def maps_url(self):
        """Ссылка «Открыть в Картах» — обязательна по условиям использования API."""
        return f'https://yandex.ru/maps/org/{self.external_id}/'


def extract_oid(uri):
    """
    Достаёт идентификатор организации из uri вида `ymapsbm1://org?oid=49107815568`.
    Возвращает пустую строку, если это не организация (улица, город, метро).
    """
    if not uri:
        return ''
    try:
        return parse_qs(urlparse(uri).query).get('oid', [''])[0]
    except ValueError:
        return ''


def _extract_city(address):
    """Город из разобранного адреса: компонент с типом LOCALITY."""
    for component in (address or {}).get('component', []):
        if 'LOCALITY' in component.get('kind', []):
            return component.get('name', '')
    return ''


def _parse_results(payload):
    """Превращает ответ Геосаджеста в список подсказок, отбрасывая не-организации."""
    places = []
    for item in (payload or {}).get('results', []):
        external_id = extract_oid(item.get('uri', ''))
        if not external_id:
            # Улица, город или метро — нам нужны только организации.
            continue
        address = item.get('address') or {}
        places.append(SuggestedPlace(
            external_id=external_id,
            name=(item.get('title') or {}).get('text', ''),
            address=address.get('formatted_address', ''),
            city=_extract_city(address),
            subtitle=(item.get('subtitle') or {}).get('text', ''),
            categories=tuple(item.get('tags') or ()),
        ))
    return places


# --- Суточная квота -------------------------------------------------------

def _quota_key():
    return f'{_QUOTA_PREFIX}:{date.today().isoformat()}'


def quota_used_today():
    return cache.get(_quota_key(), 0)


def quota_left_today(reserve=None):
    """
    Сколько запросов осталось. `reserve` — сколько держим про запас для фонового
    обновления заведений, чтобы пользовательский поиск не съел всю квоту.
    """
    if reserve is None:
        reserve = settings.YANDEX_SUGGEST_QUOTA_RESERVE
    return max(0, settings.YANDEX_SUGGEST_DAILY_LIMIT - reserve - quota_used_today())


def _consume_quota():
    """Считает израсходованные запросы. Счётчик живёт до конца следующих суток."""
    key = _quota_key()
    try:
        cache.incr(key)
    except ValueError:
        # Ключа ещё нет — создаём. Гонка здесь не страшна: потеря одной единицы
        # счётчика ничего не решает, а лишний поход в API отсекается лимитом.
        cache.set(key, 1, timeout=60 * 60 * 48)


# --- Запрос ---------------------------------------------------------------

def _cache_key(params):
    """Ключ кэша по значимым параметрам запроса."""
    raw = '|'.join(f'{k}={params[k]}' for k in sorted(params) if k != 'apikey')
    return f'{_CACHE_PREFIX}:{hashlib.sha256(raw.encode()).hexdigest()[:32]}'


def suggest_places(text, *, ll=None, spn=None, limit=None, use_cache=True):
    """
    Ищет заведения по началу названия.

    `ll` — центр окна поиска «долгота,широта», `spn` — его размер в градусах.
    **Передавать их важно:** без окна поиска Яндекс отдаёт результаты по всему миру,
    и человек в Москве получит кофейни в Ереване. Это проверено на живом API.

    Возвращает список подсказок. При любой проблеме — пустой список, наружу не падаем.
    """
    text = (text or '').strip()
    if len(text) < settings.YANDEX_SUGGEST_MIN_QUERY_LENGTH:
        # Не тратим квоту на один-два символа: осмысленных подсказок там всё равно нет.
        return []

    params = {
        'text': text,
        'lang': 'ru',                 # у Геосаджеста именно 'ru', не 'ru_RU'
        'types': 'biz',               # только организации
        'print_address': 1,           # разобранный адрес — из него берём город
        'attrs': 'uri',               # без этого не будет uri, а значит и oid
        'results': limit or settings.YANDEX_SUGGEST_RESULTS,
        # Сервис работает только по России. Без этого в выдаче попадаются
        # заведения из соседних стран — проверено, на «шоколадница» приходил Ереван.
        'countries': settings.YANDEX_SUGGEST_COUNTRIES,
    }
    if ll:
        params['ll'] = ll
        params['spn'] = spn or settings.YANDEX_SUGGEST_DEFAULT_SPN

    key = _cache_key(params)
    if use_cache:
        cached = cache.get(key)
        if cached is not None:
            return cached

    if quota_left_today() <= 0:
        logger.warning(
            'Геосаджест: суточная квота исчерпана (%s из %s), запрос не отправлен',
            quota_used_today(), settings.YANDEX_SUGGEST_DAILY_LIMIT,
        )
        return []

    api_key = settings.YANDEX_GEO_API_KEY
    if not api_key:
        logger.error('Геосаджест: не задан YANDEX_GEO_API_KEY')
        return []

    try:
        response = requests.get(
            SUGGEST_URL,
            params=dict(params, apikey=api_key),
            timeout=settings.YANDEX_API_TIMEOUT,
        )
        _consume_quota()
    except requests.RequestException as exc:
        logger.warning('Геосаджест недоступен: %s', exc)
        return []

    if response.status_code != 200:
        # 403 почти всегда означает, что ключ выдан под другой продукт или ещё
        # не активировался — активация занимает больше заявленных 15 минут.
        logger.error(
            'Геосаджест ответил %s: %s', response.status_code, response.text[:200] or '(пусто)'
        )
        return []

    try:
        places = _parse_results(response.json())
    except ValueError as exc:
        logger.error('Геосаджест вернул не JSON: %s', exc)
        return []

    if use_cache:
        cache.set(key, places, timeout=settings.YANDEX_SUGGEST_CACHE_TTL)
    return places
