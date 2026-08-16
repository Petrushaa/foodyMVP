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
 * В ленте превью — только сама еда, без подписей: на карточке шириной в палец
 * они забирают место у того, ради чего сюда и смотрят.
 *
 * Отзыв появляется в открытом кадре и **наслаивается на фотографию** снизу,
 * а не отделяется в свой блок: отдельный блок отнимал бы у кадра высоту.
 * Длинный текст сворачивается в две строки с кнопкой «Подробнее».
 */
export function GuestPhotos({ shots, dishName }: { shots: GuestShot[]; dishName: string }) {
  const shouldReduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<PhotoDirection>(1);
  const [openKey, setOpenKey] = useState(0);
  const [expanded, setExpanded] = useState(false);

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
    setExpanded(false);
    setOpenKey((key) => key + 1);
    setOpen(true);
  }, []);

  const changeIndex = useCallback(
    (next: number) => {
      setDirection(next > index ? 1 : -1);
      setIndex(next);
      // Соседний кадр — соседний отзыв, разворот от предыдущего к нему не относится.
      setExpanded(false);
    },
    [index],
  );

  if (shots.length === 0) return null;

  const active = shots[Math.min(index, shots.length - 1)];
  // Две строки помещаются примерно в сотню символов — дальше нужен разворот.
  const isLongText = active.text.length > 100;

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
          <div className="bg-gradient-to-t from-black/90 via-black/70 to-transparent px-4 pt-10 pb-4">
            <div className="flex items-center gap-2.5">
              <UserAvatar name={active.author} src={active.avatar} size={30} />
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
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/95 px-3 py-1.5 text-[12.5px] font-extrabold text-[#15291C]"
              >
                К посту
                <ArrowRight className="size-3.5" strokeWidth={2.5} />
              </Link>
            </div>

            {active.text && (
              <div className="mt-1.5">
                <p
                  className={
                    expanded
                      ? "hide-scroll max-h-32 overflow-y-auto text-[13px] leading-[1.45] font-medium text-white/90"
                      : "line-clamp-2 text-[13px] leading-[1.45] font-medium text-white/90"
                  }
                >
                  {active.text}
                </p>
                {isLongText && (
                  <button
                    type="button"
                    onClick={() => setExpanded((value) => !value)}
                    className="mt-0.5 cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-extrabold text-white/70 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white/40"
                  >
                    {expanded ? "Свернуть" : "Подробнее"}
                  </button>
                )}
              </div>
            )}
          </div>
        }
      />
    </>
  );
}
