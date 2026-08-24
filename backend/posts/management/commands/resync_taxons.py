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
from posts.services.stats import resync_menu_item_taxons


class Command(BaseCommand):
    help = 'Пересобирает категории позиций из блюда и отметок авторов.'

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
        for item in queryset:
            before = {t.name for t in item.taxons.all()}

            if options['dry_run']:
                # Считаем, но не сохраняем: показать разницу можно и так.
                from posts.models import (
                    AUTHOR_TAXON_SLUGS, MEAT_SLUGS, MEATLESS_SLUGS, Taxon,
                )
                from posts.services.stats import _visible_posts

                wanted = set(
                    item.dish_type.default_taxons.all() if item.dish_type_id else []
                ) | set(
                    Taxon.objects.filter(
                        draft_posts__in=_visible_posts(item),
                        kind=Taxon.KIND_TYPE, slug__in=AUTHOR_TAXON_SLUGS,
                    ).distinct()
                )
                if any(t.slug in MEATLESS_SLUGS for t in wanted):
                    wanted = {t for t in wanted if t.slug not in MEAT_SLUGS}
                after = {t.name for t in wanted}
                if after == before:
                    continue
            else:
                if not resync_menu_item_taxons(item):
                    continue
                item.refresh_from_db()
                after = {t.name for t in item.taxons.all()}

            changed += 1
            added = ', '.join(sorted(after - before)) or '—'
            removed = ', '.join(sorted(before - after)) or '—'
            self.stdout.write(f'  {item.name} ({item.restaurant.name})')
            self.stdout.write(f'    + {added}')
            if removed != '—':
                self.stdout.write(f'    − {removed}')

        prefix = 'Изменилось бы: ' if options['dry_run'] else 'Обновлено: '
        self.stdout.write(self.style.SUCCESS(f'{prefix}{changed} позиций'))
