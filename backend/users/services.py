"""
Выдача кодов из писем.

Отдельным слоем, потому что порядок действий здесь важнее, чем кажется:
код сначала записывается в базу и только потом уходит в письмо. Если сделать
наоборот, письмо может дойти раньше, чем код станет действительным, и человек
получит «неверный код» на код из только что полученного письма.
"""

import logging

from django.conf import settings
from django.utils import timezone

from .emails import send_code_email
from .models import EmailCode
from .tasks import send_email_code

logger = logging.getLogger(__name__)


def seconds_until_resend(user, purpose):
    """
    Сколько секунд ждать до следующего письма.

    Пауза защищает не нас, а владельца ящика: без неё формой восстановления
    пароля можно засыпать письмами любого человека, чей адрес известен.
    """
    last = EmailCode.last_for(user, purpose)
    if last is None:
        return 0
    ready_at = last.created_at + settings.EMAIL_CODE_RESEND_COOLDOWN
    left = (ready_at - timezone.now()).total_seconds()
    return max(0, int(left + 0.999))


def issue_and_send(user, purpose):
    """
    Выдаёт код и ставит письмо в очередь.

    Возвращает 0, если письмо отправлено, иначе — сколько секунд осталось до
    следующей попытки.
    """
    left = seconds_until_resend(user, purpose)
    if left:
        return left

    _, code = EmailCode.issue(user, purpose)
    try:
        send_email_code.delay(user.id, purpose, code)
    except Exception:
        # Очередь недоступна — шлём прямо здесь. Регистрация без письма
        # бесполезна: войти без кода нельзя, а человек не поймёт, почему
        # письмо не идёт, и просто уйдёт. Лучше задержать ответ на секунду.
        logger.exception('Очередь недоступна, отправляю письмо (%s) напрямую', purpose)
        send_code_email(user, purpose, code)
    return 0
