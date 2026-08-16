"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";

import { UserAvatar } from "@/components/feed/user-avatar";
import { RatingStars } from "@/components/feed/rating-stars";

export type GuestShot = {
  url: string;
  postId: number;
  author: string;
  avatar?: string;
  /** Оценка автора по пятибалльной шкале. */
  rating: number | null;
  text: string;
};

/**
 * Снимки гостей: лента превью и просмотр во весь экран.
 *
 * Отзыв показывается **только в полноэкранном режиме** — на превью для текста
 * нет места, и подпись там мешала бы разглядеть саму еду. Зато открытый кадр
 * сразу отвечает, кто это снял и что написал, а ссылка ведёт к целому посту.
 */
export function GuestPhotos({ shots }: { shots: GuestShot[] }) {
  const [openAt, setOpenAt] = useState<number | null>(null);

  if (shots.length === 0) return null;

  return (
    <>
      <div className="hide-scroll -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1">
        {shots.map((shot, index) => (
          <button
            key={`${shot.postId}-${index}`}
            type="button"
            onClick={() => setOpenAt(index)}
            aria-label={`Открыть фото от ${shot.author}`}
            className="group relative aspect-[3/4] w-[9.5rem] shrink-0 cursor-pointer snap-start overflow-hidden rounded-[18px] border border-white/65 p-0 shadow-[0_8px_22px_rgba(20,40,28,0.10)] outline-none focus-visible:ring-2 focus-visible:ring-[#15291C]/25"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shot.url}
              alt={`Фото от ${shot.author}`}
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center gap-1.5">
              <UserAvatar name={shot.author} src={shot.avatar} size={20} />
              <span className="truncate text-[11px] font-extrabold text-white">
                {shot.author}
              </span>
            </div>
          </button>
        ))}
      </div>

      {openAt !== null && (
        <PhotoViewer
          shots={shots}
          startAt={openAt}
          onClose={() => setOpenAt(null)}
        />
      )}
    </>
  );
}

function PhotoViewer({
  shots,
  startAt,
  onClose,
}: {
  shots: GuestShot[];
  startAt: number;
  onClose: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(startAt);

  // Открываемся сразу на том кадре, по которому нажали. Без анимации:
  // прокрутка «от первого до нужного» на открытии выглядит сбоем.
  useEffect(() => {
    const track = trackRef.current;
    if (track) track.scrollTo({ left: track.clientWidth * startAt });
  }, [startAt]);

  // Пока открыт просмотр, страница под ним не должна прокручиваться.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setIndex(Math.round(track.scrollLeft / track.clientWidth));
  }, []);

  const shot = shots[Math.min(index, shots.length - 1)];

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[95] flex flex-col bg-black/95">
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-2">
        <span className="text-[13px] font-bold text-white/70 tabular-nums">
          {index + 1} / {shots.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="grid size-10 cursor-pointer place-items-center rounded-full border-0 bg-white/10 text-white outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <X className="size-6" strokeWidth={2.3} />
        </button>
      </div>

      {/* Листается свайпом — тем же жестом, что и фото в ленте. */}
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="hide-scroll flex flex-1 snap-x snap-mandatory overflow-x-auto overscroll-contain"
      >
        {shots.map((item, i) => (
          <div
            key={`${item.postId}-${i}`}
            className="flex w-full shrink-0 snap-center items-center justify-center px-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.url}
              alt={`Фото от ${item.author}`}
              className="max-h-full w-full object-contain"
            />
          </div>
        ))}
      </div>

      {/* Отзыв поверх кадра: кто снял, как оценил и что написал. */}
      <div className="shrink-0 bg-gradient-to-t from-black via-black/85 to-transparent px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="flex items-center gap-2.5">
          <UserAvatar name={shot.author} src={shot.avatar} size={34} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-extrabold text-white">
              {shot.author}
            </div>
            {shot.rating !== null && (
              <div className="mt-0.5">
                <RatingStars rating={shot.rating} size={14} onPhoto />
              </div>
            )}
          </div>
          <Link
            href={`/dish/${shot.postId}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3.5 py-2 text-[13px] font-extrabold text-[#15291C]"
          >
            К посту
            <ArrowRight className="size-4" strokeWidth={2.4} />
          </Link>
        </div>

        {shot.text && (
          <p className="hide-scroll mt-2.5 max-h-24 overflow-y-auto text-[14px] leading-[1.45] font-medium text-white/90">
            {shot.text}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
