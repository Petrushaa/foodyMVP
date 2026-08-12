"use client";

import { Flame } from "lucide-react";
import { useRouter } from "next/navigation";

import { SectionHeader } from "@/components/search/section-header";
import { PostTagButton } from "@/components/feed/post-card/post-tags";
import { getTagSearchHref } from "@/lib/search";

type PopularTagsProps = {
  tags: string[];
  brand: string;
  onSubmitQuery: (query: string) => void;
};

export function PopularTags({ tags, brand }: PopularTagsProps) {
  const router = useRouter();

  function handleTagClick(tag: string) {
    router.push(getTagSearchHref(tag));
  }

  // Пустой массив тегов — секцию не показываем, чтобы не оставлять висячий заголовок «Популярное».
  if (!tags || tags.length === 0) {
    return null;
  }

  return (
    <div className="px-[18px] pb-7">
      <SectionHeader
        icon={<Flame size={17} strokeWidth={2.25} color={brand} />}
        title="Популярное"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {tags.map((tag) => (
          // Единый стиль тегов — тот же компонент, что и в постах.
          <PostTagButton
            key={tag}
            brand={brand}
            shouldReduceMotion={null}
            onClick={() => handleTagClick(tag)}
          >
            {`#${tag}`}
          </PostTagButton>
        ))}
      </div>
    </div>
  );
}
