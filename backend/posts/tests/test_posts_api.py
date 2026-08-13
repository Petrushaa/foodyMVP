"""
API постов: создание, лимиты, серверные проверки, редактирование и удаление.

Отдельно проверяем то, что легко обойти через голый HTTP-клиент мимо интерфейса:
дубли заведений и мусорный ввод ловит сервер, а не форма.
"""

import pytest

from posts.models import MAX_POSTS_PER_DAY, MAX_TAGS_PER_POST, Post, Restaurant
from posts.services.moderation import approve_post

POSTS_URL = '/api/v1/posts/'


def payload(**overrides):
    data = {
        'restaurant_name': 'Бургерная',
        'restaurant_address': 'Тверская 15',
        'restaurant_city': 'Москва',
        'menu_item_name': 'Чизбургер',
        'author_rating': 8,
        'price': 350,
    }
    data.update(overrides)
    return data


@pytest.mark.django_db
class TestCreate:
    def test_creates_pending_post_without_catalog(self, auth_client, burger):
        response = auth_client.post(POSTS_URL, payload(dish_type_id=burger.id))

        assert response.status_code == 201
        assert response.data['status'] == 'pending'
        assert response.data['menu_item'] is None
        assert Restaurant.objects.count() == 0, 'каталог создаётся только при одобрении'

    def test_requires_dish_type_for_new_item(self, auth_client):
        response = auth_client.post(POSTS_URL, payload())
        assert response.status_code == 400

    def test_requires_price_for_new_item(self, auth_client, burger):
        response = auth_client.post(POSTS_URL, payload(dish_type_id=burger.id, price=''))
        assert response.status_code == 400

    def test_requires_address_and_city(self, auth_client, burger):
        response = auth_client.post(
            POSTS_URL, payload(dish_type_id=burger.id, restaurant_address=''),
        )
        assert response.status_code == 400

    def test_anonymous_cannot_create(self, api_client, burger):
        response = api_client.post(POSTS_URL, payload(dish_type_id=burger.id))
        assert response.status_code in (401, 403)


@pytest.mark.django_db
class TestServerSideChecks:
    """Обойти интерфейс легко, поэтому проверяет сервер."""

    def test_duplicate_restaurant_is_flagged(self, auth_client, burger, restaurant):
        auth_client.post(POSTS_URL, payload(
            dish_type_id=burger.id,
            restaurant_name='Кафе Кофемания',
            restaurant_address='Пушкина 10',
        ))
        post = Post.objects.get()
        assert post.possible_duplicate is True

    def test_honest_post_is_not_flagged(self, auth_client, burger, restaurant):
        auth_client.post(POSTS_URL, payload(dish_type_id=burger.id))
        post = Post.objects.get()
        assert post.possible_duplicate is False

    def test_exact_match_attaches_to_existing_restaurant(self, auth_client, burger, restaurant):
        """Полное совпадение — молча привязываем, дубль даже не создаётся."""
        auth_client.post(POSTS_URL, payload(
            dish_type_id=burger.id,
            restaurant_name='Кофемания',
            restaurant_address='улица Пушкина 10',
        ))
        post = Post.objects.get()
        assert post.draft_restaurant == restaurant

    def test_keyboard_mash_is_flagged(self, auth_client, burger):
        auth_client.post(POSTS_URL, payload(
            dish_type_id=burger.id, restaurant_name='asdfgh', restaurant_address='12345',
        ))
        assert Post.objects.get().looks_suspicious is True

    def test_name_without_letters_is_rejected(self, auth_client, burger):
        response = auth_client.post(POSTS_URL, payload(
            dish_type_id=burger.id, menu_item_name='!!!',
        ))
        assert response.status_code == 400

    def test_real_names_are_not_flagged(self, auth_client, burger):
        auth_client.post(POSTS_URL, payload(
            dish_type_id=burger.id, restaurant_name='Кафе XYZ', menu_item_name='Му-Му',
        ))
        assert Post.objects.get().looks_suspicious is False


@pytest.mark.django_db
class TestLimits:
    def test_tags_are_limited(self, auth_client, burger):
        response = auth_client.post(POSTS_URL, payload(
            dish_type_id=burger.id,
            tags_list=[f'тег{i}' for i in range(MAX_TAGS_PER_POST + 1)],
        ))
        assert response.status_code == 400

    def test_duplicate_tags_collapse_before_limit(self, auth_client, burger):
        """«Пицца» и «пицца» не должны съедать две позиции из десяти."""
        response = auth_client.post(POSTS_URL, payload(
            dish_type_id=burger.id, tags_list=['Пицца', 'пицца', '#ПИЦЦА'],
        ))
        assert response.status_code == 201
        assert Post.objects.get().tags.count() == 1

    def test_daily_limit(self, auth_client, author, burger, make_post):
        for _ in range(MAX_POSTS_PER_DAY):
            make_post(author)

        response = auth_client.post(POSTS_URL, payload(dish_type_id=burger.id))
        assert response.status_code == 400

    def test_deleted_posts_still_count_toward_daily_limit(self, auth_client, author,
                                                          burger, make_post):
        """Иначе лимит обходится удалением своих же постов."""
        for _ in range(MAX_POSTS_PER_DAY):
            make_post(author).delete()

        response = auth_client.post(POSTS_URL, payload(dish_type_id=burger.id))
        assert response.status_code == 400


@pytest.mark.django_db
class TestEditAndDelete:
    def test_approved_post_cannot_be_edited(self, auth_client, author, moderator, make_post):
        post = approve_post(make_post(author), moderator)

        response = auth_client.patch(f'{POSTS_URL}{post.id}/', {'description': 'правка'})
        assert response.status_code == 403

    def test_pending_post_can_be_edited(self, auth_client, author, make_post):
        post = make_post(author)
        response = auth_client.patch(f'{POSTS_URL}{post.id}/', {'description': 'исправил'})

        assert response.status_code == 200
        post.refresh_from_db()
        assert post.description == 'исправил'

    def test_rejected_post_returns_to_moderation_after_edit(self, auth_client, author,
                                                            moderator, make_post):
        from posts.services.moderation import reject_post

        post = reject_post(make_post(author), moderator, 'не то')
        auth_client.patch(f'{POSTS_URL}{post.id}/', {'description': 'исправил'})

        post.refresh_from_db()
        assert post.status == Post.STATUS_PENDING
        assert post.rejection_reason == ''

    def test_delete_is_soft(self, auth_client, author, moderator, make_post):
        post = approve_post(make_post(author), moderator)

        assert auth_client.delete(f'{POSTS_URL}{post.id}/').status_code == 204
        assert not Post.objects.filter(pk=post.pk).exists(), 'из выдачи пропал'
        assert Post.all_objects.filter(pk=post.pk).exists(), 'в базе остался'

    def test_cannot_delete_other_users_visible_post(self, api_client, other_author, author,
                                                    moderator, make_post):
        post = approve_post(make_post(author), moderator)
        api_client.force_authenticate(other_author)

        assert api_client.delete(f'{POSTS_URL}{post.id}/').status_code == 403

    def test_other_users_pending_post_is_not_even_visible(self, api_client, other_author,
                                                          author, make_post):
        """
        Не 403, а 404 — и это правильнее: посторонний не должен узнать даже того,
        что такой пост существует.
        """
        post = make_post(author)
        api_client.force_authenticate(other_author)

        assert api_client.delete(f'{POSTS_URL}{post.id}/').status_code == 404


@pytest.mark.django_db
class TestVisibility:
    def test_guest_sees_only_approved(self, api_client, author, moderator, make_post):
        approve_post(make_post(author), moderator)
        make_post(author, item='На модерации')

        response = api_client.get(POSTS_URL)
        assert response.status_code == 200
        assert response.data['count'] == 1

    def test_own_pending_is_not_in_common_feed(self, auth_client, author, make_post):
        """Неодобренный пост не должен лезть в общую ленту даже своему автору."""
        make_post(author)
        assert auth_client.get(POSTS_URL).data['count'] == 0

    def test_author_sees_own_pending_in_profile(self, auth_client, author, make_post):
        make_post(author)
        assert auth_client.get(f'{POSTS_URL}?author=me').data['count'] == 1

    def test_staff_does_not_see_pending_in_common_feed(self, api_client, moderator, author,
                                                       make_post):
        """Сотруднику очередь показывает /moderation/, а не лента."""
        make_post(author)
        api_client.force_authenticate(moderator)
        assert api_client.get(POSTS_URL).data['count'] == 0

    def test_author_opens_own_pending_by_direct_link(self, auth_client, author, make_post):
        post = make_post(author)
        assert auth_client.get(f'{POSTS_URL}{post.id}/').status_code == 200

    def test_others_pending_posts_are_hidden(self, api_client, other_author, author, make_post):
        make_post(author)
        api_client.force_authenticate(other_author)

        assert api_client.get(POSTS_URL).data['count'] == 0


@pytest.mark.django_db
class TestSearchAndFilters:
    """
    Страница результатов шлёт эти параметры — без поддержки на сервере она
    молча отдавала всю ленту на любой запрос.
    """

    def _approved(self, make_post, author, moderator, **kwargs):
        return approve_post(make_post(author, **kwargs), moderator)

    def test_search_finds_by_dish_name(self, api_client, author, moderator, make_post):
        self._approved(make_post, author, moderator, item='Чизбургер')
        self._approved(make_post, author, moderator, item='Борщ',
                       restaurant_name='Столовая', address='Мира 3')

        response = api_client.get(f'{POSTS_URL}?search=чизбург')

        assert response.data['count'] == 1
        assert response.data['results'][0]['menu_item']['name'] == 'Чизбургер'

    def test_search_finds_by_restaurant_name(self, api_client, author, moderator, make_post):
        self._approved(make_post, author, moderator, restaurant_name='Бургерная')
        self._approved(make_post, author, moderator, item='Борщ',
                       restaurant_name='Столовая', address='Мира 3')

        assert api_client.get(f'{POSTS_URL}?search=столов').data['count'] == 1

    def test_search_without_matches_returns_nothing(self, api_client, author, moderator,
                                                     make_post):
        """Раньше бессмысленный запрос возвращал всю ленту."""
        self._approved(make_post, author, moderator)

        assert api_client.get(f'{POSTS_URL}?search=щщщыыыъъъ').data['count'] == 0

    def test_search_does_not_duplicate_post_with_many_tags(self, api_client, author,
                                                            moderator, make_post):
        post = self._approved(make_post, author, moderator, item='Пицца пепперони')
        post.tags.create(name='пицца')

        response = api_client.get(f'{POSTS_URL}?search=пицца')
        assert response.data['count'] == 1

    def test_filter_by_tag_name(self, api_client, author, moderator, make_post):
        post = self._approved(make_post, author, moderator)
        post.tags.create(name='остро')
        self._approved(make_post, author, moderator, item='Борщ',
                       restaurant_name='Столовая', address='Мира 3')

        assert api_client.get(f'{POSTS_URL}?tag_name=остро').data['count'] == 1
        assert api_client.get(f'{POSTS_URL}?tag_name=%23остро').data['count'] == 1, 'решётку срезаем'

    def test_filter_by_price_range(self, api_client, author, moderator, make_post):
        self._approved(make_post, author, moderator, price=200)
        self._approved(make_post, author, moderator, item='Стейк',
                       restaurant_name='Мясная', address='Мира 3', price=1500)

        assert api_client.get(f'{POSTS_URL}?price_max=500').data['count'] == 1
        assert api_client.get(f'{POSTS_URL}?price_min=1000').data['count'] == 1
        assert api_client.get(f'{POSTS_URL}?price_min=100&price_max=2000').data['count'] == 2

    def test_broken_price_is_ignored_not_500(self, api_client, author, moderator, make_post):
        self._approved(make_post, author, moderator)

        response = api_client.get(f'{POSTS_URL}?price_min=дорого')

        assert response.status_code == 200
        assert response.data['count'] == 1

    def test_filter_by_category(self, api_client, author, moderator, make_post):
        post = self._approved(make_post, author, moderator)
        taxon = post.menu_item.taxons.first()

        assert api_client.get(f'{POSTS_URL}?category_id={taxon.id}').data['count'] == 1
        assert api_client.get(f'{POSTS_URL}?category_id=999999').data['count'] == 0

    def test_filters_do_not_expose_pending_posts(self, api_client, author, make_post):
        """Фильтр не должен становиться лазейкой в чужую модерацию."""
        make_post(author, item='Секретный чизбургер')

        assert api_client.get(f'{POSTS_URL}?search=секретный').data['count'] == 0
