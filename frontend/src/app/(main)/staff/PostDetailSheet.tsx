"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
    AlertTriangle,
    ArrowLeft,
    Check,
    ChevronLeft,
    ChevronRight,
    Loader2,
    MapPin,
    X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { RatingStars } from "@/components/feed/rating-stars";
import { UserAvatar } from "@/components/feed/user-avatar";
import { TaxonEditor } from "./TaxonEditor";
import type { DishOption, PendingPost } from "./StaffPanel";
import { cn } from "@/lib/utils";

/** Рабочая карточка разбора: стеклянная подложка в тон ленте. */
const PANEL = "flex flex-col rounded-[18px] border border-white/60 bg-white/70 shadow-[0_4px_14px_rgba(20,40,28,0.06)] backdrop-blur-[12px]";

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
    dishOptions,
    onApprove,
    onReject,
    onClose,
}: {
    post: PendingPost;
    isPending: boolean;
    error?: string;
    /** Справочник блюд: угаданное системой можно сменить. */
    dishOptions: DishOption[];
    onApprove: (
        post: PendingPost, restaurantId?: number, dishTypeId?: number,
        taxonIds?: number[],
    ) => void;
    onReject: (post: PendingPost) => void;
    onClose: () => void;
}) {
    const [shot, setShot] = useState(0);
    const photos = post.allImages;

    // Блюдо, угаданное системой по названию позиции. Пусто — не угадалось,
    // и это нормальный исход: у нишевой еды витрины нет.
    const guessed = dishOptions.find((d) => d.label === post.dishType);
    const [dishId, setDishId] = useState<number | "">(guessed?.id ?? "");
    // Отправляем блюдо, только если модератор его сменил: иначе одобрение
    // не должно трогать то, что уже стоит в заявке.
    const changedDish = dishId !== (guessed?.id ?? "") ? Number(dishId) : undefined;

    // Категории позиции. Начинаем с того, что проставит одобрение само, —
    // модератор правит уже готовый набор, а не собирает с нуля.
    const initialTaxons = post.taxons.map((t) => t.id);
    const [taxonIds, setTaxonIds] = useState<number[]>(initialTaxons);
    // Отправляем, только если модератор что-то изменил: иначе одобрение
    // считало бы наследование от блюда ручной правкой и запирало его.
    const sameTaxons =
        taxonIds.length === initialTaxons.length &&
        taxonIds.every((id) => initialTaxons.includes(id));
    const changedTaxons = sameTaxons ? undefined : taxonIds;

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
        <>
            {/* Затемнение — только на ПК: на телефоне разбор занимает весь экран,
                ровно как развёрнутый пост в ленте. */}
            <button
                type="button"
                aria-label="Закрыть разбор"
                onClick={onClose}
                className="fixed inset-0 z-40 hidden cursor-default bg-[rgba(20,40,28,0.45)] backdrop-blur-[2px] lg:block"
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={post.title}
                className="fixed inset-0 z-50 flex h-[100dvh] flex-col overflow-hidden border-0 bg-white/82 text-[#15291C] shadow-[0_18px_42px_rgba(20,40,28,0.22),inset_0_1px_0_rgba(255,255,255,0.88)] backdrop-blur-[30px] backdrop-saturate-[190%] lg:m-auto lg:h-[min(86vh,860px)] lg:w-[560px] lg:rounded-[28px] lg:border lg:border-black/5"
            >
                {/* ─── Шапка ─── */}
                <div className="flex shrink-0 items-center gap-2.5 px-3 pt-3 pr-3 pb-2.5 pl-3.5">
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Закрыть разбор"
                        className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-[9px] bg-[rgba(20,40,28,0.06)] text-[#15291C]"
                    >
                        <ArrowLeft className="size-[18px]" strokeWidth={2.35} />
                    </button>
                    <UserAvatar
                        name={post.authorFullName || post.author}
                        src={post.authorAvatar ?? undefined}
                        size={36}
                    />
                    <div className="flex min-w-0 flex-1 flex-col items-start text-left">
                        <p className="truncate text-[14.5px] leading-[1.2] font-extrabold tracking-[-0.2px] text-[#15291C]">
                            {post.authorFullName || post.author}
                        </p>
                        <p className="truncate text-[11.5px] font-medium text-[#5C6B62]">
                            @{post.author}
                            {created ? ` · ${created}` : ""}
                        </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#F0A020]/14 px-2.5 py-1 text-[10.5px] font-bold text-[#9A6206]">
                        на модерации
                    </span>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto pb-4">
                    {/* ─── Снимки целиком ───
                        object-contain, а не cover: модератор смотрит на кадр, и
                        обрезанный край может быть ровно тем, из-за чего пост
                        отклоняют. */}
                    {photos.length > 0 ? (
                        <div className="mx-3 flex justify-center overflow-hidden rounded-[18px] bg-[#15291C]">
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
                        <div className="mx-3 grid h-40 place-items-center rounded-[18px] bg-[rgba(20,40,28,0.05)] text-sm font-medium text-[#5C6B62]">
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

                    {/* Название, место и оценка — той же вёрсткой, что в ленте:
                        модератор смотрит на пост тем же взглядом, что читатель. */}
                    <div className="px-4 pt-3 pb-1">
                        <h3 className="text-[19px] leading-[1.2] font-extrabold tracking-[-0.4px] text-[#15291C]">
                            {post.title}
                        </h3>
                    </div>
                    <div className="flex items-center justify-between gap-2.5 px-4 pt-1 pb-2.5">
                        <div className="inline-flex min-w-0 items-center gap-1.5 rounded-[9px] bg-[rgba(20,40,28,0.05)] px-2.5 py-[5px] text-[12.5px] font-semibold text-[#13251a]">
                            <MapPin className="size-[11px] shrink-0" strokeWidth={2.2} />
                            <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                                {post.restaurant || "Заведение не указано"}
                            </span>
                        </div>
                        {post.rating > 0 && <RatingStars rating={post.rating} />}
                    </div>

                    {post.description ? (
                        <p className="mx-3 mb-3 rounded-[14px] bg-[rgba(20,40,28,0.04)] px-3 py-2.5 font-[family-name:var(--font-roboto)] text-[15px] leading-[1.62] font-medium text-pretty whitespace-pre-wrap text-[#15291C]">
                            {post.description}
                        </p>
                    ) : (
                        <p className="mx-3 mb-3 rounded-[14px] bg-[rgba(20,40,28,0.04)] px-3 py-2.5 text-[13px] font-medium text-[#8A958E]">
                            Без описания.
                        </p>
                    )}

                    {post.tags.length > 0 && (
                        <div className="px-3.5 pb-3">
                            <span
                                aria-hidden="true"
                                className="mb-2 block h-px w-full rounded-full bg-[rgba(20,40,28,0.1)]"
                            />
                            <div className="flex flex-wrap items-center gap-1.5">
                                {post.tags.map((t) => (
                                    <span
                                        key={t}
                                        className="rounded-full bg-[rgba(20,40,28,0.05)] px-2.5 py-1 text-[12px] font-semibold text-[#13251a]"
                                    >
                                        #{t}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Ниже — рабочая часть: то, чего в ленте нет и быть не должно. */}
                    <div className="flex flex-col gap-3 px-4 pt-1">

                        {/* ─── Что появится в каталоге ───
                            Главный блок разбора: одобрение создаёт эти записи, и
                            отменить это уже нельзя. */}
                        <section className={cn(PANEL, "gap-2.5 px-4 py-3.5")}>
                            <p className="text-[11px] font-bold tracking-wide text-[#8A958E] uppercase">
                                Появится в каталоге
                            </p>

                            {/* Блюдо угадано системой по названию позиции. Модератор
                                соглашается или меняет — от блюда зависят кухня и виды. */}
                            <div className="flex items-center justify-between gap-3">
                              <span className="shrink-0 text-[11.5px] font-medium text-[#8A958E]">Блюдо</span>
                              <select
                                value={dishId}
                                onChange={(e) => setDishId(e.target.value ? Number(e.target.value) : "")}
                                className="min-w-0 max-w-[62%] rounded-lg bg-[#F1F5F2] px-2 py-1 text-right text-[13px] font-semibold text-[#15291C] outline-none"
                              >
                                <option value="">— не определено —</option>
                                {dishOptions.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.emoji} {d.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {post.catalogWarning && (
                              <div className="rounded-xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
                                <p className="text-[11.5px] leading-[1.45] font-medium text-amber-900">
                                  {post.catalogWarning.text}
                                </p>
                                {post.catalogWarning.cuisineHint && (
                                  <p className="mt-1 text-[11.5px] leading-[1.45] text-amber-900/85">
                                    Похоже на кухню <b>{post.catalogWarning.cuisineHint.name}</b> —{" "}
                                    {post.catalogWarning.cuisineHint.reason}.
                                  </p>
                                )}
                              </div>
                            )}
                            {post.size && <Row label="Порция" value={post.size} />}
                            {post.price && <Row label="Цена" value={post.price} />}

                            <div className="flex flex-col gap-1.5">
                                <p className="text-[11.5px] font-medium text-[#8A958E]">
                                    Категории позиции
                                </p>
                                <TaxonEditor selected={taxonIds} onChange={setTaxonIds} />
                            </div>

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
                            <div className="flex flex-col gap-1 rounded-[18px] bg-amber-50/90 px-4 py-3 ring-1 ring-amber-200/70 backdrop-blur-[12px]">
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
                            <div className={cn(PANEL, "gap-1 px-4 py-3")}>
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
                            <div className={cn(PANEL, "gap-2 px-4 py-3")}>
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
                                            onClick={() => onApprove(post, place.id, changedDish, changedTaxons)}
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
                <div className="flex shrink-0 gap-2 border-t border-white/60 bg-white/70 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-[20px] backdrop-saturate-[180%]">
                    <Button
                        type="button"
                        variant="outline"
                        className="h-11 flex-1 gap-1.5 rounded-full border-[rgba(20,40,28,0.14)] bg-white/80 text-[15px] font-semibold"
                        disabled={isPending}
                        onClick={() => onReject(post)}
                    >
                        <X className="size-4" />
                        Отклонить
                    </Button>
                    <Button
                        type="button"
                        className="h-11 flex-1 gap-1.5 rounded-full bg-[#2ECC71] text-[15px] font-semibold text-white shadow-[0_8px_22px_rgba(46,204,113,0.35)] hover:bg-[#28B765]"
                        disabled={isPending}
                        onClick={() => onApprove(post, undefined, changedDish, changedTaxons)}
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
        </>
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
