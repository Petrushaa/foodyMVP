"use client";

import { Suspense, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

import { ResultsPriceControl } from "./results-price-control";
import {
  ResultsCategoryControl,
  type CategoryGroups,
} from "./results-category-control";
import { ResultsDesktopFilters } from "./results-desktop-filters";
import { SearchInputGlass } from "./search-input-glass";
import { useSearchSubmit } from "./use-search-submit";

type SearchResultsHeaderProps = {
  initialQuery: string;
  categoryGroups: CategoryGroups;
};

function canAnimate(shouldReduceMotion: boolean | null) {
  return !shouldReduceMotion;
}

export function SearchResultsHeader({
  initialQuery,
  categoryGroups,
}: SearchResultsHeaderProps) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const [query, setQuery] = useState(initialQuery);

  const handleSubmitted = useCallback((nextQuery: string) => {
    setQuery(nextQuery);
  }, []);

  const submitQuery = useSearchSubmit({ onSubmitted: handleSubmitted });

  function handleBackClick() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/search");
  }

  return (
    <header className="sticky top-0 z-20 px-3.5 pt-2 pb-0 max-[409px]:px-3">
      <div className="flex h-13 items-center gap-2.5 max-[409px]:gap-2">
        <motion.button
          type="button"
          aria-label="Назад к поиску"
          title="Назад"
          onClick={handleBackClick}
          className={cn(
            "grid size-12 shrink-0 cursor-pointer place-items-center rounded-full text-[#15291C] outline-none",
            "border border-white/65 bg-white/58 shadow-[0_8px_20px_rgba(20,40,28,0.14),inset_1px_1px_0_rgba(255,255,255,0.86),inset_-1px_-1px_0_rgba(255,255,255,0.28)]",
            "backdrop-blur-[18px] backdrop-saturate-[180%] transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[#15291C]/18"
          )}
          whileTap={canAnimate(shouldReduceMotion) ? { scale: 0.92 } : undefined}
        >
          <ArrowLeft className="size-[20px]" strokeWidth={2.35} />
        </motion.button>

        <SearchInputGlass
          query={query}
          onQueryChange={setQuery}
          onSubmitQuery={submitQuery}
          surfaceClassName="h-13 min-w-0 flex-1 rounded-[22px]"
          contentClassName="h-13 px-3 max-[409px]:gap-2 max-[409px]:px-2.5"
          inputClassName="text-[15px] md:text-[15px]"
        />
      </div>

      <Suspense fallback={null}>
        {/* Кнопки-шторки — мобила/узкие экраны; на xl+ вместо них панель справа. */}
        <div className="hide-scroll flex items-center gap-2 overflow-x-auto px-3.5 pt-2.5 pb-1 max-[409px]:px-3 xl:hidden">
          <ResultsPriceControl />
          <ResultsCategoryControl groups={categoryGroups} />
        </div>
        <ResultsDesktopFilters groups={categoryGroups} />
      </Suspense>
    </header>
  );
}
