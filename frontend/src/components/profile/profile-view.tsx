"use client";

/**
 * Профиль: шапка с подпиской и посты автора.
 *
 * Свой профиль отличается от чужого двумя вещами: вместо кнопки подписки —
 * ссылка на редактирование, и видны собственные посты на модерации и отклонённые.
 * Второе делает бэкенд сам, здесь ничего фильтровать не нужно.
 */

import Link from "next/link";
import { useState } from "react";

import { PostItem } from "@/components/feed/post-item";
import { toggleSubscription } from "@/lib/api/client";
import type { Post, UserProfile } from "@/lib/types";

interface Props {
    profile: UserProfile;
    posts: Post[];
    isOwn: boolean;
    canInteract: boolean;
}

export function ProfileView({ profile, posts, isOwn, canInteract }: Props) {
    const [isFollowing, setIsFollowing] = useState(profile.is_following);
    const [followers, setFollowers] = useState(profile.followers_count);
    const [isBusy, setIsBusy] = useState(false);

    async function onToggleFollow() {
        if (isBusy) return;
        const next = !isFollowing;
        setIsFollowing(next);
        setFollowers((count) => count + (next ? 1 : -1));
        setIsBusy(true);
        try {
            await toggleSubscription(profile.id, next);
        } catch {
            setIsFollowing(!next);
            setFollowers((count) => count + (next ? -1 : 1));
        } finally {
            setIsBusy(false);
        }
    }

    return (
        <div className="pb-10">
            <header className="border-b border-neutral-100 px-4 py-5">
                <div className="flex items-center gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={profile.avatar ?? "/default-avatar.svg"}
                        alt=""
                        className="h-16 w-16 rounded-full object-cover"
                    />
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate text-lg font-semibold">
                            {profile.full_name || profile.username}
                        </h1>
                        <p className="truncate text-sm text-neutral-500">@{profile.username}</p>
                        {profile.city && <p className="text-sm text-neutral-400">{profile.city}</p>}
                    </div>
                </div>

                {profile.bio_text && <p className="mt-3 text-sm">{profile.bio_text}</p>}

                <div className="mt-4 flex gap-6 text-sm">
                    <span>
                        <span className="font-semibold">{profile.posts_count}</span>{" "}
                        <span className="text-neutral-500">постов</span>
                    </span>
                    <span>
                        <span className="font-semibold">{followers}</span>{" "}
                        <span className="text-neutral-500">подписчиков</span>
                    </span>
                    <span>
                        <span className="font-semibold">{profile.following_count}</span>{" "}
                        <span className="text-neutral-500">подписок</span>
                    </span>
                </div>

                <div className="mt-4">
                    {isOwn ? (
                        <Link
                            href="/profile/edit"
                            className="inline-block rounded-xl border border-neutral-300 px-4 py-2 text-sm"
                        >
                            Редактировать профиль
                        </Link>
                    ) : (
                        canInteract && (
                            <button
                                type="button"
                                onClick={onToggleFollow}
                                disabled={isBusy}
                                className={`rounded-xl px-5 py-2 text-sm ${
                                    isFollowing
                                        ? "border border-neutral-300"
                                        : "bg-neutral-900 text-white"
                                }`}
                            >
                                {isFollowing ? "Вы подписаны" : "Подписаться"}
                            </button>
                        )
                    )}
                </div>
            </header>

            {posts.length === 0 && (
                <p className="px-4 py-16 text-center text-sm text-neutral-400">
                    {isOwn ? "Вы ещё ничего не публиковали" : "Постов пока нет"}
                </p>
            )}

            {posts.map((post) => (
                <PostItem key={post.id} post={post} canInteract={canInteract} />
            ))}
        </div>
    );
}
