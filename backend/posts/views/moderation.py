"""
Ручки модерации.

Все посты проходят через живого человека, поэтому очередь должна быть быстрой:
фильтры по типу («только новые позиции», «только новые заведения»), счётчики
и решение в один запрос.
"""

from django.db.models import Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import Post
from ..serializers import (
    ModerationDecisionSerializer, ModerationPostSerializer, RejectionSerializer,
)
from ..services.moderation import ModerationError, approve_post, reject_post


class ModerationViewSet(viewsets.ReadOnlyModelViewSet):
    """Очередь модерации и решения по постам. Только для сотрудников."""

    serializer_class = ModerationPostSerializer
    permission_classes = [permissions.IsAdminUser]

    def get_queryset(self):
        queryset = Post.objects.filter(status=Post.STATUS_PENDING).select_related(
            'user', 'menu_item', 'menu_item__restaurant', 'draft_dish_type',
        ).prefetch_related('images', 'tags', 'draft_taxons').order_by('created_at')

        # Фильтры очереди: разбирать однотипное подряд заметно быстрее.
        kind = self.request.query_params.get('kind')
        if kind == 'new_items':
            queryset = queryset.filter(menu_item__isnull=True)
        elif kind == 'existing_items':
            queryset = queryset.filter(menu_item__isnull=False)
        elif kind == 'price_changes':
            queryset = queryset.filter(proposed_price_status=Post.PRICE_PROPOSAL_PENDING)
        return queryset

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Сколько в очереди и сколько ждёт дольше суток — чтобы не проглядеть завал."""
        from django.utils import timezone

        pending = Post.objects.filter(status=Post.STATUS_PENDING)
        day_ago = timezone.now() - timezone.timedelta(days=1)
        return Response({
            'pending': pending.count(),
            'new_items': pending.filter(menu_item__isnull=True).count(),
            'price_changes': pending.filter(
                proposed_price_status=Post.PRICE_PROPOSAL_PENDING
            ).count(),
            'waiting_over_day': pending.filter(created_at__lt=day_ago).count(),
        })

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """
        Одобрить пост. Здесь же создаются заведение и позиция, если их ещё нет.

        Модератор может привязать пост к существующей позиции (`menu_item_id`),
        поправить название (`menu_item_name`) и отдельно решить по цене
        (`accept_price`) — пост можно одобрить, а цену не принять.
        """
        serializer = ModerationDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            post = approve_post(
                self.get_object(),
                request.user,
                menu_item=data.get('menu_item_id'),
                menu_item_name=data.get('menu_item_name') or None,
                accept_price=data.get('accept_price', True),
            )
        except ModerationError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(ModerationPostSerializer(post, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Отклонить пост с причиной. В каталоге не появляется ничего."""
        serializer = RejectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            post = reject_post(
                self.get_object(), request.user, serializer.validated_data['reason'],
            )
        except ModerationError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(ModerationPostSerializer(post, context={'request': request}).data)

    def get_object(self):
        """
        Решение принимается и по постам, которых уже нет в очереди, — например
        когда отклоняют ранее одобренный пост. Поэтому ищем шире, чем показываем.
        """
        obj = Post.objects.filter(pk=self.kwargs['pk']).first()
        if obj is None:
            from rest_framework.exceptions import NotFound
            raise NotFound('Пост не найден.')
        self.check_object_permissions(self.request, obj)
        return obj
