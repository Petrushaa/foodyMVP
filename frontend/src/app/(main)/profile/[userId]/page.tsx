import { redirect } from "next/navigation";

type UserProfilePageProps = {
  params: Promise<{
    userId: string;
  }>;
};

/**
 * Alias for upstream /profile/[userId] route.
 * Redirects to our canonical /users/[id] page.
 */
export default async function ProfileUserPage({ params }: UserProfilePageProps) {
  const { userId } = await params;
  redirect(`/users/${encodeURIComponent(userId)}`);
}
