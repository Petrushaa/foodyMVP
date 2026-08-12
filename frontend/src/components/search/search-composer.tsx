"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";

import { CategoryModeToggle } from "@/components/categories/category-mode-toggle";
import { GlassSurface } from "@/components/feed/glass-surface";
import { SearchInputGlass } from "@/components/search/search-input-glass";
import { RecentSearches } from "@/components/search/recent-searches";
import { PopularTags } from "@/components/search/popular-tags";
import {
  saveRecentQueries,
  useRecentSearchQueries,
} from "@/components/search/recent-search-store";
import type {
  CategoryChip,
  CategoryGroups,
} from "@/components/search/results-category-control";
import { cn } from "@/lib/utils";

const PRESS_CLASSES =
  "origin-center transition-transform duration-150 ease-out active:scale-[0.94] [-webkit-tap-highlight-color:transparent]";

type Tab = "dishes" | "cuisines" | "formats";

const TABS: readonly { id: Tab; label: string }[] = [
  { id: "dishes", label: "Блюда" },
  { id: "cuisines", label: "Кухни" },
  { id: "formats", label: "Формат" },
];

type SearchComposerProps = {
  brand: string;
  popularTags: string[];
  categoryGroups: CategoryGroups;
};

// Стиль как на странице результатов поиска (SearchResultsHeader).
function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Назад"
      onClick={onClick}
      className={cn(
        "grid size-12 shrink-0 cursor-pointer place-items-center rounded-full text-[#15291C] outline-none",
        "border border-white/65 bg-white/58 shadow-[0_8px_20px_rgba(20,40,28,0.14),inset_1px_1px_0_rgba(255,255,255,0.86),inset_-1px_-1px_0_rgba(255,255,255,0.28)]",
        "backdrop-blur-[18px] backdrop-saturate-[180%] focus-visible:ring-2 focus-visible:ring-[#15291C]/18",
        PRESS_CLASSES
      )}
    >
      <ArrowLeft className="size-[20px]" strokeWidth={2.35} />
    </button>
  );
}

export function SearchComposer({
  brand,
  popularTags,
  categoryGroups,
}: SearchComposerProps) {
  const router = useRouter();
  const recentQueries = useRecentSearchQueries();

  const [mode, setMode] = useState<"browse" | "input">("browse");
  const [tab, setTab] = useState<Tab>("dishes");
  const [query, setQuery] = useState("");

  const goToResults = useCallback(
    (rawQuery: string) => {
      const q = rawQuery.trim();
      if (!q) return;
      const next = [q, ...recentQueries.filter((r) => r !== q)].slice(0, 12);
      saveRecentQueries(next);
      router.push(`/search/results?q=${encodeURIComponent(q)}`);
    },
    [recentQueries, router]
  );

  const goToCategory = useCallback(
    (chip: CategoryChip) => {
      // Категория пока — текстовый запрос q (заглушка).
      router.push(`/search/results?q=${encodeURIComponent(chip.label)}`);
    },
    [router]
  );

  function leaveSearch() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  }

  // ---------- Экран поиска (ввод) ----------
  if (mode === "input") {
    return (
      <div className="absolute inset-0 flex flex-col pt-2">
        <div className="flex h-13 items-center gap-2.5 px-3.5 pt-2 max-[409px]:gap-2 max-[409px]:px-3">
          <BackButton onClick={() => setMode("browse")} />
          <SearchInputGlass
            query={query}
            onQueryChange={setQuery}
            onSubmitQuery={goToResults}
            placeholder="Найти блюдо"
            surfaceClassName="h-13 min-w-0 flex-1 rounded-[22px]"
            contentClassName="h-13 px-3 max-[409px]:gap-2 max-[409px]:px-2.5"
            inputClassName="text-[15px] md:text-[15px]"
            autoFocus
          />
        </div>

        <div className="hide-scroll flex-1 overflow-y-auto pb-24 pt-2">
          <RecentSearches
            title="История"
            items={recentQueries}
            onChange={saveRecentQueries}
            onSubmitQuery={goToResults}
          />
          <PopularTags
            tags={popularTags}
            brand={brand}
            onSubmitQuery={goToResults}
          />
        </div>
      </div>
    );
  }

  // ---------- Браузинг категорий ----------
  const tiles = categoryGroups[tab];

  return (
    <div className="absolute inset-0 flex flex-col pt-2">
      <div className="flex h-13 items-center gap-2.5 px-3.5 pt-2 max-[409px]:gap-2 max-[409px]:px-3">
        <BackButton onClick={leaveSearch} />
        <button
          type="button"
          onClick={() => setMode("input")}
          className={cn("min-w-0 flex-1 text-left", PRESS_CLASSES)}
        >
          <GlassSurface className="h-13 rounded-[22px]" highlight>
            <div className="flex h-13 items-center gap-2.5 px-3 max-[409px]:gap-2 max-[409px]:px-2.5">
              <Search size={20} strokeWidth={2} color="#5C6B62" />
              <span className="text-[15px] font-medium text-[#5C6B62]">
                Искать на Foody
              </span>
            </div>
          </GlassSurface>
        </button>
      </div>

      <div className="px-3.5 pt-5 pb-3.5 max-[409px]:px-3">
        <CategoryModeToggle
          aria-label="Тип категории"
          items={TABS}
          value={tab}
          onValueChange={setTab}
        />
      </div>

      <div className="hide-scroll flex-1 overflow-y-auto px-3.5 pb-28 max-[409px]:px-3">
        <div className="grid grid-cols-4 gap-x-2.5 gap-y-3.5">
          {tiles.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => goToCategory(chip)}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1.5 outline-none",
                PRESS_CLASSES
              )}
            >
              <span className="grid aspect-square w-full place-items-center rounded-[18px] bg-white text-[24px] shadow-[0_6px_16px_rgba(20,40,28,0.07),inset_0_0_0_1.5px_#2ECC71] max-[380px]:text-[22px]">
                <span aria-hidden="true">{chip.emoji}</span>
              </span>
              <span className="line-clamp-2 w-full text-center text-[10.5px] leading-[1.15] font-bold text-[#15291C] [overflow-wrap:anywhere] max-[380px]:text-[10px]">
                {chip.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
