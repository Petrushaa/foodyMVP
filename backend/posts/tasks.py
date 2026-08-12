"""
Фоновые задачи приложения posts.

Обновления заведений здесь нет и не будет: название, адрес и координаты подтверждены
пользователем, это наши данные — освежать их из внешнего источника не нужно.
"""

import logging

from celery import shared_task

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
