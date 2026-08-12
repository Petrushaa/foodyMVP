"use client";

import { ChevronLeft, ChevronRight, X, type LucideIcon } from "lucide-react";
import {
  AnimatePresence,
  animate,
  motion,
  type PanInfo,
  useMotionValue,
} from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";

import { DishPhoto } from "@/components/feed/dish-photo";
import type { Post } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

import {
  getPhotoDragEndDecision,
  getPhotoDragTrackX,
  getPhotoSwitchCenterX,
  getPhotoSwitchStartX,
  getPhotoTrackIndexes,
  PHOTO_SWITCH_DURATION,
  PHOTO_SWITCH_EASE,
  type PhotoDirection,
} from "./photo-carousel";
import { canAnimate } from "./post-card-shared";

type PhotoViewerModalProps = {
  open: boolean;
  post: Post;
  activeIndex: number;
  direction: PhotoDirection;
  openKey: number;
  photoRatio: number;
  shouldReduceMotion: boolean | null;
  onClose: () => void;
  onChangeIndex: (nextIndex: number) => void;
};

type ViewerArrowButtonProps = {
  ariaLabel: string;
  className: string;
  icon: LucideIcon;
  onClick: () => void;
  shouldReduceMotion: boolean | null;
};

const VIEWER_TRANSITION = { duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const;
const PHOTO_TRANSITION = { duration: 0.2, ease: [0.22, 1, 0.36, 1] } as const;

function getPhotoViewportWidth(viewport: HTMLDivElement) {
  const computedWidth = Number.parseFloat(getComputedStyle(viewport).width);

  return Number.isFinite(computedWidth) && computedWidth > 0
    ? computedWidth
    : viewport.clientWidth;
}

export function PhotoViewerModal({
  open,
  post,
  activeIndex,
  direction,
  openKey,
  photoRatio,
  shouldReduceMotion,
  onClose,
  onChangeIndex,
}: PhotoViewerModalProps) {
  const lastIndex = post.photos - 1;
  const safeActiveIndex = Math.min(Math.max(activeIndex, 0), lastIndex);
  const hasMultiplePhotos = post.photos > 1;
  const canGoPrevious = safeActiveIndex > 0;
  const canGoNext = safeActiveIndex < lastIndex;
  const shouldAnimate = canAnimate(shouldReduceMotion);
  const photoTrackX = useMotionValue(0);
  const [photoWidth, setPhotoWidth] = useState(0);
  const [shouldAnimatePhotoDots, setShouldAnimatePhotoDots] = useState(false);
  const photoViewportRef = useRef<HTMLDivElement>(null);
  const photoAnimationRef = useRef<ReturnType<typeof animate> | null>(null);
  const photoDragBaseXRef = useRef(0);
  const pendingDragTransitionXRef = useRef<number | null>(null);
  const openKeyRef = useRef(openKey);
  const previousPhotoIndexRef = useRef(safeActiveIndex);
  const wasOpenRef = useRef(false);
  const trackPhotoIndexes = getPhotoTrackIndexes(safeActiveIndex, lastIndex);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const viewport = photoViewportRef.current;

    if (!viewport) {
      return;
    }

    const viewportElement = viewport;

    function syncPhotoWidth() {
      const nextWidth = getPhotoViewportWidth(viewportElement);
      photoAnimationRef.current?.stop();
      photoAnimationRef.current = null;
      setPhotoWidth(nextWidth);
      photoTrackX.jump(getPhotoSwitchCenterX(nextWidth));
    }

    syncPhotoWidth();

    const resizeObserver = new ResizeObserver(syncPhotoWidth);
    resizeObserver.observe(viewportElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [open, photoTrackX]);

  useLayoutEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      previousPhotoIndexRef.current = safeActiveIndex;
      pendingDragTransitionXRef.current = null;
      photoAnimationRef.current?.stop();
      photoAnimationRef.current = null;
      photoTrackX.stop();
      photoTrackX.jump(
        photoWidth > 0 ? getPhotoSwitchCenterX(photoWidth) : 0
      );
      photoDragBaseXRef.current =
        photoWidth > 0 ? getPhotoSwitchCenterX(photoWidth) : 0;
      return;
    }

    const isNewOpenSession = openKeyRef.current !== openKey;
    openKeyRef.current = openKey;

    if (photoWidth <= 0) {
      wasOpenRef.current = true;
      previousPhotoIndexRef.current = safeActiveIndex;
      pendingDragTransitionXRef.current = null;
      return;
    }

    const centerX = getPhotoSwitchCenterX(photoWidth);

    if (!wasOpenRef.current || isNewOpenSession) {
      wasOpenRef.current = true;
      previousPhotoIndexRef.current = safeActiveIndex;
      pendingDragTransitionXRef.current = null;
      photoAnimationRef.current?.stop();
      photoAnimationRef.current = null;
      photoTrackX.stop();
      photoTrackX.jump(centerX);
      photoDragBaseXRef.current = centerX;
      return;
    }

    if (previousPhotoIndexRef.current === safeActiveIndex) {
      photoTrackX.jump(centerX);
      return;
    }

    photoAnimationRef.current?.stop();
    const pendingDragTransitionX = pendingDragTransitionXRef.current;

    pendingDragTransitionXRef.current = null;
    previousPhotoIndexRef.current = safeActiveIndex;
    photoTrackX.jump(
      pendingDragTransitionX ?? getPhotoSwitchStartX(direction, photoWidth)
    );
    photoAnimationRef.current = animate(photoTrackX, centerX, {
      duration: shouldReduceMotion ? 0.01 : PHOTO_SWITCH_DURATION,
      ease: PHOTO_SWITCH_EASE,
      onComplete: () => {
        photoTrackX.jump(centerX);
      },
    });
  }, [
    direction,
    open,
    openKey,
    photoTrackX,
    photoWidth,
    safeActiveIndex,
    shouldReduceMotion,
  ]);

  useEffect(() => {
    return () => {
      photoAnimationRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      setShouldAnimatePhotoDots(open && shouldAnimate);
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [open, shouldAnimate]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (!hasMultiplePhotos) {
        return;
      }

      if (event.key === "ArrowLeft" && canGoPrevious) {
        event.preventDefault();
        onChangeIndex(safeActiveIndex - 1);
      }

      if (event.key === "ArrowRight" && canGoNext) {
        event.preventDefault();
        onChangeIndex(safeActiveIndex + 1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    canGoNext,
    canGoPrevious,
    hasMultiplePhotos,
    onChangeIndex,
    onClose,
    open,
    safeActiveIndex,
  ]);

  function goToPreviousPhoto() {
    if (canGoPrevious) {
      onChangeIndex(safeActiveIndex - 1);
    }
  }

  function goToNextPhoto() {
    if (canGoNext) {
      onChangeIndex(safeActiveIndex + 1);
    }
  }

  function animatePhotoTrackToCenter() {
    const centerX = getPhotoSwitchCenterX(photoWidth);

    photoAnimationRef.current = animate(photoTrackX, centerX, {
      duration: shouldReduceMotion ? 0.01 : PHOTO_SWITCH_DURATION,
      ease: PHOTO_SWITCH_EASE,
      onComplete: () => {
        photoTrackX.jump(centerX);
      },
    });
  }

  function handlePhotoDragStart() {
    photoAnimationRef.current?.stop();
    photoDragBaseXRef.current = photoTrackX.get();
    photoTrackX.stop();
  }

  function handlePhotoDrag(
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) {
    if (!hasMultiplePhotos || photoWidth <= 0) {
      return;
    }

    photoTrackX.set(
      getPhotoDragTrackX({
        canDragToNextPhoto: canGoNext,
        canDragToPreviousPhoto: canGoPrevious,
        dragBaseX: photoDragBaseXRef.current,
        dragOffsetX: info.offset.x,
        photoWidth,
      })
    );
  }

  function handlePhotoDragEnd(
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) {
    if (!hasMultiplePhotos || photoWidth <= 0) {
      return;
    }

    const { nextTrackX, targetPhotoIdx } = getPhotoDragEndDecision({
      canDragToNextPhoto: canGoNext,
      canDragToPreviousPhoto: canGoPrevious,
      photoIdx: safeActiveIndex,
      photoTrackX: photoTrackX.get(),
      photoWidth,
      swipeVelocityX: info.velocity.x,
    });

    photoAnimationRef.current?.stop();

    if (targetPhotoIdx !== safeActiveIndex) {
      pendingDragTransitionXRef.current = nextTrackX;
      onChangeIndex(targetPhotoIdx);
      return;
    }

    animatePhotoTrackToCenter();
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`Фото: ${post.dish}`}
          className={cn(
            "fixed inset-0 z-[80] flex h-[100dvh] w-screen flex-col items-center justify-center overflow-hidden",
            "bg-black/85 px-2 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-[calc(env(safe-area-inset-bottom)+0.75rem)]",
            "[-webkit-tap-highlight-color:transparent]"
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={VIEWER_TRANSITION}
          onClick={onClose}
        >
          <motion.div
            ref={photoViewportRef}
            className={cn(
              "relative z-10 w-[min(94vw,60rem)] overflow-hidden rounded-[28px]",
              "bg-white/5 shadow-[0_22px_70px_rgba(0,0,0,0.45)] ring-1 ring-white/15",
              "max-[430px]:w-[94vw] max-[430px]:rounded-[24px]"
            )}
            style={{ aspectRatio: `${photoRatio} / 1.3` }}
            initial={{ opacity: shouldAnimate ? 0 : 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={PHOTO_TRANSITION}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="absolute inset-0 isolate overflow-hidden rounded-[inherit] bg-black">
              <motion.div
                key={`photo-viewer-track-${post.id}-${openKey}`}
                drag={hasMultiplePhotos ? "x" : false}
                dragConstraints={{
                  left: canGoNext ? -photoWidth * 2 : -photoWidth,
                  right: canGoPrevious ? 0 : -photoWidth,
                }}
                dragElastic={0}
                dragMomentum={false}
                dragDirectionLock
                onDragStart={handlePhotoDragStart}
                onDrag={handlePhotoDrag}
                onDragEnd={handlePhotoDragEnd}
                className="absolute inset-y-0 left-0 h-full w-[300%] overflow-hidden [touch-action:pan-y]"
                style={{ x: photoTrackX }}
              >
                {trackPhotoIndexes.map((trackPhotoIdx, trackPosition) => (
                  <div
                    key={`${trackPosition}-${trackPhotoIdx}`}
                    aria-hidden={trackPosition !== 1}
                    className={cn(
                      "absolute inset-y-0 h-full w-1/3 overflow-hidden bg-black",
                      trackPosition === 0 && "left-0",
                      trackPosition === 1 && "left-1/3",
                      trackPosition === 2 && "left-2/3"
                    )}
                  >
                    <div className="absolute inset-0 h-full w-full overflow-hidden">
                      <DishPhoto
                        seed={post.seed + trackPhotoIdx}
                        height="100%"
                        src={post.photoUrls?.[trackPhotoIdx] ?? null}
                        alt={post.dish || `Фото ${trackPhotoIdx + 1}`}
                        label={
                          post.photoUrls?.[trackPhotoIdx]
                            ? undefined
                            : `${post.dish.toLowerCase()} · ${trackPhotoIdx + 1} / ${post.photos}`
                        }
                        labelClassName="right-4 bottom-4 left-auto max-w-[calc(100%-2rem)] overflow-hidden rounded-full bg-black/18 px-2.5 py-1 text-right text-ellipsis whitespace-nowrap"
                      />
                    </div>
                  </div>
                ))}
              </motion.div>
            </div>

            {canGoPrevious && (
              <ViewerArrowButton
                ariaLabel="Предыдущее фото"
                className="left-3 sm:left-4"
                icon={ChevronLeft}
                onClick={goToPreviousPhoto}
                shouldReduceMotion={shouldReduceMotion}
              />
            )}
            {canGoNext && (
              <ViewerArrowButton
                ariaLabel="Следующее фото"
                className="right-3 sm:right-4"
                icon={ChevronRight}
                onClick={goToNextPhoto}
                shouldReduceMotion={shouldReduceMotion}
              />
            )}
          </motion.div>

          <motion.button
            type="button"
            aria-label="Закрыть"
            className="absolute right-3 top-3 z-30 grid size-9 place-items-center rounded-full border border-white/15 bg-black/60 text-white shadow-md backdrop-blur-md cursor-pointer outline-none hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-white/50 max-[430px]:size-8.5"
            whileTap={shouldAnimate ? { scale: 0.92 } : undefined}
            onClick={(e) => { e.stopPropagation(); onClose(); }}
          >
            <X className="size-5 max-[430px]:size-4.5" strokeWidth={2.45} />
          </motion.button>

          {hasMultiplePhotos && (
            <div className="pointer-events-none z-20 mt-4 flex gap-1.5 rounded-full border border-white/25 bg-white/[0.1] p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
              {Array.from({ length: post.photos }).map((_, index) => (
                <span
                  key={index}
                  aria-hidden="true"
                  className={cn(
                    "h-1.5 rounded-full",
                    shouldAnimatePhotoDots &&
                      "transition-[width,background-color] duration-200",
                    index === safeActiveIndex ? "w-[22px] bg-white" : "w-1.5 bg-white/45"
                  )}
                />
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function ViewerArrowButton({
  ariaLabel,
  className,
  icon: Icon,
  onClick,
  shouldReduceMotion,
}: ViewerArrowButtonProps) {
  const shouldAnimate = canAnimate(shouldReduceMotion);

  function handleClick(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  }

  return (
    <motion.button
      type="button"
      aria-label={ariaLabel}
      className={cn(
        "absolute top-1/2 z-20 grid size-9 -translate-y-1/2 place-items-center rounded-full",
        "border border-white/15 bg-white/23 text-black shadow-md backdrop-blur-md",
        "cursor-pointer outline-none transition-colors duration-150 hover:bg-white/30 focus-visible:ring-2 focus-visible:ring-white/50",
        "max-[430px]:size-8.5",
        className
      )}
      whileHover={shouldAnimate ? { scale: 1.05 } : undefined}
      whileTap={shouldAnimate ? { scale: 0.92 } : undefined}
      onClick={handleClick}
    >
      <Icon className="size-5 max-[430px]:size-4.5" strokeWidth={2.45} />
    </motion.button>
  );
}
