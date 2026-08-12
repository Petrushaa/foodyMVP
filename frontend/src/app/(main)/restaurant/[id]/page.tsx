import { auth } from "@/auth";
import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { GlassSurface } from "@/components/feed/glass-surface";

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = (await auth()) as any;
  const accessToken: string | null = session?.user?.accessToken ?? null;

  let restaurant: any = null;
  try {
    const options: any = { headers: {} };
    if (accessToken) options.headers.Authorization = `Bearer ${accessToken}`;
    restaurant = await apiRequest(`/restaurants/${id}/`, options);
  } catch {
    /* not found */
  }

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

  const categories: string[] = (restaurant.categories || [])
    .map((c: any) => (typeof c === "string" ? c : c?.name))
    .filter(Boolean);

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

            {categories.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {categories.map((c) => (
                  <span
                    key={c}
                    className="rounded-full border border-white/65 bg-white/55 px-3 py-1 text-[12.5px] font-semibold text-[#15291C] shadow-[inset_1px_1px_0_rgba(255,255,255,0.7)]"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </GlassSurface>
        </div>
      </div>
    </main>
  );
}
