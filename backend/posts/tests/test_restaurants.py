"""
Справочник заведений: нормализация, склейка дублей, слияние, подтверждение.

Справочник целиком наш, поэтому за дубли и выдуманные места отвечаем мы —
и именно эти проверки ломать больнее всего.
"""

import pytest

from posts.models import MenuItem, Restaurant, RestaurantAlias, normalize_address, normalize_name
from posts.services.restaurants import (
    find_exact, find_possible_duplicates, get_or_create_restaurant, merge_restaurants,
    recalculate_restaurant_stats, search_restaurants,
)


class TestAddressNormalization:
    """«ул. Пушкина, д. 10» и «Пушкина 10» — один адрес, иначе будут два заведения."""

    @pytest.mark.parametrize('address', [
        'ул. Пушкина, д. 10',
        'улица Пушкина 10',
        'Пушкина, 10',
        'УЛ ПУШКИНА Д.10',
        'Пушкина 10',
        '10 Пушкина',
    ])
    def test_variants_collapse_to_one_key(self, address):
        assert normalize_address(address) == '10 пушкина'

    def test_street_type_distinguishes_addresses(self):
        """
        «Улица» отбрасывается — её опускают постоянно. А «проспект» и «переулок»
        нет: склеить «улицу Ленина» с «проспектом Ленина» хуже, чем оставить дубль.
        """
        assert normalize_address('улица Ленина 10') != normalize_address('проспект Ленина 10')
        assert normalize_address('проспект Ленина 10') == normalize_address('пр-т Ленина 10')
        assert normalize_address('переулок Ленина 10') != normalize_address('улица Ленина 10')

    def test_name_normalization_ignores_case_punctuation_and_yo(self):
        assert normalize_name('Чиз Бургер!') == normalize_name('чиз  бургер')
        assert normalize_name('Тёплый') == normalize_name('Теплый')


@pytest.mark.django_db
class TestDeduplication:
    def test_same_place_written_differently_is_one_record(self, restaurant):
        found = find_exact('Кофемания', 'Пушкина 10', 'Москва')
        assert found == restaurant

    def test_get_or_create_does_not_duplicate(self, restaurant):
        again, created = get_or_create_restaurant(
            name='Кофемания', address='улица Пушкина 10', city='Москва',
        )
        assert again == restaurant
        assert created is False
        assert Restaurant.objects.count() == 1

    def test_same_name_different_address_are_different_places(self, restaurant):
        """Пятьдесят «Шоколадниц» на разных улицах — пятьдесят заведений."""
        other, created = get_or_create_restaurant(
            name='Кофемания', address='Тверская 25', city='Москва',
        )
        assert created is True
        assert other != restaurant

    def test_same_address_different_city_are_different_places(self, restaurant):
        other, created = get_or_create_restaurant(
            name='Кофемания', address='Пушкина 10', city='Казань',
        )
        assert created is True
        assert Restaurant.objects.count() == 2

    def test_similar_name_and_address_flagged_as_duplicate(self, restaurant):
        assert find_possible_duplicates('Кафе Кофемания', 'Пушкина 10', 'Москва').exists()

    def test_similar_name_but_far_address_is_not_duplicate(self, restaurant):
        assert not find_possible_duplicates('Кофемания', 'Тверская 25', 'Москва').exists()


@pytest.mark.django_db
class TestSuggestions:
    def test_search_finds_by_typo(self, restaurant):
        assert restaurant in search_restaurants('кафемания', city='Москва')

    def test_search_finds_by_prefix(self, restaurant):
        assert restaurant in search_restaurants('кофе', city='Москва')

    def test_search_ignores_other_cities(self, restaurant):
        assert restaurant not in search_restaurants('Кофемания', city='Казань')


@pytest.mark.django_db
class TestConfirmation:
    """
    Заведение подтверждается, когда о нём написали двое разных людей.
    Выдуманное место так и остаётся с одним постом и в каталог не попадает.
    """

    def test_new_restaurant_is_not_confirmed(self, restaurant):
        assert restaurant.is_confirmed is False

    def test_two_different_authors_confirm(self, restaurant, author, other_author,
                                           make_post, moderator):
        from posts.services.moderation import approve_post

        approve_post(make_post(author, restaurant=restaurant), moderator)
        restaurant.refresh_from_db()
        assert restaurant.is_confirmed is False, 'одного автора мало'

        approve_post(make_post(other_author, restaurant=restaurant, item='Латте'), moderator)
        restaurant.refresh_from_db()
        assert restaurant.is_confirmed is True

    def test_same_author_twice_does_not_confirm(self, restaurant, author, make_post, moderator):
        from posts.services.moderation import approve_post

        approve_post(make_post(author, restaurant=restaurant), moderator)
        approve_post(make_post(author, restaurant=restaurant, item='Латте'), moderator)
        recalculate_restaurant_stats(restaurant)
        restaurant.refresh_from_db()
        assert restaurant.contributors_count == 1
        assert restaurant.is_confirmed is False


@pytest.mark.django_db
class TestMerge:
    """
    Слияние удаляет дубль по-настоящему: ценность заведения в его позициях
    и постах, а они переезжают. Но написание остаётся синонимом — так каждое
    слияние учит поиск.
    """

    def test_duplicate_record_is_deleted(self, restaurant):
        duplicate = Restaurant.objects.create(
            name='Кафе Кофемания', address='Пушкина 10к1', city='Москва',
        )
        merge_restaurants(duplicate, restaurant)
        assert not Restaurant.objects.filter(pk=duplicate.pk).exists()
        assert Restaurant.objects.count() == 1

    def test_spelling_is_kept_as_alias_and_found_by_search(self, restaurant):
        duplicate = Restaurant.objects.create(
            name='Кафе Кофемания', address='Пушкина 10к1', city='Москва',
        )
        merge_restaurants(duplicate, restaurant)

        assert RestaurantAlias.objects.filter(restaurant=restaurant,
                                              name='Кафе Кофемания').exists()
        assert restaurant in search_restaurants('Кафе Кофемания', city='Москва')

    def test_menu_items_move_to_survivor(self, restaurant):
        duplicate = Restaurant.objects.create(
            name='Кафе Кофемания', address='Пушкина 10к1', city='Москва',
        )
        MenuItem.objects.create(restaurant=duplicate, name='Латте')
        merge_restaurants(duplicate, restaurant)

        assert MenuItem.objects.filter(restaurant=restaurant, name='Латте').exists()

    def test_same_named_items_are_merged_together(self, restaurant):
        """У выжившего уже есть такое блюдо — сливаются и позиции тоже."""
        duplicate = Restaurant.objects.create(
            name='Кафе Кофемания', address='Пушкина 10к1', city='Москва',
        )
        MenuItem.objects.create(restaurant=restaurant, name='Латте')
        MenuItem.objects.create(restaurant=duplicate, name='латте')

        merge_restaurants(duplicate, restaurant)
        assert MenuItem.objects.filter(restaurant=restaurant).count() == 1


@pytest.mark.django_db
class TestRestaurantApiVisibility:
    """
    Неподтверждённое заведение не всплывает в выдаче, но открывается по ссылке:
    на него ведёт карточка уже опубликованного поста.
    """

    URL = '/api/v1/restaurants/'

    def test_unconfirmed_is_hidden_from_list(self, api_client, restaurant):
        assert api_client.get(self.URL).data['count'] == 0

    def test_unconfirmed_opens_by_direct_link(self, api_client, restaurant):
        response = api_client.get(f'{self.URL}{restaurant.id}/')

        assert response.status_code == 200
        assert response.data['name'] == 'Кофемания'

    def test_confirmed_appears_in_list(self, api_client, restaurant):
        restaurant.contributors_count = Restaurant.CONFIRMATIONS_REQUIRED
        restaurant.save(update_fields=['contributors_count'])

        assert api_client.get(self.URL).data['count'] == 1

    def test_hidden_by_moderator_is_not_available_at_all(self, api_client, restaurant):
        restaurant.is_hidden = True
        restaurant.save(update_fields=['is_hidden'])

        assert api_client.get(f'{self.URL}{restaurant.id}/').status_code == 404
