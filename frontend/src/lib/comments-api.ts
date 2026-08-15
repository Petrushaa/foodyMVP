import type { PostComment } from "@/lib/mock-data";

function toComment(c: any): PostComment {
  return {
    id: c.id,
    user: c.user_detail?.username ? `@${c.user_detail.username}` : "@unknown",
    realName: c.user_detail?.full_name || c.user_detail?.username || "Аноним",
    avatarUrl: c.user_detail?.avatar || undefined,
    when: c.created_at ? new Date(c.created_at).toLocaleDateString("ru-RU") : "",
    text: c.text || "",
    likes: c.likes_count ?? 0,
    liked: Boolean(c.is_liked),
    parentId: c.parent ?? null,
    repliesCount: c.replies_count ?? 0,
    // Кому отвечают: ветка плоская, и без подписи непонятно, к чьей реплике
    // относится ответ.
    replyTo: c.reply_to || undefined,
    replyToCommentId: c.parent ?? undefined,
  };
}

function toList(data: any): PostComment[] {
  const raw: any[] = Array.isArray(data?.results)
    ? data.results
    : Array.isArray(data)
      ? data
      : [];
  return raw.map(toComment);
}

/**
 * Корневые комментарии поста. Ответы сюда не попадают — они лежат ветками
 * и подгружаются по требованию, чтобы длинная переписка под одним
 * комментарием не растягивала весь список.
 *
 * Идём через BFF-прокси, а не напрямую в API: он подставит токен из сессии,
 * и тогда вместе с текстом придёт `is_liked`.
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
    return toList(await res.json());
  } catch {
    return [];
  }
}

/** Ответы одного комментария — раскрывается по «Ответы (N)». */
export async function fetchCommentReplies(
  parentId: number | string,
): Promise<PostComment[]> {
  try {
    const res = await fetch(`/backend/comments?parent=${parentId}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    return toList(await res.json());
  } catch {
    return [];
  }
}
