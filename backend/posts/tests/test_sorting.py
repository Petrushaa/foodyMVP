"""
Порядок выдачи в поиске позиций.

Человек ищет не «что угодно про шаурму», а ответ на свой вопрос: где дешевле,
где вкуснее, что появилось нового. Один порядок на все вопросы отвечать не может.
"""

import pytest

from posts.models import MenuItem, Restaurant


@pytest.fixture
def catalog(db, burger):
    """Четыре позиции, различающиеся по каждой из осей сортировки."""
    place = Restaurant.objects.create(name='Столовая', address='Ленина 1', city='Москва')
    rows = [
        # имя,        цена,  рейтинг, оценок
        ('Дешёвая',    100,   3.0,     2),
        ('Дорогая',    900,   4.0,     5),
        ('Любимая',    500,   9.0,     1),
        ('Обсуждаемая', 300,  5.0,    40),
    ]
    items = []
    for name, price, rating, count in rows:
        items.append(MenuItem.objects.create(
            restaurant=place, name=name, dish_type=burger, price=price,
            rating=rating, rating_raw=rating, ratings_count=count, posts_count=1,
        ))
    return items


def names(response):
    return [row['name'] for row in response.data['results']]


@pytest.mark.django_db
class TestSortOrder:
    def test_default_is_rating(self, api_client, catalog):
        """Без параметра — как было: лучшее сверху."""
        assert names(api_client.get('/api/v1/menu-items/'))[0] == 'Любимая'

    def test_cheapest_first(self, api_client, catalog):
        assert names(api_client.get('/api/v1/menu-items/?sort=price'))[:2] \
            == ['Дешёвая', 'Обсуждаемая']

    def test_priciest_first(self, api_client, catalog):
        assert names(api_client.get('/api/v1/menu-items/?sort=price_desc'))[0] == 'Дорогая'

    def test_most_reviewed_first(self, api_client, catalog):
        assert names(api_client.get('/api/v1/menu-items/?sort=reviews'))[0] == 'Обсуждаемая'

    def test_newest_first(self, api_client, catalog):
        """Новизна — по появлению позиции в каталоге, а не по постам о ней."""
        assert names(api_client.get('/api/v1/menu-items/?sort=new'))[0] == 'Обсуждаемая'

    def test_unknown_sort_is_ignored(self, api_client, catalog):
        """Мусор в адресной строке не должен отдавать пустую страницу."""
        response = api_client.get('/api/v1/menu-items/?sort=капуста')
        assert response.status_code == 200
        assert names(response)[0] == 'Любимая'


@pytest.mark.django_db
class TestPriceless:
    """
    Позиция без цены не должна возглавлять список «сначала дешёвые».

    Цену подтверждает модератор, и до тех пор её нет. Пустое — не ноль:
    про такую позицию мы не знаем ничего, и в списке по цене ей место в конце
    независимо от направления.
    """

    @pytest.fixture
    def with_gap(self, catalog, burger):
        place = Restaurant.objects.get(name='Столовая')
        MenuItem.objects.create(
            restaurant=place, name='Без цены', dish_type=burger, price=None,
            rating=9.5, rating_raw=9.5, ratings_count=3, posts_count=1,
        )

    def test_priceless_is_last_when_cheapest_first(self, api_client, with_gap):
        assert names(api_client.get('/api/v1/menu-items/?sort=price'))[-1] == 'Без цены'

    def test_priceless_is_last_when_priciest_first(self, api_client, with_gap):
        assert names(api_client.get('/api/v1/menu-items/?sort=price_desc'))[-1] == 'Без цены'


@pytest.mark.django_db
class TestSortWithTextSearch:
    """
    Текстовый поиск имеет свой порядок — по близости к запросу.

    Навязать туда рейтинг значило бы поднять на «шаурма» мало похожее, но
    хорошо оценённое. Поэтому сортировка включается только явно.
    """

    @pytest.fixture
    def shawarmas(self, db, burger):
        place = Restaurant.objects.create(name='Ларёк', address='Мира 3', city='Москва')
        for name, price, rating in [
            ('Шаурма большая', 400, 3.0),
            ('Шаурма маленькая', 150, 9.0),
        ]:
            MenuItem.objects.create(
                restaurant=place, name=name, dish_type=burger, price=price,
                rating=rating, rating_raw=rating, ratings_count=1, posts_count=1,
            )

    def test_search_keeps_own_order_without_sort(self, api_client, shawarmas):
        response = api_client.get('/api/v1/menu-items/?search=шаурма')
        assert len(names(response)) == 2

    def test_sort_applies_over_search_results(self, api_client, shawarmas):
        """И сортирует именно найденное, а не всю базу."""
        found = names(api_client.get('/api/v1/menu-items/?search=шаурма&sort=price'))
        assert found == ['Шаурма маленькая', 'Шаурма большая']
