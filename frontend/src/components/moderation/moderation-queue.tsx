"use client";

/**
 * Очередь модерации.
 *
 * Через неё проходит каждый пост, поэтому она должна быть быстрой: решение
 * в один клик, а всё нужное для решения — на экране, без переходов.
 *
 * Главное, что модератор должен видеть до одобрения:
 * - **что появится в каталоге** — новое заведение и новая позиция помечаются явно;
 * - **похожие заведения и блюда** — чтобы привязать к существующему, а не плодить
 *   дубли. Сервер ищет их сам, независимо от того, показывал ли подсказки фронт;
 * - **предупреждения** — почему пост помечен подозрительным.
 */

import { useState } from "react";

import { approveModerationPost, rejectModerationPost } from "@/lib/api/client";
import type { ModerationPost, ModerationStats } from "@/lib/types";

interface Props {
    initialPosts: ModerationPost[];
    stats: ModerationStats | null;
}

const FILTERS = [
    { id: "", label: "Все" },
    { id: "suspicious", label: "Подозрительные" },
    { id: "new_items", label: "Новые блюда" },
    { id: "price_changes", label: "Правки цен" },
];

export function ModerationQueue({ initialPosts, stats }: Props) {
    const [posts, setPosts] = useState(initialPosts);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    function drop(id: number) {
        setPosts((current) => current.filter((post) => post.id !== id));
    }

    async function approve(post: ModerationPost, menuItemId?: number, acceptPrice = true) {
        setBusyId(post.id);
        setError(null);
        try {
            await approveModerationPost(post.id, { menuItemId, acceptPrice });
            drop(post.id);
        } catch (exception) {
            setError(exception instanceof Error ? exception.message : "Не удалось одобрить");
        } finally {
            setBusyId(null);
        }
    }

    async function reject(post: ModerationPost) {
        const reason = window.prompt("Причина отказа — автор её увидит:");
        if (!reason?.trim()) return;
        setBusyId(post.id);
        setError(null);
        try {
            await rejectModerationPost(post.id, reason.trim());
            drop(post.id);
        } catch (exception) {
            setError(exception instanceof Error ? exception.message : "Не удалось отклонить");
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div className="mx-auto max-w-2xl px-4 py-6">
            {stats && (
                <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="В очереди" value={stats.pending} />
                    <Stat label="Новые блюда" value={stats.new_items} />
                    <Stat label="Подозрительные" value={stats.suspicious} accent={stats.suspicious > 0} />
                    <Stat
                        label="Ждут больше суток"
                        value={stats.waiting_over_day}
                        accent={stats.waiting_over_day > 0}
                    />
                </div>
            )}

            <div className="mb-5 flex flex-wrap gap-2">
                {FILTERS.map((filter) => (
                    <a
                        key={filter.id}
                        href={filter.id ? `/staff?kind=${filter.id}` : "/staff"}
                        className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600"
                    >
                        {filter.label}
                    </a>
                ))}
            </div>

            {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

            {posts.length === 0 && (
                <p className="py-16 text-center text-sm text-neutral-400">Очередь пуста</p>
            )}

            <div className="space-y-5">
                {posts.map((post) => (
                    <ModerationCard
                        key={post.id}
                        post={post}
                        isBusy={busyId === post.id}
                        onApprove={approve}
                        onReject={reject}
                    />
                ))}
            </div>
        </div>
    );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
    return (
        <div className={`rounded-2xl px-4 py-3 ${accent ? "bg-amber-50" : "bg-neutral-50"}`}>
            <p className="text-2xl font-semibold">{value}</p>
            <p className="text-xs text-neutral-500">{label}</p>
        </div>
    );
}

function ModerationCard({
    post,
    isBusy,
    onApprove,
    onReject,
}: {
    post: ModerationPost;
    isBusy: boolean;
    onApprove: (post: ModerationPost, menuItemId?: number, acceptPrice?: boolean) => void;
    onReject: (post: ModerationPost) => void;
}) {
    const preview = post.will_create;

    return (
        <article className="rounded-2xl border border-neutral-200 p-4">
            <header className="flex items-center gap-2 text-sm text-neutral-500">
                <span>@{post.user.username}</span>
                <span>·</span>
                <span>{post.author_rating.toFixed(1)} / 10</span>
                {post.possible_duplicate && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                        похоже на дубль
                    </span>
                )}
                {post.looks_suspicious && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">
                        подозрительный ввод
                    </span>
                )}
            </header>

            {post.images.length > 0 && (
                <div className="mt-3 flex gap-2 overflow-x-auto">
                    {post.images.map((image) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={image.id} src={image.image} alt="" className="h-28 w-28 shrink-0 rounded-xl object-cover" />
                    ))}
                </div>
            )}

            {post.description && <p className="mt-3 text-sm">{post.description}</p>}

            {/* Что появится в каталоге — это модератор и решает */}
            {preview && (
                <div className="mt-4 rounded-xl bg-neutral-50 p-3 text-sm">
                    <p className="mb-1 text-xs uppercase tracking-wide text-neutral-400">
                        Появится в каталоге
                    </p>
                    <p>
                        <span className="text-neutral-500">Заведение: </span>
                        {preview.restaurant.name}, {preview.restaurant.address}
                        {preview.restaurant.is_new ? (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-800">новое</span>
                        ) : (
                            <span className="ml-2 text-xs text-neutral-400">
                                уже есть · {preview.restaurant.posts_count} постов
                            </span>
                        )}
                    </p>
                    <p className="mt-1">
                        <span className="text-neutral-500">Блюдо: </span>
                        {preview.menu_item.name}
                        {preview.menu_item.price && ` · ${Math.round(Number(preview.menu_item.price))} ₽`}
                        {preview.menu_item.dish_type && (
                            <span className="text-neutral-400"> · {preview.menu_item.dish_type}</span>
                        )}
                    </p>
                    {preview.menu_item.taxons.length > 0 && (
                        <p className="mt-1 text-xs text-neutral-400">
                            {preview.menu_item.taxons.map((taxon) => taxon.name).join(" · ")}
                        </p>
                    )}
                </div>
            )}

            {post.warnings.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-amber-800">
                    {post.warnings.map((warning) => (
                        <li key={warning}>⚠ {warning}</li>
                    ))}
                </ul>
            )}

            {/* Похожие заведения: сервер нашёл их сам, даже если автор
                проигнорировал подсказки в форме. */}
            {post.similar_restaurants.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                    <p className="mb-1 font-medium text-amber-900">Похожие заведения уже есть</p>
                    <ul className="space-y-1 text-amber-900">
                        {post.similar_restaurants.map((restaurant) => (
                            <li key={restaurant.id}>
                                {restaurant.name}, {restaurant.address} · {restaurant.posts_count} постов
                                <span className="text-amber-700"> ({restaurant.similarity})</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Привязка к существующей позиции — так и склеиваются дубли */}
            {post.similar_menu_items.length > 0 && (
                <div className="mt-3 text-sm">
                    <p className="mb-2 text-neutral-500">Привязать к существующему блюду:</p>
                    <div className="flex flex-wrap gap-2">
                        {post.similar_menu_items.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                disabled={isBusy}
                                onClick={() => onApprove(post, item.id)}
                                className="rounded-full border border-neutral-300 px-3 py-1 text-sm"
                            >
                                {item.name} ({item.similarity})
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Решение по цене принимается отдельно от решения по посту:
                хороший пост с бредовой ценой должен публиковаться. */}
            {post.price_change && (
                <div className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm">
                    <p>
                        Автор предлагает цену:{" "}
                        <span className="line-through text-neutral-400">
                            {post.price_change.current ? `${Math.round(Number(post.price_change.current))} ₽` : "—"}
                        </span>{" "}
                        → <span className="font-medium">{Math.round(Number(post.price_change.proposed))} ₽</span>
                    </p>
                    <div className="mt-2 flex gap-2">
                        <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onApprove(post, undefined, true)}
                            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white"
                        >
                            Одобрить с новой ценой
                        </button>
                        <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onApprove(post, undefined, false)}
                            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                        >
                            Одобрить, цену отклонить
                        </button>
                    </div>
                </div>
            )}

            <div className="mt-4 flex gap-2">
                <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onApprove(post)}
                    className="flex-1 rounded-xl bg-neutral-900 py-2.5 text-sm text-white disabled:bg-neutral-300"
                >
                    Одобрить
                </button>
                <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onReject(post)}
                    className="flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm disabled:opacity-50"
                >
                    Отклонить
                </button>
            </div>
        </article>
    );
}
