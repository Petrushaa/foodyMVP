import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { NewPostForm } from "@/components/review/new-post-form";

export default async function CreatePage() {
  const session = (await auth()) as { user?: { accessToken?: string; city?: string } } | null;
  if (!session?.user?.accessToken) {
    redirect("/login");
  }

  // Город из профиля сужает подсказки заведений и подставляется в форму нового места.
  return <NewPostForm defaultCity={session.user.city ?? ""} />;
}
