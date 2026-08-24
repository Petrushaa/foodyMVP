"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, Check, X } from "lucide-react";

import { cn } from "@/lib/utils";

const PRESS_CLASSES =
  "origin-center transition-transform duration-150 ease-out active:scale-[0.94] [-webkit-tap-highlight-color:transparent]";

/**
 * Порядок выдачи поиска.
 *
 * Один порядок не отвечает на все вопросы сразу: «где поесть подешевле» и «что
 * тут вообще хвалят» — разные запросы к одному и тому же списку.
 *
 * Значения совпадают с ключами `MenuItemViewSet.SORTS` на бэкенде. Пустое
 * означает «не присылать параметр»: порядок по умолчанию решает сервер, и при
 * текстовом поиске он не рейтинговый, а по близости к запросу.
 */
const SORTS = [
  { value: "price", label: "Сначала дешёвые" },
  { value: "price_desc", label: "Сначала дорогие" },
  { value: "reviews", label: "Больше отзывов" },
  { value: "new", label: "Новые" },
];

/**
 * Варианты для текущего экрана.
 *
 * При текстовом поиске выдача по умолчанию отсортирована по близости к запросу,
 * и называть это «сначала лучшие» было бы враньём: на «шаурма» сверху окажется
 * самая похожая по названию, а не самая вкусная. Зато рейтинг там становится
 * отдельным осознанным выбором.
 */
export function sortOptions(hasQuery: boolean) {
  return hasQuery
    ? [
        { value: "", label: "Сначала похожие" },
        { value: "rating", label: "По рейтингу" },
        ...SORTS,
      ]
    : [{ value: "", label: "Сначала лучшие" }, ...SORTS];
}

export function useSortControl(hasQuery: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const options = sortOptions(hasQuery);
  const current = searchParams.get("sort") ?? "";
  // Незнакомое значение в адресе показываем как порядок по умолчанию — бэкенд
  // его тоже игнорирует, и расходиться с ним нельзя.
  const active = options.find((o) => o.value === current) ?? options[0];

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

  return { options, active, apply, isDefault: active.value === "" };
}

/** Кнопка со шторкой — рядом с фильтрами цены и категории. */
export function SortControl({ hasQuery }: { hasQuery: boolean }) {
  const { options, active, apply, isDefault } = useSortControl(hasQuery);
  const [open, setOpen] = useState(false);

  const pick = useCallback(
    (value: string) => {
      setOpen(false);
      apply(value);
    },
    [apply],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Выбранный порядок написан на кнопке, и глухой aria-label его бы
        // перекрыл: с экранным диктором человек слышал бы всегда одно и то же
        // и не узнал, что список уже отсортирован. Поэтому подпись включает
        // текущий выбор.
        aria-label={isDefault ? "Сортировка" : `Сортировка: ${active.label}`}
        className={cn(
          "inline-flex shrink-0 items-center gap-2 rounded-full border-[1.5px] py-2 text-[13px] font-bold transition-colors",
          isDefault ? "px-2.5 sm:px-3.5" : "px-3.5",
          isDefault
            ? "border-[rgba(20,40,28,0.14)] bg-white text-[#15291C]"
            : "border-[#2ECC71] bg-[#2ECC71] text-white",
          PRESS_CLASSES,
        )}
      >
        <ArrowUpDown size={15} strokeWidth={2.3} />
        {/* На телефоне в исходном состоянии — только значок: ряд фильтров там
            узкий, а слово ничего не добавляет к стрелкам. Выбранный порядок
            подписываем всегда: иначе его не видно, не открыв шторку. Для
            экранного диктора слово остаётся в aria-label кнопки. */}
        {isDefault ? (
          <span className="hidden sm:inline">Сортировка</span>
        ) : (
          active.label
        )}
      </button>

      {!isDefault && (
        <button
          type="button"
          onClick={() => apply("")}
          aria-label="Сбросить порядок"
          className={cn(
            "grid size-[34px] shrink-0 place-items-center rounded-full border-[1.5px] border-[rgba(20,40,28,0.14)] bg-white text-[#5C6B62]",
            PRESS_CLASSES,
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
                Сортировка
              </h2>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setOpen(false)}
                className={cn(
                  "grid size-9 place-items-center rounded-full bg-white text-[#15291C] shadow-[0_2px_8px_rgba(20,40,28,0.10)]",
                  PRESS_CLASSES,
                )}
              >
                <X className="size-5" strokeWidth={2.2} />
              </button>
            </div>

            <SortOptionList options={options} active={active.value} onPick={pick} />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Список вариантов строками с галочкой.
 *
 * Строками, а не чипами: варианты взаимоисключающие и читаются сверху вниз,
 * и в таком списке видно, какой сейчас выбран, без сравнения цветов.
 */
export function SortOptionList({
  options,
  active,
  onPick,
}: {
  options: { value: string; label: string }[];
  active: string;
  onPick: (value: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Порядок выдачи"
      className="hide-scroll flex max-h-[46vh] flex-col overflow-y-auto"
    >
      {options.map((option) => {
        const isOn = option.value === active;
        return (
          <button
            key={option.value || "default"}
            type="button"
            role="radio"
            aria-checked={isOn}
            onClick={() => onPick(option.value)}
            className={cn(
              "flex items-center justify-between gap-3 rounded-[14px] px-3 py-3 text-left text-[15px] transition-colors",
              isOn ? "font-bold text-[#15291C]" : "font-medium text-[#3A4A40]",
              "hover:bg-[rgba(20,40,28,0.05)]",
            )}
          >
            {option.label}
            {isOn && <Check size={18} strokeWidth={2.6} className="shrink-0 text-[#1FA85C]" />}
          </button>
        );
      })}
    </div>
  );
}
