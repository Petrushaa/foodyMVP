"""
Пересчёт категорий позиций по справочнику.

Категории копируются в позицию при одобрении, а не берутся ссылкой: правка
справочника не должна задним числом переписывать готовые позиции. Обратная
сторона — позиция живёт с той разметкой, что была на момент одобрения, и после
правки справочника отстаёт.

Команда догоняет справочник осознанно: запускается руками, показывает, что
изменит, и умеет ничего не делать (--dry-run).
"""

from django.core.management.base import BaseCommand

from posts.models import MenuItem
from posts.services.stats import planned_taxons


class Command(BaseCommand):
    help = 'Пересобирает категории позиций по справочнику блюд.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Показать, что изменится, но ничего не менять.',
        )
        parser.add_argument(
            '--dish', default='',
            help='Только позиции этого блюда — чтобы проверить на одном.',
        )

    def handle(self, *args, **options):
        queryset = MenuItem.objects.select_related('dish_type').prefetch_related('taxons')
        if options['dish']:
            queryset = queryset.filter(dish_type__name__iexact=options['dish'])

        changed = 0
        skipped = 0
        for item in queryset:
            before = {t.name for t in item.taxons.all()}
            wanted = planned_taxons(item)

            # Ручная разметка модератора: догонять нечего, решение принято.
            if wanted is None:
                skipped += 1
                continue

            after = {t.name for t in wanted}
            if after == before:
                continue
            if not options['dry_run']:
                item.taxons.set(wanted)

            changed += 1
            added = ', '.join(sorted(after - before)) or '—'
            removed = ', '.join(sorted(before - after)) or '—'
            self.stdout.write(f'  {item.name} ({item.restaurant.name})')
            self.stdout.write(f'    + {added}')
            if removed != '—':
                self.stdout.write(f'    − {removed}')

        prefix = 'Изменилось бы: ' if options['dry_run'] else 'Обновлено: '
        self.stdout.write(self.style.SUCCESS(f'{prefix}{changed} позиций'))
        if skipped:
            self.stdout.write(
                f'Пропущено с ручной разметкой: {skipped} — их правил модератор.'
            )
