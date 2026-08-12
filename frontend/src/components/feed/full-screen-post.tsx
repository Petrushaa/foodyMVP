"use client";

import {
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
} from "react";
import { flushSync } from "react-dom";

import {
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
import { useSearchSubmit } from "@/components/search/use-search-submit";
import type {
  Density,
  Post,
  PostComment,
} from "@/lib/mock-data";

// upstream: imported COMMENTS_BY_POST_ID from @/lib/mock-data and indexed by post.id.
// We pass comments as a prop to decouple from mock data — callers supply real API data.

type FullScreenPostProps = {
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
  /** Real comments for this post, loaded by the caller from Django API. */
  comments?: PostComment[];
  onClose: () => void;
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

function usePulse() {
  const [pulse, setPulse] = useState(0);

  function triggerPulse() {
    setPulse((currentPulse) => currentPulse + 1);
  }

  return [pulse, triggerPulse] as const;
}

export function FullScreenPost({
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
  comments = [],
  onClose,
  onFollowToggle,
  onLikeToggle,
  onSaveToggle,
}: FullScreenPostProps) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const [photoIndicatorIdx, setPhotoIndicatorIdx] = useState(0);
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
  const [viewerPhotoIdx, setViewerPhotoIdx] = useState(0);
  const [viewerPhotoDirection, setViewerPhotoDirection] =
    useState<PhotoDirection>(1);
  const [viewerOpenKey, setViewerOpenKey] = useState(0);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [photoWidth, setPhotoWidth] = useState(0);
  const [sharePulse, triggerSharePulse] = usePulse();
  const [morePulse, triggerMorePulse] = usePulse();
  const [commentPulse, triggerCommentPulse] = usePulse();
  const [copyLinkAlertKey, setCopyLinkAlertKey] = useState(0);
  const shouldReduceMotion = useReducedMotion();
  const submitSearchQuery = useSearchSubmit();
  const viewportSize = useViewportSize();
  const photoRatio = getPhotoRatio(density, viewportSize);
  const [mainTag, ...restTags] = post.tags;
  // Подсчёт лайков через дельту — см. post-card.tsx для подробного описания.
  // Кратко: post.likes — серверная истина на момент монтирования; раньше было
  // `+ (isLiked ? 1 : 0)` и после reload счётчик показывал +2.
  const initialLikedRef = useRef<boolean>(isLiked);
  const postIdForEffect = post.id;
  useEffect(() => {
    initialLikedRef.current = isLiked;
  }, [postIdForEffect]); // eslint-disable-line
  const likeDelta = (isLiked ? 1 : 0) - (initialLikedRef.current ? 1 : 0);
  const likeCount = post.likes + likeDelta;
  const hasPhotoSlider = post.photos > 1;
  const lastPhotoIdx = Math.max(post.photos - 1, 0);
  const canDragToPreviousPhoto = photoIdx > 0;
  const canDragToNextPhoto = photoIdx < lastPhotoIdx;
  const expandedPhotoViewportRef = useRef<HTMLDivElement>(null);
  const photoTrackX = useMotionValue(0);
  const photoAnimationRef = useRef<ReturnType<typeof animate> | null>(null);
  const photoDragBaseXRef = useRef(0);
  const trackPhotoIndexes = getPhotoTrackIndexes(photoIdx, lastPhotoIdx);

  useLayoutEffect(() => {
    const viewport = expandedPhotoViewportRef.current;

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
  }, [photoTrackX]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(POST_CARD_EXPANDED_EVENT, {
        detail: { expanded: true },
      })
    );

    return () => {
      photoAnimationRef.current?.stop();
      window.dispatchEvent(
        new CustomEvent(POST_CARD_EXPANDED_EVENT, {
          detail: { expanded: false },
        })
      );
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isPhotoViewerOpen || isCommentsOpen) {
        return;
      }

      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCommentsOpen, isPhotoViewerOpen, onClose]);

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

  function handlePhotoOpen() {
    if (post.photos === 0 || !post.photoUrls?.length) return;
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

  function handlePhotoDragStart() {
    photoAnimationRef.current?.stop();
    photoDragBaseXRef.current = photoTrackX.get();
    photoTrackX.stop();
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

  return (
    <>
      <ExpandedPostCardView
        brand={brand}
        engagement={{
          commentPulse,
          likeCount,
          liked: isLiked,
          likePending: isLikePending,
          onCommentClick: () => {
            triggerCommentPulse();
            setIsCommentsOpen(true);
          },
          onLikeClick: () => void onLikeToggle(post.id, !isLiked),
          onSaveClick: () => void onSaveToggle(post.id, !isSaved),
          savePending: isSavePending,
          saved: isSaved,
        }}
        follow={{
          currentUser,
          isAuthorFollowed,
          isFollowPending,
          onFollowToggle,
        }}
        headerActions={{
          morePulse,
          onMoreClick: triggerMorePulse,
          onShareClick: handleShareClick,
          sharePulse,
        }}
        mainTag={mainTag}
        onBackClick={onClose}
        onTagClick={submitSearchQuery}
        photoCarousel={{
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
          photoViewportRef: expandedPhotoViewportRef,
          photoWidth,
          trackPhotoIndexes,
        }}
        post={post}
        restTags={restTags}
        shouldReduceMotion={shouldReduceMotion}
      />
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
        comments={comments}
        commentsCount={post.comments}
        onClose={() => setIsCommentsOpen(false)}
        shouldReduceMotion={shouldReduceMotion}
        currentUsername={currentUser?.replace(/^@/, "") ?? null}
        postId={post.id}
      />
      <CopyLinkAlert showKey={copyLinkAlertKey} />
    </>
  );
}
