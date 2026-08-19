"""
Наполнение каталога: все блюда, кухни и виды из утверждённого плана.

Иконок у новых записей нет — рисовать шестьдесят картинок дольше, чем заводить
записи. Пока показывается эмодзи: интерфейс берёт картинку, если она есть, и
значок, если нет, поэтому пустых мест не будет и справочник можно наполнять
иконками постепенно.
"""

from django.db import migrations

NEW_CUISINES = [('turkish', 'Турецкая', '🇹🇷', 70),
 ('thai', 'Тайская', '🇹🇭', 110),
 ('french', 'Французская', '🇫🇷', 170),
 ('azerbaijani', 'Азербайджанская', '🇦🇿', 190),
 ('european', 'Европейская', '🇪🇺', 200)]

CUISINE_ORDER = ['russian',
 'italian',
 'japanese',
 'georgian',
 'american',
 'uzbek',
 'turkish',
 'chinese',
 'korean',
 'thai',
 'middle-eastern',
 'mexican',
 'armenian',
 'indian',
 'greek',
 'vietnamese',
 'french',
 'spanish',
 'azerbaijani',
 'european',
 'caucasian',
 'pan-asian']

NEW_TYPES = [('hot', 'Горячее', '🔥'),
 ('for-company', 'На компанию', '👥'),
 ('takeaway', 'С собой', '🥡'),
 ('chicken', 'Курица', '🍗'),
 ('fish', 'Рыба', '🐟'),
 ('seafood', 'Морепродукты', '🦐'),
 ('cheese', 'Сыр', '🧀'),
 ('vegetables', 'Овощи', '🥕')]

TYPE_ORDER = ['breakfast',
 'soups',
 'salads',
 'snacks',
 'hot',
 'sides',
 'desserts',
 'bakery-goods',
 'drinks',
 'fastfood',
 'streetfood',
 'homestyle',
 'spicy',
 'for-company',
 'takeaway',
 'vegetarian',
 'vegan',
 'healthy',
 'lenten',
 'gluten-free',
 'lactose-free',
 'halal',
 'kids',
 'meat',
 'chicken',
 'fish',
 'seafood',
 'cheese',
 'vegetables']

# Блюда по группам: название, значок, кухня, дополнительные виды.
DISHES = {'asian': [('Роллы', '🍣', 'japanese', ['fish']),
           ('Суши', '🍣', 'japanese', ['fish']),
           ('Лапша вок', '🍜', 'pan-asian', []),
           ('Рамен', '🍜', 'japanese', ['soups']),
           ('Поке', '🥗', 'pan-asian', ['fish', 'healthy']),
           ('Боул', '🥣', 'pan-asian', ['healthy']),
           ('Гёдза', '🥟', 'japanese', ['snacks']),
           ('Дим-самы', '🥟', 'chinese', ['snacks']),
           ('Спринг-роллы', '🌯', 'vietnamese', ['snacks']),
           ('Утка по-пекински', '🦆', 'chinese', ['meat'])],
 'breakfast': [('Блины', '🥞', 'russian', ['homestyle']),
               ('Сырники', '🥞', 'russian', ['homestyle', 'cheese']),
               ('Круассан', '🥐', 'french', ['bakery-goods']),
               ('Панкейки', '🥞', 'american', []),
               ('Вафли', '🧇', 'european', []),
               ('Драники', '🥔', 'russian', ['homestyle', 'vegetables'])],
 'desserts': [('Булочка с корицей', '🍩', 'american', ['bakery-goods']),
              ('Чизкейк', '🍰', 'american', ['cheese']),
              ('Тирамису', '🍰', 'italian', []),
              ('Медовик', '🍰', 'russian', ['homestyle']),
              ('Мороженое', '🍨', 'european', []),
              ('Наполеон', '🍰', 'russian', ['homestyle']),
              ('Эклер', '🍫', 'french', ['bakery-goods'])],
 'dough': [('Хачапури', '🫓', 'georgian', ['cheese']),
           ('Пельмени', '🥟', 'russian', ['homestyle']),
           ('Хинкали', '🥟', 'georgian', ['meat']),
           ('Самса', '🥟', 'uzbek', ['streetfood']),
           ('Манты', '🥟', 'uzbek', ['meat']),
           ('Чебурек', '🥟', 'caucasian', ['streetfood']),
           ('Вареники', '🥟', 'russian', ['homestyle'])],
 'drinks': [('Кофе', '☕', 'european', []),
            ('Лимонад', '🍋', 'european', []),
            ('Смузи', '🥤', 'european', ['healthy'])],
 'fastfood': [('Бургер', '🍔', 'american', []),
              ('Шаурма', '🌯', 'middle-eastern', ['streetfood']),
              ('Хот-дог', '🌭', 'american', ['streetfood']),
              ('Куриные крылышки', '🍗', 'american', ['chicken', 'snacks']),
              ('Наггетсы', '🍗', 'american', ['chicken', 'snacks']),
              ('Картофель фри', '🍟', 'american', ['sides']),
              ('Донер', '🌯', 'turkish', ['streetfood']),
              ('Сэндвич', '🥪', 'american', ['takeaway'])],
 'hot': [('Стейк', '🥩', 'american', ['meat']),
         ('Плов', '🍚', 'uzbek', ['meat']),
         ('Шашлык', '🍢', 'caucasian', ['meat']),
         ('Люля-кебаб', '🍢', 'azerbaijani', ['meat'])],
 'pizza-pasta': [('Пицца', '🍕', 'italian', []),
                 ('Паста', '🍝', 'italian', []),
                 ('Лазанья', '🍲', 'italian', []),
                 ('Ризотто', '🍚', 'italian', [])],
 'salads': [('Салат Цезарь', '🥗', 'american', ['chicken']),
            ('Оливье', '🥗', 'russian', ['homestyle']),
            ('Греческий салат', '🥗', 'greek', ['vegetarian', 'vegetables']),
            ('Хумус', '🫓', 'middle-eastern', ['vegan', 'snacks']),
            ('Фалафель', '🧆', 'middle-eastern', ['vegan', 'snacks'])],
 'soups': [('Борщ', '🥣', 'russian', ['homestyle']),
           ('Том ям', '🍲', 'thai', ['spicy', 'seafood']),
           ('Солянка', '🍲', 'russian', ['homestyle']),
           ('Крем-суп', '🥣', 'european', []),
           ('Лагман', '🍜', 'uzbek', []),
           ('Окрошка', '🥣', 'russian', ['homestyle'])]}

# Курс проставляем только там, где он очевиден. У «Азиатского», «Теста» и
# «Пиццы» его нет: группа уже отвечает на этот вопрос, а натягивать на роллы
# «горячее» значило бы врать в фильтрах.
COURSE_BY_GROUP = {'breakfast': 'breakfast',
 'desserts': 'desserts',
 'drinks': 'drinks',
 'fastfood': 'fastfood',
 'hot': 'hot',
 'salads': 'salads',
 'soups': 'soups'}


def fill(apps, schema_editor):
    DishGroup = apps.get_model('posts', 'DishGroup')
    DishType = apps.get_model('posts', 'DishType')
    Taxon = apps.get_model('posts', 'Taxon')

    for slug, name, emoji, _order in NEW_CUISINES:
        Taxon.objects.get_or_create(
            kind='cuisine', slug=slug,
            defaults={'name': name, 'emoji': emoji},
        )
    for slug, name, emoji in NEW_TYPES:
        Taxon.objects.get_or_create(
            kind='type', slug=slug,
            defaults={'name': name, 'emoji': emoji},
        )

    # Порядок с шагом 10: между соседями остаётся место, чтобы вставить новую
    # запись, не перенумеровывая весь список.
    for kind, order in (('cuisine', CUISINE_ORDER), ('type', TYPE_ORDER)):
        for position, slug in enumerate(order, start=1):
            Taxon.objects.filter(kind=kind, slug=slug).update(sort_order=position * 10)

    cuisines = {t.slug: t for t in Taxon.objects.filter(kind='cuisine')}
    types = {t.slug: t for t in Taxon.objects.filter(kind='type')}

    for group_slug, dishes in DISHES.items():
        group = DishGroup.objects.filter(slug=group_slug).first()
        if group is None:
            continue

        for position, (name, emoji, cuisine_slug, extra) in enumerate(dishes, start=1):
            dish, created = DishType.objects.get_or_create(
                name=name, defaults={'emoji': emoji},
            )
            dish.group = group
            dish.sort_order = position * 10
            # Значок ставим только новым: у заведённых руками он мог быть
            # выбран осознанно, и перетирать чужой выбор миграцией нельзя.
            if created and not dish.emoji:
                dish.emoji = emoji
            dish.save(update_fields=['group', 'sort_order', 'emoji'])

            # Категории задаём только новым блюдам по той же причине.
            if not created:
                continue

            wanted = []
            if cuisine_slug in cuisines:
                wanted.append(cuisines[cuisine_slug])
            course = COURSE_BY_GROUP.get(group_slug)
            if course and course in types:
                wanted.append(types[course])
            wanted += [types[s] for s in extra if s in types]
            dish.default_taxons.set(wanted)


def unfill(apps, schema_editor):
    """Убираем только то, что завели здесь: чужие записи не трогаем."""
    DishType = apps.get_model('posts', 'DishType')
    Taxon = apps.get_model('posts', 'Taxon')

    DishType.objects.filter(
        name__in=[d[0] for lst in DISHES.values() for d in lst],
    ).exclude(menu_items__isnull=False).delete()
    Taxon.objects.filter(kind='cuisine', slug__in=[c[0] for c in NEW_CUISINES]).delete()
    Taxon.objects.filter(kind='type', slug__in=[t[0] for t in NEW_TYPES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('posts', '0019_seed_dish_groups'),
    ]

    operations = [
        migrations.RunPython(fill, unfill),
    ]
