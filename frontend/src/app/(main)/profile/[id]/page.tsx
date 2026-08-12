import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { ProfileView } from "@/components/profile/profile-view";
import { endpoints } from "@/lib/api/endpoints";
import { tryFetch } from "@/lib/api/server";
import type { Paginated, Post, UserProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Чужой профиль. Открыт гостям — по такой ссылке и делятся. */
export default async function UserProfilePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const userId = Number(id);

  const [session, profile, posts] = await Promise.all([
    auth() as Promise<{ user?: { accessToken?: string; id?: number } } | null>,
    tryFetch<UserProfile>(endpoints.user(userId)),
    tryFetch<Paginated<Post>>(endpoints.posts({ author: userId })),
  ]);

  if (!profile) notFound();

  return (
    <ProfileView
      profile={profile}
      posts={posts?.results ?? []}
      isOwn={Number(session?.user?.id) === userId}
      canInteract={Boolean(session?.user?.accessToken)}
    />
  );
}
