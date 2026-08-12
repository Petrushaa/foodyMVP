import { type MotionValue, type PanInfo, motion } from "motion/react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  RefObject,
} from "react";

import { DishPhoto } from "@/components/feed/dish-photo";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import type { Post } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export type PhotoDirection = 1 | -1;

const PHOTO_SWIPE_DISTANCE_RATIO = 0.04;
const PHOTO_SWIPE_VELOCITY = 220;
const PHOTO_DRAG_PREVIEW_RATIO = 0.5;
const PHOTO_RUBBER_BAND_CONSTANT = 0.55;

export const PHOTO_SWITCH_EASE = [0.22, 1, 0.36, 1] as const;
export const PHOTO_SWITCH_DURATION = 0.32;

export function getPhotoTrackIndexes(photoIdx: number, lastPhotoIdx: number) {
  const canDragToPreviousPhoto = photoIdx > 0;
  const canDragToNextPhoto = photoIdx < lastPhotoIdx;

  return [
    canDragToPreviousPhoto ? photoIdx - 1 : photoIdx,
    photoIdx,
    canDragToNextPhoto ? photoIdx + 1 : photoIdx,
  ];
}

export function getPhotoSwitchCenterX(photoWidth: number) {
  return -photoWidth;
}

export function getPhotoSwitchStartX(
  direction: PhotoDirection,
  photoWidth: number
) {
  return direction === 1 ? 0 : -photoWidth * 2;
}

function getPhotoRubberBandDistance(offset: number, dimension: number) {
  if (dimension <= 0) {
    return 0;
  }

  const distance = Math.abs(offset);
  const band =
    (distance * dimension * PHOTO_RUBBER_BAND_CONSTANT) /
    (dimension + PHOTO_RUBBER_BAND_CONSTANT * distance);

  return Math.sign(offset) * band;
}

type PhotoDragTrackXOptions = {
  canDragToNextPhoto: boolean;
  canDragToPreviousPhoto: boolean;
  dragBaseX: number;
  dragOffsetX: number;
  photoWidth: number;
};

export function getPhotoDragTrackX({
  canDragToNextPhoto,
  canDragToPreviousPhoto,
  dragBaseX,
  dragOffsetX,
  photoWidth,
}: PhotoDragTrackXOptions) {
  const centerX = getPhotoSwitchCenterX(photoWidth);
  const rawOffset = dragBaseX - centerX + dragOffsetX;
  const canMove =
    (rawOffset < 0 && canDragToNextPhoto) ||
    (rawOffset > 0 && canDragToPreviousPhoto);

  if (!canMove) {
    return centerX;
  }

  const constrainedOffset = getPhotoRubberBandDistance(
    rawOffset,
    photoWidth * PHOTO_DRAG_PREVIEW_RATIO
  );

  return centerX + constrainedOffset;
}

type PhotoDragEndOptions = {
  canDragToNextPhoto: boolean;
  canDragToPreviousPhoto: boolean;
  photoIdx: number;
  photoTrackX: number;
  photoWidth: number;
  swipeVelocityX: number;
};

export function getPhotoDragEndDecision({
  canDragToNextPhoto,
  canDragToPreviousPhoto,
  photoIdx,
  photoTrackX,
  photoWidth,
  swipeVelocityX,
}: PhotoDragEndOptions) {
  const visualOffset = photoTrackX - getPhotoSwitchCenterX(photoWidth);
  const shouldGoNext =
    canDragToNextPhoto &&
    (visualOffset < -photoWidth * PHOTO_SWIPE_DISTANCE_RATIO ||
      (visualOffset < -photoWidth * 0.015 &&
        swipeVelocityX < -PHOTO_SWIPE_VELOCITY));
  const shouldGoPrevious =
    canDragToPreviousPhoto &&
    (visualOffset > photoWidth * PHOTO_SWIPE_DISTANCE_RATIO ||
      (visualOffset > photoWidth * 0.015 &&
        swipeVelocityX > PHOTO_SWIPE_VELOCITY));
  const targetPhotoIdx = shouldGoNext
    ? photoIdx + 1
    : shouldGoPrevious
      ? photoIdx - 1
      : photoIdx;
  const nextTrackX = shouldGoNext
    ? photoTrackX + photoWidth
    : shouldGoPrevious
      ? photoTrackX - photoWidth
      : photoTrackX;

  return { nextTrackX, targetPhotoIdx };
}

export type PhotoCarouselProps = {
  post: Post;
  photoRatio: number;
  hasPhotoSlider: boolean;
  canDragToNextPhoto: boolean;
  canDragToPreviousPhoto: boolean;
  photoWidth: number;
  photoIndicatorIdx: number;
  photoTrackX: MotionValue<number>;
  photoViewportRef: RefObject<HTMLDivElement | null>;
  trackPhotoIndexes: number[];
  onPhotoOpen: () => void;
  onPhotoDragStart: () => void;
  onPhotoDrag: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
  onPhotoDragEnd: (
    event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => void;
};

export function PhotoCarousel({
  post,
  photoRatio,
  hasPhotoSlider,
  canDragToNextPhoto,
  canDragToPreviousPhoto,
  photoWidth,
  photoIndicatorIdx,
  photoTrackX,
  photoViewportRef,
  trackPhotoIndexes,
  onPhotoOpen,
  onPhotoDragStart,
  onPhotoDrag,
  onPhotoDragEnd,
}: PhotoCarouselProps) {
  function handlePhotoOpenClick(event: ReactMouseEvent<HTMLDivElement>) {
    event.stopPropagation();
    onPhotoOpen();
  }

  function handlePhotoOpenKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onPhotoOpen();
  }

  return (
    <div
      data-card-interactive
      className="relative mx-3 flex min-h-0 flex-col justify-center overflow-hidden rounded-[18px] [@media(max-width:430px)_and_(max-height:860px)]:mx-2.5"
    >
      {post.price && (
        <div className="pointer-events-none absolute top-2.5 right-2.5 z-10 rounded-full bg-black/45 px-2.5 py-1 text-[13px] font-extrabold text-white shadow-[0_4px_14px_rgba(0,0,0,0.28)] backdrop-blur-[8px] tabular-nums">
          {post.price.replace(/^₽/, "₽ ")}
        </div>
      )}
      <AspectRatio
        ref={photoViewportRef}
        ratio={photoRatio}
        role="button"
        tabIndex={0}
        aria-label={`Открыть фото ${photoIndicatorIdx + 1} из ${post.photos}`}
        onClick={handlePhotoOpenClick}
        onKeyDown={handlePhotoOpenKeyDown}
        className={cn(
          "select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[#15291C]/18",
          hasPhotoSlider ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
        )}
      >
        <motion.div
          drag={hasPhotoSlider ? "x" : false}
          dragConstraints={{
            left: canDragToNextPhoto ? -photoWidth * 2 : -photoWidth,
            right: canDragToPreviousPhoto ? 0 : -photoWidth,
          }}
          dragElastic={0}
          dragMomentum={false}
          dragDirectionLock
          onDragStart={onPhotoDragStart}
          onDrag={onPhotoDrag}
          onDragEnd={onPhotoDragEnd}
          className="absolute inset-y-0 left-0 h-full w-[300%] [touch-action:pan-y]"
          style={{ x: photoTrackX }}
        >
          {trackPhotoIndexes.map((trackPhotoIdx, trackPosition) => (
            <div
              key={`${trackPosition}-${trackPhotoIdx}`}
              aria-hidden={trackPosition !== 1}
              className={cn(
                "absolute inset-y-0 overflow-hidden",
                trackPosition === 0 && "left-0 z-0 w-1/3",
                trackPosition === 1 &&
                  "left-[calc(100%/3-4px)] z-10 w-[calc(100%/3+8px)]",
                trackPosition === 2 && "left-[calc(200%/3)] z-0 w-1/3"
              )}
            >
              <DishPhoto
                seed={post.seed + trackPhotoIdx}
                height="100%"
                src={post.photoUrls?.[trackPhotoIdx] ?? null}
                alt={post.dish || `Фото ${trackPhotoIdx + 1}`}
                label={
                  post.photoUrls?.[trackPhotoIdx]
                    ? undefined
                    : `dish photo ${trackPhotoIdx + 1} / ${post.photos} · ${post.dish.toLowerCase()}`
                }
                labelClassName={
                  hasPhotoSlider
                    ? "right-3 left-auto max-w-[calc(100%-6.75rem)] overflow-hidden text-right text-ellipsis whitespace-nowrap"
                    : undefined
                }
              />
            </div>
          ))}
        </motion.div>
      </AspectRatio>
      {hasPhotoSlider && (
        <PhotoIndicator count={post.photos} photoIndicatorIdx={photoIndicatorIdx} />
      )}
    </div>
  );
}

type PhotoIndicatorProps = {
  count: number;
  photoIndicatorIdx: number;
};

function PhotoIndicator({ count, photoIndicatorIdx }: PhotoIndicatorProps) {
  return (
    <div className="pointer-events-none absolute bottom-2.5 left-3 flex justify-start gap-1.5 rounded-full bg-black/15 p-1.5 shadow-[0_4px_14px_rgba(0,0,0,0.16)] backdrop-blur-[10px]">
      {Array.from({ length: count }).map((_, i) => {
        const isActive = i === photoIndicatorIdx;

        return (
          <span
            key={i}
            aria-hidden="true"
            className={cn(
              "h-1.5 rounded-full transition-[width] duration-200",
              isActive
                ? "w-[22px] bg-white shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
                : "w-1.5 bg-white/55"
            )}
          />
        );
      })}
    </div>
  );
}
