"""
Заливает иконки справочника из папки — чтобы не кликать по одной на 183 записи.

Раскладка папки (по умолчанию `catalog_icons/` в корне бэкенда):

    catalog_icons/
      dish-types/Бургер.png          ← по названию блюда
      taxons/cuisine/japanese.png    ← по оси и коду категории
      taxons/form/sushi.png
      taxons/format/fastfood.png
      taxons/diet/vegan.png

Имя файла — это ключ записи, а не подпись: у блюда название, у категории код.
Код категории уникален только внутри своей оси, поэтому оси разложены по папкам.

Папку держим в репозитории: тогда новое окружение поднимается воспроизводимо,
а админка остаётся для точечных правок.
"""

from pathlib import Path

from django.core.files import File
from django.core.management.base import BaseCommand, CommandError

from posts.models import DishType, Taxon

# Только растр: SVG не проверяется Pillow, а принимать его как файл опасно —
# внутрь можно вложить скрипт, и браузер его выполнит.
SUFFIXES = {'.png', '.webp', '.jpg', '.jpeg'}


class Command(BaseCommand):
    help = 'Загружает иконки блюд и категорий из папки в справочник.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--path', default='catalog_icons',
            help='Папка с иконками. По умолчанию catalog_icons в корне бэкенда.',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Показать, что будет сделано, ничего не записывая.',
        )
        parser.add_argument(
            '--replace', action='store_true',
            help='Перезаписывать уже загруженные иконки. По умолчанию пропускаются.',
        )
        parser.add_argument(
            '--missing', action='store_true',
            help='Показать, каким записям иконки не хватает и как назвать файлы.',
        )

    def handle(self, *args, **options):
        if options['missing']:
            self._report_missing(Path(options['path']))
            return

        root = Path(options['path'])
        if not root.is_dir():
            raise CommandError(f'Папки {root} нет — положите иконки или укажите --path.')

        self.dry_run = options['dry_run']
        self.replace = options['replace']
        self.loaded = self.skipped = self.missed = 0

        self._import_dish_types(root / 'dish-types')
        self._import_taxons(root / 'taxons')

        summary = f'Загружено: {self.loaded}, пропущено: {self.skipped}, без записи: {self.missed}'
        self.stdout.write(self.style.SUCCESS(
            ('Так было бы: ' if self.dry_run else '') + summary
        ))

    def _report_missing(self, root):
        """
        Печатает, какие файлы нужны и каких ещё нет.

        Имя файла — это ключ записи, а в справочнике 183 записи: без такого
        списка их пришлось бы выписывать из админки руками.
        """
        groups = [
            (root / 'dish-types', 'Блюда', [
                (d.name, bool(d.icon)) for d in DishType.objects.all()
            ]),
        ]
        for kind, label in Taxon.KIND_CHOICES:
            groups.append((
                root / 'taxons' / kind,
                f'Категории — {label}',
                [(t.slug, bool(t.icon)) for t in Taxon.objects.filter(kind=kind)],
            ))

        total_missing = 0
        for folder, label, items in groups:
            missing = [key for key, has_icon in items if not has_icon]
            total_missing += len(missing)
            done = len(items) - len(missing)
            self.stdout.write(self.style.MIGRATE_HEADING(
                f'\n{label}: загружено {done} из {len(items)} → {folder}/'
            ))
            for key in missing:
                self.stdout.write(f'  {key}.png')

        self.stdout.write(self.style.SUCCESS(f'\nВсего не хватает: {total_missing}'))

    def _files(self, folder):
        if not folder.is_dir():
            return []
        return sorted(f for f in folder.iterdir() if f.suffix.lower() in SUFFIXES)

    def _import_dish_types(self, folder):
        for path in self._files(folder):
            dish_type = DishType.objects.filter(name__iexact=path.stem).first()
            self._attach(dish_type, path, f'блюдо «{path.stem}»')

    def _import_taxons(self, folder):
        if not folder.is_dir():
            return
        for kind_folder in sorted(p for p in folder.iterdir() if p.is_dir()):
            kind = kind_folder.name
            for path in self._files(kind_folder):
                taxon = Taxon.objects.filter(kind=kind, slug__iexact=path.stem).first()
                self._attach(taxon, path, f'категория {kind}/{path.stem}')

    def _attach(self, obj, path, label):
        if obj is None:
            self.missed += 1
            self.stdout.write(self.style.WARNING(f'  нет записи под {label} — пропускаю'))
            return

        if obj.icon and not self.replace:
            self.skipped += 1
            return

        self.loaded += 1
        if self.dry_run:
            self.stdout.write(f'  {label} ← {path.name}')
            return

        with path.open('rb') as fh:
            # save=True записывает файл в MEDIA_ROOT и обновляет запись.
            obj.icon.save(path.name, File(fh), save=True)
