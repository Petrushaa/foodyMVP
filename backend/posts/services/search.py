"""
Умный поиск позиций.

Человек пишет с опечатками, другими словами или вообще не в той раскладке — система
должна понимать. Работает лесенкой, всё на самом PostgreSQL, без внешних сервисов:

1. **Точное совпадение** по нормализованному названию — «Чиз Бургер!» и «чизбургер».
2. **Синонимы** — ручной список, который ведёт модератор: «шава» → «шаурма».
3. **Нечёткий поиск по триграммам** — слово режется на тройки букв, ловит «бургир»,
   «бургр», «бурегр».
4. **Раскладка и латиница** — `,daufh` → «бургер», `burger` → «бургер».

Показываем первое, что дало результат: точное совпадение лучше похожего.
"""

import logging

from django.contrib.postgres.search import TrigramSimilarity
from django.db.models import Q
from django.db.models.functions import Greatest

from ..models import MenuItem, MenuItemAlias, normalize_name

logger = logging.getLogger(__name__)

# Порог схожести для триграмм. Ниже — начинается мусор, выше — не ловятся опечатки.
TRIGRAM_THRESHOLD = 0.3
# Порог подобран по замеру на нынешнем справочнике: настоящие опечатки
# («Шаурам», «Бургр») дают 0.33–0.44, а самое похожее ложное срабатывание
# («Салат с рукколой» на «Салат Цезарь») — 0.26. Между ними и режем.
#
# Промахнуться здесь не страшно: угаданное блюдо всё равно подтверждает
# модератор. Пропустить хуже, чем предложить неверное — во втором случае он
# просто меняет, в первом выбирает с нуля.
DISH_GUESS_THRESHOLD = 0.3

# Раскладка: латинская клавиша → русская буква на том же месте клавиатуры.
_LATIN_KEYS = "qwertyuiop[]" + "asdfghjkl;'" + "zxcvbnm,." + "`"
_CYRILLIC_KEYS = 'йцукенгшщзхъ' + 'фывапролджэ' + 'ячсмитьбю' + 'ё'
assert len(_LATIN_KEYS) == len(_CYRILLIC_KEYS), 'раскладки разошлись по длине'

# Только нижний регистр: у знаков вроде «,» верхнего нет, и при склейке таблицы
# они затирались бы заглавной буквой. Всё равно всё приводится к нижнему регистру.
_LAYOUT = str.maketrans(_LATIN_KEYS, _CYRILLIC_KEYS)

# Транслитерация: сначала длинные сочетания, иначе «sh» превратится в «сх».
_TRANSLIT = [
    ('shch', 'щ'), ('sch', 'щ'), ('yo', 'ё'), ('zh', 'ж'), ('kh', 'х'), ('ts', 'ц'),
    ('ch', 'ч'), ('sh', 'ш'), ('yu', 'ю'), ('ya', 'я'), ('ye', 'е'), ('eh', 'э'),
    ('a', 'а'), ('b', 'б'), ('v', 'в'), ('g', 'г'), ('d', 'д'), ('e', 'е'),
    ('z', 'з'), ('i', 'и'), ('j', 'й'), ('k', 'к'), ('l', 'л'), ('m', 'м'),
    ('n', 'н'), ('o', 'о'), ('p', 'п'), ('r', 'р'), ('s', 'с'), ('t', 'т'),
    ('u', 'у'), ('f', 'ф'), ('h', 'х'), ('c', 'ц'), ('y', 'ы'), ('w', 'в'),
    ('x', 'кс'), ('q', 'к'),
]


def fix_layout(text):
    """`,ehuth` → «бургер». Человек забыл переключить раскладку."""
    return text.lower().translate(_LAYOUT)


def transliterate(text):
    """`burger` → «бургер». Человек пишет латиницей то, что в базе кириллицей."""
    result = text.lower()
    for latin, cyrillic in _TRANSLIT:
        result = result.replace(latin, cyrillic)
    return result


def query_variants(text):
    """
    Все варианты написания запроса, от самого вероятного к самому натянутому.
    Дубли убираем, порядок сохраняем.
    """
    variants = []
    for candidate in (text, fix_layout(text), transliterate(text)):
        normalized = normalize_name(candidate)
        if normalized and normalized not in variants:
            variants.append(normalized)
    return variants


def _base_queryset(restaurant=None):
    """
    Позиции, которые вообще можно показывать: активные и с хотя бы одним видимым
    постом. Позиция без постов остаётся в базе, но из поиска прячется.
    """
    queryset = MenuItem.objects.filter(status=MenuItem.STATUS_ACTIVE, posts_count__gt=0)
    if restaurant is not None:
        queryset = queryset.filter(restaurant=restaurant)
    return queryset


def _cut(queryset, limit):
    """Срез только когда лимит задан: срезанный queryset дальше не отфильтровать."""
    return queryset[:limit] if limit else queryset


def search_menu_items(text, *, queryset=None, restaurant=None, limit=10,
                      include_empty=False):
    """
    Ищет позиции по названию, поднимаясь по лесенке способов.

    `queryset` — на чём искать. Нужен странице поиска: там выдача уже сужена
    городом, категорией и ценой, и искать надо внутри неё, а не по всей базе.
    `limit=None` — не резать выдачу, отдать queryset под пагинацию.

    `include_empty=True` — искать и среди позиций без постов. Нужно при создании
    поста: иначе человек не найдёт позицию, у которой пока нет одобренных постов,
    и создаст дубль.
    """
    text = (text or '').strip()
    if not text:
        return MenuItem.objects.none()

    if queryset is None:
        queryset = _base_queryset(restaurant)
        if include_empty:
            queryset = MenuItem.objects.filter(status=MenuItem.STATUS_ACTIVE)
            if restaurant is not None:
                queryset = queryset.filter(restaurant=restaurant)

    variants = query_variants(text)
    if not variants:
        return MenuItem.objects.none()

    # 1. Точное совпадение — самый желанный результат.
    exact = queryset.filter(normalized_name__in=variants)
    if exact.exists():
        return _cut(exact.select_related('restaurant'), limit)

    # 2. Синонимы, которые ведёт модератор.
    alias_ids = MenuItemAlias.objects.filter(
        normalized_name__in=variants
    ).values_list('menu_item_id', flat=True)
    if alias_ids:
        by_alias = queryset.filter(id__in=list(alias_ids))
        if by_alias.exists():
            return _cut(by_alias.select_related('restaurant'), limit)

    # 3. Начало названия — «бург» должно находить «бургер» ещё до триграмм.
    prefix = Q()
    for variant in variants:
        prefix |= Q(normalized_name__startswith=variant)
    by_prefix = queryset.filter(prefix)
    if by_prefix.exists():
        return _cut(by_prefix.select_related('restaurant').order_by('-rating'), limit)

    # 4. Нечёткий поиск по триграммам — ловит опечатки.
    similarity = None
    for variant in variants:
        expression = TrigramSimilarity('normalized_name', variant)
        similarity = expression if similarity is None else Greatest(similarity, expression)

    return _cut(
        queryset
        .annotate(similarity=similarity)
        .filter(similarity__gt=TRIGRAM_THRESHOLD)
        .select_related('restaurant')
        .order_by('-similarity', '-rating'),
        limit,
    )


def guess_dish_type(name):
    """
    Угадывает блюдо справочника по названию позиции.

    Человек больше не выбирает блюдо сам: на неполном каталоге он постоянно
    упирался бы в «моего блюда нет», а это выглядит как поломка. Вместо выбора
    система предполагает, а модератор подтверждает.

    Лесенка та же, что и в поиске позиций, и по той же причине: сначала самые
    надёжные способы, нечёткое сравнение — последним, чтобы «Пельменная» не
    превратилась в «Пельмени» раньше, чем отработает точное совпадение.

    Возвращает None, когда ничего похожего нет. Это нормальный исход: блюдо у
    позиции необязательное, нишевая еда живёт без него и находится поиском.
    """
    from ..models import DishType

    text = (name or '').strip()
    if not text:
        return None

    variants = query_variants(text)
    if not variants:
        return None

    dishes = list(DishType.objects.all())
    if not dishes:
        return None

    normalized = {normalize_name(d.name): d for d in dishes}

    # 1. Название позиции целиком совпало с блюдом: «Шаурма» → Шаурма.
    for variant in variants:
        if variant in normalized:
            return normalized[variant]

    # 2. Синонимы, которые ведёт модератор: «шаверма» → Шаурма. Стоят раньше
    #    поиска по слову, потому что это прямое указание человека, а не догадка.
    from ..models import DishTypeAlias

    alias = DishTypeAlias.objects.filter(
        normalized_name__in=variants,
    ).select_related('dish_type').first()
    if alias:
        return alias.dish_type

    # 3. Блюдо стоит словом в названии: «Шаурма классическая» → Шаурма.
    #    Идём от длинных названий к коротким, иначе «Салат Цезарь» проиграет
    #    «Салату», случись он в справочнике.
    for dish_key, dish in sorted(normalized.items(), key=lambda p: -len(p[0])):
        for variant in variants:
            if dish_key in variant.split() or f' {dish_key} ' in f' {variant} ':
                return dish

    # 4. Нечёткое сравнение — ловит опечатки и формы слова.
    match = (
        DishType.objects
        .annotate(similarity=TrigramSimilarity('name', text))
        .filter(similarity__gt=DISH_GUESS_THRESHOLD)
        .order_by('-similarity')
        .first()
    )
    return match
