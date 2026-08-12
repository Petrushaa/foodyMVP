"use client";

import {
  AnimatePresence,
  animate,
  type PanInfo,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { flushSync } from "react-dom";

import {
  CollapsedPostCardView,
  ExpandedPostCardView,
} from "@/components/feed/post-card-sections";
import { CommentsSheet } from "@/components/feed/comments-sheet";
import {
  getPhotoDragEndDecision,
  getPhotoDragTrackX,
  getPhotoSwitchCenterX,
  getPhotoTrackIndexes,
  PHOTO_SWITCH_DURATION,
  PHOTO_SWITCH_EASE,
  type PhotoDirection,
} from "@/components/feed/post-card/photo-carousel";
import { PhotoViewerModal } from "@/components/feed/post-card/photo-viewer-modal";
import { CopyLinkAlert } from "@/components/shared/copy-link-alert";
import { sharePost } from "@/lib/share";
import { useRouter } from "next/navigation";

import { getTagSearchHref } from "@/lib/search";
import { type Density, type Post, type PostComment } from "@/lib/mock-data";

// CSR fetch — относительный путь, браузер подставит origin (foody.press или localhost)
async function fetchPostComments(postId: number): Promise<PostComment[]> {
  try {
    const res = await fetch(`/api/v1/posts/${postId}/comments/`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    const rawComments: any[] = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
    return rawComments.map((c: any) => ({
      id: c.id,
      user: c.user_detail?.username ? `@${c.user_detail.username}` : "@unknown",
      realName: c.user_detail?.full_name || c.user_detail?.username || "Аноним",
      avatarUrl: c.user_detail?.avatar || undefined,
      when: c.created_at ? new Date(c.created_at).toLocaleDateString("ru-RU") : "",
      text: c.text || "",
      likes: 0,
    }));
  } catch {
    return [];
  }
}

type PostCardProps = {
  post: Post;
  brand: string;
  currentUser: string | null;
  density: Density;
  isAuthorFollowed: boolean;
  isFollowPending?: boolean;
  isLiked: boolean;
  isLikePending?: boolean;
  isSaved: boolean;
  isSavePending?: boolean;
  onFollowToggle: (author: string, nextFollowing: boolean) => Promise<void>;
  onLikeToggle: (postId: number, nextLiked: boolean) => Promise<void>;
  onSaveToggle: (postId: number, nextSaved: boolean) => Promise<void>;
};

const POST_CARD_EXPANDED_EVENT = "foody:post-card-expanded";

type ViewportSize = {
  height: number;
  width: number;
};

function getViewportSize(): ViewportSize {
  if (typeof window === "undefined") {
    return { height: 0, width: 0 };
  }

  return {
    height: window.visualViewport?.height ?? window.innerHeight,
    width: window.visualViewport?.width ?? window.innerWidth,
  };
}

function usePulse() {
  const [pulse, setPulse] = useState(0);

  function triggerPulse() {
    setPulse((currentPulse) => currentPulse + 1);
  }

  return [pulse, triggerPulse] as const;
}

function useViewportSize() {
  const [viewportSize, setViewportSize] = useState<ViewportSize>({
    height: 0,
    width: 0,
  });

  useEffect(() => {
    const viewport = window.visualViewport;

    function syncViewportSize() {
      setViewportSize(getViewportSize());
    }

    syncViewportSize();
    window.addEventListener("resize", syncViewportSize);
    viewport?.addEventListener("resize", syncViewportSize);

    return () => {
      window.removeEventListener("resize", syncViewportSize);
      viewport?.removeEventListener("resize", syncViewportSize);
    };
  }, []);

  return viewportSize;
}

function getPhotoRatio(density: Density, viewportSize: ViewportSize) {
  const regularRatio = density === "cozy" ? 0.98 : 1.12;

  if (viewportSize.width === 0 || viewportSize.width > 430) {
    return regularRatio;
  }

  if (viewportSize.height <= 860) {
    return density === "cozy" ? 1.28 : 1.22;
  }

  if (viewportSize.height <= 900) {
    return density === "cozy" ? 1.3 : 1.3;
  }

  if (viewportSize.height <= 940) {
    return density === "cozy" ? 1.16 : 1.2;
  }

  return density === "cozy" ? 1.12 : 1.26;
}

export function PostCard({
  post,
  brand,
  currentUser,
  density,
  isAuthorFollowed,
  isFollowPending = false,
  isLiked,
  isLikePending = false,
  isSaved,
  isSavePending = false,
  onFollowToggle,
  onLikeToggle,
  onSaveToggle,
}: PostCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [photoIndicatorIdx, setPhotoIndicatorIdx] = useState(0);
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
  const [viewerPhotoIdx, setViewerPhotoIdx] = useState(0);
  const [viewerPhotoDirection, setViewerPhotoDirection] =
    useState<PhotoDirection>(1);
  const [viewerOpenKey, setViewerOpenKey] = useState(0);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [loadedComments, setLoadedComments] = useState<PostComment[]>([]);
  const [photoWidth, setPhotoWidth] = useState(0);
  const [sharePulse, triggerSharePulse] = usePulse();
  const [morePulse, triggerMorePulse] = usePulse();
  const [commentPulse, triggerCommentPulse] = usePulse();
  const [copyLinkAlertKey, setCopyLinkAlertKey] = useState(0);
  const shouldReduceMotion = useReducedMotion();
  const router = useRouter();

  const viewportSize = useViewportSize();
  const photoRatio = getPhotoRatio(density, viewportSize);
  const [mainTag, ...restTags] = post.tags;
  // Подсчёт лайков через дельту: post.likes — серверная истина на момент
  // монтирования этой карточки (уже включает лайк юзера если он лайкнул).
  // Раньше было `post.likes + (isLiked ? 1 : 0)` — после reload счётчик
  // показывал +2 (post.likes уже +1 от свежего SSR, и isLiked=true ещё +1).
  // Сейчас считаем разницу между текущим isLiked и состоянием на mount.
  const initialLikedRef = useRef<boolean>(isLiked);
  // Сброс «исходного» значения когда карточка переиспользуется для другого поста.
  // useEffect намеренно зависит только от post.id — нам нужно снимок isLiked
  // в момент первого рендера для этого поста, а не каждое его изменение.
  const postIdForEffect = post.id;
  useEffect(() => {
    initialLikedRef.current = isLiked;
  }, [postIdForEffect]); // eslint-disable-line
  const likeDelta = (isLiked ? 1 : 0) - (initialLikedRef.current ? 1 : 0);
  const likeCount = post.likes + likeDelta;
  const hasPhotoSlider = post.photos > 1;
  const lastPhotoIdx = post.photos - 1;
  const canDragToPreviousPhoto = photoIdx > 0;
  const canDragToNextPhoto = photoIdx < lastPhotoIdx;
  const feedPhotoViewportRef = useRef<HTMLDivElement>(null);
  const expandedPhotoViewportRef = useRef<HTMLDivElement>(null);
  const photoTrackX = useMotionValue(0);
  const photoAnimationRef = useRef<ReturnType<typeof animate> | null>(null);
  const photoDragBaseXRef = useRef(0);
  const suppressOpenAfterPhotoDragRef = useRef(false);
  const trackPhotoIndexes = getPhotoTrackIndexes(photoIdx, lastPhotoIdx);

  useLayoutEffect(() => {
    const viewport = isExpanded
      ? expandedPhotoViewportRef.current
      : feedPhotoViewportRef.current;

    if (!viewport) {
      return;
    }

    const viewportElement = viewport;

    function syncPhotoWidth() {
      const nextWidth = viewportElement.getBoundingClientRect().width;
      photoAnimationRef.current?.stop();
      photoAnimationRef.current = null;
      setPhotoWidth(nextWidth);
      photoTrackX.jump(getPhotoSwitchCenterX(nextWidth));
    }

    syncPhotoWidth();

    const resizeObserver = new ResizeObserver(syncPhotoWidth);
    resizeObserver.observe(viewportElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isExpanded, photoTrackX]);

  useEffect(() => {
    return () => {
      photoAnimationRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (isPhotoViewerOpen || isCommentsOpen) {
        return;
      }

      if (event.key === "Escape") {
        setIsExpanded(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCommentsOpen, isExpanded, isPhotoViewerOpen]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(POST_CARD_EXPANDED_EVENT, {
        detail: { expanded: isExpanded },
      })
    );

    return () => {
      if (isExpanded) {
        window.dispatchEvent(
          new CustomEvent(POST_CARD_EXPANDED_EVENT, {
            detail: { expanded: false },
          })
        );
      }
    };
  }, [isExpanded]);

  function handleCardClick(event: ReactMouseEvent<HTMLElement>) {
    if (isExpanded || isPhotoViewerOpen || suppressOpenAfterPhotoDragRef.current) {
      return;
    }

    const target = event.target;

    if (
      target instanceof Element &&
      target.closest("a,button,input,textarea,select,[data-card-interactive]")
    ) {
      return;
    }

    resetPhotoTrackToCenter();
    setIsExpanded(true);
  }

  function handleLikeClick() {
    void onLikeToggle(post.id, !isLiked);
  }

  function handleSaveClick() {
    void onSaveToggle(post.id, !isSaved);
  }

  function handleCommentClick() {
    triggerCommentPulse();
    setIsCommentsOpen(true);
  }

  function handleShareClick() {
    triggerSharePulse();
    // Нативное меню «Поделиться» (телефон), иначе — копирование ссылки.
    void sharePost(post.id, {
      title: post.dish,
      text: post.place ? `${post.dish} — ${post.place}` : post.dish,
    }).then((result) => {
      if (result === "copied") {
        setCopyLinkAlertKey((currentKey) => currentKey + 1);
      }
    });
  }

  function handleMoreClick() {
    triggerMorePulse();
  }

  function handleTagClick(tag: string) {
    const cleanTag = tag.replace(/^#/, '');
    router.push(getTagSearchHref(cleanTag));
  }

  function handlePhotoDragStart() {
    suppressOpenAfterPhotoDragRef.current = true;
    photoAnimationRef.current?.stop();
    photoDragBaseXRef.current = photoTrackX.get();
    photoTrackX.stop();
    setPhotoIndicatorIdx(photoIdx);
  }

  function releasePhotoDragSuppression() {
    window.setTimeout(() => {
      suppressOpenAfterPhotoDragRef.current = false;
    }, 80);
  }

  function handlePhotoOpen() {
    if (suppressOpenAfterPhotoDragRef.current) {
      return;
    }

    if (post.photos === 0 || !post.photoUrls?.length) return;

    resetPhotoTrackToCenter();
    setViewerPhotoDirection(1);
    setViewerPhotoIdx(photoIdx);
    setViewerOpenKey((currentKey) => currentKey + 1);
    setIsPhotoViewerOpen(true);
  }

  function handleViewerPhotoChange(nextPhotoIdx: number) {
    const clampedPhotoIdx = Math.min(Math.max(nextPhotoIdx, 0), lastPhotoIdx);

    if (clampedPhotoIdx === viewerPhotoIdx) {
      return;
    }

    setViewerPhotoDirection(clampedPhotoIdx > viewerPhotoIdx ? 1 : -1);
    setViewerPhotoIdx(clampedPhotoIdx);
  }

  function animatePhotoTrackToCenter() {
    photoAnimationRef.current = animate(
      photoTrackX,
      getPhotoSwitchCenterX(photoWidth),
      {
        duration: shouldReduceMotion ? 0.01 : PHOTO_SWITCH_DURATION,
        ease: PHOTO_SWITCH_EASE,
        onComplete: () => {
          photoTrackX.jump(getPhotoSwitchCenterX(photoWidth));
        },
      }
    );
  }

  function resetPhotoTrackToCenter() {
    const centerX = getPhotoSwitchCenterX(photoWidth);

    photoAnimationRef.current?.stop();
    photoAnimationRef.current = null;
    photoTrackX.stop();
    photoTrackX.jump(centerX);
    photoDragBaseXRef.current = centerX;
    setPhotoIndicatorIdx(photoIdx);
  }

  function handlePhotoDrag(
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) {
    if (!hasPhotoSlider || photoWidth <= 0) {
      return;
    }

    photoTrackX.set(
      getPhotoDragTrackX({
        canDragToNextPhoto,
        canDragToPreviousPhoto,
        dragBaseX: photoDragBaseXRef.current,
        dragOffsetX: info.offset.x,
        photoWidth,
      })
    );
  }

  function handlePhotoDragEnd(
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) {
    releasePhotoDragSuppression();

    if (!hasPhotoSlider || photoWidth <= 0) {
      return;
    }

    const { nextTrackX, targetPhotoIdx } = getPhotoDragEndDecision({
      canDragToNextPhoto,
      canDragToPreviousPhoto,
      photoIdx,
      photoTrackX: photoTrackX.get(),
      photoWidth,
      swipeVelocityX: info.velocity.x,
    });

    photoAnimationRef.current?.stop();
    setPhotoIndicatorIdx(targetPhotoIdx);

    if (targetPhotoIdx !== photoIdx) {
      flushSync(() => {
        setPhotoIdx(targetPhotoIdx);
      });
      photoTrackX.jump(nextTrackX);
    }

    animatePhotoTrackToCenter();
  }

  const headerActions = {
    morePulse,
    onMoreClick: handleMoreClick,
    onShareClick: handleShareClick,
    sharePulse,
  };
  const follow = {
    currentUser,
    isAuthorFollowed,
    isFollowPending,
    onFollowToggle,
  };
  const photoCarousel = {
    canDragToNextPhoto,
    canDragToPreviousPhoto,
    hasPhotoSlider,
    onPhotoDrag: handlePhotoDrag,
    onPhotoDragEnd: handlePhotoDragEnd,
    onPhotoDragStart: handlePhotoDragStart,
    onPhotoOpen: handlePhotoOpen,
    photoIndicatorIdx,
    photoRatio,
    photoTrackX,
    photoWidth,
    trackPhotoIndexes,
  };
  const engagement = {
    commentPulse,
    likePending: isLikePending,
    likeCount,
    liked: isLiked,
    savePending: isSavePending,
    onCommentClick: handleCommentClick,
    onLikeClick: handleLikeClick,
    onSaveClick: handleSaveClick,
    saved: isSaved,
  };

  return (
    <div className="flex h-full min-h-0 snap-start snap-always flex-col px-3.5 pt-2 pb-[0.625rem] [scroll-snap-stop:always] [@media(max-width:430px)_and_(max-height:860px)]:px-3 [@media(max-width:430px)_and_(max-height:860px)]:pb-[0.75rem]">
      <CollapsedPostCardView
        brand={brand}
        engagement={engagement}
        follow={follow}
        headerActions={headerActions}
        mainTag={mainTag}
        onCardClick={handleCardClick}
        onTagClick={handleTagClick}
        photoCarousel={{
          ...photoCarousel,
          photoViewportRef: feedPhotoViewportRef,
        }}
        post={post}
        restTags={restTags}
        shouldReduceMotion={shouldReduceMotion}
      />
      <AnimatePresence>
        {isExpanded && (
          <ExpandedPostCardView
            brand={brand}
            engagement={engagement}
            follow={follow}
            headerActions={headerActions}
            mainTag={mainTag}
            onBackClick={() => setIsExpanded(false)}
            onTagClick={handleTagClick}
            photoCarousel={{
              ...photoCarousel,
              photoViewportRef: expandedPhotoViewportRef,
            }}
            post={post}
            restTags={restTags}
            shouldReduceMotion={shouldReduceMotion}
          />
        )}
      </AnimatePresence>
      <PhotoViewerModal
        activeIndex={viewerPhotoIdx}
        direction={viewerPhotoDirection}
        onChangeIndex={handleViewerPhotoChange}
        onClose={() => setIsPhotoViewerOpen(false)}
        open={isPhotoViewerOpen}
        openKey={viewerOpenKey}
        photoRatio={photoRatio}
        post={post}
        shouldReduceMotion={shouldReduceMotion}
      />
      <CommentsSheet
        open={isCommentsOpen}
        brand={brand}
        comments={loadedComments}
        commentsCount={post.comments}
        currentUsername={currentUser?.replace(/^@/, "") ?? null}
        postId={post.id}
        onClose={() => setIsCommentsOpen(false)}
        onOpen={() => {
          fetchPostComments(post.id).then(setLoadedComments);
        }}
        shouldReduceMotion={shouldReduceMotion}
      />
      <CopyLinkAlert showKey={copyLinkAlertKey} />
    </div>
  );
}
