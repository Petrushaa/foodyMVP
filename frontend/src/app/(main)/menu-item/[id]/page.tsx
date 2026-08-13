import { auth } from "@/auth";
import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";

import { apiRequest, fixMediaUrl } from "@/lib/api";
import { GlassSurface } from "@/components/feed/glass-surface";
import { UserAvatar } from "@/components/feed/user-avatar";

/** «1 оценка», «2 оценки», «5 оценок». */
function plural(n: number, one: string, few: string, many: string) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/**
 * Плитка поста об этой позиции.
 *
 * Название блюда не подписываем — оно у всех постов здесь одинаковое. Вместо
 * него автор и его оценка: страница отвечает на вопрос «кто и как это оценил».
 */
function PostThumb({ post }: { post: any }) {
  const photo = fixMediaUrl(post.images?.[0]?.image);
  const author = post.user?.full_name || post.user?.username || "Аноним";
  // Оценки в базе десятибалльные, в интерфейсе везде пять звёзд.
  const rating = post.author_rating ? (post.author_rating / 2).toFixed(1) : null;

  return (
    <Link
      href={`/dish/${post.id}`}
      className="group relative block aspect-square overflow-hidden rounded-2xl border border-white/65 bg-white/55 shadow-[0_8px_22px_rgba(20,40,28,0.08),inset_1px_1px_0_rgba(255,255,255,0.7)] backdrop-blur-[16px]"
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt={author}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="grid size-full place-items-center bg-[linear-gradient(135deg,rgba(220,230,222,0.5),rgba(255,255,255,0.7))] p-3 text-center">
          <p className="line-clamp-3 text-[13px] font-semibold text-[#15291C]">
            {post.description || author}
          </p>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-2 bottom-2 text-white">
        <p className="line-clamp-1 text-[12px] font-extrabold">{author}</p>
        {rating && (
          <p className="mt-0.5 text-[11px] font-medium text-white/85">{rating} из 5</p>
        )}
      </div>
    </Link>
  );
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
  const rating = item.ratings_count > 0 ? (item.rating_raw / 2).toFixed(1) : null;
  const price = item.price ? `₽${Math.round(parseFloat(item.price))}` : null;
  const taxons: any[] = Array.isArray(item.taxons) ? item.taxons : [];
  const tags: any[] = Array.isArray(item.tags) ? item.tags : [];

  return (
    <main className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 flex flex-col pt-2">
        <header className="flex items-center justify-between gap-3 px-5 pb-3">
          <Link
            href="/search"
            aria-label="Назад"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-white/65 bg-white/58 text-[#15291C] shadow-[0_8px_20px_rgba(20,40,28,0.12),inset_1px_1px_0_rgba(255,255,255,0.78)] backdrop-blur-[18px]"
          >
            <ArrowLeft className="size-5" strokeWidth={2.2} />
          </Link>
          <h1 className="truncate text-[18px] font-extrabold tracking-[-0.3px] text-[#15291C]">
            {item.name}
          </h1>
          <span className="size-10 shrink-0" />
        </header>

        <section className="hide-scroll flex-1 overflow-y-auto px-4 pb-25">
          <GlassSurface className="rounded-[26px] border border-white/65 bg-white/45 px-5 py-6 shadow-[0_8px_24px_rgba(20,40,28,0.10),0_2px_6px_rgba(20,40,28,0.06)]">
            <div className="flex flex-col items-center text-center">
              {/* Та же заглушка, что у людей и заведений: без фото — буква. */}
              <UserAvatar
                name={item.name}
                src={fixMediaUrl(item.photo)}
                size={88}
                className="border-2 shadow-[0_10px_28px_rgba(20,40,28,0.18)]"
              />

              <h2 className="mt-3 text-[22px] font-extrabold tracking-[-0.3px] text-[#15291C]">
                {item.name}
              </h2>

              {item.restaurant && (
                <Link
                  href={`/restaurant/${item.restaurant.id}`}
                  className="mt-1 flex items-center gap-1 text-[13.5px] font-semibold text-[#5C6B62] underline-offset-2 hover:underline"
                >
                  <MapPin className="size-4 shrink-0" strokeWidth={2} />
                  <span>{item.restaurant.name}</span>
                </Link>
              )}

              {item.dish_type && (
                <p className="mt-1 text-[12.5px] font-medium text-[#8A958E]">
                  {item.dish_type}
                </p>
              )}

              {price && (
                <p className="mt-3 text-[24px] font-extrabold tracking-[-0.3px] text-[#15291C]">
                  {price}
                </p>
              )}

              <div className="mt-5 grid w-full max-w-sm grid-cols-3 gap-3">
                <div className="text-center">
                  <div className="text-[20px] font-extrabold text-[#15291C]">
                    {rating ?? "—"}
                  </div>
                  <div className="text-[11.5px] font-semibold tracking-wide text-[#8A958E] uppercase">Оценка</div>
                </div>
                <div className="text-center">
                  <div className="text-[20px] font-extrabold text-[#15291C]">
                    {item.ratings_count ?? 0}
                  </div>
                  <div className="text-[11.5px] font-semibold tracking-wide text-[#8A958E] uppercase">
                    {plural(item.ratings_count ?? 0, "Оценка", "Оценки", "Оценок")}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[20px] font-extrabold text-[#15291C]">
                    {item.posts_count ?? 0}
                  </div>
                  <div className="text-[11.5px] font-semibold tracking-wide text-[#8A958E] uppercase">Посты</div>
                </div>
              </div>

              {(taxons.length > 0 || tags.length > 0) && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {taxons.map((t) => (
                    <span
                      key={`taxon-${t.id}`}
                      className="rounded-full border border-white/65 bg-white/55 px-3 py-1 text-[12.5px] font-semibold text-[#15291C] shadow-[inset_1px_1px_0_rgba(255,255,255,0.7)]"
                    >
                      {t.emoji ? `${t.emoji} ` : ""}
                      {t.name}
                    </span>
                  ))}
                  {/* Теги показываются, только когда их написали разные люди, —
                      это уже отфильтровал бэкенд. */}
                  {tags.map((t) => (
                    <span
                      key={`tag-${t.id}`}
                      className="rounded-full bg-[#2ECC71]/12 px-3 py-1 text-[12.5px] font-semibold text-[#15291C]"
                    >
                      #{t.name}
                    </span>
                  ))}
                </div>
              )}

              {item.brand_rating && (
                <p className="mt-4 text-[12.5px] font-medium text-[#5C6B62]">
                  По сети: {(item.brand_rating.rating_raw / 2).toFixed(1)} из 5 ·{" "}
                  {item.brand_rating.restaurants_count}{" "}
                  {plural(
                    item.brand_rating.restaurants_count,
                    "заведение",
                    "заведения",
                    "заведений"
                  )}
                </p>
              )}
            </div>
          </GlassSurface>

          <h2 className="mt-6 mb-1 px-1 text-[16px] font-extrabold tracking-[-0.2px] text-[#15291C]">
            Кто пробовал
          </h2>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {posts.length === 0 ? (
              <div className="col-span-full py-10 text-center text-[14px] font-medium text-[#5C6B62]">
                Об этом блюде ещё никто не написал.
              </div>
            ) : (
              posts.map((post) => <PostThumb key={post.id} post={post} />)
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
