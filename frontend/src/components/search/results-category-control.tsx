"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UtensilsCrossed, X } from "lucide-react";

import { CategoryModeToggle } from "@/components/categories/category-mode-toggle";
import { cn } from "@/lib/utils";

const PRESS_CLASSES =
  "origin-center transition-transform duration-150 ease-out active:scale-[0.94] [-webkit-tap-highlight-color:transparent]";

export type CategoryChip = { id: string; label: string; emoji: string };
export type CategoryGroups = {
  dishes: CategoryChip[];
  cuisines: CategoryChip[];
  formats: CategoryChip[];
  forms: CategoryChip[];
  diets: CategoryChip[];
};

type Tab = "dishes" | "cuisines" | "formats" | "forms" | "diets";

const TABS: readonly { id: Tab; label: string }[] = [
  { id: "dishes", label: "Блюда" },
  { id: "cuisines", label: "Кухни" },
  { id: "formats", label: "Формат" },
  { id: "forms", label: "Форма" },
  { id: "diets", label: "Особенности" },
];

/**
 * Кнопка «Категория» на странице результатов. Открывает шторку с нашими тремя
 * разделами (Блюда / Кухни / Формат) и сеткой категорий. Категория пока — это
 * текстовый запрос q (заглушка), цена и прочие параметры сохраняются.
 */
export function ResultsCategoryControl({ groups }: { groups: CategoryGroups }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentQuery = (searchParams.get("q") ?? "").trim().toLowerCase();

  // Ищем текущую категорию среди всех групп → подпись кнопки и стартовая вкладка.
  const matched = useMemo(() => {
    for (const tab of TABS) {
      const hit = groups[tab.id].find(
        (c) => c.label.trim().toLowerCase() === currentQuery
      );
      if (hit) return { tab: tab.id, label: hit.label };
    }
    return null;
  }, [currentQuery, groups]);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("dishes");

  const applyQuery = useCallback(
    (label: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (label) params.set("q", label);
      else params.delete("q");
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams]
  );

  const openSheet = useCallback(() => {
    setTab(matched?.tab ?? "dishes");
    setOpen(true);
  }, [matched]);

  const pickCategory = useCallback(
    (chip: CategoryChip) => {
      setOpen(false);
      // Повторный выбор текущей категории — снимаем её.
      applyQuery(chip.label.trim().toLowerCase() === currentQuery ? null : chip.label);
    },
    [applyQuery, currentQuery]
  );

  const activeList = groups[tab];

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        aria-label="Фильтр по категории"
        className={cn(
          "inline-flex shrink-0 items-center gap-2 rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-bold transition-colors",
          matched
            ? "border-[#2ECC71] bg-[#2ECC71] text-white"
            : "border-[rgba(20,40,28,0.14)] bg-white text-[#15291C]",
          PRESS_CLASSES
        )}
      >
        <UtensilsCrossed size={15} strokeWidth={2.3} />
        {matched ? matched.label : "Категория"}
      </button>

      {matched && (
        <button
          type="button"
          onClick={() => applyQuery(null)}
          aria-label="Сбросить категорию"
          className={cn(
            "grid size-[34px] shrink-0 place-items-center rounded-full border-[1.5px] border-[rgba(20,40,28,0.14)] bg-white text-[#5C6B62]",
            PRESS_CLASSES
          )}
        >
          <X size={14} strokeWidth={2.4} />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-[rgba(20,40,28,0.28)]"
          />
          <div className="relative max-h-[80%] rounded-t-[26px] bg-[#E7E9E7] px-[18px] pt-3 pb-6 shadow-[0_-18px_40px_rgba(20,40,28,0.22)]">
            <div className="mx-auto mb-3 h-[5px] w-[42px] rounded-full bg-[rgba(20,40,28,0.14)]" />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[19px] font-extrabold tracking-[-0.3px] text-[#15291C]">
                Категория
              </h2>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setOpen(false)}
                className={cn(
                  "grid size-9 place-items-center rounded-full bg-white text-[#15291C] shadow-[0_2px_8px_rgba(20,40,28,0.10)]",
                  PRESS_CLASSES
                )}
              >
                <X className="size-5" strokeWidth={2.2} />
              </button>
            </div>

            <CategoryModeToggle
              aria-label="Тип категории"
              items={TABS}
              value={tab}
              onValueChange={setTab}
            />

            <div className="hide-scroll mt-4 grid max-h-[46vh] grid-cols-4 gap-x-2.5 gap-y-3.5 overflow-y-auto pb-1">
              {activeList.map((chip) => {
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
                        "grid aspect-square w-full place-items-center rounded-[18px] text-[24px] transition-colors max-[380px]:text-[22px]",
                        isActive
                          ? "bg-[#2ECC71]"
                          : "bg-white shadow-[0_6px_16px_rgba(20,40,28,0.07),inset_0_0_0_1.5px_#2ECC71]"
                      )}
                    >
                      <span aria-hidden="true">{chip.emoji}</span>
                    </span>
                    <span className="line-clamp-2 w-full text-center text-[10.5px] leading-[1.15] font-bold text-[#15291C] [overflow-wrap:anywhere] max-[380px]:text-[10px]">
                      {chip.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
