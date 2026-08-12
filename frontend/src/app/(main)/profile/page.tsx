/**
 * /profile → /me redirect (backward-compat alias).
 * All profile logic lives in (main)/me/page.tsx.
 */
import { redirect } from "next/navigation";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  if (tab) {
    redirect(`/me?tab=${encodeURIComponent(tab)}`);
  }
  redirect("/me");
}
