"""
Представления приложения posts.

Создание постов, модерация, каталог с открытым чтением и вовлечённость —
лайки, сохранения, комментарии.
"""

from .actions import CommentLikeView, CommentViewSet, PostLikeView, PostSaveView
from .catalog import (
    DishTypeListView, MenuItemViewSet, PlaceSuggestView, RestaurantViewSet, TagListView,
    TaxonListView,
)
from .moderation import ModerationViewSet
from .posts import PostViewSet

__all__ = [
    'PostViewSet', 'ModerationViewSet',
    'MenuItemViewSet', 'RestaurantViewSet', 'DishTypeListView', 'TaxonListView',
    'PlaceSuggestView', 'TagListView', 'PostLikeView', 'PostSaveView', 'CommentViewSet', 'CommentLikeView',
]
