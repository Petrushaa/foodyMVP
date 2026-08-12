import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PostFeed } from "@/components/feed/post-feed";
import { endpoints } from "@/lib/api/endpoints";
import { tryFetch } from "@/lib/api/server";
import type { Paginated, Post } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Сохранённые посты — та же лента, только с другим фильтром. */
export default async function SavedPage() {
  const session = (await auth()) as { user?: { accessToken?: string } } | null;
  if (!session?.user?.accessToken) redirect("/login");

  const data = await tryFetch<Paginated<Post>>(endpoints.posts({ feed: "saved" }));

  return (
    <PostFeed
      initialPosts={data?.results ?? []}
      initialHasMore={Boolean(data?.next)}
      canInteract
    />
  );
}
