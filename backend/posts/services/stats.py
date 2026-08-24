"""
Пересчёт показателей позиции: рейтинг, количество оценок, число видимых постов, теги.

Рейтинг считается байесовским средним:

    R = (n × среднее + m × C) / (n + m)

где `n` — сколько разных людей оценили позицию, `среднее` — среднее их оценок,
`C` — среднее по всем позициям сервиса, `m` — порог доверия.

Смысл в том, что одна десятка от одного человека даёт примерно середину, а двадцать
восьмёрок — почти честные 8. Сортировать каталог надо по этому числу, а показывать
пользователю — сырое среднее и «по N оценкам»: иначе непонятно, почему единственная
оценка 10/10 отображается как 6.2.

Важно: **один человек — один голос**, даже если он написал про блюдо три поста.
Берём его последнюю оценку.
"""

import logging

from django.conf import settings
from django.core.cache import cache
from django.db.models import Avg, Count, F, Sum

from ..models import MENU_ITEM_TAG_MIN_MENTIONS, MenuItem, MenuItemTag, Post, Tag

logger = logging.getLogger(__name__)


def _visible_posts(menu_item):
    """Одобренные и не удалённые посты позиции. Только они влияют на показатели."""
    return Post.objects.filter(menu_item=menu_item, status=Post.STATUS_APPROVED)


def _latest_ratings(menu_item):
    """
    Последняя оценка каждого автора. `DISTINCT ON` — приём PostgreSQL: сортируем
    по автору и дате, и берём первую строку в каждой группе.
    """
    return (
        _visible_posts(menu_item)
        .exclude(user__isnull=True)
        .order_by('user_id', '-created_at')
        .distinct('user_id')
    )


GLOBAL_AVERAGE_CACHE_KEY = 'menu_item:global_average_rating'


def global_average_rating(use_cache=True):
    """
    Среднее по всем позициям сервиса — константа `C` в формуле.

    Меняется медленно, а нужна на каждый пересчёт, поэтому держим в кэше:
    иначе одобрение каждого поста тянуло бы за собой агрегат по всей таблице.
    """
    if use_cache:
        cached = cache.get(GLOBAL_AVERAGE_CACHE_KEY)
        if cached is not None:
            return cached

    average = MenuItem.objects.filter(ratings_count__gt=0).aggregate(
        value=Avg('rating_raw')
    )['value']
    if average is None:
        # Пустая база: пока не на что опереться, берём середину шкалы.
        average = settings.MAX_REVIEW_RATING / 2

    cache.set(GLOBAL_AVERAGE_CACHE_KEY, average, timeout=settings.RATING_GLOBAL_AVG_TTL)
    return average


def bayesian_rating(count, raw, global_average):
    """
    Байесовское среднее: R = (n × среднее + m × C) / (n + m).

    Одна десятка от одного человека даёт примерно середину, двадцать восьмёрок —
    почти честные 8.
    """
    if not count:
        return 0.0
    prior = settings.RATING_PRIOR_COUNT
    return (count * raw + prior * global_average) / (count + prior)


def recalculate_menu_item_stats(menu_item, global_average=None):
    """Пересчитывает и сохраняет показатели одной позиции."""
    ratings = list(_latest_ratings(menu_item).values_list('author_rating', flat=True))
    count = len(ratings)
    raw = sum(ratings) / count if count else 0.0

    if global_average is None:
        global_average = global_average_rating()

    bayes = bayesian_rating(count, raw, global_average)

    menu_item.ratings_count = count
    menu_item.rating_raw = round(raw, 2)
    menu_item.rating = round(bayes, 4)
    menu_item.posts_count = _visible_posts(menu_item).count()
    menu_item.save(update_fields=['ratings_count', 'rating_raw', 'rating', 'posts_count'])
    return menu_item


def sync_menu_item_tags(menu_item):
    """
    Пересобирает теги позиции из тегов её видимых постов.

    Тег показывается в карточке, только когда его написали несколько разных людей —
    иначе один шутник насыпет позиции чего угодно. Само число упоминаний храним
    всегда, показ решается по нему.
    """
    counts = (
        Tag.objects
        .filter(posts__in=_visible_posts(menu_item))
        .annotate(mentions=Count('posts__user_id', distinct=True))
        .values_list('id', 'mentions')
    )
    counts = dict(counts)

    for tag_id, mentions in counts.items():
        MenuItemTag.objects.update_or_create(
            menu_item=menu_item, tag_id=tag_id, defaults={'mentions_count': mentions},
        )
    # Теги, которых в видимых постах больше нет (посты удалили или отклонили).
    MenuItemTag.objects.filter(menu_item=menu_item).exclude(tag_id__in=counts).delete()
    return counts


def visible_tags(menu_item):
    """Теги, набравшие достаточно упоминаний, чтобы показываться в карточке."""
    return MenuItemTag.objects.filter(
        menu_item=menu_item, mentions_count__gte=MENU_ITEM_TAG_MIN_MENTIONS,
    ).select_related('tag')


def brand_rating(menu_item):
    """
    Объединённый рейтинг блюда по всей сети.

    Биг Тейсти во всех Маках примерно одинаков, а рейтинг в каждой точке
    собирается по одной-двум оценкам. Поэтому у сетевых блюд показываем два числа:
    в этой точке и по сети целиком. Считаем на лету — сетевых позиций немного,
    и отдельное поле в базе тут только рассинхронизируется.

    Возвращает None, если заведение не сетевое или блюдо встречается лишь в одной точке.
    """
    brand_id = menu_item.restaurant.brand_id
    if not brand_id:
        return None

    siblings = MenuItem.objects.filter(
        restaurant__brand_id=brand_id,
        normalized_name=menu_item.normalized_name,
        status=MenuItem.STATUS_ACTIVE,
        ratings_count__gt=0,
    )
    totals = siblings.aggregate(
        votes=Sum('ratings_count'),
        weighted=Sum(F('rating_raw') * F('ratings_count')),
        points=Count('id'),
    )
    votes = totals['votes'] or 0
    if votes == 0 or (totals['points'] or 0) < 2:
        return None

    raw = totals['weighted'] / votes
    return {
        'rating_raw': round(raw, 2),
        'rating': round(bayesian_rating(votes, raw, global_average_rating()), 4),
        'ratings_count': votes,
        'restaurants_count': totals['points'],
    }


def recalculate_all_menu_item_stats(batch_size=500):
    """
    Пересчитывает показатели всех позиций.

    Одобрение поста пересчитывает свою позицию сразу, так что задача нужна для другого:
    среднее по сервису («C» в формуле) со временем плывёт, а от него зависит рейтинг
    каждой позиции. Плюс это страховка от рассинхрона.
    """
    global_average = global_average_rating(use_cache=False)
    updated = 0

    queryset = MenuItem.objects.filter(posts_count__gt=0).order_by('id')
    for menu_item in queryset.iterator(chunk_size=batch_size):
        recalculate_menu_item_stats(menu_item, global_average=global_average)
        updated += 1

    logger.info('Пересчёт рейтингов позиций: обновлено %d', updated)
    return updated


def planned_taxons(menu_item):
    """
    Каким набор категорий станет после пересчёта. None — позицию не трогаем.

    Отдельно от применения, чтобы `--dry-run` показывал ровно то, что потом и
    произойдёт. Раньше предпросмотр считал по своей копии этой логики, копия
    отстала от оригинала, и команда обещала не то, что делала.
    """
    from ..models import MEAT_SLUGS, MEATLESS_SLUGS, AUTHOR_TAXON_SLUGS

    if menu_item.taxons_manual:
        return None

    current = set(menu_item.taxons.all())
    from_dish = (
        set(menu_item.dish_type.default_taxons.all())
        if menu_item.dish_type_id else set()
    )
    # Свойства тарелки оставляем как есть, а не пересобираем по постам.
    #
    # Раньше они собирались со всех видимых постов позиции — и пересчёт
    # расходился с одобрением: одобрение отметку второго автора отбрасывает
    # («позиция уже описана, овощная шаурма — отдельная позиция»), а пересчёт
    # её подхватывал. Одна и та же позиция получала разный набор в зависимости
    # от того, гоняли команду или нет.
    #
    # Обновляем здесь только классификацию — ради неё команда и существует.
    kept_author = {t for t in current if t.slug in AUTHOR_TAXON_SLUGS}

    wanted = from_dish | kept_author
    if any(t.slug in MEATLESS_SLUGS for t in kept_author):
        wanted = {t for t in wanted if t.slug not in MEAT_SLUGS}
    return wanted
