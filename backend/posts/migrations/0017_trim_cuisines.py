"""
Убирает кухни, которые ничего не представляют.

Справочник засеян 23 кухнями «на вырост». В продукте кухня без иконки и без
единого блюда — пустая строка во вкладке: по ней ничего не найдётся, а место
она занимает.

Удаляем только те, что не привязаны ни к одной позиции каталога и ни к одному
типу блюда. Связь с позицией — «многие ко многим», защиты на уровне базы нет,
поэтому проверяем сами: иначе удаление молча сняло бы кухню с чужих постов.

Грузинская и узбекская остаются, хотя иконок у них пока нет: на первой висит
пост, вторая — единственная кухня «Плова».
"""

from django.db import migrations

REMOVE = [
    'european',
    'french',
    'german',
    'mediterranean',
    'thai',
    'turkish',
]


def trim(apps, schema_editor):
    Taxon = apps.get_model('posts', 'Taxon')

    removed = kept = 0
    for taxon in Taxon.objects.filter(kind='cuisine', slug__in=REMOVE):
        if taxon.menu_items.exists() or taxon.dish_types.exists():
            kept += 1
            continue
        taxon.delete()
        removed += 1

    total = Taxon.objects.filter(kind='cuisine').count()
    print(f'\n  Кухни: удалено {removed}, оставлено занятых {kept}, всего {total}')


class Migration(migrations.Migration):

    dependencies = [
        ('posts', '0016_move_taxons_to_type'),
    ]

    operations = [
        migrations.RunPython(trim, migrations.RunPython.noop),
    ]
