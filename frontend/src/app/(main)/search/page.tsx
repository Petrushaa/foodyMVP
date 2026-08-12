import { auth } from "@/auth";
import { SearchComposer } from "@/components/search/search-composer";
import {
  fetchPopularTags,
  getCuisineCategories,
  getDishCategories,
  getPlaceCategories,
} from "@/lib/categories";
import type { CategoryGroups } from "@/components/search/results-category-control";
import { DEFAULT_TWEAKS } from "@/lib/tweaks";

export default async function SearchPage() {
  const session = (await auth()) as any;
  const accessToken: string | undefined = session?.user?.accessToken;

  // Популярные теги из API (для экрана поиска, раздел «Популярное»).
  const popularTags = await fetchPopularTags(accessToken, 12);

  // Категории тремя группами (Блюда / Кухни / Формат) — заглушки на фронте.
  const [dishes, cuisines] = await Promise.all([
    getDishCategories(),
    getCuisineCategories(),
  ]);
  const categoryGroups: CategoryGroups = {
    dishes: dishes.map((c) => ({ id: `dish-${c.id}`, label: c.label, emoji: c.emoji })),
    cuisines: cuisines.map((c) => ({ id: `cui-${c.id}`, label: c.label, emoji: c.emoji })),
    formats: getPlaceCategories().map((c) => ({ id: `fmt-${c.id}`, label: c.label, emoji: c.emoji })),
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
