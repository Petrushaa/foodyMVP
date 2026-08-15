"""
Иконки справочника: загрузка из папки и выдача в API.

Картинка старше эмодзи, но эмодзи остаётся запасным вариантом — набор иконок
заливается постепенно, и пустых мест в интерфейсе быть не должно.
"""

import pytest
from django.core.management import call_command

from posts.models import DishType, Taxon


@pytest.fixture
def icons_dir(tmp_path, image_file):
    """Папка с иконками в раскладке, которую ждёт команда импорта."""
    dish_types = tmp_path / 'dish-types'
    cuisine = tmp_path / 'taxons' / 'cuisine'
    dish_types.mkdir(parents=True)
    cuisine.mkdir(parents=True)

    (dish_types / 'Бургер.png').write_bytes(image_file.read())
    image_file.seek(0)
    (cuisine / 'american.png').write_bytes(image_file.read())
    return tmp_path


@pytest.mark.django_db
class TestImportIcons:
    def test_loads_by_name_and_slug(self, icons_dir, burger):
        call_command('import_icons', path=str(icons_dir))

        burger.refresh_from_db()
        assert burger.icon, 'блюдо сопоставляется по названию файла'
        assert Taxon.objects.get(kind='cuisine', slug='american').icon

    def test_dry_run_changes_nothing(self, icons_dir, burger):
        call_command('import_icons', path=str(icons_dir), dry_run=True)

        burger.refresh_from_db()
        assert not burger.icon

    def test_existing_icons_are_kept(self, icons_dir, burger):
        call_command('import_icons', path=str(icons_dir))
        first = DishType.objects.get(pk=burger.pk).icon.name

        call_command('import_icons', path=str(icons_dir))

        assert DishType.objects.get(pk=burger.pk).icon.name == first, 'повтор не плодит копии'

    def test_replace_reloads(self, icons_dir, burger):
        call_command('import_icons', path=str(icons_dir))
        first = DishType.objects.get(pk=burger.pk).icon.name

        call_command('import_icons', path=str(icons_dir), replace=True)

        assert DishType.objects.get(pk=burger.pk).icon.name != first

    def test_unknown_file_does_not_break_import(self, icons_dir, burger, image_file):
        (icons_dir / 'dish-types' / 'Такого блюда нет.png').write_bytes(image_file.read())

        call_command('import_icons', path=str(icons_dir))

        burger.refresh_from_db()
        assert burger.icon, 'лишний файл не должен ронять остальной импорт'


@pytest.mark.django_db
class TestIconsInApi:
    def test_dish_type_carries_icon_url(self, api_client, icons_dir, burger):
        call_command('import_icons', path=str(icons_dir))

        data = api_client.get('/api/v1/dish-types/').data
        found = next(d for d in data if d['name'] == burger.name)

        assert found['icon'].startswith('/media/')
        assert found['emoji'], 'эмодзи остаётся — на случай если картинку уберут'

    def test_no_icon_returns_null(self, api_client, burger):
        data = api_client.get('/api/v1/dish-types/').data
        found = next(d for d in data if d['name'] == burger.name)

        assert found['icon'] is None
