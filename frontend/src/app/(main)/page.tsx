import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { FeedClient } from "@/components/feed/feed-client";
import { mapApiPostToFeedPost, type ApiPost } from "@/lib/feed-adapter";
import type { FeedTab } from "@/components/feed/feed-header";

export const dynamic = "force-dynamic";

export default async function Home(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  // Принимаем оба алиаса: ?tab=following (внутренний URL фронта) и
  // ?tab=subs (короткая форма, упоминается в сценариях/документации).
  const tabParam = searchParams.tab;
  const isFollowingTab = tabParam === "following" || tabParam === "subs";
  const initialTab: FeedTab = isFollowingTab ? "subs" : "new";

  const session = (await auth()) as any;
  const accessToken: string | null = session?.user?.accessToken ?? null;

  // Ленты теперь различаются параметром, а не отдельными ручками.
  const endpoint = isFollowingTab ? "/posts/?feed=subscriptions" : "/posts/";
  let apiPosts: ApiPost[] = [];
  // R4-B2 infinite scroll: бэк отдаёт page-number пагинацию
  // (count/next/previous/results). next === null значит больше страниц нет.
  let initialHasMore = false;
  try {
    const options: any = { headers: {} };
    if (accessToken) options.headers.Authorization = `Bearer ${accessToken}`;
    const data = await apiRequest(endpoint, options);
    const results = Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data)
      ? data
      : [];
    apiPosts = results as ApiPost[];
    initialHasMore = Boolean(data?.next);
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") {
      redirect("/login");
    }
  }

  const posts = apiPosts.map(mapApiPostToFeedPost);
  const likedIds = apiPosts.filter((p) => p.is_liked).map((p) => p.id);
  const savedIds = apiPosts.filter((p) => p.is_saved).map((p) => p.id);

  // R4-B4 + follow-up fix: бэк теперь отдаёт is_following в
  // FeedPostAuthorSerializer (`user.is_following`). Собираем уникальные
  // @username'ы авторов, на которых текущий юзер подписан — FeedClient
  // использует это как initial state кнопки follow в карточках.
  const initialFollowingUsers: string[] = Array.from(
    new Set(
      apiPosts
        .filter((p) => p.user?.is_following)
        .map((p) => `@${p.user.username}`)
    )
  );

  let myHandle: string | null = null;
  if (accessToken) {
    try {
      const me = await apiRequest("/users/me/", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      myHandle = me?.username ? `@${me.username}` : null;
    } catch {
      /* ignore */
    }
  }

  return (
    <FeedClient
      initialPosts={posts}
      likedIds={likedIds}
      savedIds={savedIds}
      currentUser={myHandle}
      accessToken={accessToken ? "authed" : null}
      initialTab={initialTab}
      initialNextPage={initialHasMore ? 2 : null}
      endpoint={endpoint}
      initialFollowingUsers={initialFollowingUsers}
    />
  );
}
