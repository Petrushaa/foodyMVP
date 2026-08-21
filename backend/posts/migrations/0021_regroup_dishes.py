"""
Перегруппировка блюд: группа описывает еду, а не страну и не формат.

«Азиатское» повторяло ось кухонь — она и так отдельной вкладкой — и вдобавок
растащило три другие группы: гёдза с дим-самами это тесто с начинкой, рамен
это лапша, поке с боулом это салаты. Японские пельмени лежали отдельно от
грузинских только потому, что японские.

«Фастфуд» описывал не еду, а ценовой сегмент, и повторял вид с тем же именем.
Крылышки, наггетсы и фри уехали к закускам — они и есть закуски; осталась
форма: то, что едят руками из булки или лаваша.

После этого ни одна группа не повторяет ни кухню, ни вид.
"""

from django.db import migrations

LAYOUT = [('pizza-pasta', 'Пицца и паста', '🍕', ['Пицца', 'Паста', 'Лазанья', 'Ризотто']),
 ('rolls', 'Роллы и боулы', '🍣', ['Роллы', 'Суши', 'Поке', 'Боул']),
 ('street',
  'Бургеры и стритфуд',
  '🍔',
  ['Бургер', 'Шаурма', 'Хот-дог', 'Донер', 'Сэндвич']),
 ('salads',
  'Салаты и закуски',
  '🥗',
  ['Салат Цезарь',
   'Куриные крылышки',
   'Наггетсы',
   'Картофель фри',
   'Оливье',
   'Греческий салат',
   'Хумус',
   'Фалафель']),
 ('grill',
  'Мясо и гриль',
  '🥩',
  ['Стейк', 'Плов', 'Шашлык', 'Люля-кебаб', 'Утка по-пекински']),
 ('dough',
  'Тесто с начинкой',
  '🥟',
  ['Хачапури',
   'Пельмени',
   'Хинкали',
   'Самса',
   'Манты',
   'Чебурек',
   'Вареники',
   'Гёдза',
   'Дим-самы',
   'Спринг-роллы']),
 ('soups', 'Супы', '🍲', ['Борщ', 'Том ям', 'Солянка', 'Крем-суп', 'Окрошка']),
 ('breakfast',
  'Завтраки',
  '🥞',
  ['Блины', 'Сырники', 'Круассан', 'Драники', 'Панкейки', 'Вафли']),
 ('noodles', 'Лапша', '🍜', ['Лапша вок', 'Рамен', 'Лагман']),
 ('desserts',
  'Десерты и выпечка',
  '🍰',
  ['Булочка с корицей',
   'Чизкейк',
   'Тирамису',
   'Медовик',
   'Мороженое',
   'Эклер',
   'Наполеон']),
 ('drinks', 'Напитки', '☕', ['Кофе', 'Лимонад', 'Смузи'])]

RENAMES = {'fastfood': 'street', 'hot': 'grill'}

DROPPED = ['asian']


def regroup(apps, schema_editor):
    DishGroup = apps.get_model('posts', 'DishGroup')
    DishType = apps.get_model('posts', 'DishType')

    # Сначала переименования — иначе get_or_create завёл бы дубль под новым
    # кодом, а старая группа осталась бы висеть пустой.
    for old_slug, new_slug in RENAMES.items():
        DishGroup.objects.filter(slug=old_slug).update(slug=new_slug)

    for position, (slug, name, emoji, dishes) in enumerate(LAYOUT, start=1):
        group, _ = DishGroup.objects.get_or_create(
            slug=slug, defaults={'name': name, 'emoji': emoji},
        )
        group.name = name
        group.sort_order = position * 10
        if not group.emoji:
            group.emoji = emoji
        group.save(update_fields=['name', 'sort_order', 'emoji'])

        # Шаг 10 между блюдами: новое встанет между соседями без перенумерации.
        for order, dish_name in enumerate(dishes, start=1):
            DishType.objects.filter(name=dish_name).update(
                group=group, sort_order=order * 10,
            )

    # Распущенные группы удаляем последними, когда блюда уже разложены.
    DishGroup.objects.filter(slug__in=DROPPED).delete()


def unregroup(apps, schema_editor):
    """Откат вернёт коды групп; раскладку блюд восстановит миграция 0019."""
    DishGroup = apps.get_model('posts', 'DishGroup')
    for old_slug, new_slug in RENAMES.items():
        DishGroup.objects.filter(slug=new_slug).update(slug=old_slug)
    DishGroup.objects.filter(slug__in=['rolls', 'noodles']).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('posts', '0020_seed_full_catalog'),
    ]

    operations = [
        migrations.RunPython(regroup, unregroup),
    ]
