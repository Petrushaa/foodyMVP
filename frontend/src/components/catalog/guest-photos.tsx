"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useReducedMotion } from "motion/react";

import { UserAvatar } from "@/components/feed/user-avatar";
import { RatingStars } from "@/components/feed/rating-stars";
import { PhotoViewerModal } from "@/components/feed/post-card/photo-viewer-modal";
import type { PhotoDirection } from "@/components/feed/post-card/photo-carousel";
import type { Post } from "@/lib/mock-data";

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
 * Открывается **тем же просмотрщиком, что и фото в ленте** — с теми же
 * жестами, стрелками и точками. Второй просмотрщик со своим поведением
 * означал бы, что одно и то же действие в приложении работает по-разному.
 *
 * Отзыв показывается только в открытом кадре: на превью для текста нет места,
 * а подпись мешала бы разглядеть саму еду.
 */
export function GuestPhotos({ shots, dishName }: { shots: GuestShot[]; dishName: string }) {
  const shouldReduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<PhotoDirection>(1);
  const [openKey, setOpenKey] = useState(0);

  // Просмотрщик ленты работает с постом, поэтому собираем ему совместимый
  // объект: из поста он берёт только название, число фотографий и их адреса.
  const asPost = useMemo(
    () =>
      ({
        id: -1,
        user: "",
        realName: "",
        when: "",
        dish: dishName,
        place: "",
        rating: 0,
        price: "",
        text: "",
        tags: [],
        photos: shots.length,
        likes: 0,
        comments: 0,
        seed: 1,
        photoUrls: shots.map((shot) => shot.url),
      }) as Post,
    [dishName, shots],
  );

  const openAt = useCallback((next: number) => {
    setDirection(1);
    setIndex(next);
    setOpenKey((key) => key + 1);
    setOpen(true);
  }, []);

  const changeIndex = useCallback(
    (next: number) => {
      setDirection(next > index ? 1 : -1);
      setIndex(next);
    },
    [index],
  );

  if (shots.length === 0) return null;

  const active = shots[Math.min(index, shots.length - 1)];

  return (
    <>
      <div className="hide-scroll -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1">
        {shots.map((shot, i) => (
          <button
            key={`${shot.postId}-${i}`}
            type="button"
            onClick={() => openAt(i)}
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

      <PhotoViewerModal
        open={open}
        post={asPost}
        activeIndex={index}
        direction={direction}
        openKey={openKey}
        photoRatio={1}
        shouldReduceMotion={shouldReduceMotion}
        onClose={() => setOpen(false)}
        onChangeIndex={changeIndex}
        footer={
          <div className="rounded-[18px] border border-white/15 bg-black/60 px-3.5 py-3 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <UserAvatar name={active.author} src={active.avatar} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-extrabold text-white">
                  {active.author}
                </div>
                {active.rating !== null && (
                  <div className="mt-0.5">
                    <RatingStars rating={active.rating} size={13} onPhoto />
                  </div>
                )}
              </div>
              <Link
                href={`/dish/${active.postId}`}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-extrabold text-[#15291C]"
              >
                К посту
                <ArrowRight className="size-3.5" strokeWidth={2.5} />
              </Link>
            </div>

            {active.text && (
              <p className="hide-scroll mt-2 max-h-20 overflow-y-auto text-[13px] leading-[1.45] font-medium text-white/85">
                {active.text}
              </p>
            )}
          </div>
        }
      />
    </>
  );
}
