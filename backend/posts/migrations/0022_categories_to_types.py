"""
Категории блюд переезжают из групп в виды.

Группа была осью с одним значением, и в неё пытались уместить признаки разной
природы: «Супы» (когда едят), «Паста и лапша» (что на тарелке), «Фастфуд» (как
продают). Любое такое деление рано или поздно упирается в блюдо, которое честно
принадлежит двум группам сразу — том ям это и суп, и морепродукты.

Вид многозначный по устройству, поэтому пересечения перестают быть проблемой:
лазанья спокойно и «паста и лапша», и «горячее», а том ям — и «супы», и
«морепродукты». Блюда снова лежат плоским списком.
"""

from django.db import migrations

# Категория → код вида, значок, блюда. Где вид уже был, берём существующий.
CATEGORIES = [('Фастфуд',
  'fastfood',
  '🍟',
  ['Бургер', 'Хот-дог', 'Наггетсы', 'Картофель фри', 'Пицца']),
 ('Паста и лапша',
  'pasta-noodles',
  '🍝',
  ['Паста', 'Лапша вок', 'Рамен', 'Лагман', 'Лазанья']),
 ('Мясо',
  'meat',
  '🥩',
  ['Стейк', 'Шашлык', 'Люля-кебаб', 'Ребрышки', 'Утка по-пекински']),
 ('Пельмени и хинкали',
  'dumplings',
  '🥟',
  ['Пельмени', 'Хинкали', 'Манты', 'Вареники', 'Гёдза', 'Дим-самы']),
 ('Рыба и морепродукты', 'fish', '🍣', ['Роллы', 'Суши', 'Поке']),
 ('Десерты',
  'desserts',
  '🍰',
  ['Чизкейк', 'Тирамису', 'Медовик', 'Мороженое', 'Эклер', 'Наполеон']),
 ('Выпечка',
  'bakery-goods',
  '🥐',
  ['Хачапури', 'Самса', 'Чебурек', 'Круассан', 'Синнабон', 'Булочка с корицей']),
 ('Супы', 'soups', '🍲', ['Борщ', 'Том ям', 'Солянка', 'Крем-суп', 'Окрошка']),
 ('Завтраки',
  'breakfast',
  '🍳',
  ['Блины', 'Сырники', 'Драники', 'Панкейки', 'Вафли']),
 ('Напитки', 'drinks', '🥤', ['Кофе', 'Лимонад', 'Смузи']),
 ('Салаты', 'salads', '🥗', ['Салат Цезарь', 'Оливье', 'Греческий салат']),
 ('Закуски',
  'snacks',
  '🍢',
  ['Куриные крылышки', 'Хумус', 'Фалафель', 'Спринг-роллы']),
 ('Горячие блюда', 'hot', '🔥', ['Плов', 'Лазанья', 'Ризотто', 'Боул']),
 ('Стритфуд', 'streetfood', '🛵', ['Шаурма', 'Донер', 'Сэндвич'])]

NEW_DISHES = [('Ребрышки', '🍖', 'american'), ('Синнабон', '🍩', 'american')]


def to_types(apps, schema_editor):
    DishType = apps.get_model('posts', 'DishType')
    Taxon = apps.get_model('posts', 'Taxon')

    # Подчищаем след первой редакции этой же миграции: код fish-seafood
    # заводился зря, «Рыба и морепродукты» уже существует под кодом fish.
    Taxon.objects.filter(kind='type', slug='fish-seafood').delete()

    cuisines = {c.slug: c for c in Taxon.objects.filter(kind='cuisine')}
    for name, emoji, cuisine_slug in NEW_DISHES:
        dish, created = DishType.objects.get_or_create(
            name=name, defaults={'emoji': emoji},
        )
        if created and cuisine_slug in cuisines:
            dish.default_taxons.add(cuisines[cuisine_slug])

    # Порядок видов: сначала категории блюда в порядке из таблицы, следом всё
    # остальное — подача и диета. Шаг 10 оставляет место для вставки.
    for position, (name, slug, emoji, dishes) in enumerate(CATEGORIES, start=1):
        taxon, _ = Taxon.objects.get_or_create(
            kind='type', slug=slug, defaults={'name': name, 'emoji': emoji},
        )
        taxon.name = name
        taxon.sort_order = position * 10
        if not taxon.emoji:
            taxon.emoji = emoji
        taxon.save(update_fields=['name', 'sort_order', 'emoji'])

        for dish_name in dishes:
            dish = DishType.objects.filter(name=dish_name).first()
            if dish is not None:
                dish.default_taxons.add(taxon)


def back_to_nothing(apps, schema_editor):
    """Откат снимает только те виды, что завели здесь."""
    Taxon = apps.get_model('posts', 'Taxon')
    Taxon.objects.filter(
        kind='type', slug__in=['pasta-noodles', 'dumplings', 'fish-seafood'],
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('posts', '0021_regroup_dishes'),
    ]

    operations = [
        migrations.RunPython(to_types, back_to_nothing),
    ]
