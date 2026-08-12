import type { Post } from "@/lib/mock-data";

export const SEARCH_RESULTS_PATH = "/search/results";

export function normalizeSearchQuery(query: string) {
  return query.trim().toLowerCase();
}

export function getSearchResultsHref(query: string) {
  const trimmedQuery = query.trim();
  const params = new URLSearchParams({ q: trimmedQuery });

  return `${SEARCH_RESULTS_PATH}?${params.toString()}`;
}

export function getTagSearchHref(tagName: string) {
  const trimmed = tagName.trim();
  const params = new URLSearchParams({ tag_name: trimmed });

  return `${SEARCH_RESULTS_PATH}?${params.toString()}`;
}

export function getSingleSearchParam(
  value: string | string[] | undefined
) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export function postMatchesSearchQuery(post: Post, query: string) {
  const normalizedQuery = normalizeSearchQuery(query);

  if (normalizedQuery.length === 0) {
    return false;
  }

  return [post.dish, ...post.tags].some((value) =>
    normalizeSearchQuery(value).includes(normalizedQuery)
  );
}

export function filterPostsBySearchQuery(posts: Post[], query: string) {
  return posts.filter((post) => postMatchesSearchQuery(post, query));
}
