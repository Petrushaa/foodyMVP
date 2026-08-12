"use client";

/**
 * Выбор позиции — блюда в уже выбранном заведении.
 *
 * Работает так же, как выбор заведения: сначала показываем то, что уже есть,
 * и только потом даём завести новое. Поиск на бэкенде нечёткий — понимает опечатки,
 * латиницу и неверную раскладку, и ищет среди позиций без постов тоже: иначе
 * человек не найдёт вчера созданное блюдо и заведёт дубль.
 *
 * Если позиция выбрана — тип блюда, категории и цена берутся с неё и не правятся.
 * Если создаётся новая — пользователь выбирает тип блюда, а категории подставляются
 * из справочника и остаются редактируемыми.
 */

import { useEffect, useRef, useState } from "react";

import { getDishTypes, searchMenuItems } from "@/lib/api/client";
import type { DishType, MenuItem, Taxon, TaxonKind } from "@/lib/types";

export type MenuItemChoice =
    | { kind: "existing"; item: MenuItem }
    | { kind: "new"; name: string; dishType: DishType | null; taxons: Taxon[]; price: string };

interface Props {
    restaurantId: number | null;
    value: MenuItemChoice | null;
    onChange: (choice: MenuItemChoice | null) => void;
}

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

const AXIS_LABELS: Record<TaxonKind, string> = {
    cuisine: "Кухня",
    format: "Формат",
    form: "Форма",
    diet: "Дополнительно",
};

export function MenuItemPicker({ restaurantId, value, onChange }: Props) {
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState<MenuItem[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    const [dishTypes, setDishTypes] = useState<DishType[]>([]);
    const [dishType, setDishType] = useState<DishType | null>(null);
    const [taxons, setTaxons] = useState<Taxon[]>([]);
    const [price, setPrice] = useState("");

    const requestId = useRef(0);

    useEffect(() => {
        getDishTypes().then(setDishTypes).catch(() => setDishTypes([]));
    }, []);

    useEffect(() => {
        if (value?.kind === "existing" || query.trim().length < MIN_QUERY) {
            setSuggestions([]);
            return;
        }

        const id = ++requestId.current;
        setIsSearching(true);
        const timer = setTimeout(async () => {
            try {
                const found = await searchMenuItems(query.trim(), restaurantId ?? undefined);
                if (id === requestId.current) setSuggestions(found);
            } catch {
                if (id === requestId.current) setSuggestions([]);
            } finally {
                if (id === requestId.current) setIsSearching(false);
            }
        }, DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [query, restaurantId, value]);

    function pick(item: MenuItem) {
        onChange({ kind: "existing", item });
        setQuery(item.name);
        setSuggestions([]);
        setIsCreating(false);
    }

    function reset() {
        onChange(null);
        setQuery("");
        setSuggestions([]);
        setIsCreating(false);
        setDishType(null);
        setTaxons([]);
        setPrice("");
    }

    /**
     * Выбрали тип блюда — подставляем его категории. Именно подставляем,
     * а не привязываем: дальше их можно менять, и на позицию они уедут копией.
     */
    function chooseDishType(next: DishType | null) {
        setDishType(next);
        const defaults = next?.default_taxons ?? [];
        setTaxons(defaults);
        sync(query, next, defaults, price);
    }

    function toggleTaxon(taxon: Taxon) {
        const isSingle = taxon.kind !== "diet";
        const next = taxons.some((item) => item.id === taxon.id)
            ? taxons.filter((item) => item.id !== taxon.id)
            // У кухни, формата и формы значение одно — заменяем, а не добавляем.
            : [...taxons.filter((item) => (isSingle ? item.kind !== taxon.kind : true)), taxon];
        setTaxons(next);
        sync(query, dishType, next, price);
    }

    function sync(name: string, type: DishType | null, chosen: Taxon[], nextPrice: string) {
        const ready = name.trim() && type && nextPrice.trim();
        onChange(ready ? { kind: "new", name: name.trim(), dishType: type, taxons: chosen, price: nextPrice } : null);
    }

    if (!restaurantId && !isCreating) {
        return <p className="text-sm text-neutral-400">Сначала выберите заведение</p>;
    }

    // --- Позиция выбрана: всё берётся с неё ---
    if (value?.kind === "existing") {
        const item = value.item;
        return (
            <div className="rounded-2xl border border-neutral-200 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="truncate font-medium">{item.name}</p>
                        <p className="mt-1 text-sm text-neutral-500">
                            {item.price ? `${Math.round(Number(item.price))} ₽` : "Цена не указана"}
                            {item.ratings_count > 0 && ` · ${item.rating_raw.toFixed(1)} по ${item.ratings_count} оценкам`}
                        </p>
                        {item.taxons.length > 0 && (
                            <p className="mt-1 text-xs text-neutral-400">
                                {item.taxons.map((taxon) => taxon.name).join(" · ")}
                            </p>
                        )}
                    </div>
                    <button type="button" onClick={reset} className="shrink-0 text-sm text-neutral-500 underline">
                        Изменить
                    </button>
                </div>
            </div>
        );
    }

    const grouped = groupByKind(dishTypes);

    return (
        <div className="space-y-3">
            <input
                value={query}
                onChange={(event) => {
                    setQuery(event.target.value);
                    if (isCreating) sync(event.target.value, dishType, taxons, price);
                }}
                placeholder="Что вы ели?"
                className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:border-neutral-400"
            />

            {isSearching && <p className="px-1 text-sm text-neutral-400">Ищем…</p>}

            {suggestions.length > 0 && (
                <ul className="overflow-hidden rounded-2xl border border-neutral-200">
                    {suggestions.map((item) => (
                        <li key={item.id}>
                            <button
                                type="button"
                                onClick={() => pick(item)}
                                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-neutral-50"
                            >
                                <span className="min-w-0">
                                    <span className="block truncate font-medium">{item.name}</span>
                                    <span className="block truncate text-sm text-neutral-500">
                                        {item.restaurant.name}
                                    </span>
                                </span>
                                <span className="shrink-0 text-xs text-neutral-400">
                                    {item.price ? `${Math.round(Number(item.price))} ₽` : ""}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {!isCreating && query.trim().length >= MIN_QUERY && !isSearching && (
                <button
                    type="button"
                    onClick={() => {
                        setIsCreating(true);
                        sync(query, dishType, taxons, price);
                    }}
                    className="w-full rounded-2xl border border-dashed border-neutral-300 px-4 py-3 text-sm text-neutral-600"
                >
                    {suggestions.length > 0 ? "Это другое блюдо" : "Добавить это блюдо"}
                </button>
            )}

            {isCreating && (
                <div className="space-y-4 rounded-2xl border border-neutral-200 p-4">
                    <div>
                        <p className="mb-2 text-sm font-medium">Что это за блюдо?</p>
                        <select
                            value={dishType?.id ?? ""}
                            onChange={(event) => {
                                const found = dishTypes.find((type) => type.id === Number(event.target.value));
                                chooseDishType(found ?? null);
                            }}
                            className="w-full rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:border-neutral-400"
                        >
                            <option value="">Выберите из списка</option>
                            {dishTypes.map((type) => (
                                <option key={type.id} value={type.id}>{type.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Категории подставились из справочника — их можно поправить. */}
                    {dishType && (
                        <div className="space-y-3">
                            <p className="text-sm text-neutral-500">
                                Категории подставлены автоматически, поменяйте если не так
                            </p>
                            {(Object.keys(AXIS_LABELS) as TaxonKind[]).map((kind) => (
                                <div key={kind}>
                                    <p className="mb-1 text-xs uppercase tracking-wide text-neutral-400">
                                        {AXIS_LABELS[kind]}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {(grouped[kind] ?? []).map((taxon) => {
                                            const active = taxons.some((item) => item.id === taxon.id);
                                            return (
                                                <button
                                                    key={taxon.id}
                                                    type="button"
                                                    onClick={() => toggleTaxon(taxon)}
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
                            ))}
                        </div>
                    )}

                    <div>
                        <p className="mb-2 text-sm font-medium">Сколько стоит?</p>
                        <input
                            value={price}
                            onChange={(event) => {
                                setPrice(event.target.value);
                                sync(query, dishType, taxons, event.target.value);
                            }}
                            inputMode="numeric"
                            placeholder="Цена в рублях"
                            className="w-full rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:border-neutral-400"
                        />
                        <p className="mt-1 text-xs text-neutral-400">
                            Станет ценой блюда — её увидят все, кто откроет карточку
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Все категории, встречающиеся в справочнике, сгруппированные по осям.
 * Отдельного запроса не делаем: они уже приехали вместе с типами блюд.
 */
function groupByKind(dishTypes: DishType[]) {
    const byId = new Map<number, Taxon>();
    for (const type of dishTypes) {
        for (const taxon of type.default_taxons) byId.set(taxon.id, taxon);
    }
    const grouped: Partial<Record<TaxonKind, Taxon[]>> = {};
    for (const taxon of byId.values()) {
        (grouped[taxon.kind] ??= []).push(taxon);
    }
    for (const list of Object.values(grouped)) {
        list?.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    }
    return grouped;
}
