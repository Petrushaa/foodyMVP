"""Общие фикстуры для тестов приложения posts."""

import pytest
from django.contrib.auth import get_user_model

from posts.models import DishType, Post, Restaurant

User = get_user_model()


@pytest.fixture
def author(db):
    return User.objects.create_user('author', 'author@test.ru', 'pass12345')


@pytest.fixture
def other_author(db):
    return User.objects.create_user('other', 'other@test.ru', 'pass12345')


@pytest.fixture
def moderator(db):
    return User.objects.create_user('moder', 'moder@test.ru', 'pass12345', is_staff=True)


@pytest.fixture
def burger(db):
    """Тип блюда из справочника — он наполняется миграцией с данными."""
    return DishType.objects.get(name='Бургер')


@pytest.fixture
def restaurant(db):
    return Restaurant.objects.create(
        name='Кофемания', address='ул. Пушкина, д. 10', city='Москва',
    )


@pytest.fixture
def make_post(burger):
    """
    Создаёт пост-заявку так же, как это делает сериализатор.

    По умолчанию — заявка на новое заведение и новую позицию: это самый сложный
    случай, через него проходит вся логика создания каталога.
    """
    def _make(user, *, restaurant=None, restaurant_name='Бургерная',
              address='Тверская 15', city='Москва', item='Чизбургер',
              rating=8.0, price=350, menu_item=None):
        post = Post.objects.create(
            user=user,
            author_rating=rating,
            description='вкусно',
            menu_item=menu_item,
            draft_restaurant=restaurant,
            draft_menu_item_name='' if menu_item else item,
            draft_restaurant_name='' if (restaurant or menu_item) else restaurant_name,
            draft_restaurant_address='' if (restaurant or menu_item) else address,
            draft_restaurant_city='' if (restaurant or menu_item) else city,
            draft_dish_type=None if menu_item else burger,
            proposed_price=price,
            proposed_price_status=(
                Post.PRICE_PROPOSAL_PENDING if (price and menu_item) else Post.PRICE_PROPOSAL_NONE
            ),
        )
        if not menu_item:
            post.draft_taxons.set(burger.default_taxons.all())
        return post

    return _make


@pytest.fixture
def api_client():
    from rest_framework.test import APIClient
    return APIClient()


@pytest.fixture
def auth_client(api_client, author):
    api_client.force_authenticate(author)
    return api_client


@pytest.fixture
def image_file():
    """
    Настоящий PNG в памяти: PostImage при сохранении открывает файл через Pillow,
    чтобы срезать EXIF, и на подделке из пары байт падает.
    """
    from io import BytesIO

    from django.core.files.uploadedfile import SimpleUploadedFile
    from PIL import Image

    buffer = BytesIO()
    Image.new('RGB', (4, 4), 'white').save(buffer, format='PNG')
    return SimpleUploadedFile('dish.png', buffer.getvalue(), content_type='image/png')
