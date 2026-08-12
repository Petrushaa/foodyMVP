import { NewReviewForm } from "@/components/review/new-review-form";
import { DEFAULT_TWEAKS } from "@/lib/tweaks";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function CreatePage() {
  const session = (await auth()) as any;
  if (!session?.user?.accessToken) {
    redirect("/login");
  }

  return (
    <NewReviewForm brand={DEFAULT_TWEAKS.brand} palette={DEFAULT_TWEAKS.palette} />
  );
}
