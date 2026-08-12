"use client";

/**
 * Карточка поста в ленте.
 *
 * Что показываем и почему именно так:
 * - оценка автора — это оценка **блюда** тем, кто его ел, а не оценка поста;
 * - цена и рейтинг берутся с позиции, а не с поста: пост про блюдо, а цена
 *   у блюда одна;
 * - лайк и сохранение отвечают новым состоянием и счётчиком, поэтому
 *   перезапрашивать пост после нажатия не нужно.
 */

import Link from "next/link";
import { useState } from "react";

import { toggleLike, toggleSave } from "@/lib/api/client";
import type { Post } from "@/lib/types";

export function PostItem({ post, canInteract }: { post: Post; canInteract: boolean }) {
    const [isLiked, setIsLiked] = useState(post.is_liked);
    const [likes, setLikes] = useState(post.statistics.likes_count);
    const [isSaved, setIsSaved] = useState(post.is_saved);
    const [isBusy, setIsBusy] = useState(false);

    const item = post.menu_item;

    async function onLike() {
        if (!canInteract || isBusy) return;
        const next = !isLiked;
        // Оптимистично: ждать сеть ради галочки — плохо, откатимся при ошибке.
        setIsLiked(next);
        setLikes((count) => count + (next ? 1 : -1));
        setIsBusy(true);
        try {
            const state = await toggleLike(post.id, next);
            setIsLiked(state.active);
            setLikes(state.count);
        } catch {
            setIsLiked(!next);
            setLikes((count) => count + (next ? -1 : 1));
        } finally {
            setIsBusy(false);
        }
    }

    async function onSave() {
        if (!canInteract || isBusy) return;
        const next = !isSaved;
        setIsSaved(next);
        setIsBusy(true);
        try {
            const state = await toggleSave(post.id, next);
            setIsSaved(state.active);
        } catch {
            setIsSaved(!next);
        } finally {
            setIsBusy(false);
        }
    }

    return (
        <article className="border-b border-neutral-100 py-5">
            <header className="flex items-center gap-3 px-4">
                <Link href={`/profile/${post.user.id}`} className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={post.user.avatar ?? "/default-avatar.svg"}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover"
                    />
                    <span className="text-sm font-medium">
                        {post.user.full_name || post.user.username}
                    </span>
                </Link>
                {post.status !== "approved" && (
                    <span className="ml-auto rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">
                        {post.status === "pending" ? "На проверке" : "Отклонён"}
                    </span>
                )}
            </header>

            {post.images.length > 0 && (
                // Горизонтальная лента с прилипанием — свайп без библиотек.
                <div className="mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1">
                    {post.images.map((image) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            key={image.id}
                            src={image.image}
                            alt=""
                            className="aspect-square w-full shrink-0 snap-center rounded-2xl object-cover"
                        />
                    ))}
                </div>
            )}

            <div className="px-4">
                {item && (
                    <div className="mt-3 flex items-baseline justify-between gap-3">
                        <Link href={`/menu-item/${item.id}`} className="min-w-0">
                            <h3 className="truncate font-medium">{item.name}</h3>
                            <p className="truncate text-sm text-neutral-500">
                                {item.restaurant.name} · {item.restaurant.address}
                            </p>
                        </Link>
                        {item.price && (
                            <span className="shrink-0 text-sm text-neutral-500">
                                {Math.round(Number(item.price))} ₽
                            </span>
                        )}
                    </div>
                )}

                <p className="mt-2 text-sm">
                    <span className="font-medium">{post.author_rating.toFixed(1)}</span>
                    <span className="text-neutral-400"> / 10 от автора</span>
                    {post.size && <span className="text-neutral-400"> · {post.size}</span>}
                </p>

                {post.description && <p className="mt-2 text-sm">{post.description}</p>}

                {post.tags.length > 0 && (
                    <p className="mt-2 text-sm text-neutral-400">
                        {post.tags.map((tag) => `#${tag.name}`).join(" ")}
                    </p>
                )}

                {post.status === "rejected" && post.rejection_reason && (
                    <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                        Причина отказа: {post.rejection_reason}
                    </p>
                )}

                <div className="mt-3 flex items-center gap-5 text-sm text-neutral-500">
                    <button type="button" onClick={onLike} disabled={!canInteract}>
                        {isLiked ? "♥" : "♡"} {likes}
                    </button>
                    <Link href={`/post/${post.id}`}>💬 {post.statistics.comments_count}</Link>
                    <button type="button" onClick={onSave} disabled={!canInteract} className="ml-auto">
                        {isSaved ? "Сохранено" : "Сохранить"}
                    </button>
                </div>
            </div>
        </article>
    );
}
