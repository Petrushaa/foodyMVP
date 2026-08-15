from django.contrib import admin
from django.utils.html import format_html

from .models import (
    Tag, Taxon, DishType, Brand, Restaurant, RestaurantAlias,
    MenuItem, MenuItemAlias, MenuItemTag,
    Post, PostImage, PostStatistics, PostLike, PostSave,
    Comment, CommentLike, MenuItemReport,
)


# --- Справочники -----------------------------------------------------------

class HasIconFilter(admin.SimpleListFilter):
    """
    «С иконкой / без иконки». Фильтр по самому файловому полю дал бы список
    из сотни путей, а нужен ровно один вопрос: что осталось залить.
    """

    title = 'Иконка'
    parameter_name = 'has_icon'

    def lookups(self, request, model_admin):
        return [('yes', 'Загружена'), ('no', 'Нет')]

    def queryset(self, request, queryset):
        if self.value() == 'yes':
            return queryset.exclude(icon='')
        if self.value() == 'no':
            return queryset.filter(icon='')
        return queryset


class IconPreviewMixin:
    """
    Показывает загруженную иконку в списке. Без превью справочник на 183 записи
    не проверить: залито или нет, видно только открыв каждую.
    """

    @admin.display(description='Иконка')
    def icon_preview(self, obj):
        if not obj.icon:
            return '—'
        return format_html(
            '<img src="{}" style="height:28px;width:28px;object-fit:contain" />',
            obj.icon.url,
        )


@admin.register(Taxon)
class TaxonAdmin(IconPreviewMixin, admin.ModelAdmin):
    list_display = ('icon_preview', 'emoji', 'name', 'kind', 'slug')
    list_display_links = ('name',)
    list_editable = ('emoji',)
    list_filter = ('kind', HasIconFilter)
    search_fields = ('name', 'slug')
    prepopulated_fields = {'slug': ('name',)}


@admin.register(DishType)
class DishTypeAdmin(IconPreviewMixin, admin.ModelAdmin):
    """
    Здесь задаются категории по умолчанию: бургер → американская кухня + фастфуд.
    Иконку можно править прямо в списке — она уедет во фронт вместе со справочником.
    """

    list_display = ('icon_preview', 'emoji', 'name', 'categories')
    list_display_links = ('name',)
    list_editable = ('emoji',)
    list_filter = (HasIconFilter,)
    search_fields = ('name',)
    filter_horizontal = ('default_taxons',)

    @admin.display(description='Категории по умолчанию')
    def categories(self, obj):
        return ' · '.join(t.name for t in obj.default_taxons.all()) or '—'

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related('default_taxons')


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


admin.site.register(PostStatistics)
admin.site.register(PostLike)
admin.site.register(PostSave)
admin.site.register(CommentLike)
