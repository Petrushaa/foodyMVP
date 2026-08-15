"""
Расставляет справочник в порядке, записанном в `catalog_order.txt`.

Порядок задаётся в админке и живёт в базе, то есть на новое окружение сам
не поедет. Файл в репозитории решает это: расставили один раз — порядок
приезжает вместе с деплоем куда угодно.

По умолчанию команда **только проставляет перечисленное** и не трогает
остальное, поэтому точечные правки в админке переживают перезапуск. `--reset`
делает файл единственным источником правды: всё, чего в нём нет, теряет порядок
и уходит в конец по алфавиту.
"""

from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from posts.models import DishType, Taxon

DISH_SECTION = 'dish-types'
TAXON_SECTIONS = ('cuisine', 'format', 'form', 'diet')


def parse(path):
    """Разбирает файл в {секция: [ключ, ...]}. Порядок строк — это и есть порядок."""
    sections = {}
    current = None

    for raw in path.read_text(encoding='utf-8').splitlines():
        line = raw.split('#', 1)[0].strip()
        if not line:
            continue
        if line.startswith('[') and line.endswith(']'):
            current = line[1:-1].strip()
            sections.setdefault(current, [])
            continue
        if current is not None:
            sections[current].append(line)

    return sections


class Command(BaseCommand):
    help = 'Расставляет блюда и категории в порядке из catalog_order.txt.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--path', default='catalog_order.txt',
            help='Файл с порядком. По умолчанию catalog_order.txt в корне бэкенда.',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Показать, что будет сделано, ничего не записывая.',
        )
        parser.add_argument(
            '--reset', action='store_true',
            help='Сбросить порядок у всего, чего нет в файле.',
        )

    def handle(self, *args, **options):
        path = Path(options['path'])
        if not path.is_file():
            raise CommandError(f'Файла {path} нет — укажите --path.')

        self.dry_run = options['dry_run']
        sections = parse(path)
        self.applied = self.missed = 0

        if options['reset']:
            self._reset(sections)

        for position, name in enumerate(sections.get(DISH_SECTION, []), start=1):
            self._set(DishType.objects.filter(name__iexact=name), position, f'блюдо «{name}»')

        for kind in TAXON_SECTIONS:
            for position, slug in enumerate(sections.get(kind, []), start=1):
                self._set(
                    Taxon.objects.filter(kind=kind, slug__iexact=slug),
                    position, f'категория {kind}/{slug}',
                )

        summary = f'Расставлено: {self.applied}, не найдено: {self.missed}'
        self.stdout.write(self.style.SUCCESS(
            ('Так было бы: ' if self.dry_run else '') + summary
        ))

    def _reset(self, sections):
        """Всё, чего нет в файле, возвращается в общий алфавитный хвост."""
        if self.dry_run:
            self.stdout.write('  сброс порядка у всего, чего нет в файле')
            return

        # Сравниваем без учёта регистра, поэтому собираем id перечисленных,
        # а не сверяем строки: `__in` регистр учитывает и сбросил бы их тоже.
        listed = [
            pk
            for name in sections.get(DISH_SECTION, [])
            for pk in DishType.objects.filter(name__iexact=name).values_list('pk', flat=True)
        ]
        DishType.objects.exclude(pk__in=listed).update(sort_order=None)

        for kind in TAXON_SECTIONS:
            listed = [
                pk
                for slug in sections.get(kind, [])
                for pk in Taxon.objects.filter(kind=kind, slug__iexact=slug)
                .values_list('pk', flat=True)
            ]
            Taxon.objects.filter(kind=kind).exclude(pk__in=listed).update(sort_order=None)

    def _set(self, queryset, position, label):
        if not queryset.exists():
            self.missed += 1
            self.stdout.write(self.style.WARNING(f'  нет записи под {label} — пропускаю'))
            return

        self.applied += 1
        if self.dry_run:
            self.stdout.write(f'  {label} → {position}')
            return

        queryset.update(sort_order=position)
