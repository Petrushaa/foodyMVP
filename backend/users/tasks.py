from celery import shared_task


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
