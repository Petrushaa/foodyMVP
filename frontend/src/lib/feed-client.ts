// Клиентские мутации идут через BFF-прокси /backend (server route), который
// подставляет Authorization из httpOnly-сессии. Реальный JWT в браузер НЕ
// передаётся. Токен-параметр оставлен опциональным только для совместимости
// сигнатур вызовов — здесь он не используется.
const API_BASE = "/backend";

async function beFetch(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (init.body && !(init.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

// Лайк и закладка на бэке не «переключаются» сами: POST ставит, DELETE снимает.
// Нужное состояние вызывающий код и так знает (он же рисует оптимистичный UI),
// поэтому передаём его явно — иначе снять лайк было бы нечем.
export async function toggleLike(postId: number, nextLiked: boolean, _token?: string) {
  const res = await beFetch(`/posts/${postId}/like`, {
    method: nextLiked ? "POST" : "DELETE",
  });
  if (!res.ok) throw new Error(`like failed: ${res.status}`);
  return res.json().catch(() => ({}));
}

export async function toggleSave(postId: number, nextSaved: boolean, _token?: string) {
  const res = await beFetch(`/posts/${postId}/save`, {
    method: nextSaved ? "POST" : "DELETE",
  });
  if (!res.ok) throw new Error(`save failed: ${res.status}`);
  return res.json().catch(() => ({}));
}

/**
 * Лайк комментария. Как и у поста: POST ставит, DELETE снимает, ответ — `active`.
 *
 * Ошибку не пробрасываем, а возвращаем прежнее состояние: сердечко на
 * комментарии не то, ради чего стоит показывать пользователю сбой.
 */
export async function toggleCommentLike(
  commentId: number | string,
  nextLiked: boolean,
  authed?: string | null,
) {
  if (!authed) return { commentId, liked: nextLiked };

  try {
    const res = await beFetch(`/comments/${commentId}/like`, {
      method: nextLiked ? "POST" : "DELETE",
    });
    if (!res.ok) throw new Error(`comment like failed: ${res.status}`);
    const data = await res.json().catch(() => ({}));
    return { commentId, liked: Boolean(data?.active ?? nextLiked) };
  } catch {
    return { commentId, liked: !nextLiked }; // откатываем оптимистичный апдейт
  }
}

export async function toggleFollow(
  username: string,
  targetUserId: number | null,
  _token: string | undefined,
  nextFollowing: boolean,
) {
  if (!targetUserId) throw new Error("targetUserId required");
  const res = await beFetch(`/users/${targetUserId}/subscribe`, {
    method: nextFollowing ? "POST" : "DELETE",
  });
  if (!res.ok) throw new Error(`follow failed: ${res.status}`);
  return res.json().catch(() => ({}));
}
