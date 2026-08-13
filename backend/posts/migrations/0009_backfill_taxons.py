"""
Проставляет категории позициям и заявкам, созданным без них.

Категории брались только из того, что прислал клиент, а он их не присылал —
и каталог остался без кухни, формата, формы и особенностей. Из-за этого
фильтры поиска не находили ничего: «японская кухня» не находила «Роллы».

Берём их из типа блюда: справочник для того и заполнен («Роллы» — японская
кухня, суши, ресторан). Уже проставленное вручную не трогаем.
"""

from django.db import migrations


def backfill(apps, schema_editor):
    MenuItem = apps.get_model('posts', 'MenuItem')
    Post = apps.get_model('posts', 'Post')

    for item in MenuItem.objects.filter(dish_type__isnull=False):
        if item.taxons.exists():
            continue
        item.taxons.set(item.dish_type.default_taxons.all())

    # Заявки на модерации — иначе одобрение создаст позицию снова без категорий.
    for post in Post.objects.filter(draft_dish_type__isnull=False):
        if post.draft_taxons.exists():
            continue
        post.draft_taxons.set(post.draft_dish_type.default_taxons.all())


class Migration(migrations.Migration):

    dependencies = [
        ('posts', '0008_backfill_post_city'),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
