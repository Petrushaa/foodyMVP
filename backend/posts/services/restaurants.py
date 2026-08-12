"""
Работа с заведениями: поиск существующего и создание нового.

Главное правило: **якорь всех связей — внутренний id нашей записи**. Название, адрес
и координаты приходят от пользователя (он выбрал заведение из подсказок или поставил
точку на карте), поэтому это наши данные — храним бессрочно и в фоне не обновляем.

Склейка дублей идёт по паре «источник + идентификатор в источнике», а если его нет —
по координатам с небольшим радиусом: одно и то же место люди называют по-разному
(«Кофемания» и «Кафе Кофемания»), а вот стоит оно всегда там же.
"""

import logging
from decimal import Decimal

from django.db import IntegrityError, transaction

from ..models import Restaurant, normalize_name

logger = logging.getLogger(__name__)

# Радиус склейки заведений по координатам. Примерно 20 метров: заведения ближе
# этого расстояния с похожим названием почти наверняка одно и то же место.
GEO_MATCH_DEGREES = Decimal('0.0002')


def find_by_external_id(external_id, source=Restaurant.SOURCE_YANDEX):
    """Точный поиск по идентификатору организации — самый надёжный способ."""
    if not external_id:
        return None
    return Restaurant.objects.filter(source=source, external_id=external_id).first()


def find_nearby(name, latitude, longitude):
    """
    Запасная склейка — по координатам и названию.

    Нужна, когда идентификатора организации нет: пользователь поставил точку вручную
    или выбрал заведение, у которого его не оказалось. Сверяем не только имя,
    но и гео-точку в пределах ~20 метров.
    """
    if latitude is None or longitude is None:
        return None

    lat, lon = Decimal(str(latitude)), Decimal(str(longitude))
    nearby = Restaurant.objects.filter(
        latitude__gte=lat - GEO_MATCH_DEGREES, latitude__lte=lat + GEO_MATCH_DEGREES,
        longitude__gte=lon - GEO_MATCH_DEGREES, longitude__lte=lon + GEO_MATCH_DEGREES,
    )
    target = normalize_name(name)
    for restaurant in nearby:
        # Названия одного места часто отличаются приставкой: «Кофемания» и
        # «Кафе Кофемания». Считаем совпадением, если одно входит в другое.
        current = normalize_name(restaurant.name)
        if current and target and (current in target or target in current):
            return restaurant
    return None


def find_restaurant(external_id=None, name='', latitude=None, longitude=None):
    """
    Ищет заведение у нас, ничего не создавая.

    Нужно на этапе составления поста: если заведение уже есть, отдаём фронту его позиции
    для подсказок «такое блюдо уже есть». Если нет — про это место ещё никто не писал,
    и в каталоге ничего не появится до одобрения модератором.
    """
    return find_by_external_id(external_id) or find_nearby(name, latitude, longitude)


def get_or_create_restaurant(*, name, address='', city='', latitude=None, longitude=None,
                             external_id='', source=Restaurant.SOURCE_YANDEX):
    """
    Возвращает заведение, создавая его при необходимости.

    Вызывается в момент одобрения поста модератором — раньше заведение в каталоге
    появляться не должно.

    Гонка двух одновременных одобрений закрыта на уровне БД: ловим нарушение
    уникальности по идентификатору организации и перечитываем запись, созданную
    соседним процессом.
    """
    existing = find_restaurant(external_id, name, latitude, longitude)
    if existing:
        return existing, False

    fields = {
        'name': name,
        'address': address,
        'city': city,
        'latitude': latitude,
        'longitude': longitude,
        'source': source,
        'external_id': external_id,
    }
    try:
        with transaction.atomic():
            restaurant = Restaurant.objects.create(**fields)
    except IntegrityError:
        # Соседний процесс успел создать заведение с тем же идентификатором.
        restaurant = Restaurant.objects.get(source=source, external_id=external_id)
        return restaurant, False

    logger.info('Создано заведение %s (%s)', restaurant.name, restaurant.address)
    return restaurant, True
