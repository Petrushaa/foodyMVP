import { auth } from "@/auth";
import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { GlassSurface } from "@/components/feed/glass-surface";

/** «1 пост», «2 поста», «5 постов». */
function plural(n: number, one: string, few: string, many: string) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
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
  const menuItems: any[] = Array.isArray(menu?.results) ? menu.results : [];

  if (!restaurant) {
    return (
      <main className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 flex flex-col px-4 pt-16 pb-25">
          <GlassSurface className="flex flex-1 items-center justify-center rounded-[26px] border border-white/65 bg-white/45">
            <div className="max-w-[260px] px-6 text-center">
              <p className="text-[20px] font-extrabold text-[#15291C]">Заведение не найдено</p>
            </div>
          </GlassSurface>
        </div>
      </main>
    );
  }

  return (
    <main className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 flex flex-col pt-2">
        <header className="mb-2 flex items-center gap-3 px-5">
          <Link
            href="/search"
            aria-label="Назад"
            className="grid size-9 place-items-center rounded-full border border-white/65 bg-white/58 text-[#15291C] shadow-[0_8px_20px_rgba(20,40,28,0.14),inset_1px_1px_0_rgba(255,255,255,0.86)] backdrop-blur-[18px]"
          >
            <ArrowLeft className="size-[18px]" strokeWidth={2.35} />
          </Link>
          <h1 className="text-[20px] font-extrabold tracking-[-0.3px] text-[#15291C]">
            Заведение
          </h1>
        </header>

        <div className="hide-scroll flex-1 overflow-y-auto px-4 pb-25 pt-2">
          <GlassSurface className="rounded-[26px] border border-white/65 bg-white/45 px-5 py-6 shadow-[0_8px_24px_rgba(20,40,28,0.10),0_2px_6px_rgba(20,40,28,0.06)]">
            <h2 className="text-[26px] font-extrabold tracking-[-0.3px] text-[#15291C]">
              {restaurant.name}
            </h2>

            {restaurant.address && (
              <div className="mt-2 flex items-center gap-1.5 text-[14px] font-medium text-[#5C6B62]">
                <MapPin className="size-4" strokeWidth={2} />
                <span>{restaurant.address}</span>
              </div>
            )}

            {restaurant.posts_count > 0 && (
              <p className="mt-3 text-[13px] font-medium text-[#5C6B62]">
                {restaurant.posts_count}{" "}
                {plural(restaurant.posts_count, "пост", "поста", "постов")}
              </p>
            )}
          </GlassSurface>

          <h2 className="mt-6 mb-1 px-1 text-[16px] font-extrabold tracking-[-0.2px] text-[#15291C]">
            Что здесь ели
          </h2>

          <div className="mt-3 flex flex-col gap-2">
            {menuItems.length === 0 ? (
              <p className="py-8 text-center text-[14px] font-medium text-[#5C6B62]">
                Пока ни одного блюда — ваш пост станет первым.
              </p>
            ) : (
              menuItems.map((item) => (
                <GlassSurface
                  key={item.id} className="flex items-center justify-between gap-3 rounded-[22px] border border-white/65 bg-white/45 px-4 py-3 shadow-[0_8px_24px_rgba(20,40,28,0.10),0_2px_6px_rgba(20,40,28,0.06)]">
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-extrabold tracking-[-0.2px] text-[#15291C]">
                        {item.name}
                      </div>
                      <div className="truncate text-[12.5px] font-medium text-[#5C6B62]">
                        {item.dish_type}
                        {item.ratings_count > 0
                          ? ` · ${(item.rating_raw / 2).toFixed(1)} из 5`
                          : " · без оценок"}
                      </div>
                    </div>
                    {item.price && (
                      <div className="shrink-0 text-[15px] font-extrabold text-[#15291C]">
                        ₽{Math.round(parseFloat(item.price))}
                      </div>
                    )}
                </GlassSurface>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
