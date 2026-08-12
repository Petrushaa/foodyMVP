import { matchCategoryByName } from "@/lib/categories";
import { cn } from "@/lib/utils";

import { canAnimate } from "./post-card-shared";

type PostTagsProps = {
  mainTag?: string;
  restTags: string[];
  brand: string;
  shouldReduceMotion: boolean | null;
  onTagClick: (tag: string) => void;
};

export function PostTags({
  mainTag,
  restTags,
  brand,
  shouldReduceMotion,
  onTagClick,
}: PostTagsProps) {
  const allTags = mainTag ? [mainTag, ...restTags] : restTags;

  // Категория блюда приходит внутри тегов. Вытаскиваем тег, совпадающий со
  // справочником блюд, и показываем его отдельным выделенным чипом (эмодзи +
  // название, без #). Остальные остаются обычными тегами — в том же ряду.
  let categoryFound: { raw: string; emoji: string; label: string } | null = null;
  const otherTags: string[] = [];
  for (const tag of allTags) {
    const name = tag.replace(/^#/, "");
    const matched = matchCategoryByName(name);
    if (!categoryFound && matched && matched.mode === "dishes") {
      categoryFound = { raw: tag, emoji: matched.emoji, label: matched.label };
    } else {
      otherTags.push(tag);
    }
  }
  const category = categoryFound;

  if (!category && otherTags.length === 0) {
    return null;
  }

  return (
    <div className="mt-auto px-3.5 pb-3.5 max-[430px]:mt-0 max-[430px]:pb-3 [@media(max-width:430px)_and_(max-height:860px)]:px-3 [@media(max-width:430px)_and_(max-height:860px)]:pb-2.5">
      <span
        aria-hidden="true"
        className="mb-2 block h-px w-full rounded-full bg-[rgba(20,40,28,0.1)] max-[390px]:mb-1.5 [@media(max-width:430px)_and_(max-height:860px)]:mb-1.5"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {category && (
          <button
            type="button"
            onClick={() => onTagClick(category.raw)}
            className={cn(
              "inline-flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-full bg-white px-3 text-[12.5px] font-extrabold tracking-[0px] text-[#17913F] shadow-[inset_0_0_0_1.6px_#2ECC71] outline-none [-webkit-tap-highlight-color:transparent] [@media(max-width:430px)_and_(max-height:860px)]:h-[26px] [@media(max-width:430px)_and_(max-height:860px)]:px-2.5 [@media(max-width:430px)_and_(max-height:860px)]:text-[12px]",
              canAnimate(shouldReduceMotion) && "active:scale-[0.94]"
            )}
          >
            <span aria-hidden="true" className="text-[13px] leading-none">
              {category.emoji}
            </span>
            <span className="leading-none">{category.label}</span>
          </button>
        )}
        {otherTags.map((tag) => (
          <PostTagButton
            key={tag}
            brand={brand}
            onClick={() => onTagClick(tag)}
            shouldReduceMotion={shouldReduceMotion}
          >
            {tag}
          </PostTagButton>
        ))}
      </div>
    </div>
  );
}

type TagButtonProps = {
  children: string;
  brand: string;
  isMain?: boolean;
  shouldReduceMotion: boolean | null;
  onClick: () => void;
};

export type PostTagButtonProps = TagButtonProps;

export function PostTagButton({
  children,
  isMain = false,
  shouldReduceMotion,
  onClick,
}: TagButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "origin-center cursor-pointer select-none border-0 outline-none",
        "inline-flex items-center justify-center rounded-full bg-white",
        "transition-transform duration-150 ease-out [-webkit-tap-highlight-color:transparent]",
        canAnimate(shouldReduceMotion) && "active:scale-[0.94]",
        isMain
          ? "h-7 px-3 text-[12.5px] font-extrabold tracking-[0px] text-[#17913F] shadow-[inset_0_0_0_1.6px_#2ECC71] [@media(max-width:430px)_and_(max-height:860px)]:h-[26px] [@media(max-width:430px)_and_(max-height:860px)]:px-2.5 [@media(max-width:430px)_and_(max-height:860px)]:text-[12px]"
          : "h-[26px] px-2.5 text-[11.5px] font-bold tracking-[0px] text-[#5C6B62] shadow-[inset_0_0_0_1.4px_rgba(20,40,28,0.10)] [@media(max-width:430px)_and_(max-height:860px)]:h-6 [@media(max-width:430px)_and_(max-height:860px)]:px-2 [@media(max-width:430px)_and_(max-height:860px)]:text-[11px]"
      )}
    >
      <span
        className={cn(
          "flex h-full items-center justify-center",
          isMain ? "leading-[28px]" : "leading-[26px]"
        )}
      >
        {children}
      </span>
    </button>
  );
}
