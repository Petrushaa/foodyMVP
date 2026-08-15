"""
Пересчитывает счётчик комментариев у постов.

Счётчик денормализованный и живёт на сигналах, а массовое мягкое удаление
делалось одним `update()` — сигналы при этом не шлются. В итоге комментарии
из выдачи пропадали, а «5 комментариев» под постом оставалось.

Сам источник расхождения починен (SoftDeleteQuerySet.delete теперь идёт по
одной записи), здесь приводим в порядок уже накопленное.
"""

from django.db import migrations
from django.db.models import Count, Q


def resync(apps, schema_editor):
    PostStatistics = apps.get_model('posts', 'PostStatistics')

    rows = PostStatistics.objects.annotate(
        actual=Count('post__comments', filter=Q(post__comments__deleted_at__isnull=True)),
    )
    for row in rows:
        if row.comments_count != row.actual:
            row.comments_count = row.actual
            row.save(update_fields=['comments_count'])


class Migration(migrations.Migration):

    dependencies = [
        ('posts', '0010_comment_parent_and_more'),
    ]

    operations = [
        migrations.RunPython(resync, migrations.RunPython.noop),
    ]
