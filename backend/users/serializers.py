import bleach
from django.db import IntegrityError
from rest_framework import serializers, status
from rest_framework.exceptions import APIException
from rest_framework.validators import UniqueValidator
from django.contrib.auth.password_validation import validate_password
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User, Follow


class EmailNotVerified(APIException):
    """
    Пароль верный, но почта ещё не подтверждена.

    Отдельный класс, а не ValidationError: тот заворачивает каждое значение в
    список, и фронту вместо признака 'email_not_verified' приходил бы массив из
    одного элемента. А 403 вместо 401 отделяет «вас знаем, но пока не пускаем»
    от «неверный пароль» — экраны у этих случаев разные.
    """

    status_code = status.HTTP_403_FORBIDDEN
    default_code = 'email_not_verified'


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    """JWT-сериализатор с логином по email вместо username."""
    username_field = User.EMAIL_FIELD

    def validate(self, attrs):
        # simplejwt ожидает username_field, передаём email
        attrs[self.username_field] = attrs.get(self.username_field, '').lower()
        data = super().validate(attrs)

        # Неподтверждённая почта — не ошибка пароля, и фронт должен отличать
        # одно от другого: здесь человеку нужен экран ввода кода, а не «неверный
        # пароль». Поэтому отдельный code, а не общий текст отказа.
        if not self.user.email_verified:
            raise EmailNotVerified({
                'detail': 'Подтвердите почту — мы отправили код на ваш адрес.',
                'code': 'email_not_verified',
            })
        return data

class UserSerializer(serializers.ModelSerializer):
    posts_count = serializers.SerializerMethodField()
    is_following = serializers.SerializerMethodField()
    avatar = serializers.SerializerMethodField()
    # Явные ограничения: bio до 280 символов (UI лимит ставит 250, даём небольшой
    # запас). full_name / city — обязательно непустые при PATCH (allow_blank=False).
    bio_text = serializers.CharField(
        max_length=280, required=False, allow_blank=True, trim_whitespace=True,
    )
    full_name = serializers.CharField(
        max_length=120, required=False, allow_blank=False, trim_whitespace=True,
    )
    city = serializers.CharField(
        max_length=100, required=False, allow_blank=False, trim_whitespace=True,
    )

    class Meta:
        model = User
        fields = (
            'id', 'username', 'email', 'full_name', 'bio_text', 'avatar',
            'birth_date', 'city', 'date_joined', 'is_staff',
            'posts_count', 'followers_count', 'following_count', 'is_following',
        )
        read_only_fields = ('id', 'email', 'date_joined', 'is_staff', 'followers_count', 'following_count')

    def validate_bio_text(self, value):
        """Очищаем bio от HTML-тегов (defence-in-depth, помимо React escape)."""
        if not value:
            return ''
        return bleach.clean(value, tags=[], attributes={}, strip=True)

    def get_avatar(self, obj):
        """Возвращает относительный URL /media/... без хоста."""
        if not obj.avatar:
            return None
        return obj.avatar.url

    def get_posts_count(self, obj):
        return obj.posts.filter(status='approved').count()

    def get_is_following(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated and request.user != obj:
            return Follow.objects.filter(follower=request.user, following=obj).exists()
        return False

    def to_representation(self, instance):
        """
        PII leak fix: для anon или не-self запросов скрываем чувствительные поля
        (email, birth_date, is_staff, date_joined). is_staff staff-юзеры могут
        видеть на чужих профилях (нужно для модерации).
        """
        data = super().to_representation(instance)
        request = self.context.get('request')
        viewer = getattr(request, 'user', None) if request else None
        is_self = bool(viewer and viewer.is_authenticated and viewer.pk == instance.pk)
        is_staff_viewer = bool(viewer and viewer.is_authenticated and viewer.is_staff)
        if not is_self:
            data.pop('email', None)
            data.pop('birth_date', None)
            data.pop('date_joined', None)
            if not is_staff_viewer:
                data.pop('is_staff', None)
        return data


class FeedPostAuthorSerializer(serializers.ModelSerializer):
    """
    Легковесный сериализатор для отображения автора в ленте постов.
    Содержит только минимум данных для экономии трафика + поле is_following
    чтобы фронт мог сразу нарисовать правильное состояние follow-кнопки в
    карточке (R4-B4 follow-в-карточке).
    """
    avatar = serializers.SerializerMethodField()
    is_following = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'username', 'full_name', 'avatar', 'is_following')

    def get_avatar(self, obj):
        """Возвращает относительный URL /media/... без хоста."""
        if not obj.avatar:
            return None
        return obj.avatar.url

    def get_is_following(self, obj):
        """
        True если текущий запрашивающий юзер подписан на этого автора.
        Anon / self → False. Использует prefetched_following_ids set, если
        viewset его проставил (для N=50 постов в ленте — один запрос вместо
        50 проверок); fallback на .exists() при отсутствии.
        """
        request = self.context.get('request') if hasattr(self, 'context') else None
        viewer = getattr(request, 'user', None) if request else None
        if not viewer or not viewer.is_authenticated or viewer.pk == obj.pk:
            return False
        prefetched = self.context.get('following_ids') if hasattr(self, 'context') else None
        if prefetched is not None:
            return obj.pk in prefetched
        return Follow.objects.filter(follower=viewer, following=obj).exists()

class UserRegistrationSerializer(serializers.ModelSerializer):
    # Явные поля с русскими сообщениями уникальности вместо английских дефолтов
    username = serializers.CharField(
        max_length=150,
        validators=[UniqueValidator(
            queryset=User.objects.all(),
            message='Пользователь с таким логином уже существует.',
        )],
    )
    email = serializers.EmailField(
        validators=[UniqueValidator(
            queryset=User.objects.all(),
            message='Пользователь с таким email уже существует.',
        )],
    )
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True, required=True)
    city = serializers.CharField(required=True, allow_blank=False, max_length=100)

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'password', 'password_confirm', 'full_name', 'city')

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({"password_confirm": "Пароли не совпадают."})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        # R13-S2/B1: до этого fix параллельные регистрации с одним email
        # давали 500 IntegrityError. Сериализаторный unique-check проверяется
        # ДО transaction.commit и не защищает от race. Ловим IntegrityError
        # и превращаем в осмысленный 400.
        try:
            user = User.objects.create_user(
                username=validated_data['username'],
                email=validated_data['email'],
                password=validated_data['password'],
                full_name=validated_data.get('full_name', ''),
                city=validated_data.get('city', ''),
            )
        except IntegrityError as exc:
            msg = str(exc).lower()
            if 'email' in msg:
                raise serializers.ValidationError(
                    {'email': 'Пользователь с таким email уже существует.'}
                )
            if 'username' in msg:
                raise serializers.ValidationError(
                    {'username': 'Этот никнейм уже занят.'}
                )
            raise serializers.ValidationError(
                {'non_field_errors': 'Не удалось создать пользователя.'}
            )
        return user


class EmailRequestSerializer(serializers.Serializer):
    """Один адрес — для повторной отправки кода и для запроса сброса пароля."""

    email = serializers.EmailField()

    def validate_email(self, value):
        return value.strip().lower()


class CodeCheckSerializer(EmailRequestSerializer):
    """Адрес и код из письма."""

    code = serializers.CharField(min_length=6, max_length=6, trim_whitespace=True)


class PasswordResetConfirmSerializer(serializers.Serializer):
    """
    Новый пароль по пропуску.

    Кода здесь уже нет: его проверили шагом раньше и потратили. Спрашивать его
    второй раз означало бы показывать ошибку ввода кода человеку, который к
    этому моменту успел придумать пароль.
    """

    ticket = serializers.CharField(write_only=True, trim_whitespace=True)
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'Пароли не совпадают.'})
        return attrs
