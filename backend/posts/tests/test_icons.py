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


@pytest.mark.django_db
class TestCatalogOrder:
    """
    Порядок в справочнике задают админы. Незаполненный порядок значит
    «в конец по алфавиту» — иначе пришлось бы нумеровать все 125 блюд,
    чтобы поднять наверх три.
    """

    def test_unset_order_keeps_alphabet(self):
        """Внутри группы: у блюд без порядка остаётся алфавит."""
        DishType.objects.update(sort_order=None)
        soups = DishType.objects.filter(group__slug='soups')
        names = list(soups.values_list('name', flat=True))
        assert names == sorted(names)

    def test_explicit_order_comes_first(self, burger):
        """
        Порядок считается внутри группы: список выбора разбит на разделы, и
        группа всегда главнее. Поднять бургер выше пиццы, не трогая группы,
        нельзя — они в разных разделах.
        """
        fastfood = DishType.objects.filter(group=burger.group)
        fastfood.update(sort_order=None)
        burger.sort_order = 1
        burger.save(update_fields=['sort_order'])

        names = list(fastfood.values_list('name', flat=True)[:3])

        assert names[0] == 'Бургер', 'заданный порядок поднимает блюдо в разделе'
        assert names[1:] == sorted(names[1:]), 'остальные — по алфавиту'
        assert names[2] != 'Пицца', 'остальные идут следом по алфавиту'

    def test_order_reaches_api(self, api_client):
        pizza = DishType.objects.get(name='Пицца')
        pizza.sort_order = 1
        pizza.save(update_fields=['sort_order'])

        data = api_client.get('/api/v1/dish-types/').data
        assert data[0]['name'] == 'Пицца'

    def test_taxons_are_ordered_inside_their_axis(self, api_client):
        japanese = Taxon.objects.get(kind='cuisine', slug='japanese')
        japanese.sort_order = 1
        japanese.save(update_fields=['sort_order'])

        data = api_client.get('/api/v1/taxons/?kind=cuisine').data
        assert data[0]['slug'] == 'japanese'


@pytest.mark.django_db
class TestApplyCatalogOrder:
    """
    Порядок хранится в файле репозитория, чтобы ехать вместе с деплоем:
    в базе он живёт только как результат применения этого файла.
    """

    @pytest.fixture
    def order_file(self, tmp_path):
        path = tmp_path / 'catalog_order.txt'
        path.write_text(
            '# комментарий\n\n[dish-types]\nПицца\nБургер\n\n[cuisine]\njapanese\n',
            encoding='utf-8',
        )
        return path

    def test_applies_listed_order(self, order_file, api_client):
        call_command('apply_catalog_order', path=str(order_file))

        # Позиция считается по строке файла; на экране она работает внутри
        # своего раздела, потому что группа в сортировке главнее.
        assert DishType.objects.get(name='Пицца').sort_order == 1
        assert DishType.objects.get(name='Бургер').sort_order == 2
        assert api_client.get('/api/v1/taxons/?kind=cuisine').data[0]['slug'] == 'japanese'

    def test_group_order_sets_the_sections(self, tmp_path, api_client):
        """Порядок разделов тоже едет из файла, а не живёт только в базе."""
        path = tmp_path / 'order.txt'
        path.write_text('[dish-groups]\nsoups\nrolls\n', encoding='utf-8')

        call_command('apply_catalog_order', path=str(path))

        groups = [g['slug'] for g in api_client.get('/api/v1/dish-groups/').data[:2]]
        assert groups == ['soups', 'rolls']

    def test_dishes_of_one_group_stay_together(self, order_file, api_client):
        """
        Фронт рисует заголовок над подряд идущими блюдами. Разорви файл порядка
        группу — и раздел на экране задвоится.
        """
        call_command('apply_catalog_order', path=str(order_file))

        seen, order = set(), []
        for dish in api_client.get('/api/v1/dish-types/').data:
            if dish['group'] not in seen:
                seen.add(dish['group'])
                order.append(dish['group'])
            else:
                assert order[-1] == dish['group'], 'группа разорвана'

    def test_dry_run_changes_nothing(self, order_file):
        before = DishType.objects.get(name='Пицца').sort_order

        call_command('apply_catalog_order', path=str(order_file), dry_run=True)

        assert DishType.objects.get(name='Пицца').sort_order == before

    def test_manual_order_survives_repeat(self, order_file):
        """Без --reset команда не трогает то, чего нет в файле."""
        DishType.objects.filter(name='Суши').update(sort_order=5)

        call_command('apply_catalog_order', path=str(order_file))

        assert DishType.objects.get(name='Суши').sort_order == 5

    def test_reset_makes_file_the_only_truth(self, order_file):
        DishType.objects.filter(name='Суши').update(sort_order=5)

        call_command('apply_catalog_order', path=str(order_file), reset=True)

        assert DishType.objects.get(name='Суши').sort_order is None
        assert DishType.objects.get(name='Пицца').sort_order == 1

    def test_unknown_name_does_not_break_the_rest(self, tmp_path):
        path = tmp_path / 'order.txt'
        path.write_text('[dish-types]\nТакого блюда нет\nПицца\n', encoding='utf-8')

        call_command('apply_catalog_order', path=str(path))

        assert DishType.objects.get(name='Пицца').sort_order == 2, 'позиция считается по строке'


@pytest.mark.django_db
class TestMissingReport:
    """Список ожидаемых имён файлов: без него их пришлось бы выписывать руками."""

    def test_lists_records_without_icons(self, capsys, burger):
        call_command('import_icons', missing=True)

        out = capsys.readouterr().out
        assert f'{burger.name}.png' in out
        assert 'Блюда:' in out and 'Кухня' in out

    def test_loaded_icons_leave_the_list(self, capsys, icons_dir, burger):
        call_command('import_icons', path=str(icons_dir))
        call_command('import_icons', missing=True)

        out = capsys.readouterr().out
        assert f'{burger.name}.png' not in out, 'загруженное больше не просят'


@pytest.mark.django_db
class TestPrepareIcons:
    """
    Подготовка иконок из исходников: уменьшение и раскладка по ключам справочника.
    Исходники — фотографии на мегабайты, в интерфейсе значок в несколько десятков
    пикселей, поэтому уменьшение обязательная часть флоу, а не украшение.
    """

    @pytest.fixture
    def source_dir(self, tmp_path):
        from PIL import Image

        folder = tmp_path / 'source'
        folder.mkdir()
        Image.new('RGB', (2048, 2048), 'white').save(folder / 'Бургер.jpeg')
        return folder

    def test_resizes_and_renames(self, source_dir, tmp_path, burger):
        target = tmp_path / 'out'

        call_command('prepare_icons', source=str(source_dir), target=str(target))

        from PIL import Image
        result = target / 'dish-types' / f'{burger.name}.webp'
        assert result.exists(), 'кладём под ключом справочника'
        assert max(Image.open(result).size) == 256
        assert result.stat().st_size < 100 * 1024, 'мегабайты до интерфейса не доезжают'

    def test_unknown_name_is_reported_not_written(self, tmp_path, capsys):
        from PIL import Image

        folder = tmp_path / 'src'
        folder.mkdir()
        Image.new('RGB', (64, 64), 'white').save(folder / 'Цезарь.png')
        target = tmp_path / 'out'

        call_command('prepare_icons', source=str(folder), target=str(target))

        out = capsys.readouterr().out
        assert 'Цезарь' in out and 'не найдено' in out
        assert not (target / 'dish-types' / 'Цезарь.webp').exists()

    def test_dry_run_writes_nothing(self, source_dir, tmp_path):
        target = tmp_path / 'out'

        call_command('prepare_icons', source=str(source_dir), target=str(target),
                     dry_run=True)

        assert not target.exists()
