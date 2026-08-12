"""
Маршруты API приложения posts.

Чтение каталога и ленты открыто без входа, действия — только для залогиненных.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CommentLikeView, CommentViewSet, DishTypeListView, MenuItemViewSet, ModerationViewSet,
    PlaceNotFoundReportView, PlaceSuggestView, PostLikeView, PostSaveView, PostViewSet,
    RestaurantViewSet, TaxonListView,
)

router = DefaultRouter()
router.register(r'posts', PostViewSet, basename='post')
router.register(r'menu-items', MenuItemViewSet, basename='menu-item')
router.register(r'restaurants', RestaurantViewSet, basename='restaurant')
router.register(r'comments', CommentViewSet, basename='comment')
router.register(r'moderation', ModerationViewSet, basename='moderation')

urlpatterns = [
    # Справочники для формы создания поста
    path('dish-types/', DishTypeListView.as_view(), name='dish-type-list'),
    path('taxons/', TaxonListView.as_view(), name='taxon-list'),
    # Заведения: подсказки Яндекса и жалоба «не нашёл своё место»
    path('places/suggest/', PlaceSuggestView.as_view(), name='place-suggest'),
    path('places/not-found/', PlaceNotFoundReportView.as_view(), name='place-not-found'),
    # Вовлечённость: POST ставит, DELETE снимает
    path('posts/<int:post_id>/like/', PostLikeView.as_view(), name='post-like'),
    path('posts/<int:post_id>/save/', PostSaveView.as_view(), name='post-save'),
    path('comments/<int:comment_id>/like/', CommentLikeView.as_view(), name='comment-like'),
    path('', include(router.urls)),
]
