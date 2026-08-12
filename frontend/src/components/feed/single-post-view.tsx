"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useCallback, useState } from "react";

import { PostCard } from "@/components/feed/post-card";
import type { Post } from "@/lib/mock-data";
import { DEFAULT_TWEAKS } from "@/lib/tweaks";
import { toggleLike, toggleSave } from "@/lib/feed-client";

type Props = {
  post: Post;
  initialLiked: boolean;
  initialSaved: boolean;
  currentUser: string | null;
  accessToken: string | null;
};

export function SinglePostView({
  post,
  initialLiked,
  initialSaved,
  currentUser,
  accessToken,
}: Props) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [saved, setSaved] = useState(initialSaved);
  const [likePending, setLikePending] = useState(false);
  const [savePending, setSavePending] = useState(false);

  const onLikeToggle = useCallback(
    async (_id: number, nextLiked: boolean) => {
      if (!accessToken || likePending) return;
      setLikePending(true);
      try {
        await toggleLike(post.id, accessToken);
        setLiked(nextLiked);
      } catch {
        /* ignore */
      } finally {
        setLikePending(false);
      }
    },
    [accessToken, likePending, post.id],
  );

  const onSaveToggle = useCallback(
    async (_id: number, nextSaved: boolean) => {
      if (!accessToken || savePending) return;
      setSavePending(true);
      try {
        await toggleSave(post.id, accessToken);
        setSaved(nextSaved);
      } catch {
        /* ignore */
      } finally {
        setSavePending(false);
      }
    },
    [accessToken, savePending, post.id],
  );

  return (
    <main className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 flex flex-col pt-2">
        <header className="mb-2 flex items-center gap-3 px-5">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Назад"
            className="grid size-9 place-items-center rounded-full border border-white/65 bg-white/58 text-[#15291C] shadow-[0_8px_20px_rgba(20,40,28,0.14),inset_1px_1px_0_rgba(255,255,255,0.86)] backdrop-blur-[18px]"
          >
            <ArrowLeft className="size-[18px]" strokeWidth={2.35} />
          </button>
          <h1 className="text-[20px] font-extrabold tracking-[-0.3px] text-[#15291C]">
            Пост
          </h1>
        </header>

        <section className="hide-scroll flex-1 overflow-y-auto pb-25">
          <PostCard
            post={post}
            brand={DEFAULT_TWEAKS.brand}
            density={DEFAULT_TWEAKS.density}
            currentUser={currentUser}
            isAuthorFollowed={false}
            isFollowPending={false}
            isLiked={liked}
            isLikePending={likePending}
            isSaved={saved}
            isSavePending={savePending}
            onFollowToggle={async () => {}}
            onLikeToggle={onLikeToggle}
            onSaveToggle={onSaveToggle}
          />
        </section>
      </div>
    </main>
  );
}
