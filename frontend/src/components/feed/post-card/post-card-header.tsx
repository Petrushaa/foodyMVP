import {
  ArrowLeft,
  Share2,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";

import {
  FULLSCREEN_SUBSCRIBE_BUTTON,
  SubscribeStyleButton,
} from "@/components/feed/subscribe-style-button";
import { UserAvatar } from "@/components/feed/user-avatar";
import type { Post } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

import {
  ICON_PULSE_ANIMATION,
  ICON_PULSE_TRANSITION,
  canAnimate,
} from "./post-card-shared";

const SUBSCRIBE_STATE_TRANSITION = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1],
} as const;
const FULLSCREEN_COMPACT_AUTHOR_LENGTH = 11;
const FULLSCREEN_SMALL_COMPACT_AUTHOR_LENGTH = 10;

const FULLSCREEN_AUTHOR_TEXT = {
  usernameBase:
    "block max-w-full font-bold tracking-[-0.2px] whitespace-nowrap text-[#15291C]",
  usernameRegular: "text-sm",
  usernameCompact: "text-[13px]",
  usernameSmallCompact: "max-[380px]:text-[11.25px]",
  usernameProCompact:
    "[@media(min-width:381px)_and_(max-width:400px)_and_(max-height:860px)]:text-[11.5px]",
  metaBase:
    "mt-px block max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-medium text-[#5C6B62]",
  metaRegular: "text-[11.5px]",
  metaCompact: "text-[10.75px]",
  metaSmallCompact: "max-[380px]:text-[10px]",
  metaProCompact:
    "[@media(min-width:381px)_and_(max-width:400px)_and_(max-height:860px)]:text-[10.25px]",
} as const;

export type PostCardHeaderProps = {
  post: Post;
  brand?: string;
  currentUser: string | null;
  expanded?: boolean;
  isAuthorFollowed: boolean;
  isFollowPending?: boolean;
  sharePulse: number;
  morePulse: number;
  shouldReduceMotion: boolean | null;
  onFollowToggle: (author: string, nextFollowing: boolean) => Promise<void>;
  onShareClick: () => void;
  onMoreClick: () => void;
  onBackClick?: () => void;
};

function formatFullscreenAuthorMeta(when: string) {
  const normalizedWhen = when.trim();

  if (normalizedWhen.toLowerCase().includes("назад")) {
    return normalizedWhen;
  }

  if (/^\d+\s*(?:с|сек|м|мин|ч|д|дн|нед|мес|г|год)(?:\s|$)/i.test(normalizedWhen)) {
    return `${normalizedWhen} назад`;
  }

  return normalizedWhen;
}

export function PostCardHeader({
  post,
  brand = "#2ECC71",
  currentUser,
  expanded = false,
  isAuthorFollowed,
  isFollowPending = false,
  sharePulse,
  morePulse,
  shouldReduceMotion,
  onFollowToggle,
  onShareClick,
  onMoreClick,
  onBackClick,
}: PostCardHeaderProps) {
  const shouldCompactAuthor =
    expanded && post.user.length >= FULLSCREEN_COMPACT_AUTHOR_LENGTH;
  const shouldCompactAuthorOnSmallScreen =
    expanded && post.user.length >= FULLSCREEN_SMALL_COMPACT_AUTHOR_LENGTH;
  const authorMeta = expanded
    ? `${post.user} · ${formatFullscreenAuthorMeta(post.when)}`
    : `${post.user} · ${post.when}`;
  // R4-B4: показываем «Подписаться/Отписаться» и в свёрнутой карточке.
  // Прячем только для собственных постов. Для анонимов кнопка тоже видна —
  // её onClick на feed-client.tsx редиректит на /login.
  // userId должен быть определён, иначе toggleFollow не знает кому подписываться.
  const canShowSubscribeButton =
    currentUser !== post.user && post.userId !== undefined;

  const headerContent = (
    <>
      {expanded && (
        <motion.button
          type="button"
          aria-label="Назад в ленту"
          title="Назад"
          onClick={onBackClick}
          className={cn(
            // B1 (touch targets): визуально 36×36, hit-area через ::before ≥44×44.
            "relative grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-[#15291C] outline-none",
            "border border-white/65 bg-white/58 shadow-[0_8px_20px_rgba(20,40,28,0.14),inset_1px_1px_0_rgba(255,255,255,0.86),inset_-1px_-1px_0_rgba(255,255,255,0.28)]",
            "backdrop-blur-[18px] backdrop-saturate-[180%] transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[#15291C]/18",
            "before:absolute before:-inset-1 before:content-[''] before:rounded-full"
          )}
          whileTap={canAnimate(shouldReduceMotion) ? { scale: 0.92 } : undefined}
        >
          <ArrowLeft className="size-[18px]" strokeWidth={2.35} />
        </motion.button>
      )}
      <UserAvatar name={post.realName} size={34} src={post.avatarUrl} />
      <div className="flex min-w-0 flex-1 flex-col items-start text-left">
        <div
          className={cn(
            FULLSCREEN_AUTHOR_TEXT.usernameBase,
            shouldCompactAuthor
              ? FULLSCREEN_AUTHOR_TEXT.usernameCompact
              : FULLSCREEN_AUTHOR_TEXT.usernameRegular,
            shouldCompactAuthorOnSmallScreen &&
              FULLSCREEN_AUTHOR_TEXT.usernameSmallCompact,
            shouldCompactAuthor &&
              FULLSCREEN_AUTHOR_TEXT.usernameProCompact
          )}
        >
          {post.userId !== undefined ? (
            <Link href={`/users/${post.userId}`}>{post.realName}</Link>
          ) : (
            <span>{post.realName}</span>
          )}
        </div>
        <div
          className={cn(
            FULLSCREEN_AUTHOR_TEXT.metaBase,
            shouldCompactAuthor
              ? FULLSCREEN_AUTHOR_TEXT.metaCompact
              : FULLSCREEN_AUTHOR_TEXT.metaRegular,
            shouldCompactAuthorOnSmallScreen &&
              FULLSCREEN_AUTHOR_TEXT.metaSmallCompact,
            shouldCompactAuthor &&
              FULLSCREEN_AUTHOR_TEXT.metaProCompact
          )}
        >
          {authorMeta}
        </div>
      </div>
      {canShowSubscribeButton && (
        <SubscribeButton
          author={post.user}
          brand={brand}
          pending={isFollowPending}
          shouldCompactAuthor={shouldCompactAuthor}
          shouldCompactAuthorOnSmallScreen={shouldCompactAuthorOnSmallScreen}
          shouldReduceMotion={shouldReduceMotion}
          subscribed={isAuthorFollowed}
          onToggle={onFollowToggle}
        />
      )}
      <IconPulseButton
        ariaLabel="Поделиться"
        icon={Share2}
        iconClassName="size-[17px]"
        onClick={onShareClick}
        pulse={sharePulse}
        shouldReduceMotion={shouldReduceMotion}
        title="Поделиться"
        wrapperClassName="size-[17px]"
      />
      {/* Three-dots/Ещё DropdownMenu удалено вместе с единственным пунктом
          «Пожаловаться» (бэка для report'ов нет). Шеринг — отдельной кнопкой выше. */}
    </>
  );

  // И в ленте, и в раскрытом посте — одинаковая плоская шапка на фрейме
  // (без отдельной стеклянной «пилюли»). В раскрытом в начале — стрелка назад.
  return (
    <div className="flex items-center gap-2.5 px-3 pt-3 pr-3 pb-2.5 pl-3.5">
      {headerContent}
    </div>
  );
}

type SubscribeButtonProps = {
  author: string;
  brand: string;
  pending: boolean;
  shouldCompactAuthor: boolean;
  shouldCompactAuthorOnSmallScreen: boolean;
  shouldReduceMotion: boolean | null;
  subscribed: boolean;
  onToggle: (author: string, nextFollowing: boolean) => Promise<void>;
};

function SubscribeButton({
  author,
  brand,
  pending,
  shouldCompactAuthor,
  shouldCompactAuthorOnSmallScreen,
  shouldReduceMotion,
  subscribed,
  onToggle,
}: SubscribeButtonProps) {
  const shouldAnimate = canAnimate(shouldReduceMotion);
  const label = subscribed ? "Отписаться" : "Подписаться";

  return (
    <SubscribeStyleButton
      active={subscribed}
      ariaBusy={pending}
      ariaLabel={label}
      ariaPressed={subscribed}
      brand={brand}
      disabled={pending}
      shouldReduceMotion={shouldReduceMotion}
      title={label}
      className={cn(
        shouldCompactAuthor
          ? FULLSCREEN_SUBSCRIBE_BUTTON.compact
          : FULLSCREEN_SUBSCRIBE_BUTTON.regular,
        shouldCompactAuthorOnSmallScreen
          ? FULLSCREEN_SUBSCRIBE_BUTTON.smallCompact
          : FULLSCREEN_SUBSCRIBE_BUTTON.smallRegular,
        shouldCompactAuthor &&
          FULLSCREEN_SUBSCRIBE_BUTTON.proCompact,
        shouldCompactAuthor &&
          FULLSCREEN_SUBSCRIBE_BUTTON.largeCompact
      )}
      onClick={() => onToggle(author, !subscribed)}
    >
      <span
        aria-hidden="true"
        className="grid place-items-center"
      >
        <motion.span
          className="[grid-area:1/1] whitespace-nowrap"
          initial={{
            opacity: subscribed ? 0 : 1,
            y: subscribed ? -2 : 0,
          }}
          animate={{
            opacity: subscribed ? 0 : 1,
            y: shouldAnimate && subscribed ? -2 : 0,
          }}
          transition={shouldAnimate ? SUBSCRIBE_STATE_TRANSITION : { duration: 0 }}
        >
          Подписаться
        </motion.span>
        <motion.span
          className="[grid-area:1/1] whitespace-nowrap"
          initial={{
            opacity: subscribed ? 1 : 0,
            y: subscribed ? 0 : 2,
          }}
          animate={{
            opacity: subscribed ? 1 : 0,
            y: shouldAnimate && subscribed ? 0 : 2,
          }}
          transition={shouldAnimate ? SUBSCRIBE_STATE_TRANSITION : { duration: 0 }}
        >
          Отписаться
        </motion.span>
      </span>
    </SubscribeStyleButton>
  );
}

type IconPulseButtonProps = {
  ariaLabel: string;
  icon: LucideIcon;
  iconClassName: string;
  pulse: number;
  shouldReduceMotion: boolean | null;
  title: string;
  wrapperClassName: string;
  onClick: () => void;
};

function IconPulseButton({
  ariaLabel,
  icon: Icon,
  iconClassName,
  pulse,
  shouldReduceMotion,
  title,
  wrapperClassName,
  onClick,
}: IconPulseButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
      // B1 (touch targets): визуально кнопка остаётся 32×32, но hit-area
      // расширен невидимым ::before до ≥44×44 (Apple HIG).
      className="relative grid size-8 shrink-0 cursor-pointer place-items-center rounded-[9px] bg-[rgba(20,40,28,0.06)] text-[#15291C] before:absolute before:-inset-1.5 before:content-[''] before:rounded-[12px]"
    >
      <motion.span
        key={`${ariaLabel}-${pulse}`}
        className={cn("grid place-items-center", wrapperClassName)}
        animate={
          pulse > 0 && canAnimate(shouldReduceMotion)
            ? ICON_PULSE_ANIMATION
            : { scale: 1 }
        }
        transition={ICON_PULSE_TRANSITION}
      >
        <Icon className={iconClassName} strokeWidth={2} />
      </motion.span>
    </button>
  );
}
