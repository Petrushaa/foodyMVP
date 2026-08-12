"""
Заведения: подсказки, склейка дублей и слияние.

Справочник целиком наш — название и адрес вводит пользователь. Значит вся защита
от дублей и выдуманных мест лежит на нас, и строится она лесенкой:

1. **Подсказки при вводе** — человек видит уже существующие заведения и выбирает их.
   Самый дешёвый и самый действенный уровень.
2. **Точная склейка** по тройке «город + название + адрес» в нормализованном виде.
3. **Серверная проверка на дубль** — сервер сам ищет похожее, не полагаясь на то,
   что фронт показал подсказку: обойти фронт через любой HTTP-клиент дело двух минут.
4. **Модератор** — последний рубеж, видит пометки от предыдущих уровней.
5. **Подтверждение независимыми людьми** — заведение, о котором написал один человек,
   в публичный каталог не попадает.
"""

import logging

from django.contrib.postgres.search import TrigramSimilarity
from django.db import IntegrityError, transaction
from django.db.models import Count, Q

from ..models import (
    MenuItem, MenuItemAlias, Post, Restaurant, RestaurantAlias,
    normalize_address, normalize_name,
)

logger = logging.getLogger(__name__)

# Порог схожести названия, при котором сервер считает, что человек заводит дубль.
DUPLICATE_NAME_THRESHOLD = 0.55
# Порог для фонового поиска дублей — там можно быть придирчивее, разбирает человек.
BACKGROUND_DUPLICATE_THRESHOLD = 0.7


def search_restaurants(text, city='', limit=10, only_public=False):
    """
    Подсказки заведений при вводе названия.

    Ищет и по названиям, и по синонимам — написаниям, под которыми это место
    уже пытались завести. Сортировка по числу постов: настоящее заведение
    с двадцатью постами должно стоять выше случайного дубля с одним.
    """
    target = normalize_name(text)
    if not target:
        return Restaurant.objects.none()

    queryset = Restaurant.objects.filter(is_hidden=False)
    if city:
        queryset = queryset.filter(normalized_city=normalize_name(city))
    if only_public:
        queryset = queryset.filter(contributors_count__gte=Restaurant.CONFIRMATIONS_REQUIRED)

    alias_ids = RestaurantAlias.objects.annotate(
        similarity=TrigramSimilarity('normalized_name', target),
    ).filter(similarity__gt=DUPLICATE_NAME_THRESHOLD).values_list('restaurant_id', flat=True)

    return (
        queryset
        .annotate(similarity=TrigramSimilarity('normalized_name', target))
        .filter(Q(similarity__gt=0.3) | Q(normalized_name__startswith=target)
                | Q(id__in=list(alias_ids)))
        # Подтверждённые и «обжитые» — выше.
        .order_by('-contributors_count', '-posts_count', '-similarity')[:limit]
    )


def find_exact(name, address, city):
    """Точное совпадение по нормализованной тройке — то же самое заведение."""
    return Restaurant.objects.filter(
        normalized_city=normalize_name(city),
        normalized_name=normalize_name(name),
        normalized_address=normalize_address(address),
    ).first()


def find_possible_duplicates(name, address, city, limit=5):
    """
    Похожие заведения — для серверной проверки «а не дубль ли это».

    Совпадение считается вероятным, когда похоже название, а адрес либо совпадает,
    либо тоже похож. Одного названия мало: «Шоколадница» на разных улицах —
    это разные заведения, и склеивать их нельзя.
    """
    target_name = normalize_name(name)
    target_address = normalize_address(address)
    if not target_name:
        return Restaurant.objects.none()

    return (
        Restaurant.objects
        .filter(normalized_city=normalize_name(city), is_hidden=False)
        .annotate(
            name_similarity=TrigramSimilarity('normalized_name', target_name),
            address_similarity=TrigramSimilarity('normalized_address', target_address),
        )
        .filter(name_similarity__gt=DUPLICATE_NAME_THRESHOLD)
        .filter(Q(address_similarity__gt=0.5) | Q(normalized_address=target_address))
        .order_by('-name_similarity', '-address_similarity')[:limit]
    )


@transaction.atomic
def get_or_create_restaurant(*, name, address, city, source=Restaurant.SOURCE_USER,
                             external_id=''):
    """
    Возвращает заведение по введённым данным, создавая при необходимости.

    Вызывается при одобрении поста модератором — раньше заведение в каталоге
    появляться не должно.
    """
    existing = find_exact(name, address, city)
    if existing:
        return existing, False

    try:
        with transaction.atomic():
            restaurant = Restaurant.objects.create(
                name=name.strip(), address=address.strip(), city=city.strip(),
                source=source, external_id=external_id,
            )
    except IntegrityError:
        # Соседний модератор успел одобрить другой пост про это же место.
        restaurant = find_exact(name, address, city)
        if restaurant is None:
            raise
        return restaurant, False

    logger.info('Создано заведение «%s», %s', restaurant.name, restaurant.address)
    return restaurant, True


def recalculate_restaurant_stats(restaurant):
    """
    Пересчитывает число видимых постов и разных авторов.

    Число авторов решает, попадёт ли заведение в публичный каталог: пока про него
    написал один человек, оно остаётся неподтверждённым.
    """
    stats = Post.objects.filter(
        menu_item__restaurant=restaurant, status=Post.STATUS_APPROVED,
    ).aggregate(posts=Count('id'), authors=Count('user_id', distinct=True))

    restaurant.posts_count = stats['posts'] or 0
    restaurant.contributors_count = stats['authors'] or 0
    restaurant.save(update_fields=['posts_count', 'contributors_count'])
    return restaurant


# --- Слияние дублей -------------------------------------------------------

def _remember_alias(target, name, address):
    """
    Сохраняет написание дубля синонимом выжившего.

    Смысл в том, что каждое слияние делает поиск умнее: в следующий раз
    «Кафе Кофемания» найдёт «Кофеманию», а не заведёт третий дубль.
    """
    if normalize_name(name) == target.normalized_name and \
            normalize_address(address) == target.normalized_address:
        return
    RestaurantAlias.objects.get_or_create(
        restaurant=target,
        normalized_name=normalize_name(name),
        normalized_address=normalize_address(address),
        defaults={'name': name, 'address': address},
    )


@transaction.atomic
def merge_menu_items(source, target):
    """
    Сливает две позиции: посты переезжают, написание дубля остаётся синонимом,
    сама запись удаляется. Записи-призрака не остаётся — ценность позиции
    в её постах, а они переехали.
    """
    if source.pk == target.pk:
        return target

    MenuItemAlias.objects.get_or_create(
        menu_item=target, normalized_name=source.normalized_name,
        defaults={'name': source.name},
    )
    # Синонимы дубля тоже переезжают — они уже кому-то помогли найти это блюдо.
    MenuItemAlias.objects.filter(menu_item=source).update(menu_item=target)

    Post.all_objects.filter(menu_item=source).update(menu_item=target)
    source.delete()

    from .stats import recalculate_menu_item_stats, sync_menu_item_tags
    recalculate_menu_item_stats(target)
    sync_menu_item_tags(target)
    logger.info('Позиции слиты: «%s» → «%s»', source.name, target.name)
    return target


@transaction.atomic
def merge_restaurants(source, target):
    """
    Сливает два заведения. Позиции переезжают; если у выжившего уже есть позиция
    с тем же названием — сливаются и они.
    """
    if source.pk == target.pk:
        return target

    _remember_alias(target, source.name, source.address)
    RestaurantAlias.objects.filter(restaurant=source).update(restaurant=target)

    existing = {item.normalized_name: item for item in MenuItem.objects.filter(restaurant=target)}
    for item in MenuItem.objects.filter(restaurant=source):
        twin = existing.get(item.normalized_name)
        if twin:
            merge_menu_items(item, twin)
        else:
            item.restaurant = target
            item.save(update_fields=['restaurant'])

    source.delete()
    recalculate_restaurant_stats(target)
    logger.info('Заведения слиты: «%s» → «%s»', source.name, target.name)
    return target


def find_duplicate_pairs(city='', limit=50):
    """
    Фоновый поиск дублей, которые просочились мимо подсказок.

    Люди пишут одно и то же неожиданно разными способами, и заранее все варианты
    не предусмотреть. Найденные пары уходят модератору, автоматически ничего
    не сливаем — цена ошибки слишком высока.
    """
    queryset = Restaurant.objects.filter(is_hidden=False)
    if city:
        queryset = queryset.filter(normalized_city=normalize_name(city))

    pairs = []
    seen = set()
    for restaurant in queryset.order_by('-posts_count').iterator(chunk_size=200):
        candidates = (
            queryset
            .exclude(pk=restaurant.pk)
            .filter(normalized_city=restaurant.normalized_city)
            .annotate(
                name_similarity=TrigramSimilarity('normalized_name', restaurant.normalized_name),
                address_similarity=TrigramSimilarity(
                    'normalized_address', restaurant.normalized_address,
                ),
            )
            .filter(name_similarity__gt=BACKGROUND_DUPLICATE_THRESHOLD)
            .filter(address_similarity__gt=0.5)
        )
        for candidate in candidates:
            key = tuple(sorted((restaurant.pk, candidate.pk)))
            if key in seen:
                continue
            seen.add(key)
            pairs.append((restaurant, candidate, candidate.name_similarity))
            if len(pairs) >= limit:
                return pairs
    return pairs
