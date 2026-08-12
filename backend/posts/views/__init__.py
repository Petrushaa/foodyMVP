"""
Представления приложения posts.

Создание постов, модерация, каталог с открытым чтением и вовлечённость —
лайки, сохранения, комментарии.
"""

from .actions import CommentLikeView, CommentViewSet, PostLikeView, PostSaveView
from .catalog import (
    DishTypeListView, MenuItemViewSet, PlaceSuggestView, RestaurantViewSet, TaxonListView,
)
from .moderation import ModerationViewSet
from .posts import PlaceNotFoundReportView, PostViewSet

__all__ = [
    'PostViewSet', 'PlaceNotFoundReportView', 'ModerationViewSet',
    'MenuItemViewSet', 'RestaurantViewSet', 'DishTypeListView', 'TaxonListView',
    'PlaceSuggestView', 'PostLikeView', 'PostSaveView', 'CommentViewSet', 'CommentLikeView',
]
