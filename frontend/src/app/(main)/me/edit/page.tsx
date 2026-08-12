import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { apiRequest, fixAvatarUrl } from "@/lib/api";
import EditProfileForm from "@/app/(main)/profile/edit/EditProfileForm";

export default async function MeEditPage() {
  const session = (await auth()) as any;

  if (!session?.user?.accessToken) {
    redirect("/login");
  }

  let userProfile = null;
  try {
    userProfile = await apiRequest("/users/me/", {
      headers: { Authorization: `Bearer ${session.user.accessToken}` },
    });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") {
      redirect("/login");
    }
    console.error("Failed to load user profile for /me/edit", e);
  }

  const initialData = {
    name: userProfile?.full_name || userProfile?.username || session.user.name || "",
    username: userProfile?.username || "",
    avatar: fixAvatarUrl(userProfile?.avatar) || session.user.image || "",
    bio: userProfile?.bio_text || "",
    city: userProfile?.city || "",
  };

  return <EditProfileForm initialData={initialData} accessToken="authed" />;
}
