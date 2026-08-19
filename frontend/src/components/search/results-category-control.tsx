"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UtensilsCrossed, X } from "lucide-react";

import { CategoryModeToggle } from "@/components/categories/category-mode-toggle";
import { splitByGroup } from "@/lib/categories";
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
  /** Код группы блюда — по нему список бьётся на разделы. */
  group?: string;
  groupName?: string;
  /** Это сама группа: выбор берёт все блюда внутри неё. */
  isGroup?: boolean;
};
export type CategoryGroups = {
  dishes: CategoryChip[];
  cuisines: CategoryChip[];
  types: CategoryChip[];
  /** Группы блюд — заголовки разделов и выбор «все супы» одним нажатием. */
  dishGroups?: CategoryChip[];
};

export type Tab = "dishes" | "cuisines" | "types";

const TABS: readonly { id: Tab; label: string }[] = [
  { id: "dishes", label: "Блюда" },
  { id: "cuisines", label: "Кухни" },
  { id: "types", label: "Виды" },
];

// Каким параметром фильтруется вкладка. Оси каталога бэкенд уже принимает
// слагами (?cuisine=japanese), «Блюда» — это тип блюда по названию.
export const TAB_PARAM: Record<Tab, string> = {
  dishes: "dish_type",
  cuisines: "cuisine",
  types: "type",
};
// Группа живёт отдельным параметром: она на той же вкладке, что и блюда, но
// фильтрует иначе — не одно название, а всё, что в группу входит.
export const DISH_GROUP_PARAM = "dish_group";
export const CATEGORY_PARAMS = [...Object.values(TAB_PARAM), DISH_GROUP_PARAM];

// Вкладка, где выбирают сколько угодно значений сразу: видов у позиции бывает
// несколько (веганский фастфуд), а блюдо и кухня у неё одни.
export const MULTI_TAB: Tab = "types";

/** Что выбрано на вкладке. Виды лежат в адресе через запятую. */
export function selectedValues(search: string, tabId: Tab): string[] {
  const raw = new URLSearchParams(search).get(TAB_PARAM[tabId]) ?? "";
  return raw.split(",").map((v) => v.trim()).filter(Boolean);
}

/**
 * Кнопка «Категория» на странице результатов. Открывает шторку с разделами
 * (Блюда / Кухни / Виды) и сеткой категорий.
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

  // Что выбрано → подпись кнопки, стартовая вкладка и подсветка чипов.
  const matched = useMemo(() => {
    // Группа проверяется первой: она лежит на вкладке блюд, но своим параметром.
    const groupSlugs = (new URLSearchParams(search).get(DISH_GROUP_PARAM) ?? "")
      .split(",").map((v) => v.trim()).filter(Boolean);
    if (groupSlugs.length) {
      const chips = (groups.dishGroups ?? []).filter((c) => groupSlugs.includes(c.value));
      if (chips.length) {
        return {
          tab: "dishes" as Tab,
          label: chips[0].label,
          values: chips.map((c) => c.value),
        };
      }
    }

    for (const tab of TABS) {
      const values = selectedValues(search, tab.id);
      if (!values.length) continue;
      const chips = groups[tab.id].filter((c) => values.includes(c.value));
      if (!chips.length) continue;
      // Несколько видов не влезут в кнопку — показываем первый и «+N».
      const label =
        chips.length > 1 ? `${chips[0].label} +${chips.length - 1}` : chips[0].label;
      return { tab: tab.id, label, values: chips.map((c) => c.value) };
    }
    return null;
  }, [groups, search]);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("dishes");

  const applyCategory = useCallback(
    (chip: CategoryChip | null, tabId: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      const isMulti = tabId === MULTI_TAB;
      // На вкладке видов копим выбор, на остальных он один — прежний снимаем.
      const current = isMulti ? selectedValues(params.toString(), tabId) : [];

      for (const name of CATEGORY_PARAMS) params.delete(name);
      params.delete("category_id"); // старый числовой параметр, если остался в адресе

      const next = chip
        ? current.includes(chip.value)
          ? current.filter((v) => v !== chip.value) // повторный выбор снимает
          : [...current, chip.value]
        : [];
      if (next.length) {
        params.set(chip?.isGroup ? DISH_GROUP_PARAM : TAB_PARAM[tabId], next.join(","));
      }

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
      // Виды выбирают пачкой, поэтому шторка остаётся открытой.
      if (tab !== MULTI_TAB) setOpen(false);
      applyCategory(chip, tab);
    },
    [applyCategory, tab]
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

            <div className="hide-scroll mt-4 max-h-[46vh] overflow-y-auto pb-1">
              {tab === "dishes" && groups.dishGroups?.length ? (
                splitByGroup(activeList).map((section) => {
                  const groupChip = groups.dishGroups?.find((g) => g.value === section.key);
                  const groupActive = Boolean(groupChip && matched?.values.includes(groupChip.value));
                  return (
                    <section key={section.key || "rest"} className="mb-4 last:mb-0">
                      {/* Заголовок сам по себе выбор: «хочу супы» — целиком группой. */}
                      <button
                        type="button"
                        onClick={() => groupChip && pickCategory(groupChip)}
                        disabled={!groupChip}
                        aria-pressed={groupActive}
                        className={cn(
                          "mb-2 flex w-full items-center justify-between gap-2 rounded-[14px] px-3 py-2 text-left transition-colors",
                          groupActive ? "bg-[#2ECC71] text-white" : "bg-white/70 text-[#15291C]",
                          PRESS_CLASSES,
                        )}
                      >
                        <span className="text-[13.5px] font-extrabold tracking-[-0.2px]">
                          {section.title}
                        </span>
                        {groupChip && (
                          <span
                            className={cn(
                              "text-[11.5px] font-bold",
                              groupActive ? "text-white/85" : "text-[#5C6B62]",
                            )}
                          >
                            {groupActive ? "вся группа" : "выбрать все"}
                          </span>
                        )}
                      </button>
                      <div className="grid grid-cols-4 gap-x-2.5 gap-y-3.5">
                        {section.items.map((chip) => (
                          <CategoryButton
                            key={chip.id}
                            chip={chip}
                            isActive={Boolean(matched?.values.includes(chip.value))}
                            onPick={pickCategory}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })
              ) : (
                <div className="grid grid-cols-4 gap-x-2.5 gap-y-3.5">
                  {activeList.map((chip) => (
                    <CategoryButton
                      key={chip.id}
                      chip={chip}
                      isActive={Boolean(matched?.values.includes(chip.value))}
                      onPick={pickCategory}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}


/** Один чип категории. Вынесен: рисуется и в разделах, и в плоском списке. */
function CategoryButton({
  chip,
  isActive,
  onPick,
}: {
  chip: CategoryChip;
  isActive: boolean;
  onPick: (chip: CategoryChip) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(chip)}
      aria-pressed={isActive}
      className={cn("flex min-w-0 flex-col items-center gap-1.5 outline-none", PRESS_CLASSES)}
    >
      <span
        className={cn(
          "grid aspect-square w-full place-items-center overflow-hidden rounded-[18px] text-[24px] transition-colors max-[380px]:text-[22px]",
          isActive
            ? "bg-[#2ECC71] ring-2 ring-[#2ECC71] ring-offset-2"
            : "bg-white shadow-[0_6px_16px_rgba(20,40,28,0.07),inset_0_0_0_1.5px_#2ECC71]",
        )}
      >
        <CategoryIcon icon={chip.icon} emoji={chip.emoji} size={30} fill />
      </span>
      <span className="line-clamp-2 w-full text-center text-[10.5px] leading-[1.15] font-bold text-[#15291C] [overflow-wrap:anywhere] max-[380px]:text-[10px]">
        {chip.label}
      </span>
    </button>
  );
}
