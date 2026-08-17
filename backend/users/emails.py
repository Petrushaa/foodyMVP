"""
Письма с кодами: подтверждение почты и сброс пароля.

Текст собирается здесь, а не в шаблонах: письма всего два, они короткие, и
держать ради них отдельные файлы шаблонов означало бы искать текст в трёх
местах вместо одного.
"""

import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)

SUBJECTS = {
    'signup': 'Код подтверждения — Foody',
    'reset': 'Сброс пароля — Foody',
}

INTROS = {
    'signup': 'Вы регистрируетесь в Foody. Введите этот код, чтобы подтвердить почту:',
    'reset': 'Вы запросили смену пароля в Foody. Введите этот код, чтобы задать новый:',
}

# Приписка на случай, если письмо пришло тому, кто ничего не запрашивал:
# по коду в чужих руках человек должен понимать, что делать.
OUTROS = {
    'signup': 'Если вы не регистрировались в Foody, просто удалите это письмо.',
    'reset': 'Если вы не запрашивали смену пароля, просто удалите это письмо — '
             'пароль останется прежним.',
}


def build_code_email(user, purpose, code, minutes):
    """Собирает письмо с кодом. Отдельно от отправки — так его видно в тестах."""
    greeting = f'{user.full_name or user.username}, здравствуйте!'
    intro = INTROS[purpose]
    outro = OUTROS[purpose]

    text = (
        f'{greeting}\n\n'
        f'{intro}\n\n'
        f'{code}\n\n'
        f'Код действителен {minutes} минут и подойдёт только один раз.\n\n'
        f'{outro}\n'
    )

    html = (
        f'<p>{greeting}</p>'
        f'<p>{intro}</p>'
        f'<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:24px 0">{code}</p>'
        f'<p>Код действителен {minutes} минут и подойдёт только один раз.</p>'
        f'<p style="color:#666">{outro}</p>'
    )

    message = EmailMultiAlternatives(
        subject=SUBJECTS[purpose],
        body=text,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.email],
    )
    message.attach_alternative(html, 'text/html')
    return message


def send_code_email(user, purpose, code):
    """
    Отправляет письмо с кодом.

    Ошибку глушим осознанно: релей может быть недоступен, но падать в ответ на
    регистрацию из-за этого нельзя — пользователь уже создан, и повтор запроса
    только наплодит записей. Человек нажмёт «отправить ещё раз», а мы увидим
    причину в логах.
    """
    minutes = max(1, int(settings.EMAIL_CODE_TTL.total_seconds() // 60))
    try:
        build_code_email(user, purpose, code, minutes).send(fail_silently=False)
    except Exception:
        logger.exception('Не удалось отправить письмо (%s) на %s', purpose, user.email)
        return False
    return True
