import pytest
from django.urls import reverse
from django.db import IntegrityError
from rest_framework.test import APIClient
from users.models import User, Follow


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user_a(db):
    return User.objects.create_user(
        username="user_a", email="a@test.com", password="pwd",
        email_verified=True,
    )


@pytest.fixture
def user_b(db):
    return User.objects.create_user(
        username="user_b", email="b@test.com", password="pwd",
        email_verified=True,
    )


@pytest.fixture
def user_c(db):
    return User.objects.create_user(
        username="user_c", email="c@test.com", password="pwd",
        email_verified=True,
    )


def get_token(api_client, email, password="pwd"):
    resp = api_client.post(reverse("token_obtain_pair"), {"email": email, "password": password})
    return resp.data["access"]


@pytest.mark.django_db
class TestFollowModel:
    def test_mutual_follow_allowed(self, user_a, user_b):
        """A подписывается на B, затем B подписывается на A — обе записи допустимы."""
        Follow.objects.create(follower=user_a, following=user_b)
        Follow.objects.create(follower=user_b, following=user_a)
        assert Follow.objects.count() == 2

    def test_duplicate_follow_raises(self, user_a, user_b):
        """Повторная подписка A на B нарушает unique_together."""
        Follow.objects.create(follower=user_a, following=user_b)
        with pytest.raises(IntegrityError):
            Follow.objects.create(follower=user_a, following=user_b)

    def test_cannot_follow_self_at_model_level(self, user_a):
        """На уровне модели self-follow технически возможен — защита только на уровне View."""
        # Убеждаемся, что модель это не блокирует (только View возвращает 400)
        f = Follow.objects.create(follower=user_a, following=user_a)
        assert f.pk is not None
        f.delete()

    def test_delete_follow_does_not_affect_reverse(self, user_a, user_b):
        """Удаление подписки A→B не удаляет подписку B→A."""
        Follow.objects.create(follower=user_a, following=user_b)
        Follow.objects.create(follower=user_b, following=user_a)
        Follow.objects.filter(follower=user_a, following=user_b).delete()
        assert Follow.objects.filter(follower=user_b, following=user_a).exists()


@pytest.mark.django_db
class TestSubscribeView:
    def test_follow(self, api_client, user_a, user_b):
        token = get_token(api_client, "a@test.com")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        resp = api_client.post(reverse("user-subscribe", kwargs={"user_id": user_b.id}))
        assert resp.status_code == 200
        assert Follow.objects.filter(follower=user_a, following=user_b).exists()

    def test_mutual_follow_via_api(self, api_client, user_a, user_b):
        """A подписывается на B через API, затем B на A — оба запроса успешны."""
        token_a = get_token(api_client, "a@test.com")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_a}")
        resp = api_client.post(reverse("user-subscribe", kwargs={"user_id": user_b.id}))
        assert resp.status_code == 200

        token_b = get_token(api_client, "b@test.com")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_b}")
        resp = api_client.post(reverse("user-subscribe", kwargs={"user_id": user_a.id}))
        assert resp.status_code == 200

        assert Follow.objects.count() == 2

    def test_duplicate_follow_via_api_is_idempotent(self, api_client, user_a, user_b):
        """Повторный POST на subscribe не падает — get_or_create делает его идемпотентным."""
        token = get_token(api_client, "a@test.com")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        url = reverse("user-subscribe", kwargs={"user_id": user_b.id})
        api_client.post(url)
        resp = api_client.post(url)
        assert resp.status_code == 200
        assert Follow.objects.filter(follower=user_a, following=user_b).count() == 1

    def test_cannot_follow_self(self, api_client, user_a):
        token = get_token(api_client, "a@test.com")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        resp = api_client.post(reverse("user-subscribe", kwargs={"user_id": user_a.id}))
        assert resp.status_code == 400

    def test_unfollow(self, api_client, user_a, user_b):
        Follow.objects.create(follower=user_a, following=user_b)
        token = get_token(api_client, "a@test.com")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        resp = api_client.delete(reverse("user-subscribe", kwargs={"user_id": user_b.id}))
        assert resp.status_code == 204
        assert not Follow.objects.filter(follower=user_a, following=user_b).exists()

    def test_unfollow_not_following_is_safe(self, api_client, user_a, user_b):
        """DELETE на не-существующую подписку возвращает 204, не 404."""
        token = get_token(api_client, "a@test.com")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        resp = api_client.delete(reverse("user-subscribe", kwargs={"user_id": user_b.id}))
        assert resp.status_code == 204

    def test_is_following_field_in_user_detail(self, api_client, user_a, user_b):
        """UserSerializer.is_following возвращает True после подписки."""
        Follow.objects.create(follower=user_a, following=user_b)
        token = get_token(api_client, "a@test.com")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        resp = api_client.get(reverse("user-detail", kwargs={"user_id": user_b.id}))
        assert resp.status_code == 200
        assert resp.data["is_following"] is True

    def test_is_following_false_after_unfollow(self, api_client, user_a, user_b):
        Follow.objects.create(follower=user_a, following=user_b)
        Follow.objects.filter(follower=user_a, following=user_b).delete()
        token = get_token(api_client, "a@test.com")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        resp = api_client.get(reverse("user-detail", kwargs={"user_id": user_b.id}))
        assert resp.data["is_following"] is False

    def test_followers_count_updates(self, api_client, user_a, user_b, user_c):
        """followers_count увеличивается для каждого нового подписчика."""
        token_a = get_token(api_client, "a@test.com")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_a}")
        api_client.post(reverse("user-subscribe", kwargs={"user_id": user_b.id}))

        token_c = get_token(api_client, "c@test.com")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_c}")
        api_client.post(reverse("user-subscribe", kwargs={"user_id": user_b.id}))

        # Проверяем счётчик от имени user_a
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_a}")
        resp = api_client.get(reverse("user-detail", kwargs={"user_id": user_b.id}))
        assert resp.data["followers_count"] == 2
        assert resp.data["following_count"] == 0

    def test_followers_count_decrements_on_unfollow(self, api_client, user_a, user_b):
        """followers_count уменьшается после отписки."""
        token = get_token(api_client, "a@test.com")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        api_client.post(reverse("user-subscribe", kwargs={"user_id": user_b.id}))
        user_b.refresh_from_db()
        assert user_b.followers_count == 1

        api_client.delete(reverse("user-subscribe", kwargs={"user_id": user_b.id}))
        user_b.refresh_from_db()
        assert user_b.followers_count == 0

    def test_following_count_decrements_on_unfollow(self, api_client, user_a, user_b):
        """following_count у подписчика уменьшается после отписки."""
        token = get_token(api_client, "a@test.com")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        api_client.post(reverse("user-subscribe", kwargs={"user_id": user_b.id}))
        user_a.refresh_from_db()
        assert user_a.following_count == 1

        api_client.delete(reverse("user-subscribe", kwargs={"user_id": user_b.id}))
        user_a.refresh_from_db()
        assert user_a.following_count == 0

    def test_counters_do_not_go_negative(self, api_client, user_a, user_b):
        """Повторная отписка не уводит счётчики в минус."""
        token = get_token(api_client, "a@test.com")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        # Отписываемся без предварительной подписки
        api_client.delete(reverse("user-subscribe", kwargs={"user_id": user_b.id}))
        user_b.refresh_from_db()
        user_a.refresh_from_db()
        assert user_b.followers_count == 0
        assert user_a.following_count == 0

    def test_follow_unfollow_cycle_counters(self, api_client, user_a, user_b):
        """Полный цикл подписка → отписка → подписка даёт корректные счётчики."""
        token = get_token(api_client, "a@test.com")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        url = reverse("user-subscribe", kwargs={"user_id": user_b.id})

        api_client.post(url)
        user_b.refresh_from_db()
        assert user_b.followers_count == 1

        api_client.delete(url)
        user_b.refresh_from_db()
        assert user_b.followers_count == 0

        api_client.post(url)
        user_b.refresh_from_db()
        assert user_b.followers_count == 1

    def test_duplicate_follow_does_not_double_count(self, api_client, user_a, user_b):
        """Повторная подписка (idempotent) не увеличивает счётчик дважды."""
        token = get_token(api_client, "a@test.com")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        url = reverse("user-subscribe", kwargs={"user_id": user_b.id})

        api_client.post(url)
        api_client.post(url)  # повторно — get_or_create, не создаёт новую запись
        user_b.refresh_from_db()
        assert user_b.followers_count == 1

    def test_counters_visible_in_user_detail_after_unfollow(self, api_client, user_a, user_b):
        """API /users/<id>/ возвращает актуальные счётчики после отписки."""
        token = get_token(api_client, "a@test.com")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        url = reverse("user-subscribe", kwargs={"user_id": user_b.id})

        api_client.post(url)
        api_client.delete(url)

        resp = api_client.get(reverse("user-detail", kwargs={"user_id": user_b.id}))
        assert resp.status_code == 200
        assert resp.data["followers_count"] == 0


@pytest.mark.django_db
class TestFollowLists:
    """Списки подписок и подписчиков — их открывают из счётчиков в профиле."""

    def test_following_lists_who_user_follows(self, api_client, user_a, user_b, user_c):
        Follow.objects.create(follower=user_a, following=user_b)
        Follow.objects.create(follower=user_c, following=user_a)

        resp = api_client.get(reverse("user-following", kwargs={"user_id": user_a.id}))

        assert resp.status_code == 200
        assert [u["username"] for u in resp.data["results"]] == ["user_b"]

    def test_followers_lists_who_follows_user(self, api_client, user_a, user_b, user_c):
        Follow.objects.create(follower=user_a, following=user_b)
        Follow.objects.create(follower=user_c, following=user_a)

        resp = api_client.get(reverse("user-followers", kwargs={"user_id": user_a.id}))

        assert resp.status_code == 200
        assert [u["username"] for u in resp.data["results"]] == ["user_c"]

    def test_list_carries_is_following_for_viewer(self, api_client, user_a, user_b):
        """Кнопка «Отписаться» рисуется прямо в списке, без второго запроса."""
        Follow.objects.create(follower=user_a, following=user_b)
        token = get_token(api_client, "a@test.com")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        resp = api_client.get(reverse("user-following", kwargs={"user_id": user_a.id}))

        assert resp.data["results"][0]["is_following"] is True

    def test_empty_for_user_without_follows(self, api_client, user_a):
        resp = api_client.get(reverse("user-following", kwargs={"user_id": user_a.id}))
        assert resp.data["count"] == 0

    def test_unknown_user_returns_404(self, api_client):
        resp = api_client.get(reverse("user-following", kwargs={"user_id": 999999}))
        assert resp.status_code == 404
