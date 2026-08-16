import { MapPin } from "lucide-react";
import Link from "next/link";

import type { Post } from "@/lib/mock-data";
import { RatingStars } from "@/components/feed/rating-stars";

type PostDetailsProps = {
  post: Post;
  brand?: string;
  expanded?: boolean;
};

export function PostDetails({ post, expanded = false }: PostDetailsProps) {
  const placeInner = (
    <>
      <MapPin className="size-[11px] shrink-0" strokeWidth={2.2} />
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
        {post.place}
      </span>
    </>
  );

  return (
    <>
      <div className="px-4 pb-1 max-[390px]:pb-0.5 [@media(max-width:430px)_and_(max-height:860px)]:px-3.5">
        <h3 className="text-[19px] leading-[1.2] font-extrabold tracking-[-0.4px] text-[#15291C] max-[390px]:text-[18px] [@media(max-width:430px)_and_(max-height:860px)]:text-[17px]">
          {post.dish}
        </h3>
      </div>

      {/* Заведение слева + оценка звёздами справа — в одной строке */}
      <div className="flex items-center justify-between gap-2.5 px-4 pt-1 pb-2.5 max-[390px]:pb-2 [@media(max-width:430px)_and_(max-height:860px)]:px-3.5 [@media(max-width:430px)_and_(max-height:860px)]:pb-1.5">
        {post.restaurantId !== undefined ? (
          <Link
            href={`/restaurant/${post.restaurantId}`}
            className="inline-flex min-w-0 items-center gap-1.5 rounded-[9px] bg-[rgba(20,40,28,0.05)] px-2.5 py-[5px] text-[12.5px] font-semibold text-[#13251a]"
          >
            {placeInner}
          </Link>
        ) : (
          <div className="inline-flex min-w-0 items-center gap-1.5 rounded-[9px] bg-[rgba(20,40,28,0.05)] px-2.5 py-[5px] text-[12.5px] font-semibold text-[#13251a]">
            {placeInner}
          </div>
        )}
        <RatingStars rating={post.rating} />
      </div>

      <p
        className="mx-3 mb-3 rounded-[14px] bg-[rgba(20,40,28,0.04)] px-3 py-2.5 font-[family-name:var(--font-roboto)] text-[15px] leading-[1.62] font-medium text-pretty text-[#15291C] max-[390px]:mb-2 max-[390px]:py-2 max-[390px]:text-[14.5px] max-[390px]:leading-[1.5] [@media(max-width:430px)_and_(max-height:860px)]:mx-2.5 [@media(max-width:430px)_and_(max-height:860px)]:mb-2 [@media(max-width:430px)_and_(max-height:860px)]:px-2.5 [@media(max-width:430px)_and_(max-height:860px)]:py-1.5 [@media(max-width:430px)_and_(max-height:860px)]:text-[14px] [@media(max-width:430px)_and_(max-height:860px)]:leading-[1.42]"
      >
        <span
          className={
            expanded
              ? "block whitespace-pre-wrap"
              : "overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]"
          }
        >
          {post.text}
        </span>
      </p>
    </>
  );
}
