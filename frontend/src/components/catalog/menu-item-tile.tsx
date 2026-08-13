import { fixMediaUrl } from "@/lib/api";

export type MenuItemTileData = {
  id: number;
  name: string;
  dish_type?: string | null;
  photo?: string | null;
  price?: string | null;
  rating_raw?: number | null;
  ratings_count?: number | null;
  restaurant?: { id: number; name: string } | null;
};

/**
 * Квадратная плитка позиции — та же, что у постов в профиле.
 *
 * `showPlace` включается там, где позиции из разных заведений (поиск): без
 * названия места «Чизбургер» и «Чизбургер» в выдаче не различить. На странице
 * заведения место и так известно, и подпись только мешала бы.
 */
export function MenuItemTile({
  item,
  showPlace = false,
}: {
  item: MenuItemTileData;
  showPlace?: boolean;
}) {
  // Оценки в базе по десятибалльной шкале, в интерфейсе везде пять звёзд.
  const rating =
    item.ratings_count && item.rating_raw
      ? ((item.rating_raw as number) / 2).toFixed(1)
      : null;
  const price = item.price ? `₽${Math.round(parseFloat(item.price))}` : null;
  const photo = fixMediaUrl(item.photo);
  const caption = [price, rating ? `${rating} из 5` : null].filter(Boolean).join(" · ");
  const place = showPlace ? item.restaurant?.name : null;

  return (
    <div className="group relative block aspect-square overflow-hidden rounded-2xl border border-white/65 bg-white/55 shadow-[0_8px_22px_rgba(20,40,28,0.08),inset_1px_1px_0_rgba(255,255,255,0.7)] backdrop-blur-[16px]">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt={item.name}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="grid size-full place-items-center bg-[linear-gradient(135deg,rgba(220,230,222,0.5),rgba(255,255,255,0.7))] p-3 text-center">
          <div>
            <p className="line-clamp-3 text-[14px] font-semibold text-[#15291C]">
              {item.name}
            </p>
            {place && (
              <p className="mt-1 line-clamp-1 text-[11px] font-medium text-[#5C6B62]">
                {place}
              </p>
            )}
            {!place && rating && (
              <p className="mt-1 text-[11px] font-medium text-[#5C6B62]">{rating}</p>
            )}
          </div>
        </div>
      )}

      {/* Поверх фото подпись читается только на затемнении. */}
      {photo && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="pointer-events-none absolute inset-x-2 bottom-2 text-white">
            <p className="line-clamp-2 text-[12.5px] leading-[1.1] font-extrabold">
              {item.name}
            </p>
            {place && (
              <p className="mt-0.5 line-clamp-1 text-[11px] font-medium text-white/85">
                {place}
              </p>
            )}
            <p className="mt-0.5 line-clamp-1 text-[11px] font-medium text-white/85">
              {caption || item.dish_type}
            </p>
          </div>
        </>
      )}

      {/* Без фото цену показываем углом, чтобы плитка не пустовала. */}
      {!photo && price && (
        <div className="pointer-events-none absolute right-2 bottom-2 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-extrabold text-[#15291C]">
          {price}
        </div>
      )}
    </div>
  );
}
