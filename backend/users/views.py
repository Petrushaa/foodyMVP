import logging

from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.db.models import F
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from .models import EmailCode, User, Follow
from .serializers import (
    CodeCheckSerializer, EmailRequestSerializer, PasswordResetConfirmSerializer,
    UserRegistrationSerializer, UserSerializer,
)
from .services import consume_reset_ticket, issue_and_send, issue_reset_ticket

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


def _revoke_all_tokens(user):
    """
    Гасит все выданные refresh-токены пользователя через чёрный список.

    Вызывается на смене пароля: если аккаунт увели, смена пароля должна
    выкидывать чужие сессии, а не оставлять действующий refresh на руках у
    злоумышленника. Работает по токенам, выпущенным после установки
    token_blacklist; уже выданные access-токены доживают свои минуты.
    """
    from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
    from rest_framework_simplejwt.tokens import RefreshToken as _RT

    for outstanding in OutstandingToken.objects.filter(user=user):
        try:
            _RT(outstanding.token).blacklist()
        except TokenError:
            # Уже просрочен или погашен — гасить нечего.
            continue


def _find_user(email):
    return User.objects.filter(email__iexact=email).first()


# Один и тот же текст на «адрес не найден», «код неверный» и «код протух».
# Это не лень, а требование: по разнице ответов адреса перебирают.
BAD_CODE = {'detail': 'Неверный или устаревший код.'}
# И то же самое для отправки письма — сказать «такого адреса нет» значит
# превратить форму в способ узнать, кто зарегистрирован в сервисе.
CODE_SENT = {'detail': 'Если такой адрес есть, мы отправили на него код.'}


class CodeRequestView(APIView):
    """
    Общее основание для «выслать код»: подтверждение почты и сброс пароля
    отличаются только назначением кода и условием, кому его вообще слать.
    """

    permission_classes = (AllowAny,)
    throttle_classes = [EmailCodeThrottle]
    purpose = None

    def should_send(self, user):
        return True

    def post(self, request):
        serializer = EmailRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = _find_user(serializer.validated_data['email'])
        if user is not None and self.should_send(user):
            wait = issue_and_send(user, self.purpose)
            if wait:
                return Response(
                    {'detail': f'Письмо уже отправлено. Повторить можно через {wait} с.',
                     'retry_after': wait},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )
        return Response(CODE_SENT)


class EmailCodeResendView(CodeRequestView):
    """Отправить код подтверждения ещё раз."""

    purpose = EmailCode.PURPOSE_SIGNUP

    def should_send(self, user):
        # Подтверждённой почте код не нужен, и слать его повторно — только
        # тревожить владельца ящика.
        return not user.email_verified


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
        # Незнакомый адрес и подтверждённый разбираем вместе с неверным кодом:
        # ответ «почта уже подтверждена» отличался от «неверный код», и по
        # этой разнице можно было перебором находить живые аккаунты.
        if user is None or user.email_verified:
            return Response(BAD_CODE, status=status.HTTP_400_BAD_REQUEST)

        record = EmailCode.last_for(user, EmailCode.PURPOSE_SIGNUP)
        if record is None or not record.verify(code):
            return Response(BAD_CODE, status=status.HTTP_400_BAD_REQUEST)

        user.email_verified = True
        user.save(update_fields=['email_verified'])
        logger.info('Почта подтверждена: пользователь %s', user.id)
        return Response(_tokens_for(user))


class PasswordResetRequestView(CodeRequestView):
    """Запрос кода для смены пароля."""

    purpose = EmailCode.PURPOSE_RESET


class PasswordResetVerifyView(APIView):
    """
    Проверка кода из письма — первый шаг смены пароля.

    В ответ выдаёт разовый пропуск, которым авторизуется второй шаг. Так
    человек узнаёт о неверном коде сразу, а не после того, как придумал пароль.
    """

    permission_classes = (AllowAny,)
    throttle_classes = [EmailCodeThrottle]

    def post(self, request):
        serializer = CodeCheckSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = _find_user(data['email'])
        if user is None:
            return Response(BAD_CODE, status=status.HTTP_400_BAD_REQUEST)

        record = EmailCode.last_for(user, EmailCode.PURPOSE_RESET)
        if record is None or not record.verify(data['code']):
            return Response(BAD_CODE, status=status.HTTP_400_BAD_REQUEST)

        return Response({'ticket': issue_reset_ticket(user)})


class PasswordResetConfirmView(APIView):
    """Новый пароль по пропуску, выданному после проверки кода."""

    permission_classes = (AllowAny,)
    throttle_classes = [EmailCodeThrottle]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = consume_reset_ticket(data['ticket'])
        if user is None:
            # Пропуск просрочен, потрачен или подделан — начинать заново.
            return Response(
                {'detail': 'Время на смену пароля истекло. Запросите код заново.',
                 'code': 'ticket_expired'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(data['password'])
        # Смена пароля через письмо — это ещё и доказательство владения ящиком.
        # Если аккаунт заводили на чужой адрес и не подтвердили, теперь он ваш.
        user.email_verified = True
        user.save(update_fields=['password', 'email_verified'])
        # Выкидываем все прежние сессии: смена пароля должна отзывать доступ у
        # того, кто мог увести аккаунт. Новую пару токенов выдаём ниже.
        _revoke_all_tokens(user)
        logger.info('Пароль сменён по коду из письма: пользователь %s', user.id)
        return Response(_tokens_for(user))


class LogoutView(APIView):
    """
    Выход: гасит переданный refresh-токен через чёрный список.

    Без этого refresh жил бы до своего срока, и им можно было бы выписывать
    свежие access-токены даже после выхода. Уже выданный access-токен доживает
    свои минуты — поэтому ACCESS_TOKEN_LIFETIME и держим коротким.
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request):
        token = request.data.get('refresh')
        if not token:
            return Response(
                {'detail': 'Не передан refresh-токен.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            RefreshToken(token).blacklist()
        except TokenError:
            # Уже недействителен или погашен — для клиента это тот же выход.
            pass
        return Response(status=status.HTTP_205_RESET_CONTENT)


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
