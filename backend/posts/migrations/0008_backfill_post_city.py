"""
Проставляет город постам, написанным до разделения ленты по городам.

Истории городов у нас нет, поэтому берём лучшее приближение в таком порядке:
город заведения, о котором пост (он и был городом автора — форма подставляла
его из профиля), затем город из заявки, и уже в последнюю очередь текущий
город автора.

Посты, для которых город взять неоткуда, остаются без него — они не попадут
ни в одну городскую ленту. Это честнее, чем приписать их наугад.
"""

from django.db import migrations


def normalize(value):
    # Повторяет posts.models.normalize_name: импортировать модуль из миграции
    # нельзя — она обязана работать и после того, как код изменится.
    import re

    if not value:
        return ''
    text = value.strip().lower().replace('ё', 'е')
    text = re.sub(r'[^\w\s]', ' ', text, flags=re.UNICODE)
    return re.sub(r'\s+', ' ', text).strip()


def backfill(apps, schema_editor):
    Post = apps.get_model('posts', 'Post')

    posts = Post.all_objects.select_related(
        'menu_item__restaurant', 'user',
    ) if hasattr(Post, 'all_objects') else Post.objects.select_related(
        'menu_item__restaurant', 'user',
    )

    for post in posts.all():
        city = ''
        if post.menu_item_id and post.menu_item.restaurant_id:
            city = post.menu_item.restaurant.city
        if not city:
            city = post.draft_restaurant_city
        if not city and post.user_id:
            city = post.user.city

        city = (city or '').strip()
        if not city:
            continue

        post.city = city
        post.normalized_city = normalize(city)
        post.save(update_fields=['city', 'normalized_city'])


class Migration(migrations.Migration):

    dependencies = [
        ('posts', '0007_post_city_post_normalized_city_and_more'),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
