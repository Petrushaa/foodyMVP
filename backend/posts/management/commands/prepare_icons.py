"""
Готовит иконки справочника из исходных картинок: уменьшает и раскладывает.

Исходники — это обычные фотографии на пару мегабайт, а в интерфейсе значок
занимает несколько десятков пикселей. Класть исходники в репозиторий и гонять
их по сети незачем: команда делает уменьшенные копии и складывает туда, откуда
их заберёт `import_icons`.

    python manage.py prepare_icons --from ../icons/meals

Имя файла — ключ записи: у блюда название, у категории код. Что не совпало,
команда покажет вместе с похожими вариантами из справочника — переименовать
проще, чем искать в админке.
"""

import difflib
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from PIL import Image

from posts.models import DishType, Taxon

# Размер с запасом на ретину: в интерфейсе значок около 128 логических пикселей.
SIZE = 256
QUALITY = 82
SOURCE_SUFFIXES = {'.png', '.webp', '.jpg', '.jpeg'}


def _square(image):
    """
    Обрезает по центру до квадрата и уменьшает.

    Плитка в интерфейсе квадратная, а картинка растягивается на неё целиком.
    Широкий кадр без обрезки либо сплющился бы, либо оставил поля — поэтому
    берём середину: у иконок смысл обычно там.
    """
    width, height = image.size
    if width != height:
        side = min(width, height)
        left = (width - side) // 2
        top = (height - side) // 2
        image = image.crop((left, top, left + side, top + side))

    return image.resize((SIZE, SIZE), Image.LANCZOS)


class Command(BaseCommand):
    help = 'Уменьшает исходные картинки и раскладывает их по папкам catalog_icons.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--from', dest='source', required=True,
            help='Папка с исходными картинками.',
        )
        parser.add_argument(
            '--to', dest='target', default='catalog_icons',
            help='Куда складывать. По умолчанию catalog_icons.',
        )
        parser.add_argument(
            '--kind', default='dish-types',
            help='Что это: dish-types, cuisine или type.',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Показать, что будет сделано, ничего не записывая.',
        )

    def handle(self, *args, **options):
        source = Path(options['source'])
        if not source.is_dir():
            raise CommandError(f'Папки {source} нет.')

        kind = options['kind']
        keys = self._catalog_keys(kind)
        target = Path(options['target']) / (
            'dish-types' if kind == 'dish-types' else f'taxons/{kind}'
        )

        prepared = unmatched = 0
        for path in sorted(p for p in source.iterdir()
                           if p.suffix.lower() in SOURCE_SUFFIXES):
            key = self._match(path.stem, keys)
            if key is None:
                unmatched += 1
                hint = difflib.get_close_matches(path.stem, keys, n=1, cutoff=0.4)
                suggestion = f' — похоже на «{hint[0]}»?' if hint else ''
                self.stdout.write(self.style.WARNING(
                    f'  «{path.stem}» в справочнике не найдено{suggestion}'
                ))
                continue

            prepared += 1
            dest = target / f'{key}.webp'
            if options['dry_run']:
                self.stdout.write(f'  {path.name} → {dest}')
                continue

            target.mkdir(parents=True, exist_ok=True)
            image = _square(Image.open(path).convert('RGB'))
            image.save(dest, 'WEBP', quality=QUALITY, method=6)
            self.stdout.write(f'  {path.name} → {dest.name}  {dest.stat().st_size // 1024} КБ')

        self.stdout.write(self.style.SUCCESS(
            ('Так было бы: ' if options['dry_run'] else '')
            + f'Готово: {prepared}, не опознано: {unmatched}'
        ))

    def _catalog_keys(self, kind):
        """Ключи справочника: у блюд названия, у категорий коды."""
        if kind == 'dish-types':
            return list(DishType.objects.values_list('name', flat=True))
        if kind in dict(Taxon.KIND_CHOICES):
            return list(Taxon.objects.filter(kind=kind).values_list('slug', flat=True))
        raise CommandError(
            f'Не знаю вид «{kind}». Ожидаю dish-types или одну из осей: '
            + ', '.join(dict(Taxon.KIND_CHOICES))
        )

    def _match(self, stem, keys):
        """Сопоставление без учёта регистра: «роллы» и «Роллы» это одно и то же."""
        lowered = stem.strip().lower()
        for key in keys:
            if key.lower() == lowered:
                return key
        return None
