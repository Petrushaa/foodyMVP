"use client";

import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useState,
} from "react";
import { motion, useAnimationControls } from "motion/react";

import { cn } from "@/lib/utils";

import { canAnimate } from "./post-card/post-card-shared";

const SUBSCRIBE_PRESS_TRANSITION = { duration: 0.08, ease: "easeOut" } as const;
const SUBSCRIBE_RETURN_TRANSITION = {
  damping: 28,
  mass: 0.55,
  stiffness: 520,
  type: "spring",
} as const;
export const SUBSCRIBE_STATE_SETTLE_MS = 240;

export const FULLSCREEN_SUBSCRIBE_BUTTON = {
  base:
    "relative h-7 shrink-0 cursor-pointer select-none overflow-hidden rounded-full pt-px leading-none font-extrabold tracking-[0px] outline-none focus-visible:ring-2 focus-visible:ring-[#15291C]/18 [-webkit-tap-highlight-color:transparent]",
  regular: "px-2.5 text-[10.5px]",
  compact: "px-2 text-[9.75px]",
  smallRegular: "max-[380px]:h-6 max-[380px]:px-1.5 max-[380px]:text-[8.75px]",
  smallCompact: "max-[380px]:h-6.5 max-[380px]:px-2 max-[380px]:text-[9px]",
  proCompact:
    "[@media(min-width:381px)_and_(max-width:400px)_and_(max-height:860px)]:h-7 [@media(min-width:381px)_and_(max-width:400px)_and_(max-height:860px)]:px-2 [@media(min-width:381px)_and_(max-width:400px)_and_(max-height:860px)]:text-[9px]",
  largeCompact:
    "[@media(min-width:401px)_and_(min-height:880px)]:h-7 [@media(min-width:401px)_and_(min-height:880px)]:px-1.75 [@media(min-width:401px)_and_(min-height:880px)]:text-[10.5px]",
} as const;

type SubscribeStyleButtonProps = {
  active?: boolean;
  ariaBusy?: boolean;
  ariaLabel: string;
  ariaPressed?: boolean;
  brand: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  muted?: boolean;
  shouldReduceMotion: boolean | null;
  style?: CSSProperties;
  title?: string;
  onClick?: () => Promise<void> | void;
};

export function SubscribeStyleButton({
  active = false,
  ariaBusy,
  ariaLabel,
  ariaPressed,
  brand,
  children,
  className,
  disabled = false,
  muted = false,
  shouldReduceMotion,
  style,
  title,
  onClick,
}: SubscribeStyleButtonProps) {
  const scaleControls = useAnimationControls();
  const [isAnimating, setIsAnimating] = useState(false);
  const shouldAnimate = canAnimate(shouldReduceMotion);
  const isBusy = disabled || isAnimating;

  function pressButton() {
    if (!shouldAnimate || isBusy) {
      return;
    }

    void scaleControls.start({
      scale: 0.94,
      transition: SUBSCRIBE_PRESS_TRANSITION,
    });
  }

  function releaseButton() {
    if (!shouldAnimate) {
      return;
    }

    void scaleControls.start({
      scale: 1,
      transition: SUBSCRIBE_RETURN_TRANSITION,
    });
  }

  async function handleClick() {
    if (isBusy) {
      return;
    }

    setIsAnimating(true);

    // Анимацию не ждём. Раньше клик ждал её промис, а он не завершался, если
    // родитель успевал перерисовать карточку: finally не выполнялся,
    // isAnimating оставался true, и кнопка навсегда переставала отвечать —
    // без запроса и без ошибки. Отскок пружины — украшение, действие не
    // должно от него зависеть.
    if (shouldAnimate) {
      void scaleControls.start({
        scale: 1,
        transition: SUBSCRIBE_RETURN_TRANSITION,
      });
    }

    try {
      await onClick?.();
    } finally {
      if (shouldAnimate) {
        window.setTimeout(() => {
          setIsAnimating(false);
        }, SUBSCRIBE_STATE_SETTLE_MS);
      } else {
        setIsAnimating(false);
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.repeat || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    pressButton();
  }

  function handleKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    releaseButton();
  }

  return (
    <motion.button
      type="button"
      aria-busy={ariaBusy}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      disabled={isBusy}
      title={title ?? ariaLabel}
      className={cn(
        FULLSCREEN_SUBSCRIBE_BUTTON.base,
        "bg-white disabled:cursor-not-allowed disabled:opacity-70",
        active ? "text-[#5C6B62]" : "text-[#17913F]",
        muted && "text-[#8A958E]",
        className
      )}
      animate={scaleControls}
      initial={{ scale: 1 }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onPointerCancel={releaseButton}
      onPointerDown={pressButton}
      onPointerLeave={releaseButton}
      onPointerUp={releaseButton}
      style={{
        // Не подписан → зелёная обводка #2ECC71; подписан → нейтральная (хештег-стиль)
        boxShadow: active
          ? "inset 0 0 0 1.4px rgba(20,40,28,0.12)"
          : `inset 0 0 0 1.6px ${brand}`,
        ...style,
      }}
    >
      <span className="relative z-[1] grid place-items-center">{children}</span>
    </motion.button>
  );
}
