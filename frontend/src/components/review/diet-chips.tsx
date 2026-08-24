"use client";

import { useEffect, useState } from "react";

import { CategoryIcon } from "@/components/categories/category-icon";
import { cn } from "@/lib/utils";

/**
 * Свойства блюда, которые указывает автор поста.
 *
 * Только то, где он единственный источник правды: он это ел и знает, была ли
 * шаурма вегетарианской и насколько острой. Всё, что можно вывести из блюда
 * («фастфуд это или стритфуд»), сюда не попадает — там человек гадает, и
 * каждый гадает по-своему, отчего фильтры начинают врать.
 *
 * Тот же список проверяет и бэкенд: пришлёт клиент лишнее — вернётся ошибка.
 */
const AUTHOR_SLUGS = [
  "vegetarian",
  "vegan",
  "healthy",
  "lenten",
  "spicy",
  "gluten-free",
  "lactose-free",
  "halal",
  "kids",
];

type Option = { id: number; slug: string; name: string; emoji?: string; icon?: string | null };

export function DietChips({
  selected,
  onToggle,
}: {
  selected: number[];
  onToggle: (id: number) => void;
}) {
  const [options, setOptions] = useState<Option[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/v1/taxons/?kind=type", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const list: Option[] = Array.isArray(data) ? data : (data?.results ?? []);
        if (!alive) return;
        // Порядок берём свой, а не серверный: он про каталог, а здесь важно,
        // чтобы часто отмечаемое стояло первым.
        const bySlug = new Map(list.map((t) => [t.slug, t]));
        setOptions(AUTHOR_SLUGS.map((s) => bySlug.get(s)).filter(Boolean) as Option[]);
      } catch {
        // Не загрузилось — блок просто не покажется, пост создать это не мешает.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (options.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 px-1 text-[15px] font-extrabold tracking-[-0.2px] text-[#15291C]">
        Особенности блюда
      </h2>
      <p className="mb-2.5 px-1 text-[12.5px] leading-[1.4] font-medium text-[#5C6B62]">
        Отметьте, если знаете — по этому людям потом искать
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isOn = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onToggle(option.id)}
              aria-pressed={isOn}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors",
                "origin-center duration-150 ease-out active:scale-[0.94] [-webkit-tap-highlight-color:transparent]",
                isOn
                  ? "border-[#2ECC71] bg-[#2ECC71] text-white"
                  : "border-[rgba(20,40,28,0.14)] bg-white text-[#15291C]",
              )}
            >
              <CategoryIcon icon={option.icon} emoji={option.emoji} size={15} />
              {option.name}
            </button>
          );
        })}
      </div>
    </section>
  );
}
