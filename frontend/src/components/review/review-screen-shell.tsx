"use client";

import type { CSSProperties } from "react";
import { ArrowLeft } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";
import type { Palette } from "@/lib/mock-data";

export const PRESS_CLASSES =
  "origin-center transition-transform duration-150 ease-out active:scale-[0.94] [-webkit-tap-highlight-color:transparent]";

export const FIELD_SURFACE_CLASSES = cn(
  "h-[50px] rounded-[18px] border border-transparent bg-white",
  "shadow-[0_8px_20px_rgba(20,40,28,0.08),inset_1px_1px_0_rgba(255,255,255,0.72),inset_-1px_-1px_0_rgba(255,255,255,0.28)]",
  "ring-0 ring-transparent transition-shadow duration-150",
  "focus-within:ring-[3px] focus-within:ring-[rgba(34,139,34,0.26)] focus-within:ring-offset-1 focus-within:ring-offset-transparent focus-within:shadow-[0_10px_24px_rgba(20,40,28,0.1),0_0_0_1px_rgba(122,236,164,0.18),inset_1px_1px_0_rgba(255,255,255,0.78)] focus-within:after:border-[rgba(21,41,28,0.20)]"
);

export const FIELD_INPUT_CLASSES =
  "h-full border-0 bg-transparent px-3.5 py-0 text-[15.5px] leading-[50px] font-semibold text-[#15291C] shadow-none outline-none placeholder:text-[#8A958E] focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-transparent md:text-[15.5px]";

export const FIELD_TINT_CLASSES =
  "before:bg-white before:backdrop-blur-0 before:backdrop-saturate-100";

function canAnimate(shouldReduceMotion: boolean | null) {
  return !shouldReduceMotion;
}

export function getReviewChromeStyle(
  brand: string,
  fill = "#FFFFFF"
): CSSProperties {
  return {
    background: `linear-gradient(${fill}, ${fill}) padding-box, linear-gradient(140deg, color-mix(in srgb, ${brand} 44%, transparent), rgba(122,236,164,0.42), rgba(100,218,189,0.38), color-mix(in srgb, ${brand} 30%, transparent)) border-box`,
    boxShadow:
      "0 6px 14px rgba(20,40,28,0.09), inset 1px 1px 0 rgba(255,255,255,0.18), inset -1px -1px 0 rgba(11,47,29,0.05)",
  };
}

export function ReviewBackgroundBlobs(_props: { palette?: Palette }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-[#F6F7F6]"
    />
  );
}

export function ReviewScreen({
  palette,
  children,
}: {
  palette: Palette;
  children: React.ReactNode;
}) {
  return (
    <main className="absolute inset-0 overflow-hidden">
      <ReviewBackgroundBlobs palette={palette} />
      {children}
    </main>
  );
}

export function ReviewContentLayer({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-[1] flex flex-col pt-2">
      {children}
    </div>
  );
}

export function ReviewScrollArea({
  children,
  className,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  "aria-label": string;
}) {
  return (
    <section
      aria-label={ariaLabel}
      className={cn("hide-scroll flex-1 overflow-y-auto px-[18px] pb-25", className)}
    >
      {children}
    </section>
  );
}

export function ReviewScreenHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <header className="mb-5 flex items-center gap-4 pt-2">
      <motion.button
        type="button"
        aria-label="Назад"
        title="Назад"
        onClick={onBack}
        className={cn(
          "grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-[#15291C] outline-none",
          "border border-white/65 bg-white/58 shadow-[0_8px_20px_rgba(20,40,28,0.14),inset_1px_1px_0_rgba(255,255,255,0.86)]",
          "backdrop-blur-[18px] backdrop-saturate-[180%] transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[#15291C]/18"
        )}
        whileTap={canAnimate(shouldReduceMotion) ? { scale: 0.92 } : undefined}
      >
        <ArrowLeft className="size-[18px]" strokeWidth={2.35} />
      </motion.button>
      <h1 className="text-[24px] leading-tight font-semibold tracking-[0px] text-[#15291C]">
        {title}
      </h1>
    </header>
  );
}
