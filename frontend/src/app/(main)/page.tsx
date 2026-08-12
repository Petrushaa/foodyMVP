import { auth } from "@/auth";
import { PostFeed } from "@/components/feed/post-feed";
import { tryFetch } from "@/lib/api/server";
import { endpoints } from "@/lib/api/endpoints";
import type { Paginated, Post } from "@/lib/types";

// Лента открыта гостям и должна отдаваться сразу отрисованной: по ссылке
// из мессенджера человек видит контент, а поисковик — текст.
export const dynamic = "force-dynamic";

export default async function Home() {
  const session = (await auth()) as { user?: { accessToken?: string } } | null;
  const canInteract = Boolean(session?.user?.accessToken);

  // Первая страница с сервера. Если бэкенд недоступен — показываем пустую ленту,
  // а не страницу ошибки: читатель не должен упираться в стену из-за сбоя.
  const data = await tryFetch<Paginated<Post>>(endpoints.posts());

  return (
    <PostFeed
      initialPosts={data?.results ?? []}
      initialHasMore={Boolean(data?.next)}
      canInteract={canInteract}
    />
  );
}
