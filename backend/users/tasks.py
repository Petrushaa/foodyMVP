from celery import shared_task
from django.db.models import F


@shared_task
def send_email_code(user_id, purpose, code):
    """
    Письмо уходит фоном: SMTP-релей отвечает сотни миллисекунд, а иногда
    секунды, и держать на этом HTTP-запрос регистрации незачем.

    Код передаётся задаче открытым — в базе он лежит только хешем, а из хеша
    письмо не соберёшь. Живёт он минуты, и очередь у нас своя, в Redis.
    """
    from users.emails import send_code_email
    from users.models import User

    user = User.objects.filter(id=user_id).first()
    if user is None:
        return False
    return send_code_email(user, purpose, code)


@shared_task
def update_followers_count(user_id, increment=True):
    from users.models import User
    if increment:
        User.objects.filter(id=user_id).update(followers_count=F('followers_count') + 1)
    else:
        User.objects.filter(id=user_id, followers_count__gt=0).update(followers_count=F('followers_count') - 1)


@shared_task
def update_following_count(user_id, increment=True):
    from users.models import User
    if increment:
        User.objects.filter(id=user_id).update(following_count=F('following_count') + 1)
    else:
        User.objects.filter(id=user_id, following_count__gt=0).update(following_count=F('following_count') - 1)
