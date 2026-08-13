"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Bookmark } from "lucide-react";

import { FeedHeader, type FeedTab } from "@/components/feed/feed-header";
import { GlassSurface } from "@/components/feed/glass-surface";
import { PostCard } from "@/components/feed/post-card";
import { mapApiPostToFeedPost, type ApiPost } from "@/lib/feed-adapter";
import type { Post } from "@/lib/mock-data";
import { DEFAULT_TWEAKS } from "@/lib/tweaks";
import { toggleLike, toggleSave, toggleFollow } from "@/lib/feed-client";

const TWEAKS = DEFAULT_TWEAKS;

function FeedStatusCard({
  body,
  title,
  action,
}: {
  body: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full snap-start snap-always flex-col px-3.5 pt-2 pb-[5.75rem]">
      <GlassSurface className="flex flex-1 items-center justify-center rounded-[26px] border border-green-50/92 bg-white/45">
        <div className="max-w-[282px] px-6 text-center">
          <p className="text-[20px] leading-tight font-extrabold tracking-[-0.35px] text-[#15291C]">
            {title}
          </p>
          <p className="mt-2 font-[family-name:var(--font-roboto)] text-[14.5px] leading-[1.45] font-medium text-[#5C6B62]">
            {body}
          </p>
          {action && <div className="mt-4 flex justify-center">{action}</div>}
        </div>
      </GlassSurface>
    </div>
  );
}

type FeedClientProps = {
  initialPosts: Post[];
  likedIds: number[];
  savedIds: number[];
  currentUser: string | null;
  accessToken: string | null;
  initialTab?: FeedTab;
  /** Следующая страница (page-number) или null, если SSR-страница последняя. */
  initialNextPage?: number | null;
  /** Эндпоинт для дозагрузки: "/posts/" или "/posts/?feed=subscriptions". */
  endpoint?: string;
  /** Стартовый набор подписанных handles вида "@username". */
  initialFollowingUsers?: string[];
  /** Если задан — вместо шапки ленты (Новое/Подписки) показывается заголовок (напр. «Избранное»). */
  title?: string;
};

export function FeedClient({
  initialPosts,
  likedIds,
  savedIds,
  currentUser,
  accessToken,
  initialTab = "new",
  initialNextPage = null,
  endpoint = "/posts/",
  initialFollowingUsers = [],
  title,
}: FeedClientProps) {
  const router = useRouter();
  const [feedTab, setFeedTab] = useState<FeedTab>(initialTab);
  // R4-B2 infinite scroll: posts уже не readonly — мы дописываем новые страницы.
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [nextPage, setNextPage] = useState<number | null>(initialNextPage);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [likedSet, setLikedSet] = useState<Set<number>>(() => new Set(likedIds));
  const [savedSet, setSavedSet] = useState<Set<number>>(() => new Set(savedIds));
  const [pendingLikes, setPendingLikes] = useState<Set<number>>(() => new Set());
  const [pendingSaves, setPendingSaves] = useState<Set<number>>(() => new Set());
  const [followingSet, setFollowingSet] = useState<Set<string>>(
    () => new Set(initialFollowingUsers),
  );
  const [pendingFollows, setPendingFollows] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);

  // R4-B2: загрузка следующей страницы. Один in-flight запрос за раз,
  // дедуп по id (на случай если бэк вернёт пересекающиеся результаты).
  const loadMore = useCallback(async () => {
    if (isLoadingMore) return;
    if (nextPage === null) return;
    setIsLoadingMore(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(nextPage));
      // Через BFF-прокси /backend — токен подставит сервер из сессии.
      // Без завершающего слэша (иначе Next делает 308), прокси сам добавит.
      const res = await fetch(
        `/backend${endpoint.replace(/\/$/, "")}?${params.toString()}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const data = await res.json();
      const apiResults: ApiPost[] = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
        ? data
        : [];
      const newPosts = apiResults.map(mapApiPostToFeedPost);
      const newLiked = apiResults.filter((p) => p.is_liked).map((p) => p.id);
      const newSaved = apiResults.filter((p) => p.is_saved).map((p) => p.id);
      setPosts((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const deduped = newPosts.filter((p) => !existingIds.has(p.id));
        return [...prev, ...deduped];
      });
      if (newLiked.length) {
        setLikedSet((prev) => {
          const next = new Set(prev);
          for (const id of newLiked) next.add(id);
          return next;
        });
      }
      if (newSaved.length) {
        setSavedSet((prev) => {
          const next = new Set(prev);
          for (const id of newSaved) next.add(id);
          return next;
        });
      }
      setNextPage(data?.next ? nextPage + 1 : null);
    } catch {
      setLoadError("Не удалось подгрузить ленту. Попробуйте ещё раз.");
    } finally {
      setIsLoadingMore(false);
    }
  }, [accessToken, endpoint, isLoadingMore, nextPage]);

  // IntersectionObserver на sentinel в конце ленты. Когда видим — догружаем.
  useEffect(() => {
    if (nextPage === null) return;
    const target = sentinelRef.current;
    if (!target) return;
    // Берём scroll-контейнер (section с overflow-y-auto), чтобы наблюдать
    // относительно него, а не относительно body.
    const scrollRoot = target.closest("section");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void loadMore();
          }
        }
      },
      {
        root: scrollRoot ?? null,
        rootMargin: "200px",
        threshold: 0,
      },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore, nextPage, posts.length]);

  useEffect(() => {
    if (notice) {
      const id = setTimeout(() => setNotice(null), 3000);
      return () => clearTimeout(id);
    }
  }, [notice]);

  const onTabChange = useCallback((next: FeedTab) => {
    if (next === feedTab) return;
    if (next === "subs" && (!currentUser || !accessToken)) {
      router.push(`/login?callbackUrl=${encodeURIComponent("/?tab=following")}`);
      return;
    }
    const params = new URLSearchParams();
    if (next === "subs") params.set("tab", "following");
    window.location.assign(params.toString() ? `/?${params.toString()}` : "/");
  }, [feedTab, currentUser, accessToken, router]);

  const onLikeToggle = useCallback(
    async (postId: number, nextLiked: boolean) => {
      if (!currentUser || !accessToken) {
        setNotice("Войдите, чтобы лайкнуть.");
        return;
      }
      if (pendingLikes.has(postId)) return;
      setPendingLikes((s) => new Set(s).add(postId));
      try {
        await toggleLike(postId, nextLiked, accessToken);
        setLikedSet((s) => {
          const next = new Set(s);
          if (nextLiked) next.add(postId);
          else next.delete(postId);
          return next;
        });
        // LO1: инвалидировать SSR-кеш страницы поста чтобы счётчик обновился
        router.refresh();
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
    [accessToken, currentUser, pendingLikes, router],
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
        await toggleSave(postId, nextSaved, accessToken);
        setSavedSet((s) => {
          const next = new Set(s);
          if (nextSaved) next.add(postId);
          else next.delete(postId);
          return next;
        });
        // LO1: инвалидировать SSR-кеш (актуальный список сохранённых на /favorites)
        router.refresh();
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
    [accessToken, currentUser, pendingSaves, router],
  );

  const onFollowToggle = useCallback(
    async (author: string, nextFollowing: boolean) => {
      if (!currentUser || !accessToken) {
        // R4-B4: неавторизованный клик по «Подписаться» → редирект на логин,
        // как в R7-fix. Кнопка только что отрендерилась рядом с handle.
        router.push(`/login?callbackUrl=${encodeURIComponent("/")}`);
        return;
      }
      if (pendingFollows.has(author)) return;
      const target = posts.find((p) => p.user === author);
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
    [accessToken, currentUser, pendingFollows, posts, router],
  );

  const likedSnapshot = useMemo(() => likedSet, [likedSet]);
  const savedSnapshot = useMemo(() => savedSet, [savedSet]);

  return (
    <main className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 flex flex-col pt-2">
        {title ? (
          <header className="flex items-center gap-2 px-5 pt-2 pb-3">
            <Bookmark className="size-6 text-[#15291C]" strokeWidth={2.2} />
            <h1 className="text-[24px] font-extrabold tracking-[-0.3px] text-[#15291C]">
              {title}
            </h1>
          </header>
        ) : (
          <FeedHeader tab={feedTab} onTabChange={onTabChange} />
        )}

        <section
          aria-label="Лента"
          className="hide-scroll flex-1 snap-y snap-mandatory overflow-y-auto pb-24 lg:pb-6"
        >
          {posts.length > 0 ? (
            <>
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  brand={TWEAKS.brand}
                  density={TWEAKS.density}
                  currentUser={currentUser}
                  isAuthorFollowed={followingSet.has(post.user)}
                  isFollowPending={pendingFollows.has(post.user)}
                  isLiked={likedSnapshot.has(post.id)}
                  isLikePending={pendingLikes.has(post.id)}
                  isSaved={savedSnapshot.has(post.id)}
                  isSavePending={pendingSaves.has(post.id)}
                  onFollowToggle={onFollowToggle}
                  onLikeToggle={onLikeToggle}
                  onSaveToggle={onSaveToggle}
                />
              ))}
              {/* R4-B2: sentinel + индикатор подгрузки/конца ленты. */}
              {nextPage !== null && (
                <div
                  ref={sentinelRef}
                  data-testid="feed-load-more-sentinel"
                  className="snap-start snap-always flex min-h-[40vh] items-center justify-center px-4 py-10"
                >
                  <div className="rounded-full border border-white/65 bg-white/65 px-5 py-2.5 text-center text-[13px] font-bold text-[#5C6B62] shadow-[0_8px_20px_rgba(20,40,28,0.08),inset_1px_1px_0_rgba(255,255,255,0.72)] backdrop-blur-[16px]">
                    {loadError
                      ? loadError
                      : isLoadingMore
                      ? "Загрузка..."
                      : "Прокрутите для загрузки"}
                  </div>
                </div>
              )}
              {nextPage === null && posts.length > 0 && (
                <div className="snap-start snap-always flex min-h-[40vh] items-center justify-center px-4 py-10">
                  <div className="rounded-full border border-white/65 bg-white/65 px-5 py-2.5 text-center text-[13px] font-bold text-[#5C6B62] shadow-[0_8px_20px_rgba(20,40,28,0.08),inset_1px_1px_0_rgba(255,255,255,0.72)] backdrop-blur-[16px]">
                    — конец ленты —
                  </div>
                </div>
              )}
            </>
          ) : (
            <FeedStatusCard
              title={feedTab === "subs" ? "Подписок пока нет" : "Постов пока нет"}
              body={
                feedTab === "subs"
                  ? "Подпишитесь на авторов из раздела «Новое», и их посты появятся здесь."
                  : "Свежие рекомендации появятся здесь чуть позже."
              }
            />
          )}
        </section>

        {notice && (
          <div className="pointer-events-none absolute right-4 bottom-[6.25rem] left-4 z-30 rounded-[18px] border border-white/70 bg-white/78 px-4 py-3 text-center text-[13px] leading-tight font-bold text-[#15291C] shadow-[0_12px_24px_rgba(20,40,28,0.14),inset_1px_1px_0_rgba(255,255,255,0.8)] backdrop-blur-[20px]">
            <p role="status">{notice}</p>
          </div>
        )}
      </div>
    </main>
  );
}
