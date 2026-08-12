import { Bookmark, Heart, MessageCircle } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

import type { Post } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

import {
  HEART_COLOR,
  ICON_PULSE_ANIMATION,
  ICON_PULSE_TRANSITION,
  TEXT_PRIMARY,
  canAnimate,
} from "./post-card-shared";

const LIKE_ICON_ACTIVE_ANIMATION = {
  rotate: [0, -7, 4, 0],
  scale: [1, 1.24, 0.96, 1],
};
const LIKE_ICON_IDLE_ANIMATION = { rotate: 0, scale: 1 };
const LIKE_RING_ACTIVE_ANIMATION = {
  opacity: [0.45, 0],
  scale: [0.55, 1.85],
};
const LIKE_RING_IDLE_ANIMATION = { opacity: 0, scale: 0.55 };
const LIKE_COUNT_ACTIVE_ANIMATION = {
  opacity: [0.82, 1],
  y: [0, -1, 0],
};
const LIKE_COUNT_IDLE_ANIMATION = { opacity: 1, y: 0 };
const SAVE_ICON_ACTIVE_ANIMATION = {
  scale: [1, 1.2, 0.98, 1],
  y: [0, -2, 0],
};
const SAVE_ICON_IDLE_ANIMATION = { scale: 1, y: 0 };
const FULLSCREEN_SAVE_GLOW_ACTIVE_ANIMATION = {
  opacity: [0, 0.36, 0],
  scale: [0.72, 1.18, 1.32],
};
const COLLAPSED_SAVE_GLOW_ACTIVE_ANIMATION = {
  opacity: [0, 0.28, 0],
  scale: [0.72, 1.15, 1.26],
};
const SAVE_GLOW_IDLE_ANIMATION = { opacity: 0, scale: 0.72 };

const FULLSCREEN_ACTION_BUTTON_CLASS =
  "relative inline-flex h-[50px] w-[92%] min-w-0 cursor-pointer items-center justify-center gap-2.5 overflow-hidden rounded-full border border-transparent px-2.5 text-[#0B2F1D] outline-none backdrop-blur-[18px] backdrop-saturate-[180%] focus-visible:ring-2 focus-visible:ring-[#15291C]/18 [-webkit-tap-highlight-color:transparent] [@media(max-width:430px)_and_(max-height:860px)]:h-11";
// B1 (touch targets): добавлен min-h-11 + вертикальный padding, чтобы hit-area
// была ≥44px по высоте (Apple HIG), при этом визуальный размер иконок не меняется.
// Отрицательный -my-2 компенсирует увеличение высоты, чтобы вёрстка не съезжала.
const COLLAPSED_ACTION_BUTTON_CLASS =
  "inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 min-h-11 py-2 -my-2 px-2 -mx-2";
const FULLSCREEN_SAVE_BUTTON_CLASS =
  "relative grid h-[50px] w-full min-w-0 cursor-pointer place-items-center overflow-hidden rounded-full border border-transparent px-5 text-[#0B2F1D] outline-none backdrop-blur-[18px] backdrop-saturate-[180%] focus-visible:ring-2 focus-visible:ring-[#15291C]/18 [-webkit-tap-highlight-color:transparent] [@media(max-width:430px)_and_(max-height:860px)]:h-11";
// B1 (touch targets): визуально save-кнопка остаётся 36px / 32px, но hit-area
// расширена до ≥44×44 через невидимый ::before. Без изменения вёрстки.
const COLLAPSED_SAVE_BUTTON_CLASS =
  "relative ml-auto grid size-9 cursor-pointer place-items-center rounded-[10px] transition-colors before:absolute before:-inset-1 before:content-[''] before:rounded-[14px] [@media(max-width:430px)_and_(max-height:860px)]:size-8 [@media(max-width:430px)_and_(max-height:860px)]:before:-inset-1.5";

export type EngagementBarProps = {
  post: Post;
  brand: string;
  fullscreen?: boolean;
  liked: boolean;
  likePending?: boolean;
  saved: boolean;
  savePending?: boolean;
  likeCount: number;
  commentPulse: number;
  shouldReduceMotion: boolean | null;
  onLikeClick: () => void;
  onCommentClick: () => void;
  onSaveClick: () => void;
};

export function EngagementBar({
  post,
  brand,
  fullscreen = false,
  liked,
  likePending = false,
  saved,
  savePending = false,
  likeCount,
  commentPulse,
  shouldReduceMotion,
  onLikeClick,
  onCommentClick,
  onSaveClick,
}: EngagementBarProps) {
  const [likePulse, setLikePulse] = useState(0);
  const [savePulse, setSavePulse] = useState(0);

  function handleLikeClick() {
    if (likePending) {
      return;
    }

    if (!liked) {
      setLikePulse((currentPulse) => currentPulse + 1);
    }

    onLikeClick();
  }

  function handleSaveClick() {
    if (savePending) {
      return;
    }

    if (!saved) {
      setSavePulse((currentPulse) => currentPulse + 1);
    }

    onSaveClick();
  }

  if (fullscreen) {
    const pillStyle = {
      boxShadow:
        "0 8px 18px rgba(20,40,28,0.12), inset 1px 1px 0 rgba(255,255,255,0.6), inset -1px -1px 0 rgba(11,47,29,0.05)",
    };

    return (
      <div className="shrink-0 px-3.5 pt-0 pb-[calc(env(safe-area-inset-bottom)+18px)] [@media(max-width:430px)_and_(max-height:860px)]:px-3 [@media(max-width:430px)_and_(max-height:860px)]:pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <div className="grid h-16 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(76px,0.92fr)] items-center gap-2.5 max-[360px]:gap-2 [@media(max-width:430px)_and_(max-height:860px)]:h-14">
          <motion.button
            type="button"
            aria-busy={likePending}
            aria-pressed={liked}
            disabled={likePending}
            onClick={handleLikeClick}
            className={cn(
              FULLSCREEN_ACTION_BUTTON_CLASS,
              "justify-self-end disabled:cursor-not-allowed disabled:opacity-70"
            )}
            style={pillStyle}
            whileTap={canAnimate(shouldReduceMotion) ? { scale: 0.94 } : undefined}
          >
            <FullscreenPillChrome />
            <LikeActionContent
              fullscreen
              liked={liked}
              likeCount={likeCount}
              pulse={likePulse}
              shouldReduceMotion={shouldReduceMotion}
            />
          </motion.button>

          <motion.button
            type="button"
            onClick={onCommentClick}
            className={cn(FULLSCREEN_ACTION_BUTTON_CLASS, "justify-self-start")}
            style={pillStyle}
            whileTap={canAnimate(shouldReduceMotion) ? { scale: 0.94 } : undefined}
          >
            <FullscreenPillChrome />
            <span className="relative z-[1] grid size-[18px] shrink-0 place-items-center">
              <MessageCircle
                className="size-[18px]"
                strokeWidth={2}
                color={TEXT_PRIMARY}
              />
            </span>
            <span className="relative z-[1] min-w-0 truncate text-[13.5px] font-extrabold tracking-[-0.1px] tabular-nums text-[#15291C]">
              {post.comments}
            </span>
          </motion.button>

          <motion.button
            type="button"
            aria-busy={savePending}
            aria-pressed={saved}
            disabled={savePending}
            title="В избранное"
            aria-label="В избранное"
            onClick={handleSaveClick}
            className={cn(
              FULLSCREEN_SAVE_BUTTON_CLASS,
              "disabled:cursor-not-allowed disabled:opacity-70"
            )}
            style={pillStyle}
            whileTap={canAnimate(shouldReduceMotion) ? { scale: 0.92 } : undefined}
          >
            <FullscreenPillChrome />
            <SaveActionIcon
              fullscreen
              brand={brand}
              pulse={savePulse}
              saved={saved}
              shouldReduceMotion={shouldReduceMotion}
            />
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 px-4 pt-3 pb-2 [@media(max-width:430px)_and_(max-height:860px)]:px-3.5 [@media(max-width:430px)_and_(max-height:860px)]:pt-2.5 [@media(max-width:430px)_and_(max-height:860px)]:pb-1.5">
      <motion.button
        type="button"
        aria-busy={likePending}
        aria-pressed={liked}
        disabled={likePending}
        onClick={handleLikeClick}
        className={cn(
          COLLAPSED_ACTION_BUTTON_CLASS,
          "disabled:cursor-not-allowed disabled:opacity-70"
        )}
        whileTap={canAnimate(shouldReduceMotion) ? { scale: 0.94 } : undefined}
      >
        <LikeActionContent
          liked={liked}
          likeCount={likeCount}
          pulse={likePulse}
          shouldReduceMotion={shouldReduceMotion}
        />
      </motion.button>

      <motion.button
        type="button"
        onClick={onCommentClick}
        className={COLLAPSED_ACTION_BUTTON_CLASS}
      >
        <motion.span
          key={`comment-${commentPulse}`}
          className="grid size-5 place-items-center"
          animate={
            commentPulse > 0 && canAnimate(shouldReduceMotion)
              ? ICON_PULSE_ANIMATION
              : { scale: 1 }
          }
          transition={ICON_PULSE_TRANSITION}
        >
          <MessageCircle className="size-5" strokeWidth={2} color={TEXT_PRIMARY} />
        </motion.span>
        <span className="text-[13.5px] font-bold tracking-[-0.1px] text-[#15291C]">
          {post.comments}
        </span>
      </motion.button>

      <motion.button
        type="button"
        aria-busy={savePending}
        aria-pressed={saved}
        disabled={savePending}
        title="В избранное"
        aria-label="В избранное"
        onClick={handleSaveClick}
        className={cn(
          COLLAPSED_SAVE_BUTTON_CLASS,
          "disabled:cursor-not-allowed disabled:opacity-70"
        )}
        style={{
          backgroundColor: saved ? `${brand}22` : "rgba(20,40,28,0.06)",
          color: saved ? brand : TEXT_PRIMARY,
        }}
      >
        <SaveActionIcon
          brand={brand}
          pulse={savePulse}
          saved={saved}
          shouldReduceMotion={shouldReduceMotion}
        />
      </motion.button>
    </div>
  );
}

function FullscreenPillChrome() {
  // Нейтральный белый «стеклянный» фрейм без зелёного градиента.
  return (
    <span
      aria-hidden="true"
      className="absolute inset-0 rounded-full border-[0.5px] border-white/60 bg-white/72 shadow-[inset_1px_1px_0_rgba(255,255,255,0.85),inset_-1px_-1px_0_rgba(255,255,255,0.4)]"
    />
  );
}

type LikeActionContentProps = {
  liked: boolean;
  likeCount: number;
  pulse: number;
  shouldReduceMotion: boolean | null;
  fullscreen?: boolean;
};

function LikeActionContent({
  liked,
  likeCount,
  pulse,
  shouldReduceMotion,
  fullscreen = false,
}: LikeActionContentProps) {
  const shouldAnimate = pulse > 0 && liked && canAnimate(shouldReduceMotion);
  const keyPrefix = fullscreen ? "fullscreen-like" : "like";

  return (
    <>
      <motion.span
        key={`${keyPrefix}-${pulse}`}
        className={cn(
          "relative z-[1] grid place-items-center",
          fullscreen ? "size-5 shrink-0" : "size-[22px]"
        )}
        initial={LIKE_ICON_IDLE_ANIMATION}
        animate={
          shouldAnimate
            ? LIKE_ICON_ACTIVE_ANIMATION
            : LIKE_ICON_IDLE_ANIMATION
        }
        transition={{ duration: 0.42, ease: "easeOut" }}
      >
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 rounded-full border border-[#E5443B]/45"
          initial={LIKE_RING_IDLE_ANIMATION}
          animate={
            shouldAnimate
              ? LIKE_RING_ACTIVE_ANIMATION
              : LIKE_RING_IDLE_ANIMATION
          }
          transition={{ duration: 0.42, ease: "easeOut" }}
        />
        <Heart
          className={cn("relative", fullscreen ? "size-5" : "size-[22px]")}
          strokeWidth={2}
          color={liked ? HEART_COLOR : TEXT_PRIMARY}
          fill={liked ? HEART_COLOR : "none"}
        />
      </motion.span>
      <motion.span
        className={
          fullscreen
            ? "relative z-[1] min-w-0 truncate text-[13.5px] font-extrabold tracking-[-0.1px] tabular-nums text-[#15291C]"
            : "text-[13.5px] font-bold tracking-[-0.1px] text-[#15291C]"
        }
        initial={LIKE_COUNT_IDLE_ANIMATION}
        animate={
          shouldAnimate
            ? LIKE_COUNT_ACTIVE_ANIMATION
            : LIKE_COUNT_IDLE_ANIMATION
        }
        transition={{ duration: 0.24, ease: "easeOut" }}
      >
        {likeCount.toLocaleString("ru-RU")}
      </motion.span>
    </>
  );
}

type SaveActionIconProps = {
  brand: string;
  pulse: number;
  saved: boolean;
  shouldReduceMotion: boolean | null;
  fullscreen?: boolean;
};

function SaveActionIcon({
  brand,
  pulse,
  saved,
  shouldReduceMotion,
  fullscreen = false,
}: SaveActionIconProps) {
  const shouldAnimate =
    !fullscreen && pulse > 0 && saved && canAnimate(shouldReduceMotion);
  const keyPrefix = fullscreen ? "fullscreen-save" : "save";

  return (
    <>
      <motion.span
        key={`${keyPrefix}-glow-${pulse}`}
        aria-hidden="true"
        className={cn(
          "absolute inset-0",
          fullscreen ? "rounded-full" : "rounded-[10px]"
        )}
        initial={SAVE_GLOW_IDLE_ANIMATION}
        animate={
          shouldAnimate
            ? fullscreen
              ? FULLSCREEN_SAVE_GLOW_ACTIVE_ANIMATION
              : COLLAPSED_SAVE_GLOW_ACTIVE_ANIMATION
            : SAVE_GLOW_IDLE_ANIMATION
        }
        transition={{ duration: 0.46, ease: "easeOut" }}
        style={{
          background: fullscreen
            ? "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.95) 0%, transparent 66%)"
            : `radial-gradient(circle at 50% 45%, ${brand} 0%, transparent 66%)`,
        }}
      />
      <motion.span
        key={`${keyPrefix}-${pulse}`}
        className={cn(
          "relative z-[1] grid place-items-center",
          fullscreen ? "size-6" : "size-[18px]"
        )}
        initial={SAVE_ICON_IDLE_ANIMATION}
        animate={
          shouldAnimate
            ? SAVE_ICON_ACTIVE_ANIMATION
            : SAVE_ICON_IDLE_ANIMATION
        }
        transition={{ duration: 0.38, ease: "easeOut" }}
      >
        <Bookmark
          className={cn(
            fullscreen ? "size-6" : "size-[18px]",
            fullscreen && saved && "drop-shadow-[0_4px_8px_rgba(11,47,29,0.15)]"
          )}
          strokeWidth={2}
          color={
            fullscreen
              ? saved
                ? brand
                : "#06301A"
              : saved
                ? brand
                : TEXT_PRIMARY
          }
          fill={saved ? brand : "none"}
        />
      </motion.span>
    </>
  );
}
