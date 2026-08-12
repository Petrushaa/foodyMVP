import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { apiRequest, fixMediaUrl } from "@/lib/api";
import { GlassSurface } from "@/components/feed/glass-surface";
import StaffPanel, { type PendingPost } from "./StaffPanel";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
    const session = (await auth()) as any;

    if (!session?.user?.accessToken) {
        redirect("/login");
    }

    const token: string = session.user.accessToken;

    let userProfile: any = null;
    try {
        userProfile = await apiRequest("/users/me/", {
            headers: { Authorization: `Bearer ${token}` },
        });
    } catch (e: any) {
        if (e?.message === "UNAUTHORIZED") redirect("/login");
    }

    if (!userProfile?.is_staff) {
        redirect("/");
    }

    let pendingRaw: any[] = [];
    let totalCount = 0;
    try {
        // R10-BUG-14: дефолт sort id ASC ставил старые посты первыми; новые
        // pending уходили в конец, модератор их не видел. Явно сортируем по
        // -created_at чтобы свежие были сверху.
        const data = await apiRequest("/moderation/?ordering=-created_at", {
            headers: { Authorization: `Bearer ${token}` },
        });
        pendingRaw = data?.results ?? data ?? [];
        // R10-BUG-1: счётчик в шапке показывал page_size (длину массива),
        // а не реальное количество pending постов в очереди. Берём count из
        // paginated ответа (если массив без пагинации — fallback на длину).
        totalCount = typeof data?.count === 'number' ? data.count : pendingRaw.length;
    } catch (e) {
        console.error("Failed to load moderation queue", e);
    }

    const pending: PendingPost[] = pendingRaw.map((p: any) => ({
        id: p.id,
        title: p.dish_name || "Без названия",
        author: p.user?.username || "—",
        authorFullName: p.user?.full_name || null,
        authorId: p.user?.id ?? null,
        authorAvatar: fixMediaUrl(p.user?.avatar) || null,
        image: fixMediaUrl(p.images?.[0]?.image) || null,
        allImages: (p.images || [])
            .map((img: any) => fixMediaUrl(img.image))
            .filter(Boolean),
        createdAt: p.created_at,
        description: p.description || "",
        price: p.price ? `${parseFloat(p.price).toFixed(0)} ₽` : null,
        restaurant: p.restaurant_name || "",
        tags: (p.tags || []).map((t: any) => t.name),
        // Бэкенд хранит 0–10 (звёзды ×2) — делим на 2 для показа в 0–5.
        rating: (p.statistics?.rating || 0) / 2,
    }));

    return (
        <main className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-32 pt-6">
            <GlassSurface className="rounded-[26px]">
                <div className="flex items-center gap-3 px-4 py-3">
                    <Link
                        href="/me"
                        aria-label="Назад"
                        className="grid size-9 place-items-center rounded-full bg-white/60 ring-1 ring-foreground/10 transition hover:bg-white/80"
                    >
                        <ArrowLeft className="size-4 text-[#15291C]" />
                    </Link>
                    <div className="flex flex-1 items-center gap-2">
                        <ShieldCheck className="size-5 text-[#1FA85C]" />
                        <h1 className="text-base font-semibold text-[#15291C]">
                            Панель модератора
                        </h1>
                    </div>
                    <span className="rounded-full bg-[#1FA85C]/15 px-2.5 py-1 text-[11px] font-semibold text-[#1FA85C]">
                        {totalCount}
                    </span>
                </div>
            </GlassSurface>

            {/* R10-BUG-2: пробрасываем токен в client-компонент чтобы он мог
                звать Django API напрямую (минуя server actions, которые
                ломались с 503 после rebuild). */}
            <StaffPanel pendingPosts={pending} accessToken="authed" />
        </main>
    );
}
