import logging

from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.db.models import F
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from .models import EmailCode, User, Follow
from .serializers import (
    CodeCheckSerializer, EmailRequestSerializer, PasswordResetConfirmSerializer,
    UserRegistrationSerializer, UserSerializer,
)
from .services import issue_and_send

logger = logging.getLogger(__name__)


class EmailCodeThrottle(AnonRateThrottle):
    """
    Отдельный лимит на всё, что шлёт письма и принимает коды.

    Общий anon-лимит в 60 запросов в минуту здесь бесполезен: он разрешает
    перебирать код быстрее, чем тот протухает, и рассылать письма чаще, чем
    человек успевает их читать.
    """

    scope = 'email_code'


class UserRegistrationView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserRegistrationSerializer
    permission_classes = (AllowAny,)
    throttle_classes = [EmailCodeThrottle]

    def perform_create(self, serializer):
        user = serializer.save()
        # Аккаунт создан, но войти по нему нельзя, пока не подтверждена почта.
        issue_and_send(user, EmailCode.PURPOSE_SIGNUP)


def _tokens_for(user):
    refresh = RefreshToken.for_user(user)
    return {'refresh': str(refresh), 'access': str(refresh.access_token)}


def _find_user(email):
    return User.objects.filter(email__iexact=email).first()


class EmailCodeResendView(APIView):
    """
    Отправить код подтверждения ещё раз.

    Ответ одинаковый, есть такой адрес или нет: иначе форма превращается в
    способ узнать, кто зарегистрирован в сервисе.
    """

    permission_classes = (AllowAny,)
    throttle_classes = [EmailCodeThrottle]

    def post(self, request):
        serializer = EmailRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        user = _find_user(email)
        if user is not None and not user.email_verified:
            wait = issue_and_send(user, EmailCode.PURPOSE_SIGNUP)
            if wait:
                return Response(
                    {'detail': f'Письмо уже отправлено. Повторить можно через {wait} с.',
                     'retry_after': wait},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )
        return Response({'detail': 'Если такой адрес есть, мы отправили на него код.'})


class EmailVerifyView(APIView):
    """
    Подтверждение почты кодом. В ответ сразу выдаём токены: человек только что
    доказал, что ящик его, и заставлять его после этого вводить пароль незачем.
    """

    permission_classes = (AllowAny,)
    throttle_classes = [EmailCodeThrottle]

    def post(self, request):
        serializer = CodeCheckSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']
        code = serializer.validated_data['code']

        user = _find_user(email)
        if user is None:
            # Тот же текст, что и при неверном коде: перебором адресов здесь
            # тоже не должно быть видно, кто зарегистрирован.
            return Response({'detail': 'Неверный или устаревший код.'},
                            status=status.HTTP_400_BAD_REQUEST)

        if user.email_verified:
            return Response({'detail': 'Почта уже подтверждена.', 'code': 'already_verified'},
                            status=status.HTTP_400_BAD_REQUEST)

        record = EmailCode.last_for(user, EmailCode.PURPOSE_SIGNUP)
        if record is None or not record.verify(code):
            return Response({'detail': 'Неверный или устаревший код.'},
                            status=status.HTTP_400_BAD_REQUEST)

        user.email_verified = True
        user.save(update_fields=['email_verified'])
        logger.info('Почта подтверждена: пользователь %s', user.id)
        return Response(_tokens_for(user))


class PasswordResetRequestView(APIView):
    """Запрос кода для смены пароля."""

    permission_classes = (AllowAny,)
    throttle_classes = [EmailCodeThrottle]

    def post(self, request):
        serializer = EmailRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = _find_user(serializer.validated_data['email'])
        if user is not None:
            wait = issue_and_send(user, EmailCode.PURPOSE_RESET)
            if wait:
                return Response(
                    {'detail': f'Письмо уже отправлено. Повторить можно через {wait} с.',
                     'retry_after': wait},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )
        return Response({'detail': 'Если такой адрес есть, мы отправили на него код.'})


class PasswordResetConfirmView(APIView):
    """Смена пароля по коду из письма."""

    permission_classes = (AllowAny,)
    throttle_classes = [EmailCodeThrottle]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = _find_user(data['email'])
        if user is None:
            return Response({'detail': 'Неверный или устаревший код.'},
                            status=status.HTTP_400_BAD_REQUEST)

        record = EmailCode.last_for(user, EmailCode.PURPOSE_RESET)
        if record is None or not record.verify(data['code']):
            return Response({'detail': 'Неверный или устаревший код.'},
                            status=status.HTTP_400_BAD_REQUEST)

        user.set_password(data['password'])
        # Смена пароля через письмо — это ещё и доказательство владения ящиком.
        # Если аккаунт заводили на чужой адрес и не подтвердили, теперь он ваш.
        user.email_verified = True
        user.save(update_fields=['password', 'email_verified'])
        logger.info('Пароль сменён по коду из письма: пользователь %s', user.id)
        return Response(_tokens_for(user))


class MeView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        serializer = UserSerializer(request.user, context={'request': request})
        return Response(serializer.data)

    def patch(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        logger.error('Profile update failed for user %s: %s', request.user.id, serializer.errors)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request):
        """
        DELETE /api/v1/users/me/ — самоудаление аккаунта.

        Все связанные посты/комменты/лайки/подписки удалятся каскадно благодаря
        on_delete=CASCADE / SET_NULL в моделях. JWT остаётся валидным до своего
        expiry — фронт обязан очистить cookie сессии сразу после 204.
        """
        user = request.user
        user_id = user.id
        user.delete()
        logger.info('User %s deleted their account', user_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserDetailView(generics.RetrieveAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = (IsAuthenticatedOrReadOnly,)
    lookup_field = 'id'
    lookup_url_kwarg = 'user_id'


class FollowingListView(generics.ListAPIView):
    """
    На кого подписан пользователь: GET /api/v1/users/<id>/following/.

    Отдаём тем же сериализатором, что и профиль, — фронту нужен `is_following`,
    чтобы прямо в списке показать кнопку «Отписаться» (или «Подписаться», если
    смотришь чужие подписки).
    """

    serializer_class = UserSerializer
    permission_classes = (IsAuthenticatedOrReadOnly,)

    def get_queryset(self):
        user = get_object_or_404(User, id=self.kwargs['user_id'])
        return User.objects.filter(followers_set__follower=user).order_by('-followers_set__created_at')


class FollowersListView(generics.ListAPIView):
    """Кто подписан на пользователя: GET /api/v1/users/<id>/followers/."""

    serializer_class = UserSerializer
    permission_classes = (IsAuthenticatedOrReadOnly,)

    def get_queryset(self):
        user = get_object_or_404(User, id=self.kwargs['user_id'])
        return User.objects.filter(following_set__following=user).order_by('-following_set__created_at')


class SubscribeView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, user_id):
        target = get_object_or_404(User, id=user_id)
        if target == request.user:
            logger.warning('User %s tried to follow themselves', request.user.id)
            return Response({'error': 'Нельзя подписаться на себя'}, status=status.HTTP_400_BAD_REQUEST)
        _, created = Follow.objects.get_or_create(follower=request.user, following=target)
        if created:
            # Counters updated via post_save signal in users/signals.py
            logger.info('User %s followed user %s', request.user.id, target.id)
        # `created` отдаём фронту чтобы он мог отличить "только что подписался"
        # от "уже был подписан" (идемпотентность POST).
        return Response({'status': 'followed', 'created': created})

    def delete(self, request, user_id):
        target = get_object_or_404(User, id=user_id)
        deleted_count, _ = Follow.objects.filter(follower=request.user, following=target).delete()
        if deleted_count:
            # Counters updated via post_delete signal in users/signals.py
            logger.info('User %s unfollowed user %s', request.user.id, target.id)
        return Response(status=status.HTTP_204_NO_CONTENT)
