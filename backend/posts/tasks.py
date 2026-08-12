"""
Фоновые задачи приложения posts.

Обновления заведений здесь нет и не будет: название, адрес и координаты подтверждены
пользователем, это наши данные — освежать их из внешнего источника не нужно.
"""

import logging

from celery import shared_task

from .services.restaurants import find_duplicate_pairs
from .services.stats import recalculate_all_menu_item_stats

logger = logging.getLogger(__name__)


@shared_task
def recalculate_menu_item_ratings():
    """
    Пересчитывает рейтинги всех позиций.

    Одобрение поста пересчитывает свою позицию сразу, поэтому задача решает другую
    задачу: среднее по сервису («C» в байесовской формуле) со временем плывёт,
    а от него зависит рейтинг каждой позиции. Заодно чинит возможный рассинхрон.
    """
    updated = recalculate_all_menu_item_stats()
    return f'updated={updated}'


@shared_task
def find_restaurant_duplicates():
    """
    Ищет дубли заведений, просочившиеся мимо подсказок.

    Люди пишут одно и то же неожиданно разными способами, и заранее все варианты
    не предусмотреть. Автоматически ничего не сливаем — цена ошибки слишком высока:
    два разных кафе в одном здании склеить куда хуже, чем оставить дубль.
    Найденное пишем в лог, разбирает модератор.
    """
    pairs = find_duplicate_pairs()
    for first, second, similarity in pairs:
        logger.warning(
            'Возможный дубль заведений (%.2f): #%d «%s», %s — #%d «%s», %s',
            similarity, first.id, first.name, first.address,
            second.id, second.name, second.address,
        )
    return f'found={len(pairs)}'
