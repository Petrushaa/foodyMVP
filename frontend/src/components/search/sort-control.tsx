"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Порядок выдачи поиска.
 *
 * Один порядок не отвечает на все вопросы сразу: «где поесть подешевле» и «что
 * тут вообще хвалят» — разные запросы к одному и тому же списку.
 *
 * Значения совпадают с ключами `MenuItemViewSet.SORTS` на бэкенде. Пустое
 * значение означает «не присылать параметр»: порядок по умолчанию решает
 * сервер, и при текстовом поиске он не рейтинговый, а по близости к запросу.
 */
const SORTS = [
  { value: "", label: "Сначала лучшие" },
  { value: "price", label: "Сначала дешёвые" },
  { value: "price_desc", label: "Сначала дорогие" },
  { value: "reviews", label: "Больше отзывов" },
  { value: "new", label: "Новые" },
];

export function SortControl({ hasQuery }: { hasQuery: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("sort") ?? "";

  const apply = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set("sort", value);
      else params.delete("sort");
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  // При текстовом поиске порядок по умолчанию — по близости к запросу, а не по
  // рейтингу. Называть его «сначала лучшие» было бы враньём: на «шаурма» сверху
  // окажется самая похожая по названию, а не самая вкусная.
  const options = hasQuery
    ? [{ value: "", label: "Сначала похожие" },
       { value: "rating", label: "По рейтингу" },
       ...SORTS.slice(1)]
    : SORTS;

  return (
    <div
      role="group"
      aria-label="Порядок выдачи"
      className="hide-scroll -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1"
    >
      {options.map((option) => {
        const isOn = current === option.value;
        return (
          <button
            key={option.value || "default"}
            type="button"
            onClick={() => apply(option.value)}
            aria-pressed={isOn}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
              "origin-center duration-150 ease-out active:scale-[0.95] [-webkit-tap-highlight-color:transparent]",
              isOn
                ? "bg-[#15291C] text-white"
                : "bg-[rgba(20,40,28,0.05)] text-[#13251a] hover:bg-[rgba(20,40,28,0.09)]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
