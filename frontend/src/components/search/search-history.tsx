"use client";

import { Suspense, useCallback, useState } from "react";
import { Wallet } from "lucide-react";

import { CategoryPicker } from "@/components/search/category-picker";
import { PriceFilter } from "@/components/search/price-filter";
import { SectionHeader } from "@/components/search/section-header";
import { PopularTags } from "@/components/search/popular-tags";
import {
  saveRecentQueries,
  useRecentSearchQueries,
} from "@/components/search/recent-search-store";
import { RecentSearches } from "@/components/search/recent-searches";
import { SearchHeader } from "@/components/search/search-header";
import { useSearchSubmit } from "@/components/search/use-search-submit";

type SearchHistoryProps = {
  brand: string;
  popularTags: string[];
};

export function SearchHistory({ brand, popularTags }: SearchHistoryProps) {
  const [query, setQuery] = useState("");
  const recentQueries = useRecentSearchQueries();

  const handleSubmitQuery = useSearchSubmit();

  const handleChangeRecentQueries = useCallback((queries: string[]) => {
    saveRecentQueries(queries);
  }, []);

  return (
    <>
      <SearchHeader
        query={query}
        onQueryChange={setQuery}
        onSubmitQuery={handleSubmitQuery}
      />
      <CategoryPicker />
      <div className="px-[18px] pt-1 pb-3">
        <SectionHeader
          icon={<Wallet size={17} strokeWidth={2.25} color={brand} />}
          title="Цена"
        />
        <div className="mt-2 -mx-[18px]">
          <Suspense fallback={null}>
            <PriceFilter targetPath="/search/results" className="px-[18px]" />
          </Suspense>
        </div>
      </div>
      <RecentSearches
        items={recentQueries}
        onChange={handleChangeRecentQueries}
        onSubmitQuery={handleSubmitQuery}
      />
      <PopularTags
        tags={popularTags}
        brand={brand}
        onSubmitQuery={handleSubmitQuery}
      />
    </>
  );
}
