"use client";

import { useEffect } from "react";

import { normalizeSearchQuery } from "@/lib/search";

import {
  getNextRecentQueries,
  saveRecentQueries,
  useRecentSearchQueries,
} from "./recent-search-store";

const SAVE_DELAY_MS = 380;

type SaveRecentSearchQueryProps = {
  query: string;
};

export function SaveRecentSearchQuery({
  query,
}: SaveRecentSearchQueryProps) {
  const recentQueries = useRecentSearchQueries();

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) return;

    const queryKey = normalizeSearchQuery(trimmedQuery);
    const currentFirstKey = normalizeSearchQuery(recentQueries[0] ?? "");

    if (currentFirstKey === queryKey) return;

    const timeout = window.setTimeout(() => {
      saveRecentQueries(getNextRecentQueries(recentQueries, trimmedQuery));
    }, SAVE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [query, recentQueries]);

  return null;
}
