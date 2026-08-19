"""
Выдача кодов из писем.

Отдельным слоем, потому что порядок действий здесь важнее, чем кажется:
код сначала записывается в базу и только потом уходит в письмо. Если сделать
наоборот, письмо может дойти раньше, чем код станет действительным, и человек
получит «неверный код» на код из только что полученного письма.
"""

import logging
import secrets

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


# ── Пропуск на смену пароля ──
#
# Между «код верный» и «вот новый пароль» нужен посредник: код к этому моменту
# уже потрачен, а спрашивать его второй раз — значит показывать человеку ошибку
# ввода кода после того, как он придумал пароль.
#
# Пропуск живёт в кэше, а не в подписанном токене: так он одноразовый. Кэш —
# Redis, тот же, что под очередью, отдельного хранилища заводить не пришлось.

RESET_TICKET_PREFIX = 'pwreset:'
RESET_TICKET_TTL = 600  # 10 минут: столько нужно, чтобы придумать пароль


def issue_reset_ticket(user):
    """Выдаёт разовый пропуск на смену пароля."""
    from django.core.cache import cache

    token = secrets.token_urlsafe(32)
    cache.set(f'{RESET_TICKET_PREFIX}{token}', user.id, timeout=RESET_TICKET_TTL)
    return token


def consume_reset_ticket(token):
    """
    Обменивает пропуск на пользователя и сразу гасит его.

    Возвращает None, если пропуск неизвестен, просрочен или уже потрачен.
    """
    from django.contrib.auth import get_user_model
    from django.core.cache import cache

    if not token:
        return None

    key = f'{RESET_TICKET_PREFIX}{token}'
    user_id = cache.get(key)
    if user_id is None:
        return None
    # Гасим до смены пароля: повторно тем же пропуском воспользоваться нельзя.
    cache.delete(key)
    return get_user_model().objects.filter(id=user_id).first()
