"""
Модели каталога и контента Foody v2.

Устройство коротко (подробности — docs/backend-v2-plan.md):

- Заведение (`Restaurant`) — название и адрес вводит пользователь, справочник целиком наш.
  Уникальность — «город + название + адрес» в нормализованном виде.
- Позиция (`MenuItem`) — конкретное блюдо в конкретном заведении, к ней привязаны все посты
  про него, её рейтинг и текущая цена.
- Пост (`Post`) — рассказ про позицию с оценкой автора. До одобрения модератором позиция
  и заведение в каталоге не создаются, поэтому пост несёт «заявку на размещение».
- Удаление постов и комментариев мягкое: записи остаются, из выдачи пропадают.
  Дубли заведений и позиций, наоборот, удаляются по-настоящему — их содержимое
  переезжает к выжившему, а написание остаётся синонимом.
"""

import re
import sys
from io import BytesIO

from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.files.uploadedfile import InMemoryUploadedFile
from django.contrib.postgres.indexes import GinIndex
from django.utils import timezone
from PIL import Image

# Лимиты на пост (проверяются в сериализаторах)
MAX_IMAGES_PER_POST = 10
MAX_TAGS_PER_POST = 10
MAX_POSTS_PER_DAY = 100

# Предложение новой цены игнорируется, если она отличается от текущей меньше чем на столько.
MIN_PRICE_CHANGE_RATIO = 0.05

# Тег попадает в карточку позиции, когда его написали столько разных людей.
MENU_ITEM_TAG_MIN_MENTIONS = 2


_PUNCTUATION_RE = re.compile(r'[^\w\s]', re.UNICODE)
_WHITESPACE_RE = re.compile(r'\s+')


def normalize_name(value):
    """
    Приводит название к виду, по которому ищутся дубли: нижний регистр, «ё» → «е»,
    без знаков препинания и лишних пробелов. «Чиз Бургер!» и «чизбургер» → «чиз бургер».
    """
    if not value:
        return ''
    text = value.strip().lower().replace('ё', 'е')
    text = _PUNCTUATION_RE.sub(' ', text)
    return _WHITESPACE_RE.sub(' ', text).strip()


# Сокращения в адресах. Люди пишут одно и то же десятком способов, и без
# приведения к единому виду «ул. Пушкина, д. 10» и «улица Пушкина 10» станут
# двумя разными заведениями.
_ADDRESS_ABBREVIATIONS = {
    'ул': 'улица', 'уллица': 'улица',
    'пр': 'проспект', 'просп': 'проспект', 'прт': 'проспект', 'пркт': 'проспект',
    'пер': 'переулок', 'пл': 'площадь', 'наб': 'набережная',
    'бул': 'бульвар', 'бр': 'бульвар', 'ш': 'шоссе', 'мкр': 'микрорайон',
    'мкрн': 'микрорайон', 'пос': 'посёлок', 'д': 'дом', 'вл': 'владение',
    'к': 'корпус', 'корп': 'корпус', 'стр': 'строение', 'с': 'строение',
    'литер': 'литера', 'лит': 'литера',
}

# Сокращения с дефисом раскрываем до общей нормализации: иначе знаки препинания
# срежутся раньше, «пр-т» распадётся на «пр» и «т», и в адресе останется мусор.
_HYPHENATED_ABBREVIATIONS = [
    (re.compile(r'\bпр[\s-]*кт\b', re.IGNORECASE), 'проспект'),
    (re.compile(r'\bпр[\s-]*т\b', re.IGNORECASE), 'проспект'),
    (re.compile(r'\bб[\s-]*р\b', re.IGNORECASE), 'бульвар'),
    (re.compile(r'\bм[\s-]*н\b', re.IGNORECASE), 'микрорайон'),
    (re.compile(r'\bш[\s-]*се\b', re.IGNORECASE), 'шоссе'),
]

# Слова, которые в адресе ничего не различают: «дом 10» и «10» — один адрес.
#
# «Улица» здесь же, и это важно: её опускают постоянно — «Пушкина 10» и
# «ул. Пушкина, д. 10» это одно место. А вот «проспект», «переулок» и прочие
# типы люди пишут, и отбрасывать их нельзя: «улица Ленина» и «проспект Ленина»
# в одном городе — разные адреса, и склеить их было бы хуже, чем оставить дубль.
_ADDRESS_NOISE = {'дом', 'здание', 'улица'}


def normalize_address(value):
    """
    Приводит адрес к сравнимому виду: раскрывает сокращения, убирает служебные
    слова и сортирует части, чтобы порядок слов не создавал дубли.

    «ул. Пушкина, д. 10», «улица Пушкина 10» и «Пушкина, 10» → «10 пушкина».
    """
    if not value:
        return ''
    for pattern, replacement in _HYPHENATED_ABBREVIATIONS:
        value = pattern.sub(replacement, value)
    words = []
    for word in normalize_name(value).split():
        word = _ADDRESS_ABBREVIATIONS.get(word, word)
        if word not in _ADDRESS_NOISE:
            words.append(word)
    # Сортировка убирает влияние порядка: «Пушкина 10» и «10 Пушкина» — одно и то же.
    return ' '.join(sorted(words))


# ---------------------------------------------------------------------------
# Мягкое удаление
# ---------------------------------------------------------------------------

class SoftDeleteQuerySet(models.QuerySet):
    """QuerySet с явными фильтрами по признаку удаления."""

    def alive(self):
        return self.filter(deleted_at__isnull=True)

    def dead(self):
        return self.filter(deleted_at__isnull=False)

    def delete(self):
        """Массовое удаление тоже мягкое."""
        return self.update(deleted_at=timezone.now())


class SoftDeleteManager(models.Manager.from_queryset(SoftDeleteQuerySet)):
    """
    Менеджер по умолчанию: удалённые записи не видны вообще нигде.
    Именно поэтому он объявляется первым — иначе про фильтр рано или поздно забудут.
    """

    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class SoftDeleteModel(models.Model):
    """
    Базовая модель с мягким удалением.

    `objects` отдаёт только живые записи, `all_objects` — все, включая удалённые
    (нужен админке и разбору инцидентов). `base_manager_name` заставляет Django брать
    полный менеджер при обходе связей, иначе `comment.post` для удалённого поста упадёт.
    """

    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True, verbose_name='Удалён')

    objects = SoftDeleteManager()
    all_objects = models.Manager.from_queryset(SoftDeleteQuerySet)()

    class Meta:
        abstract = True
        base_manager_name = 'all_objects'

    @property
    def is_deleted(self):
        return self.deleted_at is not None

    def delete(self, using=None, keep_parents=False):
        """Мягкое удаление. Для настоящего удаления — `hard_delete()`."""
        self.deleted_at = timezone.now()
        self.save(update_fields=['deleted_at'])

    def restore(self):
        self.deleted_at = None
        self.save(update_fields=['deleted_at'])

    def hard_delete(self, using=None, keep_parents=False):
        super().delete(using=using, keep_parents=keep_parents)


# ---------------------------------------------------------------------------
# Справочники
# ---------------------------------------------------------------------------

class Tag(models.Model):
    name = models.CharField(max_length=50, unique=True, verbose_name='Название тега')
    usage_count = models.PositiveIntegerField(default=0, db_index=True, verbose_name='Количество использований')

    class Meta:
        verbose_name = 'Тег'
        verbose_name_plural = 'Теги'
        ordering = ['name']

    def __str__(self):
        return self.name


class Taxon(models.Model):
    """
    Категория по одной из четырёх осей. Все оси лежат в одной таблице, потому что
    осей со временем станет больше, а фильтры и админка так пишутся один раз.
    """

    KIND_CUISINE = 'cuisine'
    KIND_FORMAT = 'format'
    KIND_FORM = 'form'
    KIND_DIET = 'diet'
    KIND_CHOICES = [
        (KIND_CUISINE, 'Кухня'),
        (KIND_FORMAT, 'Формат еды'),
        (KIND_FORM, 'Форма еды'),
        (KIND_DIET, 'Дополнительно'),
    ]

    # Оси, где у позиции может быть только одно значение. «Дополнительно» — сколько угодно
    # (постное + вегетарианское + ПП одновременно).
    SINGLE_VALUE_KINDS = (KIND_CUISINE, KIND_FORMAT, KIND_FORM)

    kind = models.CharField(max_length=16, choices=KIND_CHOICES, db_index=True, verbose_name='Ось')
    name = models.CharField(max_length=100, verbose_name='Название')
    slug = models.SlugField(max_length=100, verbose_name='Код')
    # Иконка для интерфейса. Хранится здесь, а не в коде фронта: справочник
    # ведут админы, и добавляя категорию, они же выбирают ей значок.
    emoji = models.CharField(max_length=8, blank=True, verbose_name='Иконка')

    class Meta:
        verbose_name = 'Категория'
        verbose_name_plural = 'Категории'
        ordering = ['kind', 'name']
        constraints = [
            models.UniqueConstraint(fields=['kind', 'slug'], name='taxon_unique_kind_slug'),
            models.UniqueConstraint(fields=['kind', 'name'], name='taxon_unique_kind_name'),
        ]

    def __str__(self):
        return f'{self.get_kind_display()}: {self.name}'


class DishType(models.Model):
    """
    Справочник блюд (бургер, пицца, латте). Пользователь выбирает его при создании новой
    позиции, а категории по умолчанию копируются отсюда в позицию — именно копируются,
    чтобы правка справочника не переписала задним числом тысячи позиций.
    """

    name = models.CharField(max_length=100, unique=True, db_index=True, verbose_name='Название блюда')
    emoji = models.CharField(max_length=8, blank=True, verbose_name='Иконка')
    default_taxons = models.ManyToManyField(
        Taxon, blank=True, related_name='dish_types', verbose_name='Категории по умолчанию'
    )

    class Meta:
        verbose_name = 'Тип блюда'
        verbose_name_plural = 'Типы блюд'
        ordering = ['name']

    def __str__(self):
        return self.name


class Brand(models.Model):
    """Сеть заведений. Проставляется модератором вручную."""

    name = models.CharField(max_length=255, unique=True, verbose_name='Название сети')

    class Meta:
        verbose_name = 'Сеть'
        verbose_name_plural = 'Сети'
        ordering = ['name']

    def __str__(self):
        return self.name


# ---------------------------------------------------------------------------
# Заведения
# ---------------------------------------------------------------------------

class Restaurant(models.Model):
    """
    Заведение. Целиком наши данные: название и адрес вводит пользователь.

    Якорь всех связей — внутренний id. Уникальность — тройка «город + название +
    адрес» в нормализованном виде: пятьдесят «Шоколадниц» с разными адресами
    останутся разными заведениями, а «ул. Пушкина, д. 10» и «Пушкина 10» схлопнутся
    в одно.

    Заведение считается подтверждённым, когда о нём написали **двое разных людей**.
    Неподтверждённые не попадают в публичный каталог и стоят ниже в подсказках —
    так выдуманное место не всплывает, даже если модератор его проглядел.
    """

    SOURCE_USER = 'user'
    SOURCE_YANDEX = 'yandex'
    SOURCE_CHOICES = [
        (SOURCE_USER, 'Добавлено пользователем'),
        (SOURCE_YANDEX, 'Яндекс.Карты'),
    ]

    # Сколько разных людей должны написать про заведение, чтобы оно считалось
    # настоящим и попало в публичный каталог.
    CONFIRMATIONS_REQUIRED = 2

    source = models.CharField(
        max_length=16, choices=SOURCE_CHOICES, default=SOURCE_USER, verbose_name='Источник'
    )
    # Заполняется, только если заведение однажды приедет из внешнего источника.
    # Клиент к Яндексу остался в коде и включится, если появится лицензия.
    external_id = models.CharField(
        max_length=64, blank=True, verbose_name='Идентификатор в источнике'
    )

    name = models.CharField(max_length=255, db_index=True, verbose_name='Название')
    address = models.CharField(max_length=500, verbose_name='Адрес')
    city = models.CharField(max_length=100, db_index=True, verbose_name='Город')

    normalized_name = models.CharField(max_length=255, db_index=True, editable=False)
    normalized_address = models.CharField(max_length=500, db_index=True, editable=False)
    normalized_city = models.CharField(max_length=100, db_index=True, editable=False)

    latitude = models.FloatField(null=True, blank=True, verbose_name='Широта')
    longitude = models.FloatField(null=True, blank=True, verbose_name='Долгота')

    brand = models.ForeignKey(
        Brand, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='restaurants', verbose_name='Сеть'
    )

    # Сколько разных людей о нём постили. Пересчитывается вместе с показателями.
    contributors_count = models.PositiveIntegerField(default=0, verbose_name='Разных авторов')
    posts_count = models.PositiveIntegerField(default=0, verbose_name='Видимых постов')

    is_closed = models.BooleanField(default=False, verbose_name='Закрыто')
    is_hidden = models.BooleanField(default=False, verbose_name='Скрыто модератором')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Заведение'
        verbose_name_plural = 'Заведения'
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['normalized_city', 'normalized_name', 'normalized_address'],
                name='restaurant_unique_city_name_address',
            ),
            # Пара «источник + идентификатор» уникальна, только когда идентификатор есть.
            models.UniqueConstraint(
                fields=['source', 'external_id'],
                condition=~models.Q(external_id=''),
                name='restaurant_unique_source_external_id',
            ),
        ]
        indexes = [
            GinIndex(fields=['normalized_name'], name='restaurant_name_trgm',
                     opclasses=['gin_trgm_ops']),
            GinIndex(fields=['normalized_address'], name='restaurant_addr_trgm',
                     opclasses=['gin_trgm_ops']),
        ]

    def __str__(self):
        return f'{self.name} ({self.address})'

    def save(self, *args, **kwargs):
        self.normalized_name = normalize_name(self.name)
        self.normalized_address = normalize_address(self.address)
        self.normalized_city = normalize_name(self.city)
        super().save(*args, **kwargs)

    @property
    def is_confirmed(self):
        """Подтверждено, если о нём написали несколько разных людей."""
        return self.contributors_count >= self.CONFIRMATIONS_REQUIRED

    @property
    def is_public(self):
        return self.is_confirmed and not self.is_hidden


class RestaurantAlias(models.Model):
    """
    Написание, под которым заведение уже пытались завести.

    Заполняется при слиянии дублей: сама запись-дубль удаляется, а её название
    и адрес остаются здесь. Так каждое слияние делает поиск умнее — в следующий раз
    «Кафе Кофемания» найдёт «Кофеманию», а не создаст третий дубль.
    """

    restaurant = models.ForeignKey(
        Restaurant, on_delete=models.CASCADE, related_name='aliases', verbose_name='Заведение'
    )
    name = models.CharField(max_length=255, verbose_name='Написание названия')
    address = models.CharField(max_length=500, blank=True, verbose_name='Написание адреса')
    normalized_name = models.CharField(max_length=255, db_index=True, editable=False)
    normalized_address = models.CharField(max_length=500, db_index=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Синоним заведения'
        verbose_name_plural = 'Синонимы заведений'
        constraints = [
            models.UniqueConstraint(
                fields=['restaurant', 'normalized_name', 'normalized_address'],
                name='restaurantalias_unique',
            ),
        ]
        indexes = [
            GinIndex(fields=['normalized_name'], name='restaurantalias_name_trgm',
                     opclasses=['gin_trgm_ops']),
        ]

    def __str__(self):
        return f'{self.name} → {self.restaurant.name}'

    def save(self, *args, **kwargs):
        self.normalized_name = normalize_name(self.name)
        self.normalized_address = normalize_address(self.address)
        super().save(*args, **kwargs)


# ---------------------------------------------------------------------------
# Позиции
# ---------------------------------------------------------------------------

class MenuItemQuerySet(models.QuerySet):
    def with_photo(self):
        """
        Добавляет `photo_path` — фото с самого свежего одобренного поста о позиции.

        Своих картинок у позиции нет, а показывать её плиткой без фото незачем.
        Делаем подзапросом, а не обращением к постам у каждой записи: иначе
        список из двадцати позиций — это двадцать лишних запросов.

        Удалённые посты отсекаем явно: по связи Django берёт базовый менеджер,
        который мягко удалённые не прячет.
        """
        newest_photo = (
            PostImage.objects
            .filter(
                post__menu_item=models.OuterRef('pk'),
                post__status=Post.STATUS_APPROVED,
                post__deleted_at__isnull=True,
            )
            .order_by('-post__created_at', 'id')
            .values('image')[:1]
        )
        return self.annotate(photo_path=models.Subquery(newest_photo))


class MenuItem(models.Model):
    """
    Позиция — блюдо в конкретном заведении.

    `normalized_name` — служебное поле для склейки дублей и поиска: по нему стоит
    уникальность внутри заведения и триграммный индекс для поиска с опечатками.
    """

    objects = MenuItemQuerySet.as_manager()

    STATUS_ACTIVE = 'active'
    STATUS_HIDDEN = 'hidden'
    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Активна'),
        (STATUS_HIDDEN, 'Скрыта'),
    ]

    restaurant = models.ForeignKey(
        Restaurant, on_delete=models.CASCADE, related_name='menu_items', verbose_name='Заведение'
    )
    name = models.CharField(max_length=255, verbose_name='Название')
    normalized_name = models.CharField(max_length=255, db_index=True, editable=False, verbose_name='Ключ поиска')

    dish_type = models.ForeignKey(
        DishType, on_delete=models.PROTECT, null=True, blank=True,
        related_name='menu_items', verbose_name='Тип блюда'
    )
    taxons = models.ManyToManyField(
        Taxon, blank=True, related_name='menu_items', verbose_name='Категории'
    )
    tags = models.ManyToManyField(
        Tag, through='MenuItemTag', related_name='menu_items', verbose_name='Теги'
    )

    # Текущая цена в рублях. Задаётся создателем позиции, дальше меняется только
    # через одобренное модератором предложение (см. Post.proposed_price).
    # Валюты нет намеренно: сервис работает только по России.
    price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True, verbose_name='Цена, ₽'
    )
    price_confirmed_at = models.DateTimeField(null=True, blank=True, verbose_name='Цена подтверждена')

    # Денормализованные показатели, пересчитываются фоновой задачей.
    rating = models.FloatField(default=0.0, db_index=True, verbose_name='Рейтинг (для сортировки)')
    rating_raw = models.FloatField(default=0.0, verbose_name='Средняя оценка (для показа)')
    ratings_count = models.PositiveIntegerField(default=0, verbose_name='Количество оценок')
    posts_count = models.PositiveIntegerField(default=0, verbose_name='Количество видимых постов')

    status = models.CharField(
        max_length=16, choices=STATUS_CHOICES, default=STATUS_ACTIVE, db_index=True, verbose_name='Статус'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Позиция'
        verbose_name_plural = 'Позиции'
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['restaurant', 'normalized_name'], name='menuitem_unique_restaurant_name'
            ),
        ]
        indexes = [
            # Триграммный индекс для поиска с опечатками (требует расширения pg_trgm).
            GinIndex(fields=['normalized_name'], name='menuitem_name_trgm', opclasses=['gin_trgm_ops']),
            models.Index(fields=['-rating']),
        ]

    def __str__(self):
        return f'{self.name} ({self.restaurant.name})'

    def save(self, *args, **kwargs):
        self.normalized_name = normalize_name(self.name)
        super().save(*args, **kwargs)

    @property
    def is_visible(self):
        """Позиция без единого видимого поста прячется из поиска и каталога."""
        return self.status == self.STATUS_ACTIVE and self.posts_count > 0


class MenuItemAlias(models.Model):
    """Альтернативное написание позиции: «шава» → «шаурма». Ведёт модератор."""

    menu_item = models.ForeignKey(
        MenuItem, on_delete=models.CASCADE, related_name='aliases', verbose_name='Позиция'
    )
    name = models.CharField(max_length=255, verbose_name='Написание')
    normalized_name = models.CharField(max_length=255, db_index=True, editable=False, verbose_name='Ключ поиска')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Синоним позиции'
        verbose_name_plural = 'Синонимы позиций'
        constraints = [
            models.UniqueConstraint(
                fields=['menu_item', 'normalized_name'], name='menuitemalias_unique_item_name'
            ),
        ]
        indexes = [
            GinIndex(fields=['normalized_name'], name='menuitemalias_name_trgm', opclasses=['gin_trgm_ops']),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        self.normalized_name = normalize_name(self.name)
        super().save(*args, **kwargs)


class MenuItemTag(models.Model):
    """
    Связь позиции с тегом. Тег приходит с постов и показывается в карточке позиции,
    только когда его написали несколько разных людей — иначе один шутник насыпет чего угодно.
    """

    menu_item = models.ForeignKey(MenuItem, on_delete=models.CASCADE)
    tag = models.ForeignKey(Tag, on_delete=models.CASCADE)
    mentions_count = models.PositiveIntegerField(default=0, verbose_name='Сколько людей упомянули')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Тег позиции'
        verbose_name_plural = 'Теги позиций'
        constraints = [
            models.UniqueConstraint(fields=['menu_item', 'tag'], name='menuitemtag_unique_item_tag'),
        ]
        indexes = [
            models.Index(fields=['-mentions_count']),
        ]

    @property
    def is_visible(self):
        return self.mentions_count >= MENU_ITEM_TAG_MIN_MENTIONS


# ---------------------------------------------------------------------------
# Посты
# ---------------------------------------------------------------------------

class Post(SoftDeleteModel):
    """
    Пост про позицию.

    Пока пост на модерации, позиции и заведения в каталоге может ещё не быть — тогда пост
    несёт «заявку на размещение» (`draft_*`), по которой они создаются в момент одобрения.
    Если автор выбрал существующую позицию, `menu_item` заполнен сразу.
    """

    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'На модерации'),
        (STATUS_APPROVED, 'Одобрен'),
        (STATUS_REJECTED, 'Отклонён'),
    ]

    PRICE_PROPOSAL_NONE = 'none'
    PRICE_PROPOSAL_PENDING = 'pending'
    PRICE_PROPOSAL_ACCEPTED = 'accepted'
    PRICE_PROPOSAL_REJECTED = 'rejected'
    PRICE_PROPOSAL_CHOICES = [
        (PRICE_PROPOSAL_NONE, 'Цена не предлагалась'),
        (PRICE_PROPOSAL_PENDING, 'Предложена новая цена'),
        (PRICE_PROPOSAL_ACCEPTED, 'Новая цена принята'),
        (PRICE_PROPOSAL_REJECTED, 'Новая цена отклонена'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='posts', verbose_name='Автор'
    )
    menu_item = models.ForeignKey(
        MenuItem, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='posts', verbose_name='Позиция'
    )

    # Город автора на момент публикации — по нему пост попадает в чью-то ленту.
    # Именно снимок, а не ссылка на профиль: человек переезжает, а написанное
    # остаётся у того города, о котором писалось. Поэтому поле не меняется даже
    # при правке поста.
    city = models.CharField(max_length=100, blank=True, verbose_name='Город')
    normalized_city = models.CharField(
        max_length=100, blank=True, db_index=True, editable=False,
        verbose_name='Ключ города'
    )

    # --- Заявка на размещение: заполняется, когда позиции ещё нет в каталоге ---
    draft_restaurant_source = models.CharField(
        max_length=16, choices=Restaurant.SOURCE_CHOICES, default=Restaurant.SOURCE_YANDEX,
        blank=True, verbose_name='Источник заведения'
    )
    # Заведение, которое пользователь выбрал: из подсказок по названию либо ткнув
    # в метку на карте. В обоих случаях это его выбор, поэтому данные наши, а склейка
    # идёт по идентификатору организации — он одинаков для обоих способов.
    # Заполняется, когда автор выбрал заведение из подсказок. Если пусто — он вводит
    # новое, и оно будет создано при одобрении.
    draft_restaurant = models.ForeignKey(
        Restaurant, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='draft_posts', verbose_name='Выбранное заведение'
    )
    draft_restaurant_external_id = models.CharField(
        max_length=64, blank=True, verbose_name='Идентификатор заведения в источнике'
    )
    draft_restaurant_name = models.CharField(
        max_length=255, blank=True, verbose_name='Название заведения'
    )
    draft_restaurant_address = models.CharField(
        max_length=500, blank=True, verbose_name='Адрес заведения'
    )
    draft_restaurant_city = models.CharField(
        max_length=100, blank=True, verbose_name='Город заведения'
    )
    # Координаты приходят, только если пользователь выбирал заведение на карте:
    # подсказки по названию их не возвращают.
    draft_restaurant_latitude = models.FloatField(
        null=True, blank=True, verbose_name='Широта заведения'
    )
    draft_restaurant_longitude = models.FloatField(
        null=True, blank=True, verbose_name='Долгота заведения'
    )
    draft_menu_item_name = models.CharField(
        max_length=255, blank=True, verbose_name='Название позиции'
    )
    draft_dish_type = models.ForeignKey(
        DishType, on_delete=models.PROTECT, null=True, blank=True,
        related_name='draft_posts', verbose_name='Тип блюда'
    )
    draft_taxons = models.ManyToManyField(
        Taxon, blank=True, related_name='draft_posts', verbose_name='Категории позиции'
    )

    # --- Содержимое ---
    description = models.TextField(blank=True, verbose_name='Текст поста')
    size = models.CharField(max_length=50, blank=True, verbose_name='Размер / объём')
    author_rating = models.FloatField(
        validators=[MinValueValidator(0.0), MaxValueValidator(settings.MAX_REVIEW_RATING)],
        verbose_name='Оценка автора'
    )
    tags = models.ManyToManyField(Tag, through='PostTag', related_name='posts', verbose_name='Теги')

    # --- Цена: заполняется при создании позиции или когда автор заявил изменение ---
    proposed_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True, verbose_name='Предложенная цена'
    )
    proposed_price_status = models.CharField(
        max_length=16, choices=PRICE_PROPOSAL_CHOICES, default=PRICE_PROPOSAL_NONE,
        verbose_name='Статус предложения цены'
    )

    # --- Модерация ---
    status = models.CharField(
        max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING,
        db_index=True, verbose_name='Статус модерации'
    )
    moderated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='moderated_posts', verbose_name='Модератор'
    )
    moderated_at = models.DateTimeField(null=True, blank=True, verbose_name='Дата модерации')
    rejection_reason = models.TextField(blank=True, verbose_name='Причина отказа')

    # --- Отметки для модератора, проставляет сервер при создании ---
    # Похожее заведение существует, а автор всё равно заводит новое. Проверяет
    # именно сервер: полагаться на то, что фронт показал подсказку, нельзя —
    # обойти это через любой HTTP-клиент дело двух минут.
    possible_duplicate = models.BooleanField(
        default=False, db_index=True, verbose_name='Похоже на дубль'
    )
    # Название или адрес не прошли проверку на осмысленность: «asdfgh», «12345».
    looks_suspicious = models.BooleanField(
        default=False, db_index=True, verbose_name='Подозрительный ввод'
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Пост'
        verbose_name_plural = 'Посты'
        base_manager_name = 'all_objects'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['-created_at']),
            models.Index(fields=['status', '-created_at']),
            # Основной запрос ленты: город + статус, свежие сверху.
            models.Index(fields=['normalized_city', 'status', '-created_at']),
        ]

    def __str__(self):
        author = self.user.username if self.user else 'аноним'
        return f'Пост {self.pk} от {author}'

    def save(self, *args, **kwargs):
        """
        Город проставляется один раз — при создании, из профиля автора.

        Дальше он живёт своей жизнью: автор переезжает, меняет город в
        настройках, правит этот же пост — город поста не двигается. Поэтому
        берём его только для новой записи.
        """
        if self._state.adding and not self.city and self.user_id:
            self.city = self.user.city or ''
        self.normalized_city = normalize_name(self.city)
        super().save(*args, **kwargs)

    @property
    def is_editable(self):
        """Одобренный пост не редактируется — его можно только удалить."""
        return self.status in (self.STATUS_PENDING, self.STATUS_REJECTED)

    @property
    def creates_new_menu_item(self):
        """Заявка на новую позицию: модератору это надо показать отдельно."""
        return self.menu_item_id is None and bool(self.draft_menu_item_name)

    @property
    def restaurant(self):
        """Заведение выводится из позиции, отдельно не хранится — иначе разъедется."""
        return self.menu_item.restaurant if self.menu_item_id else None


class PostTag(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE)
    tag = models.ForeignKey(Tag, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Тег поста'
        verbose_name_plural = 'Теги постов'
        constraints = [
            models.UniqueConstraint(fields=['post', 'tag'], name='posttag_unique_post_tag'),
        ]
        indexes = [
            models.Index(fields=['-created_at']),
        ]


class PostImage(models.Model):
    """Фотография поста. При удалении поста файл с диска не стирается — храним всё."""

    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to='post_images/')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Фото поста'
        verbose_name_plural = 'Фото постов'
        ordering = ['uploaded_at']

    def _strip_exif(self):
        """Пересохраняет изображение без EXIF-метаданных (включая GPS)."""
        if not self.image:
            return
        img = Image.open(self.image)
        fmt = img.format or 'JPEG'
        buf = BytesIO()
        save_kwargs = {'format': fmt, 'optimize': True}
        if fmt == 'JPEG':
            # JPEG не поддерживает прозрачность — конвертируем RGBA→RGB
            if img.mode == 'RGBA':
                img = img.convert('RGB')
            save_kwargs['quality'] = 85
            save_kwargs['exif'] = b''
        elif fmt == 'PNG':
            save_kwargs['pnginfo'] = None
        elif fmt == 'WEBP':
            save_kwargs['quality'] = 85
        img.save(buf, **save_kwargs)
        buf.seek(0)
        content_type = Image.MIME.get(fmt, getattr(self.image.file, 'content_type', 'image/jpeg'))
        self.image = InMemoryUploadedFile(
            buf, 'ImageField', self.image.name, content_type,
            sys.getsizeof(buf), None,
        )

    def save(self, *args, **kwargs):
        # Стрипаем EXIF только при первом сохранении (pk ещё нет)
        if not self.pk and self.image:
            try:
                self._strip_exif()
            except Exception:
                pass  # не падаем на битых/неподдерживаемых файлах
        super().save(*args, **kwargs)


class PostStatistics(models.Model):
    """Счётчики вовлечённости поста. Обновляются сигналами атомарно через F()."""

    post = models.OneToOneField(Post, on_delete=models.CASCADE, related_name='statistics')
    likes_count = models.PositiveIntegerField(default=0, verbose_name='Лайки')
    saves_count = models.PositiveIntegerField(default=0, verbose_name='Сохранения')
    comments_count = models.PositiveIntegerField(default=0, verbose_name='Комментарии')

    class Meta:
        verbose_name = 'Статистика поста'
        verbose_name_plural = 'Статистика постов'


# ---------------------------------------------------------------------------
# Вовлечённость
# ---------------------------------------------------------------------------

class PostLike(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='likes')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='liked_posts'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Лайк'
        verbose_name_plural = 'Лайки'
        constraints = [
            models.UniqueConstraint(fields=['post', 'user'], name='postlike_unique_post_user'),
        ]
        indexes = [
            models.Index(fields=['-created_at']),
        ]


class PostSave(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='saves')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='saved_posts'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Сохранение'
        verbose_name_plural = 'Сохранения'
        constraints = [
            models.UniqueConstraint(fields=['post', 'user'], name='postsave_unique_post_user'),
        ]
        indexes = [
            models.Index(fields=['-created_at']),
        ]


class Comment(SoftDeleteModel):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='comments', verbose_name='Пост')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='comments', verbose_name='Автор'
    )
    text = models.TextField(verbose_name='Текст комментария')
    # Ветка ответов ровно одного уровня, как в ютубе: ответ на ответ
    # прикрепляется к тому же корневому комментарию, а не уезжает вглубь.
    # Иначе на узком экране третий уровень уже некуда сдвигать.
    parent = models.ForeignKey(
        'self', on_delete=models.CASCADE, null=True, blank=True,
        related_name='replies', verbose_name='Ответ на комментарий',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Время публикации')

    class Meta:
        verbose_name = 'Комментарий'
        verbose_name_plural = 'Комментарии'
        base_manager_name = 'all_objects'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['-created_at']),
            # Ветка комментария: список ответов запрашивается отдельно.
            models.Index(fields=['parent', 'created_at']),
        ]

    def __str__(self):
        author = self.user.username if self.user else 'аноним'
        return f'Комментарий {self.pk} от {author}'

    def save(self, *args, **kwargs):
        # Уровень всегда один: отвечая на ответ, попадаем в ту же ветку.
        if self.parent_id and self.parent.parent_id:
            self.parent = self.parent.parent
        super().save(*args, **kwargs)


class CommentLike(models.Model):
    comment = models.ForeignKey(Comment, on_delete=models.CASCADE, related_name='likes')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='liked_comments'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Лайк комментария'
        verbose_name_plural = 'Лайки комментариев'
        constraints = [
            models.UniqueConstraint(fields=['comment', 'user'], name='commentlike_unique_comment_user'),
        ]
        indexes = [
            models.Index(fields=['-created_at']),
        ]


# ---------------------------------------------------------------------------
# Обратная связь для модерации
# ---------------------------------------------------------------------------

class MenuItemReport(models.Model):
    """Жалоба «в позиции ошибка»: не та кухня, кривое название, не та цена."""

    STATUS_NEW = 'new'
    STATUS_RESOLVED = 'resolved'
    STATUS_DECLINED = 'declined'
    STATUS_CHOICES = [
        (STATUS_NEW, 'Новая'),
        (STATUS_RESOLVED, 'Исправлено'),
        (STATUS_DECLINED, 'Отклонена'),
    ]

    menu_item = models.ForeignKey(
        MenuItem, on_delete=models.CASCADE, related_name='reports', verbose_name='Позиция'
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='menu_item_reports', verbose_name='Автор жалобы'
    )
    text = models.TextField(verbose_name='Что не так')
    status = models.CharField(
        max_length=16, choices=STATUS_CHOICES, default=STATUS_NEW, db_index=True, verbose_name='Статус'
    )
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='resolved_menu_item_reports', verbose_name='Разобрал'
    )
    resolved_at = models.DateTimeField(null=True, blank=True, verbose_name='Дата разбора')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Жалоба на позицию'
        verbose_name_plural = 'Жалобы на позиции'
        ordering = ['-created_at']
