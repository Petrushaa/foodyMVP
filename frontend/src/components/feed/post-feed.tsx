"use client";

/**
 * Лента постов: вкладки, сортировка и подгрузка по мере прокрутки.
 *
 * Первая страница приезжает с сервера — чтобы лента была видна сразу и её увидели
 * поисковики. Дальше подгружаем в браузере.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { PostItem } from "@/components/feed/post-item";
import { getPosts } from "@/lib/api/client";
import type { FeedKind, FeedOrdering } from "@/lib/api/endpoints";
import type { Post } from "@/lib/types";

interface Props {
    initialPosts: Post[];
    initialHasMore: boolean;
    /** Гость может читать, но не действовать — кнопки лайка неактивны. */
    canInteract: boolean;
}

const TABS: Array<{ id: FeedKind; label: string; needsAuth: boolean }> = [
    { id: "all", label: "Новое", needsAuth: false },
    { id: "subscriptions", label: "Подписки", needsAuth: true },
    { id: "saved", label: "Сохранённое", needsAuth: true },
];

export function PostFeed({ initialPosts, initialHasMore, canInteract }: Props) {
    const [posts, setPosts] = useState(initialPosts);
    const [hasMore, setHasMore] = useState(initialHasMore);
    const [page, setPage] = useState(1);
    const [feed, setFeed] = useState<FeedKind>("all");
    const [ordering, setOrdering] = useState<FeedOrdering>("new");
    const [isLoading, setIsLoading] = useState(false);

    const sentinel = useRef<HTMLDivElement | null>(null);
    // Смена вкладки во время запроса не должна дать старому ответу перезаписать ленту.
    const requestId = useRef(0);

    const load = useCallback(
        async (nextPage: number, replace: boolean) => {
            const id = ++requestId.current;
            setIsLoading(true);
            try {
                const data = await getPosts({ feed, ordering, page: nextPage });
                if (id !== requestId.current) return;
                setPosts((current) => (replace ? data.results : [...current, ...data.results]));
                setHasMore(Boolean(data.next));
                setPage(nextPage);
            } catch {
                if (id === requestId.current) setHasMore(false);
            } finally {
                if (id === requestId.current) setIsLoading(false);
            }
        },
        [feed, ordering],
    );

    // Вкладка или сортировка сменились — перезагружаем с первой страницы.
    const isFirstRender = useRef(true);
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        load(1, true);
    }, [feed, ordering, load]);

    // Подгрузка при доскролле до конца.
    useEffect(() => {
        const node = sentinel.current;
        if (!node || !hasMore) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !isLoading) load(page + 1, false);
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, [hasMore, isLoading, page, load]);

    const visibleTabs = TABS.filter((tab) => canInteract || !tab.needsAuth);

    return (
        <div>
            <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-neutral-100 bg-white/90 px-4 py-3 backdrop-blur">
                {visibleTabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setFeed(tab.id)}
                        className={`rounded-full px-3 py-1.5 text-sm ${
                            feed === tab.id ? "bg-neutral-900 text-white" : "text-neutral-500"
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => setOrdering(ordering === "new" ? "popular" : "new")}
                    className="ml-auto text-sm text-neutral-500"
                >
                    {ordering === "new" ? "Сначала новые" : "Популярные"}
                </button>
            </div>

            {posts.length === 0 && !isLoading && (
                <p className="px-4 py-16 text-center text-sm text-neutral-400">
                    {feed === "subscriptions"
                        ? "Здесь появятся посты тех, на кого вы подписаны"
                        : feed === "saved"
                            ? "Сохранённых постов пока нет"
                            : "Пока ничего нет"}
                </p>
            )}

            {posts.map((post) => (
                <PostItem key={post.id} post={post} canInteract={canInteract} />
            ))}

            {isLoading && <p className="py-6 text-center text-sm text-neutral-400">Загружаем…</p>}
            <div ref={sentinel} className="h-10" />
        </div>
    );
}
