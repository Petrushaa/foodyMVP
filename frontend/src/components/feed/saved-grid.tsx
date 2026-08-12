"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bookmark } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { DishPhoto } from "@/components/feed/dish-photo";
import { FullScreenPost } from "@/components/feed/full-screen-post";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { toggleLike, toggleSave, toggleFollow } from "@/lib/feed-client";
import type { Post, PostComment } from "@/lib/mock-data";
import { DEFAULT_TWEAKS } from "@/lib/tweaks";
import { cn } from "@/lib/utils";

const TWEAKS = DEFAULT_TWEAKS;

type SavedGridProps = {
  initialPosts: Post[];
  likedIds: number[];
  savedIds: number[];
  currentUser: string | null;
  accessToken: string | null;
  initialFollowingUsers?: string[];
};

// CSR-подгрузка комментариев для открытого поста (тот же путь, что в PostCard).
async function fetchPostComments(postId: number): Promise<PostComment[]> {
  try {
    const res = await fetch(`/api/v1/posts/${postId}/comments/`, {
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
      likes: 0,
    }));
  } catch {
    return [];
  }
}

function SavedTile({
  post,
  onClick,
  shouldReduceMotion,
}: {
  post: Post;
  onClick: () => void;
  shouldReduceMotion: boolean | null;
}) {
  const hasPhoto = post.photos > 0 && !!post.photoUrls?.[0];

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="group min-w-0 cursor-pointer rounded-[18px] text-left outline-none focus-visible:ring-2 focus-visible:ring-[#15291C]/18"
      whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
    >
      <AspectRatio
        ratio={0.94}
        className={cn(
          "relative overflow-hidden rounded-[18px] bg-white",
          "border border-black/[0.06] shadow-[0_2px_10px_rgba(20,40,28,0.08)]"
        )}
      >
        {hasPhoto ? (
          <DishPhoto seed={post.seed} height="100%" label="" src={post.photoUrls?.[0]} />
        ) : (
          <div className="grid h-full place-items-center bg-[#EDEFED]">
            <Bookmark className="size-7 text-[#15291C]/25" strokeWidth={2.2} />
          </div>
        )}
        <div className="absolute inset-x-2 bottom-2 rounded-[12px] bg-black/25 px-2.5 py-2 text-white shadow-[0_4px_14px_rgba(0,0,0,0.16)] backdrop-blur-[10px]">
          <p className="line-clamp-2 text-[12px] leading-[1.08] font-extrabold tracking-[0px]">
            {post.dish}
          </p>
          {post.place && (
            <p className="mt-1 line-clamp-1 text-[10.5px] leading-[1.12] font-medium text-white/80">
              {post.place}
            </p>
          )}
        </div>
      </AspectRatio>
    </motion.button>
  );
}

export function SavedGrid({
  initialPosts,
  likedIds,
  savedIds,
  currentUser,
  accessToken,
  initialFollowingUsers = [],
}: SavedGridProps) {
  const shouldReduceMotion = useReducedMotion();
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [likedSet, setLikedSet] = useState<Set<number>>(() => new Set(likedIds));
  const [savedSet, setSavedSet] = useState<Set<number>>(() => new Set(savedIds));
  const [followingSet, setFollowingSet] = useState<Set<string>>(
    () => new Set(initialFollowingUsers)
  );
  const [pendingLikes, setPendingLikes] = useState<Set<number>>(() => new Set());
  const [pendingSaves, setPendingSaves] = useState<Set<number>>(() => new Set());
  const [pendingFollows, setPendingFollows] = useState<Set<string>>(() => new Set());
  const [activePost, setActivePost] = useState<Post | null>(null);
  const [activeComments, setActiveComments] = useState<PostComment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (notice) {
      const id = setTimeout(() => setNotice(null), 3000);
      return () => clearTimeout(id);
    }
  }, [notice]);

  const openPost = useCallback((post: Post) => {
    setActiveComments([]);
    setActivePost(post);
    void fetchPostComments(post.id).then(setActiveComments);
  }, []);

  const onLikeToggle = useCallback(
    async (postId: number, nextLiked: boolean) => {
      if (!currentUser || !accessToken) {
        setNotice("Войдите, чтобы лайкнуть.");
        return;
      }
      if (pendingLikes.has(postId)) return;
      setPendingLikes((s) => new Set(s).add(postId));
      try {
        await toggleLike(postId, accessToken);
        setLikedSet((s) => {
          const next = new Set(s);
          if (nextLiked) next.add(postId);
          else next.delete(postId);
          return next;
        });
      } catch {
        setNotice("Не удалось обновить лайк.");
      } finally {
        setPendingLikes((s) => {
          const next = new Set(s);
          next.delete(postId);
          return next;
        });
      }
    },
    [accessToken, currentUser, pendingLikes]
  );

  const onSaveToggle = useCallback(
    async (postId: number, nextSaved: boolean) => {
      if (!currentUser || !accessToken) {
        setNotice("Войдите, чтобы сохранить.");
        return;
      }
      if (pendingSaves.has(postId)) return;
      setPendingSaves((s) => new Set(s).add(postId));
      try {
        await toggleSave(postId, accessToken);
        setSavedSet((s) => {
          const next = new Set(s);
          if (nextSaved) next.add(postId);
          else next.delete(postId);
          return next;
        });
        // Это страница избранного: снятие закладки убирает плитку из сетки,
        // повторное сохранение (пока пост открыт) — возвращает её обратно.
        setPosts((prev) => {
          if (!nextSaved) return prev.filter((p) => p.id !== postId);
          if (prev.some((p) => p.id === postId)) return prev;
          const restored = activePost?.id === postId ? activePost : null;
          return restored ? [restored, ...prev] : prev;
        });
      } catch {
        setNotice("Не удалось обновить избранное.");
      } finally {
        setPendingSaves((s) => {
          const next = new Set(s);
          next.delete(postId);
          return next;
        });
      }
    },
    [accessToken, activePost, currentUser, pendingSaves]
  );

  const onFollowToggle = useCallback(
    async (author: string, nextFollowing: boolean) => {
      if (!currentUser || !accessToken) {
        setNotice("Войдите, чтобы подписаться.");
        return;
      }
      if (pendingFollows.has(author)) return;
      const target =
        posts.find((p) => p.user === author) ??
        (activePost?.user === author ? activePost : null);
      const targetUserId = target?.userId;
      if (!targetUserId) {
        setNotice("Не удалось определить пользователя для подписки.");
        return;
      }
      setPendingFollows((s) => new Set(s).add(author));
      try {
        await toggleFollow(author, targetUserId, accessToken, nextFollowing);
        setFollowingSet((s) => {
          const next = new Set(s);
          if (nextFollowing) next.add(author);
          else next.delete(author);
          return next;
        });
      } catch {
        setNotice("Не удалось обновить подписку.");
      } finally {
        setPendingFollows((s) => {
          const next = new Set(s);
          next.delete(author);
          return next;
        });
      }
    },
    [accessToken, activePost, currentUser, pendingFollows, posts]
  );

  const likedSnapshot = useMemo(() => likedSet, [likedSet]);
  const savedSnapshot = useMemo(() => savedSet, [savedSet]);

  return (
    <main className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 flex flex-col pt-2">
        <header className="flex items-center gap-2 px-5 pt-2 pb-3">
          <Bookmark className="size-6 text-[#15291C]" strokeWidth={2.2} />
          <h1 className="text-[24px] font-extrabold tracking-[-0.3px] text-[#15291C]">
            Избранное
          </h1>
        </header>

        <section
          aria-label="Сохранённые посты"
          className="hide-scroll min-h-0 flex-1 overflow-y-auto pb-24 lg:pb-6"
        >
          <div className="grid grid-cols-2 gap-x-3.5 gap-y-4 px-3.5 pt-1 pb-4 max-[409px]:gap-x-3 max-[409px]:px-3">
            {posts.map((post) => (
              <SavedTile
                key={post.id}
                post={post}
                shouldReduceMotion={shouldReduceMotion}
                onClick={() => openPost(post)}
              />
            ))}
          </div>
        </section>

        {notice && (
          <div className="pointer-events-none absolute right-4 bottom-[6.25rem] left-4 z-30 rounded-[18px] border border-white/70 bg-white/78 px-4 py-3 text-center text-[13px] leading-tight font-bold text-[#15291C] shadow-[0_12px_24px_rgba(20,40,28,0.14),inset_1px_1px_0_rgba(255,255,255,0.8)] backdrop-blur-[20px]">
            <p role="status">{notice}</p>
          </div>
        )}

        <AnimatePresence>
          {activePost && (
            <FullScreenPost
              key={activePost.id}
              post={activePost}
              brand={TWEAKS.brand}
              currentUser={currentUser}
              density={TWEAKS.density}
              comments={activeComments}
              isAuthorFollowed={followingSet.has(activePost.user)}
              isFollowPending={pendingFollows.has(activePost.user)}
              isLiked={likedSnapshot.has(activePost.id)}
              isLikePending={pendingLikes.has(activePost.id)}
              isSaved={savedSnapshot.has(activePost.id)}
              isSavePending={pendingSaves.has(activePost.id)}
              onClose={() => setActivePost(null)}
              onFollowToggle={onFollowToggle}
              onLikeToggle={onLikeToggle}
              onSaveToggle={onSaveToggle}
            />
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
