import type { PostComment } from "@/lib/mock-data";

/**
 * Комментарии поста для клиентской подгрузки.
 *
 * Идём через BFF-прокси, а не напрямую в API: он подставит токен из сессии, и
 * тогда вместе с текстом придёт `is_liked` — иначе состояние сердечек пришлось
 * бы догружать вторым запросом.
 *
 * Ошибку не пробрасываем: пустой список — приемлемая деградация, ради
 * комментариев не стоит валить всю карточку поста.
 */
export async function fetchPostComments(postId: number): Promise<PostComment[]> {
  try {
    const res = await fetch(`/backend/comments?post=${postId}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];

    const data = await res.json();
    const rawComments: any[] = Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data)
        ? data
        : [];

    return rawComments.map((c: any) => ({
      id: c.id,
      user: c.user_detail?.username ? `@${c.user_detail.username}` : "@unknown",
      realName: c.user_detail?.full_name || c.user_detail?.username || "Аноним",
      avatarUrl: c.user_detail?.avatar || undefined,
      when: c.created_at ? new Date(c.created_at).toLocaleDateString("ru-RU") : "",
      text: c.text || "",
      likes: c.likes_count ?? 0,
      liked: Boolean(c.is_liked),
    }));
  } catch {
    return [];
  }
}
