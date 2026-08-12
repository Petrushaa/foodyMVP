"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Check, X, MapPin, Star, Loader2 } from "lucide-react";

import { GlassSurface } from "@/components/feed/glass-surface";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    approvePostClient,
    rejectPostClient,
} from "@/lib/moderation-client";

export interface PendingPost {
    id: number;
    title: string;
    author: string;
    authorFullName: string | null;
    authorId: number | null;
    authorAvatar: string | null;
    image: string | null;
    allImages: string[];
    createdAt: string;
    description: string;
    price: string | null;
    restaurant: string;
    tags: string[];
    rating: number;
}

export default function StaffPanel({
    pendingPosts,
    accessToken,
}: {
    pendingPosts: PendingPost[];
    accessToken: string;
}) {
    const [posts, setPosts] = useState<PendingPost[]>(pendingPosts);
    const [pendingActionId, setPendingActionId] = useState<number | null>(null);
    const [rejectTarget, setRejectTarget] = useState<PendingPost | null>(null);
    const [rejectReason, setRejectReason] = useState("");
    const [errorByPost, setErrorByPost] = useState<Record<number, string>>({});
    const [, startTransition] = useTransition();

    async function handleApprove(post: PendingPost) {
        setPendingActionId(post.id);
        setErrorByPost((prev) => {
            const next = { ...prev };
            delete next[post.id];
            return next;
        });
        // R10-BUG-2: раньше server action approvePost выкидывал 503
        // ("Failed to find Server Action 'true'") после rebuild. Сейчас идём
        // напрямую в Django API через approvePostClient. try/catch остаётся
        // на случай сетевых ошибок (см. BUG-8/10/11) — handler не должен
        // «зависать» с pendingActionId != null.
        try {
            if (!accessToken) {
                setErrorByPost((prev) => ({
                    ...prev,
                    [post.id]: "Нет токена авторизации — войдите заново.",
                }));
                return;
            }
            const result = await approvePostClient(post.id, accessToken);
            if ("error" in result && result.error) {
                setErrorByPost((prev) => ({ ...prev, [post.id]: result.error! }));
                return;
            }
            startTransition(() => {
                setPosts((prev) => prev.filter((p) => p.id !== post.id));
            });
        } catch (e: any) {
            setErrorByPost((prev) => ({
                ...prev,
                [post.id]: "Ошибка при одобрении — обновите страницу.",
            }));
        } finally {
            setPendingActionId(null);
        }
    }

    async function handleRejectConfirm() {
        if (!rejectTarget) return;
        const target = rejectTarget;
        setPendingActionId(target.id);
        const reason = rejectReason.trim();
        try {
            if (!accessToken) {
                setErrorByPost((prev) => ({
                    ...prev,
                    [target.id]: "Нет токена авторизации — войдите заново.",
                }));
                return;
            }
            const result = await rejectPostClient(target.id, reason, accessToken);
            if ("error" in result && result.error) {
                setErrorByPost((prev) => ({ ...prev, [target.id]: result.error! }));
                return;
            }
            startTransition(() => {
                setPosts((prev) => prev.filter((p) => p.id !== target.id));
            });
        } catch (e: any) {
            setErrorByPost((prev) => ({
                ...prev,
                [target.id]: "Ошибка при отклонении — обновите страницу.",
            }));
        } finally {
            // Гарантированно закрываем диалог (BUG-11) и сбрасываем
            // pendingActionId — чтобы Cancel/ESC снова стали активны.
            setPendingActionId(null);
            setRejectTarget(null);
            setRejectReason("");
        }
    }

    if (posts.length === 0) {
        return (
            <GlassSurface className="rounded-[22px]">
                <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                    <Check className="size-7 text-[#1FA85C]" />
                    <p className="text-sm font-semibold text-[#15291C]">
                        Нет постов на модерации
                    </p>
                    <p className="text-xs text-[#5C6B62]">
                        Очередь пуста — можно отдохнуть.
                    </p>
                </div>
            </GlassSurface>
        );
    }

    return (
        <>
            <ul className="flex flex-col gap-3">
                {posts.map((post) => {
                    const isPending = pendingActionId === post.id;
                    const error = errorByPost[post.id];
                    return (
                        <li key={post.id}>
                            <GlassSurface className="rounded-[22px]">
                                <article className="flex flex-col gap-3 p-4">
                                    <div className="flex gap-3">
                                        {post.image ? (
                                            <div className="relative size-20 shrink-0 overflow-hidden rounded-xl ring-1 ring-foreground/10">
                                                <Image
                                                    src={post.image}
                                                    alt={post.title}
                                                    fill
                                                    sizes="80px"
                                                    className="object-cover"
                                                />
                                                {post.allImages.length > 1 && (
                                                    <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                                        +{post.allImages.length - 1}
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="grid size-20 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,rgba(220,230,222,0.6),rgba(255,255,255,0.7))] text-[11px] font-semibold text-[#5C6B62] ring-1 ring-foreground/10">
                                                Без фото
                                            </div>
                                        )}

                                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <h2 className="truncate text-sm font-semibold text-[#15291C]">
                                                    {post.title}
                                                </h2>
                                                {post.price && (
                                                    <span className="shrink-0 text-xs font-semibold text-[#1FA85C]">
                                                        {post.price}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="truncate text-xs text-[#5C6B62]">
                                                @{post.author}
                                                {post.authorFullName
                                                    ? ` · ${post.authorFullName}`
                                                    : ""}
                                            </p>
                                            {post.restaurant && (
                                                <p className="flex items-center gap-1 truncate text-xs text-[#5C6B62]">
                                                    <MapPin className="size-3" />
                                                    <span className="truncate">
                                                        {post.restaurant}
                                                    </span>
                                                </p>
                                            )}
                                            {post.rating > 0 && (
                                                <p className="flex items-center gap-1 text-xs font-medium text-[#15291C]">
                                                    <Star className="size-3 fill-[#FFB400] text-[#FFB400]" />
                                                    {post.rating.toFixed(1)}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {post.description && (
                                        <p className="line-clamp-3 whitespace-pre-wrap break-words text-xs text-[#3A4A40]">
                                            {post.description}
                                        </p>
                                    )}

                                    {post.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {post.tags.map((t) => (
                                                <span
                                                    key={t}
                                                    className="rounded-full bg-white/60 px-2 py-0.5 text-[10.5px] font-medium text-[#15291C] ring-1 ring-foreground/10"
                                                >
                                                    #{t}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {error && (
                                        <p className="text-xs text-red-600">{error}</p>
                                    )}

                                    <div className="flex gap-2 pt-1">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="flex-1 gap-1.5"
                                            disabled={isPending}
                                            onClick={() => {
                                                setRejectTarget(post);
                                                setRejectReason("");
                                            }}
                                        >
                                            <X className="size-4" />
                                            Отклонить
                                        </Button>
                                        <Button
                                            type="button"
                                            className="flex-1 gap-1.5 bg-[#1FA85C] text-white hover:bg-[#168B4A]"
                                            disabled={isPending}
                                            onClick={() => handleApprove(post)}
                                        >
                                            {isPending ? (
                                                <Loader2 className="size-4 animate-spin" />
                                            ) : (
                                                <Check className="size-4" />
                                            )}
                                            Одобрить
                                        </Button>
                                    </div>
                                </article>
                            </GlassSurface>
                        </li>
                    );
                })}
            </ul>

            <AlertDialog
                open={rejectTarget !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setRejectTarget(null);
                        setRejectReason("");
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Отклонить пост</AlertDialogTitle>
                        <AlertDialogDescription>
                            Опишите причину отклонения — она будет видна автору.
                            Можно оставить пустой.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Например: фото плохого качества, несоответствие тематике…"
                        rows={4}
                        autoFocus
                    />
                    <AlertDialogFooter>
                        {/* Cancel не disabled даже во время action — модератор
                            должен иметь возможность закрыть диалог при зависшем
                            запросе (R10-BUG-8). */}
                        <AlertDialogCancel>
                            Отмена
                        </AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={(e) => {
                                e.preventDefault();
                                handleRejectConfirm();
                            }}
                            disabled={pendingActionId === rejectTarget?.id}
                        >
                            {pendingActionId === rejectTarget?.id ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : null}
                            Отклонить
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
