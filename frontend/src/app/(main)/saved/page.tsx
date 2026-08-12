import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { SavedGrid } from "@/components/feed/saved-grid";
import { mapApiPostToFeedPost, type ApiPost } from "@/lib/feed-adapter";
import { GlassSurface } from "@/components/feed/glass-surface";
import { Bookmark } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const session = (await auth()) as any;
  if (!session?.user?.accessToken) {
    redirect("/login");
  }

  const token = session.user.accessToken;
  let apiPosts: ApiPost[] = [];

  try {
    // GET /api/v1/posts/saved/ — action on PostViewSet (url_path='saved')
    const data = await apiRequest("/posts/?feed=saved", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const results = Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data)
        ? data
        : [];
    apiPosts = results as ApiPost[];
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") redirect("/login");
  }

  const posts = apiPosts.map(mapApiPostToFeedPost);
  const likedIds = apiPosts.filter((p) => p.is_liked).map((p) => p.id);
  const savedIds = apiPosts.filter((p) => p.is_saved).map((p) => p.id);
  const initialFollowingUsers: string[] = Array.from(
    new Set(
      apiPosts
        .filter((p) => p.user?.is_following)
        .map((p) => `@${p.user.username}`)
    )
  );

  let myHandle: string | null = null;
  try {
    const me = await apiRequest("/users/me/", {
      headers: { Authorization: `Bearer ${token}` },
    });
    myHandle = me?.username ? `@${me.username}` : null;
  } catch {
    /* ignore */
  }

  if (posts.length === 0) {
    return (
      <main className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 flex flex-col px-4 pt-2 pb-25">
          <div className="mb-4 flex items-center gap-2">
            <Bookmark className="size-6 text-[#15291C]" strokeWidth={2.2} />
            <h1 className="text-[24px] font-extrabold tracking-[-0.3px] text-[#15291C]">
              Избранное
            </h1>
          </div>
          <GlassSurface className="flex flex-1 items-center justify-center rounded-[26px] border border-white/65 bg-white/45 shadow-[0_8px_24px_rgba(20,40,28,0.10),0_2px_6px_rgba(20,40,28,0.06)]">
            <div className="max-w-[280px] px-6 text-center">
              <p className="text-[18px] font-extrabold text-[#15291C]">
                Пока ничего не сохранено
              </p>
              <p className="mt-2 text-[14px] font-medium text-[#5C6B62]">
                Сохраняйте посты, нажимая на закладку — они появятся здесь.
              </p>
            </div>
          </GlassSurface>
        </div>
      </main>
    );
  }

  return (
    <SavedGrid
      initialPosts={posts}
      likedIds={likedIds}
      savedIds={savedIds}
      currentUser={myHandle}
      accessToken="authed"
      initialFollowingUsers={initialFollowingUsers}
    />
  );
}
