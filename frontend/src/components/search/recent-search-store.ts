"use client";

import { useSyncExternalStore } from "react";

import { normalizeSearchQuery } from "@/lib/search";

const RECENT_SEARCH_STORAGE_KEY = "recentSearchQueries";
const MAX_RECENT_QUERIES = 10;
const EMPTY_RECENT_QUERIES: string[] = [];
const recentQueryListeners = new Set<() => void>();

let recentQueriesSnapshot: string[] = EMPTY_RECENT_QUERIES;
let recentQueriesSnapshotSource: string | null = null;

function normalizeQueries(queries: unknown): string[] {
  if (!Array.isArray(queries)) return [];

  return queries.reduce<string[]>((recent, value) => {
    if (typeof value !== "string") return recent;
    if (recent.length >= MAX_RECENT_QUERIES) return recent;

    const query = value.trim();
    const queryKey = normalizeSearchQuery(query);

    if (
      queryKey.length === 0 ||
      recent.some((item) => normalizeSearchQuery(item) === queryKey)
    ) {
      return recent;
    }

    return [...recent, query];
  }, []);
}

export function getNextRecentQueries(current: string[], query: string) {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) return current;

  const queryKey = normalizeSearchQuery(trimmedQuery);
  const withoutDuplicate = current.filter(
    (item) => normalizeSearchQuery(item) !== queryKey
  );

  return [trimmedQuery, ...withoutDuplicate].slice(0, MAX_RECENT_QUERIES);
}

function getStoredRecentQueries() {
  if (typeof window === "undefined") return EMPTY_RECENT_QUERIES;

  try {
    const stored = window.localStorage.getItem(RECENT_SEARCH_STORAGE_KEY);
    if (stored === recentQueriesSnapshotSource) {
      return recentQueriesSnapshot;
    }

    recentQueriesSnapshotSource = stored;
    recentQueriesSnapshot = normalizeQueries(stored ? JSON.parse(stored) : []);
    return recentQueriesSnapshot;
  } catch {
    return EMPTY_RECENT_QUERIES;
  }
}

export function saveRecentQueries(queries: string[]) {
  if (typeof window === "undefined") return;

  const next = normalizeQueries(queries);
  const serialized = JSON.stringify(next);

  try {
    window.localStorage.setItem(RECENT_SEARCH_STORAGE_KEY, serialized);
  } catch {
    // Keep search usable when storage is unavailable.
  }

  recentQueriesSnapshot = next;
  recentQueriesSnapshotSource = serialized;
  recentQueryListeners.forEach((listener) => listener());
}

function subscribeToRecentQueries(listener: () => void) {
  if (typeof window === "undefined") return () => {};

  recentQueryListeners.add(listener);

  function handleStorage(event: StorageEvent) {
    if (event.key === RECENT_SEARCH_STORAGE_KEY) {
      recentQueriesSnapshotSource = null;
      listener();
    }
  }

  window.addEventListener("storage", handleStorage);

  return () => {
    recentQueryListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function getEmptyRecentQueries() {
  return EMPTY_RECENT_QUERIES;
}

export function useRecentSearchQueries() {
  return useSyncExternalStore(
    subscribeToRecentQueries,
    getStoredRecentQueries,
    getEmptyRecentQueries
  );
}
