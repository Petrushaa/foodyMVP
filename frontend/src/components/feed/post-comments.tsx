"use client";

/**
 * Комментарии к посту.
 *
 * Удаление мягкое — на бэкенде запись остаётся, — но интерфейсу об этом знать
 * не нужно: комментарий просто пропадает из списка.
 */

import { useEffect, useState } from "react";

import { addComment, deleteComment, getComments, toggleCommentLike } from "@/lib/api/client";
import type { Comment } from "@/lib/types";

export function PostComments({ postId, canWrite }: { postId: number; canWrite: boolean }) {
    const [comments, setComments] = useState<Comment[]>([]);
    const [draft, setDraft] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        getComments(postId)
            .then((data) => setComments(data.results))
            .catch(() => setComments([]))
            .finally(() => setIsLoading(false));
    }, [postId]);

    async function send() {
        const text = draft.trim();
        if (!text || isSending) return;
        setIsSending(true);
        try {
            const created = await addComment(postId, text);
            setComments((current) => [...current, created]);
            setDraft("");
        } catch {
            // Ошибку показываем молча — форма остаётся заполненной, можно повторить.
        } finally {
            setIsSending(false);
        }
    }

    async function remove(id: number) {
        setComments((current) => current.filter((comment) => comment.id !== id));
        try {
            await deleteComment(id);
        } catch {
            // Не удалось — вернём при следующей загрузке страницы.
        }
    }

    async function like(comment: Comment) {
        const next = !comment.is_liked;
        setComments((current) =>
            current.map((item) =>
                item.id === comment.id
                    ? { ...item, is_liked: next, likes_count: item.likes_count + (next ? 1 : -1) }
                    : item,
            ),
        );
        try {
            const state = await toggleCommentLike(comment.id, next);
            setComments((current) =>
                current.map((item) =>
                    item.id === comment.id
                        ? { ...item, is_liked: state.active, likes_count: state.count }
                        : item,
                ),
            );
        } catch {
            setComments((current) =>
                current.map((item) =>
                    item.id === comment.id
                        ? { ...item, is_liked: !next, likes_count: item.likes_count + (next ? -1 : 1) }
                        : item,
                ),
            );
        }
    }

    return (
        <section className="px-4 py-5">
            <h2 className="mb-4 font-medium">Комментарии</h2>

            {isLoading && <p className="text-sm text-neutral-400">Загружаем…</p>}
            {!isLoading && comments.length === 0 && (
                <p className="text-sm text-neutral-400">Пока никто не написал</p>
            )}

            <ul className="space-y-4">
                {comments.map((comment) => (
                    <li key={comment.id} className="flex gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={comment.user_detail.avatar ?? "/default-avatar.svg"}
                            alt=""
                            className="h-8 w-8 shrink-0 rounded-full object-cover"
                        />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm">
                                <span className="font-medium">
                                    {comment.user_detail.full_name || comment.user_detail.username}
                                </span>{" "}
                                {comment.text}
                            </p>
                            <div className="mt-1 flex items-center gap-4 text-xs text-neutral-400">
                                <button type="button" onClick={() => like(comment)} disabled={!canWrite}>
                                    {comment.is_liked ? "♥" : "♡"} {comment.likes_count}
                                </button>
                                {comment.is_editable && (
                                    <button type="button" onClick={() => remove(comment.id)}>
                                        Удалить
                                    </button>
                                )}
                            </div>
                        </div>
                    </li>
                ))}
            </ul>

            {canWrite && (
                <div className="mt-5 flex gap-2">
                    <input
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                send();
                            }
                        }}
                        placeholder="Написать комментарий"
                        className="flex-1 rounded-2xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-neutral-400"
                    />
                    <button
                        type="button"
                        onClick={send}
                        disabled={!draft.trim() || isSending}
                        className="rounded-2xl bg-neutral-900 px-4 text-sm text-white disabled:bg-neutral-200"
                    >
                        Отправить
                    </button>
                </div>
            )}
        </section>
    );
}
