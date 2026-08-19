"""
Регистрация с подтверждением почты и сброс пароля по коду из письма.

Проверяем не только «счастливый путь», но и то, ради чего вся эта механика
затевалась: чужой адрес нельзя занять, код нельзя перебрать, а по форме
восстановления нельзя выяснить, кто зарегистрирован в сервисе.
"""

import re
from datetime import timedelta

import pytest
from django.core import mail
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from users.models import EmailCode, User


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def registered(db, api_client):
    """Свежая регистрация: пользователь есть, почта не подтверждена."""
    api_client.post(reverse('user-register'), {
        'username': 'newbie',
        'email': 'newbie@test.com',
        'password': 'Sup3rSecret!pass',
        'password_confirm': 'Sup3rSecret!pass',
        'city': 'Ростов-на-Дону',
    }, format='json')
    return User.objects.get(email='newbie@test.com')


def code_from_mail():
    """Достаёт шестизначный код из последнего письма."""
    return re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)


@pytest.mark.django_db
class TestSignupCode:
    def test_registration_sends_code(self, registered):
        assert registered.email_verified is False
        assert len(mail.outbox) == 1
        assert mail.outbox[0].to == ['newbie@test.com']
        assert re.search(r'\b\d{6}\b', mail.outbox[0].body)

    def test_code_is_not_stored_in_plain_text(self, registered):
        record = EmailCode.last_for(registered, EmailCode.PURPOSE_SIGNUP)
        assert code_from_mail() not in record.code_hash

    def test_login_blocked_until_verified(self, api_client, registered):
        resp = api_client.post(reverse('token_obtain_pair'), {
            'email': 'newbie@test.com', 'password': 'Sup3rSecret!pass',
        })
        # 403, а не 401: пароль верный, не хватает только подтверждения.
        assert resp.status_code == 403
        # Фронт по этому признаку ведёт на ввод кода, а не показывает
        # «неверный пароль».
        assert resp.data['code'] == 'email_not_verified'

    def test_verify_confirms_and_logs_in(self, api_client, registered):
        resp = api_client.post(reverse('email-verify'), {
            'email': 'newbie@test.com', 'code': code_from_mail(),
        })
        assert resp.status_code == 200
        assert 'access' in resp.data and 'refresh' in resp.data
        registered.refresh_from_db()
        assert registered.email_verified is True

    def test_login_works_after_verification(self, api_client, registered):
        api_client.post(reverse('email-verify'), {
            'email': 'newbie@test.com', 'code': code_from_mail(),
        })
        resp = api_client.post(reverse('token_obtain_pair'), {
            'email': 'newbie@test.com', 'password': 'Sup3rSecret!pass',
        })
        assert resp.status_code == 200

    def test_wrong_code_rejected(self, api_client, registered):
        real = code_from_mail()
        wrong = '000000' if real != '000000' else '111111'
        resp = api_client.post(reverse('email-verify'), {
            'email': 'newbie@test.com', 'code': wrong,
        })
        assert resp.status_code == 400
        registered.refresh_from_db()
        assert registered.email_verified is False

    def test_code_works_only_once(self, api_client, registered):
        code = code_from_mail()
        api_client.post(reverse('email-verify'), {'email': 'newbie@test.com', 'code': code})
        # Второй раз тот же код не должен подтверждать ничего — иначе
        # перехваченное письмо остаётся ключом навсегда.
        resp = api_client.post(reverse('email-verify'), {
            'email': 'newbie@test.com', 'code': code,
        })
        assert resp.status_code == 400

    def test_expired_code_rejected(self, api_client, registered):
        record = EmailCode.last_for(registered, EmailCode.PURPOSE_SIGNUP)
        record.expires_at = timezone.now() - timedelta(seconds=1)
        record.save(update_fields=['expires_at'])

        resp = api_client.post(reverse('email-verify'), {
            'email': 'newbie@test.com', 'code': code_from_mail(),
        })
        assert resp.status_code == 400

    def test_attempts_are_limited(self, api_client, settings, registered):
        code = code_from_mail()
        wrong = '000000' if code != '000000' else '111111'
        for _ in range(settings.EMAIL_CODE_MAX_ATTEMPTS):
            api_client.post(reverse('email-verify'), {
                'email': 'newbie@test.com', 'code': wrong,
            })
        # Попытки исчерпаны — теперь не подойдёт даже верный код.
        resp = api_client.post(reverse('email-verify'), {
            'email': 'newbie@test.com', 'code': code,
        })
        assert resp.status_code == 400
        registered.refresh_from_db()
        assert registered.email_verified is False

    def test_verified_email_looks_like_a_wrong_code(self, api_client, registered):
        """
        Подтверждённый адрес не должен отличаться по ответу от неверного кода.
        Иначе перебором адресов находятся живые аккаунты — а именно от этого
        мы и закрывались во всех остальных ручках.
        """
        api_client.post(reverse('email-verify'), {
            'email': 'newbie@test.com', 'code': code_from_mail(),
        })
        resp = api_client.post(reverse('email-verify'), {
            'email': 'newbie@test.com', 'code': '123456',
        })
        unknown = api_client.post(reverse('email-verify'), {
            'email': 'nobody@test.com', 'code': '123456',
        })
        assert resp.status_code == unknown.status_code == 400
        assert resp.data == unknown.data

    def test_unknown_email_looks_the_same(self, api_client, db):
        """По ответу нельзя понять, есть такой адрес или нет."""
        resp = api_client.post(reverse('email-verify'), {
            'email': 'nobody@test.com', 'code': '123456',
        })
        assert resp.status_code == 400
        assert resp.data['detail'] == 'Неверный или устаревший код.'


@pytest.mark.django_db
class TestResend:
    def test_resend_is_throttled_by_cooldown(self, api_client, registered):
        resp = api_client.post(reverse('email-resend'), {'email': 'newbie@test.com'})
        assert resp.status_code == 429
        assert resp.data['retry_after'] > 0
        # Второе письмо не ушло: пауза защищает чужой ящик от заваливания.
        assert len(mail.outbox) == 1

    def test_resend_after_cooldown_issues_new_code(self, api_client, registered):
        record = EmailCode.last_for(registered, EmailCode.PURPOSE_SIGNUP)
        EmailCode.objects.filter(id=record.id).update(
            created_at=timezone.now() - timedelta(hours=1),
        )

        resp = api_client.post(reverse('email-resend'), {'email': 'newbie@test.com'})
        assert resp.status_code == 200
        assert len(mail.outbox) == 2

        second = code_from_mail()
        resp = api_client.post(reverse('email-verify'), {
            'email': 'newbie@test.com', 'code': second,
        })
        assert resp.status_code == 200

    def test_old_code_dies_after_resend(self, api_client, registered):
        first = code_from_mail()
        EmailCode.objects.filter(user=registered).update(
            created_at=timezone.now() - timedelta(hours=1),
        )
        api_client.post(reverse('email-resend'), {'email': 'newbie@test.com'})

        resp = api_client.post(reverse('email-verify'), {
            'email': 'newbie@test.com', 'code': first,
        })
        assert resp.status_code == 400

    def test_unknown_email_gets_same_answer(self, api_client, db):
        resp = api_client.post(reverse('email-resend'), {'email': 'nobody@test.com'})
        assert resp.status_code == 200
        assert len(mail.outbox) == 0


@pytest.fixture
def member(db):
    return User.objects.create_user(
        username='member', email='member@test.com', password='OldPassw0rd!',
        email_verified=True,
    )


@pytest.mark.django_db
class TestPasswordReset:
    def test_reset_sends_code(self, api_client, member):
        resp = api_client.post(reverse('password-reset'), {'email': 'member@test.com'})
        assert resp.status_code == 200
        assert len(mail.outbox) == 1
        assert 'пароля' in mail.outbox[0].subject.lower()

    def test_unknown_email_answers_the_same_and_sends_nothing(self, api_client, db):
        """
        Ответ не должен выдавать, зарегистрирован ли адрес: иначе форма
        восстановления становится способом собирать базу пользователей.
        """
        known = api_client.post(reverse('password-reset'), {'email': 'nobody@test.com'})
        assert known.status_code == 200
        assert known.data['detail'] == 'Если такой адрес есть, мы отправили на него код.'
        assert len(mail.outbox) == 0

    def test_password_changes_by_code(self, api_client, member):
        api_client.post(reverse('password-reset'), {'email': 'member@test.com'})
        resp = api_client.post(reverse('password-reset-confirm'), {
            'email': 'member@test.com',
            'code': code_from_mail(),
            'password': 'BrandNewPass9!',
            'password_confirm': 'BrandNewPass9!',
        })
        assert resp.status_code == 200
        assert 'access' in resp.data

        member.refresh_from_db()
        assert member.check_password('BrandNewPass9!')
        login = api_client.post(reverse('token_obtain_pair'), {
            'email': 'member@test.com', 'password': 'BrandNewPass9!',
        })
        assert login.status_code == 200

    def test_old_password_stops_working(self, api_client, member):
        api_client.post(reverse('password-reset'), {'email': 'member@test.com'})
        api_client.post(reverse('password-reset-confirm'), {
            'email': 'member@test.com',
            'code': code_from_mail(),
            'password': 'BrandNewPass9!',
            'password_confirm': 'BrandNewPass9!',
        })
        resp = api_client.post(reverse('token_obtain_pair'), {
            'email': 'member@test.com', 'password': 'OldPassw0rd!',
        })
        assert resp.status_code == 401

    def test_wrong_code_keeps_password(self, api_client, member):
        api_client.post(reverse('password-reset'), {'email': 'member@test.com'})
        code = code_from_mail()
        wrong = '000000' if code != '000000' else '111111'

        resp = api_client.post(reverse('password-reset-confirm'), {
            'email': 'member@test.com',
            'code': wrong,
            'password': 'BrandNewPass9!',
            'password_confirm': 'BrandNewPass9!',
        })
        assert resp.status_code == 400
        member.refresh_from_db()
        assert member.check_password('OldPassw0rd!')

    def test_signup_code_does_not_reset_password(self, api_client, registered):
        """
        Код подтверждения почты не должен работать как код сброса пароля:
        назначения разделены, иначе одно письмо открывает оба сценария.
        """
        signup_code = code_from_mail()
        resp = api_client.post(reverse('password-reset-confirm'), {
            'email': 'newbie@test.com',
            'code': signup_code,
            'password': 'BrandNewPass9!',
            'password_confirm': 'BrandNewPass9!',
        })
        assert resp.status_code == 400
        registered.refresh_from_db()
        assert registered.check_password('Sup3rSecret!pass')

    def test_passwords_must_match(self, api_client, member):
        api_client.post(reverse('password-reset'), {'email': 'member@test.com'})
        resp = api_client.post(reverse('password-reset-confirm'), {
            'email': 'member@test.com',
            'code': code_from_mail(),
            'password': 'BrandNewPass9!',
            'password_confirm': 'Different9!',
        })
        assert resp.status_code == 400
        assert 'password_confirm' in resp.data

    def test_weak_password_rejected(self, api_client, member):
        api_client.post(reverse('password-reset'), {'email': 'member@test.com'})
        resp = api_client.post(reverse('password-reset-confirm'), {
            'email': 'member@test.com',
            'code': code_from_mail(),
            'password': '12345',
            'password_confirm': '12345',
        })
        assert resp.status_code == 400


@pytest.mark.django_db
class TestCleanup:
    """
    Чистка кодов и брошенных регистраций.

    Проверяем в первую очередь не то, что задача удаляет, а то, что она **не**
    удаляет: ошибка здесь стоит живого аккаунта.
    """

    def _make(self, email, *, verified, days_ago, **extra):
        user = User.objects.create_user(
            username=email.split('@')[0], email=email, password='Passw0rd!x',
            email_verified=verified, **extra,
        )
        User.objects.filter(id=user.id).update(
            date_joined=timezone.now() - timedelta(days=days_ago),
        )
        return user

    def test_abandoned_registration_frees_the_address(self, db):
        from users.tasks import cleanup_email_codes

        squatter = self._make('taken@test.com', verified=False, days_ago=30)
        cleanup_email_codes()

        assert not User.objects.filter(id=squatter.id).exists()
        # Ради этого всё и затевалось: адрес снова свободен.
        assert User.objects.create_user(
            username='real', email='taken@test.com', password='Passw0rd!x',
        )

    def test_recent_registration_survives(self, db):
        """Человек мог указать почту и вернуться к письму на следующий день."""
        from users.tasks import cleanup_email_codes

        fresh = self._make('fresh@test.com', verified=False, days_ago=1)
        cleanup_email_codes()
        assert User.objects.filter(id=fresh.id).exists()

    def test_verified_accounts_are_never_touched(self, db):
        from users.tasks import cleanup_email_codes

        old = self._make('veteran@test.com', verified=True, days_ago=500)
        cleanup_email_codes()
        assert User.objects.filter(id=old.id).exists()

    def test_staff_is_never_deleted(self, db):
        """
        Суперпользователя заводят командой, и почту ему никто не подтверждал.
        Удалить его означало бы потерять доступ к админке.
        """
        from users.tasks import cleanup_email_codes

        admin = self._make('root@test.com', verified=False, days_ago=500,
                           is_staff=True, is_superuser=True)
        cleanup_email_codes()
        assert User.objects.filter(id=admin.id).exists()

    def test_spent_codes_are_removed_but_live_ones_stay(self, db, settings):
        from users.tasks import cleanup_email_codes

        user = self._make('codes@test.com', verified=True, days_ago=0)
        spent, _ = EmailCode.issue(user, EmailCode.PURPOSE_RESET)
        EmailCode.objects.filter(id=spent.id).update(
            used_at=timezone.now() - settings.EMAIL_CODE_RETENTION - timedelta(hours=1),
        )
        live, _ = EmailCode.issue(user, EmailCode.PURPOSE_SIGNUP)

        cleanup_email_codes()

        assert not EmailCode.objects.filter(id=spent.id).exists()
        assert EmailCode.objects.filter(id=live.id).exists()
