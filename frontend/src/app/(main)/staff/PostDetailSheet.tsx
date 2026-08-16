"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
    AlertTriangle,
    Check,
    ChevronLeft,
    ChevronRight,
    Loader2,
    MapPin,
    Star,
    X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/categories/category-icon";
import type { PendingPost } from "./StaffPanel";

/**
 * Разбор поста перед решением.
 *
 * В списке пост показан карточкой: одно фото 80×80 и три строки описания.
 * Этого хватает, чтобы пропустить очевидное, но не чтобы судить — а решение
 * необратимо для автора. Здесь пост открыт целиком: все снимки без обрезки,
 * полный текст и **что именно появится в каталоге** — тип блюда, категории,
 * адрес. Категории видны только тут: в списке их не было вовсе, и модератор
 * одобрял, не зная, в какие фильтры позиция попадёт.
 */
export function PostDetailSheet({
    post,
    isPending,
    error,
    onApprove,
    onReject,
    onClose,
}: {
    post: PendingPost;
    isPending: boolean;
    error?: string;
    onApprove: (post: PendingPost, restaurantId?: number) => void;
    onReject: (post: PendingPost) => void;
    onClose: () => void;
}) {
    const [shot, setShot] = useState(0);
    const photos = post.allImages;

    // Escape закрывает разбор: экран во весь экран, и кнопка выхода может
    // уехать за пределы видимой области на длинном описании.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowRight") setShot((i) => Math.min(i + 1, photos.length - 1));
            if (e.key === "ArrowLeft") setShot((i) => Math.max(i - 1, 0));
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose, photos.length]);

    // Пока открыт разбор, страница под ним не прокручивается — иначе список
    // уезжает под пальцем вместе с галереей.
    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previous;
        };
    }, []);

    const created = post.createdAt
        ? new Date(post.createdAt).toLocaleString("ru-RU", {
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
          })
        : "";

    return (
        <div className="fixed inset-0 z-40 flex justify-center sm:items-center sm:p-6">
            <button
                type="button"
                aria-label="Закрыть разбор"
                onClick={onClose}
                className="absolute inset-0 cursor-default bg-[rgba(20,40,28,0.34)]"
            />
            <div className="relative flex h-full w-full max-w-[40rem] flex-col overflow-hidden bg-[#F4F6F3] sm:h-auto sm:max-h-full sm:rounded-[26px] sm:shadow-[0_24px_60px_rgba(20,40,28,0.32)]">
                {/* ─── Шапка ─── */}
                <div className="flex shrink-0 items-center gap-3 border-b border-black/5 bg-white/80 px-4 py-3 backdrop-blur">
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Закрыть"
                        className="grid size-9 place-items-center rounded-full bg-black/5 transition hover:bg-black/10"
                    >
                        <X className="size-4 text-[#15291C]" />
                    </button>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#15291C]">
                            {post.title}
                        </p>
                        <p className="truncate text-[11.5px] text-[#5C6B62]">
                            @{post.author}
                            {created ? ` · ${created}` : ""}
                        </p>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto pb-4">
                    {/* ─── Снимки целиком ───
                        object-contain, а не cover: модератор смотрит на кадр, и
                        обрезанный край может быть ровно тем, из-за чего пост
                        отклоняют. */}
                    {photos.length > 0 ? (
                        <div className="flex justify-center bg-[#15291C]">
                            <div className="relative aspect-[4/5] max-h-[58vh] w-full max-w-lg">
                                <Image
                                    src={photos[shot]}
                                    alt={`${post.title}: снимок ${shot + 1}`}
                                    fill
                                    sizes="(max-width: 640px) 100vw, 512px"
                                    className="object-contain"
                                    priority
                                />

                                {photos.length > 1 && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setShot((i) => Math.max(i - 1, 0))}
                                            disabled={shot === 0}
                                            aria-label="Предыдущий снимок"
                                            className="absolute top-1/2 left-2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white transition disabled:opacity-25"
                                        >
                                            <ChevronLeft className="size-5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setShot((i) => Math.min(i + 1, photos.length - 1))
                                            }
                                            disabled={shot === photos.length - 1}
                                            aria-label="Следующий снимок"
                                            className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white transition disabled:opacity-25"
                                        >
                                            <ChevronRight className="size-5" />
                                        </button>
                                        <span className="absolute top-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white tabular-nums">
                                            {shot + 1} / {photos.length}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="grid h-40 place-items-center bg-[#E7ECE8] text-sm font-medium text-[#5C6B62]">
                            Пост без фотографий
                        </div>
                    )}

                    {photos.length > 1 && (
                        <div className="hide-scroll flex gap-2 overflow-x-auto px-4 py-3">
                            {photos.map((src, i) => (
                                <button
                                    key={src}
                                    type="button"
                                    onClick={() => setShot(i)}
                                    aria-label={`Снимок ${i + 1}`}
                                    className={`relative size-14 shrink-0 overflow-hidden rounded-lg ring-2 transition ${
                                        i === shot ? "ring-[#1FA85C]" : "ring-transparent"
                                    }`}
                                >
                                    <Image src={src} alt="" fill sizes="56px" className="object-cover" />
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-col gap-3 px-4 pt-3">
                        {/* ─── Оценка и описание целиком, без обрезки ─── */}
                        {post.rating > 0 && (
                            <p className="flex items-center gap-1.5 text-sm font-semibold text-[#15291C]">
                                <Star className="size-4 fill-[#FFB400] text-[#FFB400]" />
                                {post.rating.toFixed(1)} из 5
                            </p>
                        )}

                        {post.description ? (
                            <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-[#3A4A40]">
                                {post.description}
                            </p>
                        ) : (
                            <p className="text-[13px] text-[#8A958E]">Без описания.</p>
                        )}

                        {post.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {post.tags.map((t) => (
                                    <span
                                        key={t}
                                        className="rounded-full bg-white px-2.5 py-1 text-[11.5px] font-medium text-[#15291C] ring-1 ring-black/5"
                                    >
                                        #{t}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* ─── Что появится в каталоге ───
                            Главный блок разбора: одобрение создаёт эти записи, и
                            отменить это уже нельзя. */}
                        <section className="flex flex-col gap-2.5 rounded-2xl bg-white px-4 py-3.5 ring-1 ring-black/5">
                            <p className="text-[11px] font-bold tracking-wide text-[#8A958E] uppercase">
                                Появится в каталоге
                            </p>

                            <Row label="Позиция" value={post.title} />
                            {post.dishType && <Row label="Тип блюда" value={post.dishType} />}
                            {post.size && <Row label="Порция" value={post.size} />}
                            {post.price && <Row label="Цена" value={post.price} />}

                            {post.taxons.length > 0 && (
                                <div className="flex flex-col gap-1.5">
                                    <p className="text-[11.5px] font-medium text-[#8A958E]">
                                        Категории
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {post.taxons.map((t) => (
                                            <span
                                                key={t.id}
                                                className="inline-flex items-center gap-1.5 rounded-full bg-[#F1F5F2] px-2.5 py-1 text-[11.5px] font-semibold text-[#15291C]"
                                            >
                                                <CategoryIcon
                                                    icon={t.icon}
                                                    emoji={t.emoji}
                                                    size={15}
                                                />
                                                {t.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="mt-1 border-t border-black/5 pt-2.5">
                                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[#15291C]">
                                    <MapPin className="size-3.5 shrink-0 text-[#5C6B62]" />
                                    {post.restaurant || "Заведение не указано"}
                                    {post.restaurantIsNew ? (
                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-900">
                                            новое
                                        </span>
                                    ) : (
                                        <span className="rounded-full bg-[#1FA85C]/12 px-2 py-0.5 text-[10.5px] font-bold text-[#1FA85C]">
                                            в каталоге
                                        </span>
                                    )}
                                </p>
                                {(post.address || post.city) && (
                                    <p className="mt-1 pl-5 text-[12px] text-[#5C6B62]">
                                        {[post.address, post.city].filter(Boolean).join(" · ")}
                                    </p>
                                )}
                                {!post.restaurantIsNew && post.restaurantPostsCount > 0 && (
                                    <p className="mt-0.5 pl-5 text-[11.5px] text-[#8A958E]">
                                        уже {post.restaurantPostsCount} постов
                                    </p>
                                )}
                            </div>
                        </section>

                        {post.warnings.length > 0 && (
                            <div className="flex flex-col gap-1 rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
                                {post.warnings.map((warning) => (
                                    <p
                                        key={warning}
                                        className="flex items-start gap-1.5 text-xs font-medium text-amber-900"
                                    >
                                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                                        {warning}
                                    </p>
                                ))}
                            </div>
                        )}

                        {/* Похожие позиции в том же заведении — подсказка «это дубль?». */}
                        {post.similarMenuItems.length > 0 && (
                            <div className="flex flex-col gap-1 rounded-2xl bg-white px-4 py-3 ring-1 ring-black/5">
                                <p className="text-[11px] font-bold tracking-wide text-[#8A958E] uppercase">
                                    Похожие позиции здесь же
                                </p>
                                {post.similarMenuItems.map((item) => (
                                    <p key={item.id} className="text-[12.5px] text-[#15291C]">
                                        {item.name}
                                    </p>
                                ))}
                            </div>
                        )}

                        {post.restaurantIsNew && post.similarRestaurants.length > 0 && (
                            <div className="flex flex-col gap-2 rounded-2xl bg-white px-4 py-3 ring-1 ring-black/5">
                                <p className="text-[11px] font-bold tracking-wide text-[#8A958E] uppercase">
                                    Это то же место?
                                </p>
                                {post.similarRestaurants.map((place) => (
                                    <div
                                        key={place.id}
                                        className="flex items-center justify-between gap-2"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-xs font-semibold text-[#15291C]">
                                                {place.name}
                                            </p>
                                            <p className="truncate text-[11px] text-[#5C6B62]">
                                                {place.address} · {place.postsCount} постов
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="shrink-0 text-xs"
                                            disabled={isPending}
                                            onClick={() => onApprove(post, place.id)}
                                        >
                                            Привязать
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {error && <p className="text-xs text-red-600">{error}</p>}
                    </div>
                </div>

                {/* ─── Решение ───
                    Закреплено внизу: до кнопок в конце длинного описания пришлось
                    бы прокручивать весь разбор. */}
                <div className="flex shrink-0 gap-2 border-t border-black/5 bg-white/90 px-4 py-3 backdrop-blur">
                    <Button
                        type="button"
                        variant="outline"
                        className="flex-1 gap-1.5"
                        disabled={isPending}
                        onClick={() => onReject(post)}
                    >
                        <X className="size-4" />
                        Отклонить
                    </Button>
                    <Button
                        type="button"
                        className="flex-1 gap-1.5 bg-[#1FA85C] text-white hover:bg-[#168B4A]"
                        disabled={isPending}
                        onClick={() => onApprove(post)}
                    >
                        {isPending ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <Check className="size-4" />
                        )}
                        Одобрить
                    </Button>
                </div>
            </div>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <span className="shrink-0 text-[11.5px] font-medium text-[#8A958E]">
                {label}
            </span>
            <span className="min-w-0 text-right text-[13px] font-semibold text-[#15291C]">
                {value}
            </span>
        </div>
    );
}
