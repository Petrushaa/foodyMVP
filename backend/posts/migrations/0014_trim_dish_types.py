"""
Оставляет в справочнике блюд только те, для которых нарисованы иконки.

Изначально справочник засеян 125 позициями (миграция 0003) — это был запас
«на все случаи». В продукт идёт короткий курируемый список: у каждого блюда
своя картинка, и показывать рядом с ними сотню безымянных строк незачем.

Удалять чистим только неиспользуемое. `MenuItem.dish_type` и
`Post.draft_dish_type` стоят на `PROTECT`, поэтому блюдо, на котором висит
чей-то пост или позиция каталога, останется — оно и должно остаться, иначе
удаление утащило бы за собой живой контент.

Обратной миграции нет намеренно: восстановить набор можно, откатив до 0003,
а «вернуть 112 строк» задним числом смысла не имеет.
"""

from django.db import migrations
from django.db.models import ProtectedError

KEEP = [
    'Борщ',
    'Булочка с корицей',
    'Бургер',
    'Куриные крылышки',
    'Наггетсы',
    'Пицца',
    'Плов',
    'Роллы',
    'Салат Цезарь',
    'Суши',
    'Хот-дог',
    'Шаурма',
    'Шашлык',
]


def trim(apps, schema_editor):
    DishType = apps.get_model('posts', 'DishType')

    kept = protected = removed = 0
    for dish_type in DishType.objects.exclude(name__in=KEEP):
        try:
            dish_type.delete()
            removed += 1
        except ProtectedError:
            # На блюде висит позиция каталога или чей-то пост — не трогаем.
            protected += 1

    kept = DishType.objects.count()
    print(f'\n  Справочник блюд: осталось {kept} (удалено {removed}, '
          f'занято контентом {protected})')


class Migration(migrations.Migration):

    dependencies = [
        ('posts', '0013_alter_dishtype_options_alter_taxon_options_and_more'),
    ]

    operations = [
        migrations.RunPython(trim, migrations.RunPython.noop),
    ]
