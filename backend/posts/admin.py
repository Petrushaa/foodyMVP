from django.contrib import admin

from .models import (
    Tag, Taxon, DishType, Brand, Restaurant, RestaurantAlias,
    MenuItem, MenuItemAlias, MenuItemTag,
    Post, PostImage, PostStatistics, PostLike, PostSave,
    Comment, CommentLike, MenuItemReport, PlaceNotFoundReport,
)


# --- Справочники -----------------------------------------------------------

@admin.register(Taxon)
class TaxonAdmin(admin.ModelAdmin):
    list_display = ('id', 'kind', 'name', 'slug')
    list_filter = ('kind',)
    search_fields = ('name', 'slug')
    prepopulated_fields = {'slug': ('name',)}


@admin.register(DishType)
class DishTypeAdmin(admin.ModelAdmin):
    """Здесь задаются категории по умолчанию: бургер → американская кухня + фастфуд."""

    list_display = ('id', 'name')
    search_fields = ('name',)
    filter_horizontal = ('default_taxons',)


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'usage_count')
    search_fields = ('name',)
    ordering = ('-usage_count',)


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ('id', 'name')
    search_fields = ('name',)


# --- Заведения и позиции ---------------------------------------------------

class RestaurantAliasInline(admin.TabularInline):
    model = RestaurantAlias
    extra = 0
    readonly_fields = ('created_at',)


@admin.register(Restaurant)
class RestaurantAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'name', 'address', 'city', 'contributors_count', 'posts_count',
        'is_closed', 'is_hidden',
    )
    list_filter = ('source', 'is_closed', 'is_hidden', 'city')
    search_fields = ('name', 'normalized_name', 'address', 'city')
    readonly_fields = (
        'normalized_name', 'normalized_address', 'normalized_city',
        'contributors_count', 'posts_count', 'created_at',
    )
    autocomplete_fields = ('brand',)
    inlines = [RestaurantAliasInline]


class MenuItemAliasInline(admin.TabularInline):
    model = MenuItemAlias
    extra = 0


class MenuItemTagInline(admin.TabularInline):
    model = MenuItemTag
    extra = 0
    readonly_fields = ('mentions_count', 'created_at')


@admin.register(MenuItem)
class MenuItemAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'restaurant', 'dish_type', 'price', 'rating_raw', 'ratings_count', 'status')
    list_filter = ('status', 'dish_type')
    search_fields = ('name', 'normalized_name', 'restaurant__name')
    readonly_fields = ('normalized_name', 'rating', 'rating_raw', 'ratings_count', 'posts_count', 'created_at')
    autocomplete_fields = ('restaurant',)
    filter_horizontal = ('taxons',)
    inlines = [MenuItemAliasInline, MenuItemTagInline]


# --- Посты -----------------------------------------------------------------

class PostStatisticsInline(admin.StackedInline):
    model = PostStatistics
    readonly_fields = ('likes_count', 'saves_count', 'comments_count')
    can_delete = False


class PostImageInline(admin.TabularInline):
    model = PostImage
    extra = 0
    readonly_fields = ('uploaded_at',)


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'menu_item', 'status', 'author_rating', 'possible_duplicate', 'looks_suspicious', 'created_at', 'deleted_at')
    list_filter = ('status', 'possible_duplicate', 'looks_suspicious', 'proposed_price_status', 'created_at', 'deleted_at')
    search_fields = ('description', 'user__username', 'draft_menu_item_name')
    readonly_fields = ('moderated_by', 'moderated_at', 'created_at')
    filter_horizontal = ('draft_taxons',)
    inlines = [PostStatisticsInline, PostImageInline]

    def get_queryset(self, request):
        """В админке видны и мягко удалённые посты — она для разбора инцидентов."""
        return Post.all_objects.all()


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ('id', 'post', 'user', 'created_at', 'deleted_at')
    list_filter = ('created_at', 'deleted_at')
    search_fields = ('text', 'user__username')

    def get_queryset(self, request):
        return Comment.all_objects.all()


# --- Обратная связь --------------------------------------------------------

@admin.register(MenuItemReport)
class MenuItemReportAdmin(admin.ModelAdmin):
    list_display = ('id', 'menu_item', 'user', 'status', 'created_at', 'resolved_at')
    list_filter = ('status', 'created_at')
    search_fields = ('text', 'menu_item__name')


@admin.register(PlaceNotFoundReport)
class PlaceNotFoundReportAdmin(admin.ModelAdmin):
    """Копим то, что люди не смогли найти на карте — по этим данным решаем вопрос №4."""

    list_display = ('id', 'query', 'user', 'created_at')
    search_fields = ('query', 'comment')


admin.site.register(PostStatistics)
admin.site.register(PostLike)
admin.site.register(PostSave)
admin.site.register(CommentLike)
