import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ModerationQueue } from "@/components/moderation/moderation-queue";
import { fetchModerationQueue, fetchModerationStats } from "@/lib/api/server";

export const dynamic = "force-dynamic";

/** Очередь модерации. Через неё проходит каждый пост — авто-одобрения нет. */
export default async function StaffPage(props: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const [{ kind }, session] = await Promise.all([
    props.searchParams,
    auth() as Promise<{ user?: { accessToken?: string; isStaff?: boolean } } | null>,
  ]);

  if (!session?.user?.accessToken) redirect("/login");

  // Права проверяет бэкенд (ручки только для сотрудников): если не хватит,
  // запрос упадёт и мы покажем пустую очередь, а не сломанную страницу.
  const [queue, stats] = await Promise.all([
    fetchModerationQueue(kind).catch(() => null),
    fetchModerationStats().catch(() => null),
  ]);

  return <ModerationQueue initialPosts={queue?.results ?? []} stats={stats} />;
}
