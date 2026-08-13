"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { CategoryModeToggle } from "@/components/categories/category-mode-toggle";
import {
  PriceRangeSlider,
  PRICE_MAX,
  PRICE_MIN,
} from "@/components/search/price-range-slider";
import type {
  CategoryChip,
  CategoryGroups,
} from "@/components/search/results-category-control";
import { cn } from "@/lib/utils";

const PRESS_CLASSES =
  "origin-center transition-transform duration-150 ease-out active:scale-[0.94] [-webkit-tap-highlight-color:transparent]";

type Tab = "dishes" | "cuisines" | "formats" | "forms" | "diets";

const TABS: readonly { id: Tab; label: string }[] = [
  { id: "dishes", label: "Блюда" },
  { id: "cuisines", label: "Кухни" },
  { id: "formats", label: "Формат" },
  { id: "forms", label: "Форма" },
  { id: "diets", label: "Особенности" },
];

function toNum(value: string | null, fallback: number) {
  const n = value ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Панель фильтров справа от колонки результатов (только широкие экраны, xl+).
 * Слайдер цены сразу открыт (применяется с дебаунсом), категории — вкладками
 * Блюда/Кухни/Формат. На мобиле/узких экранах не показывается — там кнопки-шторки.
 */
export function ResultsDesktopFilters({ groups }: { groups: CategoryGroups }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentFrom = toNum(searchParams.get("price_min"), PRICE_MIN);
  const currentTo = toNum(searchParams.get("price_max"), PRICE_MAX);
  const currentQuery = (searchParams.get("q") ?? "").trim().toLowerCase();

  const pushParams = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams]
  );

  const applyPrice = useCallback(
    (from: number, to: number) => {
      pushParams((p) => {
        if (from > PRICE_MIN) p.set("price_min", String(from));
        else p.delete("price_min");
        if (to < PRICE_MAX) p.set("price_max", String(to));
        else p.delete("price_max");
      });
    },
    [pushParams]
  );

  // Локальное состояние слайдера + синк с URL + дебаунс применения.
  const [price, setPrice] = useState({ from: currentFrom, to: currentTo });
  useEffect(() => {
    setPrice({ from: currentFrom, to: currentTo });
  }, [currentFrom, currentTo]);
  useEffect(() => {
    if (price.from === currentFrom && price.to === currentTo) return;
    const t = window.setTimeout(() => applyPrice(price.from, price.to), 450);
    return () => window.clearTimeout(t);
  }, [price, currentFrom, currentTo, applyPrice]);

  // Категория — стартовая вкладка по текущему q.
  const matchedTab = useMemo(() => {
    for (const tab of TABS) {
      if (groups[tab.id].some((c) => c.label.trim().toLowerCase() === currentQuery)) {
        return tab.id;
      }
    }
    return null;
  }, [currentQuery, groups]);

  const [tab, setTab] = useState<Tab>(matchedTab ?? "dishes");
  useEffect(() => {
    if (matchedTab) setTab(matchedTab);
  }, [matchedTab]);

  const pickCategory = useCallback(
    (chip: CategoryChip) => {
      const isActive = chip.label.trim().toLowerCase() === currentQuery;
      pushParams((p) => {
        if (isActive) p.delete("q");
        else p.set("q", chip.label);
      });
    },
    [currentQuery, pushParams]
  );

  return (
    <aside className="hide-scroll fixed top-[88px] bottom-6 left-[calc(50%+286px)] z-30 hidden w-[300px] flex-col gap-4 overflow-y-auto xl:flex">
      {/* Цена */}
      <div className="rounded-[20px] border border-white/70 bg-white/70 p-4 shadow-[0_8px_24px_rgba(20,40,28,0.10)] backdrop-blur-[20px]">
        <p className="mb-3 text-[12.5px] font-bold tracking-[0.3px] text-[#5C6B62] uppercase">
          Цена, ₽
        </p>
        <PriceRangeSlider from={price.from} to={price.to} onChange={setPrice} />
      </div>

      {/* Категория */}
      <div className="rounded-[20px] border border-white/70 bg-white/70 p-4 shadow-[0_8px_24px_rgba(20,40,28,0.10)] backdrop-blur-[20px]">
        <p className="mb-3 text-[12.5px] font-bold tracking-[0.3px] text-[#5C6B62] uppercase">
          Категория
        </p>
        <CategoryModeToggle
          aria-label="Тип категории"
          items={TABS}
          value={tab}
          onValueChange={setTab}
        />
        <div className="mt-3 grid grid-cols-3 gap-x-2 gap-y-3">
          {groups[tab].map((chip) => {
            const isActive = chip.label.trim().toLowerCase() === currentQuery;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => pickCategory(chip)}
                aria-pressed={isActive}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-1.5 outline-none",
                  PRESS_CLASSES
                )}
              >
                <span
                  className={cn(
                    "grid aspect-square w-full place-items-center rounded-[16px] text-[22px] transition-colors",
                    isActive
                      ? "bg-[#2ECC71]"
                      : "bg-white shadow-[0_4px_12px_rgba(20,40,28,0.07),inset_0_0_0_1.5px_#2ECC71]"
                  )}
                >
                  <span aria-hidden="true">{chip.emoji}</span>
                </span>
                <span className="line-clamp-2 w-full text-center text-[10.5px] leading-[1.15] font-bold text-[#15291C] [overflow-wrap:anywhere]">
                  {chip.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
