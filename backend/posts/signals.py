"""
Синхронное обновление денормализованных счётчиков.

Все счётчики двигаются атомарно через F() прямо в БД — так же быстро, как триггер,
и без гонок. Декременты защищены от ухода в минус.

Важно: посты и комментарии удаляются мягко, поэтому сигнал `post_delete` для них
не срабатывает — переход в удалённые ловим через `pre_save`/`post_save`.
"""

from django.db.models.signals import post_save, pre_save, pre_delete
from django.dispatch import receiver
from django.db.models import F

from .models import Post, PostLike, PostSave, PostStatistics, Comment, Tag, PostTag


@receiver(pre_save, sender=Post)
def remember_post_deleted_state(sender, instance, **kwargs):
    """Запоминает, был ли пост удалён до сохранения, чтобы поймать переход."""
    if instance.pk:
        previous = Post.all_objects.filter(pk=instance.pk).values_list('deleted_at', flat=True).first()
        instance._was_deleted = previous is not None
    else:
        instance._was_deleted = None


@receiver(post_save, sender=Post)
def create_post_statistics(sender, instance, created, **kwargs):
    """Гарантирует, что у каждого поста есть объект статистики."""
    if created:
        PostStatistics.objects.get_or_create(post=instance)


@receiver(post_save, sender=Post)
def sync_menu_item_on_post_delete(sender, instance, created, **kwargs):
    """
    Автор удалил или восстановил пост — показатели позиции меняются.

    Удаление мягкое, поэтому `post_delete` не срабатывает и ловить переход
    приходится здесь. Без этого удалённый пост продолжал бы влиять на рейтинг
    и на видимость позиции.
    """
    if created or not instance.menu_item_id:
        return
    if instance.status != Post.STATUS_APPROVED:
        return

    was_deleted = getattr(instance, '_was_deleted', None)
    is_deleted = instance.deleted_at is not None
    if was_deleted is None or was_deleted == is_deleted:
        return

    # Импорт внутри функции: сервисы тянут модели, а сигналы подключаются в apps.ready.
    from .services.stats import recalculate_menu_item_stats, sync_menu_item_tags

    recalculate_menu_item_stats(instance.menu_item)
    sync_menu_item_tags(instance.menu_item)


# --- Комментарии -----------------------------------------------------------

def _shift_comments_count(post_id, delta):
    if delta > 0:
        PostStatistics.objects.filter(post_id=post_id).update(
            comments_count=F('comments_count') + 1
        )
    else:
        PostStatistics.objects.filter(post_id=post_id, comments_count__gt=0).update(
            comments_count=F('comments_count') - 1
        )


@receiver(pre_save, sender=Comment)
def remember_comment_deleted_state(sender, instance, **kwargs):
    """Запоминает, был ли комментарий удалён до сохранения, чтобы поймать переход."""
    if instance.pk:
        previous = Comment.all_objects.filter(pk=instance.pk).values_list('deleted_at', flat=True).first()
        instance._was_deleted = previous is not None
    else:
        instance._was_deleted = None


@receiver(post_save, sender=Comment)
def sync_comments_count(sender, instance, created, **kwargs):
    was_deleted = getattr(instance, '_was_deleted', None)
    is_deleted = instance.deleted_at is not None

    if created:
        if not is_deleted:
            _shift_comments_count(instance.post_id, +1)
        return

    if was_deleted is False and is_deleted:
        _shift_comments_count(instance.post_id, -1)
    elif was_deleted is True and not is_deleted:
        _shift_comments_count(instance.post_id, +1)


# --- Лайки и сохранения ----------------------------------------------------
# Удаляются по-настоящему (снял лайк — записи нет), поэтому pre_delete работает как раньше.

@receiver(post_save, sender=PostLike)
def on_like_created(sender, instance, created, **kwargs):
    if created:
        PostStatistics.objects.filter(post_id=instance.post_id).update(
            likes_count=F('likes_count') + 1
        )


@receiver(pre_delete, sender=PostLike)
def on_like_deleted(sender, instance, **kwargs):
    PostStatistics.objects.filter(post_id=instance.post_id, likes_count__gt=0).update(
        likes_count=F('likes_count') - 1
    )


@receiver(post_save, sender=PostSave)
def on_save_created(sender, instance, created, **kwargs):
    if created:
        PostStatistics.objects.filter(post_id=instance.post_id).update(
            saves_count=F('saves_count') + 1
        )


@receiver(pre_delete, sender=PostSave)
def on_save_deleted(sender, instance, **kwargs):
    PostStatistics.objects.filter(post_id=instance.post_id, saves_count__gt=0).update(
        saves_count=F('saves_count') - 1
    )


# --- Теги ------------------------------------------------------------------

def atomic_update_tag_usage(tag_id, increment=True):
    if increment:
        Tag.objects.filter(id=tag_id).update(usage_count=F('usage_count') + 1)
    else:
        Tag.objects.filter(id=tag_id, usage_count__gt=0).update(usage_count=F('usage_count') - 1)


@receiver(post_save, sender=PostTag)
def on_tag_added(sender, instance, created, **kwargs):
    if created:
        atomic_update_tag_usage(instance.tag_id, increment=True)


@receiver(pre_delete, sender=PostTag)
def on_tag_removed(sender, instance, **kwargs):
    atomic_update_tag_usage(instance.tag_id, increment=False)
