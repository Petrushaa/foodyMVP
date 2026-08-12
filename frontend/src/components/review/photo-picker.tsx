"use client";

/**
 * Выбор фотографий для поста: перетаскивание файлов, обрезка и порядок.
 *
 * Каждая добавленная фотография сразу открывается в обрезке — снимки с телефона
 * почти всегда не квадратные, а в ленте они квадратные, и лучше пусть человек
 * сам решит, что попадёт в кадр, чем это сделает `object-fit`.
 *
 * Порядок важен: первая фотография — обложка поста, поэтому карточки можно
 * перетаскивать.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { PhotoCropModal } from "@/components/review/photo-crop-modal";

interface Props {
    photos: File[];
    onChange: (photos: File[]) => void;
    max: number;
}

export function PhotoPicker({ photos, onChange, max }: Props) {
    // Очередь на обрезку: добавили сразу несколько — покажем по одной.
    const [queue, setQueue] = useState<File[]>([]);
    const [isDropActive, setIsDropActive] = useState(false);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const previews = useMemo(
        () => photos.map((file) => ({ file, url: URL.createObjectURL(file) })),
        [photos],
    );

    // URL.createObjectURL держит файл в памяти, пока ссылку не отозвали.
    useEffect(
        () => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)),
        [previews],
    );

    function accept(files: FileList | File[] | null) {
        if (!files) return;
        const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
        const room = max - photos.length - queue.length;
        if (room > 0) setQueue((current) => [...current, ...images.slice(0, room)]);
    }

    function applyCrop(cropped: File) {
        onChange([...photos, cropped]);
        setQueue((current) => current.slice(1));
    }

    function skipCrop() {
        // Отказались от обрезки — добавляем как есть, а не теряем файл.
        const [first, ...rest] = queue;
        if (first) onChange([...photos, first]);
        setQueue(rest);
    }

    function reorder(from: number, to: number) {
        if (from === to) return;
        const next = [...photos];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        onChange(next);
    }

    const isFull = photos.length >= max;

    return (
        <div className="space-y-3">
            <div
                onDragOver={(event) => {
                    event.preventDefault();
                    setIsDropActive(true);
                }}
                onDragLeave={() => setIsDropActive(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setIsDropActive(false);
                    accept(event.dataTransfer.files);
                }}
                onClick={() => !isFull && inputRef.current?.click()}
                className={`cursor-pointer rounded-2xl border-2 border-dashed px-4 py-8 text-center text-sm ${
                    isDropActive ? "border-neutral-900 bg-neutral-50" : "border-neutral-300"
                } ${isFull ? "cursor-not-allowed opacity-50" : ""}`}
            >
                {isFull
                    ? `Больше ${max} фотографий не поместится`
                    : "Перетащите фотографии сюда или нажмите, чтобы выбрать"}
            </div>

            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                    accept(event.target.files);
                    // Сбрасываем, иначе повторный выбор того же файла не сработает.
                    event.target.value = "";
                }}
            />

            {previews.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {previews.map(({ url }, index) => (
                        <div
                            key={url}
                            draggable
                            onDragStart={() => setDragIndex(index)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => {
                                if (dragIndex !== null) reorder(dragIndex, index);
                                setDragIndex(null);
                            }}
                            onDragEnd={() => setDragIndex(null)}
                            className={`relative cursor-grab ${dragIndex === index ? "opacity-40" : ""}`}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="h-24 w-24 rounded-xl object-cover" />
                            {index === 0 && (
                                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                                    обложка
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={() => onChange(photos.filter((_, i) => i !== index))}
                                className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-neutral-900 text-xs text-white"
                                aria-label="Удалить фотографию"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <p className="text-xs text-neutral-400">
                {photos.length} из {max}
                {photos.length > 1 && " · перетащите, чтобы поменять порядок"}
            </p>

            {queue.length > 0 && (
                <PhotoCropModal
                    key={queue[0].name + queue[0].lastModified}
                    file={queue[0]}
                    onApply={applyCrop}
                    onCancel={skipCrop}
                />
            )}
        </div>
    );
}
