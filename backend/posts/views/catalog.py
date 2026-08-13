"""
Каталог: позиции, заведения, справочники и подсказки для формы создания поста.

Чтение здесь открыто без входа — лента, страницы позиций и заведений должны
индексироваться поисковиками и открываться по ссылке из мессенджера. Действия
(пост, лайк, комментарий) остаются только для залогиненных.
"""

from django.shortcuts import get_object_or_404
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import DishType, MenuItem, Restaurant, Tag, Taxon
from ..serializers import (
    DishTypeSerializer, MenuItemDetailSerializer, MenuItemSerializer,
    PostListSerializer, RestaurantSerializer, TagSerializer, TaxonSerializer,
)
from ..services.restaurants import search_restaurants
from ..services.search import search_menu_items


class DishTypeListView(ListAPIView):
    """Справочник блюд с категориями по умолчанию — для формы создания поста."""

    serializer_class = DishTypeSerializer
    permission_classes = [permissions.AllowAny]
    queryset = DishType.objects.prefetch_related('default_taxons').all()
    pagination_class = None


class TaxonListView(ListAPIView):
    """Категории всех четырёх осей. Фильтр `?kind=cuisine|format|form|diet`."""

    serializer_class = TaxonSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None

    def get_queryset(self):
        queryset = Taxon.objects.all()
        kind = self.request.query_params.get('kind')
        return queryset.filter(kind=kind) if kind else queryset


class TagListView(ListAPIView):
    """
    Теги, отсортированные по популярности. Нужны блоку «популярные теги»
    на странице поиска.
    """

    serializer_class = TagSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None

    def get_queryset(self):
        return Tag.objects.filter(usage_count__gt=0).order_by('-usage_count')[:50]


class PlaceSuggestView(APIView):
    """
    Подсказки заведений при вводе названия — из нашего справочника.

    Это главная защита от дублей: человек видит, что такое место уже заведено,
    и выбирает его вместо того, чтобы создавать второе. Поэтому рядом отдаём
    адрес и число постов — увидев «Кофемания, Пушкина 10 · 24 поста» рядом
    с «Кофемания, Пушкина 10 · 1 пост», выберут первое, и дубль умрёт сам.

    Ищем нечётко и по синонимам: написания, под которыми это место уже пытались
    завести, тоже ведут к нему.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        found = search_restaurants(
            request.query_params.get('text', ''),
            city=request.query_params.get('city', ''),
        )
        return Response([
            {
                'id': restaurant.id,
                'name': restaurant.name,
                'address': restaurant.address,
                'city': restaurant.city,
                'posts_count': restaurant.posts_count,
                'contributors_count': restaurant.contributors_count,
                # Неподтверждённые показываем, но помечаем: о них написал один
                # человек, и в публичный каталог они ещё не попали.
                'is_confirmed': restaurant.is_confirmed,
            }
            for restaurant in found
        ])


class MenuItemViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Позиции: поиск, карточка блюда и его посты.

    Фильтры по четырём осям: `?cuisine=american&format=fastfood&form=burgers&diet=vegan`.
    Значения — слаги категорий, можно перечислять через запятую.
    """

    permission_classes = [permissions.AllowAny]

    def get_serializer_class(self):
        return MenuItemDetailSerializer if self.action == 'retrieve' else MenuItemSerializer

    def get_queryset(self):
        queryset = (
            MenuItem.objects
            .filter(status=MenuItem.STATUS_ACTIVE, posts_count__gt=0)
            .select_related('restaurant', 'restaurant__brand', 'dish_type')
            .prefetch_related('taxons')
            .with_photo()
        )

        for kind in (Taxon.KIND_CUISINE, Taxon.KIND_FORMAT, Taxon.KIND_FORM, Taxon.KIND_DIET):
            raw = self.request.query_params.get(kind)
            if not raw:
                continue
            slugs = [slug.strip() for slug in raw.split(',') if slug.strip()]
            # Несколько осей сужают выдачу, несколько значений одной оси — расширяют.
            queryset = queryset.filter(taxons__kind=kind, taxons__slug__in=slugs)

        restaurant_id = self.request.query_params.get('restaurant')
        if restaurant_id:
            queryset = queryset.filter(restaurant_id=restaurant_id)

        return queryset.distinct().order_by('-rating')

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def search(self, request):
        """
        Умный поиск позиций: опечатки, синонимы, латиница и неверная раскладка.

        Используется при создании поста, поэтому ищет и среди позиций без постов —
        иначе человек не найдёт только что созданную и заведёт дубль.
        """
        restaurant = None
        restaurant_id = request.query_params.get('restaurant')
        if restaurant_id:
            restaurant = Restaurant.objects.filter(pk=restaurant_id).first()

        found = search_menu_items(
            request.query_params.get('text', ''),
            restaurant=restaurant,
            include_empty=True,
        )
        return Response(MenuItemSerializer(found, many=True, context={'request': request}).data)

    @action(detail=True, methods=['get'])
    def posts(self, request, pk=None):
        """Все посты про эту позицию."""
        from ..models import Post

        queryset = (
            Post.objects
            .filter(menu_item_id=pk, status=Post.STATUS_APPROVED)
            .select_related('user', 'statistics')
            .prefetch_related('images', 'tags')
        )
        page = self.paginate_queryset(queryset)
        serializer = PostListSerializer(page, many=True, context={'request': request})
        return self.get_paginated_response(serializer.data)


class RestaurantViewSet(viewsets.ReadOnlyModelViewSet):
    """Заведения и их позиции. Ручного CRUD нет — заводятся только через модерацию."""

    serializer_class = RestaurantSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        """
        В **список** каталога попадают только подтверждённые заведения — те,
        о которых написали несколько разных людей. Так выдуманное место
        не всплывает в выдаче, даже если модератор его проглядел.

        А вот по прямой ссылке заведение открывается с первого поста: на него
        ведёт карточка уже опубликованного поста, и упереться в «не найдено»,
        кликнув по названию из своей же ленты, — просто поломка. Скрытые
        модератором не открываются никак.
        """
        queryset = Restaurant.objects.filter(is_hidden=False).select_related('brand')
        if self.action == 'list':
            queryset = queryset.filter(
                contributors_count__gte=Restaurant.CONFIRMATIONS_REQUIRED,
            )
        city = self.request.query_params.get('city')
        return queryset.filter(normalized_city=city.strip().lower()) if city else queryset

    @action(detail=True, methods=['get'])
    def menu(self, request, pk=None):
        """Позиции заведения, лучшие сверху."""
        restaurant = get_object_or_404(self.get_queryset(), pk=pk)
        items = (
            MenuItem.objects
            .filter(restaurant=restaurant, status=MenuItem.STATUS_ACTIVE, posts_count__gt=0)
            .select_related('restaurant', 'dish_type')
            .prefetch_related('taxons')
            .with_photo()
            .order_by('-rating')
        )
        page = self.paginate_queryset(items)
        serializer = MenuItemSerializer(page, many=True, context={'request': request})
        return self.get_paginated_response(serializer.data)
