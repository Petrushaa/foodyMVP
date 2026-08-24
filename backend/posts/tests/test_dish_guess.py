"""
Блюдо угадывается системой, а не выбирается автором.

На неполном каталоге выбор из списка означал бы, что человек постоянно упирается
в «моего блюда нет». Поэтому блюдо необязательное, система предполагает его по
названию позиции, а модератор подтверждает или меняет.
"""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from posts.models import DishType, Post, Taxon
from posts.services.moderation import approve_post
from posts.services.search import guess_dish_type


@pytest.fixture
def api_client():
    return APIClient()


@pytest.mark.django_db
class TestGuess:
    def test_exact_name(self):
        assert guess_dish_type('Шаурма').name == 'Шаурма'

    def test_dish_inside_longer_name(self):
        """«Шаурма классическая» — это всё ещё шаурма."""
        assert guess_dish_type('Шаурма классическая').name == 'Шаурма'

    def test_typo(self):
        assert guess_dish_type('Шаурам').name == 'Шаурма'

    def test_longer_dish_wins(self):
        """
        «Салат Цезарь» не должен проиграть «Салату», если тот появится в
        справочнике: побеждает более длинное совпадение, иначе точное блюдо
        подменяется общим.
        """
        assert guess_dish_type('Салат Цезарь с креветками').name == 'Салат Цезарь'

    def test_nothing_similar_gives_nothing(self):
        """
        Нишевая еда остаётся без блюда — это нормальный исход, а не ошибка:
        витрины для неё нет, находится поиском.
        """
        assert guess_dish_type('Цзяньбин') is None

    def test_empty_name(self):
        assert guess_dish_type('') is None
        assert guess_dish_type(None) is None


@pytest.mark.django_db
class TestCreateWithoutDish:
    def _payload(self, **over):
        data = {
            'restaurant_name': 'Шаурмечная',
            'restaurant_address': 'Ленина 5',
            'restaurant_city': 'Москва',
            'menu_item_name': 'Шаурма классическая',
            'author_rating': 8,
            'price': '250',
            'description': 'вкусно',
        }
        data.update(over)
        return data

    def test_post_created_without_choosing_dish(self, api_client, author):
        api_client.force_authenticate(author)
        resp = api_client.post(reverse('post-list'), self._payload(), format='json')

        assert resp.status_code == 201, resp.data
        post = Post.objects.get(id=resp.data['id'])
        # Автор блюдо не присылал — система вывела его из названия позиции.
        assert post.draft_dish_type.name == 'Шаурма'

    def test_unknown_dish_leaves_it_empty(self, api_client, author):
        api_client.force_authenticate(author)
        resp = api_client.post(
            reverse('post-list'), self._payload(menu_item_name='Цзяньбин'), format='json',
        )

        assert resp.status_code == 201, resp.data
        assert Post.objects.get(id=resp.data['id']).draft_dish_type is None

    def test_author_may_set_diet(self, api_client, author):
        vegan = Taxon.objects.get(kind='type', slug='vegan')
        api_client.force_authenticate(author)

        resp = api_client.post(
            reverse('post-list'), self._payload(taxon_ids=[vegan.id]), format='json',
        )

        assert resp.status_code == 201, resp.data
        assert vegan in Post.objects.get(id=resp.data['id']).draft_taxons.all()

    def test_author_may_not_set_classification(self, api_client, author):
        """
        «Фастфуд» приходит от блюда и одинаков для всех его позиций. Позволь
        указывать руками — одну и ту же шаурму разные люди разложат по-разному.
        """
        fastfood = Taxon.objects.get(kind='type', slug='fastfood')
        api_client.force_authenticate(author)

        resp = api_client.post(
            reverse('post-list'), self._payload(taxon_ids=[fastfood.id]), format='json',
        )

        assert resp.status_code == 400
        assert 'автоматически' in str(resp.data)


@pytest.mark.django_db
class TestApproval:
    def test_categories_come_from_dish_and_author_together(
        self, author, restaurant, make_post, moderator,
    ):
        """
        Раньше указанная автором диета вытесняла классификацию, и позиция
        выпадала из фильтров по виду еды.
        """
        vegan = Taxon.objects.get(kind='type', slug='vegan')
        post = make_post(author, restaurant=restaurant, item='Шаурма овощная')
        post.draft_dish_type = DishType.objects.get(name='Шаурма')
        post.save(update_fields=['draft_dish_type'])
        post.draft_taxons.set([vegan])

        approve_post(post, moderator)

        names = {t.slug for t in post.menu_item.taxons.all()}
        assert 'vegan' in names, 'свойство автора'
        assert 'streetfood' in names, 'классификация от блюда'

    def test_diet_removes_the_meat_mark(self, author, restaurant, make_post, moderator):
        """Веганский бургер не должен попадать в подборку «Мясо»."""
        vegan = Taxon.objects.get(kind='type', slug='vegan')
        post = make_post(author, restaurant=restaurant, item='Стейк из сейтана')
        post.draft_dish_type = DishType.objects.get(name='Стейк')
        post.save(update_fields=['draft_dish_type'])
        post.draft_taxons.set([vegan])

        approve_post(post, moderator)

        assert 'meat' not in {t.slug for t in post.menu_item.taxons.all()}

    def test_moderator_can_change_the_guess(self, author, restaurant, make_post, moderator):
        post = make_post(author, restaurant=restaurant, item='Шаурма')
        post.draft_dish_type = DishType.objects.get(name='Шаурма')
        post.save(update_fields=['draft_dish_type'])

        approve_post(post, moderator, dish_type=DishType.objects.get(name='Бургер'))

        assert post.menu_item.dish_type.name == 'Бургер'

    def test_approval_without_dish_is_allowed(self, author, restaurant, make_post, moderator):
        """
        Блокировать модератора на неполном каталоге вредно: позиция проживёт
        без блюда, её найдут поиском.
        """
        post = make_post(author, restaurant=restaurant, item='Цзяньбин')
        post.draft_dish_type = None
        post.save(update_fields=['draft_dish_type'])

        approve_post(post, moderator)

        assert post.menu_item.dish_type is None
        assert post.status == Post.STATUS_APPROVED


@pytest.mark.django_db
class TestAliases:
    """
    Синонимы блюд: каждая правка модератора делает угадывание умнее.

    Без них он чинит одно и то же написание бесконечно — правка никуда не
    записывается, и следующий такой пост приходит с той же ошибкой.
    """

    def test_alias_is_used_when_guessing(self):
        from posts.models import DishTypeAlias

        DishTypeAlias.objects.create(
            dish_type=DishType.objects.get(name='Шаурма'), name='Шаверма',
        )

        assert guess_dish_type('Шаверма').name == 'Шаурма'

    def test_moderator_correction_is_remembered(
        self, author, restaurant, make_post, moderator,
    ):
        from posts.models import DishTypeAlias

        post = make_post(author, restaurant=restaurant, item='Шаверма по-питерски')
        post.draft_dish_type = None
        post.save(update_fields=['draft_dish_type'])

        approve_post(post, moderator, dish_type=DishType.objects.get(name='Шаурма'))

        alias = DishTypeAlias.objects.get(name='Шаверма по-питерски')
        assert alias.dish_type.name == 'Шаурма'
        # И в следующий раз система справится без модератора.
        assert guess_dish_type('Шаверма по-питерски').name == 'Шаурма'

    def test_correction_to_the_same_name_is_not_stored(
        self, author, restaurant, make_post, moderator,
    ):
        """Название и так совпадает с блюдом — синоним ничего не добавит."""
        from posts.models import DishTypeAlias

        post = make_post(author, restaurant=restaurant, item='Шаурма')
        post.draft_dish_type = None
        post.save(update_fields=['draft_dish_type'])

        approve_post(post, moderator, dish_type=DishType.objects.get(name='Шаурма'))

        assert not DishTypeAlias.objects.filter(name='Шаурма').exists()


@pytest.mark.django_db
class TestCatalogWarning:
    """
    Позиция без блюда выпадает из каталога целиком. Модератор должен видеть
    это до решения, а не узнавать по жалобам.
    """

    def test_no_warning_when_dish_is_known(self, author, restaurant, make_post):
        from posts.serializers import ModerationPostSerializer

        post = make_post(author, restaurant=restaurant, item='Шаурма')
        post.draft_dish_type = DishType.objects.get(name='Шаурма')
        post.save(update_fields=['draft_dish_type'])

        assert ModerationPostSerializer(post).data['catalog_warning'] is None

    def test_warning_when_dish_is_unknown(self, author, restaurant, make_post):
        from posts.serializers import ModerationPostSerializer

        post = make_post(author, restaurant=restaurant, item='Цзяньбин')
        post.draft_dish_type = None
        post.save(update_fields=['draft_dish_type'])

        warning = ModerationPostSerializer(post).data['catalog_warning']
        assert warning is not None
        assert 'не попадёт' in warning['text']

    def test_cuisine_is_suggested_by_the_restaurant(
        self, author, restaurant, make_post, moderator,
    ):
        """
        У «Ролльной» уже есть японская позиция — новая безымянная почти
        наверняка тоже японская.
        """
        from posts.serializers import ModerationPostSerializer

        known = make_post(author, restaurant=restaurant, item='Роллы')
        known.draft_dish_type = DishType.objects.get(name='Роллы')
        known.save(update_fields=['draft_dish_type'])
        approve_post(known, moderator)

        unknown = make_post(author, restaurant=restaurant, item='Цзяньбин')
        unknown.draft_dish_type = None
        unknown.save(update_fields=['draft_dish_type'])

        hint = ModerationPostSerializer(unknown).data['catalog_warning']['cuisine_hint']
        assert hint['name'] == 'Японская'
        assert 'в этом заведении' in hint['reason']

    def test_no_hint_without_neighbours(self, author, restaurant, make_post):
        from posts.serializers import ModerationPostSerializer

        post = make_post(author, restaurant=restaurant, item='Цзяньбин')
        post.draft_dish_type = None
        post.save(update_fields=['draft_dish_type'])

        assert ModerationPostSerializer(post).data['catalog_warning']['cuisine_hint'] is None
