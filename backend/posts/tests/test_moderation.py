"""
Модерация — ядро схемы: именно здесь пост превращается в запись каталога.

Ключевое свойство, которое ломать нельзя: **до одобрения в каталоге нет ничего.**
Отсюда и всё остальное — отклонённый пост не оставляет мусора, а одновременное
одобрение двух постов про одно блюдо не создаёт дубль.
"""

import pytest

from posts.models import MenuItem, Post, Restaurant
from posts.services.moderation import ModerationError, approve_post, reject_post, similar_menu_items


@pytest.mark.django_db
class TestCatalogAppearsOnApproval:
    def test_pending_post_creates_nothing(self, author, make_post):
        make_post(author)
        assert Restaurant.objects.count() == 0
        assert MenuItem.objects.count() == 0

    def test_approval_creates_restaurant_and_item(self, author, moderator, make_post):
        post = approve_post(make_post(author), moderator)

        assert Restaurant.objects.count() == 1
        assert MenuItem.objects.count() == 1
        assert post.menu_item.name == 'Чизбургер'
        assert post.menu_item.restaurant.name == 'Бургерная'

    def test_rejection_leaves_catalog_empty(self, author, moderator, make_post):
        reject_post(make_post(author), moderator, 'реклама')

        assert Restaurant.objects.count() == 0
        assert MenuItem.objects.count() == 0

    def test_rejection_requires_reason(self, author, moderator, make_post):
        with pytest.raises(ModerationError):
            reject_post(make_post(author), moderator, '   ')

    def test_taxons_are_copied_not_linked(self, author, moderator, make_post, burger):
        """
        Категории копируются в позицию. Правка справочника задним числом
        не должна переписывать готовые позиции.
        """
        post = approve_post(make_post(author), moderator)
        assert post.menu_item.taxons.count() == burger.default_taxons.count()

        burger.default_taxons.clear()
        post.menu_item.refresh_from_db()
        assert post.menu_item.taxons.count() > 0, 'позиция не должна зависеть от справочника'

    def test_price_from_draft_becomes_item_price(self, author, moderator, make_post):
        post = approve_post(make_post(author, price=450), moderator)
        assert int(post.menu_item.price) == 450


@pytest.mark.django_db
class TestNoDuplicates:
    def test_two_posts_about_same_new_dish_share_one_item(self, author, other_author,
                                                          moderator, make_post):
        approve_post(make_post(author), moderator)
        approve_post(make_post(other_author), moderator)

        assert Restaurant.objects.count() == 1
        assert MenuItem.objects.count() == 1

    def test_moderator_can_attach_to_existing_item(self, author, other_author,
                                                   moderator, make_post):
        """Так и склеиваются дубли: пост уходит к существующей позиции."""
        first = approve_post(make_post(author), moderator)
        second = make_post(other_author, item='Чиз бургер')

        approve_post(second, moderator, menu_item=first.menu_item)
        assert MenuItem.objects.count() == 1
        assert second.menu_item == first.menu_item

    def test_moderator_can_fix_item_name(self, author, moderator, make_post):
        post = approve_post(make_post(author, item='чизбургир'), moderator,
                            menu_item_name='Чизбургер')
        assert post.menu_item.name == 'Чизбургер'

    def test_similar_items_are_suggested(self, author, other_author, moderator, make_post):
        first = approve_post(make_post(author), moderator)
        candidate = make_post(other_author, restaurant=first.menu_item.restaurant,
                              item='Чиз бургер')

        assert first.menu_item in similar_menu_items(candidate)


@pytest.mark.django_db
class TestPriceProposal:
    """
    Решение по цене принимается отдельно от решения по посту: хороший пост
    с бредовой ценой должен публиковаться, а цена — отклоняться.
    """

    def test_accepted_price_updates_item(self, author, other_author, moderator, make_post):
        first = approve_post(make_post(author, price=350), moderator)
        proposal = make_post(other_author, menu_item=first.menu_item, price=420)

        approve_post(proposal, moderator, accept_price=True)
        first.menu_item.refresh_from_db()
        assert int(first.menu_item.price) == 420
        assert proposal.proposed_price_status == Post.PRICE_PROPOSAL_ACCEPTED

    def test_rejected_price_keeps_old_but_publishes_post(self, author, other_author,
                                                        moderator, make_post):
        first = approve_post(make_post(author, price=350), moderator)
        proposal = make_post(other_author, menu_item=first.menu_item, price=99999)

        approve_post(proposal, moderator, accept_price=False)
        first.menu_item.refresh_from_db()
        assert int(first.menu_item.price) == 350
        assert proposal.status == Post.STATUS_APPROVED, 'пост должен опубликоваться'
        assert proposal.proposed_price_status == Post.PRICE_PROPOSAL_REJECTED


@pytest.mark.django_db
class TestGuards:
    def test_cannot_approve_twice(self, author, moderator, make_post):
        post = approve_post(make_post(author), moderator)
        with pytest.raises(ModerationError):
            approve_post(post, moderator)

    def test_cannot_approve_deleted_post(self, author, moderator, make_post):
        post = make_post(author)
        post.delete()
        with pytest.raises(ModerationError):
            approve_post(post, moderator)

    def test_draft_without_restaurant_is_rejected(self, author, moderator, make_post):
        post = make_post(author)
        post.draft_restaurant_name = ''
        post.save()
        with pytest.raises(ModerationError):
            approve_post(post, moderator)


@pytest.mark.django_db
class TestTaxonsFromDishType:
    """
    Позиция без категорий не находится ни одним фильтром поиска. Клиент их
    не присылает, поэтому категории по умолчанию проставляет сервер — из типа
    блюда, для этого справочник и заполнен.
    """

    def test_post_gets_taxons_of_its_dish_type(self, auth_client, burger):
        response = auth_client.post('/api/v1/posts/', {
            'restaurant_name': 'Бургерная', 'restaurant_address': 'Тверская 15',
            'restaurant_city': 'Москва', 'menu_item_name': 'Чизбургер',
            'author_rating': 8, 'price': 350, 'dish_type_id': burger.id,
        })

        assert response.status_code == 201
        post = Post.objects.get()
        assert set(post.draft_taxons.all()) == set(burger.default_taxons.all())
        assert post.draft_taxons.exists(), 'иначе позиция выпадет из всех фильтров'

    def test_author_choice_adds_to_defaults(self, auth_client, burger):
        """
        Указанное автором добавляется к категориям блюда, а не заменяет их.

        Раньше диета вытесняла классификацию: отметил «веганское» — позиция
        теряла «фастфуд» и выпадала из фильтров по виду еды.
        """
        from posts.models import Taxon
        vegan = Taxon.objects.get(kind='type', slug='vegan')

        auth_client.post('/api/v1/posts/', {
            'restaurant_name': 'Бургерная', 'restaurant_address': 'Тверская 15',
            'restaurant_city': 'Москва', 'menu_item_name': 'Чизбургер',
            'author_rating': 8, 'price': 350, 'dish_type_id': burger.id,
            'taxon_ids': [vegan.id],
        })

        assert list(Post.objects.get().draft_taxons.all()) == [vegan]

    def test_menu_item_inherits_taxons_on_approval(self, author, moderator, make_post,
                                                   burger):
        post = make_post(author)
        post.draft_taxons.clear()  # заявка без категорий

        menu_item = approve_post(post, moderator).menu_item

        assert set(menu_item.taxons.all()) == set(burger.default_taxons.all()), \
            'категории берутся у типа блюда, даже если в заявке их не было'

    def test_approved_item_is_findable_by_cuisine(self, api_client, author, moderator,
                                                  make_post, burger):
        """Тот самый случай: «японская кухня» должна находить «Роллы»."""
        post = make_post(author)
        post.draft_taxons.clear()
        menu_item = approve_post(post, moderator).menu_item
        cuisine = menu_item.taxons.filter(kind='cuisine').first()

        response = api_client.get(f'/api/v1/menu-items/?category_id={cuisine.id}')
        assert response.data['count'] == 1


@pytest.mark.django_db
class TestApproveIntoExistingRestaurant:
    """
    Модератор может опознать заведение: блюдо новое, а место уже в каталоге.

    Без этого одобрение всегда заводило новое место, и «Ролльная» с «Рольной»
    по одному адресу расходились в два заведения с одинаковыми роллами.
    """

    def test_post_attaches_to_named_restaurant(self, author, moderator, make_post,
                                               restaurant):
        post = make_post(author, restaurant_name='Кафе Кофемания',
                         address='Пушкина 10', city='Москва')

        approve_post(post, moderator, restaurant=restaurant)

        post.refresh_from_db()
        assert post.menu_item.restaurant == restaurant
        assert Restaurant.objects.count() == 1, 'второе заведение не заводится'

    def test_authors_spelling_becomes_alias(self, author, moderator, make_post,
                                            restaurant):
        post = make_post(author, restaurant_name='Кафе Кофемания',
                         address='Пушкина 10', city='Москва')

        approve_post(post, moderator, restaurant=restaurant)

        aliases = [a.name for a in restaurant.aliases.all()]
        assert 'Кафе Кофемания' in aliases, 'следующий поиск приведёт сюда сам'

    def test_second_author_stacks_on_the_same_position(self, author, other_author,
                                                       moderator, make_post, restaurant):
        """Ровно тот случай: двое написали про одно блюдо в одном месте."""
        first = make_post(author, restaurant=restaurant, item='Роллы')
        approve_post(first, moderator)

        second = make_post(other_author, restaurant_name='Ролльная',
                           address='Мусорская 35', city='Москва', item='Роллы')
        approve_post(second, moderator, restaurant=restaurant)

        first.refresh_from_db(); second.refresh_from_db()
        assert first.menu_item == second.menu_item, 'посты стакаются на одной позиции'
        assert second.menu_item.posts_count == 2
