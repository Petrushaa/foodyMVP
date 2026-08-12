"""
Сериализаторы приложения posts.

Главный здесь — `PostCreateSerializer`. В нём собрана вся логика создания поста,
и её стоит держать в голове целиком:

- Позиция и заведение в каталоге **не создаются** — пост несёт «заявку на размещение»,
  по которой их создаст модератор при одобрении (шаг 5 плана).
- Если автор выбрал существующую позицию, категории и цена берутся с неё и не правятся.
- Цена вводится только в двух случаях: создаётся новая позиция либо автор заявил,
  что цена изменилась. Обычный пост цену не несёт.
"""

from decimal import Decimal

import bleach
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from .models import (
    MAX_IMAGES_PER_POST, MAX_TAGS_PER_POST, MAX_POSTS_PER_DAY, MIN_PRICE_CHANGE_RATIO,
    Comment, DishType, MenuItem, PlaceNotFoundReport, Post, PostImage, PostStatistics,
    PostTag, Restaurant, Tag, Taxon,
)
from users.serializers import FeedPostAuthorSerializer

# Лимит размера одной фотографии
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB


def _sanitize(value):
    """Вырезает HTML, оставляя чистый текст. Защита от XSS."""
    if not value:
        return ''
    return bleach.clean(value, tags=[], attributes={}, strip=True)


# ---------------------------------------------------------------------------
# Справочники и каталог
# ---------------------------------------------------------------------------

class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ['id', 'name']


class TaxonSerializer(serializers.ModelSerializer):
    class Meta:
        model = Taxon
        fields = ['id', 'kind', 'name', 'slug']


class DishTypeSerializer(serializers.ModelSerializer):
    """Тип блюда вместе с категориями по умолчанию — фронт подставляет их в форму."""

    default_taxons = TaxonSerializer(many=True, read_only=True)

    class Meta:
        model = DishType
        fields = ['id', 'name', 'default_taxons']


class RestaurantSerializer(serializers.ModelSerializer):
    maps_url = serializers.SerializerMethodField()

    class Meta:
        model = Restaurant
        fields = ['id', 'name', 'address', 'city', 'is_closed', 'maps_url']

    def get_maps_url(self, obj):
        """Кнопка «Открыть в Картах» — требование условий использования API."""
        return f'https://yandex.ru/maps/org/{obj.external_id}/'


class MenuItemSerializer(serializers.ModelSerializer):
    """Позиция для подсказок при вводе и для карточки блюда."""

    restaurant = RestaurantSerializer(read_only=True)
    dish_type = serializers.StringRelatedField()
    taxons = TaxonSerializer(many=True, read_only=True)

    class Meta:
        model = MenuItem
        fields = [
            'id', 'name', 'restaurant', 'dish_type', 'taxons',
            'price', 'price_confirmed_at',
            'rating_raw', 'ratings_count', 'posts_count',
        ]


class MenuItemDetailSerializer(MenuItemSerializer):
    """
    Карточка позиции. Добавляет то, что нужно только на её странице:
    видимые теги и объединённый рейтинг по сети.
    """

    tags = serializers.SerializerMethodField()
    brand_rating = serializers.SerializerMethodField()
    maps_url = serializers.SerializerMethodField()

    class Meta(MenuItemSerializer.Meta):
        fields = MenuItemSerializer.Meta.fields + ['tags', 'brand_rating', 'maps_url']

    def get_tags(self, obj):
        """Только теги, которые написали несколько разных людей."""
        from .services.stats import visible_tags
        return [
            {'id': link.tag_id, 'name': link.tag.name, 'mentions': link.mentions_count}
            for link in visible_tags(obj)
        ]

    def get_brand_rating(self, obj):
        """
        Рейтинг этого же блюда по всей сети. Биг Тейсти во всех Маках примерно
        одинаков, а в отдельной точке оценок мало — поэтому показываем два числа.
        """
        from .services.stats import brand_rating
        return brand_rating(obj)

    def get_maps_url(self, obj):
        return f'https://yandex.ru/maps/org/{obj.restaurant.external_id}/'


class PostImageSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = PostImage
        fields = ['id', 'image', 'uploaded_at']

    def get_image(self, obj):
        return obj.image.url if obj.image else None


class PostStatisticsSerializer(serializers.ModelSerializer):
    class Meta:
        model = PostStatistics
        fields = ['likes_count', 'saves_count', 'comments_count']


# ---------------------------------------------------------------------------
# Чтение постов
# ---------------------------------------------------------------------------

class PostListSerializer(serializers.ModelSerializer):
    """Пост в ленте. Вкладываем всё нужное, чтобы фронт не ходил дополнительно."""

    user = FeedPostAuthorSerializer(read_only=True)
    menu_item = MenuItemSerializer(read_only=True)
    images = PostImageSerializer(many=True, read_only=True)
    statistics = PostStatisticsSerializer(read_only=True)
    tags = TagSerializer(many=True, read_only=True)
    is_liked = serializers.SerializerMethodField()
    is_saved = serializers.SerializerMethodField()
    is_editable = serializers.BooleanField(read_only=True)

    class Meta:
        model = Post
        fields = [
            'id', 'user', 'menu_item', 'description', 'size', 'author_rating',
            'images', 'statistics', 'tags', 'created_at',
            'status', 'rejection_reason', 'is_liked', 'is_saved', 'is_editable',
        ]

    def _user(self):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        return user if user and user.is_authenticated else None

    def get_is_liked(self, obj):
        user = self._user()
        if not user:
            return False
        if hasattr(obj, 'prefetched_likes'):
            return any(like.user_id == user.id for like in obj.prefetched_likes)
        return obj.likes.filter(user=user).exists()

    def get_is_saved(self, obj):
        user = self._user()
        if not user:
            return False
        if hasattr(obj, 'prefetched_saves'):
            return any(save.user_id == user.id for save in obj.prefetched_saves)
        return obj.saves.filter(user=user).exists()


# ---------------------------------------------------------------------------
# Создание поста
# ---------------------------------------------------------------------------

class PostCreateSerializer(serializers.ModelSerializer):
    """
    Создание поста. Позиция и заведение в каталоге пока не появляются —
    всё, что нужно для их создания, складывается в «заявку на размещение».
    """

    # Либо выбрана существующая позиция…
    menu_item_id = serializers.PrimaryKeyRelatedField(
        queryset=MenuItem.objects.filter(status=MenuItem.STATUS_ACTIVE),
        source='menu_item', required=False, allow_null=True, write_only=True,
    )
    # …либо заявка на новую. Заведение пользователь выбирает двумя способами —
    # из подсказок по названию или ткнув в метку на карте. Оба дают идентификатор
    # организации, по нему заведения и склеиваются; координаты приходят только
    # со второго способа.
    restaurant_external_id = serializers.CharField(
        max_length=64, required=False, allow_blank=True, write_only=True,
    )
    restaurant_name = serializers.CharField(
        max_length=255, required=False, allow_blank=True, write_only=True,
    )
    restaurant_address = serializers.CharField(
        max_length=500, required=False, allow_blank=True, write_only=True,
    )
    restaurant_city = serializers.CharField(
        max_length=100, required=False, allow_blank=True, write_only=True,
    )
    restaurant_latitude = serializers.FloatField(
        required=False, allow_null=True, min_value=-90, max_value=90, write_only=True,
    )
    restaurant_longitude = serializers.FloatField(
        required=False, allow_null=True, min_value=-180, max_value=180, write_only=True,
    )
    menu_item_name = serializers.CharField(
        max_length=255, required=False, allow_blank=True, write_only=True,
    )
    dish_type_id = serializers.PrimaryKeyRelatedField(
        queryset=DishType.objects.all(), source='draft_dish_type',
        required=False, allow_null=True, write_only=True,
    )
    taxon_ids = serializers.PrimaryKeyRelatedField(
        queryset=Taxon.objects.all(), many=True, required=False, write_only=True,
    )

    # Содержимое
    description = serializers.CharField(
        max_length=2000, required=False, allow_blank=True, trim_whitespace=True,
    )
    author_rating = serializers.FloatField(
        min_value=0.0, max_value=settings.MAX_REVIEW_RATING, required=True,
    )
    price = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=Decimal('0'), required=False,
        allow_null=True, write_only=True,
    )
    tags_list = serializers.ListField(
        child=serializers.CharField(max_length=50), required=False, write_only=True,
    )
    uploaded_images = serializers.ListField(
        child=serializers.ImageField(allow_empty_file=False, use_url=False),
        required=False, write_only=True,
    )

    class Meta:
        model = Post
        fields = [
            'id', 'menu_item_id', 'menu_item_name', 'dish_type_id', 'taxon_ids',
            'restaurant_external_id', 'restaurant_name', 'restaurant_address',
            'restaurant_city', 'restaurant_latitude', 'restaurant_longitude',
            'description', 'size', 'author_rating', 'price', 'tags_list', 'uploaded_images',
        ]

    # --- поштучные проверки ---

    def validate_description(self, value):
        return _sanitize(value)

    def validate_uploaded_images(self, value):
        if len(value) > MAX_IMAGES_PER_POST:
            raise serializers.ValidationError(
                f'Не больше {MAX_IMAGES_PER_POST} фотографий в посте.'
            )
        for image in value:
            if image.size > MAX_IMAGE_SIZE:
                raise serializers.ValidationError(
                    f'Файл больше 10 МБ. Ваш: {image.size / 1024 / 1024:.1f} МБ'
                )
        return value

    def validate_tags_list(self, value):
        # Нормализуем и убираем дубли до проверки лимита, иначе «Пицца» и «пицца»
        # съедят две позиции из десяти.
        cleaned = []
        for raw in value:
            tag = raw.strip().lower().lstrip('#')
            if tag and tag not in cleaned:
                cleaned.append(tag)
        if len(cleaned) > MAX_TAGS_PER_POST:
            raise serializers.ValidationError(f'Не больше {MAX_TAGS_PER_POST} тегов в посте.')
        return cleaned

    def validate_restaurant_external_id(self, value):
        # Идентификаторы организаций у Яндекса — числовые строки. Полную проверку
        # существования делает модератор при одобрении, чтобы не тратить квоту API
        # на каждый черновик.
        value = value.strip()
        if value and not value.isdigit():
            raise serializers.ValidationError('Некорректный идентификатор заведения.')
        return value

    # --- перекрёстные проверки ---

    def validate(self, attrs):
        user = self.context['request'].user
        menu_item = attrs.get('menu_item')
        name = (attrs.get('menu_item_name') or '').strip()
        external_id = (attrs.get('restaurant_external_id') or '').strip()

        self._check_daily_limit(user)

        if menu_item and name:
            raise serializers.ValidationError(
                'Выберите существующую позицию либо создайте новую, но не одновременно.'
            )

        if menu_item:
            self._validate_existing_position(attrs, menu_item)
        else:
            self._validate_new_position(attrs, name, external_id)

        return attrs

    def _check_daily_limit(self, user):
        """
        Лимит постов в сутки. Считаем и удалённые тоже — иначе лимит обходится
        удалением своих же постов, а модератора это всё равно нагружает.
        """
        since = timezone.now() - timezone.timedelta(days=1)
        posted = Post.all_objects.filter(user=user, created_at__gte=since).count()
        if posted >= MAX_POSTS_PER_DAY:
            raise serializers.ValidationError(
                f'Достигнут суточный лимит: {MAX_POSTS_PER_DAY} постов. Попробуйте завтра.'
            )

    def _validate_existing_position(self, attrs, menu_item):
        """
        Позиция уже есть: категории и тип блюда берутся с неё и не редактируются.
        Цена — только как предложение изменения.
        """
        if attrs.get('draft_dish_type') or attrs.get('taxon_ids'):
            raise serializers.ValidationError(
                'У выбранной позиции уже есть тип блюда и категории, менять их нельзя.'
            )

        price = attrs.get('price')
        if price is None:
            return

        # Отсекаем шум: правки в пределах нескольких процентов не считаем изменением,
        # иначе модератор утонет в предложениях вида 349 → 350.
        current = menu_item.price
        if current and abs(price - current) < current * MIN_PRICE_CHANGE_RATIO:
            attrs.pop('price', None)

    def _validate_new_position(self, attrs, name, external_id):
        """Позиции нет: нужна заявка целиком — заведение, название, тип блюда и цена."""
        if not name:
            raise serializers.ValidationError(
                'Выберите позицию из списка или введите название новой.'
            )
        if not external_id:
            # Название заведения руками не принимаем: выбрать место можно только
            # из подсказок или ткнув в метку на карте. Так исключаются вымышленные
            # заведения и дубли одного места под разными написаниями.
            raise serializers.ValidationError(
                'Выберите заведение из подсказок или на карте.'
            )
        if not (attrs.get('restaurant_name') or '').strip():
            raise serializers.ValidationError('Не передано название заведения.')
        if not attrs.get('draft_dish_type'):
            raise serializers.ValidationError(
                'Выберите тип блюда — по нему подставляются категории.'
            )
        if attrs.get('price') is None:
            raise serializers.ValidationError(
                'Укажите цену: вы создаёте новую позицию, и она станет её текущей ценой.'
            )

    # --- создание ---

    @transaction.atomic
    def create(self, validated_data):
        taxons = validated_data.pop('taxon_ids', [])
        tags = validated_data.pop('tags_list', [])
        images = validated_data.pop('uploaded_images', [])
        price = validated_data.pop('price', None)
        name = (validated_data.pop('menu_item_name', '') or '').strip()

        post = Post.objects.create(
            user=self.context['request'].user,
            draft_menu_item_name=name,
            draft_restaurant_source=Restaurant.SOURCE_YANDEX,
            draft_restaurant_external_id=(validated_data.pop('restaurant_external_id', '') or '').strip(),
            draft_restaurant_name=(validated_data.pop('restaurant_name', '') or '').strip(),
            draft_restaurant_address=(validated_data.pop('restaurant_address', '') or '').strip(),
            draft_restaurant_city=(validated_data.pop('restaurant_city', '') or '').strip(),
            draft_restaurant_latitude=validated_data.pop('restaurant_latitude', None),
            draft_restaurant_longitude=validated_data.pop('restaurant_longitude', None),
            proposed_price=price,
            proposed_price_status=(
                Post.PRICE_PROPOSAL_PENDING if price is not None else Post.PRICE_PROPOSAL_NONE
            ),
            **validated_data,
        )
        if taxons:
            post.draft_taxons.set(taxons)

        for image in images:
            PostImage.objects.create(post=post, image=image)

        for tag_name in tags:
            tag, _ = Tag.objects.get_or_create(name=tag_name)
            PostTag.objects.create(post=post, tag=tag)

        return post


class PostUpdateSerializer(serializers.ModelSerializer):
    """
    Редактирование поста. Доступно **только пока пост не одобрен** — одобренный
    можно лишь удалить. Проверку статуса делает view, здесь только поля.
    """

    description = serializers.CharField(
        max_length=2000, required=False, allow_blank=True, trim_whitespace=True,
    )
    tags_list = serializers.ListField(
        child=serializers.CharField(max_length=50), required=False, write_only=True,
    )
    uploaded_images = serializers.ListField(
        child=serializers.ImageField(allow_empty_file=False, use_url=False),
        required=False, write_only=True,
    )

    class Meta:
        model = Post
        fields = ['description', 'size', 'author_rating', 'tags_list', 'uploaded_images']

    validate_description = PostCreateSerializer.validate_description
    validate_tags_list = PostCreateSerializer.validate_tags_list
    validate_uploaded_images = PostCreateSerializer.validate_uploaded_images

    @transaction.atomic
    def update(self, instance, validated_data):
        tags = validated_data.pop('tags_list', None)
        images = validated_data.pop('uploaded_images', [])

        for field, value in validated_data.items():
            setattr(instance, field, value)
        # Правка отправляет пост обратно на модерацию.
        instance.status = Post.STATUS_PENDING
        instance.moderated_by = None
        instance.moderated_at = None
        instance.rejection_reason = ''
        instance.save()

        if tags is not None:
            PostTag.objects.filter(post=instance).delete()
            for tag_name in tags:
                tag, _ = Tag.objects.get_or_create(name=tag_name)
                PostTag.objects.create(post=instance, tag=tag)

        if len(images) + instance.images.count() > MAX_IMAGES_PER_POST:
            raise serializers.ValidationError(
                {'uploaded_images': f'Всего в посте не больше {MAX_IMAGES_PER_POST} фотографий.'}
            )
        for image in images:
            PostImage.objects.create(post=instance, image=image)

        return instance


# ---------------------------------------------------------------------------
# Модерация
# ---------------------------------------------------------------------------

class ModerationPostSerializer(serializers.ModelSerializer):
    """
    Пост в очереди модерации.

    Кроме самого поста показывает **что появится в каталоге**, если его одобрить,
    и подсказку с похожими позициями — чтобы модератор мог привязать к существующей
    вместо создания дубля.
    """

    user = FeedPostAuthorSerializer(read_only=True)
    images = PostImageSerializer(many=True, read_only=True)
    tags = TagSerializer(many=True, read_only=True)
    menu_item = MenuItemSerializer(read_only=True)

    will_create = serializers.SerializerMethodField()
    similar_menu_items = serializers.SerializerMethodField()
    price_change = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = [
            'id', 'user', 'description', 'size', 'author_rating', 'images', 'tags',
            'created_at', 'status', 'menu_item',
            'will_create', 'similar_menu_items', 'price_change',
        ]

    def get_will_create(self, obj):
        """Что именно появится в каталоге. Модератор должен видеть это до одобрения."""
        if obj.menu_item_id:
            return None

        from .services.restaurants import find_by_external_id
        existing = find_by_external_id(
            obj.draft_restaurant_external_id, obj.draft_restaurant_source,
        )
        return {
            'restaurant': {
                'name': obj.draft_restaurant_name,
                'address': obj.draft_restaurant_address,
                'city': obj.draft_restaurant_city,
                'external_id': obj.draft_restaurant_external_id,
                'maps_url': (
                    f'https://yandex.ru/maps/org/{obj.draft_restaurant_external_id}/'
                    if obj.draft_restaurant_external_id else None
                ),
                'is_new': existing is None,
            },
            'menu_item': {
                'name': obj.draft_menu_item_name,
                'dish_type': str(obj.draft_dish_type) if obj.draft_dish_type_id else None,
                'taxons': TaxonSerializer(obj.draft_taxons.all(), many=True).data,
                'price': obj.proposed_price,
            },
        }

    def get_similar_menu_items(self, obj):
        from .services.moderation import similar_menu_items
        return [
            {'id': item.id, 'name': item.name, 'similarity': round(item.similarity, 2)}
            for item in similar_menu_items(obj)
        ]

    def get_price_change(self, obj):
        """Старая и предложенная цена рядом — решение по ней принимается отдельно."""
        if obj.proposed_price_status != Post.PRICE_PROPOSAL_PENDING:
            return None
        return {
            'current': obj.menu_item.price if obj.menu_item_id else None,
            'proposed': obj.proposed_price,
        }


class ModerationDecisionSerializer(serializers.Serializer):
    """Решение модератора по посту."""

    menu_item_id = serializers.PrimaryKeyRelatedField(
        queryset=MenuItem.objects.filter(status=MenuItem.STATUS_ACTIVE),
        required=False, allow_null=True,
        help_text='Привязать к существующей позиции вместо создания новой.',
    )
    menu_item_name = serializers.CharField(
        max_length=255, required=False, allow_blank=True,
        help_text='Поправленное название позиции.',
    )
    accept_price = serializers.BooleanField(
        default=True, help_text='Принять предложенную автором цену.',
    )


class RejectionSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=1000, help_text='Автор увидит эту причину.')

    def validate_reason(self, value):
        cleaned = _sanitize(value)
        if not cleaned.strip():
            raise serializers.ValidationError('Укажите причину отказа.')
        return cleaned


# ---------------------------------------------------------------------------
# Прочее
# ---------------------------------------------------------------------------

class CommentSerializer(serializers.ModelSerializer):
    user_detail = FeedPostAuthorSerializer(source='user', read_only=True)
    text = serializers.CharField(max_length=2000, trim_whitespace=True)
    likes_count = serializers.SerializerMethodField()
    is_liked = serializers.SerializerMethodField()
    is_editable = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = [
            'id', 'post', 'user', 'user_detail', 'text', 'created_at',
            'likes_count', 'is_liked', 'is_editable',
        ]
        read_only_fields = ['user', 'created_at']

    def validate_text(self, value):
        cleaned = _sanitize(value)
        if not cleaned.strip():
            raise serializers.ValidationError('Комментарий не может быть пустым.')
        return cleaned

    def validate_post(self, value):
        """Комментировать можно только опубликованные посты."""
        if value.status != Post.STATUS_APPROVED:
            raise serializers.ValidationError('Пост ещё не опубликован.')
        return value

    def get_likes_count(self, obj):
        # Если вьюха аннотировала — берём готовое, иначе считаем.
        annotated = getattr(obj, 'likes_total', None)
        return annotated if annotated is not None else obj.likes.count()

    def _user(self):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        return user if user and user.is_authenticated else None

    def get_is_liked(self, obj):
        user = self._user()
        if not user:
            return False
        if hasattr(obj, 'prefetched_likes'):
            return any(like.user_id == user.id for like in obj.prefetched_likes)
        return obj.likes.filter(user=user).exists()

    def get_is_editable(self, obj):
        user = self._user()
        return bool(user and obj.user_id == user.id)


class PlaceNotFoundReportSerializer(serializers.ModelSerializer):
    """
    «Не нашёл своё место». Копим конкретные названия, которые люди не смогли найти
    на карте, — по ним решаем отложенный вопрос про заведения вне Яндекс.Карт.
    """

    class Meta:
        model = PlaceNotFoundReport
        fields = ['id', 'query', 'comment', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate_comment(self, value):
        return _sanitize(value)
