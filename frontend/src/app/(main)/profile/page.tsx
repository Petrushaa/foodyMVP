import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ProfileView } from "@/components/profile/profile-view";
import { endpoints } from "@/lib/api/endpoints";
import { fetchMe, tryFetch } from "@/lib/api/server";
import type { Paginated, Post } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Свой профиль. Здесь же видны свои посты на модерации и отклонённые. */
export default async function MyProfilePage() {
  const session = (await auth()) as { user?: { accessToken?: string } } | null;
  if (!session?.user?.accessToken) redirect("/login");

  const profile = await fetchMe().catch(() => null);
  if (!profile) redirect("/login");

  const posts = await tryFetch<Paginated<Post>>(endpoints.posts({ author: profile.id }));

  return (
    <ProfileView
      profile={profile}
      posts={posts?.results ?? []}
      isOwn
      canInteract
    />
  );
}
