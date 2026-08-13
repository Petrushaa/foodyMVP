import { auth } from "@/auth";
import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { GlassSurface } from "@/components/feed/glass-surface";
import { UserAvatar } from "@/components/feed/user-avatar";

/** «1 пост», «2 поста», «5 постов». */
function plural(n: number, one: string, few: string, many: string) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function MenuItemRow({ item }: { item: any }) {
  // Оценки в базе по десятибалльной шкале, в интерфейсе везде пять звёзд.
  const rating = item.ratings_count > 0 ? (item.rating_raw / 2).toFixed(1) : null;

  return (
    <GlassSurface className="flex items-center justify-between gap-3 rounded-[22px] border border-white/65 bg-white/45 px-4 py-3 shadow-[0_8px_24px_rgba(20,40,28,0.10),0_2px_6px_rgba(20,40,28,0.06)]">
      <div className="min-w-0">
        <div className="truncate text-[15px] font-extrabold tracking-[-0.2px] text-[#15291C]">
          {item.name}
        </div>
        <div className="mt-0.5 truncate text-[12.5px] font-medium text-[#5C6B62]">
          {item.dish_type}
          {rating
            ? ` · ${rating} из 5 · ${item.ratings_count} ${plural(
                item.ratings_count,
                "оценка",
                "оценки",
                "оценок"
              )}`
            : " · пока без оценок"}
        </div>
      </div>

      {item.price && (
        <div className="shrink-0 text-[15px] font-extrabold text-[#15291C]">
          ₽{Math.round(parseFloat(item.price))}
        </div>
      )}
    </GlassSurface>
  );
}

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = (await auth()) as any;
  const accessToken: string | null = session?.user?.accessToken ?? null;

  const options: any = { headers: {} };
  if (accessToken) options.headers.Authorization = `Bearer ${accessToken}`;

  // Меню запрашиваем сразу: без него страница заведения — это одна строка адреса.
  const [restaurant, menu] = await Promise.all([
    apiRequest(`/restaurants/${id}/`, options).catch(() => null),
    apiRequest(`/restaurants/${id}/menu/`, options).catch(() => null),
  ]);

  if (!restaurant) {
    return (
      <main className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 flex flex-col px-4 pt-16 pb-25">
          <GlassSurface className="flex flex-1 items-center justify-center rounded-[26px] border border-white/65 bg-white/45">
            <div className="max-w-[280px] px-6 text-center">
              <p className="text-[20px] font-extrabold text-[#15291C]">Заведение не найдено</p>
            </div>
          </GlassSurface>
        </div>
      </main>
    );
  }

  const menuItems: any[] = Array.isArray(menu?.results) ? menu.results : [];
  const stats = {
    // Позиций может быть больше, чем на первой странице, поэтому берём count.
    items: menu?.count ?? menuItems.length,
    posts: restaurant.posts_count ?? 0,
    // Сколько разных людей писали об этом месте — по этому же числу
    // заведение считается подтверждённым.
    authors: restaurant.contributors_count ?? 0,
  };

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
            {restaurant.name}
          </h1>
          <span className="size-10 shrink-0" />
        </header>

        <section className="hide-scroll flex-1 overflow-y-auto px-4 pb-25">
          <GlassSurface className="rounded-[26px] border border-white/65 bg-white/45 px-5 py-6 shadow-[0_8px_24px_rgba(20,40,28,0.10),0_2px_6px_rgba(20,40,28,0.06)]">
            <div className="flex flex-col items-center text-center">
              {/* Тот же компонент, что у людей в профиле и ленте: заведение без
                  фотографии получает такую же букву, а не отдельную заглушку. */}
              <UserAvatar
                name={restaurant.name}
                size={88}
                className="border-2 shadow-[0_10px_28px_rgba(20,40,28,0.18)]"
              />

              <h2 className="mt-3 text-[22px] font-extrabold tracking-[-0.3px] text-[#15291C]">
                {restaurant.name}
              </h2>

              {(restaurant.address || restaurant.city) && (
                <div className="mt-1 flex items-center gap-1 text-[13.5px] font-medium text-[#5C6B62]">
                  <MapPin className="size-4 shrink-0" strokeWidth={2} />
                  <span>
                    {[restaurant.address, restaurant.city].filter(Boolean).join(", ")}
                  </span>
                </div>
              )}

              {restaurant.is_closed && (
                <p className="mt-3 rounded-full bg-red-100/90 px-3 py-1 text-[12.5px] font-bold text-red-900">
                  Закрыто
                </p>
              )}

              <div className="mt-5 grid w-full max-w-sm grid-cols-3 gap-3">
                <div className="text-center">
                  <div className="text-[20px] font-extrabold text-[#15291C]">{stats.items}</div>
                  <div className="text-[11.5px] font-semibold tracking-wide text-[#8A958E] uppercase">Позиции</div>
                </div>
                <div className="text-center">
                  <div className="text-[20px] font-extrabold text-[#15291C]">{stats.posts}</div>
                  <div className="text-[11.5px] font-semibold tracking-wide text-[#8A958E] uppercase">Посты</div>
                </div>
                <div className="text-center">
                  <div className="text-[20px] font-extrabold text-[#15291C]">{stats.authors}</div>
                  <div className="text-[11.5px] font-semibold tracking-wide text-[#8A958E] uppercase">Авторы</div>
                </div>
              </div>
            </div>
          </GlassSurface>

          <h2 className="mt-6 mb-1 px-1 text-[16px] font-extrabold tracking-[-0.2px] text-[#15291C]">
            Позиции
          </h2>

          <div className="mt-3 flex flex-col gap-2">
            {menuItems.length === 0 ? (
              <div className="py-10 text-center text-[14px] font-medium text-[#5C6B62]">
                Здесь пока ничего не пробовали — ваш пост станет первым.
              </div>
            ) : (
              menuItems.map((item) => <MenuItemRow key={item.id} item={item} />)
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
