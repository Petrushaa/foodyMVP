import logging

from celery import shared_task

logger = logging.getLogger(__name__)


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
def cleanup_email_codes():
    """
    Убирает отработавшие коды и брошенные регистрации.

    Главное здесь — вторая половина. Неподтверждённая запись держит адрес:
    email уникален, и пока она существует, настоящий владелец ящика
    зарегистрироваться не может. То есть достаточно один раз указать чужую
    почту, чтобы закрыть человеку вход в сервис навсегда.

    Коды чистим заодно: после того как код потрачен или протух, пользы от
    строки нет, а растёт их число линейно от числа регистраций.
    """
    from django.conf import settings
    from django.db.models import Q
    from django.utils import timezone

    from users.models import EmailCode, User

    now = timezone.now()

    codes_cutoff = now - settings.EMAIL_CODE_RETENTION
    codes, _ = EmailCode.objects.filter(
        Q(used_at__lt=codes_cutoff) | Q(expires_at__lt=codes_cutoff),
    ).delete()

    # Сотрудников не трогаем ни при каких условиях: суперпользователя заводят
    # командой, и почту ему никто не подтверждал — а удалить его означало бы
    # потерять доступ к админке.
    accounts, _ = User.objects.filter(
        email_verified=False,
        is_staff=False,
        is_superuser=False,
        date_joined__lt=now - settings.UNVERIFIED_ACCOUNT_TTL,
    ).delete()

    if codes or accounts:
        logger.info('Чистка: кодов %s, брошенных регистраций %s', codes, accounts)
    return {'codes': codes, 'accounts': accounts}
