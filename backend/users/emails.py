"""
Письма с кодами: подтверждение почты и сброс пароля.

Вёрстка нарочно архаичная — таблицы и стили прямо в атрибутах. Почтовые
клиенты вырезают <style> из письма (mail.ru и Gmail в веб-версии — в первую
очередь) и не понимают ни flexbox, ни grid. Всё, что не написано инлайном,
до читателя не доедет.

Текстовая версия обязательна: часть клиентов показывает именно её, а в списке
писем из неё же берётся превью.
"""

import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)

# Зелёный берём глубокий, а не кнопочный #2ECC71: на белом фоне яркий
# оттенок читается тяжело, а в письме важен именно текст.
# Зелёный сайта. Заголовок и цифры разными оттенками намеренно: цифры
# крупные (38px) и держат фирменный #2ECC71 легко, а строка заголовка тем же
# цветом начинает звенеть — на белом у него контраст около 2:1. Поэтому
# заголовку достаётся #1FA85C, тот же, что у акцентов в интерфейсе.
GREEN = '#1FA85C'
GREEN_CODE = '#2ECC71'
# Фрейм под кодом серый, а не зелёный: зелёное на зелёном сливается, а так
# цифры выступают вперёд — они здесь единственное, что человек ищет глазами.
GREY_FRAME = '#EFF2F0'
GREY_EDGE = '#DDE3DF'
INK = '#15291C'
BODY = '#3A4A40'
MUTED = '#8A958E'
PAGE = '#F4F6F5'
LINE = '#E4EAE6'

FONT = ("-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',"
        "Arial,sans-serif")

CONTENT = {
    'signup': {
        'subject': 'Ваш код подтверждения',
        'heading': 'Подтверждение Email',
        'lead': 'Вот ваш код подтверждения:',
        'action': 'Пожалуйста, введите этот код, чтобы завершить верификацию email.',
        'footnote': (
            'Вы получили это письмо, потому что кто-то указал этот адрес при '
            'регистрации в Foody. Если это были не вы — просто удалите письмо.'
        ),
    },
    'reset': {
        'subject': 'Ваш код для смены пароля',
        'heading': 'Смена пароля',
        'lead': 'Вот ваш код для смены пароля:',
        'action': 'Пожалуйста, введите этот код, чтобы задать новый пароль.',
        'footnote': (
            'Вы получили это письмо, потому что кто-то запросил смену пароля '
            'для вашего аккаунта в Foody. Если это были не вы — просто удалите '
            'письмо, пароль останется прежним.'
        ),
    },
}


def _greeting(user):
    name = (user.full_name or '').strip()
    return f'Здравствуйте, {name}!' if name else 'Здравствуйте!'


def _text_body(user, parts, code, minutes):
    """Версия для клиентов без HTML — и превью в списке писем."""
    return (
        f'{parts["heading"]}\n\n'
        f'{_greeting(user)}\n\n'
        f'{parts["lead"]}\n\n'
        f'{code}\n\n'
        f'{parts["action"]}\n'
        f'Код действителен {minutes} минут и подойдёт только один раз.\n\n'
        f'{parts["footnote"]}\n'
    )


def _html_body(user, parts, code, minutes):
    return f"""\
<table width="100%" cellpadding="0" cellspacing="0" border="0" \
style="background:{PAGE};margin:0;padding:0">
<tr><td align="center" style="padding:28px 12px">

<table width="560" cellpadding="0" cellspacing="0" border="0" \
style="width:560px;max-width:100%;background:#FFFFFF;border-radius:18px;\
border:1px solid {LINE}">
<tr><td style="padding:36px 40px;font-family:{FONT}">

<div style="text-align:center;font-size:13px;font-weight:700;\
letter-spacing:3px;text-transform:uppercase;color:{MUTED};padding-bottom:18px">
Foody
</div>

<div style="text-align:center;font-size:30px;line-height:1.25;font-weight:800;\
letter-spacing:-0.5px;color:{GREEN};padding-bottom:26px">
{parts['heading']}
</div>

<div style="font-size:16px;line-height:1.55;color:{INK};font-weight:600;\
padding-bottom:12px">
{_greeting(user)}
</div>

<div style="font-size:16px;line-height:1.55;color:{BODY};padding-bottom:22px">
{parts['lead']}
</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="background:{GREY_FRAME};border:1px solid {GREY_EDGE};\
border-radius:14px;padding:22px 16px">
<span style="font-family:{FONT};font-size:38px;line-height:1.1;font-weight:800;\
letter-spacing:10px;color:{GREEN_CODE}">{code}</span>
</td></tr>
</table>

<div style="font-size:16px;line-height:1.55;color:{BODY};padding-top:24px">
{parts['action']}
</div>

<div style="font-size:15px;line-height:1.55;color:{BODY};padding-top:10px">
Код действителен <b style="color:{INK}">{minutes} минут</b> и подойдёт только \
один раз.
</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0" \
style="margin-top:28px;border-top:1px solid {LINE}">
<tr><td style="padding-top:18px;font-family:{FONT};font-size:12.5px;\
line-height:1.5;color:{MUTED}">
{parts['footnote']}
</td></tr>
</table>

</td></tr>
</table>

</td></tr>
</table>"""


def build_code_email(user, purpose, code, minutes):
    """Собирает письмо с кодом. Отдельно от отправки — так его видно в тестах."""
    parts = CONTENT[purpose]

    message = EmailMultiAlternatives(
        subject=parts['subject'],
        body=_text_body(user, parts, code, minutes),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.email],
    )
    message.attach_alternative(_html_body(user, parts, code, minutes), 'text/html')
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
