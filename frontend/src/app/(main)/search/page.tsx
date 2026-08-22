import { auth } from "@/auth";
import { SearchComposer } from "@/components/search/search-composer";
import {
  fetchPopularTags,
  getCuisineCategories,
  getDishCategories,
  getTypeCategories,
} from "@/lib/categories";
import type { CategoryGroups } from "@/components/search/results-category-control";
import { DEFAULT_TWEAKS } from "@/lib/tweaks";

export default async function SearchPage() {
  const session = (await auth()) as any;
  const accessToken: string | undefined = session?.user?.accessToken;

  // Популярные теги из API (для экрана поиска, раздел «Популярное»).
  const popularTags = await fetchPopularTags(accessToken, 12);

  // Три группы: блюда, кухни и виды. Приходят с бэкенда вместе с иконками.
  const [dishes, cuisines, types] = await Promise.all([
    getDishCategories(),
    getCuisineCategories(),
    getTypeCategories(),
  ]);
  const categoryGroups: CategoryGroups = {
    dishes: dishes.map((c) => ({ id: `dish-${c.id}`, value: c.id, label: c.label, emoji: c.emoji, icon: c.icon })),
    cuisines: cuisines.map((c) => ({ id: `cui-${c.id}`, value: c.id, label: c.label, emoji: c.emoji, icon: c.icon })),
    types: types.map((c) => ({ id: `type-${c.id}`, value: c.id, label: c.label, emoji: c.emoji, icon: c.icon })),
  };

  return (
    <main className="absolute inset-0 overflow-hidden">
      <SearchComposer
        brand={DEFAULT_TWEAKS.brand}
        popularTags={popularTags}
        categoryGroups={categoryGroups}
      />
    </main>
  );
}
