"""
Наполняет справочники: категории по четырём осям и типы блюд с категориями по умолчанию.

Именно отсюда работает автоподстановка при создании новой позиции: пользователь выбирает
тип блюда («бургер»), а кухня, формат и форма подставляются готовыми и остаются
редактируемыми. В саму позицию они **копируются**, поэтому правка этого справочника
задним числом ничего не переписывает.

Миграция идемпотентна: повторный прогон ничего не задваивает и не затирает ручные правки.
"""

from django.db import migrations


# --- Ось «кухня» -----------------------------------------------------------
CUISINES = [
    ('russian', 'Русская'),
    ('italian', 'Итальянская'),
    ('japanese', 'Японская'),
    ('chinese', 'Китайская'),
    ('american', 'Американская'),
    ('georgian', 'Грузинская'),
    ('caucasian', 'Кавказская'),
    ('armenian', 'Армянская'),
    ('uzbek', 'Узбекская'),
    ('turkish', 'Турецкая'),
    ('middle-eastern', 'Ближневосточная'),
    ('mexican', 'Мексиканская'),
    ('french', 'Французская'),
    ('spanish', 'Испанская'),
    ('german', 'Немецкая'),
    ('greek', 'Греческая'),
    ('indian', 'Индийская'),
    ('thai', 'Тайская'),
    ('korean', 'Корейская'),
    ('vietnamese', 'Вьетнамская'),
    ('pan-asian', 'Паназиатская'),
    ('mediterranean', 'Средиземноморская'),
    ('european', 'Европейская'),
]

# --- Ось «формат еды» ------------------------------------------------------
FORMATS = [
    ('fastfood', 'Фастфуд'),
    ('streetfood', 'Стритфуд'),
    ('restaurant', 'Ресторанное'),
    ('homestyle', 'Домашнее'),
    ('coffeehouse', 'Кофейня'),
    ('bakery', 'Пекарня'),
    ('pastry', 'Кондитерская'),
    ('bar', 'Бар'),
]

# --- Ось «форма еды» -------------------------------------------------------
FORMS = [
    ('soups', 'Супы'),
    ('salads', 'Салаты'),
    ('meat', 'Мясо'),
    ('fish', 'Рыба и морепродукты'),
    ('hot', 'Горячее'),
    ('pasta', 'Паста'),
    ('pizza', 'Пицца'),
    ('burgers', 'Бургеры'),
    ('wraps', 'Сэндвичи и роллы'),
    ('sushi', 'Суши и роллы'),
    ('bakery-goods', 'Выпечка'),
    ('desserts', 'Десерты'),
    ('ice-cream', 'Мороженое'),
    ('breakfast', 'Завтраки'),
    ('snacks', 'Закуски'),
    ('sides', 'Гарниры'),
    ('coffee', 'Кофе'),
    ('drinks', 'Напитки'),
]

# --- Ось «дополнительно» ---------------------------------------------------
DIETS = [
    ('vegetarian', 'Вегетарианское'),
    ('vegan', 'Веганское'),
    ('lenten', 'Постное'),
    ('healthy', 'ПП'),
    ('gluten-free', 'Без глютена'),
    ('lactose-free', 'Без лактозы'),
    ('halal', 'Халяль'),
    ('spicy', 'Острое'),
    ('kids', 'Детское'),
]


# Тип блюда: (название, кухня, формат, форма, [дополнительно])
# Пустая строка означает «для этого блюда ось не заполняется».
DISH_TYPES = [
    # Бургеры и фастфуд
    ('Бургер', 'american', 'fastfood', 'burgers', []),
    ('Чизбургер', 'american', 'fastfood', 'burgers', []),
    ('Гамбургер', 'american', 'fastfood', 'burgers', []),
    ('Хот-дог', 'american', 'streetfood', 'wraps', []),
    ('Картофель фри', 'american', 'fastfood', 'sides', ['vegetarian']),
    ('Наггетсы', 'american', 'fastfood', 'snacks', []),
    ('Куриные крылышки', 'american', 'fastfood', 'snacks', []),
    ('Милкшейк', 'american', 'fastfood', 'drinks', []),

    # Пицца и паста
    ('Пицца', 'italian', 'restaurant', 'pizza', []),
    ('Кальцоне', 'italian', 'restaurant', 'pizza', []),
    ('Паста', 'italian', 'restaurant', 'pasta', []),
    ('Спагетти', 'italian', 'restaurant', 'pasta', []),
    ('Лазанья', 'italian', 'restaurant', 'pasta', []),
    ('Ризотто', 'italian', 'restaurant', 'hot', []),
    ('Брускетта', 'italian', 'restaurant', 'snacks', []),

    # Азия
    ('Суши', 'japanese', 'restaurant', 'sushi', []),
    ('Роллы', 'japanese', 'restaurant', 'sushi', []),
    ('Рамен', 'japanese', 'restaurant', 'soups', []),
    ('Удон', 'japanese', 'restaurant', 'hot', []),
    ('Темпура', 'japanese', 'restaurant', 'snacks', []),
    ('Вок', 'pan-asian', 'fastfood', 'hot', []),
    ('Поке', 'pan-asian', 'fastfood', 'salads', ['healthy']),
    ('Том ям', 'thai', 'restaurant', 'soups', ['spicy']),
    ('Пад тай', 'thai', 'restaurant', 'hot', []),
    ('Фо бо', 'vietnamese', 'restaurant', 'soups', []),
    ('Спринг-роллы', 'vietnamese', 'restaurant', 'snacks', []),
    ('Димсамы', 'chinese', 'restaurant', 'snacks', []),
    ('Утка по-пекински', 'chinese', 'restaurant', 'hot', []),
    ('Лапша вок', 'chinese', 'fastfood', 'hot', []),
    ('Бибимбап', 'korean', 'restaurant', 'hot', []),
    ('Кимчи', 'korean', 'restaurant', 'snacks', ['spicy', 'vegan']),
    ('Тток-поки', 'korean', 'streetfood', 'snacks', ['spicy']),

    # Кавказ, Средняя Азия, Ближний Восток
    ('Шаурма', 'middle-eastern', 'streetfood', 'wraps', []),
    ('Донер', 'turkish', 'streetfood', 'wraps', []),
    ('Лахмаджун', 'turkish', 'streetfood', 'bakery-goods', []),
    ('Хачапури', 'georgian', 'restaurant', 'bakery-goods', ['vegetarian']),
    ('Хинкали', 'georgian', 'restaurant', 'hot', []),
    ('Чахохбили', 'georgian', 'restaurant', 'hot', []),
    ('Шашлык', 'caucasian', 'restaurant', 'meat', []),
    ('Люля-кебаб', 'caucasian', 'restaurant', 'meat', []),
    ('Долма', 'armenian', 'restaurant', 'hot', []),
    ('Плов', 'uzbek', 'restaurant', 'hot', []),
    ('Самса', 'uzbek', 'streetfood', 'bakery-goods', []),
    ('Лагман', 'uzbek', 'restaurant', 'soups', []),
    ('Манты', 'uzbek', 'restaurant', 'hot', []),
    ('Хумус', 'middle-eastern', 'restaurant', 'snacks', ['vegetarian', 'vegan']),
    ('Фалафель', 'middle-eastern', 'streetfood', 'snacks', ['vegetarian', 'vegan']),

    # Русская кухня
    ('Борщ', 'russian', 'homestyle', 'soups', []),
    ('Щи', 'russian', 'homestyle', 'soups', []),
    ('Солянка', 'russian', 'homestyle', 'soups', []),
    ('Окрошка', 'russian', 'homestyle', 'soups', []),
    ('Уха', 'russian', 'homestyle', 'soups', []),
    ('Пельмени', 'russian', 'homestyle', 'hot', []),
    ('Вареники', 'russian', 'homestyle', 'hot', []),
    ('Блины', 'russian', 'homestyle', 'bakery-goods', []),
    ('Сырники', 'russian', 'homestyle', 'breakfast', []),
    ('Оливье', 'russian', 'homestyle', 'salads', []),
    ('Селёдка под шубой', 'russian', 'homestyle', 'salads', []),
    ('Пирожок', 'russian', 'bakery', 'bakery-goods', []),
    ('Каша', 'russian', 'homestyle', 'breakfast', []),
    ('Котлета', 'russian', 'homestyle', 'meat', []),

    # Европа и Америка
    ('Стейк', 'american', 'restaurant', 'meat', []),
    ('Рёбра', 'american', 'restaurant', 'meat', []),
    ('Салат Цезарь', 'american', 'restaurant', 'salads', []),
    ('Греческий салат', 'greek', 'restaurant', 'salads', ['vegetarian']),
    ('Гирос', 'greek', 'streetfood', 'wraps', []),
    ('Круассан', 'french', 'bakery', 'bakery-goods', []),
    ('Багет', 'french', 'bakery', 'bakery-goods', []),
    ('Киш', 'french', 'restaurant', 'bakery-goods', []),
    ('Луковый суп', 'french', 'restaurant', 'soups', []),
    ('Крем-суп', 'european', 'restaurant', 'soups', []),
    ('Паэлья', 'spanish', 'restaurant', 'hot', []),
    ('Тапас', 'spanish', 'bar', 'snacks', []),
    ('Шницель', 'german', 'restaurant', 'meat', []),
    ('Колбаски', 'german', 'bar', 'meat', []),
    ('Сэндвич', 'european', 'fastfood', 'wraps', []),
    ('Салат', 'european', 'restaurant', 'salads', []),
    ('Боул', 'european', 'fastfood', 'salads', ['healthy']),
    ('Суп', 'european', 'homestyle', 'soups', []),
    ('Рыба', 'european', 'restaurant', 'fish', []),
    ('Креветки', 'european', 'restaurant', 'fish', []),
    ('Устрицы', 'european', 'restaurant', 'fish', []),

    # Мексика
    ('Тако', 'mexican', 'streetfood', 'wraps', []),
    ('Буррито', 'mexican', 'fastfood', 'wraps', []),
    ('Кесадилья', 'mexican', 'fastfood', 'snacks', []),
    ('Начос', 'mexican', 'bar', 'snacks', []),

    # Индия
    ('Карри', 'indian', 'restaurant', 'hot', ['spicy']),
    ('Тикка масала', 'indian', 'restaurant', 'hot', []),
    ('Наан', 'indian', 'bakery', 'bakery-goods', ['vegetarian']),

    # Завтраки
    ('Омлет', 'european', 'homestyle', 'breakfast', []),
    ('Яичница', 'european', 'homestyle', 'breakfast', []),
    ('Бенедикт', 'european', 'restaurant', 'breakfast', []),
    ('Овсянка', 'european', 'homestyle', 'breakfast', ['healthy']),
    ('Гранола', 'european', 'coffeehouse', 'breakfast', ['healthy']),
    ('Авокадо-тост', 'european', 'coffeehouse', 'breakfast', ['healthy', 'vegetarian']),
    ('Панкейки', 'american', 'coffeehouse', 'breakfast', []),
    ('Вафли', 'european', 'coffeehouse', 'desserts', []),

    # Десерты и выпечка
    ('Тирамису', 'italian', 'restaurant', 'desserts', []),
    ('Панна-котта', 'italian', 'restaurant', 'desserts', []),
    ('Чизкейк', 'american', 'pastry', 'desserts', []),
    ('Брауни', 'american', 'pastry', 'desserts', []),
    ('Пончик', 'american', 'bakery', 'desserts', []),
    ('Маффин', 'american', 'coffeehouse', 'bakery-goods', []),
    ('Булочка с корицей', 'american', 'bakery', 'bakery-goods', []),
    ('Наполеон', 'russian', 'pastry', 'desserts', []),
    ('Медовик', 'russian', 'pastry', 'desserts', []),
    ('Эклер', 'french', 'pastry', 'desserts', []),
    ('Макарон', 'french', 'pastry', 'desserts', []),
    ('Штрудель', 'german', 'pastry', 'desserts', []),
    ('Мороженое', 'european', 'pastry', 'ice-cream', []),
    ('Торт', 'european', 'pastry', 'desserts', []),

    # Напитки. Кухня не указывается — она тут ничего не значит.
    ('Эспрессо', '', 'coffeehouse', 'coffee', []),
    ('Американо', '', 'coffeehouse', 'coffee', []),
    ('Капучино', '', 'coffeehouse', 'coffee', []),
    ('Латте', '', 'coffeehouse', 'coffee', []),
    ('Раф', '', 'coffeehouse', 'coffee', []),
    ('Флэт уайт', '', 'coffeehouse', 'coffee', []),
    ('Матча', 'japanese', 'coffeehouse', 'drinks', []),
    ('Какао', '', 'coffeehouse', 'drinks', []),
    ('Чай', '', 'coffeehouse', 'drinks', []),
    ('Смузи', '', 'coffeehouse', 'drinks', ['healthy']),
    ('Лимонад', '', 'bar', 'drinks', []),
    ('Коктейль', '', 'bar', 'drinks', []),
    ('Пиво', '', 'bar', 'drinks', []),
    ('Вино', '', 'bar', 'drinks', []),
]


def seed(apps, schema_editor):
    Taxon = apps.get_model('posts', 'Taxon')
    DishType = apps.get_model('posts', 'DishType')

    groups = (
        ('cuisine', CUISINES),
        ('format', FORMATS),
        ('form', FORMS),
        ('diet', DIETS),
    )

    taxons = {}
    for kind, rows in groups:
        for slug, name in rows:
            taxon, _ = Taxon.objects.get_or_create(
                kind=kind, slug=slug, defaults={'name': name}
            )
            taxons[(kind, slug)] = taxon

    for name, cuisine, food_format, form, diets in DISH_TYPES:
        dish_type, created = DishType.objects.get_or_create(name=name)
        # Не трогаем справочник, если его уже правили руками.
        if not created and dish_type.default_taxons.exists():
            continue

        defaults = []
        if cuisine:
            defaults.append(taxons[('cuisine', cuisine)])
        if food_format:
            defaults.append(taxons[('format', food_format)])
        if form:
            defaults.append(taxons[('form', form)])
        defaults.extend(taxons[('diet', slug)] for slug in diets)
        dish_type.default_taxons.set(defaults)


class Migration(migrations.Migration):

    dependencies = [
        ('posts', '0002_initial'),
    ]

    operations = [
        # Обратной операции нет намеренно: откат не должен сносить справочник,
        # на который уже могут ссылаться позиции.
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
