"use client";

/**
 * Поиск по каталогу блюд.
 *
 * Две независимые вещи в одном экране:
 * - **поиск по названию** — нечёткий, понимает опечатки, латиницу и неверную
 *   раскладку (всё это считает бэкенд);
 * - **фильтры по четырём осям** — кухня, формат, форма и дополнительно.
 *   Несколько осей сужают выдачу, несколько значений одной оси — расширяют.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { getMenuItems, searchMenuItems } from "@/lib/api/client";
import type { MenuItem, Taxon, TaxonKind } from "@/lib/types";

const AXES: Array<{ kind: TaxonKind; label: string }> = [
    { kind: "cuisine", label: "Кухня" },
    { kind: "format", label: "Формат" },
    { kind: "form", label: "Что это" },
    { kind: "diet", label: "Особенности" },
];

const DEBOUNCE_MS = 300;

export function CatalogSearch({ taxons }: { taxons: Taxon[] }) {
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState<Record<TaxonKind, string[]>>({
        cuisine: [], format: [], form: [], diet: [],
    });
    const [items, setItems] = useState<MenuItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const requestId = useRef(0);

    const load = useCallback(async () => {
        const id = ++requestId.current;
        setIsLoading(true);
        try {
            // Поиск по названию и фильтры — разные ручки: у первой умное
            // сопоставление, у второй фильтрация каталога.
            const found = query.trim()
                ? await searchMenuItems(query.trim())
                : (await getMenuItems({
                    cuisine: selected.cuisine,
                    format: selected.format,
                    form: selected.form,
                    diet: selected.diet,
                })).results;
            if (id === requestId.current) setItems(found);
        } catch {
            if (id === requestId.current) setItems([]);
        } finally {
            if (id === requestId.current) setIsLoading(false);
        }
    }, [query, selected]);

    useEffect(() => {
        const timer = setTimeout(load, DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [load]);

    function toggle(kind: TaxonKind, slug: string) {
        setSelected((current) => ({
            ...current,
            [kind]: current[kind].includes(slug)
                ? current[kind].filter((item) => item !== slug)
                : [...current[kind], slug],
        }));
    }

    const hasFilters = Object.values(selected).some((list) => list.length > 0);

    return (
        <div className="pb-10">
            <div className="sticky top-0 z-10 border-b border-neutral-100 bg-white/90 px-4 py-3 backdrop-blur">
                <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Найти блюдо"
                    className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:border-neutral-400"
                />
            </div>

            {/* Фильтры работают, когда поиск по названию пуст: иначе непонятно,
                что победило — текст или галочки. */}
            {!query.trim() && (
                <div className="space-y-4 px-4 py-4">
                    {AXES.map(({ kind, label }) => {
                        const options = taxons.filter((taxon) => taxon.kind === kind);
                        if (options.length === 0) return null;
                        return (
                            <div key={kind}>
                                <p className="mb-2 text-xs uppercase tracking-wide text-neutral-400">{label}</p>
                                <div className="flex flex-wrap gap-2">
                                    {options.map((taxon) => {
                                        const active = selected[kind].includes(taxon.slug);
                                        return (
                                            <button
                                                key={taxon.id}
                                                type="button"
                                                onClick={() => toggle(kind, taxon.slug)}
                                                className={`rounded-full border px-3 py-1 text-sm ${
                                                    active
                                                        ? "border-neutral-900 bg-neutral-900 text-white"
                                                        : "border-neutral-200 text-neutral-600"
                                                }`}
                                            >
                                                {taxon.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                    {hasFilters && (
                        <button
                            type="button"
                            onClick={() => setSelected({ cuisine: [], format: [], form: [], diet: [] })}
                            className="text-sm text-neutral-500 underline"
                        >
                            Сбросить фильтры
                        </button>
                    )}
                </div>
            )}

            {isLoading && <p className="px-4 py-6 text-sm text-neutral-400">Ищем…</p>}

            {!isLoading && items.length === 0 && (
                <p className="px-4 py-16 text-center text-sm text-neutral-400">
                    {query.trim() ? "Ничего не нашлось" : "Выберите фильтры или введите название"}
                </p>
            )}

            <ul>
                {items.map((item) => (
                    <li key={item.id} className="border-b border-neutral-100">
                        <Link href={`/menu-item/${item.id}`} className="flex items-center gap-4 px-4 py-4">
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">{item.name}</span>
                                <span className="block truncate text-sm text-neutral-500">
                                    {item.restaurant.name} · {item.restaurant.address}
                                </span>
                                <span className="block text-sm text-neutral-400">
                                    {item.ratings_count > 0
                                        ? `${item.rating_raw.toFixed(1)} / 10 · ${item.ratings_count} оценок`
                                        : "Пока без оценок"}
                                </span>
                            </span>
                            {item.price && (
                                <span className="shrink-0 text-sm text-neutral-500">
                                    {Math.round(Number(item.price))} ₽
                                </span>
                            )}
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
