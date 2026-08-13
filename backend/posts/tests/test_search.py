"""
Умный поиск позиций: опечатки, синонимы, латиница и неверная раскладка.

Всё считает PostgreSQL — триграммы плюс несколько преобразований запроса.
"""

import pytest

from posts.models import MenuItem, MenuItemAlias
from posts.services.moderation import approve_post
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


@pytest.mark.django_db
class TestMenuItemSearchApi:
    """
    Вкладка поиска ищет позиции, а не посты. Выдача сужена городом и фильтрами,
    и поиск работает уже внутри неё.
    """

    URL = '/api/v1/menu-items/'

    def _published(self, make_post, author, moderator, **kwargs):
        return approve_post(make_post(author, **kwargs), moderator).menu_item

    def test_finds_position_by_name(self, api_client, author, moderator, make_post):
        self._published(make_post, author, moderator, item='Чизбургер')

        response = api_client.get(f'{self.URL}?search=чизбургер')

        assert response.data['count'] == 1
        assert response.data['results'][0]['name'] == 'Чизбургер'

    def test_finds_by_typo_and_layout(self, api_client, author, moderator, make_post):
        """Тот же умный поиск, что при создании поста: опечатки и раскладка."""
        self._published(make_post, author, moderator, item='Бургер')

        assert api_client.get(f'{self.URL}?search=бургир').data['count'] == 1
        assert api_client.get(f'{self.URL}?search=,ehuth').data['count'] == 1

    def test_search_is_limited_to_own_city(self, api_client, author, other_author,
                                           moderator, make_post):
        other_author.city = 'Казань'
        other_author.save(update_fields=['city'])
        self._published(make_post, other_author, moderator, item='Чизбургер',
                        restaurant_name='Казанская', address='Баумана 1', city='Казань')

        api_client.force_authenticate(author)  # Москва
        assert api_client.get(f'{self.URL}?search=чизбургер').data['count'] == 0

    def test_guest_sees_every_city(self, api_client, author, moderator, make_post):
        self._published(make_post, author, moderator, item='Чизбургер')

        assert api_client.get(f'{self.URL}?search=чизбургер').data['count'] == 1

    def test_price_filter_narrows_search(self, api_client, author, moderator, make_post):
        self._published(make_post, author, moderator, item='Чизбургер', price=200)

        assert api_client.get(f'{self.URL}?search=чизбургер&price_max=100').data['count'] == 0
        assert api_client.get(f'{self.URL}?search=чизбургер&price_min=100').data['count'] == 1

    def test_category_filter_narrows_search(self, api_client, author, moderator, make_post):
        item = self._published(make_post, author, moderator, item='Чизбургер')
        taxon = item.taxons.first()

        assert api_client.get(f'{self.URL}?category_id={taxon.id}').data['count'] == 1
        assert api_client.get(f'{self.URL}?category_id=999999').data['count'] == 0

    def test_results_carry_photo_and_price(self, api_client, author, moderator, make_post):
        """Плитке нужны фото, цена и оценка — иначе её нечем рисовать."""
        self._published(make_post, author, moderator, item='Чизбургер', price=350)

        item = api_client.get(f'{self.URL}?search=чизбургер').data['results'][0]
        assert 'photo' in item and item['price'] == '350.00'
        assert 'rating_raw' in item and 'restaurant' in item

    def test_nothing_found_returns_empty(self, api_client, author, moderator, make_post):
        self._published(make_post, author, moderator, item='Чизбургер')

        assert api_client.get(f'{self.URL}?search=щщыыъъ').data['count'] == 0


@pytest.mark.django_db
class TestMenuItemPage:
    """Страница позиции: открывается по ссылке, в том числе из другого города."""

    URL = '/api/v1/menu-items/'

    def test_detail_opens_from_another_city(self, api_client, author, other_author,
                                            moderator, make_post):
        item = approve_post(make_post(author), moderator).menu_item  # Москва
        other_author.city = 'Казань'
        other_author.save(update_fields=['city'])
        api_client.force_authenticate(other_author)

        response = api_client.get(f'{self.URL}{item.id}/')

        assert response.status_code == 200, 'по ссылке позиция открывается всегда'
        assert response.data['name'] == item.name
        assert api_client.get(self.URL).data['count'] == 0, 'но в выдаче её нет'

    def test_detail_carries_page_data(self, api_client, author, moderator, make_post):
        item = approve_post(make_post(author, price=350), moderator).menu_item

        data = api_client.get(f'{self.URL}{item.id}/').data

        assert data['restaurant']['name'] and data['dish_type']
        assert data['price'] == '350.00'
        assert 'tags' in data and 'brand_rating' in data

    def test_posts_of_item_open_from_another_city(self, api_client, author, other_author,
                                                  moderator, make_post):
        item = approve_post(make_post(author), moderator).menu_item
        other_author.city = 'Казань'
        other_author.save(update_fields=['city'])
        api_client.force_authenticate(other_author)

        response = api_client.get(f'{self.URL}{item.id}/posts/')

        assert response.status_code == 200
        assert response.data['count'] == 1
