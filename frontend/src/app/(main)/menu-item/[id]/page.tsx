import { auth } from "@/auth";
import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";

import { apiRequest, fixMediaUrl } from "@/lib/api";
import { GuestPhotos } from "@/components/catalog/guest-photos";
import type { GuestShot } from "@/components/catalog/guest-photos";
import { ReviewCard } from "@/components/catalog/review-card";
import { RatingStars } from "@/components/feed/rating-stars";
import { GlassSurface } from "@/components/feed/glass-surface";
import { CategoryIcon } from "@/components/categories/category-icon";

/** «1 фото», «2 фото», «5 фотографий». */
function plural(n: number, one: string, few: string, many: string) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
}

export default async function MenuItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = (await auth()) as any;
  const accessToken: string | null = session?.user?.accessToken ?? null;

  const options: any = { headers: {} };
  if (accessToken) options.headers.Authorization = `Bearer ${accessToken}`;

  const [item, postsData] = await Promise.all([
    apiRequest(`/menu-items/${id}/`, options).catch(() => null),
    apiRequest(`/menu-items/${id}/posts/`, options).catch(() => null),
  ]);

  if (!item) {
    return (
      <main className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 flex flex-col px-4 pt-16 pb-25">
          <GlassSurface className="flex flex-1 items-center justify-center rounded-[26px] border border-white/65 bg-white/45">
            <div className="max-w-[280px] px-6 text-center">
              <p className="text-[20px] font-extrabold text-[#15291C]">Блюдо не найдено</p>
            </div>
          </GlassSurface>
        </div>
      </main>
    );
  }

  const posts: any[] = Array.isArray(postsData?.results) ? postsData.results : [];

  // Все снимки гостей в одной ленте: каждый помнит, из какого он поста,
  // чтобы с фотографии можно было уйти к автору и целому отзыву.
  const shots: GuestShot[] = posts.flatMap((post) =>
    (post.images ?? [])
      .map((image: any) => fixMediaUrl(image.image))
      .filter(Boolean)
      .map((url: string) => ({
        url,
        postId: post.id,
        author: post.user?.full_name || post.user?.username || "Аноним",
        avatar: fixMediaUrl(post.user?.avatar) || undefined,
        rating: post.author_rating ? post.author_rating / 2 : null,
        text: post.description || "",
      })),
  );

  const heroShots = shots.length > 0 ? shots : null;
  const rating = item.ratings_count > 0 ? item.rating_raw / 2 : null;
  const price = item.price ? `₽${Math.round(parseFloat(item.price))}` : null;
  const priceDate = formatDate(item.price_confirmed_at);
  const cuisine = (item.taxons ?? []).find((t: any) => t.kind === "cuisine");
  const types = (item.taxons ?? []).filter((t: any) => t.kind === "type");

  return (
    <main className="absolute inset-0 overflow-hidden">
      <div className="hide-scroll absolute inset-0 overflow-y-auto pb-25">
        {/* ─── Витрина: кадр во всю ширину, поверх него всё главное ─── */}
        <div className="relative">
          {heroShots ? (
            <div className="hide-scroll flex snap-x snap-mandatory overflow-x-auto">
              {heroShots.map((shot, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={shot.url}
                  alt={item.name}
                  className="aspect-[4/3] w-full shrink-0 snap-center object-cover"
                />
              ))}
            </div>
          ) : (
            <div className="grid aspect-[4/3] w-full place-items-center bg-[linear-gradient(135deg,rgba(220,230,222,0.65),rgba(255,255,255,0.85))]">
              <span className="text-[15px] font-semibold text-[#8A958E]">
                Фотографий пока нет
              </span>
            </div>
          )}

          {/* Затемнение снизу: белый текст поверх светлой еды иначе не читается. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
            <Link
              href="/search"
              aria-label="Назад"
              className="grid size-10 place-items-center rounded-full bg-white/90 text-[#15291C] shadow-[0_6px_18px_rgba(20,40,28,0.20)] backdrop-blur-[10px]"
            >
              <ArrowLeft className="size-5" strokeWidth={2.3} />
            </Link>
          </div>

          <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {rating !== null && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/92 px-2.5 py-1">
                  <RatingStars rating={rating} size={14} />
                  <span className="text-[12.5px] font-extrabold text-[#15291C] tabular-nums">
                    {rating.toFixed(1)}
                  </span>
                </span>
              )}
              {cuisine && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/92 px-2.5 py-1 text-[12px] font-bold text-[#15291C]">
                  <CategoryIcon icon={cuisine.icon} emoji={cuisine.emoji} size={14} />
                  {cuisine.name}
                </span>
              )}
            </div>

            <h1 className="mt-2 text-[26px] leading-[1.1] font-extrabold tracking-[-0.4px] text-white">
              {item.name}
            </h1>

            {item.restaurant && (
              <Link
                href={`/restaurant/${item.restaurant.id}`}
                className="mt-1 flex items-center gap-1 text-[13.5px] font-semibold text-white/90 underline-offset-2 hover:underline"
              >
                <MapPin className="size-4 shrink-0" strokeWidth={2.2} />
                <span className="truncate">
                  {item.restaurant.name}
                  {item.restaurant.address ? ` · ${item.restaurant.address}` : ""}
                </span>
              </Link>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-5 px-4 pt-5">
          {/* ─── Цена и переход к своему отзыву ─── */}
          <GlassSurface className="rounded-[22px] border border-white/65 bg-white/45 px-4 py-3 shadow-[0_8px_24px_rgba(20,40,28,0.10)]">
            <div className="text-[24px] leading-none font-extrabold tracking-[-0.4px] text-[#15291C]">
              {price ?? "—"}
            </div>
            <div className="mt-1 text-[11px] font-bold tracking-wide text-[#8A958E] uppercase">
              {priceDate ? `Цена подтверждена ${priceDate}` : "Цену ещё не подтверждали"}
            </div>
          </GlassSurface>

          {types.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {types.map((t: any) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/65 bg-white/55 px-3 py-1 text-[12.5px] font-semibold text-[#15291C]"
                >
                  <CategoryIcon icon={t.icon} emoji={t.emoji} size={16} />
                  {t.name}
                </span>
              ))}
            </div>
          )}

          {item.brand_rating && (
            <p className="text-[12.5px] font-medium text-[#5C6B62]">
              По сети: {(item.brand_rating.rating_raw / 2).toFixed(1)} из 5 ·{" "}
              {item.brand_rating.restaurants_count}{" "}
              {plural(
                item.brand_rating.restaurants_count,
                "заведение",
                "заведения",
                "заведений",
              )}
            </p>
          )}

          {/* ─── Снимки гостей с куском отзыва ─── */}
          {shots.length > 0 && (
            <section>
              <h2 className="mb-2.5 flex items-baseline gap-2 px-1 text-[16px] font-extrabold tracking-[-0.2px] text-[#15291C]">
                Фотографии гостей
                <span className="text-[13px] font-bold text-[#8A958E] tabular-nums">
                  {shots.length}
                </span>
              </h2>
              <GuestPhotos shots={shots} dishName={item.name} />
            </section>
          )}

          {/* ─── Отзывы ─── */}
          <section>
            <h2 className="mb-2.5 px-1 text-[16px] font-extrabold tracking-[-0.2px] text-[#15291C]">
              Отзывы
              {item.ratings_count > 0 && (
                <span className="ml-1.5 text-[13px] font-bold text-[#8A958E]">
                  {item.ratings_count}
                </span>
              )}
            </h2>

            <div className="flex flex-col gap-2.5">
              {posts.length === 0 ? (
                <div className="py-10 text-center text-[14px] font-medium text-[#5C6B62]">
                  Об этом блюде ещё никто не написал.
                </div>
              ) : (
                posts.map((post) => (
                  <ReviewCard
                    key={post.id}
                    review={{
                      postId: post.id,
                      author: post.user?.full_name || post.user?.username || "Аноним",
                      avatar: fixMediaUrl(post.user?.avatar) || undefined,
                      when: post.created_at
                        ? new Date(post.created_at).toLocaleDateString("ru-RU")
                        : "",
                      rating: post.author_rating ? post.author_rating / 2 : null,
                      text: post.description || "",
                      photos: (post.images ?? [])
                        .map((image: any) => fixMediaUrl(image.image))
                        .filter(Boolean) as string[],
                    }}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
