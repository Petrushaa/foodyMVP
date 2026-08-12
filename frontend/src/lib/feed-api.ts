// Реальные вызовы к /api/v1/comments/... для лайков на комменты.
// Раньше был stub-слой (см. backend-gaps §4) — сейчас бэк имеет CommentLike модель.

import type { Post } from "@/lib/mock-data";

export type FeedScope = "new" | "subs";

// Тип для страницы избранного (Wave D: /saved).
export type FavoritePostsResponse = {
  currentUser: string | null;
  followingUsers: string[];
  likedPostIds: number[];
  posts: Post[];
  recentFavoriteTags: string[];
  savedPostIds: number[];
  savedPostsCount: number;
};

export function isFeedScope(value: string | null): value is FeedScope {
  return value === "new" || value === "subs";
}

/** Утилита: добавить/убрать postId из массива. */
export function getNextPostIdMembership(
  postIds: number[],
  postId: number,
  included: boolean,
) {
  const hasPostId = postIds.includes(postId);

  if (included) {
    return hasPostId ? postIds : [...postIds, postId];
  }

  return hasPostId ? postIds.filter((id) => id !== postId) : postIds;
}

/**
 * Получить подмножество ID комментов, которые лайкнуты текущим юзером.
 * Используется при открытии модалки комментов чтобы за один запрос инициализировать
 * состояние сердечек для всех видимых комментов.
 *
 * Передаёт accessToken через apiRequest (нужен auth — endpoint требует IsAuthenticated).
 * Если accessToken отсутствует или запрос упал — возвращаем пустой список (UI без лайков, не блокирующе).
 */
export async function requestCommentLikes(
  commentIds: Array<number | string>,
  accessToken?: string | null,
) {
  if (!commentIds.length || !accessToken) {
    return { likedCommentIds: [] as string[] };
  }
  try {
    const ids = commentIds.join(",");
    // BFF-прокси /backend подставит токен из сессии на сервере.
    const res = await fetch(
      `/backend/comments/likes?ids=${encodeURIComponent(ids)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return { likedCommentIds: [] as string[] };
    const data = await res.json().catch(() => ({}));
    return { likedCommentIds: (data?.liked_comment_ids ?? []) as string[] };
  } catch {
    return { likedCommentIds: [] as string[] };
  }
}

/**
 * Тогл лайка на коммент. POST на /comments/{id}/like/ — бэк сам определяет
 * текущее состояние и инвертирует. Параметр nextLiked сейчас не используется
 * в запросе (бэк toggle), но возвращается клиенту для оптимистичного апдейта.
 */
export async function requestCommentLikeMutation(
  commentId: number | string,
  nextLiked: boolean,
  accessToken?: string | null,
) {
  if (!accessToken) {
    return {
      commentId,
      liked: nextLiked,
      likedCommentIds: [] as string[],
    };
  }
  try {
    const res = await fetch(`/backend/comments/${commentId}/like`, {
      method: "POST",
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json().catch(() => ({}));
    return {
      commentId,
      liked: Boolean(data?.liked ?? nextLiked),
      likedCommentIds: [] as string[],
    };
  } catch {
    return {
      commentId,
      liked: !nextLiked, // ошибка — откатить
      likedCommentIds: [] as string[],
    };
  }
}
