"""
Группы блюд: заголовки в списке выбора и фильтр «все супы» одним нажатием.

Группа нужна затем, чтобы шесть десятков блюд не сваливались в один список.
Проверяем, что список приходит уже разложенным по группам и что группу можно
выбрать целиком, не перечисляя входящие в неё блюда.
"""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from posts.models import DishGroup, DishType, MenuItem, Restaurant
from posts.services.moderation import approve_post


@pytest.fixture
def api_client():
    return APIClient()


@pytest.mark.django_db
class TestDishGroupCatalog:
    def test_groups_come_in_curated_order(self, api_client):
        """Порядок задан вручную и означает популярность, а не алфавит."""
        resp = api_client.get(reverse('dish-group-list'))
        assert resp.status_code == 200

        slugs = [g['slug'] for g in resp.data]
        assert slugs[:3] == ['pizza-pasta', 'rolls', 'street']
        assert 'drinks' in slugs

    def test_dish_list_arrives_already_grouped(self, api_client):
        """
        Фронт рисует заголовки по порядку и ничего не пересортировывает.
        Значит, блюда одной группы обязаны идти подряд.
        """
        resp = api_client.get(reverse('dish-type-list'))
        assert resp.status_code == 200

        seen, order = set(), []
        for dish in resp.data:
            if dish['group'] not in seen:
                seen.add(dish['group'])
                order.append(dish['group'])
            else:
                # Группа уже встречалась — значит, она разорвана другой.
                assert order[-1] == dish['group'], f'группа {dish["group"]} разорвана'

    def test_dish_carries_its_group(self, api_client):
        resp = api_client.get(reverse('dish-type-list'))
        borsch = next(d for d in resp.data if d['name'] == 'Борщ')

        assert borsch['group'] == 'soups'
        assert borsch['group_name'] == 'Супы'

    def test_every_dish_has_a_group(self, db):
        """Блюдо без группы выпадет из списка выбора — заметить это трудно."""
        assert not DishType.objects.filter(group=None).exists()


@pytest.fixture
def positions(db, author, restaurant, make_post, moderator):
    """Две позиции из разных групп: суп и роллы."""
    made = {}
    for dish_name, item_name in (('Борщ', 'Борщ домашний'), ('Роллы', 'Филадельфия')):
        post = make_post(author, restaurant=restaurant, item=item_name)
        post.draft_dish_type = DishType.objects.get(name=dish_name)
        post.save(update_fields=['draft_dish_type'])
        approve_post(post, moderator)
        made[dish_name] = post.menu_item
    return made


@pytest.mark.django_db
class TestDishGroupFilter:
    def test_group_selects_every_dish_inside_it(self, api_client, positions):
        """«Хочу супы» — без перечисления борща, солянки и окрошки."""
        resp = api_client.get(reverse('menu-item-list'), {'dish_group': 'soups'})

        names = [m['name'] for m in resp.data['results']]
        assert 'Борщ домашний' in names
        assert 'Филадельфия' not in names

    def test_several_groups_widen_the_result(self, api_client, positions):
        """
        Позиция входит ровно в одну группу, поэтому несколько групп — это «или».
        «И» здесь всегда давало бы пустую выдачу.
        """
        resp = api_client.get(reverse('menu-item-list'), {'dish_group': 'soups,rolls'})

        names = {m['name'] for m in resp.data['results']}
        assert {'Борщ домашний', 'Филадельфия'} <= names

    def test_unknown_group_returns_nothing_rather_than_everything(self, api_client, positions):
        """Опечатка в коде группы не должна молча показывать весь каталог."""
        resp = api_client.get(reverse('menu-item-list'), {'dish_group': 'нет-такой'})
        assert resp.data['count'] == 0

    def test_empty_value_is_ignored(self, api_client, positions):
        """Пустой параметр — это «фильтра нет», а не «ничего не подходит»."""
        resp = api_client.get(reverse('menu-item-list'), {'dish_group': ''})
        assert resp.data['count'] == 2
