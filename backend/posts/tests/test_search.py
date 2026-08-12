"""
Умный поиск позиций: опечатки, синонимы, латиница и неверная раскладка.

Всё считает PostgreSQL — триграммы плюс несколько преобразований запроса.
"""

import pytest

from posts.models import MenuItem, MenuItemAlias
from posts.services.search import fix_layout, search_menu_items, transliterate


class TestQueryTransforms:
    @pytest.mark.parametrize('typed,expected', [
        (',ehuth', 'бургер'),
        ('ifehvf', 'шаурма'),
        ('gbwwf', 'пицца'),
    ])
    def test_wrong_keyboard_layout(self, typed, expected):
        assert fix_layout(typed) == expected

    @pytest.mark.parametrize('latin,expected', [
        ('burger', 'бургер'),
        ('shaurma', 'шаурма'),
        ('borsch', 'борщ'),
    ])
    def test_transliteration(self, latin, expected):
        assert transliterate(latin) == expected


@pytest.fixture
def cheeseburger(db, restaurant):
    item = MenuItem.objects.create(restaurant=restaurant, name='Чиз Бургер')
    # Поиск при создании поста смотрит и на позиции без постов — иначе человек
    # не найдёт вчера созданную и заведёт дубль.
    return item


@pytest.mark.django_db
class TestSearch:
    def test_exact_name(self, cheeseburger):
        assert cheeseburger in search_menu_items('Чиз Бургер', include_empty=True)

    def test_ignores_case_and_punctuation(self, cheeseburger):
        assert cheeseburger in search_menu_items('чиз бургер!', include_empty=True)

    def test_typo(self, cheeseburger):
        assert cheeseburger in search_menu_items('чиз бургир', include_empty=True)

    def test_written_together(self, cheeseburger):
        assert cheeseburger in search_menu_items('чизбургер', include_empty=True)

    def test_wrong_layout(self, cheeseburger):
        assert cheeseburger in search_menu_items('xbp ,ehuth', include_empty=True)

    def test_latin(self, cheeseburger):
        assert cheeseburger in search_menu_items('chiz burger', include_empty=True)

    def test_unrelated_query_finds_nothing(self, cheeseburger):
        assert cheeseburger not in search_menu_items('пицца', include_empty=True)

    def test_empty_query_finds_nothing(self, cheeseburger):
        assert not search_menu_items('', include_empty=True)

    def test_alias_leads_to_item(self, cheeseburger):
        """Синоним появляется при слиянии дублей — и учит поиск новому написанию."""
        MenuItemAlias.objects.create(menu_item=cheeseburger, name='Чизбур')
        assert cheeseburger in search_menu_items('Чизбур', include_empty=True)

    def test_public_search_hides_items_without_posts(self, cheeseburger):
        """
        В каталоге позиция без единого видимого поста не показывается,
        хотя при создании поста её найти можно.
        """
        assert cheeseburger not in search_menu_items('Чиз Бургер')
        assert cheeseburger in search_menu_items('Чиз Бургер', include_empty=True)

    def test_restaurant_scope(self, cheeseburger, restaurant):
        from posts.models import Restaurant

        other = Restaurant.objects.create(name='Другое', address='Ленина 1', city='Москва')
        assert cheeseburger not in search_menu_items(
            'Чиз Бургер', restaurant=other, include_empty=True,
        )
        assert cheeseburger in search_menu_items(
            'Чиз Бургер', restaurant=restaurant, include_empty=True,
        )
