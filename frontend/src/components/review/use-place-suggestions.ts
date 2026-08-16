"use client";

import { useEffect, useState } from "react";

export type PlaceSuggestion = {
  id: number;
  name: string;
  address: string;
  city: string;
  postsCount: number;
  isConfirmed: boolean;
};

/** Меньше — незачем: по одной-двум буквам подсказки бесполезны. */
const MIN_QUERY = 2;
/** Пауза после последнего нажатия: иначе запрос улетал бы на каждую букву. */
const DEBOUNCE_MS = 250;

/**
 * Подсказки заведений по введённому названию.
 *
 * Это главная защита от дублей: человек видит, что место уже заведено, и
 * выбирает его — вместо того чтобы завести второе с опечаткой в названии.
 * Поиск нечёткий и по синонимам, город бэкенд подставляет свой.
 *
 * Ошибку глотаем: подсказки — помощь, а не условие. Не ответил сервер —
 * человек просто вводит название руками, как раньше.
 */
export function usePlaceSuggestions(query: string) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < MIN_QUERY) {
      setSuggestions([]);
      return;
    }

    let isActive = true;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/backend/places/suggest?text=${encodeURIComponent(text)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!isActive || !Array.isArray(data)) return;

        setSuggestions(
          data.map((place: any) => ({
            id: place.id,
            name: place.name,
            address: place.address,
            city: place.city,
            postsCount: place.posts_count ?? 0,
            isConfirmed: Boolean(place.is_confirmed),
          })),
        );
      } catch {
        /* подсказок не будет — вводу это не мешает */
      }
    }, DEBOUNCE_MS);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  return suggestions;
}
