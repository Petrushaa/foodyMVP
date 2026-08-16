"""
Переносит категории формата, формы и особенностей в общую ось «Вид».

Три отдельные вкладки заставляли угадывать, где лежит нужное: «фастфуд» —
это формат, «бургеры» — форма, «веганское» — особенности, а человек ищет
просто вид еды. Теперь ось одна и значений у позиции может быть несколько:
веганский фастфуд это нормально.

Слаги не конфликтуют — проверено до слияния, поэтому уникальность
(kind, slug) переживает перенос.
"""

from django.db import migrations

OLD_KINDS = ['format', 'form', 'diet']


def merge(apps, schema_editor):
    Taxon = apps.get_model('posts', 'Taxon')
    moved = Taxon.objects.filter(kind__in=OLD_KINDS).update(kind='type')
    print(f'\n  Категорий перенесено в «Вид»: {moved}')


def split(apps, schema_editor):
    """Разделить обратно нечем: какая категория из какой оси — уже не записано."""
    raise NotImplementedError('Обратного переноса нет: прежние оси не сохранены.')


class Migration(migrations.Migration):

    dependencies = [
        ('posts', '0015_merge_taxon_axes'),
    ]

    operations = [
        migrations.RunPython(merge, split),
    ]
