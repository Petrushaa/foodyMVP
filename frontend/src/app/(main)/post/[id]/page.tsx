import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { PostComments } from "@/components/feed/post-comments";
import { PostItem } from "@/components/feed/post-item";
import { endpoints } from "@/lib/api/endpoints";
import { tryFetch } from "@/lib/api/server";
import type { Post } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Отдельный пост с комментариями. Открыт гостям — по такой ссылке и делятся. */
export default async function PostPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const [session, post] = await Promise.all([
    auth() as Promise<{ user?: { accessToken?: string } } | null>,
    tryFetch<Post>(endpoints.post(Number(id))),
  ]);

  if (!post) notFound();
  const canInteract = Boolean(session?.user?.accessToken);

  return (
    <div className="pb-10">
      <PostItem post={post} canInteract={canInteract} />
      <PostComments postId={post.id} canWrite={canInteract} />
    </div>
  );
}
