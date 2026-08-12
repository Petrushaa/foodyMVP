"""
Рейтинг позиции: байесовское среднее и правило «один человек — один голос».

Формула: R = (n × среднее + m × C) / (n + m). Смысл в том, что одна десятка
от одного человека не должна обгонять двадцать восьмёрок.
"""

import pytest
from django.conf import settings

from posts.models import MenuItem, Post
from posts.services.moderation import approve_post, reject_post
from posts.services.stats import bayesian_rating, recalculate_menu_item_stats, sync_menu_item_tags


class TestFormula:
    def test_single_high_score_is_pulled_toward_average(self):
        """Одна десятка при среднем по сервису 7 не должна давать десятку."""
        result = bayesian_rating(count=1, raw=10.0, global_average=7.0)
        assert 7.0 < result < 8.5

    def test_many_scores_approach_raw_average(self):
        result = bayesian_rating(count=50, raw=8.0, global_average=7.0)
        assert abs(result - 8.0) < 0.2

    def test_many_good_scores_beat_one_perfect(self):
        one_ten = bayesian_rating(count=1, raw=10.0, global_average=7.0)
        twenty_eights = bayesian_rating(count=20, raw=8.0, global_average=7.0)
        assert twenty_eights > one_ten

    def test_no_scores_gives_zero(self):
        assert bayesian_rating(count=0, raw=0.0, global_average=7.0) == 0.0


@pytest.mark.django_db
class TestOneVotePerPerson:
    def test_two_authors_give_two_votes(self, author, other_author, moderator, make_post):
        first = approve_post(make_post(author, rating=9.0), moderator)
        approve_post(make_post(other_author, rating=8.0), moderator)

        item = first.menu_item
        item.refresh_from_db()
        assert item.ratings_count == 2
        assert item.rating_raw == pytest.approx(8.5)

    def test_same_author_counts_once_and_latest_wins(self, author, moderator, make_post):
        """Человек может написать три поста, но голос у него один — последний."""
        first = approve_post(make_post(author, rating=10.0), moderator)
        item = first.menu_item

        approve_post(make_post(author, menu_item=item, rating=4.0, price=None), moderator)
        item.refresh_from_db()

        assert item.ratings_count == 1
        assert item.rating_raw == pytest.approx(4.0), 'должна учитываться последняя оценка'

    def test_pending_posts_do_not_affect_rating(self, author, other_author,
                                                moderator, make_post):
        first = approve_post(make_post(author, rating=9.0), moderator)
        make_post(other_author, menu_item=first.menu_item, rating=1.0, price=None)

        first.menu_item.refresh_from_db()
        assert first.menu_item.ratings_count == 1


@pytest.mark.django_db
class TestRecalculationOnChange:
    def test_soft_deleted_post_stops_counting(self, author, other_author,
                                              moderator, make_post):
        first = approve_post(make_post(author, rating=10.0), moderator)
        second = approve_post(
            make_post(other_author, menu_item=first.menu_item, rating=2.0, price=None), moderator,
        )
        item = first.menu_item
        item.refresh_from_db()
        assert item.ratings_count == 2

        second.delete()
        item.refresh_from_db()
        assert item.ratings_count == 1
        assert item.rating_raw == pytest.approx(10.0)

    def test_restored_post_counts_again(self, author, other_author, moderator, make_post):
        first = approve_post(make_post(author, rating=10.0), moderator)
        second = approve_post(
            make_post(other_author, menu_item=first.menu_item, rating=2.0, price=None), moderator,
        )
        second.delete()
        second.restore()

        first.menu_item.refresh_from_db()
        assert first.menu_item.ratings_count == 2

    def test_rejecting_approved_post_removes_its_vote(self, author, other_author,
                                                      moderator, make_post):
        first = approve_post(make_post(author, rating=10.0), moderator)
        second = approve_post(
            make_post(other_author, menu_item=first.menu_item, rating=2.0, price=None), moderator,
        )

        reject_post(second, moderator, 'не по теме')
        first.menu_item.refresh_from_db()
        assert first.menu_item.ratings_count == 1


@pytest.mark.django_db
class TestVisibility:
    def test_item_without_visible_posts_is_hidden(self, author, moderator, make_post):
        """Позиция остаётся в базе, но пропадает из каталога."""
        post = approve_post(make_post(author), moderator)
        item = post.menu_item
        assert item.is_visible is True

        post.delete()
        item.refresh_from_db()
        assert item.posts_count == 0
        assert item.is_visible is False
        assert MenuItem.objects.filter(pk=item.pk).exists(), 'запись не удаляется'


@pytest.mark.django_db
class TestTags:
    def test_tag_needs_two_different_people(self, author, other_author, moderator, make_post):
        from posts.models import MenuItemTag, PostTag, Tag

        first = approve_post(make_post(author), moderator)
        tag = Tag.objects.create(name='сочно')
        PostTag.objects.create(post=first, tag=tag)
        sync_menu_item_tags(first.menu_item)

        link = MenuItemTag.objects.get(menu_item=first.menu_item, tag=tag)
        assert link.mentions_count == 1
        assert link.is_visible is False, 'один человек — тег ещё не показываем'

        second = approve_post(make_post(other_author, menu_item=first.menu_item, price=None),
                              moderator)
        PostTag.objects.create(post=second, tag=tag)
        sync_menu_item_tags(first.menu_item)

        link.refresh_from_db()
        assert link.mentions_count == 2
        assert link.is_visible is True
