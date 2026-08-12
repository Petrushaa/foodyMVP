"""
Вовлечённость: лайки, сохранения, комментарии.

Лайки и сохранения удаляются **по-настоящему**: снял лайк — записи нет, это не контент.
Комментарии удаляются мягко, как и посты, — механика хранения в проекте одна на всё.
"""

from django.db.models import Count, Prefetch
from rest_framework import permissions, status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import Comment, CommentLike, Post, PostLike, PostSave
from ..serializers import CommentSerializer


def _approved_post(pk):
    """Лайкать и комментировать можно только опубликованные посты."""
    return get_object_or_404(Post.objects.filter(status=Post.STATUS_APPROVED), pk=pk)


class _ToggleView(APIView):
    """
    Общая механика лайка и сохранения: POST ставит, DELETE снимает.

    Повторный POST не создаёт дубль — на паре «пост + пользователь» стоит
    уникальность в базе, и `get_or_create` просто вернёт существующую запись.
    """

    permission_classes = [permissions.IsAuthenticated]
    model = None
    counter_field = ''

    def post(self, request, post_id):
        post = _approved_post(post_id)
        _, created = self.model.objects.get_or_create(post=post, user=request.user)
        return Response(
            self._state(post, True),
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def delete(self, request, post_id):
        post = _approved_post(post_id)
        self.model.objects.filter(post=post, user=request.user).delete()
        return Response(self._state(post, False))

    def _state(self, post, active):
        post.refresh_from_db()
        statistics = getattr(post, 'statistics', None)
        return {
            'active': active,
            'count': getattr(statistics, self.counter_field, 0) if statistics else 0,
        }


class PostLikeView(_ToggleView):
    model = PostLike
    counter_field = 'likes_count'


class PostSaveView(_ToggleView):
    model = PostSave
    counter_field = 'saves_count'


class CommentViewSet(viewsets.ModelViewSet):
    """
    Комментарии. Список фильтруется по посту: `?post=<id>`.

    Редактировать и удалять может только автор. Удаление мягкое: запись остаётся
    в базе, из выдачи пропадает, счётчик комментариев поста уменьшается сигналом.
    """

    serializer_class = CommentSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        queryset = (
            Comment.objects
            .select_related('user')
            .annotate(likes_total=Count('likes', distinct=True))
            .order_by('created_at')
        )

        post_id = self.request.query_params.get('post')
        if post_id:
            queryset = queryset.filter(post_id=post_id)

        user = self.request.user
        if user.is_authenticated:
            queryset = queryset.prefetch_related(
                Prefetch('likes', queryset=CommentLike.objects.filter(user=user),
                         to_attr='prefetched_likes'),
            )
        return queryset

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def _check_author(self, instance):
        if instance.user_id != self.request.user.id:
            raise PermissionDenied('Это чужой комментарий.')

    def perform_update(self, serializer):
        self._check_author(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._check_author(instance)
        instance.delete()  # мягкое


class CommentLikeView(APIView):
    """Лайк комментария. Зеркало лайка поста."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, comment_id):
        comment = get_object_or_404(Comment.objects.all(), pk=comment_id)
        _, created = CommentLike.objects.get_or_create(comment=comment, user=request.user)
        return Response(
            {'active': True, 'count': comment.likes.count()},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def delete(self, request, comment_id):
        comment = get_object_or_404(Comment.objects.all(), pk=comment_id)
        CommentLike.objects.filter(comment=comment, user=request.user).delete()
        return Response({'active': False, 'count': comment.likes.count()})
