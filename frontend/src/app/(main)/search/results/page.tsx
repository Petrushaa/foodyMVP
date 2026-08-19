import { auth } from "@/auth";
import { apiRequest } from "@/lib/api";
import { GlassSurface } from "@/components/feed/glass-surface";
import { SaveRecentSearchQuery } from "@/components/search/save-recent-search-query";
import { MenuItemTile } from "@/components/catalog/menu-item-tile";
import { SearchResultsHeader } from "@/components/search/search-results-header";
import {
  getCuisineCategories,
  getDishCategories,
  getDishGroups,
  getTypeCategories,
} from "@/lib/categories";
import type { CategoryGroups } from "@/components/search/results-category-control";
import {
  getSingleSearchParam,
  normalizeSearchQuery,
} from "@/lib/search";

type SearchResultsPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    tag_name?: string | string[];
    category_id?: string | string[];
    price_min?: string | string[];
    price_max?: string | string[];
    dish_type?: string | string[];
    dish_group?: string | string[];
    cuisine?: string | string[];
    type?: string | string[];
  }>;
};

export default async function SearchResultsPage({
  searchParams,
}: SearchResultsPageProps) {
  const params = await searchParams;
  const query = getSingleSearchParam(params.q);
  const normalizedQuery = normalizeSearchQuery(query);
  const tagName = getSingleSearchParam(params.tag_name);
  const categoryId = getSingleSearchParam(params.category_id);
  const priceMin = getSingleSearchParam(params.price_min);
  const priceMax = getSingleSearchParam(params.price_max);
  // Категория из шапки: оси каталога идут слагами, «Блюда» — названием типа.
  const axes = {
    dish_type: getSingleSearchParam(params.dish_type),
    // Группа блюд: «все супы» вместо перечисления борща с солянкой.
    dish_group: getSingleSearchParam(params.dish_group),
    cuisine: getSingleSearchParam(params.cuisine),
    // Видов можно выбрать несколько — приходят через запятую.
    type: getSingleSearchParam(params.type),
  };

  const session = (await auth()) as any;
  const accessToken: string | null = session?.user?.accessToken ?? null;

  // Три группы для фильтра в шапке: блюда, кухни и виды.
  const [dishes, cuisines, types, dishGroups] = await Promise.all([
    getDishCategories(),
    getCuisineCategories(),
    getTypeCategories(),
    getDishGroups(),
  ]);
  const categoryGroups: CategoryGroups = {
    dishes: dishes.map((c) => ({
      id: `dish-${c.id}`, value: c.id, label: c.label, emoji: c.emoji, icon: c.icon,
      group: c.group, groupName: c.groupName,
    })),
    // Группа ищется целиком и уходит своим параметром — отсюда isGroup.
    dishGroups: dishGroups.map((c) => ({
      id: `dgrp-${c.id}`, value: c.id, label: c.label, emoji: c.emoji, icon: c.icon,
      group: c.group, groupName: c.groupName, isGroup: true,
    })),
    cuisines: cuisines.map((c) => ({ id: `cui-${c.id}`, value: c.id, label: c.label, emoji: c.emoji, icon: c.icon })),
    types: types.map((c) => ({ id: `type-${c.id}`, value: c.id, label: c.label, emoji: c.emoji, icon: c.icon })),
  };

  const qs = new URLSearchParams();
  if (normalizedQuery) qs.set("search", normalizedQuery);
  if (tagName) qs.set("tag_name", tagName);
  if (categoryId) qs.set("category_id", categoryId);
  if (priceMin) qs.set("price_min", priceMin);
  if (priceMax) qs.set("price_max", priceMax);
  for (const [name, value] of Object.entries(axes)) {
    if (value) qs.set(name, value);
  }
  // Ищем позиции, а не посты: человек ищет блюдо, а не чью-то запись о нём.
  // Бэкенд сужает выдачу городом сам, по профилю смотрящего.
  const endpoint = qs.toString() ? `/menu-items/?${qs.toString()}` : "/menu-items/";

  let items: any[] = [];
  try {
    const options: any = { headers: {} };
    if (accessToken) options.headers.Authorization = `Bearer ${accessToken}`;
    const data = await apiRequest(endpoint, options);
    items = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
  } catch {
    /* ignore — отдадим пустые результаты */
  }

  return (
    <main className="absolute inset-0 overflow-hidden">
      <SaveRecentSearchQuery query={query} />
      <div className="absolute inset-0 flex flex-col pt-2">
        <SearchResultsHeader
          key={query.trim()}
          initialQuery={query.trim()}
          categoryGroups={categoryGroups}
        />

        <section
          aria-label="Результаты поиска"
          className="hide-scroll flex-1 overflow-y-auto px-4 pt-2 pb-24"
        >
          {items.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {items.map((item) => (
                // Заведение подписываем: в выдаче попадаются одинаковые блюда
                // из разных мест, и без места их не различить.
                <MenuItemTile key={item.id} item={item} showPlace />
              ))}
            </div>
          ) : (
            <div className="flex h-full flex-col pb-[5.75rem]">
              <GlassSurface className="mt-2 flex flex-1 items-center justify-center rounded-[26px] border border-green-50/92 bg-white/45">
                <div className="max-w-[260px] px-6 text-center">
                  <p className="text-[20px] leading-tight font-extrabold tracking-[-0.35px] text-[#15291C]">
                    Ничего не нашли
                  </p>
                  <p className="mt-2 font-[family-name:var(--font-roboto)] text-[14.5px] leading-[1.45] font-medium text-[#5C6B62]">
                    {normalizedQuery
                      ? `По запросу «${query.trim()}» в вашем городе ничего нет.`
                      : "Введите запрос, чтобы найти блюдо."}
                  </p>
                </div>
              </GlassSurface>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
