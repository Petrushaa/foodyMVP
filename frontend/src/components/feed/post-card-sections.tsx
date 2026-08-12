import { motion } from "motion/react";
import type { MouseEvent as ReactMouseEvent } from "react";

import {
  EngagementBar,
  type EngagementBarProps,
} from "@/components/feed/post-card/engagement-bar";
import {
  PhotoCarousel,
  type PhotoCarouselProps,
} from "@/components/feed/post-card/photo-carousel";
import { PostDetails } from "@/components/feed/post-card/post-details";
import {
  PostCardHeader,
  type PostCardHeaderProps,
} from "@/components/feed/post-card/post-card-header";
import { PostTags } from "@/components/feed/post-card/post-tags";
import type { Post } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type SharedPostCardViewProps = {
  post: Post;
  brand: string;
  mainTag?: string;
  restTags: string[];
  shouldReduceMotion: boolean | null;
  headerActions: Pick<
    PostCardHeaderProps,
    "morePulse" | "onMoreClick" | "onShareClick" | "sharePulse"
  >;
  follow: Pick<
    PostCardHeaderProps,
    "currentUser" | "isAuthorFollowed" | "isFollowPending" | "onFollowToggle"
  >;
  photoCarousel: Omit<PhotoCarouselProps, "post">;
  engagement: Omit<
    EngagementBarProps,
    "brand" | "fullscreen" | "post" | "shouldReduceMotion"
  >;
  onTagClick: (tag: string) => void;
};

type CollapsedPostCardViewProps = SharedPostCardViewProps & {
  onCardClick: (event: ReactMouseEvent<HTMLElement>) => void;
};

export function CollapsedPostCardView({
  post,
  brand,
  mainTag,
  restTags,
  shouldReduceMotion,
  headerActions,
  photoCarousel,
  engagement,
  follow,
  onCardClick,
  onTagClick,
}: CollapsedPostCardViewProps) {
  return (
    <article
      onClick={onCardClick}
      className={cn(
        "flex flex-1 cursor-pointer flex-col overflow-hidden rounded-[26px]",
        "border border-green-50/92 bg-white/75",
        "shadow-[0_8px_20px_rgba(20,40,28,0.12),0_1px_3px_rgba(20,40,28,0.08),inset_0_1px_0_rgba(255,255,255,0.92),inset_0_0_0_1px_rgba(255,255,255,0.34)]",
        "backdrop-blur-[28px] backdrop-saturate-[190%]"
      )}
    >
      <PostCardHeader
        {...headerActions}
        {...follow}
        post={post}
        brand={brand}
        shouldReduceMotion={shouldReduceMotion}
      />

      <PhotoCarousel {...photoCarousel} post={post} />

      <EngagementBar
        {...engagement}
        brand={brand}
        post={post}
        shouldReduceMotion={shouldReduceMotion}
      />

      <PostDetails brand={brand} post={post} />

      <PostTags
        brand={brand}
        mainTag={mainTag}
        onTagClick={onTagClick}
        restTags={restTags}
        shouldReduceMotion={shouldReduceMotion}
      />
    </article>
  );
}

type ExpandedPostCardViewProps = SharedPostCardViewProps & {
  onBackClick: () => void;
};

export function ExpandedPostCardView({
  post,
  brand,
  mainTag,
  restTags,
  shouldReduceMotion,
  headerActions,
  photoCarousel,
  engagement,
  follow,
  onBackClick,
  onTagClick,
}: ExpandedPostCardViewProps) {
  return (
    <>
      {/* Затемнение фона — только на ПК (на мобиле пост занимает весь фрейм). */}
      <motion.div
        aria-hidden="true"
        onClick={onBackClick}
        className="fixed inset-0 z-40 hidden bg-[rgba(20,40,28,0.45)] backdrop-blur-[2px] lg:block"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
      <motion.article
        role="dialog"
        aria-modal="true"
        aria-label={post.dish}
        className={cn(
          "fixed inset-0 z-50 flex h-[100dvh] flex-col overflow-hidden",
          "border-0 bg-white/82 text-[#15291C]",
          "shadow-[0_18px_42px_rgba(20,40,28,0.22),inset_0_1px_0_rgba(255,255,255,0.88)]",
          "backdrop-blur-[30px] backdrop-saturate-[190%]",
          // ПК: не во весь экран, а центрированная карточка.
          "lg:m-auto lg:h-[min(86vh,860px)] lg:w-[560px] lg:rounded-[28px] lg:border lg:border-black/5"
        )}
        initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.985 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Всё листается вместе (шапка/лайки/детали — часть поста, не закреплены),
            как в ленте/Instagram. */}
        <div className="hide-scroll min-h-0 flex-1 overflow-y-auto pb-3">
          <PostCardHeader
            {...headerActions}
            {...follow}
            expanded
            brand={brand}
            onBackClick={onBackClick}
            post={post}
            shouldReduceMotion={shouldReduceMotion}
          />

          <PhotoCarousel {...photoCarousel} post={post} />

          <EngagementBar
            {...engagement}
            brand={brand}
            post={post}
            shouldReduceMotion={shouldReduceMotion}
          />

          <PostDetails expanded brand={brand} post={post} />

          <PostTags
            brand={brand}
            mainTag={mainTag}
            onTagClick={onTagClick}
            restTags={restTags}
            shouldReduceMotion={shouldReduceMotion}
          />
        </div>
      </motion.article>
    </>
  );
}
