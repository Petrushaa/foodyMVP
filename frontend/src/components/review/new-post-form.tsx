"use client";

/**
 * Создание поста.
 *
 * Порядок шагов не случайный: сначала заведение, потом блюдо. Позиция уникальна
 * внутри заведения, поэтому подсказать существующее блюдо можно только зная место.
 *
 * Цена спрашивается **только при создании новой позиции** — она станет ценой блюда
 * для всех. Если позиция выбрана из списка, цена берётся с неё, а заявить изменение
 * можно отдельной кнопкой.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import { MenuItemPicker, type MenuItemChoice } from "@/components/review/menu-item-picker";
import { PhotoPicker } from "@/components/review/photo-picker";
import { RestaurantPicker, type RestaurantChoice } from "@/components/review/restaurant-picker";
import { ApiError, createPost } from "@/lib/api/client";

const MAX_PHOTOS = 10;
const MAX_TAGS = 10;
/** Шкала оценки на бэкенде — 0–10, её и показываем. */
const MAX_RATING = 10;

export function NewPostForm({ defaultCity = "" }: { defaultCity?: string }) {
    const router = useRouter();

    const [restaurant, setRestaurant] = useState<RestaurantChoice | null>(null);
    const [menuItem, setMenuItem] = useState<MenuItemChoice | null>(null);
    const [rating, setRating] = useState(0);
    const [size, setSize] = useState("");
    const [description, setDescription] = useState("");
    const [photos, setPhotos] = useState<File[]>([]);
    const [tags, setTags] = useState<string[]>([]);
    const [tagDraft, setTagDraft] = useState("");

    // Заявка «цена изменилась» — только когда позиция выбрана из списка.
    const [newPrice, setNewPrice] = useState("");
    const [isChangingPrice, setIsChangingPrice] = useState(false);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const restaurantId = restaurant?.kind === "existing" ? restaurant.restaurant.id : null;
    const canSubmit = Boolean(restaurant && menuItem && rating > 0 && !isSubmitting);

    function addTag() {
        const tag = tagDraft.trim().toLowerCase().replace(/^#/, "");
        if (tag && !tags.includes(tag) && tags.length < MAX_TAGS) setTags([...tags, tag]);
        setTagDraft("");
    }

    async function submit() {
        if (!restaurant || !menuItem) return;
        setIsSubmitting(true);
        setError(null);

        try {
            await createPost({
                // Заведение: выбранное или заявка на новое.
                ...(restaurant.kind === "existing"
                    ? { restaurantId: restaurant.restaurant.id }
                    : {
                        restaurantName: restaurant.name,
                        restaurantAddress: restaurant.address,
                        restaurantCity: restaurant.city,
                    }),
                // Позиция: выбранная или заявка на новую вместе с категориями и ценой.
                ...(menuItem.kind === "existing"
                    ? {
                        menuItemId: menuItem.item.id,
                        ...(isChangingPrice && newPrice ? { price: Number(newPrice) } : {}),
                    }
                    : {
                        menuItemName: menuItem.name,
                        dishTypeId: menuItem.dishType?.id,
                        taxonIds: menuItem.taxons.map((taxon) => taxon.id),
                        price: Number(menuItem.price),
                    }),
                authorRating: rating,
                description: description.trim(),
                size: size.trim(),
                tags,
                images: photos,
            });
            router.push("/?posted=1");
        } catch (exception) {
            setError(
                exception instanceof ApiError ? exception.message : "Не удалось опубликовать пост",
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <form
            className="mx-auto max-w-xl space-y-8 px-4 py-6"
            onSubmit={(event) => {
                event.preventDefault();
                submit();
            }}
        >
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">Где вы ели?</h2>
                <RestaurantPicker value={restaurant} onChange={setRestaurant} defaultCity={defaultCity} />
            </section>

            <section className="space-y-3">
                <h2 className="text-lg font-semibold">Что вы ели?</h2>
                <MenuItemPicker restaurantId={restaurantId} value={menuItem} onChange={setMenuItem} />

                {/* Цену существующей позиции меняем только явной заявкой —
                    и решение по ней модератор принимает отдельно от поста. */}
                {menuItem?.kind === "existing" && (
                    isChangingPrice ? (
                        <div className="rounded-2xl border border-neutral-200 p-4">
                            <input
                                value={newPrice}
                                onChange={(event) => setNewPrice(event.target.value)}
                                inputMode="numeric"
                                placeholder="Новая цена в рублях"
                                className="w-full rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:border-neutral-400"
                            />
                            <p className="mt-1 text-xs text-neutral-400">
                                Цену обновим после проверки модератором
                            </p>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setIsChangingPrice(true)}
                            className="text-sm text-neutral-500 underline"
                        >
                            Цена изменилась
                        </button>
                    )
                )}

                <input
                    value={size}
                    onChange={(event) => setSize(event.target.value)}
                    placeholder="Размер или объём, если важно — «0.4 л», «30 см»"
                    className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:border-neutral-400"
                />
            </section>

            <section className="space-y-3">
                <h2 className="text-lg font-semibold">Оценка</h2>
                <div className="flex gap-1">
                    {Array.from({ length: MAX_RATING }, (_, index) => index + 1).map((value) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setRating(value)}
                            aria-label={`Оценка ${value} из ${MAX_RATING}`}
                            className={`h-9 flex-1 rounded-lg text-xs ${
                                value <= rating ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-400"
                            }`}
                        >
                            {value}
                        </button>
                    ))}
                </div>
            </section>

            <section className="space-y-3">
                <h2 className="text-lg font-semibold">Фотографии</h2>
                <PhotoPicker photos={photos} onChange={setPhotos} max={MAX_PHOTOS} />
            </section>

            <section className="space-y-3">
                <h2 className="text-lg font-semibold">Впечатления</h2>
                <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={4}
                    placeholder="Что понравилось, что нет"
                    className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:border-neutral-400"
                />
                <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                        <button
                            key={tag}
                            type="button"
                            onClick={() => setTags(tags.filter((item) => item !== tag))}
                            className="rounded-full bg-neutral-100 px-3 py-1 text-sm"
                        >
                            #{tag} ×
                        </button>
                    ))}
                </div>
                {tags.length < MAX_TAGS && (
                    <input
                        value={tagDraft}
                        onChange={(event) => setTagDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === ",") {
                                event.preventDefault();
                                addTag();
                            }
                        }}
                        onBlur={addTag}
                        placeholder="Теги через Enter"
                        className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:border-neutral-400"
                    />
                )}
            </section>

            {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

            <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-2xl bg-neutral-900 py-4 font-medium text-white disabled:bg-neutral-200 disabled:text-neutral-400"
            >
                {isSubmitting ? "Публикуем…" : "Опубликовать"}
            </button>
            <p className="text-center text-xs text-neutral-400">
                Пост появится в ленте после проверки модератором
            </p>
        </form>
    );
}
