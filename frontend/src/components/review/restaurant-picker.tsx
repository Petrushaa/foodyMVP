"use client";

/**
 * Выбор заведения — главное место, где решается судьба справочника.
 *
 * Человек вводит название, и мы сразу показываем те заведения, что уже есть,
 * с адресом и числом постов. Это и есть основная защита от дублей: рядом
 * с «Кофемания, Пушкина 10 · 24 поста» никто не станет заводить второе.
 *
 * Ввести новое место можно, но только целиком — с адресом и городом. Половинчатый
 * ввод бэкенд не примет: без адреса заведение не отличить от тёзки на другой улице.
 */

import { useEffect, useRef, useState } from "react";

import { suggestPlaces } from "@/lib/api/client";
import type { PlaceSuggestion } from "@/lib/types";

/** Что компонент отдаёт наружу: либо выбранное заведение, либо заявка на новое. */
export type RestaurantChoice =
    | { kind: "existing"; restaurant: PlaceSuggestion }
    | { kind: "new"; name: string; address: string; city: string };

interface Props {
    value: RestaurantChoice | null;
    onChange: (choice: RestaurantChoice | null) => void;
    /** Город пользователя — сужает подсказки и подставляется в форму нового места. */
    defaultCity?: string;
}

// Пока символов мало, подсказки бессмысленны — только мигают.
const MIN_QUERY = 2;
// Пауза после ввода: не дёргаем сервер на каждую букву.
const DEBOUNCE_MS = 250;

export function RestaurantPicker({ value, onChange, defaultCity = "" }: Props) {
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [address, setAddress] = useState("");
    const [city, setCity] = useState(defaultCity);

    // Гонка ответов: медленный запрос не должен перезаписать свежий результат.
    const requestId = useRef(0);

    useEffect(() => {
        if (value?.kind === "existing" || query.trim().length < MIN_QUERY) {
            setSuggestions([]);
            return;
        }

        const id = ++requestId.current;
        setIsSearching(true);
        const timer = setTimeout(async () => {
            try {
                const found = await suggestPlaces(query.trim(), city || defaultCity);
                if (id === requestId.current) setSuggestions(found);
            } catch {
                if (id === requestId.current) setSuggestions([]);
            } finally {
                if (id === requestId.current) setIsSearching(false);
            }
        }, DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [query, city, defaultCity, value]);

    function pick(restaurant: PlaceSuggestion) {
        onChange({ kind: "existing", restaurant });
        setQuery(restaurant.name);
        setSuggestions([]);
        setIsCreating(false);
    }

    function reset() {
        onChange(null);
        setQuery("");
        setSuggestions([]);
        setIsCreating(false);
        setAddress("");
    }

    function syncNew(nextName: string, nextAddress: string, nextCity: string) {
        const ready = nextName.trim() && nextAddress.trim() && nextCity.trim();
        onChange(
            ready
                ? { kind: "new", name: nextName.trim(), address: nextAddress.trim(), city: nextCity.trim() }
                : null,
        );
    }

    // --- Заведение уже выбрано ---
    if (value?.kind === "existing") {
        const place = value.restaurant;
        return (
            <div className="rounded-2xl border border-neutral-200 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="truncate font-medium">{place.name}</p>
                        <p className="truncate text-sm text-neutral-500">{place.address}</p>
                        <p className="mt-1 text-xs text-neutral-400">
                            {place.posts_count > 0
                                ? `${place.posts_count} ${plural(place.posts_count, "пост", "поста", "постов")}`
                                : "Пока без постов"}
                            {!place.is_confirmed && " · новое место"}
                        </p>
                    </div>
                    <button type="button" onClick={reset} className="shrink-0 text-sm text-neutral-500 underline">
                        Изменить
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <input
                value={query}
                onChange={(event) => {
                    setQuery(event.target.value);
                    if (isCreating) syncNew(event.target.value, address, city);
                }}
                placeholder="Название заведения"
                className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:border-neutral-400"
            />

            {isSearching && <p className="px-1 text-sm text-neutral-400">Ищем…</p>}

            {/* Подсказки. Число постов рядом с названием — не украшение:
                по нему человек отличает настоящее заведение от чьего-то дубля. */}
            {suggestions.length > 0 && (
                <ul className="overflow-hidden rounded-2xl border border-neutral-200">
                    {suggestions.map((place) => (
                        <li key={place.id}>
                            <button
                                type="button"
                                onClick={() => pick(place)}
                                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-neutral-50"
                            >
                                <span className="min-w-0">
                                    <span className="block truncate font-medium">{place.name}</span>
                                    <span className="block truncate text-sm text-neutral-500">{place.address}</span>
                                </span>
                                <span className="shrink-0 text-xs text-neutral-400">
                                    {place.posts_count > 0 ? `${place.posts_count} ${plural(place.posts_count, "пост", "поста", "постов")}` : "новое"}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {/* Кнопку «моего места нет» показываем только после поиска — чтобы человек
                сперва посмотрел подсказки, а не заводил новое по привычке. */}
            {!isCreating && query.trim().length >= MIN_QUERY && !isSearching && (
                <button
                    type="button"
                    onClick={() => {
                        setIsCreating(true);
                        syncNew(query, address, city);
                    }}
                    className="w-full rounded-2xl border border-dashed border-neutral-300 px-4 py-3 text-sm text-neutral-600"
                >
                    {suggestions.length > 0 ? "Моего места нет в списке" : "Добавить это заведение"}
                </button>
            )}

            {isCreating && (
                <div className="space-y-3 rounded-2xl border border-neutral-200 p-4">
                    <p className="text-sm text-neutral-500">
                        Новое заведение появится после проверки модератором.
                    </p>
                    <input
                        value={address}
                        onChange={(event) => {
                            setAddress(event.target.value);
                            syncNew(query, event.target.value, city);
                        }}
                        placeholder="Адрес — улица и номер дома"
                        className="w-full rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:border-neutral-400"
                    />
                    <input
                        value={city}
                        onChange={(event) => {
                            setCity(event.target.value);
                            syncNew(query, address, event.target.value);
                        }}
                        placeholder="Город"
                        className="w-full rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:border-neutral-400"
                    />
                </div>
            )}
        </div>
    );
}

function plural(count: number, one: string, few: string, many: string) {
    const mod100 = count % 100;
    if (mod100 >= 11 && mod100 <= 14) return many;
    const mod10 = count % 10;
    if (mod10 === 1) return one;
    if (mod10 >= 2 && mod10 <= 4) return few;
    return many;
}
