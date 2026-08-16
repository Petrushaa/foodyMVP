"""
Модерация: здесь пост превращается в запись каталога.

Это ядро всей схемы. До одобрения в каталоге не появляется ничего — пост несёт
«заявку на размещение», и только сейчас по ней создаются заведение и позиция.

Что это даёт: отклонённый пост не оставляет мусора; два человека, одновременно
запостившие про одно новое блюдо, не создадут дубль (второй просто привяжется
к позиции, созданной первым); а сам момент одобрения оказывается идеальным местом
для склейки дублей — модератор видит похожие позиции и может привязать к ним.
"""

import logging

from django.db import IntegrityError, transaction
from django.utils import timezone

from ..models import MenuItem, Post, Restaurant, normalize_name
from .restaurants import (
    get_or_create_restaurant, recalculate_restaurant_stats, remember_alias,
)
from .stats import recalculate_menu_item_stats, sync_menu_item_tags

logger = logging.getLogger(__name__)


class ModerationError(Exception):
    """Пост нельзя провести через модерацию в текущем виде."""


def _restaurant_from_draft(post):
    """
    Находит или создаёт заведение по заявке.

    Если автор выбрал существующее из подсказок — берём его. Иначе создаём новое
    из введённых названия, адреса и города.
    """
    if post.draft_restaurant_id:
        return post.draft_restaurant

    if not post.draft_restaurant_name or not post.draft_restaurant_address:
        raise ModerationError('В заявке нет названия или адреса заведения.')

    restaurant, created = get_or_create_restaurant(
        name=post.draft_restaurant_name,
        address=post.draft_restaurant_address,
        city=post.draft_restaurant_city,
        source=post.draft_restaurant_source or Restaurant.SOURCE_USER,
        external_id=post.draft_restaurant_external_id,
    )
    if created:
        logger.info('Модерация: создано заведение %s', restaurant.name)
    return restaurant


def _menu_item_from_draft(post, restaurant, name=None):
    """
    Находит или создаёт позицию в заведении.

    Категории **копируются** из заявки, а не берутся ссылкой на справочник:
    правка справочника задним числом не должна переписывать готовые позиции.
    """
    name = (name or post.draft_menu_item_name).strip()
    if not name:
        raise ModerationError('В заявке нет названия позиции.')

    normalized = normalize_name(name)
    existing = MenuItem.objects.filter(
        restaurant=restaurant, normalized_name=normalized,
    ).first()
    if existing:
        return existing, False

    try:
        with transaction.atomic():
            menu_item = MenuItem.objects.create(
                restaurant=restaurant,
                name=name,
                dish_type=post.draft_dish_type,
                price=post.proposed_price,
                price_confirmed_at=timezone.now() if post.proposed_price else None,
            )
    except IntegrityError:
        # Соседний модератор одобрил другой пост про то же блюдо секундой раньше.
        menu_item = MenuItem.objects.get(restaurant=restaurant, normalized_name=normalized)
        return menu_item, False

    # Позиция без категорий не находится ни одним фильтром — ни по кухне, ни по
    # формату, ни по форме. Поэтому если в заявке их нет, берём у типа блюда.
    taxons = post.draft_taxons.all()
    if not taxons.exists() and post.draft_dish_type_id:
        taxons = post.draft_dish_type.default_taxons.all()
    menu_item.taxons.set(taxons)
    logger.info('Модерация: создана позиция «%s» в %s', menu_item.name, restaurant.name)
    return menu_item, True


def _apply_price_proposal(post, menu_item, accept):
    """
    Решение по цене принимается **отдельно от решения по посту**: хороший пост
    с бредовой ценой должен публиковаться, а цена — отклоняться.
    """
    if post.proposed_price_status != Post.PRICE_PROPOSAL_PENDING:
        return
    if not accept:
        post.proposed_price_status = Post.PRICE_PROPOSAL_REJECTED
        return

    post.proposed_price_status = Post.PRICE_PROPOSAL_ACCEPTED
    menu_item.price = post.proposed_price
    menu_item.price_confirmed_at = timezone.now()
    menu_item.save(update_fields=['price', 'price_confirmed_at'])


@transaction.atomic
def approve_post(post, moderator, *, menu_item=None, restaurant=None,
                 menu_item_name=None, accept_price=True):
    """
    Одобряет пост и заводит всё, чего не хватает в каталоге.

    `menu_item` — привязать пост к существующей позиции вместо создания новой.
    `restaurant` — то же для заведения: блюдо новое, а место уже есть в каталоге.
    Без этого одобрение всегда заводило новое заведение, и «Ролльная» с «Рольной»
    по одному адресу расходились в два места с одинаковыми роллами.

    `menu_item_name` — поправленное название, если автор написал криво.
    `accept_price` — решение по предложенной цене.
    """
    if post.status == Post.STATUS_APPROVED:
        raise ModerationError('Пост уже одобрен.')
    if post.is_deleted:
        raise ModerationError('Пост удалён автором.')

    target = menu_item or post.menu_item
    if target is None:
        place = restaurant or _restaurant_from_draft(post)
        if restaurant is not None:
            # Модератор опознал место: запоминаем написание автора синонимом,
            # чтобы в следующий раз поиск привёл сюда сам.
            remember_alias(restaurant, post.draft_restaurant_name,
                           post.draft_restaurant_address)
            post.draft_restaurant = restaurant
        target, _ = _menu_item_from_draft(post, place, name=menu_item_name)
    elif menu_item_name:
        target.name = menu_item_name.strip()
        target.save(update_fields=['name', 'normalized_name'])

    post.menu_item = target
    post.status = Post.STATUS_APPROVED
    post.moderated_by = moderator
    post.moderated_at = timezone.now()
    post.rejection_reason = ''
    _apply_price_proposal(post, target, accept_price)
    post.save()

    # Позиция становится видимой, только когда у неё есть хотя бы один видимый пост,
    # поэтому показатели пересчитываем сразу после одобрения.
    recalculate_menu_item_stats(target)
    sync_menu_item_tags(target)
    # Заведение попадёт в публичный каталог, только когда о нём напишут
    # несколько разных людей — счётчик авторов держим в актуальном виде.
    recalculate_restaurant_stats(target.restaurant)
    return post


@transaction.atomic
def reject_post(post, moderator, reason):
    """
    Отклоняет пост. В каталоге не появляется ничего — в этом и был смысл того,
    чтобы создавать позицию и заведение только при одобрении.
    """
    if post.is_deleted:
        raise ModerationError('Пост удалён автором.')
    if not (reason or '').strip():
        raise ModerationError('Укажите причину отказа — автор её увидит.')

    was_approved_for = post.menu_item if post.status == Post.STATUS_APPROVED else None

    post.status = Post.STATUS_REJECTED
    post.moderated_by = moderator
    post.moderated_at = timezone.now()
    post.rejection_reason = reason.strip()
    if post.proposed_price_status == Post.PRICE_PROPOSAL_PENDING:
        post.proposed_price_status = Post.PRICE_PROPOSAL_REJECTED
    post.save()

    # Если отклоняем ранее одобренный пост, позиция теряет его оценку.
    if was_approved_for:
        recalculate_menu_item_stats(was_approved_for)
        sync_menu_item_tags(was_approved_for)
        recalculate_restaurant_stats(was_approved_for.restaurant)
    return post


def similar_menu_items(post, limit=5):
    """
    Похожие позиции в том же заведении — подсказка модератору «может, это дубль?».

    Ищем нечётко, по триграммам: «Бургер с трюфелем» и «Трюфельный бургер» на глаз
    разные, а для поиска по тройкам букв близкие. Это самое дешёвое место в системе,
    где можно не дать каталогу засориться.
    """
    from django.contrib.postgres.search import TrigramSimilarity

    if post.menu_item_id or not post.draft_menu_item_name:
        return MenuItem.objects.none()

    restaurant = post.draft_restaurant
    if restaurant is None:
        return MenuItem.objects.none()

    target = normalize_name(post.draft_menu_item_name)
    return (
        MenuItem.objects
        .filter(restaurant=restaurant, status=MenuItem.STATUS_ACTIVE)
        .annotate(similarity=TrigramSimilarity('normalized_name', target))
        .filter(similarity__gt=0.3)
        .order_by('-similarity')[:limit]
    )
