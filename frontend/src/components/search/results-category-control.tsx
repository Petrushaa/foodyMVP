"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UtensilsCrossed, X } from "lucide-react";

import { CategoryModeToggle } from "@/components/categories/category-mode-toggle";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "@/components/categories/category-icon";

const PRESS_CLASSES =
  "origin-center transition-transform duration-150 ease-out active:scale-[0.94] [-webkit-tap-highlight-color:transparent]";

export type CategoryChip = {
  id: string;
  /** Значение для бэкенда: слаг категории или название типа блюда. */
  value: string;
  label: string;
  emoji: string;
  /** Картинка из справочника; пусто — рисуется эмодзи. */
  icon?: string;
};
export type CategoryGroups = {
  dishes: CategoryChip[];
  cuisines: CategoryChip[];
  formats: CategoryChip[];
  forms: CategoryChip[];
  diets: CategoryChip[];
};

export type Tab = "dishes" | "cuisines" | "formats" | "forms" | "diets";

const TABS: readonly { id: Tab; label: string }[] = [
  { id: "dishes", label: "Блюда" },
  { id: "cuisines", label: "Кухни" },
  { id: "formats", label: "Формат" },
  { id: "forms", label: "Форма" },
  { id: "diets", label: "Особенности" },
];

// Каким параметром фильтруется вкладка. Оси каталога бэкенд уже принимает
// слагами (?cuisine=japanese), «Блюда» — это тип блюда по названию.
export const TAB_PARAM: Record<Tab, string> = {
  dishes: "dish_type",
  cuisines: "cuisine",
  formats: "format",
  forms: "form",
  diets: "diet",
};
export const CATEGORY_PARAMS = Object.values(TAB_PARAM);

/**
 * Кнопка «Категория» на странице результатов. Открывает шторку с разделами
 * (Блюда / Кухни / Формат / Форма / Особенности) и сеткой категорий.
 *
 * Выбор кладёт в адрес настоящий фильтр, а не текстовый запрос: раньше сюда
 * писалось `q=Японская`, и поиск искал это слово в названиях — «Роллы»
 * японской кухни не находились. Цена и прочие параметры сохраняются.
 */
export function ResultsCategoryControl({ groups }: { groups: CategoryGroups }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const search = searchParams.toString();

  // Ищем выбранную категорию среди всех групп → подпись кнопки и стартовая вкладка.
  const matched = useMemo(() => {
    const params = new URLSearchParams(search);
    for (const tab of TABS) {
      const current = params.get(TAB_PARAM[tab.id]);
      if (!current) continue;
      const hit = groups[tab.id].find((c) => c.value === current);
      if (hit) return { tab: tab.id, label: hit.label, value: hit.value };
    }
    return null;
  }, [groups, search]);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("dishes");

  const applyCategory = useCallback(
    (chip: CategoryChip | null, tabId: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      // Категория одна: выбирая кухню, снимаем ранее выбранную форму или тип блюда.
      for (const name of CATEGORY_PARAMS) params.delete(name);
      params.delete("category_id"); // старый числовой параметр, если остался в адресе
      if (chip) params.set(TAB_PARAM[tabId], chip.value);
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
      applyCategory(matched?.value === chip.value ? null : chip, tab);
    },
    [applyCategory, matched, tab]
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
          onClick={() => applyCategory(null, tab)}
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
                const isActive = matched?.value === chip.value;
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
                        "grid aspect-square w-full place-items-center overflow-hidden rounded-[18px] text-[24px] transition-colors max-[380px]:text-[22px]",
                        isActive
                          ? "bg-[#2ECC71] ring-2 ring-[#2ECC71] ring-offset-2"
                          : "bg-white shadow-[0_6px_16px_rgba(20,40,28,0.07),inset_0_0_0_1.5px_#2ECC71]"
                      )}
                    >
                      <CategoryIcon icon={chip.icon} emoji={chip.emoji} size={30} fill />
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
