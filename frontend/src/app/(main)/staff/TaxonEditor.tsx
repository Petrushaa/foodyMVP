"use client";

import { useEffect, useMemo, useState } from "react";

import { CategoryIcon } from "@/components/categories/category-icon";
import { cn } from "@/lib/utils";

type Taxon = { id: number; kind: string; slug: string; name: string; emoji?: string; icon?: string | null };

/**
 * Категории позиции глазами модератора — не список, а переключатели.
 *
 * Раньше панель показывала категории текстом. Для позиции с определившимся
 * блюдом этого хватало: классификация наследуется, и трогать её незачем. Но у
 * позиции без блюда наследовать не от чего — набор оказывался пустым, и
 * починить его было нечем. Позиция уходила в каталог невидимой.
 *
 * Кухня одна: у блюда не бывает двух происхождений. Виды — сколько угодно:
 * одно и то же может быть и супом, и постным.
 */
export function TaxonEditor({
  selected,
  onChange,
}: {
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [all, setAll] = useState<Taxon[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/v1/taxons/", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (alive) setAll(Array.isArray(data) ? data : (data?.results ?? []));
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const cuisines = useMemo(() => all.filter((t) => t.kind === "cuisine"), [all]);
  const types = useMemo(() => all.filter((t) => t.kind === "type"), [all]);

  /** Кухня одна — выбор новой снимает прежнюю, повторное нажатие снимает вовсе. */
  function pickCuisine(id: number) {
    const others = selected.filter((x) => !cuisines.some((c) => c.id === x));
    onChange(selected.includes(id) ? others : [...others, id]);
  }

  function toggleType(id: number) {
    onChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    );
  }

  if (failed) {
    return (
      <p className="text-[11.5px] font-medium text-red-700">
        Справочник категорий не загрузился — обновите страницу.
      </p>
    );
  }
  if (all.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <Group label="Кухня" hint="одна">
        {cuisines.map((t) => (
          <Chip key={t.id} taxon={t} on={selected.includes(t.id)} onClick={() => pickCuisine(t.id)} />
        ))}
      </Group>
      <Group label="Вид" hint="сколько нужно">
        {types.map((t) => (
          <Chip key={t.id} taxon={t} on={selected.includes(t.id)} onClick={() => toggleType(t.id)} />
        ))}
      </Group>
    </div>
  );
}

function Group({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11.5px] font-medium text-[#8A958E]">
        {label} <span className="text-[#B4BDB7]">— {hint}</span>
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ taxon, on, onClick }: { taxon: Taxon; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
        on
          ? "bg-[#2ECC71] text-white ring-1 ring-[#2ECC71]"
          : "bg-[#F1F5F2] text-[#15291C] ring-1 ring-transparent hover:ring-[rgba(20,40,28,0.14)]",
      )}
    >
      <CategoryIcon icon={taxon.icon} emoji={taxon.emoji} size={15} />
      {taxon.name}
    </button>
  );
}
