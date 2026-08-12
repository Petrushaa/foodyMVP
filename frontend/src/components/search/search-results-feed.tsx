"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PostCard } from "@/components/feed/post-card";
import { toggleLike, toggleSave, toggleFollow } from "@/lib/feed-client";
import type { Density, Post } from "@/lib/mock-data";

type SearchResultsFeedProps = {
  brand: string;
  currentUser: string | null;
  accessToken: string | null;
  density: Density;
  initialFollowingUsers: string[];
  initialLikedPostIds: number[];
  initialSavedPostIds: number[];
  posts: Post[];
  /** Whether there are more pages to load (cursor next != null). */
  hasMore?: boolean;
};

export function SearchResultsFeed({
  brand,
  currentUser,
  accessToken,
  density,
  initialFollowingUsers,
  initialLikedPostIds,
  initialSavedPostIds,
  posts,
  hasMore = false,
}: SearchResultsFeedProps) {
  const [followingUsers, setFollowingUsers] = useState(initialFollowingUsers);
  const [likedPostIds, setLikedPostIds] = useState(initialLikedPostIds);
  const [savedPostIds, setSavedPostIds] = useState(initialSavedPostIds);
  const [pendingAuthors, setPendingAuthors] = useState<Set<string>>(
    () => new Set()
  );
  const [pendingLikePostIds, setPendingLikePostIds] = useState<Set<number>>(
    () => new Set()
  );
  const [pendingSavePostIds, setPendingSavePostIds] = useState<Set<number>>(
    () => new Set()
  );
  const [notice, setNotice] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // PG4: wheel-to-snap handler — lets mouse wheel navigate the snap-y container
  useEffect(() => {
    const el = containerRef.current?.closest<HTMLElement>(".snap-y") ?? null;
    if (!el) return;
    let acc = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      acc += e.deltaY;
      if (Math.abs(acc) > 80) {
        const dir = acc > 0 ? 1 : -1;
        el.scrollBy({ top: el.clientHeight * dir, behavior: "smooth" });
        acc = 0;
      }
      clearTimeout(timer);
      timer = setTimeout(() => { acc = 0; }, 200);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      clearTimeout(timer);
    };
  }, []);

  // Auto-dismiss notice after 3 seconds
  useEffect(() => {
    if (notice) {
      const id = setTimeout(() => setNotice(null), 3000);
      return () => clearTimeout(id);
    }
  }, [notice]);

  const followingUsersSet = useMemo(
    () => new Set(followingUsers),
    [followingUsers]
  );
  const likedPostIdsSet = useMemo(
    () => new Set(likedPostIds),
    [likedPostIds]
  );
  const savedPostIdsSet = useMemo(
    () => new Set(savedPostIds),
    [savedPostIds]
  );

  const onFollowToggle = useCallback(
    async (author: string, nextFollowing: boolean) => {
      if (!currentUser || !accessToken || pendingAuthors.has(author)) {
        if (!currentUser) setNotice("Войдите, чтобы подписываться.");
        return;
      }

      setNotice(null);
      setPendingAuthors((current) => new Set(current).add(author));

      try {
        const target = posts.find((p) => p.user === author);
        const targetUserId = target?.userId ?? null;
        await toggleFollow(author, targetUserId ?? null, accessToken, nextFollowing);
        setFollowingUsers((current) => {
          const next = new Set(current);
          if (nextFollowing) next.add(author);
          else next.delete(author);
          return Array.from(next);
        });
      } catch {
        setNotice("Не удалось обновить подписку. Попробуйте ещё раз.");
      } finally {
        setPendingAuthors((current) => {
          const next = new Set(current);
          next.delete(author);
          return next;
        });
      }
    },
    [currentUser, accessToken, pendingAuthors, posts]
  );

  const onLikeToggle = useCallback(
    async (postId: number, nextLiked: boolean) => {
      if (!currentUser || !accessToken || pendingLikePostIds.has(postId)) {
        if (!currentUser) setNotice("Войдите, чтобы ставить лайки.");
        return;
      }

      setNotice(null);
      setPendingLikePostIds((current) => new Set(current).add(postId));

      try {
        await toggleLike(postId, accessToken);
        setLikedPostIds((current) => {
          const next = new Set(current);
          if (nextLiked) next.add(postId);
          else next.delete(postId);
          return Array.from(next);
        });
      } catch {
        setNotice("Не удалось обновить лайк. Попробуйте ещё раз.");
      } finally {
        setPendingLikePostIds((current) => {
          const next = new Set(current);
          next.delete(postId);
          return next;
        });
      }
    },
    [currentUser, accessToken, pendingLikePostIds]
  );

  const onSaveToggle = useCallback(
    async (postId: number, nextSaved: boolean) => {
      if (!currentUser || !accessToken || pendingSavePostIds.has(postId)) {
        if (!currentUser) setNotice("Войдите, чтобы сохранять посты.");
        return;
      }

      setNotice(null);
      setPendingSavePostIds((current) => new Set(current).add(postId));

      try {
        await toggleSave(postId, accessToken);
        setSavedPostIds((current) => {
          const next = new Set(current);
          if (nextSaved) next.add(postId);
          else next.delete(postId);
          return Array.from(next);
        });
      } catch {
        setNotice("Не удалось обновить избранное. Попробуйте ещё раз.");
      } finally {
        setPendingSavePostIds((current) => {
          const next = new Set(current);
          next.delete(postId);
          return next;
        });
      }
    },
    [currentUser, accessToken, pendingSavePostIds]
  );

  return (
    <div ref={containerRef}>
      {posts.map((post) => (
        <div key={post.id} className="relative">
          <PostCard
            post={post}
            brand={brand}
            currentUser={currentUser}
            density={density}
            isAuthorFollowed={followingUsersSet.has(post.user)}
            isFollowPending={pendingAuthors.has(post.user)}
            isLiked={likedPostIdsSet.has(post.id)}
            isLikePending={pendingLikePostIds.has(post.id)}
            isSaved={savedPostIdsSet.has(post.id)}
            isSavePending={pendingSavePostIds.has(post.id)}
            onFollowToggle={onFollowToggle}
            onLikeToggle={onLikeToggle}
            onSaveToggle={onSaveToggle}
          />
        </div>
      ))}

      {!hasMore && posts.length > 0 && (
        // NEW-6: контейнер должен быть собственным snap-target и достаточно высоким,
        // иначе в snap-mandatory ленте поиска пользователь его просто не увидит.
        <div className="snap-start snap-always flex min-h-[40vh] items-center justify-center px-4 py-10">
          <div className="rounded-full border border-white/65 bg-white/65 px-5 py-2.5 text-center text-[13px] font-bold text-[#5C6B62] shadow-[0_8px_20px_rgba(20,40,28,0.08),inset_1px_1px_0_rgba(255,255,255,0.72)] backdrop-blur-[16px]">
            — конец результатов —
          </div>
        </div>
      )}

      {notice && (
        <div className="pointer-events-none fixed right-4 bottom-[6.25rem] left-4 z-30 rounded-[18px] border border-white/70 bg-white/78 px-4 py-3 text-center text-[13px] leading-tight font-bold text-[#15291C] shadow-[0_12px_24px_rgba(20,40,28,0.14),inset_1px_1px_0_rgba(255,255,255,0.8)] backdrop-blur-[20px]">
          <p role="status">{notice}</p>
        </div>
      )}
    </div>
  );
}
