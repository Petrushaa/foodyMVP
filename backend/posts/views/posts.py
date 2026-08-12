"""
Ручки для работы с постами: создание, чтение, правка и удаление.

Три правила, которые здесь реализованы и которые легко нарушить по невнимательности:

- **Одобренный пост не редактируется** — его можно только удалить.
- **Удаление мягкое**: запись остаётся в базе, из выдачи пропадает.
- **Чужие неодобренные посты не видны никому**, кроме автора и модератора.
"""

from django.db.models import Prefetch, Q
from rest_framework import permissions, status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import CreateAPIView
from rest_framework.response import Response

from ..models import PlaceNotFoundReport, Post, PostLike, PostSave
from ..serializers import (
    PlaceNotFoundReportSerializer, PostCreateSerializer, PostListSerializer,
    PostUpdateSerializer,
)


class IsAuthorOrReadOnly(permissions.BasePermission):
    """Менять и удалять пост может только его автор."""

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.user_id == request.user.id


class PostViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsAuthorOrReadOnly]

    def get_serializer_class(self):
        if self.action == 'create':
            return PostCreateSerializer
        if self.action in ('update', 'partial_update'):
            return PostUpdateSerializer
        return PostListSerializer

    def get_queryset(self):
        """
        Видны одобренные посты. Автору дополнительно видны свои — на модерации
        и отклонённые. Мягко удалённые не видны никому: их отсекает менеджер
        по умолчанию, поэтому здесь про них ничего писать не нужно.
        """
        user = self.request.user
        queryset = Post.objects.select_related(
            'user', 'menu_item', 'menu_item__restaurant', 'menu_item__dish_type', 'statistics',
        ).prefetch_related('images', 'tags', 'menu_item__taxons')

        if user.is_authenticated:
            queryset = queryset.prefetch_related(
                Prefetch('likes', queryset=PostLike.objects.filter(user=user),
                         to_attr='prefetched_likes'),
                Prefetch('saves', queryset=PostSave.objects.filter(user=user),
                         to_attr='prefetched_saves'),
            )
            if not user.is_staff:
                queryset = queryset.filter(Q(status=Post.STATUS_APPROVED) | Q(user=user))
        else:
            queryset = queryset.filter(status=Post.STATUS_APPROVED)

        return self._apply_feed(queryset)

    def _apply_feed(self, queryset):
        """
        Ленты и сортировки:

        - `?feed=subscriptions` — только те, на кого подписан;
        - `?feed=saved` — сохранённые;
        - `?author=<id>` — посты одного человека;
        - `?menu_item=<id>` — посты про одно блюдо;
        - `?ordering=popular` — по лайкам, иначе по свежести.
        """
        params = self.request.query_params
        user = self.request.user

        feed = params.get('feed')
        if feed == 'subscriptions' and user.is_authenticated:
            queryset = queryset.filter(
                user__followers_set__follower=user, status=Post.STATUS_APPROVED,
            )
        elif feed == 'saved' and user.is_authenticated:
            queryset = queryset.filter(saves__user=user)

        author = params.get('author')
        if author == 'me' and user.is_authenticated:
            # Удобный псевдоним: фронту не нужно сперва спрашивать свой id.
            queryset = queryset.filter(user=user)
        elif author and author.isdigit():
            queryset = queryset.filter(user_id=author)

        menu_item = params.get('menu_item')
        if menu_item:
            queryset = queryset.filter(menu_item_id=menu_item)

        if params.get('ordering') == 'popular':
            # Свежесть как второй ключ: иначе старые посты с накопленными лайками
            # навсегда занимают верх ленты.
            return queryset.order_by('-statistics__likes_count', '-created_at')
        return queryset.order_by('-created_at')

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        post = serializer.save()
        # Отдаём созданный пост тем же форматом, что и лента, чтобы фронту
        # не пришлось ходить за ним отдельно.
        output = PostListSerializer(post, context=self.get_serializer_context())
        return Response(output.data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        if not serializer.instance.is_editable:
            raise PermissionDenied(
                'Одобренный пост изменить нельзя — его можно только удалить.'
            )
        serializer.save()

    def perform_destroy(self, instance):
        # Мягкое удаление: Post.delete() проставляет отметку, ничего не стирая.
        instance.delete()


class PlaceNotFoundReportView(CreateAPIView):
    """
    «Не нашёл своё место на карте».

    Копит конкретные названия, которые люди не смогли найти, — по этим данным
    решаем отложенный вопрос про заведения вне Яндекс.Карт (вопрос №4 плана).
    """

    serializer_class = PlaceNotFoundReportSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = PlaceNotFoundReport.objects.all()

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
