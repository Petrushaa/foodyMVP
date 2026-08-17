import secrets

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone

class User(AbstractUser):
    username = models.CharField(max_length=150, unique=True)
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255, blank=True)
    bio_text = models.TextField(blank=True)
    # Картинки будут храниться на сервере (Яндекс Облако ВМ), 
    # DRF автоматически подставит абсолютный URL до картинки (http://ваш-домен/media/...)
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    birth_date = models.DateField(null=True, blank=True)
    city = models.CharField(max_length=100, blank=True)
    followers_count = models.PositiveIntegerField(default=0)
    following_count = models.PositiveIntegerField(default=0)
    # Почта подтверждена кодом из письма. Без этого вход не пускает: иначе
    # чужой адрес можно занять при регистрации, а потом его настоящий владелец
    # не сможет зарегистрироваться — email уникален.
    email_verified = models.BooleanField(
        default=False, verbose_name='Почта подтверждена',
    )

    # Optional: If you want email to be the default login field instead of username,
    # uncomment these lines:
    # USERNAME_FIELD = 'email'
    # REQUIRED_FIELDS = ['username']

    class Meta:
        indexes = [
            models.Index(fields=['-date_joined']),
        ]


class EmailCode(models.Model):
    """
    Одноразовый код из письма — для подтверждения почты и сброса пароля.

    Хранится хешем, как пароль. Код короткий (шесть цифр, миллион вариантов),
    поэтому при утечке базы открытый код означал бы мгновенный доступ к чужому
    аккаунту через сброс пароля; медленный хеш делает перебор бессмысленным.

    Живёт минуты, тратится один раз и считает попытки: без счётчика шесть цифр
    подбираются за считанные минуты автоматикой, и почта перестаёт что-либо
    подтверждать.
    """

    PURPOSE_SIGNUP = 'signup'
    PURPOSE_RESET = 'reset'
    PURPOSE_CHOICES = [
        (PURPOSE_SIGNUP, 'Подтверждение почты'),
        (PURPOSE_RESET, 'Сброс пароля'),
    ]

    user = models.ForeignKey(
        'users.User', on_delete=models.CASCADE, related_name='email_codes',
        verbose_name='Пользователь',
    )
    purpose = models.CharField(
        max_length=16, choices=PURPOSE_CHOICES, verbose_name='Назначение',
    )
    code_hash = models.CharField(max_length=128, verbose_name='Хеш кода')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Создан')
    expires_at = models.DateTimeField(verbose_name='Действителен до')
    attempts = models.PositiveSmallIntegerField(default=0, verbose_name='Попыток ввода')
    used_at = models.DateTimeField(null=True, blank=True, verbose_name='Использован')

    class Meta:
        verbose_name = 'Код из письма'
        verbose_name_plural = 'Коды из писем'
        indexes = [
            models.Index(fields=['user', 'purpose', '-created_at']),
        ]

    def __str__(self):
        return f'{self.get_purpose_display()} для {self.user}'

    @property
    def is_spent(self):
        """Код уже нельзя ввести: потрачен, просрочен или исчерпал попытки."""
        return (
            self.used_at is not None
            or self.expires_at <= timezone.now()
            or self.attempts >= settings.EMAIL_CODE_MAX_ATTEMPTS
        )

    @classmethod
    def issue(cls, user, purpose):
        """
        Выдаёт новый код, гася все прежние того же назначения.

        Гасим намеренно: иначе после «отправить ещё раз» оставались бы
        действительными сразу несколько кодов, и каждый добавлял бы попыток
        для перебора.
        """
        cls.objects.filter(
            user=user, purpose=purpose, used_at__isnull=True,
        ).update(used_at=timezone.now())

        # secrets, а не random: обычный генератор предсказуем по предыдущим
        # значениям, а этот код — ключ от аккаунта.
        code = f'{secrets.randbelow(1_000_000):06d}'
        record = cls.objects.create(
            user=user,
            purpose=purpose,
            code_hash=make_password(code),
            expires_at=timezone.now() + settings.EMAIL_CODE_TTL,
        )
        return record, code

    @classmethod
    def last_for(cls, user, purpose):
        return cls.objects.filter(user=user, purpose=purpose).order_by('-created_at').first()

    def verify(self, raw_code):
        """
        Сверяет введённый код и тратит попытку.

        Возвращает True только один раз: верный код сразу помечается
        использованным, поэтому повторить тот же запрос уже не выйдет.
        """
        if self.is_spent:
            return False

        self.attempts += 1
        if not check_password((raw_code or '').strip(), self.code_hash):
            self.save(update_fields=['attempts'])
            return False

        self.used_at = timezone.now()
        self.save(update_fields=['attempts', 'used_at'])
        return True


class Follow(models.Model):
    follower = models.ForeignKey(User, on_delete=models.CASCADE, related_name='following_set')
    following = models.ForeignKey(User, on_delete=models.CASCADE, related_name='followers_set')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('follower', 'following')
