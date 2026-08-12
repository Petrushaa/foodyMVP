import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { PostItem } from "@/components/feed/post-item";
import { endpoints } from "@/lib/api/endpoints";
import { tryFetch } from "@/lib/api/server";
import type { MenuItemDetail, Paginated, Post } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Страница блюда: рейтинг, цена, теги и все посты про него. Открыта гостям. */
export default async function MenuItemPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const itemId = Number(id);

  const [session, item, posts] = await Promise.all([
    auth() as Promise<{ user?: { accessToken?: string } } | null>,
    tryFetch<MenuItemDetail>(endpoints.menuItem(itemId)),
    tryFetch<Paginated<Post>>(endpoints.menuItemPosts(itemId)),
  ]);

  if (!item) notFound();

  return (
    <div className="pb-10">
      <header className="border-b border-neutral-100 px-4 py-5">
        <h1 className="text-xl font-semibold">{item.name}</h1>
        <Link
          href={`/restaurant/${item.restaurant.id}`}
          className="mt-1 block text-sm text-neutral-500"
        >
          {item.restaurant.name} · {item.restaurant.address}
        </Link>

        <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
          {item.ratings_count > 0 ? (
            <span>
              <span className="text-2xl font-semibold">{item.rating_raw.toFixed(1)}</span>
              <span className="text-sm text-neutral-400">
                {" "}
                / 10 · по {item.ratings_count}{" "}
                {plural(item.ratings_count, "оценке", "оценкам", "оценкам")}
              </span>
            </span>
          ) : (
            <span className="text-sm text-neutral-400">Пока без оценок</span>
          )}

          {item.price && (
            <span className="text-sm">
              <span className="font-medium">{Math.round(Number(item.price))} ₽</span>
              {item.price_confirmed_at && (
                <span className="text-neutral-400">
                  {" "}
                  · подтверждено {formatMonth(item.price_confirmed_at)}
                </span>
              )}
            </span>
          )}
        </div>

        {/* У сетевых блюд показываем два числа: в этой точке и по всей сети.
            В отдельной точке оценок мало, а блюдо в сети примерно одинаковое. */}
        {item.brand_rating && (
          <p className="mt-2 text-sm text-neutral-500">
            По всей сети: {item.brand_rating.rating_raw.toFixed(1)} / 10 · по{" "}
            {item.brand_rating.ratings_count} оценкам в {item.brand_rating.restaurants_count}{" "}
            заведениях
          </p>
        )}

        {item.taxons.length > 0 && (
          <p className="mt-3 text-sm text-neutral-400">
            {item.taxons.map((taxon) => taxon.name).join(" · ")}
          </p>
        )}

        {/* Только теги, которые написали несколько разных людей. */}
        {item.tags.length > 0 && (
          <p className="mt-2 text-sm text-neutral-400">
            {item.tags.map((tag) => `#${tag.name}`).join(" ")}
          </p>
        )}
      </header>

      {(posts?.results ?? []).map((post) => (
        <PostItem
          key={post.id}
          post={post}
          canInteract={Boolean(session?.user?.accessToken)}
        />
      ))}

      {(posts?.results?.length ?? 0) === 0 && (
        <p className="px-4 py-16 text-center text-sm text-neutral-400">
          Про это блюдо ещё никто не написал
        </p>
      )}
    </div>
  );
}

function formatMonth(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}

function plural(count: number, one: string, few: string, many: string) {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = count % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
