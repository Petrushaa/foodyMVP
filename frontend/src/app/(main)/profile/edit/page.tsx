import { redirect } from "next/navigation";

import EditProfileForm from "@/app/(main)/profile/edit/EditProfileForm";
import { auth } from "@/auth";
import { fixAvatarUrl } from "@/lib/api";
import { fetchMe } from "@/lib/api/server";

export const dynamic = "force-dynamic";

/** Редактирование своего профиля. Раньше жило по /me/edit — маршруты сведены к /profile. */
export default async function EditProfilePage() {
  const session = (await auth()) as { user?: { accessToken?: string; name?: string; image?: string } } | null;
  if (!session?.user?.accessToken) redirect("/login");

  const profile = await fetchMe().catch(() => null);
  if (!profile) redirect("/login");

  return (
    <EditProfileForm
      initialData={{
        name: profile.full_name || profile.username,
        username: profile.username,
        avatar: fixAvatarUrl(profile.avatar) || session.user.image || "",
        bio: profile.bio_text,
        city: profile.city,
      }}
      accessToken="authed"
    />
  );
}
