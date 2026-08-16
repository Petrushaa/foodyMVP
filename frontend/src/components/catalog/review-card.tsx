"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";

import { GlassSurface } from "@/components/feed/glass-surface";
import { UserAvatar } from "@/components/feed/user-avatar";
import { RatingStars } from "@/components/feed/rating-stars";

export type Review = {
  postId: number;
  author: string;
  avatar?: string;
  when: string;
  /** Оценка автора по пятибалльной шкале. */
  rating: number | null;
  text: string;
  photos: string[];
};

/** Длиннее — сворачиваем: три строки это примерно столько символов. */
const LONG_TEXT = 160;

/**
 * Отзыв на странице блюда.
 *
 * Вся карточка ведёт на пост, но кнопка разворота — исключение: она гасит
 * переход, иначе прочитать длинный отзыв на месте было бы нельзя, нажатие
 * всегда уводило бы со страницы.
 */
export function ReviewCard({ review }: { review: Review }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = review.text.length > LONG_TEXT;

  function toggle(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setExpanded((value) => !value);
  }

  return (
    <Link href={`/dish/${review.postId}`} className="block">
      <GlassSurface className="rounded-[22px] border border-white/65 bg-white/45 px-4 py-3.5 shadow-[0_8px_24px_rgba(20,40,28,0.10)]">
        <div className="flex items-center gap-2.5">
          <UserAvatar name={review.author} src={review.avatar} size={34} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-extrabold text-[#15291C]">
              {review.author}
            </div>
            <div className="text-[11.5px] font-medium text-[#8A958E]">{review.when}</div>
          </div>
          {review.rating !== null && <RatingStars rating={review.rating} size={17} />}
        </div>

        {review.text && (
          <div className="mt-2.5">
            <p
              className={
                expanded
                  ? "text-[14px] leading-[1.5] font-medium whitespace-pre-wrap text-[#5C6B62]"
                  : "line-clamp-3 text-[14px] leading-[1.5] font-medium text-[#5C6B62]"
              }
            >
              {review.text}
            </p>
            {isLong && (
              <button
                type="button"
                onClick={toggle}
                className="mt-1 cursor-pointer border-0 bg-transparent p-0 text-[13px] font-extrabold text-[#1B7F45] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#15291C]/20"
              >
                {expanded ? "Свернуть" : "Ещё"}
              </button>
            )}
          </div>
        )}

        {review.photos.length > 0 && (
          <div
            className={
              review.photos.length === 1
                ? "mt-3"
                : "mt-3 grid grid-cols-3 gap-2"
            }
          >
            {review.photos.slice(0, 3).map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={url}
                alt=""
                aria-hidden="true"
                className={
                  review.photos.length === 1
                    ? "aspect-[4/3] w-full rounded-[16px] object-cover"
                    : "aspect-square w-full rounded-[14px] object-cover"
                }
              />
            ))}
          </div>
        )}
      </GlassSurface>
    </Link>
  );
}
