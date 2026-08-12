import Link from "next/link";
import { notFound } from "next/navigation";

import { endpoints } from "@/lib/api/endpoints";
import { tryFetch } from "@/lib/api/server";
import type { MenuItem, Paginated, Restaurant } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Страница заведения: адрес и его блюда, лучшие сверху. Открыта гостям. */
export default async function RestaurantPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const restaurantId = Number(id);

  const [restaurant, menu] = await Promise.all([
    tryFetch<Restaurant>(endpoints.restaurant(restaurantId)),
    tryFetch<Paginated<MenuItem>>(endpoints.restaurantMenu(restaurantId)),
  ]);

  if (!restaurant) notFound();

  return (
    <div className="pb-10">
      <header className="border-b border-neutral-100 px-4 py-5">
        <h1 className="text-xl font-semibold">{restaurant.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {restaurant.address}
          {restaurant.city && ` · ${restaurant.city}`}
        </p>
        {restaurant.is_closed && (
          <p className="mt-2 rounded-xl bg-neutral-100 px-3 py-2 text-sm text-neutral-600">
            Заведение закрылось. Посты о нём остаются — история никуда не девается.
          </p>
        )}
      </header>

      <ul>
        {(menu?.results ?? []).map((item) => (
          <li key={item.id} className="border-b border-neutral-100">
            <Link href={`/menu-item/${item.id}`} className="flex items-center gap-4 px-4 py-4">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.name}</span>
                <span className="block text-sm text-neutral-400">
                  {item.ratings_count > 0
                    ? `${item.rating_raw.toFixed(1)} / 10 · ${item.ratings_count} оценок`
                    : "Пока без оценок"}
                </span>
              </span>
              {item.price && (
                <span className="shrink-0 text-sm text-neutral-500">
                  {Math.round(Number(item.price))} ₽
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {(menu?.results?.length ?? 0) === 0 && (
        <p className="px-4 py-16 text-center text-sm text-neutral-400">
          Про блюда этого заведения ещё никто не написал
        </p>
      )}
    </div>
  );
}
